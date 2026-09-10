import os
from pathlib import Path
from typing import BinaryIO, Tuple


class DatasetValidationError(Exception):
    """Base exception for dataset validation failures."""
    pass


class FileSizeExceededError(DatasetValidationError):
    """Raised when uploaded file exceeds maximum allowed bytes."""
    pass


class InvalidFileFormatError(DatasetValidationError):
    """Raised when file extension or content type is unsupported."""
    pass


class EmptyFileError(DatasetValidationError):
    """Raised when uploaded file is empty (0 bytes)."""
    pass


# Allowed extensions and standard CSV MIME types
ALLOWED_EXTENSIONS = {".csv"}
ALLOWED_CONTENT_TYPES = {
    "text/csv",
    "text/plain",
    "application/csv",
    "application/vnd.ms-excel",
    "application/octet-stream",  # Fallback for some Windows browsers
}

CHUNK_SIZE = 1024 * 64  # 64 KB chunk size for streaming


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal vulnerabilities."""
    base_name = os.path.basename(filename)
    # Remove null bytes and path separators
    clean_name = base_name.replace("\x00", "").replace("/", "").replace("\\", "").strip()
    return clean_name or "dataset.csv"


def validate_file_metadata(filename: str, content_type: str | None) -> str:
    """
    Validate filename extension and content type.
    
    Returns:
        Clean, sanitized filename.
    Raises:
        InvalidFileFormatError if validation fails.
    """
    clean_name = sanitize_filename(filename)
    ext = Path(clean_name).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(ALLOWED_EXTENSIONS)
        raise InvalidFileFormatError(
            f"Unsupported file extension '{ext}'. Allowed extensions: {allowed}"
        )

    if content_type:
        base_mime = content_type.split(";")[0].strip().lower()
        if base_mime not in ALLOWED_CONTENT_TYPES:
            raise InvalidFileFormatError(
                f"Unsupported content type '{content_type}'. Must be a valid CSV file."
            )

    return clean_name


def stream_validate_and_save(
    file_stream: BinaryIO,
    destination_path: Path,
    max_size_bytes: int,
) -> Tuple[int, Path]:
    """
    Stream file bytes from upload directly to destination disk path.
    Enforces maximum size limits during streaming to prevent RAM exhaustion.
    
    Returns:
        Tuple of (total_bytes_written, saved_file_path)
    Raises:
        FileSizeExceededError: If stream exceeds max_size_bytes.
        EmptyFileError: If file contains 0 bytes.
    """
    total_bytes = 0

    try:
        with open(destination_path, "wb") as buffer:
            while True:
                chunk = file_stream.read(CHUNK_SIZE)
                if not chunk:
                    break

                total_bytes += len(chunk)
                if total_bytes > max_size_bytes:
                    # Clean up partial file on failure
                    buffer.close()
                    if destination_path.exists():
                        destination_path.unlink()
                    raise FileSizeExceededError(
                        f"File size exceeds maximum allowed limit of {max_size_bytes} bytes ({max_size_bytes // (1024 * 1024)} MB)."
                    )

                buffer.write(chunk)

        if total_bytes == 0:
            if destination_path.exists():
                destination_path.unlink()
            raise EmptyFileError("Uploaded file is empty (0 bytes).")

        return total_bytes, destination_path

    except Exception:
        # Guarantee cleanup on any unexpected failure
        if destination_path.exists():
            try:
                destination_path.unlink()
            except OSError:
                pass
        raise


def read_and_validate_stream(
    file_stream: BinaryIO,
    max_size_bytes: int,
) -> bytes:
    """
    Read file stream into memory while strictly enforcing maximum size limits.

    Returns:
        Validated file content as bytes.
    Raises:
        FileSizeExceededError: If stream exceeds max_size_bytes.
        EmptyFileError: If file contains 0 bytes.
    """
    content = bytearray()
    total_bytes = 0

    while True:
        chunk = file_stream.read(CHUNK_SIZE)
        if not chunk:
            break
        total_bytes += len(chunk)
        if total_bytes > max_size_bytes:
            raise FileSizeExceededError(
                f"File size exceeds maximum allowed limit of {max_size_bytes} bytes ({max_size_bytes // (1024 * 1024)} MB)."
            )
        content.extend(chunk)

    if total_bytes == 0:
        raise EmptyFileError("Uploaded file is empty (0 bytes).")

    return bytes(content)
