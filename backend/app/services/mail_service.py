import imaplib
import email
from email.header import decode_header
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
import re
import requests
import chardet
from bs4 import BeautifulSoup
from urllib.parse import quote


TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
TOKEN_SCOPES = {
    "imap": "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
    "graph": "https://graph.microsoft.com/.default",
}
GRAPH_BASE = "https://graph.microsoft.com/v1.0"
GRAPH_FOLDER_IDS = {
    "INBOX": "inbox",
    "Junk": "junkemail",
}


def get_access_token(client_id: str, refresh_token: str, protocol: str | None = None) -> tuple:
    """Returns (access_token, new_refresh_token, rt_expires_in_seconds)."""
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
    }
    if protocol in TOKEN_SCOPES:
        data["scope"] = TOKEN_SCOPES[protocol]
    resp = requests.post(TOKEN_URL, data=data, timeout=30)
    if resp.status_code != 200:
        raise Exception(f"Token refresh failed: {resp.status_code} - {resp.text}")
    body = resp.json()
    token = body.get("access_token")
    if not token:
        raise Exception("No access_token in response")
    new_rt = body.get("refresh_token", refresh_token)
    rt_expires_in = body.get("refresh_token_expires_in")
    return token, new_rt, rt_expires_in


def decode_mime_words(s: str) -> str:
    decoded = decode_header(s)
    parts = []
    for t in decoded:
        if isinstance(t[0], bytes):
            parts.append(t[0].decode(t[1] or "utf-8", errors="ignore"))
        else:
            parts.append(str(t[0]))
    return "".join(parts)


def safe_decode(byte_content: bytes) -> str:
    result = chardet.detect(byte_content)
    encoding = result.get("encoding") or "utf-8"
    return byte_content.decode(encoding, errors="ignore")


def strip_html(content: str) -> str:
    return BeautifulSoup(content, "html.parser").get_text()


def remove_extra_blank_lines(text: str) -> str:
    lines = text.splitlines()
    return "\n".join(line for line in lines if line.strip())


def extract_body(msg) -> tuple:
    """Returns (plain_text, html_content). html_content is used for rendering."""
    text_parts = []
    html_parts = []

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            disposition = str(part.get("Content-Disposition") or "")
            if "attachment" in disposition:
                continue
            payload = part.get_payload(decode=True)
            if payload is None:
                continue
            decoded = safe_decode(payload)
            if content_type == "text/plain":
                text_parts.append(decoded)
            elif content_type == "text/html":
                html_parts.append(decoded)
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            decoded = safe_decode(payload)
            if msg.get_content_type() == "text/plain":
                text_parts.append(decoded)
            elif msg.get_content_type() == "text/html":
                html_parts.append(decoded)

    plain = remove_extra_blank_lines("\n".join(text_parts)).strip()
    html = "\n".join(html_parts).strip()

    # Fallback: if no plain text, extract from HTML
    if not plain and html:
        plain = remove_extra_blank_lines(strip_html(html)).strip()

    return plain, html


def _logout(mail):
    try:
        mail.logout()
    except Exception:
        pass


def _imap_connect(email_address: str, client_id: str, refresh_token: str):
    access_token, new_refresh_token, rt_expires_in = get_access_token(client_id, refresh_token, "imap")
    auth_string = f"user={email_address}\x01auth=Bearer {access_token}\x01\x01"

    mail = imaplib.IMAP4_SSL("outlook.office365.com")
    try:
        mail.authenticate("XOAUTH2", lambda x: auth_string.encode())
    except imaplib.IMAP4.error as e:
        _logout(mail)
        raise Exception(f"IMAP auth failed: {e}")
    return mail, new_refresh_token, rt_expires_in


def _select_imap_folder(mail, folder: str):
    status, _ = mail.select(folder, readonly=True)
    if status != "OK":
        raise Exception(f"Select folder '{folder}' failed: {status}")


def _extract_imap_uid(meta) -> str:
    if isinstance(meta, bytes):
        meta_text = meta.decode("ascii", errors="ignore")
    else:
        meta_text = str(meta)
    match = re.search(r"\bUID\s+(\d+)", meta_text, flags=re.IGNORECASE)
    return match.group(1) if match else ""


def _extract_imap_internaldate(meta) -> str:
    if isinstance(meta, bytes):
        meta_text = meta.decode("ascii", errors="ignore")
    else:
        meta_text = str(meta)
    match = re.search(r'\bINTERNALDATE\s+"([^"]+)"', meta_text, flags=re.IGNORECASE)
    return match.group(1) if match else ""


