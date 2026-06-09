# Directory Structure

Backend code is a small FastAPI application with explicit layer folders under `backend/app/`.

## Layout

```text
backend/
├── main.py                         # FastAPI app creation, startup schema/migration/seed, static frontend serving
├── app/
│   ├── core/                       # Shared infrastructure and validation helpers
│   │   ├── auth.py                 # Bearer-token validation against config secret
│   │   ├── config.py               # JSON config loading with CONFIG_PATH override
│   │   ├── database.py             # SQLAlchemy engine, SessionLocal, Base, get_db
│   │   ├── migrate.py              # Lightweight startup migrations
│   │   └── protocols.py            # IMAP/Graph protocol normalization and selection
│   ├── models/                     # SQLAlchemy ORM models and table constants
│   ├── routes/                     # FastAPI APIRouter modules
│   ├── schemas/                    # Pydantic request/response models
│   └── services/                   # External mail/Graph/IMAP integration
├── scripts/                        # One-off maintenance scripts
├── tests/                          # unittest regression tests
├── requirements.txt
└── config.template.json
```

## Module Ownership

Route modules should remain thin. They own HTTP concerns:

- Router prefix and tags.
- `Depends(get_db)` session injection.
- `Depends(verify_token)` authentication.
- Query/path/body parameters.
- Choosing the response shape.
- Translating expected validation failures to `HTTPException`.
- Translating remote mail failures to HTTP 502.

Reference files:

- `backend/app/routes/accounts.py`
- `backend/app/routes/emails.py`
- `backend/app/routes/platforms.py`

Core modules own reusable backend infrastructure and pure validation:

- Use `backend/app/core/protocols.py` for every conversion between API protocol lists, JSON storage, and protocol priority.
- Use `backend/app/core/database.py` for session creation and SQLite directory setup.
- Use `backend/app/core/auth.py` for token verification.
- Add startup migrations to `backend/app/core/migrate.py`, not to route handlers.

Model modules own SQLAlchemy persistence details only. They should not call remote services or return FastAPI responses.

Schema modules own Pydantic validation and serialization. For ORM responses, include `model_config = {"from_attributes": True}` as in `AccountOut` and `EmailOut`.

Service modules own external systems and parsing logic. `backend/app/services/mail_service.py` is the reference for:

- OAuth token refresh.
- IMAP connection and UID-based fetching.
- Microsoft Graph requests.
- MIME decoding and HTML-to-text fallback.
- Returning plain dictionaries/tuples to routes instead of FastAPI response objects.

## Adding A Feature

For a new API feature, update the layers in this order:

1. Add or change SQLAlchemy models in `backend/app/models/` if persistence changes.
2. Add idempotent startup migration logic in `backend/app/core/migrate.py` when existing SQLite databases need a schema change.
3. Add or update Pydantic schemas in `backend/app/schemas/`.
4. Add shared validation helpers in `backend/app/core/` when more than one route or schema needs the same rule.
5. Add the route in `backend/app/routes/`.
6. Add focused `unittest` coverage under `backend/tests/`.

The `enabled_protocols` feature is the best local example of a cross-layer field:

- Storage column: `backend/app/models/account.py`
- JSON conversion and priority: `backend/app/core/protocols.py`
- Request/response validation: `backend/app/schemas/account.py`
- Route conversion before saving: `backend/app/routes/accounts.py`
- Migration/backfill: `backend/app/core/migrate.py` and `backend/scripts/backfill_enabled_protocols.py`
- Regression tests: `backend/tests/test_protocols.py` and `backend/tests/test_account_import.py`

## Naming Conventions

- Python files and helper functions use `snake_case`.
- SQLAlchemy model classes use singular PascalCase names: `Account`, `Email`, `Platform`.
- Table names use lowercase plural names: `accounts`, `emails`, `platforms`.
- Private route helpers use a leading underscore when they are module-local, for example `_parse_import_line` and `_do_fetch`.
- API routers are named `router` in each route module.
- Tests use `test_...` method names inside `unittest.TestCase` classes.

## Avoid

- Do not put direct `requests`, `imaplib`, or MIME parsing code in route modules. Route modules should call service functions.
- Do not add database sessions outside `get_db()` in request handlers.
- Do not duplicate protocol parsing rules in schemas or routes. Use `app.core.protocols`.
- Do not add broad startup side effects to arbitrary modules. Startup side effects currently belong in `backend/main.py`.
