import io
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import numpy as np
import pandas as pd
from app.schemas.dataset import (
    ColumnSummary,
    DatasetProfileResponse,
    NumericColumnStats,
)
from app.services.dataset_service import dataset_service, DatasetNotFoundError
from app.services.storage_service import storage_service, StorageFileNotFoundError


class ProfilingService:
    """Service dedicated to statistical analysis and structural profiling of datasets."""

    def _infer_column_type(self, series: pd.Series) -> str:
        """
        Infer a human-readable, standardized data type for a Pandas series.
        
        Returns:
            One of: 'integer', 'float', 'boolean', 'datetime', 'string'
        """
        if pd.api.types.is_bool_dtype(series):
            return "boolean"
        elif pd.api.types.is_integer_dtype(series):
            return "integer"
        elif pd.api.types.is_float_dtype(series):
            return "float"
        elif pd.api.types.is_datetime64_any_dtype(series):
            return "datetime"
        else:
            # For object/string dtypes, test if non-null sample values parse cleanly as dates
            non_nulls = series.dropna()
            if not non_nulls.empty and len(non_nulls) > 0:
                sample = non_nulls.head(50)
                # Check for common date format delimiters before attempting parse
                if sample.astype(str).str.contains(r"[-/:]").all():
                    try:
                        pd.to_datetime(sample, errors="raise")
                        return "datetime"
                    except Exception:
                        pass
            return "string"

    def _clean_stat(self, val: Any) -> Optional[float]:
        """Convert NaN, infinite, or non-numeric values to None or rounded float."""
        if pd.isna(val) or np.isinf(val):
            return None
        return round(float(val), 4)

    def get_column_types(self, df: pd.DataFrame) -> Dict[str, str]:
        """
        Extract column names and their inferred data types from a DataFrame.
        Reuses _infer_column_type without code duplication.
        """
        return {str(col): self._infer_column_type(df[col]) for col in df.columns}

    def generate_profile(
        self,
        dataset_id: str,
        storage_path: Optional[str] = None,
        original_filename: Optional[str] = None,
        file_path: Optional[Union[Path, str]] = None,
    ) -> DatasetProfileResponse:
        """
        Generate a comprehensive profile of the specified dataset.
        
        Args:
            dataset_id: Unique dataset identifier.
            storage_path: Storage path/key within Supabase Storage bucket.
            original_filename: Original filename of the dataset.
            file_path: Optional local path for backward compatibility.
            
        Returns:
            DatasetProfileResponse containing structural and statistical properties.
            
        Raises:
            DatasetNotFoundError: If dataset does not exist in database or storage.
        """
        if file_path is not None and isinstance(file_path, Path) and file_path.is_file():
            df = pd.read_csv(file_path)
            original_filename = original_filename or file_path.name
        else:
            # If file_path was passed as a string storage path
            if isinstance(file_path, str) and not storage_path:
                storage_path = file_path

            if not storage_path or not original_filename:
                resolved_path, resolved_name = dataset_service.get_dataset_file(dataset_id)
                storage_path = storage_path or resolved_path
                original_filename = original_filename or resolved_name

            try:
                file_bytes = storage_service.download_file(storage_path)
            except StorageFileNotFoundError as err:
                raise DatasetNotFoundError(str(err)) from err

            df = pd.read_csv(io.BytesIO(file_bytes))

        row_count = int(len(df))
        column_count = int(len(df.columns))

        # 1. Per-column summary (types and nulls)
        columns: List[ColumnSummary] = []
        for col in df.columns:
            null_count = int(df[col].isna().sum())
            null_pct = round(float((null_count / row_count) * 100), 2) if row_count > 0 else 0.0
            data_type = self._infer_column_type(df[col])

            columns.append(
                ColumnSummary(
                    name=str(col),
                    data_type=data_type,
                    null_count=null_count,
                    null_percentage=null_pct,
                )
            )

        # 2. Numeric summary statistics (mean, std, min, max)
        numeric_summary: Dict[str, NumericColumnStats] = {}
        numeric_cols = df.select_dtypes(include=["number"]).columns

        for col in numeric_cols:
            col_series = df[col]
            numeric_summary[str(col)] = NumericColumnStats(
                mean=self._clean_stat(col_series.mean()),
                std=self._clean_stat(col_series.std()),
                min=self._clean_stat(col_series.min()),
                max=self._clean_stat(col_series.max()),
            )

        # 3. Preview first 5 rows (safely handling nulls for JSON)
        preview_df = df.head(5).copy()
        preview_records = (
            preview_df.astype(object)
            .where(pd.notnull(preview_df), None)
            .to_dict(orient="records")
        )

        return DatasetProfileResponse(
            dataset_id=dataset_id,
            filename=original_filename,
            row_count=row_count,
            column_count=column_count,
            columns=columns,
            numeric_summary=numeric_summary,
            preview=preview_records,
        )


profiling_service = ProfilingService()
