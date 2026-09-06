export type DashboardTab =
  | 'overview'
  | 'explorer'
  | 'analysis'
  | 'charts'
  | 'ai-analyst'
  | 'quality';

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  insights?: string[];
  suggestedFollowUps?: string[];
}

export interface DataQualityReport {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  totalCells: number;
  missingCells: number;
  completenessPercentage: number;
  columnsWithNulls: number;
  cleanColumns: number;
  status: 'optimal' | 'moderate' | 'action_needed';
  issues: string[];
}
