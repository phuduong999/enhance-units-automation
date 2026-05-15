# AI Automation Knowledge Base - Lessons Learned from Production

> **Context**: Kinh nghiệm từ việc build Chrome Extension tự động hóa Perplexity AI để xử lý 1000+ jobs/ngày
> **Purpose**: Knowledge base để AI assistant hiểu cách tiếp cận khi build tương tự cho platform khác

---

## 🎯 Core Concept: Job-Based Architecture

### **Insight #1: Tách biệt Backend và Extension**
- **Backend**: Chỉ quản lý queue + state, KHÔNG biết gì về DOM hay AI platform
- **Extension**: Chỉ thực thi jobs, KHÔNG biết gì về business logic
- **Communication**: HTTP polling (2s interval) - đơn giản hơn WebSocket cho Chrome extension

**Why**: Chrome service workers có thể sleep → WebSocket bị disconnect → Polling reliable hơn

---

## 🔍 DOM Automation Patterns

### **Insight #2: Selector Strategy - Từ Specific → Generic**

Khi tìm elements, thử theo thứ tự:
```typescript
// 1. Data attributes (most stable)
'[data-testid="submit-button"]'

// 2. ID (if unique)
'#ask-input'

// 3. ARIA labels (accessibility)
'button[aria-label="Submit"]'

// 4. Class patterns (less stable)
'[class*="submit-btn"]'

// 5. Tag + position (last resort)
'button:nth-of-type(2)'
```

**Lesson**: Perplexity dùng `data-testid` → rất stable. Nếu platform khác không có, inspect kỹ để tìm pattern ít thay đổi nhất.

---

### **Insight #3: Wait Strategy - Polling với Timeout**

```typescript
async function waitForElement(selector: string, timeout = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(500); // Poll every 500ms
  }
  
  throw new Error(`Element ${selector} not found after ${timeout}ms`);
}
```

**Why NOT MutationObserver**: 
- Phức tạp hơn
- Có thể miss events nếu element đã tồn tại
- Polling đơn giản và đủ (500ms không ảnh hưởng UX)

---

### **Insight #4: Detect AI "Thinking" State**

**Pattern tìm được**: Perplexity có "Stop" button khi đang generate
```typescript
async function waitForAIFinish() {
  let wasThinking = false;
  
  while (true) {
    const stopBtn = document.querySelector('[data-testid="stop-button"]');
    const isThinking = stopBtn && stopBtn.offsetParent !== null; // visible check
    
    if (isThinking) wasThinking = true;
    
    // AI finished = button was visible, now gone
    if (wasThinking && !isThinking) return;
    
    await sleep(500);
  }
}
```

**Key insight**: 
- `offsetParent !== null` = element visible (không bị `display: none`)
- Phải track `wasThinking` vì button có thể chưa xuất hiện ngay

**Adaptation**: Mỗi platform khác nhau:
- ChatGPT: Submit button `disabled` khi thinking
- Claude: Loading spinner xuất hiện
- Thread Overview: Cần inspect để tìm indicator

---

### **Insight #5: Visual Feedback - Debug Tool Quan Trọng**

```typescript
function highlightElement(el: HTMLElement) {
  el.style.outline = '3px solid red';
  el.style.boxShadow = '0 0 10px red';
  setTimeout(() => {
    el.style.outline = '';
    el.style.boxShadow = '';
  }, 1000);
}
```

**Why**: 
- Khi automation chạy, PHẢI thấy được nó đang làm gì
- Debug nhanh hơn (thấy ngay element nào được click)
- User confidence (biết extension đang hoạt động)

**Production tip**: Dùng màu khác nhau:
- 🔴 Red = đang tương tác (input, button)
- 🟢 Green = đang extract data
- 🟡 Yellow = đang wait

---

## 🔄 Job Lifecycle Management

### **Insight #6: 3 Job Types Pattern**

```typescript
type JobType = 'INIT' | 'NEW_THREAD' | 'NORMAL';

// INIT (rowId = -1): Initialize AI context
// NEW_THREAD (rowId = -2): Reset conversation
// NORMAL (rowId > 0): Actual work
```

**Why 3 types**:
1. **INIT**: AI cần context trước khi làm việc (như prompt template)
2. **NEW_THREAD**: AI "mệt" sau nhiều jobs → cần reset
3. **NORMAL**: Job thực tế

**Critical**: NEW_THREAD chỉ click button, KHÔNG inject prompt. Sau đó backend tự động gửi INIT job mới.

---

### **Insight #7: Thread Counter - Prevent AI Fatigue**

