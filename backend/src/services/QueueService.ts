import { RowData, JobPayload, ProcessingState } from 'shared/types';
import { ExcelService } from './ExcelService';
import { STATUS } from 'shared/constants';
import fs from 'fs/promises';
import path from 'path';

export class QueueService {
  private queue: RowData[] = [];
  // Track active jobs by rowId to prevent duplicates
  private activeJobs: Map<number, RowData> = new Map();
  
  // Track state per worker
  private workerStates: Map<string, {
    threadCounter: number;
    markdownCounter: number;
    noMarkdownFailCounter: number;
    isInitialized: boolean;
    activeRowId: number | null;
  }> = new Map();

  private excelService: ExcelService;
  private state: ProcessingState = {
    total: 0,
    processed: 0,
    current: 0,
    status: 'IDLE',
    success: 0,
    failed: 0,
    activeThreads: 0,
    workflowStep: 'Idle',
  };
  private initPrompt: string = '';
  private THREAD_SIZE = 20; // Default: New thread every 20 rows
  private MAX_NO_MARKDOWN_FAILS = 10; // Default: Trigger NEW_THREAD after 10 fails
  private readonly REMINDER_PROMPT = `Remember the rules 
Step 4: Force the output to be a code block. Do not include explanations or stranger symbols not relation about result in code block and text. Think silently and just do the job.
    Example: 
        Code Block format: 
                unit = value-of-unit
                unit = value-of-unit
                unit = value-of-unit
                unit = value-of-unit`;
  private testMode: boolean = false; // Test mode flag

  constructor(excelService: ExcelService) {
    this.excelService = excelService;
  }

  setTestMode(enabled: boolean): void {
    this.testMode = enabled;
    this.THREAD_SIZE = enabled ? 5 : 20;
    this.MAX_NO_MARKDOWN_FAILS = enabled ? 3 : 10;
    console.log(`🧪 Test mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   THREAD_SIZE: ${this.THREAD_SIZE}`);
    console.log(`   MAX_NO_MARKDOWN_FAILS: ${this.MAX_NO_MARKDOWN_FAILS}`);
  }

  private getWorkerState(workerId: string) {
    if (!this.workerStates.has(workerId)) {
      console.log(`Creating new state for worker: ${workerId}`);
      this.workerStates.set(workerId, {
        threadCounter: 0,
        markdownCounter: 0,
        noMarkdownFailCounter: 0,
        isInitialized: false,
        activeRowId: null
      });
    }
    return this.workerStates.get(workerId)!;
  }

  async loadQueue(): Promise<void> {
    const rows = await this.excelService.getPendingRows();
    this.queue = rows;
    this.state.total = rows.length;
    this.state.processed = 0;
    this.state.success = 0;
    this.state.failed = 0;
    this.state.status = 'IDLE';
    this.state.workflowStep = 'Ready to start';
    
    // Reset all states
    this.activeJobs.clear();
    this.workerStates.clear();
    
    // Read init prompt
    try {
      const promptPath = path.resolve(process.cwd(), 'prompt-force.md');
      this.initPrompt = await fs.readFile(promptPath, 'utf-8');
      console.log('Init prompt loaded');
    } catch (error) {
      console.error('Failed to read prompt-force.md', error);
      this.initPrompt = ''; // Fallback or error?
    }

    console.log(`Queue loaded with ${rows.length} items`);
  }

  async getNextJob(workerId: string = 'default'): Promise<JobPayload | null> {
    const workerState = this.getWorkerState(workerId);
    
    console.log(`QueueService.getNextJob [${workerId}]: isInitialized=${workerState.isInitialized}`);
    console.log(`QueueService.getNextJob [${workerId}]: queue.length=${this.queue.length}`);
    console.log(`QueueService.getNextJob [${workerId}]: activeJobs.size=${this.activeJobs.size}`);
    console.log(`QueueService.getNextJob [${workerId}]: threadCounter=${workerState.threadCounter}`);

    // If worker is already processing something, assume it's lost/retry or just ignore?
    // Ideally, the worker shouldn't ask if it's busy. If it asks, it's free.
    if (workerState.activeRowId !== null) {
      console.log(`QueueService.getNextJob [${workerId}]: ⚠️ Worker was marked as busy with row ${workerState.activeRowId}, but asked for job. Resetting active job.`);
      // If it was a real job, maybe we should re-queue it?
      // For now, let's just clear it to avoid deadlock.
      if (workerState.activeRowId > 0) {
        this.activeJobs.delete(workerState.activeRowId);
      }
      workerState.activeRowId = null;
    }

    // Check if we need to send INIT prompt first
    if (!workerState.isInitialized) {
      console.log(`QueueService.getNextJob [${workerId}]: 🔄 NOT INITIALIZED - Returning INIT job`);
      
      workerState.activeRowId = -1;
      workerState.markdownCounter++; // Increment for INIT response
      
      return {
        rowId: -1,
        inputData: this.initPrompt,
        type: 'INIT',
        markdownCounter: workerState.markdownCounter - 1
      };
    }

    // Check if we need to create a new thread (every THREAD_SIZE rows)
    if (workerState.threadCounter > 0 && workerState.threadCounter % this.THREAD_SIZE === 0) {
      console.log(`QueueService.getNextJob [${workerId}]: 🔄 NEW_THREAD triggered (threadCounter=${workerState.threadCounter})`);
      
      workerState.activeRowId = -2;
      
      return {
        rowId: -2,
        inputData: this.initPrompt, // Send INIT prompt after clicking New Thread
        type: 'NEW_THREAD',
        markdownCounter: 0
      };
    }

    const job = this.queue.shift();
    if (!job) {
      console.log(`QueueService.getNextJob [${workerId}]: Queue is empty`);
      return null;
    }

    workerState.markdownCounter++; // Increment BEFORE dispatching
    console.log(`QueueService.getNextJob [${workerId}]: Returning job ${job.rowId}`);
    
    this.activeJobs.set(job.rowId, job);
    workerState.activeRowId = job.rowId;
    
    this.state.current = job.rowId; // Just for UI (shows last dispatched)
    this.state.status = 'PROCESSING';
    this.state.activeThreads = this.activeJobs.size;
    this.state.workflowStep = `Dispatching Job ${job.rowId} to ${workerId}`;

    // Update status in Excel to IN-PROCESS
    this.excelService.updateRowStatus(job.rowId, STATUS.IN_PROCESS);

    return {
      rowId: job.rowId,
      inputData: job.inputData,
      markdownCounter: workerState.markdownCounter
    };
  }

