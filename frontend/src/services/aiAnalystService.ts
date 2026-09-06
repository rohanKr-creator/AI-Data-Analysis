import type { DatasetProfileResponse } from '../types/api';
import type { AiChatMessage } from '../types/dashboard';

let messageCounter = 0;
export const getNextMessageId = () => `ai-msg-${Date.now()}-${++messageCounter}`;

export function calculateQualityReport(profile: DatasetProfileResponse) {
  const totalRows = profile.row_count || 1;
  const totalCols = profile.column_count || 1;
  const totalCells = totalRows * totalCols;

  let totalNulls = 0;
  let columnsWithNulls = 0;
  const issues: string[] = [];

  profile.columns.forEach((col) => {
    if (col.null_count > 0) {
      totalNulls += col.null_count;
      columnsWithNulls += 1;
      issues.push(
        `Column "${col.name}" has ${col.null_count} missing values (${col.null_percentage.toFixed(1)}%).`
      );
    }
  });

  const missingPercentage = (totalNulls / totalCells) * 100;
  const completeness = Math.max(0, Math.min(100, 100 - missingPercentage));
  const score = Math.round(completeness);

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' = 'A+';
  let status: 'optimal' | 'moderate' | 'action_needed' = 'optimal';

  if (score >= 98) {
    grade = 'A+';
    status = 'optimal';
  } else if (score >= 90) {
    grade = 'A';
    status = 'optimal';
  } else if (score >= 80) {
    grade = 'B';
    status = 'moderate';
  } else if (score >= 70) {
    grade = 'C';
    status = 'moderate';
  } else {
    grade = 'D';
    status = 'action_needed';
  }

  return {
    score,
    grade,
    totalCells,
    missingCells: totalNulls,
    completenessPercentage: completeness,
    columnsWithNulls,
    cleanColumns: totalCols - columnsWithNulls,
    status,
    issues,
  };
}

export function generateSuggestedQuestions(
  profile: DatasetProfileResponse | null
): string[] {
  if (!profile) {
    return [
      'What can you tell me about this dataset?',
      'Summarize data quality and missing values',
      'What are the key numeric distributions?',
    ];
  }

  const numericCols = Object.keys(profile.numeric_summary || {});
  const questions: string[] = [];

  questions.push(`Provide an executive summary of ${profile.filename}`);
  questions.push('Evaluate data quality, completeness, and hygiene');

  if (numericCols.length > 0) {
    const firstNum = numericCols[0];
    questions.push(`What are the key statistics and distribution for "${firstNum}"?`);
    if (numericCols.length > 1) {
      questions.push(`Compare variance between "${numericCols[0]}" and "${numericCols[1]}"`);
    }
  }

  const catCols = profile.columns.filter(
    (c) => c.data_type === 'string' || c.data_type === 'category'
  );
  if (catCols.length > 0) {
    questions.push(`What are the most frequent categories in "${catCols[0].name}"?`);
  }

  return questions.slice(0, 4);
}

export async function askAiAnalyst(
  query: string,
  profile: DatasetProfileResponse
): Promise<AiChatMessage> {
  // Simulate slight cognitive latency for realistic SaaS feel
  await new Promise((resolve) => setTimeout(resolve, 600));

  const lower = query.toLowerCase();
  const numericKeys = Object.keys(profile.numeric_summary || {});
  const quality = calculateQualityReport(profile);

  // Intent 1: Quality / Missing values
  if (
    lower.includes('quality') ||
    lower.includes('missing') ||
    lower.includes('null') ||
    lower.includes('hygiene') ||
    lower.includes('health')
  ) {
    const nullCols = profile.columns.filter((c) => c.null_count > 0);
    const content =
      nullCols.length === 0
        ? `The dataset "${profile.filename}" demonstrates pristine data hygiene! All ${profile.column_count} columns across ${profile.row_count} rows have 0 missing values (100% completeness score).`
        : `Data Quality Audit for "${profile.filename}": Overall completeness is ${quality.completenessPercentage.toFixed(1)}% (Grade: ${quality.grade}). Found ${quality.missingCells.toLocaleString()} missing values across ${nullCols.length} column(s). Columns requiring attention: ${nullCols.map((c) => `"${c.name}" (${c.null_percentage.toFixed(1)}% nulls)`).join(', ')}.`;

    return {
      id: getNextMessageId(),
      role: 'assistant',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      insights: [
        `Overall Quality Score: ${quality.score}/100 (${quality.grade})`,
        `${quality.cleanColumns} of ${profile.column_count} columns are 100% complete`,
        nullCols.length > 0 ? 'Recommendation: Impute or filter missing records before modeling' : 'Dataset is ready for advanced predictive modeling',
      ],
      suggestedFollowUps: [
        'Which columns are numeric and eligible for statistical aggregation?',
        'Provide an executive summary of the entire dataset',
      ],
    };
  }

  // Intent 2: Numeric stats / Distribution / Specific column query
  const matchedNumCol = numericKeys.find((col) => lower.includes(col.toLowerCase()));
  if (
    matchedNumCol ||
    lower.includes('stat') ||
    lower.includes('distribution') ||
    lower.includes('mean') ||
    lower.includes('average') ||
    lower.includes('variance')
  ) {
    const targetCol = matchedNumCol || numericKeys[0];
    if (targetCol && profile.numeric_summary[targetCol]) {
      const stats = profile.numeric_summary[targetCol];
      return {
        id: getNextMessageId(),
        role: 'assistant',
        content: `Statistical Breakdown for column "${targetCol}": Mean value is ${stats.mean?.toFixed(2) ?? 'N/A'}, with a standard deviation of ${stats.std?.toFixed(2) ?? 'N/A'}. The observed values range from a minimum of ${stats.min ?? 'N/A'} to a maximum of ${stats.max ?? 'N/A'}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        insights: [
          `Mean: ${stats.mean?.toFixed(2) ?? 'N/A'} | Min: ${stats.min} | Max: ${stats.max}`,
          `Spread (Std Dev): ${stats.std?.toFixed(2) ?? 'N/A'} indicates ${stats.std && stats.mean && stats.std / stats.mean > 0.5 ? 'high relative variability' : 'stable clustering around the mean'}`,
        ],
        suggestedFollowUps: [
          `Run a grouped aggregation on "${targetCol}" in the Analysis tab`,
          'Summarize overall data quality and completeness',
        ],
      };
    }
  }

  // Default Intent: Executive summary of dataset
  const numCount = numericKeys.length;
  const catCount = profile.column_count - numCount;

  return {
    id: getNextMessageId(),
    role: 'assistant',
    content: `Executive Summary for "${profile.filename}": The dataset contains ${profile.row_count.toLocaleString()} rows and ${profile.column_count} columns (${numCount} numerical metrics and ${catCount} categorical/temporal attributes). Overall data completeness is ${quality.completenessPercentage.toFixed(1)}% with an audit score of ${quality.score}/100.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    insights: [
      `Dimensions: ${profile.row_count.toLocaleString()} rows × ${profile.column_count} columns`,
      `Feature Composition: ${numCount} Numeric, ${catCount} Categorical`,
      `Quality Grade: ${quality.grade} (${quality.score}/100)`,
    ],
    suggestedFollowUps: [
      'Check detailed missing value breakdown',
      numericKeys.length > 0 ? `Inspect statistical distribution of ${numericKeys[0]}` : 'Explore preview rows',
    ],
  };
}
