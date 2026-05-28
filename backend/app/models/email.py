from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base


class Email(Base):
    __tablename__ = "emails"
    __table_args__ = (
        UniqueConstraint("account_id", "folder", "source_protocol", "external_id", name="uq_emails_external_message"),
    )

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    folder = Column(String, nullable=False)  # "INBOX" or "Junk"
    source_protocol = Column(String, nullable=False, default="imap")
    external_id = Column(String, nullable=False, default="")
    sender = Column(String, default="")
    subject = Column(String, default="")
    received_ts_ms = Column(Integer, nullable=False, default=0)
    body = Column(Text, default="")
    body_html = Column(Text, default="")
    body_fetched = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    account = relationship("Account", back_populates="emails")


Index(
    "ix_emails_list_sort",
    Email.account_id,
    Email.folder,
    Email.source_protocol,
    Email.received_ts_ms.desc(),
    Email.id.desc(),
)
