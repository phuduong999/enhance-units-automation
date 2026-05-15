# Chrome Extension for AI Platform Automation - Complete Implementation Guide

## 🎯 Project Overview
Build a Chrome Extension that automates interaction with an AI platform (like Perplexity, ChatGPT, Claude, etc.) to process batch jobs from a backend queue system.

---

## 📋 System Architecture

### **3 Main Components:**

1. **Backend (Node.js/Express)** - Job queue management & state tracking
2. **Chrome Extension** - UI + Automation orchestration
3. **Content Script** - Direct DOM manipulation on AI platform

### **Communication Flow:**
```
Backend Queue ←→ Extension Background Script ←→ Content Script ←→ AI Platform DOM
                        ↓
                  Extension UI (Side Panel)
```

---

## 🔧 Backend Implementation

### **Core Responsibilities:**
- ✅ Manage job queue (FIFO)
- ✅ Track processing state (total, processed, success, failed)
- ✅ Handle job lifecycle (dispatch → complete/fail)
- ✅ Implement retry logic with smart recovery
- ✅ Support multiple workers (multi-tab processing)
- ✅ Provide HTTP polling endpoints (no WebSocket needed)

### **Key Features to Implement:**

#### 1. **Job Queue Service** (`QueueService.ts`)
```typescript
class QueueService {
  private queue: RowData[] = [];
  private activeJobs: Map<number, RowData> = new Map();
  private workerStates: Map<string, WorkerState> = new Map();

  // Worker state per tab/instance
  interface WorkerState {
    threadCounter: number;        // Track jobs processed in current thread
    markdownCounter: number;      // Track AI responses (for extraction)
    noMarkdownFailCounter: number; // Track consecutive failures
    isInitialized: boolean;       // Has worker sent INIT prompt?
    activeRowId: number | null;   // Currently processing job
  }
}
```

#### 2. **Smart Thread Management**
- **NEW_THREAD trigger**: Every N jobs (e.g., 20-30) to prevent AI fatigue
- **Auto-recovery**: After timeout or consecutive failures
- **Re-initialization**: After NEW_THREAD, send INIT prompt again

#### 3. **Retry Logic**
```typescript
// On job failure:
if (isTimeout) {
  // Trigger NEW_THREAD immediately
  workerState.threadCounter = THREAD_SIZE;
  queue.unshift(job); // Re-queue job
}
else if (isNoMarkdownError) {
  workerState.noMarkdownFailCounter++;
  if (failCounter >= MAX_FAILS) {
    // Trigger NEW_THREAD
  } else {
    // Retry with reminder prompt
    job.inputData += "\n\n" + REMINDER_PROMPT;
    queue.unshift(job);
  }
}
```

#### 4. **HTTP Endpoints**
```typescript
GET  /api/next-job?workerId=xxx     // Poll for next job
POST /api/complete-job              // Mark job as complete
POST /api/fail-job                  // Mark job as failed (with retry logic)
POST /api/workflow-update           // Update UI status message
GET  /api/status                    // Get current processing state
```

---

## 🎨 Chrome Extension Structure

### **Manifest v3 Configuration**
```json
{
  "manifest_version": 3,
  "permissions": ["sidePanel", "tabs", "storage", "scripting", "downloads"],
  "host_permissions": ["https://ai-platform.com/*", "http://localhost:3000/*"],
  "background": { "service_worker": "background.js" },
  "side_panel": { "default_path": "index.html" },
  "content_scripts": [{
    "matches": ["https://ai-platform.com/*"],
    "js": ["content.js"]
  }]
}
```

### **File Structure**
```
extension/
├── src/
│   ├── App.tsx              # Side panel UI (React)
│   ├── background/
│   │   └── index.ts         # Background service worker
│   └── content/
│       └── index.ts         # Content script (DOM automation)
├── public/
│   └── manifest.json
└── dist/                    # Built extension (load in Chrome)
```

---

## 🤖 Background Script (`background/index.ts`)

