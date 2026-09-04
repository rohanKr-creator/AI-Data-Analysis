from fastapi import APIRouter, File, HTTPException, UploadFile, status
from app.schemas.dataset import DatasetUploadResponse, DatasetErrorResponse
from app.services.dataset_service import dataset_service
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
    },
    summary="Upload CSV Dataset",
    description="Uploads a CSV file, enforces security/size constraints, validates structure, and stores it.",
)
async def upload_dataset(
    file: UploadFile = File(..., description="CSV dataset file to upload"),
) -> DatasetUploadResponse:
    """Validate, stream, and store uploaded CSV dataset."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename.",
        )

    try:
        result = dataset_service.process_csv_upload(
            file_stream=file.file,
            original_filename=file.filename,
            content_type=file.content_type,
        )
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during upload: {str(err)}",
        )
