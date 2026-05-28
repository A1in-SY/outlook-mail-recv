import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine, text

from app.core.database import ensure_sqlite_directory
from app.core.migrate import run_migrations


class DatabaseTests(unittest.TestCase):
    def test_ensure_sqlite_directory_creates_parent_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "nested" / "outlook_mail.db"

            ensure_sqlite_directory(f"sqlite:///{db_path}")

            self.assertTrue(db_path.parent.is_dir())

    def test_run_migrations_recreates_legacy_emails_cache_without_dropping_accounts(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE accounts (
                    id INTEGER PRIMARY KEY,
                    email VARCHAR,
                    password VARCHAR,
                    client_id VARCHAR,
                    refresh_token VARCHAR
                )
            """))
            conn.execute(text("""
                CREATE TABLE emails (
                    id INTEGER PRIMARY KEY,
                    account_id INTEGER,
                    folder VARCHAR,
                    source_protocol VARCHAR,
                    external_id VARCHAR,
                    sender VARCHAR,
                    subject VARCHAR,
                    date VARCHAR,
                    body TEXT,
                    body_html TEXT,
                    body_fetched BOOLEAN
                )
            """))
            conn.execute(text("""
                INSERT INTO accounts (id, email, password, client_id, refresh_token)
                VALUES (1, 'user@example.com', 'pw', 'client', 'refresh')
            """))
            conn.execute(text("""
                INSERT INTO emails (
                    id, account_id, folder, source_protocol, external_id, sender, subject,
                    date, body, body_html, body_fetched
                )
                VALUES (1, 1, 'INBOX', 'imap', '101', 'sender', 'subject', 'date', 'body', '', 1)
            """))

        run_migrations(engine)

        with engine.connect() as conn:
            email_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(emails)")).fetchall()]
            account_count = conn.execute(text("SELECT COUNT(*) FROM accounts")).scalar_one()
            email_count = conn.execute(text("SELECT COUNT(*) FROM emails")).scalar_one()

        self.assertIn("received_ts_ms", email_cols)
        self.assertNotIn("date", email_cols)
        self.assertEqual(account_count, 1)
        self.assertEqual(email_count, 0)


if __name__ == "__main__":
    unittest.main()