```typescript
if (threadCounter > 0 && threadCounter % THREAD_SIZE === 0) {
  return { type: 'NEW_THREAD' };
}
```

**Discovery**: 
- Perplexity sau ~30 jobs bắt đầu "quên" instructions
- Response quality giảm
- Lỗi "no code block" tăng

**Solution**: Force NEW_THREAD mỗi 20-30 jobs

**Tuning**: 
- Test với 5 jobs (test mode)
- Production: 20-30 jobs
- Tùy platform: ChatGPT có thể handle nhiều hơn, Claude ít hơn

---

### **Insight #8: Markdown Counter - Extract Đúng Response**

**Problem**: Perplexity tạo `<div id="markdown-content-0">`, `markdown-content-1`, etc.
- Sau NEW_THREAD, counter KHÔNG reset về 0
- Nếu dùng counter để extract → sai response

**Solution**: Luôn lấy LAST element
```typescript
const allMarkdowns = document.querySelectorAll('[id^="markdown-content-"]');
const latestResponse = allMarkdowns[allMarkdowns.length - 1];
```

**Lesson**: KHÔNG tin vào counter/index, luôn dùng "latest" logic

---

## 🛡️ Error Handling Patterns

### **Insight #9: Timeout Strategy - 15 Minutes**

```typescript
Promise.race([
  executeJob(job),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('timeout')), 900000) // 15 min
  )
])
```

**Why 15 minutes**:
- AI có thể suy nghĩ lâu với complex prompts
- 5 min: quá ngắn, nhiều false positives
- 30 min: quá lâu, block queue
- 15 min: sweet spot

**On timeout**:
- Auto-download current progress (backup)
- Trigger NEW_THREAD
- Re-queue job

---

### **Insight #10: Retry Logic - Smart vs Dumb**

**Dumb retry**: Cứ fail là retry → infinite loop

**Smart retry**:
```typescript
if (error.includes('timeout')) {
  // Timeout = AI issue → NEW_THREAD
  threadCounter = THREAD_SIZE;
  queue.unshift(job);
}
else if (error.includes('No code block')) {
  failCounter++;
  if (failCounter >= 10) {
    // Too many fails → NEW_THREAD
    threadCounter = THREAD_SIZE;
  } else {
    // Retry with reminder
    job.inputData += '\n\nREMINDER: Use code block!';
    queue.unshift(job);
  }
}
else {
  // Unknown error → mark as failed, don't retry
  markAsFailed(job);
}
```

**Key**: Phân loại error để xử lý khác nhau
- Timeout → AI problem → reset thread
- No markdown → AI forgot instruction → remind
- Other → code bug → don't retry

---

### **Insight #11: Reminder Prompt - Gentle Nudge**

```typescript
const REMINDER = `Remember: Output must be in code block format!`;
job.inputData += '\n\n' + REMINDER;
```

**Discovery**: 
- AI đôi khi "quên" format
- Thêm reminder vào cuối prompt → success rate tăng 80%
- Không cần re-initialize toàn bộ

**Best practice**: Reminder ngắn gọn, specific về lỗi

---

## 🔧 Worker State Management

### **Insight #12: Per-Worker State - Multi-Tab Support**

```typescript
private workerStates: Map<string, WorkerState> = new Map();

interface WorkerState {
  threadCounter: number;
  markdownCounter: number;
  noMarkdownFailCounter: number;
  isInitialized: boolean;
  activeRowId: number | null;
}
```

**Why**: 
- User có thể mở nhiều tabs
- Mỗi tab = 1 worker
- State phải tách biệt

**Implementation**:
- Worker ID = random string, lưu trong `chrome.storage.local`
- Backend track state per worker
- Mỗi request gửi `?workerId=xxx`

---

### **Insight #13: Active Job Tracking - Prevent Duplicates**

```typescript
private activeJobs: Map<number, RowData> = new Map();

// Before dispatching
if (activeJobs.has(rowId)) {
  console.warn('Job already active, skipping');
  return null;
}

activeJobs.set(rowId, job);
```

**Why**: 
- Nếu extension crash, job vẫn trong activeJobs
- Prevent duplicate processing
- Clean up on complete/fail

---

## 🎨 UI/UX Patterns

### **Insight #14: Real-time Logs - Critical for Debug**

```typescript
const [logs, setLogs] = useState<Log[]>([]);

function addLog(message: string, type: 'info' | 'warning' | 'error') {
  const time = new Date().toLocaleTimeString();
  setLogs(prev => [...prev.slice(-100), { time, message, type }]);
}
```

**Why**:
- User cần thấy progress
- Debug khi có lỗi
- Confidence (biết system đang làm gì)

