import os
from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./data/outlook_mail.db")


def ensure_sqlite_directory(database_url: str):
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite") or not url.database or url.database == ":memory:":
        return
    directory = os.path.dirname(os.path.abspath(url.database))
    if directory:
        os.makedirs(directory, exist_ok=True)


ensure_sqlite_directory(DATABASE_URL)
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
