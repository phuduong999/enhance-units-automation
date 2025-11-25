export interface RowData {
  rowId: number;
  status: string;
  inputData: string; // From Column K
  // Add other fields if necessary
}

export interface JobPayload {
  rowId: number;
  inputData: string;
  type?: 'NORMAL' | 'INIT' | 'NEW_THREAD';
  markdownCounter?: number; // Track which markdown-content-N to use
  isRetry?: boolean; // Indicates this is a retry with reminder prompt
}

export interface ProcessingState {
  total: number;
  processed: number;
  current: number;
  status: 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'PAUSED';
  success: number;
  failed: number;
  activeThreads: number;
  workflowStep: string;
}

export interface WebSocketMessage {
  type: 'JOB_ASSIGNED' | 'JOB_COMPLETED' | 'JOB_FAILED' | 'STATE_UPDATE' | 'CONNECTION_ESTABLISHED' | 'WORKFLOW_UPDATE';
  payload?: any;
}