### **Responsibilities:**
- ✅ Poll backend for jobs every 2 seconds
- ✅ Manage Perplexity tab (create/reuse)
- ✅ Inject content script dynamically
- ✅ Send jobs to content script
- ✅ Handle timeouts (15 minutes for AI thinking)
- ✅ Report results back to backend

### **Key Implementation:**
```typescript
let isProcessing = false;
let pollingIntervalId: number | null = null;
const injectedTabs = new Set<number>();
let workerId: string = 'worker_' + Math.random().toString(36);

// Poll for jobs
async function pollForJobs() {
  if (isProcessing) return;

  const response = await fetch(`/api/next-job?workerId=${workerId}`);
  const { job } = await response.json();

  if (job) await processJob(job);
}

// Process job with timeout
async function processJob(job: JobPayload) {
  isProcessing = true;

  // Find or create AI platform tab
  let tabs = await chrome.tabs.query({ url: AI_PLATFORM_URL });
  let tabId = tabs[0]?.id || (await chrome.tabs.create({ url: AI_PLATFORM_URL })).id;

  // Inject content script if needed
  if (!injectedTabs.has(tabId)) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    injectedTabs.add(tabId);
  }

  // Send job to content script with 15-min timeout
  try {
    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_JOB', payload: job }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 900000))
    ]);

    // Report success
    await fetch('/api/complete-job', {
      method: 'POST',
      body: JSON.stringify({ rowId: job.rowId, result: response.result, workerId })
    });
  } catch (error) {
    // Report failure
    await fetch('/api/fail-job', {
      method: 'POST',
      body: JSON.stringify({ rowId: job.rowId, error: error.message, workerId })
    });
  } finally {
    isProcessing = false;
  }
}
```

---

## 🎯 Content Script (`content/index.ts`)

### **Responsibilities:**
- ✅ Manipulate AI platform DOM directly
- ✅ Handle 3 job types: INIT, NEW_THREAD, NORMAL
- ✅ Wait for AI to finish thinking
- ✅ Extract results from response
- ✅ Visual feedback (highlight elements)

### **Job Types:**

#### **1. INIT Job** (rowId = -1)
- Sent when worker first starts OR after NEW_THREAD
- Inject initialization prompt
- Wait for AI response
- Return success (no extraction needed)

#### **2. NEW_THREAD Job** (rowId = -2)
- Click "New Thread" button on AI platform
- Do NOT inject any prompt
- Return immediately after click
- Backend will reset counters and send INIT next

#### **3. NORMAL Job** (rowId > 0)
- Inject user prompt
- Wait for AI response
- Extract result from specific markdown element
- Return parsed data

### **Key Implementation:**

```typescript
async function executeJob(job: JobPayload) {
  // 1. Zoom out for better visibility
  document.body.style.zoom = '1';

  // 2. Handle NEW_THREAD job - ONLY click button
  if (job.type === 'NEW_THREAD') {
    const newThreadBtn = document.querySelector('[data-testid="new-thread-button"]');
    newThreadBtn.scrollIntoView();
    highlightElement(newThreadBtn); // Visual feedback
    newThreadBtn.click();
    await sleep(3000);
    return { status: 'NEW_THREAD_BUTTON_CLICKED' };
  }

  // 3. Find input field
  const input = await waitForElement('#prompt-input');
  highlightElement(input);

  // 4. Inject prompt
  input.textContent = job.inputData;
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));

  // 5. Submit
  const submitBtn = await waitForElement('button[aria-label="Submit"]');
  highlightElement(submitBtn);
  submitBtn.click();

  // 6. Wait for AI to finish
  await waitForAIFinish();

  // 7. Handle INIT job - just return success
  if (job.type === 'INIT') {
    return { status: 'INIT_COMPLETED' };
  }

  // 8. Extract result for NORMAL job
  const allMarkdowns = document.querySelectorAll('[id^="markdown-content-"]');
  const latestMarkdown = allMarkdowns[allMarkdowns.length - 1]; // Use LAST response

  highlightElement(latestMarkdown); // Green border for visibility

  const codeBlock = latestMarkdown.querySelector('pre > code');
  if (!codeBlock) throw new Error('No code block found');

  // 9. Parse result
  const result = parseCodeBlock(codeBlock.textContent);
  return result;
}

// Wait for AI to finish thinking
async function waitForAIFinish() {
  const startTime = Date.now();
  let wasThinking = false;

  while (Date.now() - startTime < 15 * 60 * 1000) { // 15 min timeout
    const stopButton = document.querySelector('[data-testid="stop-button"]');
    const isThinking = stopButton && stopButton.offsetParent !== null;

    if (isThinking) {
      wasThinking = true;
      highlightElement(stopButton); // Show it's thinking
    }

    // AI finished if stop button disappeared after being visible
    if (wasThinking && !isThinking) {
      return; // Done!
    }

    await sleep(500);
  }

  throw new Error('AI timeout after 15 minutes');
}

// Visual feedback helper
function highlightElement(element: HTMLElement) {
  element.style.outline = '3px solid red';
  element.style.boxShadow = '0 0 10px red';
  setTimeout(() => {
    element.style.outline = '';
    element.style.boxShadow = '';
  }, 1000);
}
```

