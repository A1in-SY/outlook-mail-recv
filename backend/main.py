import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.core.database import engine, Base, SessionLocal
from app.core.auth import verify_token
from app.core.migrate import run_migrations
from app.models.platform import seed_platforms
from app.routes import accounts, emails, platforms

Base.metadata.create_all(bind=engine)
run_migrations(engine)

# Seed platform list
db = SessionLocal()
try:
    seed_platforms(db)
finally:
    db.close()

app = FastAPI(title="Outlook Mail Receiver")

app.include_router(accounts.router)
app.include_router(emails.router)
app.include_router(platforms.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/auth/verify")
def auth_verify(_: str = Depends(verify_token)):
    return {"ok": True}


# Serve frontend static files in production
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = os.path.join(static_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(static_dir, "index.html"))
