import imaplib
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.account import Account
from app.models.email import Email
from app.routes import accounts as account_routes
from app.routes import emails as email_routes
from app.schemas.account import AccountImportTestRequest
from app.services import mail_service
from app.services.mail_service import AccountAuthError, get_access_token


class _TokenResponse:
    """Stands in for a requests.Response from the OAuth token endpoint."""

    def __init__(self, status_code, payload, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or str(payload)

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


def _invalid_grant(description):
    return _TokenResponse(400, {"error": "invalid_grant", "error_description": description})


class TokenErrorClassificationTests(unittest.TestCase):
    """A dead credential must be distinguishable from upstream having a bad day."""

    def _refresh(self, response):
        with patch("app.services.mail_service.requests.post", lambda *a, **k: response):
            return get_access_token("client", "refresh", "imap")

    def test_abuse_ban_is_an_auth_error_with_an_actionable_reason(self):
        # This is the exact shape seen in production on the accounts that 502'd.
        response = _invalid_grant(
            "AADSTS70000: User account is found to be in service abuse mode. "
            "Trace ID: cfc41333-d8f7-4efa-90a0-ad74d26a1800"
        )
        with self.assertRaises(AccountAuthError) as ctx:
            self._refresh(response)
        self.assertIn("风控", str(ctx.exception))
        self.assertIn("重新授权", str(ctx.exception))

    def test_expired_refresh_token_is_an_auth_error(self):
        with self.assertRaises(AccountAuthError) as ctx:
            self._refresh(_invalid_grant("AADSTS700082: The refresh token has expired"))
        self.assertIn("过期", str(ctx.exception))

    def test_unknown_aad_code_still_classifies_as_an_auth_error(self):
        # An unrecognised code is still invalid_grant, so the credential is still dead;
        # falling through to a generic 502 would mislabel it as a server fault.
        with self.assertRaises(AccountAuthError) as ctx:
            self._refresh(_invalid_grant("AADSTS999999: Something new"))
        self.assertIn("重新授权", str(ctx.exception))

    def test_invalid_grant_without_an_aad_code_is_an_auth_error(self):
        with self.assertRaises(AccountAuthError) as ctx:
            self._refresh(_invalid_grant("token revoked"))
        self.assertIn("重新授权", str(ctx.exception))

    def test_server_error_stays_transient(self):
        # A 500 from Microsoft says nothing about our credential; retrying may work.
        response = _TokenResponse(500, {"error": "temporarily_unavailable"})
        with self.assertRaises(Exception) as ctx:
            self._refresh(response)
        self.assertNotIsInstance(ctx.exception, AccountAuthError)

    def test_non_json_error_body_stays_transient(self):
        # An HTML error page from a proxy must not be read as a credential verdict.
        response = _TokenResponse(502, None, text="<html>Bad Gateway</html>")
        with self.assertRaises(Exception) as ctx:
            self._refresh(response)
        self.assertNotIsInstance(ctx.exception, AccountAuthError)

    def test_other_oauth_errors_stay_transient(self):
        # invalid_request is a bug on our side, not a banned account.
        response = _TokenResponse(400, {"error": "invalid_request"})
        with self.assertRaises(Exception) as ctx:
            self._refresh(response)
        self.assertNotIsInstance(ctx.exception, AccountAuthError)

    def test_classification_does_not_depend_on_description_wording(self):
        # Microsoft can reword error_description at will, so the decision must come from
        # the machine-readable `error` field.
        response = _TokenResponse(400, {"error": "invalid_grant"})
        with self.assertRaises(AccountAuthError):
            self._refresh(response)


class ImapAuthClassificationTests(unittest.TestCase):
    def test_imap_auth_rejection_is_an_auth_error(self):
        # The token endpoint already succeeded, so a rejection here is the mailbox
        # refusing the account. Production showed "User is authenticated but not
        # connected." on accounts also failing token refresh with AADSTS70000.
        class FakeImap:
            def authenticate(self, mechanism, callback):
                raise imaplib.IMAP4.error("User is authenticated but not connected.")

            def logout(self):
                return "BYE", []

        with patch.object(mail_service, "get_access_token", lambda *a, **k: ("access", "rt", 3600)), \
             patch.object(mail_service.imaplib, "IMAP4_SSL", lambda host: FakeImap()):
            with self.assertRaises(AccountAuthError) as ctx:
                mail_service._imap_connect("user@example.com", "client", "refresh")

        self.assertIn("重新授权", str(ctx.exception))


class GraphAuthClassificationTests(unittest.TestCase):
    def _get(self, status_code):
        class Response:
            def __init__(self):
                self.status_code = status_code
                self.text = "body"

            def json(self):
                return {}

        with patch("app.services.mail_service.requests.get", lambda *a, **k: Response()):
            return mail_service._graph_get("https://graph.test/x", "access")

    def test_graph_401_is_an_auth_error(self):
        with self.assertRaises(AccountAuthError):
            self._get(401)

    def test_graph_403_is_an_auth_error(self):
        with self.assertRaises(AccountAuthError):
            self._get(403)

    def test_graph_500_stays_transient(self):
        with self.assertRaises(Exception) as ctx:
            self._get(500)
        self.assertNotIsInstance(ctx.exception, AccountAuthError)

    def test_graph_404_stays_transient(self):
        # A missing message is a request problem, not a credential problem.
        with self.assertRaises(Exception) as ctx:
            self._get(404)
        self.assertNotIsInstance(ctx.exception, AccountAuthError)


class RouteStatusCodeTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)

    def _account(self, db):
        account = Account(
            email="user@example.com",
            password="pw",
            client_id="client",
            refresh_token="refresh",
            enabled_protocols='["imap"]',
        )
        db.add(account)
        db.commit()
        db.refresh(account)
        return account

    def test_refresh_returns_409_with_the_reason_on_auth_failure(self):
        db = self.Session()
        try:
            account = self._account(db)

            def fail(*args, **kwargs):
                raise AccountAuthError("账号已被微软风控标记为滥用，需要重新授权")

            with patch.object(email_routes, "_do_fetch", fail):
                with self.assertRaises(HTTPException) as ctx:
                    email_routes.refresh_emails(account.id, "INBOX", db=db, _="token")
        finally:
            db.close()

        self.assertEqual(ctx.exception.status_code, 409)
        # The reason has to reach the client; burying it in the log is what made the
        # original 502 unactionable.
        self.assertIn("风控", ctx.exception.detail)

    def test_refresh_status_is_not_403(self):
        # 403 triggers a global logout in frontend/src/lib/api.ts, so a banned mailbox
        # must never share that code or refreshing one signs the operator out.
        self.assertNotEqual(email_routes.ACCOUNT_AUTH_STATUS, 403)
        self.assertNotEqual(account_routes.ACCOUNT_AUTH_STATUS, 403)

    def test_refresh_still_returns_502_on_transient_failure(self):
        db = self.Session()
        try:
            account = self._account(db)

            def fail(*args, **kwargs):
                raise Exception("connection reset")

            with patch.object(email_routes, "_do_fetch", fail):
                with self.assertRaises(HTTPException) as ctx:
                    email_routes.refresh_emails(account.id, "INBOX", db=db, _="token")
        finally:
            db.close()

        self.assertEqual(ctx.exception.status_code, 502)

    def test_body_fetch_returns_409_on_auth_failure(self):
        db = self.Session()
        try:
            account = self._account(db)
            email = Email(
                account_id=account.id,
                folder="INBOX",
                source_protocol="imap",
                external_id="x",
                sender="s",
                subject="s",
                received_ts_ms=1,
                body_fetched=False,
            )
            db.add(email)
            db.commit()
            db.refresh(email)

            def fail(*args, **kwargs):
                raise AccountAuthError("账号凭据已失效，需要重新授权")

            with patch.object(email_routes, "fetch_email_body", fail):
                with self.assertRaises(HTTPException) as ctx:
                    email_routes.get_email_detail(email.id, db=db, _="token")
        finally:
            db.close()

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("重新授权", ctx.exception.detail)

    def test_protocol_test_returns_409_on_auth_failure(self):
        def fail(*args):
            raise AccountAuthError("账号凭据已失效，需要重新授权")

        data = AccountImportTestRequest(
            line="user@example.com----pw----client----refresh",
            separator="----",
            enabled_protocols=["imap"],
        )
        original = account_routes.test_email_access
        account_routes.test_email_access = fail
        try:
            with self.assertRaises(HTTPException) as ctx:
                account_routes.test_import_protocol(data, _="token")
        finally:
            account_routes.test_email_access = original

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("重新授权", ctx.exception.detail)

    def test_auth_error_detail_does_not_leak_credentials(self):
        db = self.Session()
        try:
            account = self._account(db)

            def fail(*args, **kwargs):
                raise AccountAuthError("账号凭据已失效，需要重新授权")

            with patch.object(email_routes, "_do_fetch", fail):
                with self.assertRaises(HTTPException) as ctx:
                    email_routes.refresh_emails(account.id, "INBOX", db=db, _="token")
        finally:
            db.close()

        for secret in ("refresh", "pw", "client"):
            self.assertNotIn(secret, ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