---

## 🎨 Extension UI (`App.tsx`)

### **Features:**
- ✅ File upload interface
- ✅ Real-time progress tracking
- ✅ Live logs with auto-scroll
- ✅ Success/failure counters
- ✅ Workflow step display
- ✅ Download results button

### **State Management:**
```typescript
interface ProcessingState {
  total: number;
  processed: number;
  current: number;
  status: 'IDLE' | 'PROCESSING' | 'COMPLETED';
  success: number;
  failed: number;
  activeThreads: number;
  workflowStep: string;
}

// Poll backend every 1 second for state updates
useEffect(() => {
  const interval = setInterval(async () => {
    const response = await fetch('/api/status');
    const state = await response.json();
    setState(state);
  }, 1000);
  return () => clearInterval(interval);
}, []);
```

### **Key UI Elements:**
```tsx
<FileInput onChange={setFile} accept=".xlsx" />
<Button onClick={handleUpload}>Upload & Start</Button>
<Progress value={(processed / total) * 100} />
<Badge>{status}</Badge>
<Text>Success: {success} | Failed: {failed}</Text>
<ScrollArea>
  {logs.map(log => <Text>{log.time} - {log.message}</Text>)}
</ScrollArea>
<Button onClick={handleDownload}>Download Result</Button>
```

---

## ⚙️ Configuration & Constants

### **Shared Constants** (`shared/constants.ts`)
```typescript
export const API_CONFIG = {
  BASE_URL: 'http://localhost:3000',
  ENDPOINTS: {
    NEXT_JOB: '/api/next-job',
    COMPLETE_JOB: '/api/complete-job',
    FAIL_JOB: '/api/fail-job',
    STATUS: '/api/status',
  },
  POLLING_INTERVAL: 2000, // Poll every 2 seconds
};

export const AUTOMATION_CONFIG = {
  AI_PLATFORM_URL: 'https://www.perplexity.ai/',
  SELECTORS: {
    INPUT: '#ask-input',
    SUBMIT_BUTTON: 'button[aria-label="Submit"]',
    STOP_BUTTON: 'button[data-testid="stop-generating-response-button"]',
    NEW_THREAD_BUTTON: 'button[data-testid="sidebar-new-thread"]',
    MARKDOWN_CONTENT: '[id^="markdown-content-"]',
    CODE_BLOCK: 'pre > code',
  },
  TIMEOUTS: {
    ELEMENT_WAIT: 30000,      // 30s to find element
    AI_THINKING: 900000,      // 15 min for AI response
    POLL_INTERVAL: 500,       // Check AI status every 500ms
  },
};

export const THREAD_SIZE = 20;           // NEW_THREAD every 20 jobs
export const MAX_NO_MARKDOWN_FAILS = 10; // Trigger NEW_THREAD after 10 fails
```