**Best practice**:
- Keep last 100 logs (performance)
- Auto-scroll to bottom
- Color-code by type

---

### **Insight #15: Workflow Step Updates**

```typescript
// From content script
sendUpdate('Finding Input');
sendUpdate('Injecting Prompt');
sendUpdate('Waiting for AI Response');
sendUpdate('Extracting Result');
```

**Why**:
- Logs = technical
- Workflow step = user-friendly
- Show current action in UI

---

## 🚀 Performance Patterns

### **Insight #16: Polling Interval - Balance**

- **Backend status**: 1s (UI updates)
- **Job polling**: 2s (không spam server)
- **Element wait**: 500ms (responsive enough)
- **AI thinking check**: 500ms (catch stop button)

**Lesson**: Không cần real-time, 500ms-2s là đủ cho automation

---

### **Insight #17: Dynamic Script Injection**

```typescript
const injectedTabs = new Set<number>();

if (!injectedTabs.has(tabId)) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
  injectedTabs.add(tabId);
}
```

**Why**: 
- Content script có thể chưa load (tab mới)
- Inject programmatically = reliable
- Track injected tabs = avoid duplicate injection

---

## 🎓 Platform Adaptation Guide

### **Insight #18: Inspect First, Code Later**

**Process**:
1. Mở platform (Thread Overview)
2. Inspect elements (F12)
3. Test selectors trong Console:
   ```javascript
   document.querySelector('[data-testid="input"]')
   ```
4. Test click events:
   ```javascript
   document.querySelector('button').click()
   ```
5. Observe AI thinking indicator
6. Find response container

**Common patterns**:
- Input: `textarea`, `contenteditable div`, `input[type="text"]`
- Submit: `button[type="submit"]`, `button[aria-label="Send"]`
- Thinking: Loading spinner, disabled button, "Stop" button
- Response: `div.message`, `div.response`, `[role="article"]`

---

## ✅ Production Checklist

### **Insight #19: Test Mode First**

```typescript
const TEST_CONFIG = {
  THREAD_SIZE: 5,           // vs 20 in production
  MAX_NO_MARKDOWN_FAILS: 3, // vs 10 in production
};
```

**Why**:
- Test NEW_THREAD logic nhanh hơn (5 jobs thay vì 20)
- Test retry logic nhanh hơn (3 fails thay vì 10)
- Validate flow trước khi chạy production

---

### **Insight #20: Extensive Logging**

```typescript
console.log(`[${workerId}] Job ${rowId} started`);
console.log(`[${workerId}] ThreadCounter: ${threadCounter}`);
console.log(`[${workerId}] MarkdownCounter: ${markdownCounter}`);
```

**Pattern**: `[WorkerID] Action: Details`

**Why**:
- Multi-worker debugging
- Trace job lifecycle
- Find bottlenecks

---

## 🎯 Key Takeaways

1. **Architecture**: Backend = queue, Extension = executor, HTTP polling = glue
2. **Selectors**: data-testid > ID > ARIA > class > tag
3. **Waiting**: Polling with timeout > MutationObserver
4. **AI State**: Find "thinking" indicator, track wasThinking
5. **Jobs**: 3 types (INIT/NEW_THREAD/NORMAL), special rowIds (-1/-2)
6. **Thread Management**: Counter-based, force reset every N jobs
7. **Extraction**: Always use "latest" element, don't trust counters
8. **Errors**: Classify (timeout/no-markdown/other), handle differently
9. **Retry**: Smart retry with reminder, max attempts, NEW_THREAD fallback
10. **State**: Per-worker tracking, prevent duplicates
11. **UX**: Visual feedback, real-time logs, workflow steps
12. **Testing**: Test mode with smaller thresholds first

---

## 💡 When Adapting to New Platform

**Questions to answer**:
1. ✅ Input selector? (inspect element)
2. ✅ Submit button selector?
3. ✅ How to detect AI thinking? (spinner? disabled button? stop button?)
4. ✅ Where is response? (div? markdown? code block?)
5. ✅ New thread button? (selector + click test)
6. ✅ Does platform reset IDs after new thread? (test manually)
7. ✅ What errors can happen? (no response? rate limit? timeout?)
8. ✅ How long does AI think? (adjust timeout)

**Then**:
- Update `AUTOMATION_CONFIG.SELECTORS`
- Adjust `waitForAIFinish()` logic
- Test INIT → NORMAL → NEW_THREAD flow manually
- Add platform-specific error handling
- Tune THREAD_SIZE and timeouts

---

**End of Knowledge Base** 🚀

