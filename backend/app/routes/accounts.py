from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import not_
from typing import List, Optional
from app.core.database import get_db
from app.core.auth import verify_token
from app.models.account import Account
from app.models.platform import Platform, account_platforms
from app.core.protocols import protocols_to_json
from app.schemas.account import AccountCreate, AccountImportRequest, AccountUpdate, AccountOut

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
    enabled_protocols = protocols_to_json(data.enabled_protocols)
    for i, line in enumerate(data.lines, 1):
        line = line.strip()
        if not line:
            continue
        parts = line.split(data.separator)
        if len(parts) < 4:
            errors.append(f"Line {i}: insufficient fields (need 4, got {len(parts)})")
            continue
        email_addr, password, client_id, refresh_token = [p.strip() for p in parts[:4]]
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


@router.get("/export")
def export_accounts(separator: str = "----", ids: Optional[List[int]] = Query(None), db: Session = Depends(get_db), _: str = Depends(verify_token)):
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
