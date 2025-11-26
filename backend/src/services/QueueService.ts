import { RowData, JobPayload, ProcessingState } from 'shared/types';
import { ExcelService } from './ExcelService';
import { STATUS } from 'shared/constants';
import fs from 'fs/promises';
import path from 'path';

export class QueueService {
  private queue: RowData[] = [];
  private processing: Map<number, RowData> = new Map();
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
  private isInitialized: boolean = false;
  private initPrompt: string = '';
  private threadCounter: number = 0; // Track rows in current thread
  private THREAD_SIZE = 30; // Default: New thread every 30 rows
  private markdownCounter: number = 0; // Track markdown-content-N IDs
  private noMarkdownFailCounter: number = 0; // Track consecutive no-markdown failures
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
    this.THREAD_SIZE = enabled ? 5 : 30;
    this.MAX_NO_MARKDOWN_FAILS = enabled ? 3 : 10;
    console.log(`🧪 Test mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   THREAD_SIZE: ${this.THREAD_SIZE}`);
    console.log(`   MAX_NO_MARKDOWN_FAILS: ${this.MAX_NO_MARKDOWN_FAILS}`);
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
    this.isInitialized = false;
    this.threadCounter = 0; // Reset thread counter
    this.markdownCounter = 0; // Reset markdown counter
    this.noMarkdownFailCounter = 0; // Reset no-markdown fail counter
    
    // Clear processing map (important for fresh start)
    this.processing.clear();

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

  async getNextJob(): Promise<JobPayload | null> {
    console.log('QueueService.getNextJob: isInitialized=', this.isInitialized);
    console.log('QueueService.getNextJob: queue.length=', this.queue.length);
    console.log('QueueService.getNextJob: processing.size=', this.processing.size);
    console.log('QueueService.getNextJob: threadCounter=', this.threadCounter);
    console.log('QueueService.getNextJob: markdownCounter=', this.markdownCounter);

    // CRITICAL: Only allow one job at a time
    if (this.processing.size > 0) {
      console.log('QueueService.getNextJob: ⚠️ Already processing a job, returning null');
      console.log('QueueService.getNextJob: Jobs in processing:', Array.from(this.processing.keys()));
      return null;
    }

    // Check if we need to send INIT prompt first
    if (!this.isInitialized) {
      console.log('QueueService.getNextJob: 🔄 NOT INITIALIZED - Returning INIT job');
      console.log(`QueueService.getNextJob: INIT prompt length= ${this.initPrompt.length}`);
      
      this.processing.set(-1, { rowId: -1, status: 'INIT', inputData: this.initPrompt });
      this.state.current = -1;
      this.markdownCounter++; // Increment for INIT response (will be markdown-content-0)
      
      console.log(`QueueService.getNextJob: INIT uses markdownCounter= ${this.markdownCounter - 1} (will be markdown-content-${this.markdownCounter - 1})`);
      
      return {
        rowId: -1,
        inputData: this.initPrompt,
        type: 'INIT',
        markdownCounter: this.markdownCounter - 1 // Use current value before increment
      };
    }

    // Check if we need to create a new thread (every THREAD_SIZE rows)
    if (this.threadCounter > 0 && this.threadCounter % this.THREAD_SIZE === 0) {
      console.log(`QueueService.getNextJob: 🔄 NEW_THREAD triggered (threadCounter=${this.threadCounter}, THREAD_SIZE=${this.THREAD_SIZE})`);
      
      this.processing.set(-2, { rowId: -2, status: 'NEW_THREAD', inputData: this.initPrompt });
      this.state.current = -2;
      
      return {
        rowId: -2,
        inputData: this.initPrompt, // Send INIT prompt after clicking New Thread
        type: 'NEW_THREAD',
        markdownCounter: 0 // After New Thread, INIT prompt response is markdown-content-0
      };
    }

    const job = this.queue.shift();
    if (!job) {
      console.log('QueueService.getNextJob: Queue is empty, no jobs available');
      return null;
    }

    this.markdownCounter++; // Increment BEFORE dispatching
    console.log('QueueService.getNextJob: Returning job', job.rowId, 'with markdownCounter=', this.markdownCounter);
    this.processing.set(job.rowId, job);
    this.state.current = job.rowId;
    this.state.status = 'PROCESSING';
    this.state.activeThreads = this.processing.size;
    this.state.workflowStep = 'Dispatching Job';

    // Update status in Excel to IN-PROCESS
    this.excelService.updateRowStatus(job.rowId, STATUS.IN_PROCESS);

    return {
      rowId: job.rowId,
      inputData: job.inputData,
      markdownCounter: this.markdownCounter
    };
  }

