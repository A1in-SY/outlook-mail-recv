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
- `409` when a stored mailbox credential is no longer usable. See "Account Credential Failures" below.
- `502` when an upstream mail, IMAP, Graph, or token-refresh operation fails *transiently*.

Keep error details short and user-readable. Existing frontend code reads `detail` in `frontend/src/lib/api.ts` and displays it through toast messages.

### Do not reuse 403 for mailbox credentials

`frontend/src/lib/api.ts` treats `403` as *this application's* bearer token being rejected: it calls `clearToken()` and redirects to login. A dead **mailbox** credential must therefore never return `403`, or refreshing a banned account would sign the operator out of the whole app.

`409` was chosen because it is unused elsewhere in this API and reads as "the stored resource conflicts with the request". It is not a widespread convention for this case, which is exactly why it is written down here.

## Account Credential Failures

Microsoft rejects a dead credential deterministically; retrying never helps. Conflating that with a transient network fault leaves the user unable to tell "this account is banned" from "try again", so the two are separated.

`AccountAuthError` in `backend/app/services/mail_service.py` marks the permanent case. Routes catch it before the generic `except Exception` and return `ACCOUNT_AUTH_STATUS` (409) with the reason as `detail`; everything else stays `502`.

Classify as `AccountAuthError`:

- The token endpoint returns `error == "invalid_grant"`. Dispatch on that machine-readable field, **not** on substring matches against `error_description` — Microsoft rewords the prose freely. `AAD_ERROR_MESSAGES` maps known `AADSTS` codes to actionable Chinese text; unknown codes fall back to a generic "needs re-authorisation" message, since `invalid_grant` already proves the credential is dead.
- IMAP `authenticate()` raises `imaplib.IMAP4.error`. A token was just minted successfully, so the rejection is the mailbox refusing the account.
- Graph returns `401` or `403`.

Leave as a plain `Exception` (→ 502): timeouts, connection failures, 5xx from the token endpoint or Graph, non-JSON error bodies, other OAuth error codes, and folder/search/fetch failures.

Log these with `logger.warning(...)` and the reason rather than `logger.exception(...)`. A banned account emits one on every refresh click, so a stack trace per click is noise — the condition is expected and self-explanatory.

## Validation

Put reusable validation in shared helpers:

- Import separators are validated by `_validate_separator()` in `backend/app/routes/accounts.py` and by Pydantic field validators in `backend/app/schemas/account.py`.
- Import lines are parsed by `_parse_import_line()`, which returns a tuple or raises `ValueError`.
- Protocol values are normalized in `backend/app/core/protocols.py`.

If multiple request models need the same rule, centralize it before wiring it into Pydantic validators and route functions.

Note that this project currently raises `HTTPException` from some Pydantic validators. Preserve the existing API behavior when editing those validators and cover it with tests.

## Route Boundary Pattern

External service failures should be caught at the route boundary, logged, and converted to `HTTPException(502, ...)`.

Catch `AccountAuthError` first, then fall through to the generic handler:

```python
except AccountAuthError as e:
    logger.warning("Account credential rejected for account %s folder %s: %s", account_id, folder, e)
    raise HTTPException(ACCOUNT_AUTH_STATUS, str(e))
except Exception:
    logger.exception("Refresh emails failed for account %s folder %s", account_id, folder)
    raise HTTPException(502, "Failed to fetch emails from mail server")
```

Examples:

- `test_import_protocol()` catches `test_email_access()` failures: 409 with the reason for `AccountAuthError`, otherwise `"Protocol test failed: ..."` with status 502.
- `get_email_detail()` and `refresh_emails()` follow the same two-branch shape.

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
- `backend/tests/test_account_auth_errors.py` — covers both sides of the permanent/transient split, and asserts the auth status is never 403.