def _parse_datetime(value: str):
    if not value or not value.strip():
        return None
    text = value.strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        parsed = None
    if parsed is None:
        try:
            parsed = parsedate_to_datetime(text)
        except (TypeError, ValueError, IndexError, OverflowError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _parse_date_to_timestamp_ms(value: str) -> int | None:
    parsed = _parse_datetime(value)
    if parsed is None:
        return None
    return int(parsed.timestamp() * 1000)


def _message_received_ts_ms(value: str) -> int:
    received_ts_ms = _parse_date_to_timestamp_ms(value)
    return received_ts_ms if received_ts_ms is not None else 0


def _imap_received_ts_ms(meta, date_header: str) -> int:
    internaldate_ts = _parse_date_to_timestamp_ms(_extract_imap_internaldate(meta))
    if internaldate_ts is not None:
        return internaldate_ts
    date_header_ts = _parse_date_to_timestamp_ms(date_header)
    return date_header_ts if date_header_ts is not None else 0


def _chunks(items, size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def fetch_imap_email_list(
    email_address: str,
    client_id: str,
    refresh_token: str,
    folder: str = "INBOX",
    known_external_ids: set[str] | None = None,
) -> tuple:
    """Returns (email_metadata_list, remote_ids, new_refresh_token, rt_expires_in)."""
    mail, new_refresh_token, rt_expires_in = _imap_connect(email_address, client_id, refresh_token)
    try:
        _select_imap_folder(mail, folder)
        status, uid_data = mail.uid("search", None, "ALL")
        if status != "OK":
            raise Exception("Mail search failed")

        uids = uid_data[0].split() if uid_data and uid_data[0] else []
        remote_ids = [uid.decode("ascii") for uid in uids]
        results = []
        for uid_chunk in _chunks(uids, 50):
            uid_set = b",".join(uid_chunk).decode("ascii")
            status, msg_data = mail.uid("fetch", uid_set, "(UID INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
            if status != "OK":
                raise Exception(f"Mail header fetch failed for UIDs {uid_set}: {status}")
            for part in msg_data:
                if not isinstance(part, tuple):
                    continue
                external_id = _extract_imap_uid(part[0])
                if not external_id:
                    continue
                msg = email.message_from_bytes(part[1])
                sender_raw = msg.get("From", "")
                sender = decode_mime_words(sender_raw) if sender_raw else ""
                subject_raw = msg.get("Subject", "")
                subject = decode_mime_words(subject_raw) if subject_raw else ""
                results.append({
                    "external_id": external_id,
                    "sender": sender,
                    "subject": subject,
                    "received_ts_ms": _imap_received_ts_ms(part[0], msg.get("Date", "")),
                    "body": "",
                    "body_html": "",
                    "body_fetched": False,
                })
        return results, remote_ids, new_refresh_token, rt_expires_in
    finally:
        _logout(mail)


def fetch_imap_email_body(email_address: str, client_id: str, refresh_token: str, folder: str, external_id: str) -> tuple:
    """Returns (body_data, new_refresh_token, rt_expires_in)."""
    mail, new_refresh_token, rt_expires_in = _imap_connect(email_address, client_id, refresh_token)
    try:
        _select_imap_folder(mail, folder)
        status, msg_data = mail.uid("fetch", external_id, "(RFC822)")
        if status != "OK":
            raise Exception("Mail fetch failed")
        for part in msg_data:
            if not isinstance(part, tuple):
                continue
            msg = email.message_from_bytes(part[1])
            plain, html = extract_body(msg)
            return {"body": plain, "body_html": html, "body_fetched": True}, new_refresh_token, rt_expires_in
        raise Exception("Mail body not found")
    finally:
        _logout(mail)


def _graph_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Prefer": 'IdType="ImmutableId"',
    }


def _graph_get(url: str, access_token: str, params: dict | None = None) -> dict:
    resp = requests.get(url, headers=_graph_headers(access_token), params=params, timeout=30)
    if resp.status_code >= 400:
        raise Exception(f"Graph request failed: {resp.status_code} - {resp.text}")
    return resp.json()


def _graph_sender(message: dict) -> str:
    address = ((message.get("from") or {}).get("emailAddress") or {})
    name = address.get("name") or ""
    email_address = address.get("address") or ""
    if name and email_address:
        return f"{name} <{email_address}>"
    return name or email_address


def fetch_graph_email_list(
    email_address: str,
    client_id: str,
    refresh_token: str,
    folder: str = "INBOX",
    known_external_ids: set[str] | None = None,
) -> tuple:
    """Returns (email_metadata_list, remote_ids, new_refresh_token, rt_expires_in)."""
    access_token, new_refresh_token, rt_expires_in = get_access_token(client_id, refresh_token, "graph")
    folder_id = GRAPH_FOLDER_IDS.get(folder)
    if not folder_id:
        raise Exception(f"Unsupported Graph folder '{folder}'")

    url = f"{GRAPH_BASE}/me/mailFolders/{folder_id}/messages"
    params = {
        "$select": "id,from,subject,receivedDateTime",
        "$top": "100",
        "$orderby": "receivedDateTime desc",
    }
    results = []
    remote_ids = []
    while url:
        data = _graph_get(url, access_token, params=params)
        params = None
        for message in data.get("value", []):
            external_id = message.get("id") or ""
            if not external_id:
                continue
            remote_ids.append(external_id)
            results.append({
                "external_id": external_id,
                "sender": _graph_sender(message),
                "subject": message.get("subject") or "",
                "received_ts_ms": _message_received_ts_ms(message.get("receivedDateTime") or ""),
                "body": "",
                "body_html": "",
                "body_fetched": False,
            })
        url = data.get("@odata.nextLink")
    return results, remote_ids, new_refresh_token, rt_expires_in


def fetch_graph_email_body(email_address: str, client_id: str, refresh_token: str, folder: str, external_id: str) -> tuple:
    """Returns (body_data, new_refresh_token, rt_expires_in)."""
    access_token, new_refresh_token, rt_expires_in = get_access_token(client_id, refresh_token, "graph")
    message_id = quote(external_id, safe="")
    data = _graph_get(f"{GRAPH_BASE}/me/messages/{message_id}", access_token, params={"$select": "body"})
    body = data.get("body") or {}
    content = body.get("content") or ""
    content_type = (body.get("contentType") or "").lower()
    if content_type == "html":
        body_data = {
            "body": remove_extra_blank_lines(strip_html(content)).strip(),
            "body_html": content,
            "body_fetched": True,
        }
    else:
        body_data = {
            "body": content,
            "body_html": "",
            "body_fetched": True,
        }
    return body_data, new_refresh_token, rt_expires_in


def fetch_email_list(
    email_address: str,
    client_id: str,
    refresh_token: str,
    folder: str,
    protocol: str,
    known_external_ids: set[str] | None = None,
) -> tuple:
    if protocol == "graph":
        return fetch_graph_email_list(email_address, client_id, refresh_token, folder, known_external_ids)
    if protocol == "imap":
        return fetch_imap_email_list(email_address, client_id, refresh_token, folder, known_external_ids)
    raise Exception(f"Unsupported protocol '{protocol}'")


def fetch_email_body(email_address: str, client_id: str, refresh_token: str, folder: str, protocol: str, external_id: str) -> tuple:
    if protocol == "graph":
        return fetch_graph_email_body(email_address, client_id, refresh_token, folder, external_id)
    if protocol == "imap":
        return fetch_imap_email_body(email_address, client_id, refresh_token, folder, external_id)
    raise Exception(f"Unsupported protocol '{protocol}'")


def fetch_emails(email_address: str, client_id: str, refresh_token: str, folder: str = "INBOX") -> tuple:
    """Compatibility wrapper returning full IMAP messages."""
    access_token, new_refresh_token, rt_expires_in = get_access_token(client_id, refresh_token, "imap")
    auth_string = f"user={email_address}\x01auth=Bearer {access_token}\x01\x01"

    mail = imaplib.IMAP4_SSL("outlook.office365.com")
    try:
        mail.authenticate("XOAUTH2", lambda x: auth_string.encode())
    except imaplib.IMAP4.error as e:
        _logout(mail)
        raise Exception(f"IMAP auth failed: {e}")

    status, _ = mail.select(folder, readonly=True)
    if status != "OK":
        _logout(mail)
        raise Exception(f"Select folder '{folder}' failed: {status}")

    status, message_ids = mail.search(None, "ALL")
    if status != "OK":
        _logout(mail)
        raise Exception("Mail search failed")

    results = []
    for msg_id in message_ids[0].split():
        status, msg_data = mail.fetch(msg_id, "(RFC822)")
        if status != "OK":
            continue
        for part in msg_data:
            if not isinstance(part, tuple):
                continue
            msg = email.message_from_bytes(part[1])
            sender_raw = msg.get("From", "")
            sender = decode_mime_words(sender_raw) if sender_raw else ""
            subject_raw = msg.get("Subject", "")
            subject = decode_mime_words(subject_raw) if subject_raw else ""
            date = msg.get("Date", "")
            plain, html = extract_body(msg)
            results.append({
                "sender": sender,
                "subject": subject,
                "date": date,
                "body": plain,
                "body_html": html,
            })

    _logout(mail)
    return results, new_refresh_token, rt_expires_in