  async completeJob(rowId: number, result: any): Promise<void> {
    if (rowId === -1) {
      this.processing.delete(-1);
      this.isInitialized = true;
      this.state.workflowStep = 'Initialization Complete';
      
      // If this was a re-initialization after NEW_THREAD, increment threadCounter
      if (this.threadCounter > 0) {
        this.threadCounter++; // Count the INIT prompt as part of the new thread
        console.log(`INIT job completed (re-initialization). ThreadCounter incremented to ${this.threadCounter}`);
      } else {
        console.log('INIT job completed (first time)');
      }
      return;
    }

    if (rowId === -2) {
      // NEW_THREAD job completed - button was clicked, page markdown IDs reset
      this.processing.delete(-2);
      
      // Reset markdown counter immediately because page just reset
      this.markdownCounter = -1; // Will be 0 for INIT prompt
      console.log(`NEW_THREAD button clicked. Markdown counter reset to -1`);
      
      // Now queue INIT job to re-initialize the new thread
      // Don't increment threadCounter yet - that happens after INIT completes
      this.isInitialized = false; // Force re-initialization
      this.state.workflowStep = 'New Thread Created - Re-initializing';
      console.log(`NEW_THREAD completed. Will send INIT prompt next with markdownCounter=0`);
      return;
    }

    if (this.processing.has(rowId)) {
      this.processing.delete(rowId);
      this.state.processed += 1;
      this.state.success += 1;
      this.threadCounter += 1; // Increment thread counter for regular jobs
      this.state.activeThreads = this.processing.size;
      this.state.workflowStep = 'Job Completed';
      
      // Reset no-markdown fail counter on success
      this.noMarkdownFailCounter = 0;
      console.log(`Job ${rowId} completed successfully. NoMarkdownFailCounter reset to 0`);
      
      // Update Excel with result
      await this.excelService.writeRowResult(rowId, result);

      console.log(`Job ${rowId} completed. ThreadCounter: ${this.threadCounter}`);
      
      if (this.queue.length === 0 && this.processing.size === 0) {
        this.state.status = 'COMPLETED';
      }
    }
  }

  async failJob(rowId: number, error: string): Promise<void> {
    if (this.processing.has(rowId)) {
      const job = this.processing.get(rowId)!;
      this.processing.delete(rowId);
      
      console.log(`❌ Job ${rowId} failed with error: "${error}"`);
      
      // Check if error is timeout - trigger NEW_THREAD immediately
      const isTimeout = error.includes('timeout') || error.includes('Timeout');
      
      if (isTimeout) {
        console.warn(`⏱️ TIMEOUT ERROR detected for job ${rowId}`);
        console.warn(`🔄 Triggering NEW_THREAD immediately to recover`);
        
        // Reset fail counter
        this.noMarkdownFailCounter = 0;
        
        // Put job back to queue for retry after NEW_THREAD
        this.queue.unshift(job);
        
        // Force NEW_THREAD by setting threadCounter to trigger threshold
        this.threadCounter = this.THREAD_SIZE;
        
        console.log(`   Job ${rowId} re-queued. NEW_THREAD will be triggered on next poll.`);
        return;
      }
      
      // Check if error is "No code block found" - match exact error from content script
      const isNoMarkdownError = error.includes('No code block found') || 
                                 error.includes('no code block') ||
                                 error.includes('No code block');
      
      console.log(`   Is no-markdown error? ${isNoMarkdownError}`);
      
      if (isNoMarkdownError) {
        this.noMarkdownFailCounter++;
        console.log(`⚠️  No markdown error detected. FailCounter: ${this.noMarkdownFailCounter}/${this.MAX_NO_MARKDOWN_FAILS}`);
        
        if (this.noMarkdownFailCounter >= this.MAX_NO_MARKDOWN_FAILS) {
          // Trigger NEW_THREAD after max consecutive failures
          console.warn(`🔄 Max no-markdown failures reached (${this.MAX_NO_MARKDOWN_FAILS}). Triggering NEW_THREAD...`);
          this.noMarkdownFailCounter = 0; // Reset counter
          
          // Put job back to queue for retry after NEW_THREAD
          this.queue.unshift(job);
          
          // Force NEW_THREAD by setting threadCounter to trigger threshold
          // This will make getNextJob return NEW_THREAD job
          this.threadCounter = this.THREAD_SIZE; // Will trigger NEW_THREAD on next poll
          
          console.log(`   Job ${rowId} re-queued. NEW_THREAD will be triggered on next poll.`);
          console.log(`   ThreadCounter set to ${this.THREAD_SIZE} to force NEW_THREAD`);
        } else {
          // Retry with reminder prompt
          console.log(`🔁 Retrying job ${rowId} with reminder prompt (attempt ${this.noMarkdownFailCounter}/${this.MAX_NO_MARKDOWN_FAILS})`);
          
          // Put job back to front of queue with reminder
          const retryJob: RowData = {
            ...job,
            inputData: job.inputData + '\n\n' + this.REMINDER_PROMPT
          };
          this.queue.unshift(retryJob);
          
          console.log(`   ✅ Job ${rowId} re-queued with reminder prompt`);
          console.log(`   📝 Reminder appended: "${this.REMINDER_PROMPT.substring(0, 50)}..."`);
        }
      } else {
        // Other errors - just mark as failed
        console.error(`   ❌ Non-retry error for job ${rowId}: ${error}`);
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
