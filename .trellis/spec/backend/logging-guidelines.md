# Logging Guidelines

The backend uses Python's standard `logging` module. There is no structured logging framework configured.

Reference files:

- `backend/app/core/migrate.py`
- `backend/app/routes/emails.py`
- `backend/scripts/backfill_enabled_protocols.py`

## Logger Setup

Use a module-level logger only in modules that actually log:

```python
import logging

logger = logging.getLogger(__name__)
```

Current examples:

- `backend/app/core/migrate.py`
- `backend/app/routes/emails.py`

Do not create loggers in every file by default.

## Levels

Use levels according to current local practice:

- `logger.info(...)` for expected one-time operational events, especially startup migrations. Example: adding a missing column in `run_migrations()`.
- `logger.exception(...)` when catching an unexpected exception that will be converted to an API error. Example: `refresh_emails()` logs upstream fetch failures before returning HTTP 502.

There is no current use of debug or warning logs in the backend. Add them only when they are actionable and not noisy.

## What To Log

Good log fields are identifiers and operation context:

- Migration table and column names.
- Account ID and folder name for mail refresh failures.
- Email ID for body-fetch failures.

Use parameterized logging:

```python
logger.exception("Refresh emails failed for account %s folder %s", account_id, folder)
```

This is the existing style in `backend/app/routes/emails.py`.

## What Not To Log

Never log secrets or mailbox contents:

- `Account.password`
- `Account.refresh_token`
- OAuth access tokens
- Authorization headers
- `client_id` when paired with secrets
- Full imported account lines
- Raw email body or HTML

Error responses from OAuth or Graph can contain sensitive details. If adding new logging around `mail_service.py`, sanitize response bodies before logging.

## Print Statements

Avoid `print()` in the web application. The one current use is in the maintenance script `backend/scripts/backfill_enabled_protocols.py`, where command-line output is appropriate.

If adding a script, `print()` is acceptable for final human-readable script results. Use logging for server code.
