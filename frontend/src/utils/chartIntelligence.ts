import type {
  ColumnSummary,
  DatasetProfileResponse,
  AnalyticsOperation,
} from '../types/api';

export interface ChartRecommendation {
  id: string;
  perspective: 'grouped_metric' | 'category_breakdown' | 'numeric_distribution';
  title: string;
  subtitle: string;
  chartType: 'bar' | 'area' | 'line' | 'pie';
  metricCol?: string;
  dimensionCol?: string;
  operation: AnalyticsOperation;
  aggregation?: 'sum' | 'mean';
  description: string;
}

// Regex patterns to identify identifiers/keys
const ID_NAME_PATTERNS = [
  /(?:^|[_\s-])(id|uuid|guid|pk|key|code|hash|token|ref|index|number|num|no)(?:$|[_\s-])/i,
  /^(id|_id|order_?id|cust(?:omer)?_?id|emp(?:loyee)?_?id|user_?id|trans(?:action)?_?id|item_?id|row_?id|index|record_?id|staff_?id|member_?id|client_?id)$/i,
  /.*(?:_id|-id|Id|_key|-key|Key|_pk|-pk|Pk|_code|-code|Code|_no|-no|_num|-num|_number|-number|Number)$/i,
  /(?:_?id|_?code|_?no|_?num|_?pk|_?key)$/i,
];

// Value patterns: letter prefix + sequential number (EMP-101, CUST-002, ORD_9921), UUID, alphanumeric code
const ID_VALUE_REGEX = /^[A-Za-z]{1,8}[-_#:]?\d+$/;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-|^[0-9a-fA-F-]{16,}$/;
const ALPHANUM_CODE_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_-]{5,}$/;

/**
 * Case-insensitive property lookup for preview row objects.
 */
function getRowValue(row: Record<string, unknown>, colName: string): unknown {
  if (!row) return undefined;
  if (colName in row) return row[colName];
  const targetLower = colName.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === targetLower) {
      return row[key];
    }
  }
  return undefined;
}

// Regex patterns for discrete non-metric numeric columns (years, zip codes, phone numbers)
const DISCRETE_NUMERIC_PATTERNS = [
  /(?:^|[_\s-])(year|yr|birth_?year|hire_?year|founded|zip|postal|phone|fax|ssn|ein)(?:$|[_\s-])/i,
];

// High-priority keywords for primary business metrics (revenue, sales, price, quantity, etc.)
const PRIMARY_METRIC_KEYWORDS = [
  'revenue',
  'sales',
  'amount',
  'price',
  'profit',
  'cost',
  'total',
  'quantity',
  'qty',
  'salary',
  'spend',
  'budget',
  'margin',
  'volume',
];

// Secondary metric keywords (ratings, scores, rates)
const SECONDARY_METRIC_KEYWORDS = [
  'rating',
  'score',
  'discount',
  'balance',
  'rate',
  'fee',
  'tax',
  'gross',
  'net',
];

// High-priority keywords for categorical groupings
const CATEGORY_KEYWORDS = [
  'category',
  'type',
  'status',
  'group',
  'department',
  'dept',
  'region',
  'country',
  'city',
  'state',
  'segment',
  'brand',
  'tier',
  'gender',
  'role',
  'level',
  'priority',
  'channel',
  'industry',
  'sector',
  'class',
  'source',
  'division',
];

/**
 * Checks if a column is likely an identifier/primary key that should NOT be
 * used as an X-axis category or summed as an analytical metric.
 */
