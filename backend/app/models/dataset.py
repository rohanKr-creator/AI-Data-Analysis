import uuid
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Dataset(Base):
    """SQLAlchemy model representing uploaded dataset metadata."""

    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
        doc="Unique identifier (UUID) for the dataset",
    )
    filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        doc="Stored sanitized filename on disk",
    )
    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        doc="Original filename uploaded by the user",
    )
    size_bytes: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        doc="Total file size in bytes",
    )
    content_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="text/csv",
        doc="MIME content type of the uploaded file",
    )
    row_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        doc="Total number of data rows in the dataset",
    )
    column_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        doc="Total number of columns in the dataset",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="UTC timestamp when the dataset was uploaded",
    )
