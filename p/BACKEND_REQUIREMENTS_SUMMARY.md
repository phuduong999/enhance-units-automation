# Backend Requirements for AI Automation System

## 🎯 Core Responsibilities

Backend xử lý **job queue management** và **state tracking** - KHÔNG xử lý Excel hay file cụ thể nào.

---

## 📊 Data Structures

### **1. Job (RowData)**
```typescript
interface RowData {
  rowId: number;        // Unique ID cho job
  status: string;       // PENDING, IN-PROCESS, OKE, ERROR
  inputData: string;    // Prompt/data cần gửi cho AI
}
```

### **2. Job Payload (gửi cho Extension)**
```typescript
interface JobPayload {
  rowId: number;              // -1 = INIT, -2 = NEW_THREAD, >0 = NORMAL
  inputData: string;          // Prompt text
  type?: 'INIT' | 'NEW_THREAD' | 'NORMAL';
  markdownCounter?: number;   // Track response index (for extraction)
}
```

### **3. Processing State (UI tracking)**
```typescript
interface ProcessingState {
  total: number;           // Tổng số jobs
  processed: number;       // Đã xử lý (success + failed)
  current: number;         // Job đang xử lý
  status: 'IDLE' | 'PROCESSING' | 'COMPLETED';
  success: number;         // Thành công
  failed: number;          // Thất bại vĩnh viễn
  activeThreads: number;   // Số jobs đang chạy
  workflowStep: string;    // Status message cho UI
}
```

---

## 🔧 QueueService - Core Logic

### **Worker State Tracking**
Mỗi worker (tab) có state riêng:
```typescript
interface WorkerState {
  threadCounter: number;        // Đếm số jobs đã xử lý trong thread hiện tại
  markdownCounter: number;      // Đếm số responses từ AI (để extract đúng)
  noMarkdownFailCounter: number; // Đếm số lần fail liên tiếp (no code block)
  isInitialized: boolean;       // Đã gửi INIT prompt chưa?
  activeRowId: number | null;   // Job đang xử lý (-1, -2, hoặc rowId)
}
```

### **Key Methods**

#### **1. getNextJob(workerId: string)**
Logic quyết định job tiếp theo:

```typescript
async getNextJob(workerId: string): Promise<JobPayload | null> {
  const workerState = this.getWorkerState(workerId);
  
  // CASE 1: Worker chưa initialize → Send INIT job
  if (!workerState.isInitialized) {
    workerState.activeRowId = -1;
    workerState.markdownCounter++;
    return {
      rowId: -1,
      inputData: this.initPrompt,
      type: 'INIT',
      markdownCounter: workerState.markdownCounter - 1
    };
  }
  
  // CASE 2: Đã đủ THREAD_SIZE jobs → Send NEW_THREAD job
  if (workerState.threadCounter > 0 && 
      workerState.threadCounter % THREAD_SIZE === 0) {
    workerState.activeRowId = -2;
    return {
      rowId: -2,
      inputData: this.initPrompt, // Sẽ gửi sau khi click NEW_THREAD
      type: 'NEW_THREAD',
      markdownCounter: 0
    };
  }
  
  // CASE 3: Normal job
  const job = this.queue.shift();
  if (!job) return null;
  
  workerState.markdownCounter++;
  workerState.activeRowId = job.rowId;
  this.activeJobs.set(job.rowId, job);
  
  return {
    rowId: job.rowId,
    inputData: job.inputData,
    markdownCounter: workerState.markdownCounter
  };
}
```

#### **2. completeJob(rowId, result, workerId)**
Xử lý khi job thành công:

```typescript
async completeJob(rowId: number, result: any, workerId: string) {
  const workerState = this.getWorkerState(workerId);
  
  // INIT job completed
  if (rowId === -1) {
    workerState.activeRowId = null;
    workerState.isInitialized = true;
    if (workerState.threadCounter > 0) {
      workerState.threadCounter++; // Sau NEW_THREAD
    }
    return;
  }
  
  // NEW_THREAD job completed
  if (rowId === -2) {
    workerState.activeRowId = null;
    workerState.markdownCounter = -1;  // Reset counter
    workerState.isInitialized = false; // Force re-init
    return;
  }
  
  // Normal job completed
  this.activeJobs.delete(rowId);
  workerState.activeRowId = null;
  this.state.processed++;
  this.state.success++;
  workerState.threadCounter++;
  workerState.noMarkdownFailCounter = 0; // Reset fail counter
  
  // TODO: Write result to your data store (DB, file, etc.)
  // await this.saveResult(rowId, result);
}
```

