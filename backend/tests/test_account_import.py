import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.account import Account
from app.models.email import Email  # noqa: F401
from app.routes import accounts as account_routes
from app.schemas.account import AccountImportRequest, AccountImportTestRequest


class AccountImportTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)

    def test_import_rejects_empty_separator(self):
        with self.assertRaises(HTTPException) as ctx:
            AccountImportRequest(lines=["a"], separator=" ", enabled_protocols=["imap"])

        self.assertEqual(ctx.exception.status_code, 400)

    def test_import_uses_shared_line_validation_and_allows_extra_fields(self):
        db = self.Session()
        try:
            data = AccountImportRequest(
                lines=[
                    "bad----only----three",
                    "user@example.com----pw----client----refresh----ignored",
                ],
                separator="----",
                enabled_protocols=["imap"],
            )

            result = account_routes.import_accounts(data, db=db, _="token")

            self.assertEqual(result["imported"], 1)
            self.assertEqual(result["skipped"], 0)
            self.assertEqual(result["errors"], ["Line 1: insufficient fields (need 4, got 3)"])
            account = db.query(Account).filter(Account.email == "user@example.com").one()
            self.assertEqual(account.password, "pw")
            self.assertEqual(account.client_id, "client")
            self.assertEqual(account.refresh_token, "refresh")
        finally:
            db.close()

    def test_protocol_test_uses_priority_protocol(self):
        calls = []

        def fake_test(email_addr, client_id, refresh_token, folder, protocol):
            calls.append((email_addr, client_id, refresh_token, folder, protocol))
            return "new-refresh", None

        data = AccountImportTestRequest(
            line="user@example.com----pw----client----refresh",
            separator="----",
            enabled_protocols=["imap", "graph"],
        )
        original_test = account_routes.test_email_access
        account_routes.test_email_access = fake_test
        try:
            result = account_routes.test_import_protocol(data, _="token")
        finally:
            account_routes.test_email_access = original_test

        self.assertEqual(result, {"ok": True, "protocol": "graph"})
        self.assertEqual(calls, [("user@example.com", "client", "refresh", "INBOX", "graph")])

    def test_protocol_test_returns_bad_gateway_on_external_failure(self):
        def fake_test(*args):
            raise Exception("external failed")

        data = AccountImportTestRequest(
            line="user@example.com----pw----client----refresh",
            separator="----",
            enabled_protocols=["imap"],
        )
        original_test = account_routes.test_email_access
        account_routes.test_email_access = fake_test
        try:
            with self.assertRaises(HTTPException) as ctx:
                account_routes.test_import_protocol(data, _="token")
        finally:
            account_routes.test_email_access = original_test

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("external failed", ctx.exception.detail)

    def test_export_rejects_empty_separator(self):
        db = self.Session()
        try:
            with self.assertRaises(HTTPException) as ctx:
                account_routes.export_accounts(separator="", db=db, _="token")
        finally:
            db.close()

        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
