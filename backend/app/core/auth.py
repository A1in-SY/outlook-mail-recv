from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.config import get_secret_key

security = HTTPBearer()


def verify_token(cred: HTTPAuthorizationCredentials = Security(security)) -> str:
    if cred.credentials != get_secret_key():
        raise HTTPException(status_code=403, detail="Invalid secret key")
    return cred.credentials
