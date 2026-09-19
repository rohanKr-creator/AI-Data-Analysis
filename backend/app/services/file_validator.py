import io
import os
from pathlib import Path
from typing import BinaryIO, Optional, Tuple, Union
import numpy as np
import pandas as pd


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


# Allowed extensions and standard CSV / Excel MIME types
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
ALLOWED_CONTENT_TYPES = {
    # CSV types
    "text/csv",
    "text/plain",
    "application/csv",
    # Excel XLSX types
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/wps-office.xlsx",
    # Excel XLS and legacy types
    "application/vnd.ms-excel",
    "application/msexcel",
    "application/x-msexcel",
    "application/x-ms-excel",
    "application/x-excel",
    "application/excel",
    "application/xls",
    "application/x-xls",
    # Common container fallbacks
    "application/octet-stream",
    "application/zip",
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
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise InvalidFileFormatError(
            f"Unsupported file extension '{ext}'. Allowed extensions: {allowed}"
        )

    if content_type:
        base_mime = content_type.split(";")[0].strip().lower()
        if base_mime not in ALLOWED_CONTENT_TYPES:
            raise InvalidFileFormatError(
                f"Unsupported content type '{content_type}'. Must be a valid CSV or Excel file."
            )

    return clean_name


EXCEL_NA_VALUES = [
    "",
    " ",
    "#N/A",
    "#N/A N/A",
    "#NA",
    "-1.#IND",
    "-1.#QNAN",
    "-NaN",
    "-nan",
    "1.#IND",
    "1.#QNAN",
    "<NA>",
    "N/A",
    "NA",
    "NULL",
    "NaN",
    "None",
    "n/a",
    "nan",
    "null",
    "#VALUE!",
    "#REF!",
    "#DIV/0!",
    "#NUM!",
    "#NAME?",
    "#NULL!",
]


def read_file_to_dataframe(
    source: Union[Path, str, bytes, io.BytesIO, BinaryIO],
    filename: Optional[str] = None,
) -> pd.DataFrame:
    """
    Read a CSV or Excel (.xlsx, .xls) dataset into a pandas DataFrame.

    Edge Cases Handled:
    - Multi-sheet Excel files: Defaults to the first sheet (sheet_name=0).
    - Null & empty value handling: Treats empty strings, whitespace, and standard Excel formula
      error tokens (#N/A, #VALUE!, #REF!, #DIV/0!, etc.) as NaN.
    - Formatting artifacts: Drops completely blank rows (df.dropna(how='all')) and
      unnamed columns that contain only NaN values.
    - Format detection: Identifies format from filename or Path suffix.

    Raises:
        InvalidFileFormatError: If file is corrupted or unparseable.
        EmptyFileError: If file contains no data rows.
    """
    # 1. Determine target filename / extension
    name = filename
    if not name and isinstance(source, (str, Path)):
        name = str(source)

    ext = Path(name).suffix.lower() if name else ""

    # 2. Normalize input source to buffer or Path
    if isinstance(source, bytes):
        buffer_or_path: Union[io.BytesIO, Path] = io.BytesIO(source)
    elif isinstance(source, (io.BytesIO, io.StringIO)):
        buffer_or_path = source
    elif isinstance(source, (str, Path)):
        buffer_or_path = Path(source)
    elif hasattr(source, "read"):
        content = source.read()
        buffer_or_path = io.BytesIO(content) if isinstance(content, bytes) else io.StringIO(content)
    else:
        raise InvalidFileFormatError(f"Unsupported source type for dataset: {type(source)}")

    # 3. Parse by format
    try:
        if ext in {".xlsx", ".xls"}:
            engine = "openpyxl" if ext == ".xlsx" else "xlrd"
            df = pd.read_excel(
                buffer_or_path,
                sheet_name=0,
                engine=engine,
                na_values=EXCEL_NA_VALUES,
                keep_default_na=True,
            )
            # Edge case 1: Trim trailing completely blank rows (common Excel artifact from formatted empty rows)
            last_valid_idx = df.last_valid_index()
            if last_valid_idx is not None:
                df = df.loc[:last_valid_idx]
            else:
                df = df.iloc[0:0]

            # Edge case 2: Drop unnamed columns where all elements are NaN
            unnamed_empty_cols = [
                c for c in df.columns
                if str(c).startswith("Unnamed:") and df[c].isna().all()
            ]
            if unnamed_empty_cols:
                df = df.drop(columns=unnamed_empty_cols)

            # Edge case 3: Normalize whitespace-only or empty strings to NaN in string/object columns
            for col in df.select_dtypes(include=["object", "string", "str"]):
                df[col] = df[col].apply(
                    lambda x: np.nan if isinstance(x, str) and x.strip() == "" else x
                )
        else:
            # CSV parsing
            df = pd.read_csv(buffer_or_path)

    except (InvalidFileFormatError, EmptyFileError):
        raise
    except Exception as err:
        format_name = "Excel" if ext in {".xlsx", ".xls"} else "CSV"
        raise InvalidFileFormatError(
            f"File could not be parsed as a valid {format_name} dataset: {str(err)}"
        ) from err

    if df.empty or len(df) == 0:
        raise EmptyFileError("Dataset file contains no data rows.")

    return df


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