---

## 🔄 Workflow Sequence

### **Complete Job Lifecycle:**

1. **User uploads file** → Backend loads queue
2. **Extension starts polling** → GET /api/next-job
3. **Backend checks worker state:**
   - Not initialized? → Send INIT job (rowId = -1)
   - Thread counter = THREAD_SIZE? → Send NEW_THREAD job (rowId = -2)
   - Otherwise → Send next NORMAL job
4. **Background script receives job** → Sends to content script
5. **Content script executes:**
   - INIT: Inject prompt → Wait → Return success
   - NEW_THREAD: Click button → Return immediately
   - NORMAL: Inject → Wait → Extract → Return result
6. **Background reports result** → POST /api/complete-job or /api/fail-job
7. **Backend updates state:**
   - Success: Increment counters, write to data
   - Failure: Apply retry logic or trigger NEW_THREAD
8. **Repeat** until queue is empty



---

## 🛡️ Error Handling & Recovery

### **Timeout Handling:**
```typescript
// In background script
catch (error) {
  if (error.message.includes('timeout')) {
    // Auto-download current progress
    const response = await fetch('/api/download');
    const blob = await response.blob();
    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename: `backup_${timestamp}.xlsx`
    });

    // Trigger NEW_THREAD
    await fetch('/api/fail-job', {
      method: 'POST',
      body: JSON.stringify({
        rowId: job.rowId,
        error: 'timeout - triggering NEW_THREAD'
      })
    });
  }
}
```

### **No Markdown Error:**
```typescript
// In backend QueueService
if (error.includes('No code block found')) {
  noMarkdownFailCounter++;

  if (noMarkdownFailCounter >= MAX_NO_MARKDOWN_FAILS) {
    // Trigger NEW_THREAD
    threadCounter = THREAD_SIZE;
    queue.unshift(job); // Re-queue
  } else {
    // Retry with reminder
    job.inputData += "\n\nRemember: Output must be in code block format!";
    queue.unshift(job);
  }
}
```

---

## 📊 State Tracking & Monitoring

### **Backend State:**
```typescript
interface ProcessingState {
  total: number;           // Total jobs in queue
  processed: number;       // Jobs completed (success + failed)
  current: number;         // Current job rowId
  status: 'IDLE' | 'PROCESSING' | 'COMPLETED';
  success: number;         // Successfully completed
  failed: number;          // Permanently failed (no retry)
  activeThreads: number;   // Jobs currently being processed
  workflowStep: string;    // Human-readable status message
}
```

### **Workflow Updates:**
```typescript
// Send updates from content script
function sendUpdate(step: string) {
  chrome.runtime.sendMessage({
    type: 'WORKFLOW_UPDATE',
    payload: { step }
  });
}

// Examples:
sendUpdate('Finding Input');
sendUpdate('Injecting Prompt');
sendUpdate('Waiting for AI Response');
sendUpdate('Extracting Result');
```

---

## 🎯 Key Differences from WebSocket Approach

### **HTTP Polling Advantages:**
✅ Simpler implementation (no WebSocket server)
✅ Better for Chrome extensions (service workers sleep)
✅ Automatic reconnection (just keep polling)
✅ Easier debugging (standard HTTP requests)

### **Implementation:**
```typescript
// Extension polls backend every 2 seconds
setInterval(async () => {
  if (!isProcessing) {
    const job = await fetch('/api/next-job?workerId=xxx');
    if (job) processJob(job);
  }
}, 2000);
```

---

## 🚀 Deployment Checklist

### **Backend:**
- [ ] Implement QueueService with worker state tracking
- [ ] Add HTTP polling endpoints
- [ ] Implement retry logic with NEW_THREAD triggers
- [ ] Add state management and workflow updates
- [ ] Test with multiple workers (multi-tab)

