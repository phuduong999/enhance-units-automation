# Perplexity Automation - Knowledge Base

**Version:** 1.0.0  
**Last Updated:** 2025-11-18  
**Purpose:** Complete reference for Perplexity.ai DOM structure, automation workflow, and Excel integration

---

## 📋 Table of Contents

1. [DOM Structure & Selectors](#1-dom-structure--selectors)
2. [Automation Workflow](#2-automation-workflow)
3. [Excel Integration](#3-excel-integration)
4. [Timing & Delays](#4-timing--delays)
5. [Message Passing](#5-message-passing)
6. [Storage Management](#6-storage-management)
7. [Error Handling](#7-error-handling)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. DOM Structure & Selectors

### 1.1 Input Field (Lexical Editor)

**Primary Selector:**
```css
#ask-input
```

**Element Type:** `<div>` with Lexical editor  
**Attributes:**
- `contenteditable="true"`
- `data-lexical-editor="true"`
- `role="textbox"`

**How to Interact:**
```javascript
// Find element
const input = document.querySelector('#ask-input');

// Set content (Lexical editor)
input.textContent = 'your prompt here';

// Trigger input event
input.dispatchEvent(new InputEvent('input', {
  bubbles: true,
  cancelable: false,
  inputType: 'insertText',
  data: 'your prompt here'
}));

// Focus
input.focus();
```

**Wait Strategy:**
- Wait for element to exist: `document.querySelector('#ask-input')`
- Wait for `contenteditable="true"` attribute
- No specific loading state needed

---

### 1.2 Submit Button

**Selectors (Priority Order):**
```css
1. button[aria-label="Submit"]              /* Primary */
2. button[data-testid="submit-button"]      /* Fallback 1 */
3. button[type="submit"]                    /* Fallback 2 */
4. form button[type="button"]               /* Fallback 3 */
5. button:has(svg)                          /* Fallback 4 */
6. button[aria-label*="ubmit"]              /* Fallback 5 */
7. button.submit                            /* Fallback 6 */
```

**Button States:**
- **READY:** Button enabled, ready to submit
- **THINKING:** Button disabled (`disabled` attribute or `aria-disabled="true"`)
- **NOT_FOUND:** Button not found in DOM

**How to Detect State:**
```javascript
const button = document.querySelector('button[aria-label="Submit"]');
const isDisabled = button.hasAttribute('disabled') || 
                   button.getAttribute('aria-disabled') === 'true';
const state = isDisabled ? 'THINKING' : 'READY';
```

**How to Click:**
```javascript
// Scroll into view
button.scrollIntoView({ behavior: 'instant', block: 'center' });

// Focus
button.focus();

// Click
button.click();

// Dispatch mouse events (for reliability)
button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
```

---

### 1.3 Stop Generating Button (AI Thinking Indicator)

**Selector:**
```css
button[data-testid="stop-generating-response-button"]
```

**Purpose:** Indicates AI is currently generating response

**How to Detect AI State:**
```javascript
const stopButton = document.querySelector('button[data-testid="stop-generating-response-button"]');

if (!stopButton) {
  // AI not thinking (or button not found)
  return false;
}

const isDisabled = stopButton.hasAttribute('disabled');
const isVisible = stopButton.offsetParent !== null;

// AI is thinking if button exists, visible, and NOT disabled
const isThinking = isVisible && !isDisabled;
```

**Wait Strategy:**
```javascript
// Wait for AI to finish thinking
while (true) {
  const stopButton = document.querySelector('button[data-testid="stop-generating-response-button"]');
  const isThinking = stopButton && 
                     stopButton.offsetParent !== null && 
                     !stopButton.hasAttribute('disabled');
  
  if (!isThinking) {
    break; // AI finished
  }
  
  await sleep(500); // Check every 500ms
}
```

---

### 1.4 New Thread Button

**Selector (XPath):**
```xpath
(//button[@data-testid="sidebar-new-thread"])[1]
```

**Why XPath:** Multiple buttons may exist, we need the FIRST one

**CSS Selector (Alternative):**
```css
button[data-testid="sidebar-new-thread"]
```

**How to Click (XPath Method):**
```javascript
const xpath = '(//button[@data-testid="sidebar-new-thread"])[1]';
const button = document.evaluate(
  xpath,
  document,
  null,
  XPathResult.FIRST_ORDERED_NODE_TYPE,
  null
).singleNodeValue;

if (button) {
  button.click();
}
```

**Validation Before Click:**
```javascript
// Check if visible
if (!button.offsetParent) {
  console.error('Button not visible');
  return false;
}

// Check if disabled
if (button.hasAttribute('disabled')) {
  console.error('Button disabled');
  return false;
}
```

---

### 1.5 Markdown Content (AI Response)

**Selector Pattern:**
```css
#markdown-content-{N}
```

Where `{N}` is an incrementing counter (0, 1, 2, 3, ...)

**Structure:**
```html
<div id="markdown-content-0">
  <pre>
    <code>
      {"tags": ["Fruits"]}
    </code>
  </pre>
</div>
```

**How to Extract:**
```javascript
// Find markdown container
const markdownId = `markdown-content-${counter}`;
const markdownElement = document.querySelector(`#${markdownId}`);

if (!markdownElement) {
  console.error('Markdown element not found');
  return null;
}

// Find code element inside
const codeElement = markdownElement.querySelector('code');

if (!codeElement) {
  console.error('Code element not found');
  return null;
}

// Extract text content
const jsonText = codeElement.textContent.trim();
const parsed = JSON.parse(jsonText);
return parsed.tags;
```

**Counter Management:**
```javascript
// Start at 0 for first thread
let markdownCounter = 0;

// After each query
markdownCounter++;

// After clicking "New Thread"
markdownCounter = 1; // Reset to 1 (not 0, because initial prompt response is at index 1)
```

---

## 2. Automation Workflow

### 2.1 Complete Workflow Steps

```
1. Load Excel File
   ↓
2. Parse Excel (find REVIEW rows)
   ↓
3. Open Perplexity Tab
   ↓
4. Wait for page load (2s)
   ↓
5. Send Full Prompt + Ingredient #1
   ↓
6. Click Submit
   ↓
7. Wait for AI to finish thinking
   ↓
8. Extract markdown-content-{N}
   ↓
9. Parse JSON tags
   ↓
10. Write tags to Excel
   ↓
11. Update status to "OK"
   ↓
12. Send Ingredient #2 (no prompt)
   ↓
13. Repeat steps 6-11 for rows 2-50
   ↓
14. Click "New Thread" (row 51)
   ↓
15. Send Full Prompt again
   ↓
16. Continue until all rows processed
   ↓
17. Download processed Excel file
   ↓
18. Load next Excel file (Part 2)
   ↓
19. Repeat until all 12 files done
```

### 2.2 Thread Management

**Thread Lifecycle:**
```
Thread 1:
  - Row 1: Send full prompt + ingredient
  - Rows 2-50: Send ingredient only
  - Markdown counter: 0, 1, 2, ..., 49

Thread 2 (after "New Thread"):
  - Send full prompt (no ingredient)
  - Wait 10s for response
  - Row 51: Send ingredient only
  - Rows 52-100: Send ingredient only
  - Markdown counter: 1, 2, 3, ..., 50
```

**Why Reset Counter to 1?**
- After clicking "New Thread", the initial prompt response is at `markdown-content-1`
- Not `markdown-content-0` (that's from previous thread)

### 2.3 Prompt Format

**First Row in Thread:**
```
{FULL_PROMPT_CONTENT}

{INGREDIENT_NAME}
```

**Subsequent Rows:**
```
{INGREDIENT_NAME}
```

**Example:**
```javascript
// Row 1 in thread
const prompt = `${promptContent}\n\nBen's Original Mexican Style Rice`;

// Row 2 in thread
const prompt = `Heinz Tomato Ketchup`;
```

---

## 3. Excel Integration

### 3.1 Excel File Structure

**Columns:**
```
A: _id (MongoDB ID)
B: Status From BA
C: Status (REVIEW, OK, NOT-OK)
D: Ingredient Name
E: Skip
F-N: Tag columns (9 categories)
```

**Tag Columns (F-N):**
```
F: Wheat
G: Gluten-Free Grains
H: Dairy
I: Tree Nuts
J: Peanuts
K: Nightshades
L: Alliums
M: Dried Herbs & Spices
N: Spicy
```

### 3.2 Loading Excel

**Method 1: From Extension Folder**
```javascript
// Get file URL from extension
const filePath = 'IngredientName/Food Exclusion Tag_RootFile_Part1.xlsx';
const fileUrl = chrome.runtime.getURL(filePath);

// Fetch file
const response = await fetch(fileUrl);
const arrayBuffer = await response.arrayBuffer();

// Parse with XLSX
const workbook = XLSX.read(arrayBuffer, { type: 'array' });
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
```

**Method 2: From User Upload**
```javascript
// File input element
<input type="file" accept=".xlsx" />

// Read file
const file = event.target.files[0];
const arrayBuffer = await file.arrayBuffer();

// Parse
const workbook = XLSX.read(arrayBuffer, { type: 'array' });
```

### 3.3 Finding REVIEW Rows

**Status Patterns:**
```javascript
const STATUS_PATTERNS = {
  REVIEW: /^review$/i,
  NOT_OK: /^not[-\s]?ok[e]?$/i
};

// Check status
const statusCell = worksheet[`C${rowNum}`];
const status = statusCell ? String(statusCell.v).trim() : '';

const isReview = STATUS_PATTERNS.REVIEW.test(status);
const isNotOk = STATUS_PATTERNS.NOT_OK.test(status);

if (isReview || isNotOk) {
  // Process this row
}
```

### 3.4 Writing Tags to Excel

**Tag Mapping:**
```javascript
const TAG_COLUMNS = {
  'Wheat': 'F',
  'Gluten-Free Grains': 'G',
  'Dairy': 'H',
  'Tree Nuts': 'I',
  'Peanuts': 'J',
  'Nightshades': 'K',
  'Alliums': 'L',
  'Dried Herbs & Spices': 'M',
  'Spicy': 'N'
};

// Write tags
const tags = ['Wheat', 'Dairy'];
for (const tag of tags) {
  const column = TAG_COLUMNS[tag];
  if (column) {
    worksheet[`${column}${rowNum}`] = { t: 's', v: 'x' };
  }
}
```

### 3.5 Updating Status

**Mark as OK:**
```javascript
const cellAddress = `C${rowNum}`;
worksheet[cellAddress] = {
  t: 's',
  v: 'OK',
  s: {
    fill: { fgColor: { rgb: 'C6EFCE' } }, // Green background
    font: { bold: true, color: { rgb: '000000' } }
  }
};
```

### 3.6 Downloading Processed File

**Generate Excel File:**
```javascript
// Generate binary
const wbout = XLSX.write(workbook, { 
  bookType: 'xlsx', 
  type: 'array' 
});

// Create blob
const blob = new Blob([wbout], { 
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
});

// Create download link
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'Food Exclusion Tag_RootFile_Part1_PROCESSED.xlsx';
a.click();

// Cleanup
URL.revokeObjectURL(url);
```

---

## 4. Timing & Delays

### 4.1 Standard Delays

```javascript
const TIMING = {
  // Short delays
  DELAY_VERY_SHORT: 50,      // After focus, before action
  DELAY_SHORT: 100,          // Between related actions
  DELAY_MEDIUM: 200,         // After clearing input
  DELAY_STANDARD: 500,       // After setting prompt
  
  // Processing delays
  DELAY_BETWEEN_ROWS: 2000,  // Between processing rows
  DELAY_AFTER_SUBMIT: 500,   // After clicking submit
  DELAY_PAGE_LOAD: 2000,     // After opening Perplexity tab
  DELAY_INITIAL_PROMPT: 10000, // After sending initial prompt to new thread
  DELAY_AI_START: 5000,      // Wait for AI to start thinking
  
  // Polling intervals
  POLL_INTERVAL_FAST: 100,   // Fast polling
  POLL_INTERVAL_STANDARD: 500, // Standard polling (AI thinking check)
  POLL_INTERVAL_SLOW: 2000,  // Slow polling
  
  // Timeouts
  TIMEOUT_ELEMENT_WAIT: 30000,   // 30s to find element
  TIMEOUT_BUTTON_STATE: 60000,   // 60s for button state change
  TIMEOUT_MARKDOWN_WAIT: 60000,  // 60s for markdown content
  TIMEOUT_AI_THINKING: 1800000   // 30 minutes for AI response
};
```

### 4.2 Wait Strategies

**Wait for Element:**
```javascript
async function waitForElement(selector, timeout = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
    await sleep(500);
  }
  
  throw new Error(`Element ${selector} not found after ${timeout}ms`);
}
```

**Wait for AI to Finish:**
```javascript
async function waitForAIFinish(timeout = 1800000) {
  const startTime = Date.now();
  let wasThinking = false;
  
  while (Date.now() - startTime < timeout) {
    const stopButton = document.querySelector('button[data-testid="stop-generating-response-button"]');
    const isThinking = stopButton && 
                       stopButton.offsetParent !== null && 
                       !stopButton.hasAttribute('disabled');
    
    if (isThinking) {
      wasThinking = true;
    }
    
    if (wasThinking && !isThinking) {
      return true; // AI finished
    }
    
    await sleep(500);
  }
  
  throw new Error('AI timeout');
}
```

---

## 5. Message Passing

### 5.1 Message Types

```typescript
enum MessageType {
  START_WORKFLOW = 'START_WORKFLOW',
  WORKFLOW_STATUS = 'WORKFLOW_STATUS',
  OPEN_OR_SWITCH_TAB = 'OPEN_OR_SWITCH_TAB',
  GET_MARKDOWN = 'GET_MARKDOWN',
  NEW_THREAD = 'NEW_THREAD',
  CREATE_THREAD = 'CREATE_THREAD',
  START_PROCESSING = 'START_PROCESSING',
  STOP_PROCESSING = 'STOP_PROCESSING',
  DOWNLOAD_CURRENT = 'DOWNLOAD_CURRENT'
}
```

### 5.2 Message Flow

**Popup → Background:**
```javascript
// Start processing
chrome.runtime.sendMessage({
  type: 'START_PROCESSING',
  payload: { partNumber: 1 }
});
```

**Background → Content Script:**
```javascript
// Send prompt to Perplexity
chrome.tabs.sendMessage(tabId, {
  type: 'START_WORKFLOW',
  payload: { prompt: 'ingredient name' }
});
```

**Content Script → Background:**
```javascript
// Return AI response
sendResponse({
  success: true,
  results: { value: '{"tags": ["Fruits"]}' }
});
```

---

## 6. Storage Management

### 6.1 Storage Keys

```javascript
const STORAGE_KEYS = {
  IS_PROCESSING: 'isProcessing',
  PROMPT_SENT: 'promptSent',
  CURRENT_PART: 'currentPart',
  PROCESSING_STATE: 'processingState',
  EXCEL_BUFFER_PREFIX: 'excel_buffer_'
};
```

### 6.2 Saving State

```javascript
// Save processing state
await chrome.storage.local.set({
  processingState: {
    threads: [...],
    currentThread: 'thread-1',
    isProcessing: true
  }
});

// Save Excel buffer
await chrome.storage.local.set({
  [`excel_buffer_${threadId}`]: Array.from(new Uint8Array(buffer))
});
```

### 6.3 Loading State

```javascript
// Load state
const result = await chrome.storage.local.get(['processingState']);
if (result.processingState) {
  // Resume processing
}
```

---

## 7. Error Handling

### 7.1 Common Errors

**Error 1: Input Not Found**
```javascript
if (!input) {
  throw new Error('Input element #ask-input not found');
}
```

**Error 2: Button Not Found**
```javascript
if (!button) {
  throw new Error('Submit button not found');
}
```

**Error 3: AI Timeout**
```javascript
if (Date.now() - startTime > timeout) {
  throw new Error('AI did not respond within timeout');
}
```

**Error 4: Invalid JSON Response**
```javascript
if (!response.includes('{') || !response.includes('tags')) {
  throw new Error('Response does not contain valid JSON');
}
```

### 7.2 Retry Logic

```javascript
const MAX_RETRIES = 3;

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    const result = await processRow(row);
    return result;
  } catch (error) {
    if (attempt === MAX_RETRIES) {
      throw error;
    }
    await sleep(1000 * attempt); // Exponential backoff
  }
}
```

---

## 8. Troubleshooting

### 8.1 Debug Checklist

- [ ] Check if Perplexity tab is open
- [ ] Check if input element exists (`#ask-input`)
- [ ] Check if submit button exists
- [ ] Check if prompt was set correctly (verify length)
- [ ] Check if AI is thinking (stop button state)
- [ ] Check markdown counter (correct index)
- [ ] Check if markdown element exists
- [ ] Check if code element exists inside markdown
- [ ] Check if JSON is valid

### 8.2 Common Issues

**Issue: Prompt not set in input**
- Solution: Check if Lexical editor loaded, use `textContent` instead of `value`

**Issue: Button click doesn't work**
- Solution: Scroll into view first, add mouse events

**Issue: Markdown content not found**
- Solution: Check counter value, wait longer for AI response

**Issue: JSON parse error**
- Solution: Check if AI returned valid JSON, extract from code block

---

**End of Knowledge Base**

