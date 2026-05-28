from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base
from app.models.platform import account_platforms


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    client_id = Column(String, nullable=False)
    refresh_token = Column(String, nullable=False)
    enabled_protocols = Column(String, nullable=False, default='["imap"]')
    rt_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    emails = relationship("Email", back_populates="account", cascade="all, delete-orphan")
    platforms = relationship("Platform", secondary=account_platforms, back_populates="accounts")
