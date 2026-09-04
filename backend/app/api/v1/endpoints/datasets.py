from fastapi import APIRouter, File, HTTPException, UploadFile, status
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
def get_dataset_profile(dataset_id: str) -> DatasetProfileResponse:
    """Generate and return dataset profile including types, nulls, and numeric statistics."""
    try:
        return profiling_service.generate_profile(dataset_id)
    except DatasetNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during profiling: {str(err)}",
        )