export function isIdentifierColumn(
  col: ColumnSummary,
  profile: DatasetProfileResponse
): boolean {
  const colName = col.name.trim();

  // Float/decimal continuous numbers are quantitative metrics, never identifier keys
  if (col.data_type === 'float') {
    return false;
  }

  // 1. Check name pattern (matches _ID suffix, id prefix/word, etc.)
  const matchesIdPattern = ID_NAME_PATTERNS.some((regex) => regex.test(colName));
  const rowCount = profile.row_count || 0;

  // 2. Inspect preview values for ID format (e.g. EMP-101, CUST-002, ORD_9921, UUIDs)
  if (profile.preview && profile.preview.length > 0) {
    const previewVals = profile.preview
      .map((row) => getRowValue(row as Record<string, unknown>, colName))
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(String);

    if (previewVals.length >= 2) {
      const uniquePreviewVals = new Set(previewVals);
      // High uniqueness among preview samples
      if (uniquePreviewVals.size === previewVals.length || uniquePreviewVals.size >= previewVals.length - 1) {
        // String columns: check for identifier code patterns (EMP-101, CUST-001, UUID)
        if (col.data_type === 'string') {
          const idTokenCount = previewVals.filter((v) =>
            ID_VALUE_REGEX.test(v) || UUID_REGEX.test(v) || ALPHANUM_CODE_REGEX.test(v)
          ).length;

          if (idTokenCount >= Math.ceil(previewVals.length * 0.7)) {
            return true;
          }
        }

        // Sequential numbers (0, 1, 2, 3... or 101, 102, 103...) if matching ID pattern
        const numericPreview = previewVals.map(Number);
        if (
          matchesIdPattern &&
          numericPreview.every((n, i) => !isNaN(n) && (i === 0 || n === numericPreview[i - 1] + 1))
        ) {
          return true;
        }
      }
    }
  }

  // 3. Explicit ID name pattern check (e.g. EMPLOYEE_ID, ORDER_ID, USER_ID)
  if (matchesIdPattern) {
    // If uniqueness ratio is not explicitly low (< 0.2 with high row count > 20), treat as ID
    if (col.unique_count !== undefined && rowCount > 20 && col.unique_count <= 3) {
      return false; // e.g. status_id with 2-3 values across hundreds of rows
    }
    return true;
  }

  // 4. Check cardinality against total row count
  if (col.unique_count !== undefined && rowCount > 0) {
    const uniquenessRatio = col.unique_count / rowCount;

    // String columns that are 100% unique (or nearly 100% unique for datasets with > 5 rows)
    if (col.data_type === 'string' && rowCount > 5) {
      if (col.unique_count === rowCount || uniquenessRatio >= 0.85) {
        return true;
      }
    }

    // Integer columns that match ID patterns and are 100% unique
    if (col.data_type === 'integer' && matchesIdPattern && col.unique_count === rowCount) {
      return true;
    }
  }

  return false;
}

/**
 * Returns whether a column is a viable categorical dimension for grouping and charting.
 * Cardinality must be reasonable (under 20 unique values) and not near 1-to-1 row cardinality.
 */
export function isCategoricalDimension(
  col: ColumnSummary,
  profile: DatasetProfileResponse
): boolean {
  if (isIdentifierColumn(col, profile)) {
    return false;
  }

  // Skip columns with excessive missing data (> 70%)
  if (col.null_percentage > 70) {
    return false;
  }

  // Obvious business metrics (revenue, sales, price, salary, quantity, profit) are metrics, not grouping dimensions
  const lowerName = (col.name || '').toLowerCase();
  if (PRIMARY_METRIC_KEYWORDS.some((kw) => lowerName.includes(kw))) {
    return false;
  }

  const isStringType = col.data_type === 'string' || col.data_type === 'boolean';
  const isDiscreteInt = col.data_type === 'integer';

  const rowCount = profile.row_count || 0;

  // Integer columns can only be categories if cardinality is genuinely low and not near-unique
  if (isDiscreteInt) {
    if (rowCount > 5 && col.unique_count !== undefined && col.unique_count / rowCount > 0.4) {
      return false;
    }
  }

  // Cardinality check: must have under 20 unique values and at least 2
  if (col.unique_count !== undefined) {
    if (col.unique_count < 2 || col.unique_count > 20) {
      return false;
    }
    // High uniqueness ratio check: if unique_count is close to rowCount, each row is a unique entity!
    if (rowCount > 5 && col.unique_count / rowCount >= 0.65) {
      return false;
    }
    return isStringType || isDiscreteInt;
  }

  // Fallback if unique_count not available: estimate from preview
  if (!isStringType) {
    return false;
  }

  if (profile.preview && profile.preview.length > 0) {
    const previewVals = new Set(
      profile.preview
        .map((r) => getRowValue(r as Record<string, unknown>, col.name))
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
    );
    // If preview has between 1 and 4 distinct values out of 5, it's likely low-cardinality
    return previewVals.size >= 1 && previewVals.size <= 4;
  }

  return isStringType;
}

/**
 * Scores a categorical column based on semantic hints and ideal cardinality.
 */
