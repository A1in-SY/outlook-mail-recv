from pydantic import BaseModel


class EmailOut(BaseModel):
    id: int
    account_id: int
    folder: str
    source_protocol: str
    external_id: str
    sender: str
    subject: str
    received_ts_ms: int
    body: str
    body_html: str
    body_fetched: bool

    model_config = {"from_attributes": True}
