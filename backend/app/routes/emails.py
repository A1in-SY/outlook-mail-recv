import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth import verify_token
from app.core.protocols import choose_protocol, protocols_from_json
from app.models.account import Account
from app.models.email import Email
from app.schemas.email import EmailOut
from app.services.mail_service import fetch_email_body, fetch_email_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/emails", tags=["emails"])

VALID_FOLDERS = ("INBOX", "Junk")


def _selected_protocol(account: Account) -> str:
    return choose_protocol(protocols_from_json(account.enabled_protocols))


def _update_token(account: Account, new_refresh_token: str, rt_expires_in):
    account.refresh_token = new_refresh_token
    if rt_expires_in:
        account.rt_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(rt_expires_in))


def _do_fetch(db: Session, account: Account, folder: str):
    protocol = _selected_protocol(account)
    existing_with_external_id = {
        e.external_id: e
        for e in db.query(Email)
        .filter(
            Email.account_id == account.id,
            Email.folder == folder,
            Email.source_protocol == protocol,
            Email.external_id != "",
        )
        .all()
    }
    emails, remote_ids, new_refresh_token, rt_expires_in = fetch_email_list(
        account.email,
        account.client_id,
        account.refresh_token,
        folder,
        protocol,
        set(existing_with_external_id.keys()),
    )
    seen = set(remote_ids)
    for e in emails:
        external_id = e["external_id"]
        item = existing_with_external_id.get(external_id)
        if item:
            item.sender = e["sender"]
            item.subject = e["subject"]
            item.received_ts_ms = e["received_ts_ms"]
        else:
            db.add(Email(account_id=account.id, folder=folder, source_protocol=protocol, **e))
    for external_id, item in existing_with_external_id.items():
        if external_id not in seen:
            db.delete(item)
    _update_token(account, new_refresh_token, rt_expires_in)
    db.commit()


@router.get("/message/{email_id}", response_model=EmailOut)
def get_email_detail(email_id: int, db: Session = Depends(get_db), _: str = Depends(verify_token)):
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(404, "Email not found")
    account = db.query(Account).filter(Account.id == email.account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    if not email.body_fetched:
        try:
            body_data, new_refresh_token, rt_expires_in = fetch_email_body(
                account.email,
                account.client_id,
                account.refresh_token,
                email.folder,
                email.source_protocol,
                email.external_id,
            )
            email.body = body_data["body"]
            email.body_html = body_data["body_html"]
            email.body_fetched = body_data["body_fetched"]
            _update_token(account, new_refresh_token, rt_expires_in)
            db.commit()
            db.refresh(email)
        except Exception:
            logger.exception("Fetch email body failed for email %s", email_id)
            raise HTTPException(502, "Failed to fetch email body from mail server")
    return email


@router.get("/{account_id}/{folder}")
def list_emails(account_id: int, folder: str, page: int = 1, size: int = 20, db: Session = Depends(get_db), _: str = Depends(verify_token)):
    if folder not in VALID_FOLDERS:
        raise HTTPException(400, "Folder must be INBOX or Junk")
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")

    protocol = _selected_protocol(account)
    cached = db.query(Email).filter(
        Email.account_id == account_id,
        Email.folder == folder,
        Email.source_protocol == protocol,
    ).count()
    if cached == 0:
        try:
            _do_fetch(db, account, folder)
        except Exception as e:
            logger.exception("Fetch emails failed for account %s folder %s", account_id, folder)
            raise HTTPException(502, "Failed to fetch emails from mail server")

    query = db.query(Email).filter(
        Email.account_id == account_id,
        Email.folder == folder,
        Email.source_protocol == protocol,
    )
    total = query.count()
    items = query.order_by(Email.received_ts_ms.desc(), Email.id.desc()).offset((page - 1) * size).limit(size).all()
    return {"items": [EmailOut.model_validate(e).model_dump() for e in items], "total": total}


@router.post("/{account_id}/{folder}/refresh")
def refresh_emails(account_id: int, folder: str, db: Session = Depends(get_db), _: str = Depends(verify_token)):
    if folder not in VALID_FOLDERS:
        raise HTTPException(400, "Folder must be INBOX or Junk")
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    try:
        _do_fetch(db, account, folder)
    except Exception as e:
        logger.exception("Refresh emails failed for account %s folder %s", account_id, folder)
        raise HTTPException(502, "Failed to fetch emails from mail server")
    return {"ok": True}


@router.delete("/{account_id}/{folder}")
def clear_emails(account_id: int, folder: str, db: Session = Depends(get_db), _: str = Depends(verify_token)):
    if folder not in ("INBOX", "Junk"):
        raise HTTPException(400, "Folder must be INBOX or Junk")
    db.query(Email).filter(Email.account_id == account_id, Email.folder == folder).delete()
    db.commit()
    return {"ok": True}