  async completeJob(rowId: number, result: any, workerId: string = 'default'): Promise<void> {
    const workerState = this.getWorkerState(workerId);

    if (rowId === -1) {
      workerState.activeRowId = null;
      workerState.isInitialized = true;
      this.state.workflowStep = `Initialization Complete (${workerId})`;
      
      // If this was a re-initialization after NEW_THREAD, increment threadCounter
      if (workerState.threadCounter > 0) {
        workerState.threadCounter++; 
        console.log(`[${workerId}] INIT job completed. ThreadCounter: ${workerState.threadCounter}`);
      } else {
        console.log(`[${workerId}] INIT job completed (first time)`);
      }
      return;
    }

    if (rowId === -2) {
      // NEW_THREAD job completed
      workerState.activeRowId = null;
      
      // Reset markdown counter
      workerState.markdownCounter = -1; 
      console.log(`[${workerId}] NEW_THREAD completed. Markdown counter reset.`);
      
      // Force re-initialization
      workerState.isInitialized = false; 
      this.state.workflowStep = `New Thread Created (${workerId})`;
      return;
    }

    if (this.activeJobs.has(rowId)) {
      this.activeJobs.delete(rowId);
      workerState.activeRowId = null;
      
      this.state.processed += 1;
      this.state.success += 1;
      workerState.threadCounter += 1;
      
      this.state.activeThreads = this.activeJobs.size;
      this.state.workflowStep = `Job ${rowId} Completed`;
      
      // Reset no-markdown fail counter
      workerState.noMarkdownFailCounter = 0;
      
      // Update Excel with result
      await this.excelService.writeRowResult(rowId, result);

      console.log(`[${workerId}] Job ${rowId} completed. ThreadCounter: ${workerState.threadCounter}`);
      
      if (this.queue.length === 0 && this.activeJobs.size === 0) {
        this.state.status = 'COMPLETED';
      }
    }
  }

  async failJob(rowId: number, error: string, workerId: string = 'default'): Promise<void> {
    const workerState = this.getWorkerState(workerId);

    if (this.activeJobs.has(rowId)) {
      const job = this.activeJobs.get(rowId)!;
      this.activeJobs.delete(rowId);
      workerState.activeRowId = null;
      
      console.log(`[${workerId}] ❌ Job ${rowId} failed: "${error}"`);
      
      const isTimeout = error.includes('timeout') || error.includes('Timeout');
      
      if (isTimeout) {
        console.warn(`[${workerId}] ⏱️ TIMEOUT - Triggering NEW_THREAD`);
        
        workerState.noMarkdownFailCounter = 0;
        this.queue.unshift(job);
        
        // Force NEW_THREAD
        workerState.threadCounter = this.THREAD_SIZE;
        return;
      }
      
      const isNoMarkdownError = error.includes('No code block found') || 
                                 error.includes('no code block') ||
                                 error.includes('No code block');
      
      if (isNoMarkdownError) {
        workerState.noMarkdownFailCounter++;
        console.log(`[${workerId}] ⚠️ No markdown error. FailCounter: ${workerState.noMarkdownFailCounter}`);
        
        if (workerState.noMarkdownFailCounter >= this.MAX_NO_MARKDOWN_FAILS) {
          console.warn(`[${workerId}] 🔄 Max failures. Triggering NEW_THREAD...`);
          workerState.noMarkdownFailCounter = 0;
          
          this.queue.unshift(job);
          workerState.threadCounter = this.THREAD_SIZE;
        } else {
          console.log(`[${workerId}] 🔁 Retrying with reminder...`);
          const retryJob: RowData = {
            ...job,
            inputData: job.inputData + '\n\n' + this.REMINDER_PROMPT
          };
          this.queue.unshift(retryJob);
        }
      } else {
        console.error(`[${workerId}] ❌ Non-retry error for job ${rowId}`);
        await this.excelService.updateRowStatus(rowId, STATUS.ERROR_WHEN_PROCESS);
        this.state.failed += 1;
      }
    }
  }

  getState(): ProcessingState {
    return this.state;
  }

  updateWorkflowStep(step: string): void {
    this.state.workflowStep = step;
  }
}
