import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

MIGRATIONS = [
    ("accounts", "rt_expires_at", "ALTER TABLE accounts ADD COLUMN rt_expires_at DATETIME"),
    ("accounts", "enabled_protocols", "ALTER TABLE accounts ADD COLUMN enabled_protocols VARCHAR DEFAULT '[\"imap\"]' NOT NULL"),
]


CREATE_EMAILS_SQL = """
CREATE TABLE emails (
    id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    folder VARCHAR NOT NULL,
    source_protocol VARCHAR NOT NULL DEFAULT 'imap',
    external_id VARCHAR NOT NULL DEFAULT '',
    sender VARCHAR DEFAULT '',
    subject VARCHAR DEFAULT '',
    received_ts_ms INTEGER NOT NULL DEFAULT 0,
    body TEXT DEFAULT '',
    body_html TEXT DEFAULT '',
    body_fetched BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME,
    updated_at DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY(account_id) REFERENCES accounts (id) ON DELETE CASCADE,
    CONSTRAINT uq_emails_external_message UNIQUE (account_id, folder, source_protocol, external_id)
)
"""


def _table_columns(conn, table: str) -> list[str]:
    return [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()]


def _ensure_email_indexes(conn):
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_emails_id
        ON emails (id)
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_emails_list_sort
        ON emails (account_id, folder, source_protocol, received_ts_ms DESC, id DESC)
    """))


def _ensure_emails_schema(conn):
    cols = _table_columns(conn, "emails")
    if not cols:
        return
    if "received_ts_ms" not in cols or "date" in cols:
        logger.info("Migration: recreating emails cache table for received_ts_ms schema")
        conn.execute(text("DROP TABLE emails"))
        conn.execute(text(CREATE_EMAILS_SQL))
    _ensure_email_indexes(conn)


def run_migrations(engine: Engine):
    with engine.connect() as conn:
        for table, column, sql in MIGRATIONS:
            cols = _table_columns(conn, table)
            if not cols:
                continue
            if column not in cols:
                logger.info("Migration: adding %s.%s", table, column)
                conn.execute(text(sql))
                conn.commit()
        _ensure_emails_schema(conn)
        conn.commit()
