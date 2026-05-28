import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import Base, SessionLocal, engine
from app.core.migrate import run_migrations
from app.core.protocols import protocols_to_json
from app.models.account import Account
from app.models.email import Email  # noqa: F401


def main():
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    db = SessionLocal()
    try:
        value = protocols_to_json(["imap"])
        accounts = db.query(Account).all()
        updated = 0
        for account in accounts:
            if account.enabled_protocols != value:
                account.enabled_protocols = value
                updated += 1
        db.commit()
        print(f"Backfilled {updated} accounts to enabled_protocols={value}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
