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
  unique_count?: number;
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
  | 'value_counts'
  | 'histogram';

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

export interface UserProfileResponse {
  user_id: string;
  email: string | null;
  role?: string | null;
  tier?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface UsageMetric {
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  display_name: string;
}

export interface UserUsageResponse {
  user_id: string;
  tier: 'free' | 'pro' | string;
  usage: {
    upload: UsageMetric;
    ask: UsageMetric;
    [key: string]: UsageMetric;
  };
}

export interface DatasetListItem {
  id: string;
  filename: string;
  row_count: number | null;
  column_count: number | null;
  size_bytes: number;
  created_at: string;
}

export interface AskQuestionResponse {
  question: string;
  answer: string;
  operation_used?: string | null;
  column_used?: string | null;
  group_by?: string | null;
  result?: unknown;
  row_count?: number | null;
  explanation?: string;
  operation?: string | null;
  column?: string | null;
  calculation_result?: unknown;
  dataset_id?: string;
  can_answer?: boolean;
}

