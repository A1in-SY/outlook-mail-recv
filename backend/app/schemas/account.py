from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional, List

from app.core.protocols import DEFAULT_PROTOCOLS, normalize_protocols, protocols_from_json


class PlatformOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class AccountCreate(BaseModel):
    email: str
    password: str
    client_id: str
    refresh_token: str
    enabled_protocols: List[str] = DEFAULT_PROTOCOLS.copy()

    @field_validator("enabled_protocols", mode="before")
    @classmethod
    def validate_enabled_protocols(cls, value):
        return normalize_protocols(value)


class AccountUpdate(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    client_id: Optional[str] = None
    refresh_token: Optional[str] = None
    enabled_protocols: Optional[List[str]] = None

    @field_validator("enabled_protocols", mode="before")
    @classmethod
    def validate_enabled_protocols(cls, value):
        if value is None:
            return value
        return normalize_protocols(value)


class AccountImportRequest(BaseModel):
    lines: List[str]
    separator: str = "----"
    enabled_protocols: List[str] = DEFAULT_PROTOCOLS.copy()

    @field_validator("separator")
    @classmethod
    def validate_separator(cls, value):
        if not value or not value.strip():
            raise HTTPException(400, "Separator cannot be empty")
        return value

    @field_validator("enabled_protocols", mode="before")
    @classmethod
    def validate_enabled_protocols(cls, value):
        return normalize_protocols(value)


class AccountImportTestRequest(BaseModel):
    line: str
    separator: str = "----"
    enabled_protocols: List[str] = DEFAULT_PROTOCOLS.copy()

    @field_validator("separator")
    @classmethod
    def validate_separator(cls, value):
        if not value or not value.strip():
            raise HTTPException(400, "Separator cannot be empty")
        return value

    @field_validator("enabled_protocols", mode="before")
    @classmethod
    def validate_enabled_protocols(cls, value):
        return normalize_protocols(value)


class AccountOut(BaseModel):
    id: int
    email: str
    password: str
    client_id: str
    refresh_token: str
    enabled_protocols: List[str] = DEFAULT_PROTOCOLS.copy()
    rt_expires_at: Optional[datetime] = None
    platforms: List[PlatformOut] = []

    @field_validator("enabled_protocols", mode="before")
    @classmethod
    def parse_enabled_protocols(cls, value):
        return protocols_from_json(value)

    model_config = {"from_attributes": True}
