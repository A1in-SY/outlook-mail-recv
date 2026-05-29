import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.account import Account  # noqa: F401
from app.models.email import Email  # noqa: F401
from app.models.platform import PLATFORM_LIST, Platform, seed_platforms


class PlatformTests(unittest.TestCase):
    def test_platform_list_includes_kiro(self):
        self.assertIn("Kiro", PLATFORM_LIST)

    def test_seed_platforms_inserts_kiro(self):
        engine = create_engine("sqlite:///:memory:")
        Platform.__table__.create(engine)
        Session = sessionmaker(bind=engine)
        db = Session()
        try:
            seed_platforms(db)
            platform = db.query(Platform).filter(Platform.name == "Kiro").first()
            self.assertIsNotNone(platform)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