### **Extension:**
- [ ] Build manifest.json with correct permissions
- [ ] Implement background script with polling
- [ ] Implement content script with DOM automation
- [ ] Build UI with React + Mantine
- [ ] Test on target AI platform
- [ ] Build extension: `npm run build`
- [ ] Load in Chrome: `chrome://extensions` → Load unpacked → `dist/`

### **Testing:**
- [ ] Single job processing
- [ ] INIT job flow
- [ ] NEW_THREAD trigger (after N jobs)
- [ ] Timeout recovery (15 min)
- [ ] No markdown error retry
- [ ] Multi-tab processing
- [ ] State persistence across restarts

---

## 📝 Platform-Specific Adaptations

### **For Thread Overview (or other AI platforms):**

1. **Update selectors** in `AUTOMATION_CONFIG`:
   ```typescript
   SELECTORS: {
     INPUT: '#thread-overview-input',           // Find actual selector
     SUBMIT_BUTTON: 'button.submit-btn',        // Inspect element
     STOP_BUTTON: '[aria-label="Stop"]',        // Check DOM
     NEW_THREAD_BUTTON: '.new-conversation',    // Platform-specific
     RESPONSE_CONTAINER: '.ai-response',        // Where AI writes
   }
   ```

2. **Adjust wait logic** for AI thinking:
   ```typescript
   // Some platforms use different indicators
   const isThinking = document.querySelector('.loading-spinner') !== null;
   // OR
   const isThinking = submitButton.disabled === true;
   // OR
   const isThinking = responseContainer.classList.contains('streaming');
   ```

3. **Update extraction logic**:
   ```typescript
   // If platform doesn't use markdown IDs, use other methods:
   const responses = document.querySelectorAll('.message.assistant');
   const latestResponse = responses[responses.length - 1];
   const codeBlock = latestResponse.querySelector('code');
   ```

4. **Test NEW_THREAD button**:
   - Inspect element to find correct selector
   - Test click event (some platforms use React synthetic events)
   - May need to dispatch MouseEvent instead of .click()

---

## 🎓 Learning Resources

### **Chrome Extension APIs:**
- `chrome.tabs` - Tab management
- `chrome.scripting` - Dynamic script injection
- `chrome.runtime.sendMessage` - Communication
- `chrome.storage.local` - Persist worker ID

### **DOM Automation:**
- `querySelector` / `querySelectorAll` - Find elements
- `MutationObserver` - Watch for DOM changes
- `dispatchEvent` - Trigger events programmatically
- `scrollIntoView` - Ensure element visibility

### **Debugging:**
- Extension background: `chrome://extensions` → Inspect service worker
- Content script: Right-click page → Inspect → Console
- Network: Check API calls in DevTools Network tab
- Logs: Use `console.log` extensively with prefixes

---

## ✅ Success Criteria

Your implementation is complete when:

- ✅ Extension can process 100+ jobs without manual intervention
- ✅ NEW_THREAD triggers automatically every N jobs
- ✅ Timeout recovery works (15 min limit)
- ✅ Retry logic handles "no markdown" errors
- ✅ Multi-tab processing works (multiple workers)
- ✅ UI shows real-time progress and logs
- ✅ State persists across browser restarts
- ✅ Download works at any time during processing

---

## 🔗 Reference Implementation

This guide is based on the **EnhanceUnits** project structure:
- Backend: `backend/src/services/QueueService.ts`
- Background: `extension/src/background/index.ts`
- Content: `extension/src/content/index.ts`
- UI: `extension/src/App.tsx`

**Key insight:** The system uses HTTP polling instead of WebSocket because Chrome extension service workers can sleep, breaking persistent connections. Polling is more reliable for this use case.

---

## 🎯 Next Steps

1. **Clone this architecture** for your AI platform
2. **Update selectors** to match your platform's DOM
3. **Test INIT → NORMAL → NEW_THREAD flow** manually first
4. **Add your business logic** (data parsing, validation, etc.)
5. **Deploy and monitor** with extensive logging

Good luck! 🚀