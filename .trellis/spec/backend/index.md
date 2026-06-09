# Backend Development Guidelines

Backend code lives under `backend/` and serves a FastAPI API for account, platform, and cached mail management.

The current backend stack is:

- FastAPI and Uvicorn from `backend/main.py`
- SQLAlchemy declarative models and sessions from `backend/app/core/database.py`
- Pydantic v2 schemas from `backend/app/schemas/`
- IMAP, Microsoft Graph, and token refresh code in `backend/app/services/mail_service.py`
- `unittest` based tests under `backend/tests/`

## Guidelines Index

| Guide | Description |
| --- | --- |
| [Directory Structure](./directory-structure.md) | Backend module layout, ownership, and where new code belongs |
| [Database Guidelines](./database-guidelines.md) | SQLAlchemy models, SQLite compatibility, migrations, and query rules |
| [Error Handling](./error-handling.md) | HTTP errors, external service failures, validation, and cleanup |
| [Logging Guidelines](./logging-guidelines.md) | Current logging usage, safe events, and sensitive-data rules |
| [Quality Guidelines](./quality-guidelines.md) | Test style, verification commands, and backend review checklist |

## Local Architecture Rules

- Keep HTTP request handling in `backend/app/routes/`.
- Keep shared validation and configuration in `backend/app/core/`.
- Keep SQLAlchemy table definitions in `backend/app/models/`.
- Keep Pydantic request and response shapes in `backend/app/schemas/`.
- Keep external Outlook, IMAP, Graph, MIME, and HTML parsing work in `backend/app/services/`.
- Keep tests close to the behavior being protected under `backend/tests/`.

Source-backed examples:

- `backend/app/routes/accounts.py` shows the route + schema + database-session pattern.
- `backend/app/routes/emails.py` shows route-level conversion of remote mail failures into HTTP 502 responses.
- `backend/app/core/protocols.py` centralizes protocol normalization and priority.
- `backend/app/core/migrate.py` contains the current startup migration mechanism.
- `backend/tests/test_email_refresh.py` and `backend/tests/test_mail_service.py` show preferred regression tests for mail behavior.

## Verification

For backend behavior changes, run:

```bash
cd backend
PYTHONPATH=. python -m unittest discover -s tests
```

There is no backend formatter, linter, or type checker configured in this repository right now. Do not claim one passed unless you add and run it.
