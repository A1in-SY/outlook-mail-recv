from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.auth import verify_token
from app.models.platform import Platform, account_platforms
from app.models.account import Account

router = APIRouter(prefix="/api", tags=["platforms"])


@router.get("/platforms")
def list_platforms(db: Session = Depends(get_db), _: str = Depends(verify_token)):
    platforms = db.query(Platform).order_by(Platform.name).all()
    return [{"id": p.id, "name": p.name} for p in platforms]


@router.get("/accounts/{account_id}/platforms")
def get_account_platforms(account_id: int, db: Session = Depends(get_db), _: str = Depends(verify_token)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    return sorted([{"id": p.id, "name": p.name} for p in account.platforms], key=lambda x: x["name"])


@router.put("/accounts/{account_id}/platforms")
def update_account_platforms(account_id: int, platform_ids: List[int], db: Session = Depends(get_db), _: str = Depends(verify_token)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    platforms = db.query(Platform).filter(Platform.id.in_(platform_ids)).all()
    if len(platforms) != len(platform_ids):
        raise HTTPException(400, "One or more platform IDs are invalid")
    account.platforms = platforms
    db.commit()
    return [{"id": p.id, "name": p.name} for p in account.platforms]
