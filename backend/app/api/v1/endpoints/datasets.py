import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.dataset import Dataset
from app.schemas.dataset import (
    DatasetUploadResponse,
    DatasetProfileResponse,
    DatasetErrorResponse,
)
from app.services.dataset_service import dataset_service, DatasetNotFoundError
from app.services.profiling_service import profiling_service
from app.services.file_validator import (
    EmptyFileError,
    FileSizeExceededError,
    InvalidFileFormatError,
)

router = APIRouter()


@router.post(
    "/datasets/upload",
    response_model=DatasetUploadResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": DatasetErrorResponse, "description": "Invalid file format or empty file"},
        413: {"model": DatasetErrorResponse, "description": "File size exceeds allowed limit"},
        500: {"model": DatasetErrorResponse, "description": "Server or database error"},
    },
    summary="Upload CSV Dataset",
    description="Uploads a CSV file, enforces security/size constraints, validates structure, stores it on disk, and records metadata in PostgreSQL.",
)
async def upload_dataset(
    file: UploadFile = File(..., description="CSV dataset file to upload"),
    db: Session = Depends(get_db),
) -> DatasetUploadResponse:
    """Validate, stream, store uploaded CSV dataset, and insert metadata into database."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename.",
        )

    try:
        # Step 1: Validate file, stream to disk, and compute row/col counts
        result = dataset_service.process_csv_upload(
            file_stream=file.file,
            original_filename=file.filename,
            content_type=file.content_type,
        )

        # Step 2: Insert dataset metadata row into PostgreSQL
        stored_filename = f"{result.dataset_id}_{result.filename}"
        dataset_record = Dataset(
            id=uuid.UUID(result.dataset_id),
            filename=stored_filename,
            original_filename=file.filename,
            size_bytes=result.size_bytes,
            content_type=result.content_type,
            row_count=result.row_count,
            column_count=result.column_count,
        )
        db.add(dataset_record)
        db.commit()
        db.refresh(dataset_record)

        return result

    except (EmptyFileError, InvalidFileFormatError) as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )

    except FileSizeExceededError as err:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=str(err),
        )

    except Exception as err:
        db.rollback()
        # Clean up saved file from disk if record persistence failed
        if "result" in locals() and hasattr(result, "dataset_id"):
            try:
                disk_file = dataset_service.upload_dir / f"{result.dataset_id}_{result.filename}"
                if disk_file.exists():
                    disk_file.unlink()
            except OSError:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during upload: {str(err)}",
        )


@router.get(
    "/datasets/{dataset_id}/profile",
    response_model=DatasetProfileResponse,
    status_code=status.HTTP_200_OK,
    responses={
        404: {"model": DatasetErrorResponse, "description": "Dataset not found"},
        500: {"model": DatasetErrorResponse, "description": "Profiling analysis failure"},
    },
    summary="Get Dataset Profile",
    description="Generates and returns structural, type inference, and statistical profiling data for a dataset.",
)
def get_dataset_profile(
    dataset_id: str,
    db: Session = Depends(get_db),
) -> DatasetProfileResponse:
    """Look up dataset in the database, locate file on disk, and return profiling analysis."""
    try:
        dataset_uuid = uuid.UUID(dataset_id)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with ID '{dataset_id}' not found.",
        )

    # 1. Query database first (instead of blind filesystem scanning)
    dataset = db.query(Dataset).filter(Dataset.id == dataset_uuid).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with ID '{dataset_id}' not found.",
        )

    # 2. Locate file on disk using stored filename
    file_path = dataset_service.upload_dir / dataset.filename
    if not file_path.is_file():
        fallback_path = dataset_service.upload_dir / f"{dataset_id}_{dataset.filename}"
        if fallback_path.is_file():
            file_path = fallback_path
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset file for ID '{dataset_id}' not found on disk.",
            )

    # 3. Generate profiling analysis
    try:
        return profiling_service.generate_profile(
            dataset_id=str(dataset.id),
            file_path=file_path,
            original_filename=dataset.original_filename,
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during profiling: {str(err)}",
        )
