# Error Handling

Backend errors are represented with FastAPI `HTTPException` at API boundaries and ordinary Python exceptions inside service code.

Reference files:

- `backend/app/core/auth.py`
- `backend/app/core/protocols.py`
- `backend/app/routes/accounts.py`
- `backend/app/routes/emails.py`
- `backend/app/services/mail_service.py`
- `backend/tests/test_account_import.py`
- `backend/tests/test_mail_service.py`

## API Errors

Use `HTTPException(status_code, detail)` for client-visible API failures.

Current status-code conventions:

- `400` for invalid user input, for example an empty import separator, an unsupported protocol, an invalid folder, or invalid platform IDs.
- `403` for invalid bearer token in `verify_token()`.
- `404` when a requested account or email does not exist.
- `502` when an upstream mail, IMAP, Graph, or token-refresh operation fails.

Keep error details short and user-readable. Existing frontend code reads `detail` in `frontend/src/lib/api.ts` and displays it through toast messages.

## Validation

Put reusable validation in shared helpers:

- Import separators are validated by `_validate_separator()` in `backend/app/routes/accounts.py` and by Pydantic field validators in `backend/app/schemas/account.py`.
- Import lines are parsed by `_parse_import_line()`, which returns a tuple or raises `ValueError`.
- Protocol values are normalized in `backend/app/core/protocols.py`.

If multiple request models need the same rule, centralize it before wiring it into Pydantic validators and route functions.

Note that this project currently raises `HTTPException` from some Pydantic validators. Preserve the existing API behavior when editing those validators and cover it with tests.

## Route Boundary Pattern

External service failures should be caught at the route boundary, logged, and converted to `HTTPException(502, ...)`.

Examples:

- `test_import_protocol()` catches `test_email_access()` failures and returns `"Protocol test failed: ..."` with status 502.
- `get_email_detail()` logs the exception and returns `"Failed to fetch email body from mail server"` with status 502.
- `refresh_emails()` logs the account and folder, then returns `"Failed to fetch emails from mail server"` with status 502.

Do not leak full access tokens, refresh tokens, passwords, or raw account secrets in error responses.

## Service Layer Pattern

`backend/app/services/mail_service.py` raises ordinary `Exception` instances when external protocol operations fail:

- OAuth refresh failure includes the HTTP status and response text.
- IMAP auth, folder selection, search, header fetch, and body fetch failures raise exceptions.
- Graph responses with status >= 400 raise exceptions.
- Unsupported protocol dispatch raises an exception.

Service functions should still clean up resources. IMAP code uses `finally: _logout(mail)` and `_logout()` suppresses logout failures so they do not hide the original error.

## Not-Found Handling

Load parent resources before dependent operations:

- `get_email_detail()` loads the `Email`, then loads the owning `Account`, returning 404 for either missing row.
- Platform update APIs load the account before validating platform IDs.

Use this pattern for new resource routes so missing parent and missing child cases remain distinguishable.

## Tests

When changing error handling, add or update tests that assert both status code and important detail text.

Examples:

- `backend/tests/test_account_import.py::test_import_rejects_empty_separator`
- `backend/tests/test_account_import.py::test_protocol_test_returns_bad_gateway_on_external_failure`
- `backend/tests/test_mail_service.py::test_imap_email_list_raises_when_header_fetch_fails`
