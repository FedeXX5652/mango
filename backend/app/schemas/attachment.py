import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transaction_id: uuid.UUID
    filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime
