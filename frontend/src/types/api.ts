export interface DatasetUploadResponse {
  dataset_id: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  row_count: number | null;
  column_count: number | null;
  created_at: string;
  message: string;
}

export interface ColumnSummary {
  name: string;
  data_type: string;
  null_count: number;
  null_percentage: number;
}

export interface NumericColumnStats {
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
}

export interface DatasetProfileResponse {
  dataset_id: string;
  filename: string;
  row_count: number;
  column_count: number;
  columns: ColumnSummary[];
  numeric_summary: Record<string, NumericColumnStats>;
  preview: Record<string, unknown>[];
}

export type AnalyticsOperation =
  | 'mean'
  | 'sum'
  | 'min'
  | 'max'
  | 'count'
  | 'median'
  | 'std'
  | 'value_counts';

export interface AnalyticsRequest {
  column: string;
  operation: AnalyticsOperation;
  group_by?: string | null;
}

export interface AnalyticsResponse {
  dataset_id: string;
  operation: string;
  column: string;
  group_by: string | null;
  columns: string[];
  result: unknown;
  row_count: number;
  message: string;
}