#### **3. failJob(rowId, error, workerId)**
Xử lý khi job thất bại - **QUAN TRỌNG NHẤT**:

```typescript
async failJob(rowId: number, error: string, workerId: string) {
  const workerState = this.getWorkerState(workerId);
  const job = this.activeJobs.get(rowId);
  
  this.activeJobs.delete(rowId);
  workerState.activeRowId = null;
  
  // CASE 1: TIMEOUT → Trigger NEW_THREAD immediately
  const isTimeout = error.includes('timeout');
  if (isTimeout) {
    console.warn('⏱️ TIMEOUT - Triggering NEW_THREAD');
    workerState.noMarkdownFailCounter = 0;
    this.queue.unshift(job); // Re-queue job
    workerState.threadCounter = THREAD_SIZE; // Force NEW_THREAD
    return;
  }
  
  // CASE 2: No markdown/code block error → Retry with reminder
  const isNoMarkdownError = error.includes('No code block found');
  if (isNoMarkdownError) {
    workerState.noMarkdownFailCounter++;
    
    if (workerState.noMarkdownFailCounter >= MAX_NO_MARKDOWN_FAILS) {
      console.warn('🔄 Max failures - Triggering NEW_THREAD');
      workerState.noMarkdownFailCounter = 0;
      this.queue.unshift(job);
      workerState.threadCounter = THREAD_SIZE;
    } else {
      console.log('🔁 Retrying with reminder...');
      job.inputData += '\n\n' + REMINDER_PROMPT;
      this.queue.unshift(job);
    }
    return;
  }
  
  // CASE 3: Other errors → Mark as failed
  console.error('❌ Non-retry error');
  this.state.failed++;
  // TODO: Mark job as ERROR in your data store
}
```

---

## 🌐 HTTP Endpoints

### **1. GET /api/next-job?workerId=xxx**
```typescript
app.get('/api/next-job', async (req, res) => {
  const workerId = req.query.workerId as string || 'default';
  const job = await queueService.getNextJob(workerId);
  res.json({ job });
});
```

### **2. POST /api/complete-job**
```typescript
app.post('/api/complete-job', async (req, res) => {
  const { rowId, result, workerId } = req.body;
  await queueService.completeJob(rowId, result, workerId || 'default');
  res.json({ success: true });
});
```

### **3. POST /api/fail-job**
```typescript
app.post('/api/fail-job', async (req, res) => {
  const { rowId, error, workerId } = req.body;
  await queueService.failJob(rowId, error, workerId || 'default');
  res.json({ success: true });
});
```

### **4. GET /api/status**
```typescript
app.get('/api/status', (req, res) => {
  res.json(queueService.getState());
});
```

### **5. POST /api/workflow-update**
```typescript
app.post('/api/workflow-update', (req, res) => {
  const { step } = req.body;
  queueService.updateWorkflowStep(step);
  res.json({ success: true });
});
```

---

## ⚙️ Configuration

```typescript
const THREAD_SIZE = 20;           // NEW_THREAD every 20 jobs
const MAX_NO_MARKDOWN_FAILS = 10; // Trigger NEW_THREAD after 10 fails
const REMINDER_PROMPT = `Remember: Output must be in code block format!`;
```

---

## 🔄 Workflow Summary

```
1. Extension polls: GET /api/next-job?workerId=xxx
2. Backend returns:
   - INIT job (if not initialized)
   - NEW_THREAD job (if threadCounter % THREAD_SIZE === 0)
   - NORMAL job (from queue)
3. Extension executes job on AI platform
4. Extension reports:
   - POST /api/complete-job (success)
   - POST /api/fail-job (failure)
5. Backend updates state and applies retry logic
6. Repeat until queue empty
```

---

## 🎯 Key Points

✅ **Backend KHÔNG cần biết về Excel** - chỉ quản lý queue  
✅ **Worker state per tab** - support multi-tab processing  
✅ **Smart retry logic** - timeout, no markdown, other errors  
✅ **NEW_THREAD automation** - prevent AI fatigue  
✅ **HTTP polling** - no WebSocket needed  
✅ **State tracking** - real-time UI updates  

---

## 📝 Adaptation Notes

Để adapt cho Thread Overview hoặc platform khác:

1. **Thay đổi data source**: Thay vì Excel, có thể dùng DB, API, JSON file, etc.
2. **Customize job structure**: Thêm fields cần thiết vào `RowData`
3. **Adjust retry logic**: Tùy theo error types của platform
4. **Update THREAD_SIZE**: Tùy theo AI platform limits
5. **Modify result handling**: Parse và lưu result theo format riêng

Backend core logic GIỮ NGUYÊN - chỉ thay đổi input/output handling!

