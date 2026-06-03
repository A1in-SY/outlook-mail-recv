import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.account import Account
from app.models.email import Email
from app.routes import emails as email_routes


class EmailRefreshTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)

    def test_refresh_upserts_metadata_preserves_cached_body_and_deletes_missing_remote(self):
        db = self.Session()
        try:
            account = Account(
                email="old@example.com",
                password="pw",
                client_id="client",
                refresh_token="refresh",
                enabled_protocols='["imap"]',
            )
            db.add(account)
            db.commit()
            db.refresh(account)
            db.add(Email(
                account_id=account.id,
                folder="INBOX",
                source_protocol="imap",
                external_id="keep",
                sender="sender",
                subject="cached",
                received_ts_ms=1000,
                body="cached body",
                body_html="<p>cached</p>",
                body_fetched=True,
            ))
            db.add(Email(
                account_id=account.id,
                folder="INBOX",
                source_protocol="imap",
                external_id="stale",
                sender="stale",
                subject="stale",
                received_ts_ms=500,
                body="stale body",
                body_html="",
                body_fetched=True,
            ))
            db.commit()

            def fake_fetch(*args):
                return [
                    {
                        "external_id": "keep",
                        "sender": "updated sender",
                        "subject": "updated",
                        "received_ts_ms": 3000,
                        "body": "",
                        "body_html": "",
                        "body_fetched": False,
                    },
                    {
                        "external_id": "new",
                        "sender": "new sender",
                        "subject": "new",
                        "received_ts_ms": 2000,
                        "body": "",
                        "body_html": "",
                        "body_fetched": False,
                    },
                ], ["keep", "new"], "new-refresh", None

            original_fetch = email_routes.fetch_email_list
            email_routes.fetch_email_list = fake_fetch
            try:
                email_routes._do_fetch(db, account, "INBOX")
            finally:
                email_routes.fetch_email_list = original_fetch

            kept = db.query(Email).filter(Email.external_id == "keep").one()
            self.assertEqual(kept.sender, "updated sender")
            self.assertEqual(kept.subject, "updated")
            self.assertEqual(kept.received_ts_ms, 3000)
            self.assertEqual(kept.body, "cached body")
            self.assertEqual(kept.body_html, "<p>cached</p>")
            self.assertTrue(kept.body_fetched)

            created = db.query(Email).filter(Email.external_id == "new").one()
            self.assertEqual(created.received_ts_ms, 2000)
            self.assertFalse(created.body_fetched)
            self.assertIsNone(db.query(Email).filter(Email.external_id == "stale").first())
            self.assertEqual(account.refresh_token, "new-refresh")
        finally:
            db.close()

    def test_list_emails_orders_by_received_timestamp_desc(self):
        db = self.Session()
        try:
            account = Account(
                email="order@example.com",
                password="pw",
                client_id="client",
                refresh_token="refresh",
                enabled_protocols='["imap"]',
            )
            db.add(account)
            db.commit()
            db.refresh(account)
            for external_id, received_ts_ms in [
                ("old", 1000),
                ("newer", 3000),
                ("same-a", 2000),
                ("same-b", 2000),
            ]:
                db.add(Email(
                    account_id=account.id,
                    folder="INBOX",
                    source_protocol="imap",
                    external_id=external_id,
                    sender=external_id,
                    subject=external_id,
                    received_ts_ms=received_ts_ms,
                    body="",
                    body_html="",
                    body_fetched=False,
                ))
            db.commit()

            result = email_routes.list_emails(account.id, "INBOX", db=db, _="token")

            self.assertEqual(
                [item["external_id"] for item in result["items"]],
                ["newer", "same-b", "same-a", "old"],
            )
        finally:
            db.close()

    def test_list_emails_empty_cache_does_not_fetch_remote(self):
        db = self.Session()
        try:
            account = Account(
                email="empty@example.com",
                password="pw",
                client_id="client",
                refresh_token="refresh",
                enabled_protocols='["imap"]',
            )
            db.add(account)
            db.commit()
            db.refresh(account)

            def fail_fetch(*args):
                raise AssertionError("list_emails should not fetch remote mail")

            original_fetch = email_routes.fetch_email_list
            email_routes.fetch_email_list = fail_fetch
            try:
                result = email_routes.list_emails(account.id, "INBOX", db=db, _="token")
            finally:
                email_routes.fetch_email_list = original_fetch

            self.assertEqual(result["items"], [])
            self.assertEqual(result["total"], 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
