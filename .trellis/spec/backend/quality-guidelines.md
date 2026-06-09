# Quality Guidelines

Backend changes should preserve the current FastAPI, SQLAlchemy, and unittest patterns.

## Verification Command

Run backend tests from the backend directory:

```bash
cd backend
PYTHONPATH=. python -m unittest discover -s tests
```

The repository currently has no backend lint, format, or type-check command configured.

## Required Patterns

- Keep route handlers small and push reusable parsing/normalization into helpers.
- Use `Depends(get_db)` and `Depends(verify_token)` on protected API routes.
- Use Pydantic `BaseModel` classes for request and response shapes.
- Use `model_config = {"from_attributes": True}` for schemas returned from ORM objects.
- Use `datetime.now(timezone.utc)` for timestamp defaults.
- Use `protocols_to_json()`, `protocols_from_json()`, `normalize_protocols()`, and `choose_protocol()` for protocol-related logic.
- Use idempotent startup migrations for existing SQLite databases.
- Use `logger.exception()` before hiding unexpected upstream failures behind a 502.

## Testing Requirements

Use `unittest.TestCase` classes under `backend/tests/`.

Preferred test patterns:

- Use in-memory SQLite with `create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})` for route/database behavior.
- Call route functions directly with explicit `db=` and `_="token"` arguments when FastAPI request machinery is not needed.
- Patch external mail dependencies rather than calling real IMAP, OAuth, or Graph services.
- Use `unittest.mock.patch` for service-level dependency replacement, as in `backend/tests/test_mail_service.py`.
- Use direct monkey patch assignment for route module functions when that is the existing local pattern, as in `backend/tests/test_account_import.py`.
- Assert data preservation behavior for cache updates, not only success responses.

Add tests when changing:

- Database schema, migrations, indexes, or cached email behavior.
- Protocol normalization, priority, or storage format.
- Import/export parsing.
- External IMAP/Graph request behavior.
- Error-to-status-code mapping.

## Forbidden Or High-Risk Patterns

- Do not make network calls in list endpoints. `list_emails()` reads cached rows only.
- Do not erase cached email body fields when refreshing email metadata.
- Do not duplicate protocol constants or protocol priority outside `backend/app/core/protocols.py`.
- Do not add a model column without updating startup migration behavior for existing SQLite databases.
- Do not catch `Exception` and silently continue, except for cleanup code like `_logout()`.
- Do not return raw SQLAlchemy objects from untyped ad hoc dictionaries when a Pydantic response model already exists for that resource.
- Do not commit inside import loops unless partial persistence is an intentional, tested behavior.

## Review Checklist

Before accepting backend changes, check:

- Does every protected endpoint require `verify_token`?
- Are user-input failures 400 and missing resources 404?
- Are upstream mail/Graph failures converted to 502 at the route boundary?
- Does new persistent data have model, migration, schema, and tests?
- Does any log or error message expose password, refresh token, access token, or full imported account line?
- Do tests avoid real network calls?
- Does the frontend API type need to change with the backend response?
