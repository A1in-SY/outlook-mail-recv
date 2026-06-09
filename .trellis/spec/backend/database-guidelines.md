# Database Guidelines

The backend uses SQLAlchemy declarative models with SQLite as the default database.

Reference files:

- `backend/app/core/database.py`
- `backend/app/core/migrate.py`
- `backend/app/models/account.py`
- `backend/app/models/email.py`
- `backend/app/models/platform.py`
- `backend/tests/test_database.py`
- `backend/tests/test_email_refresh.py`

## Engine And Sessions

`DATABASE_URL` defaults to `sqlite:///./data/outlook_mail.db` and can be overridden by environment variable.

`backend/app/core/database.py` owns:

- `ensure_sqlite_directory(database_url)` before engine creation.
- `engine = create_engine(..., connect_args={"check_same_thread": False, "timeout": 30})`.
- `SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)`.
- `Base = declarative_base()`.
- `get_db()` as the FastAPI dependency that closes sessions in `finally`.

Use `db: Session = Depends(get_db)` in route handlers. For scripts, create `SessionLocal()` directly and close it in `finally`, as shown in `backend/scripts/backfill_enabled_protocols.py`.

## Startup Schema Creation

`backend/main.py` currently creates and prepares the database at import/startup:

- `Base.metadata.create_all(bind=engine)`
- `run_migrations(engine)`
- `seed_platforms(db)`

When adding a model, make sure it is imported before `create_all` runs. Existing tests import related models with `# noqa: F401` when the import is needed only to register metadata, for example `backend/tests/test_platforms.py`.

## Migrations

This repository does not use Alembic. Migrations are lightweight, idempotent startup checks in `backend/app/core/migrate.py`.

Current patterns:

- Simple added columns live in the `MIGRATIONS` list as `(table, column, sql)` tuples.
- Existing columns are discovered through `PRAGMA table_info(...)`.
- Missing optional/new columns are added with `ALTER TABLE`.
- Legacy incompatible cache tables can be recreated when needed, as `_ensure_emails_schema()` does for the `emails` cache table.
- Indexes are created with `CREATE INDEX IF NOT EXISTS`.
- Migrations commit through the SQLAlchemy connection.

Add tests for migrations that protect real data expectations. `backend/tests/test_database.py` verifies that a legacy `emails` cache table is recreated while `accounts` rows are preserved.

## Models

Use SQLAlchemy `Column` declarations and `relationship()` in model files.

Local model conventions:

- Primary keys are integer `id` columns with `primary_key=True`.
- User-facing identifiers that must be unique also get `unique=True`, for example `Account.email` and `Platform.name`.
- Timestamp columns use `datetime.now(timezone.utc)` lambdas, not naive `datetime.now()`.
- Child rows use relationships for navigation and cascading, for example `Account.emails` with `cascade="all, delete-orphan"`.
- Many-to-many tables use SQLAlchemy `Table`, as in `account_platforms`.
- Query-sensitive cache ordering is backed by an explicit index. `Email` defines `ix_emails_list_sort` for list ordering.

## Stored Data Shapes

`Account.enabled_protocols` is stored as a JSON string in the database, with API conversion handled outside the model.

Use the helpers in `backend/app/core/protocols.py`:

- `protocols_to_json()` before saving API values to the database.
- `protocols_from_json()` before exposing stored values to API responses.
- `normalize_protocols()` for validation and deduplication.
- `choose_protocol()` when deciding the active fetch protocol.

Do not store Python lists directly in the SQLAlchemy string column, and do not duplicate JSON parsing logic elsewhere.

## Query Patterns

Routes use direct SQLAlchemy ORM queries with explicit filters and pagination.

Examples:

- Account list and count share search and platform availability filters in `backend/app/routes/accounts.py`.
- Email list queries cached rows only and orders by `Email.received_ts_ms.desc(), Email.id.desc()` in `backend/app/routes/emails.py`.
- Platform APIs load the account first and return 404 when the account is missing in `backend/app/routes/platforms.py`.

For paginated list endpoints, keep `count()` separate from `offset(...).limit(...)` as the current API returns `{items, total}` or a list plus a count endpoint.

Do not fetch remote mail from ordinary list endpoints. `backend/tests/test_email_refresh.py` protects this behavior with `test_list_emails_empty_cache_does_not_fetch_remote`.

## Transactions

Routes and scripts commit explicitly after writes:

- Create/update/delete account endpoints call `db.commit()` and refresh ORM objects when returning them.
- Import adds all valid accounts, then commits once.
- Email refresh updates cached rows, deletes stale rows, updates refresh tokens, then commits once.

Keep one transaction around one user-visible write operation. Avoid committing inside loops unless a partial-commit behavior is explicitly required and tested.

## Common Mistakes

- Forgetting `backend/app/core/migrate.py` when adding a model column breaks existing SQLite databases.
- Changing cached email fields without updating `CREATE_EMAILS_SQL` and `_ensure_email_indexes()` can leave legacy databases inconsistent.
- Updating email metadata should not erase cached bodies. See `test_refresh_upserts_metadata_preserves_cached_body_and_deletes_missing_remote`.
- Adding a new field often requires model, migration, schema, route conversion, frontend type, and tests.
