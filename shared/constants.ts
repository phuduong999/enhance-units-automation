export const COLUMN_MAPPING = {
  STATUS: 'A', // Status column
  INPUT_DATA: 'K', // Input data column (Raw Text)
  OUTPUT_RESULT: 'L', // Output result column
  BRANDLINK: 'N', // Brandlink column (optional)
};

export const STATUS = {
  OKE: 'OKE',
  NOT_OKE: 'NOT-OKE',
  IN_PROCESS: 'IN-PROCESS',
  ERROR_WHEN_PROCESS: 'ERROR-WHEN-PROCESS',
  REVIEW: 'REVIEW',
};

export const API_CONFIG = {
  BASE_URL: 'http://localhost:3000',
  PORT: 3000,
  ENDPOINTS: {
    UPLOAD: '/api/upload',
    PROCESS: '/api/process',
    STATUS: '/api/status',
    DOWNLOAD: '/api/download',
    NEXT_JOB: '/api/next-job',
    COMPLETE_JOB: '/api/complete-job',
    FAIL_JOB: '/api/fail-job',
    WORKFLOW_UPDATE: '/api/workflow-update'
  },
  UPLOAD_DIR: './uploads',
  DOWNLOAD_FILENAME: 'processed.xlsx',
  POLLING_INTERVAL: 2000 // 2 seconds
};

export const AUTOMATION_CONFIG = {
  ZOOM_LEVEL: 1, // 100% zoom
  PERPLEXITY_URL: 'https://www.perplexity.ai/',
  PERPLEXITY_URL_PATTERN: 'https://www.perplexity.ai/*',
  SELECTORS: {
    INPUT: '#ask-input',
    SUBMIT_BUTTON: 'button[aria-label="Submit"]',
    STOP_BUTTON: 'button[data-testid="stop-generating-response-button"]',
    MARKDOWN_CONTENT_PREFIX: '[id^="markdown-content-"]',
    CODE_BLOCK: 'pre > code',
  },
  TIMEOUTS: {
    ELEMENT_WAIT: 30000,
    AI_THINKING: 15 * 60 * 1000, // 15 minutes
    POLL_INTERVAL: 500,
    PAGE_LOAD: 5000,
    RECONNECT: 3000,
  },
};

export const MESSAGES = {
  CONNECTION_ESTABLISHED: 'CONNECTION_ESTABLISHED',
  JOB_ASSIGNED: 'JOB_ASSIGNED',
  JOB_COMPLETED: 'JOB_COMPLETED',
  JOB_FAILED: 'JOB_FAILED',
  STATE_UPDATE: 'STATE_UPDATE',
  EXECUTE_JOB: 'EXECUTE_JOB',
  WORKFLOW_UPDATE: 'WORKFLOW_UPDATE',
};

export const TEST_CONFIG = {
  THREAD_SIZE: 5, // NEW_THREAD every 5 rows in test mode
  MAX_NO_MARKDOWN_FAILS: 3, // Trigger NEW_THREAD after 3 fails in test mode
};