function scoreCategoricalDimension(
  col: ColumnSummary,
  _profile: DatasetProfileResponse
): number {
  let score = 10;
  const nameLower = (col.name || '').toLowerCase();

  // Semantic keyword match boost
  for (const kw of CATEGORY_KEYWORDS) {
    if (nameLower.includes(kw)) {
      score += 35;
      break;
    }
  }

  // Prefer string/boolean category types over discrete integer codes
  if (col.data_type === 'string' || col.data_type === 'boolean') {
    score += 15;
  }

  // Penalize discrete numeric patterns like years or codes from serving as primary category
  if (DISCRETE_NUMERIC_PATTERNS.some((regex) => regex.test(col.name))) {
    score -= 25;
  }

  // Optimal cardinality sweet spot (3 to 10 unique values is ideal for visualization)
  if (col.unique_count !== undefined) {
    if (col.unique_count >= 3 && col.unique_count <= 8) {
      score += 25;
    } else if (col.unique_count > 8 && col.unique_count <= 15) {
      score += 15;
    } else if (col.unique_count === 2) {
      score += 10; // binary categories are fine, but slightly lower priority than 3-8 categories
    }
  }

  // Penalize missing data
  score -= Math.round(col.null_percentage / 5);

  return score;
}

/**
 * Returns whether a column is a viable quantitative metric for aggregation.
 */
