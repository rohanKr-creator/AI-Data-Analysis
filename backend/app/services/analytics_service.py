import io
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import numpy as np
import pandas as pd
from app.schemas.analytics import AnalyticsRequest, AnalyticsResponse
from app.services.dataset_service import DatasetNotFoundError, dataset_service
from app.services.storage_service import storage_service, StorageFileNotFoundError


class AnalyticsValidationError(Exception):
    """Base exception for analytics validation errors resulting in HTTP 400."""
    pass


class ColumnNotFoundError(AnalyticsValidationError):
    """Raised when a requested column does not exist in the dataset."""
    pass


class InvalidOperationError(AnalyticsValidationError):
    """Raised when an unsupported operation is requested."""
    pass


class IncompatibleTypeError(AnalyticsValidationError):
    """Raised when an operation cannot be applied to a column's data type."""
    pass


class AnalyticsService:
    """Service dedicated to running deterministic analytical operations on datasets."""

    SUPPORTED_OPERATIONS = {
        "mean",
        "sum",
        "min",
        "max",
        "count",
        "median",
        "std",
        "value_counts",
    }

    NUMERIC_ONLY_OPERATIONS = {"mean", "sum", "median", "std"}

    def _infer_type(self, series: pd.Series) -> str:
        """Infer high-level human-readable data type for a series."""
        if pd.api.types.is_bool_dtype(series):
            return "boolean"
        elif pd.api.types.is_integer_dtype(series):
            return "integer"
        elif pd.api.types.is_float_dtype(series):
            return "float"
        elif pd.api.types.is_datetime64_any_dtype(series):
            return "datetime"
        return "string"

    def _clean_value(self, val: Any) -> Any:
        """Convert scalar value to JSON-safe Python native type."""
        if pd.isna(val) or (isinstance(val, (float, np.floating)) and np.isinf(val)):
            return None
        if isinstance(val, (int, np.integer)):
            return int(val)
        if isinstance(val, (float, np.floating)):
            return round(float(val), 4)
        if isinstance(val, (bool, np.bool_)):
            return bool(val)
        return str(val)

    def validate_request(
        self,
        df: pd.DataFrame,
        request: AnalyticsRequest,
    ) -> tuple[str, str, Optional[str]]:
        """
        Validate operation validity, column existence, and data type compatibility.

        Returns:
            Tuple of (operation, column, group_by).

        Raises:
            InvalidOperationError: If operation is not supported.
            ColumnNotFoundError: If column or group_by is not found in dataset.
            IncompatibleTypeError: If operation is incompatible with column type.
        """
        operation = request.operation.strip().lower()
        if operation not in self.SUPPORTED_OPERATIONS:
            raise InvalidOperationError(
                f"Unsupported operation '{request.operation}'. "
                f"Supported operations are: {', '.join(sorted(self.SUPPORTED_OPERATIONS))}."
            )

        # 1. Validate primary column existence
        available_columns = list(df.columns)
        if request.column not in df.columns:
            raise ColumnNotFoundError(
                f"Column '{request.column}' not found in dataset. "
                f"Available columns are: {available_columns}."
            )

        # 2. Validate group_by column existence if supplied
        group_by = request.group_by.strip() if request.group_by else None
        if group_by:
            if group_by not in df.columns:
                raise ColumnNotFoundError(
                    f"Group-by column '{request.group_by}' not found in dataset. "
                    f"Available columns are: {available_columns}."
                )

        # 3. Validate data type compatibility
        target_series = df[request.column]
        col_type = self._infer_type(target_series)

        if operation in self.NUMERIC_ONLY_OPERATIONS:
            is_numeric = (
                pd.api.types.is_numeric_dtype(target_series)
                and not pd.api.types.is_bool_dtype(target_series)
            )
            if not is_numeric:
                raise IncompatibleTypeError(
                    f"Operation '{operation}' requires a numeric column, but column '{request.column}' "
                    f"has inferred type '{col_type}'. Supported types for '{operation}' are: integer, float."
                )

        return operation, request.column, group_by

    def run_analysis(
        self,
        dataset_id: str,
        file_path: Optional[Union[Path, str]] = None,
        request: Optional[AnalyticsRequest] = None,
        storage_path: Optional[str] = None,
    ) -> AnalyticsResponse:
        """
        Load dataset from Supabase Storage (or disk), validate analysis parameters,
        and compute results using Pandas.

        Args:
            dataset_id: Identifier of the dataset.
            file_path: Optional path to local dataset CSV file.
            request: AnalyticsRequest with column, operation, and optional group_by.
            storage_path: Optional storage path in Supabase Storage bucket.

        Returns:
            AnalyticsResponse with computed values and metadata.
        """
        if request is None and isinstance(file_path, AnalyticsRequest):
            request = file_path
            file_path = None

        if request is None:
            raise AnalyticsValidationError("Analytics request payload is required.")

        if file_path is not None and isinstance(file_path, Path) and file_path.is_file():
            df = pd.read_csv(file_path)
        else:
            if isinstance(file_path, str) and not storage_path:
                storage_path = file_path

            if not storage_path:
                resolved_path, _ = dataset_service.get_dataset_file(dataset_id)
                storage_path = resolved_path

            try:
                file_bytes = storage_service.download_file(storage_path)
            except StorageFileNotFoundError as err:
                raise DatasetNotFoundError(str(err)) from err

            df = pd.read_csv(io.BytesIO(file_bytes))

        # Validate inputs against loaded data
        operation, column, group_by = self.validate_request(df, request)

        columns_involved = [column]
        if group_by and group_by != column:
            columns_involved.append(group_by)

        # Branch 1: Grouped analysis
        if group_by:
            valid_df = df.dropna(subset=[group_by, column])
            row_count = int(len(valid_df))

            if operation == "value_counts":
                grouped_vc = valid_df.groupby(group_by)[column].value_counts()
                result_map: Dict[str, Dict[str, int]] = {}
                for (grp, val), count in grouped_vc.items():
                    grp_key = str(grp)
                    val_key = str(val)
                    if grp_key not in result_map:
                        result_map[grp_key] = {}
                    result_map[grp_key][val_key] = int(count)
                result: Any = result_map

            else:
                grouped = valid_df.groupby(group_by)[column]
                if operation == "mean":
                    res_series = grouped.mean()
                elif operation == "sum":
                    res_series = grouped.sum()
                elif operation == "min":
                    res_series = grouped.min()
                elif operation == "max":
                    res_series = grouped.max()
                elif operation == "count":
                    res_series = grouped.count()
                elif operation == "median":
                    res_series = grouped.median()
                elif operation == "std":
                    res_series = grouped.std()
                else:
                    raise InvalidOperationError(f"Unsupported grouped operation '{operation}'.")

                result = {str(k): self._clean_value(v) for k, v in res_series.items()}

        # Branch 2: Single column analysis
        else:
            valid_series = df[column].dropna()
            row_count = int(len(valid_series))

            if operation == "value_counts":
                vc = df[column].value_counts().head(20)
                result = {str(k): int(v) for k, v in vc.items()}

            elif operation == "count":
                # count returns the number of non-null observations
                result = int(df[column].count())

            elif operation == "mean":
                result = None if valid_series.empty else round(float(valid_series.mean()), 4)

            elif operation == "sum":
                if valid_series.empty:
                    result = 0
                else:
                    sum_val = valid_series.sum()
                    result = self._clean_value(sum_val)

            elif operation == "min":
                result = None if valid_series.empty else self._clean_value(valid_series.min())

            elif operation == "max":
                result = None if valid_series.empty else self._clean_value(valid_series.max())

            elif operation == "median":
                result = None if valid_series.empty else round(float(valid_series.median()), 4)

            elif operation == "std":
                if len(valid_series) <= 1:
                    result = None
                else:
                    std_val = valid_series.std()
                    result = None if pd.isna(std_val) else round(float(std_val), 4)

            else:
                raise InvalidOperationError(f"Unsupported operation '{operation}'.")

        return AnalyticsResponse(
            dataset_id=dataset_id,
            operation=operation,
            column=column,
            group_by=group_by,
            columns=columns_involved,
            result=result,
            row_count=row_count,
            message=f"Successfully computed '{operation}' for column '{column}'.",
        )


analytics_service = AnalyticsService()
