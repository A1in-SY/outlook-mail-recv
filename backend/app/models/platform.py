from sqlalchemy import Column, Integer, String, Table, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

# 平台列表（代码维护的有限列表）
PLATFORM_LIST = sorted([
    "Amazon",
    "Apple",
    "ChatGPT",
    "Claude",
    "Copilot",
    "Cursor",
    "Discord",
    "Facebook",
    "Gemini",
    "GitHub",
    "LinkedIn",
    "Midjourney",
    "Microsoft",
    "Netflix",
    "PayPal",
    "Perplexity",
    "Poe",
    "Reddit",
    "Spotify",
    "Steam",
    "Telegram",
    "TikTok",
    "Twitter/X",
])

# 多对多关联表
account_platforms = Table(
    "account_platforms",
    Base.metadata,
    Column("account_id", Integer, ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True),
    Column("platform_id", Integer, ForeignKey("platforms.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, default=lambda: datetime.now(timezone.utc)),
)


class Platform(Base):
    __tablename__ = "platforms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    accounts = relationship("Account", secondary=account_platforms, back_populates="platforms")


def seed_platforms(db):
    """启动时将代码维护的平台列表 seed 到数据库"""
    for name in PLATFORM_LIST:
        if not db.query(Platform).filter(Platform.name == name).first():
            db.add(Platform(name=name))
    db.commit()