export function isNumericMetric(
  col: ColumnSummary,
  profile: DatasetProfileResponse
): boolean {
  if (isIdentifierColumn(col, profile)) {
    return false;
  }

  // Check if type is numeric
  const isNumericType =
    col.data_type === 'float' ||
    col.data_type === 'integer' ||
    Boolean(profile.numeric_summary && profile.numeric_summary[col.name]);

  if (!isNumericType) {
    return false;
  }

  // Check if name suggests temporal/discrete codes (e.g. year, zip code)
  const isDiscrete = DISCRETE_NUMERIC_PATTERNS.some((regex) => regex.test(col.name));
  if (isDiscrete) {
    return false;
  }

  // Check stats for non-zero variance
  const stats = profile.numeric_summary?.[col.name];
  if (stats) {
    if (stats.min !== null && stats.max !== null && stats.min === stats.max) {
      return false; // Constant column
    }
    if (stats.std !== null && stats.std === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Scores a numeric metric based on semantic hints and variance.
 */
function scoreNumericMetric(
  col: ColumnSummary,
  profile: DatasetProfileResponse
): number {
  let score = 10;
  const nameLower = (col.name || '').toLowerCase();

  // Tier 1 business volume/financial metrics (sales, revenue, price, quantity)
  const topTier = ['revenue', 'sales', 'profit', 'quantity', 'qty', 'amount'];
  if (topTier.some((kw) => nameLower.includes(kw))) {
    score += 50;
  } else if (PRIMARY_METRIC_KEYWORDS.some((kw) => nameLower.includes(kw))) {
    score += 40;
  } else if (SECONDARY_METRIC_KEYWORDS.some((kw) => nameLower.includes(kw))) {
    score += 25;
  }

  // Prefer float over integer (typically continuous measurements / currency)
  if (col.data_type === 'float') {
    score += 15;
  }

  // Stats boost for healthy range
  const stats = profile.numeric_summary?.[col.name];
  if (stats && stats.std && stats.std > 0) {
    score += 10;
  }

  // Penalize high nulls
  score -= Math.round(col.null_percentage / 5);

  return score;
}

/**
 * Determines whether a metric should default to 'sum' vs 'mean'.
 * Additive metrics (revenue, sales, quantity, salary, amount) -> sum
 * Intensity/Rate metrics (score, rating, percentage, ratio, age) -> mean
 */
export function getPreferredAggregation(metricName: string): 'sum' | 'mean' {
  const lower = (metricName || '').toLowerCase();
  const meanKeywords = [
    'rating',
    'score',
    'rate',
    'ratio',
    'avg',
    'average',
    'percentage',
    'pct',
    'age',
    'temperature',
    'duration',
  ];

  if (meanKeywords.some((kw) => lower.includes(kw))) {
    return 'mean';
  }

  return 'sum';
}

/**
 * Formats a metric column name and dimension name into a human-friendly title.
 */
export function formatChartTitle(
  metricName: string,
  dimName?: string,
  aggregation: 'sum' | 'mean' = 'sum'
): string {
  const cleanMetric = metricName
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  if (!dimName) {
    return `${cleanMetric} Distribution`;
  }

  const cleanDim = dimName
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const prefix = aggregation === 'mean' ? 'Average' : 'Total';
  return `${prefix} ${cleanMetric} by ${cleanDim}`;
}

/**
 * Recommends 2 to 3 distinct, high-value charts covering different analytical angles.
 */
export function getRecommendedCharts(
  profile: DatasetProfileResponse
): ChartRecommendation[] {
  // 1. Identify and rank candidate dimensions
  const candidateDims = profile.columns
    .filter((col) => isCategoricalDimension(col, profile))
    .map((col) => ({ col, score: scoreCategoricalDimension(col, profile) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.col);

  // 2. Identify and rank candidate metrics
  const candidateMetrics = profile.columns
    .filter((col) => isNumericMetric(col, profile))
    .map((col) => ({ col, score: scoreNumericMetric(col, profile) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.col);

  const recommendations: ChartRecommendation[] = [];

  const primaryMetric = candidateMetrics[0];
  const secondaryMetric = candidateMetrics.length > 1 ? candidateMetrics[1] : undefined;
  const primaryDim = candidateDims[0];
  const secondaryDim = candidateDims.length > 1 ? candidateDims[1] : undefined;

  // Perspective 1: Grouped Cross-Feature Aggregation (Total/Average Metric by Category)
  if (primaryMetric && primaryDim) {
    const agg = getPreferredAggregation(primaryMetric.name);
    recommendations.push({
      id: 'grouped-metric-primary',
      perspective: 'grouped_metric',
      title: formatChartTitle(primaryMetric.name, primaryDim.name, agg),
      subtitle: `Aggregated ${agg} of ${primaryMetric.name} across full dataset grouped by ${primaryDim.name}`,
      chartType: 'bar',
      metricCol: primaryMetric.name,
      dimensionCol: primaryDim.name,
      operation: agg,
      aggregation: agg,
      description: `Cross-feature breakdown highlighting how ${primaryMetric.name} distributes across ${primaryDim.name}.`,
    });
  }

  // Perspective 2: Categorical Distribution / Value Counts
  if (primaryDim) {
    // If we have a secondary dimension with high quality, use it; otherwise use primaryDim
    const targetDim =
      secondaryDim && scoreCategoricalDimension(secondaryDim, profile) >= 20
        ? secondaryDim
        : primaryDim;
    recommendations.push({
      id: 'category-breakdown',
      perspective: 'category_breakdown',
      title: `Record Volume by ${targetDim.name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
      subtitle: `Exact frequency breakdown of records across ${targetDim.name} categories in full dataset`,
      chartType: 'bar',
      dimensionCol: targetDim.name,
      operation: 'value_counts',
      description: `Category composition showing the proportion and frequency of each group.`,
    });
  }

  // Perspective 3: Numeric Distribution / Histogram
  if (primaryMetric) {
    const targetMetric =
      secondaryMetric && recommendations.length >= 2 ? secondaryMetric : primaryMetric;
    recommendations.push({
      id: 'numeric-distribution',
      perspective: 'numeric_distribution',
      title: `${targetMetric.name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Distribution`,
      subtitle: `Frequency distribution across binned ranges for all observations`,
      chartType: 'bar',
      metricCol: targetMetric.name,
      operation: 'histogram',
      description: `Statistical distribution revealing spread, skewness, and frequency peaks.`,
    });
  }

  // Fallback if dataset only has numeric columns and no categorical dimensions
  if (recommendations.length < 2 && candidateMetrics.length > 0) {
    for (const metric of candidateMetrics.slice(recommendations.length, 3)) {
      recommendations.push({
        id: `numeric-distribution-${metric.name}`,
        perspective: 'numeric_distribution',
        title: `${metric.name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Frequency Histogram`,
        subtitle: `Binned observations for ${metric.name} across all rows`,
        chartType: 'bar',
        metricCol: metric.name,
        operation: 'histogram',
        description: `Distribution profile for ${metric.name}.`,
      });
    }
  }

  // Fallback if dataset only has categorical columns and no numeric metrics
  if (recommendations.length < 2 && candidateDims.length > 0) {
    for (const dim of candidateDims.slice(recommendations.length, 3)) {
      recommendations.push({
        id: `category-breakdown-${dim.name}`,
        perspective: 'category_breakdown',
        title: `${dim.name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Frequency`,
        subtitle: `Value counts for ${dim.name} across full dataset`,
        chartType: 'pie',
        dimensionCol: dim.name,
        operation: 'value_counts',
        description: `Frequency share of ${dim.name}.`,
      });
    }
  }

  return recommendations;
}
