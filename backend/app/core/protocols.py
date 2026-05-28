import json
from typing import Iterable

from fastapi import HTTPException

SUPPORTED_PROTOCOLS = ("imap", "graph")
DEFAULT_PROTOCOLS = ["imap"]
PROTOCOL_PRIORITY = ("graph", "imap")


def normalize_protocols(protocols: Iterable[str] | None) -> list[str]:
    if protocols is None:
        protocols = DEFAULT_PROTOCOLS

    normalized = []
    for protocol in protocols:
        value = str(protocol).strip().lower()
        if value not in SUPPORTED_PROTOCOLS:
            raise HTTPException(400, "Protocol must be imap or graph")
        if value not in normalized:
            normalized.append(value)

    if not normalized:
        raise HTTPException(400, "At least one protocol is required")
    return normalized


def protocols_to_json(protocols: Iterable[str] | None) -> str:
    return json.dumps(normalize_protocols(protocols))


def protocols_from_json(value) -> list[str]:
    if value is None:
        return DEFAULT_PROTOCOLS.copy()
    if isinstance(value, list):
        return normalize_protocols(value)
    try:
        loaded = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return DEFAULT_PROTOCOLS.copy()
    if not isinstance(loaded, list):
        return DEFAULT_PROTOCOLS.copy()
    return normalize_protocols(loaded)


def choose_protocol(protocols: Iterable[str] | None) -> str:
    enabled = protocols_from_json(protocols) if isinstance(protocols, str) else normalize_protocols(protocols)
    for protocol in PROTOCOL_PRIORITY:
        if protocol in enabled:
            return protocol
    raise HTTPException(400, "No supported protocol enabled")
