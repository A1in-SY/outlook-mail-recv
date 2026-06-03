from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import not_
from typing import List, Optional
from app.core.database import get_db
from app.core.auth import verify_token
from app.models.account import Account
from app.models.platform import Platform, account_platforms
from app.core.protocols import choose_protocol, protocols_to_json
from app.schemas.account import AccountCreate, AccountImportRequest, AccountImportTestRequest, AccountUpdate, AccountOut
from app.services.mail_service import test_email_access

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def _apply_platform_filter(query, available_for: Optional[List[int]]):
    """筛选出未被用于指定平台的邮箱"""
    if available_for:
        # 子查询：找到已使用了这些平台的 account_id
        used_account_ids = (
            query.session.query(account_platforms.c.account_id)
            .filter(account_platforms.c.platform_id.in_(available_for))
            .subquery()
        )
        query = query.filter(not_(Account.id.in_(used_account_ids)))
    return query


def _validate_separator(separator: str):
    if not separator or not separator.strip():
        raise HTTPException(400, "Separator cannot be empty")


def _parse_import_line(line: str, separator: str) -> tuple[str, str, str, str]:
    _validate_separator(separator)
    line = line.strip()
    if not line:
        raise ValueError("empty line")
    parts = line.split(separator)
    if len(parts) < 4:
        raise ValueError(f"insufficient fields (need 4, got {len(parts)})")
    email_addr, password, client_id, refresh_token = [p.strip() for p in parts[:4]]
    return email_addr, password, client_id, refresh_token


@router.get("", response_model=List[AccountOut])
def list_accounts(
    page: int = 1,
    size: int = 20,
    search: str = "",
    available_for: Optional[List[int]] = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    query = db.query(Account)
    if search:
        query = query.filter(Account.email.contains(search))
    query = _apply_platform_filter(query, available_for)
    query = query.order_by(Account.id.desc())
    return query.offset((page - 1) * size).limit(size).all()


@router.get("/count")
def count_accounts(
    search: str = "",
    available_for: Optional[List[int]] = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    query = db.query(Account)
    if search:
        query = query.filter(Account.email.contains(search))
    query = _apply_platform_filter(query, available_for)
    return {"total": query.count()}


@router.post("", response_model=AccountOut)
def create_account(data: AccountCreate, db: Session = Depends(get_db), _: str = Depends(verify_token)):
    existing = db.query(Account).filter(Account.email == data.email).first()
    if existing:
        raise HTTPException(400, f"Account {data.email} already exists")
    values = data.model_dump()
    values["enabled_protocols"] = protocols_to_json(values.get("enabled_protocols"))
    account = Account(**values)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.post("/import")
def import_accounts(data: AccountImportRequest, db: Session = Depends(get_db), _: str = Depends(verify_token)):
    imported, skipped, errors = 0, 0, []
    _validate_separator(data.separator)
    enabled_protocols = protocols_to_json(data.enabled_protocols)
    for i, line in enumerate(data.lines, 1):
        if not line.strip():
            continue
        try:
            email_addr, password, client_id, refresh_token = _parse_import_line(line, data.separator)
        except ValueError as e:
            errors.append(f"Line {i}: {e}")
            continue
        if db.query(Account).filter(Account.email == email_addr).first():
            skipped += 1
            continue
        db.add(Account(
            email=email_addr,
            password=password,
            client_id=client_id,
            refresh_token=refresh_token,
            enabled_protocols=enabled_protocols,
        ))
        imported += 1
    db.commit()
    return {"imported": imported, "skipped": skipped, "errors": errors}


@router.post("/import/test-protocol")
def test_import_protocol(data: AccountImportTestRequest, _: str = Depends(verify_token)):
    _validate_separator(data.separator)
    try:
        email_addr, _, client_id, refresh_token = _parse_import_line(data.line, data.separator)
    except ValueError as e:
        raise HTTPException(400, str(e))

    protocol = choose_protocol(data.enabled_protocols)
    try:
        test_email_access(email_addr, client_id, refresh_token, "INBOX", protocol)
    except Exception as e:
        raise HTTPException(502, f"Protocol test failed: {e}")
    return {"ok": True, "protocol": protocol}


@router.get("/export")
def export_accounts(separator: str = "----", ids: Optional[List[int]] = Query(None), db: Session = Depends(get_db), _: str = Depends(verify_token)):
    _validate_separator(separator)
    query = db.query(Account).order_by(Account.id)
    if ids:
        query = query.filter(Account.id.in_(ids))
    accounts = query.all()
    lines = [f"{a.email}{separator}{a.password}{separator}{a.client_id}{separator}{a.refresh_token}" for a in accounts]
    return {"lines": lines, "total": len(lines)}


@router.get("/{account_id}", response_model=AccountOut)
def get_account(account_id: int, db: Session = Depends(get_db), _: str = Depends(verify_token)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    return account


@router.put("/{account_id}", response_model=AccountOut)
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db), _: str = Depends(verify_token)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    values = data.model_dump(exclude_unset=True)
    if "enabled_protocols" in values:
        values["enabled_protocols"] = protocols_to_json(values["enabled_protocols"])
    for key, val in values.items():
        setattr(account, key, val)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db), _: str = Depends(verify_token)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    db.delete(account)
    db.commit()
    return {"ok": True}
