import { AUTOMATION_CONFIG } from 'shared/constants';
import { JobPayload } from 'shared/types';

// Helper to wait for element
function waitForElement(selector: string, timeout = AUTOMATION_CONFIG.TIMEOUTS.ELEMENT_WAIT): Promise<Element> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) resolve(el);
      else if (Date.now() - startTime > timeout) reject(new Error(`Element ${selector} not found`));
      else requestAnimationFrame(check);
    };
    check();
  });
}

// Helper to wait for AI to finish
async function waitForAIFinish() {
  const startTime = Date.now();
  let wasThinking = false;
  let stopButton: HTMLElement | null = null;
  let checkCount = 0;
  
  console.log('Content: ⏳ Waiting for AI to finish...');
  
  while (Date.now() - startTime < AUTOMATION_CONFIG.TIMEOUTS.AI_THINKING) {
    checkCount++;
    
    // Check stop button
    stopButton = document.querySelector(AUTOMATION_CONFIG.SELECTORS.STOP_BUTTON) as HTMLElement;
    const isThinking = stopButton && 
                       stopButton.offsetParent !== null && 
                       !stopButton.hasAttribute('disabled');
    
    // Check if there's already a response (AI finished very quickly)
    const hasResponse = document.querySelector('[class*="markdown-content"]') !== null;
    
    if (checkCount % 10 === 0) { // Log every 5 seconds
      console.log(`Content: Check ${checkCount}: isThinking=${isThinking}, wasThinking=${wasThinking}, hasResponse=${hasResponse}`);
    }
    
    if (isThinking) {
      wasThinking = true;
      // Highlight stop button while thinking
      if (stopButton) {
        highlightElement(stopButton);
      }
    }
    
    // AI finished if:
    // 1. Stop button was visible and now gone, OR
    // 2. Response already exists (AI was too fast)
    if ((wasThinking && !isThinking) || hasResponse) {
      console.log(`Content: ✅ AI finished! (wasThinking=${wasThinking}, hasResponse=${hasResponse})`);
      return; // AI finished
    }
    
    await new Promise(r => setTimeout(r, AUTOMATION_CONFIG.TIMEOUTS.POLL_INTERVAL));
  }
  
  console.error('Content: ❌ AI timeout after 15 minutes');
  throw new Error('AI timeout');
}

// Helper to send workflow update
function sendUpdate(step: string) {
  chrome.runtime.sendMessage({
    type: 'WORKFLOW_UPDATE',
    payload: { step }
  });
}

// Helper to highlight element
function highlightElement(element: HTMLElement) {
  const originalOutline = element.style.outline;
  const originalBoxShadow = element.style.boxShadow;
  
  element.style.outline = '3px solid red';
  element.style.boxShadow = '0 0 10px red';
  
  setTimeout(() => {
    element.style.outline = originalOutline;
    element.style.boxShadow = originalBoxShadow;
  }, 1000);
}

// Main execution function
async function executeJob(job: JobPayload) {
  console.log('Content: Starting job', job);
  console.log('Content: Zooming out...');
  sendUpdate('Zooming out');
  // 1. Zoom out
  document.body.style.zoom = `${AUTOMATION_CONFIG.ZOOM_LEVEL}`;
  console.log('Content: Zoom set to', AUTOMATION_CONFIG.ZOOM_LEVEL);
  await new Promise(resolve => setTimeout(resolve, 500));

  // ========================================
  // CHECK JOB TYPE FIRST - BEFORE INJECTING PROMPT
  // ========================================
  
  // Handle NEW_THREAD job - ONLY CLICK BUTTON, DON'T INJECT PROMPT
  if (job.type === 'NEW_THREAD') {
    console.log('Content: ========== NEW_THREAD JOB STARTED ==========');
    console.log('Content: NEW_THREAD job - clicking New Thread button ONLY (no prompt injection)');
    sendUpdate('Creating New Thread');
    
    // Find and click New Thread button
    const newThreadButton = document.querySelector('button[data-testid="sidebar-new-thread"]') as HTMLElement;
    
    if (!newThreadButton) {
      console.error('Content: ❌ New Thread button NOT FOUND!');
      console.error('Content: Trying alternative selectors...');
      
      // Try alternative selectors
      const altButton1 = document.querySelector('button[aria-label="New Thread"]') as HTMLElement;
      const altButton2 = document.querySelector('button:has-text("New Thread")') as HTMLElement;
      
      console.log('Content: Alt selector 1 (aria-label):', !!altButton1);
      console.log('Content: Alt selector 2 (has-text):', !!altButton2);
      
      throw new Error('New Thread button not found');
    }
    
    console.log('Content: ✅ New Thread button found!');
    console.log('Content: Button element:', newThreadButton);
    console.log('Content: Button visible?', newThreadButton.offsetParent !== null);
    console.log('Content: Button disabled?', newThreadButton.hasAttribute('disabled'));
    
    // Scroll button into view and focus
    newThreadButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Add VERY PROMINENT visual feedback - RED border and alert
    const originalBorder = newThreadButton.style.border;
    const originalBoxShadow = newThreadButton.style.boxShadow;
    const originalBackground = newThreadButton.style.backgroundColor;
    
    newThreadButton.style.border = '5px solid #ff0000';
    newThreadButton.style.boxShadow = '0 0 30px #ff0000';
    newThreadButton.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
    
    console.log('Content: 🔴 NEW THREAD BUTTON HIGHLIGHTED WITH RED BORDER');
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s to see the highlight
    
    // Try multiple click methods to ensure it works
    console.log('Content: Attempting to click New Thread button...');
    
    // Method 1: Focus and native click
    newThreadButton.focus();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Method 2: Dispatch proper mouse events
    const rect = newThreadButton.getBoundingClientRect();
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    });
    
    newThreadButton.dispatchEvent(clickEvent);
    console.log('Content: ✅ MouseEvent dispatched');
    
    // Method 3: Also try regular click as fallback
    await new Promise(resolve => setTimeout(resolve, 100));
    newThreadButton.click();
    console.log('Content: ✅ Regular click() called');
    
    // Restore original styles after 3 seconds
    setTimeout(() => {
      newThreadButton.style.border = originalBorder;
      newThreadButton.style.boxShadow = originalBoxShadow;
      newThreadButton.style.backgroundColor = originalBackground;
    }, 3000);
    
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait longer for new thread to be created
    
    console.log('Content: NEW_THREAD button click completed - backend will reset counter now');
    console.log('Content: ========== NEW_THREAD JOB COMPLETED ==========');
    // Return immediately so backend can reset counter
    // Backend will then send a separate INIT job with counter = 0
    return { status: 'NEW_THREAD_BUTTON_CLICKED' };
  }
  
  // Handle INIT job - This will be sent AFTER NEW_THREAD completes
  if (job.type === 'INIT') {
    console.log('Content: ========== INIT JOB - Will inject prompt and submit ==========');
    // Continue to normal flow below (inject prompt, submit, wait for AI)
  }

  // ========================================
  // NORMAL FLOW - INJECT PROMPT AND SUBMIT
  // ========================================
  
  sendUpdate('Finding Input');
  // 2. Find Input
  console.log('Content: Waiting for input selector', AUTOMATION_CONFIG.SELECTORS.INPUT);
  const input = await waitForElement(AUTOMATION_CONFIG.SELECTORS.INPUT) as HTMLElement;
  console.log('Content: Input found', input);
  highlightElement(input);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  sendUpdate('Injecting Prompt');
  // 3. Inject Prompt (Column K Raw Text)
  console.log('Content: Injecting data', job.inputData);
  input.textContent = job.inputData;
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: false,
    inputType: 'insertText',
    data: job.inputData
  }));
  input.focus();
  await new Promise(resolve => setTimeout(resolve, 1000));

  sendUpdate('Submitting');
  // 4. Submit
  console.log('Content: Waiting for submit button', AUTOMATION_CONFIG.SELECTORS.SUBMIT_BUTTON);
  const submitBtn = await waitForElement(AUTOMATION_CONFIG.SELECTORS.SUBMIT_BUTTON) as HTMLElement;
  console.log('Content: Submit button found', submitBtn);
  highlightElement(submitBtn);
  await new Promise(resolve => setTimeout(resolve, 500));
  submitBtn.click();
  console.log('Content: Submit clicked');
  await new Promise(resolve => setTimeout(resolve, 1000));

  sendUpdate('Waiting for AI Response');
  // 5. Wait for finish
  console.log('Content: Waiting for AI response...');
  await waitForAIFinish();
  console.log('Content: AI response finished');

  sendUpdate('Extracting Result');
  // 6. Extract Result / Special Job Handling
  
  // INIT job completed - just return success
  if (job.type === 'INIT') {
    console.log('Content: INIT job completed');
    return { status: 'INIT_COMPLETED' };
  }
  
  // Find all markdown content elements
  console.log('Content: ========== MARKDOWN EXTRACTION STARTED ==========');
  console.log('Content: Expected markdownCounter:', job.markdownCounter);
  
  if (typeof job.markdownCounter !== 'number') {
    throw new Error('No markdownCounter provided in job');
  }
  
  // Find all markdown elements on the page
  const allMarkdowns = document.querySelectorAll('[id^="markdown-content-"]');
  console.log(`Content: Total markdown elements found: ${allMarkdowns.length}`);
  
  if (allMarkdowns.length === 0) {
    console.error('Content: No markdown elements found on page!');
    throw new Error('No markdown elements found');
  }
  
  // Get the LAST (most recent) markdown element
  // This is more reliable than using ID because Perplexity doesn't reset IDs after NEW_THREAD
  const markdownElement = allMarkdowns[allMarkdowns.length - 1] as HTMLElement;
  const markdownId = markdownElement.id;
  
  console.log(`Content: Using LAST markdown element: ${markdownId}`);
  console.log(`Content: All available markdown IDs:`, Array.from(allMarkdowns).map(el => el.id));
  console.log('Content: Markdown element HTML preview:', markdownElement.innerHTML.substring(0, 500) + '...');
  
  // Highlight the markdown element we're extracting from
  markdownElement.style.border = '3px solid #00ff00';
  markdownElement.style.boxShadow = '0 0 20px #00ff00';
  console.log(`Content: 🟢 MARKDOWN ELEMENT HIGHLIGHTED WITH GREEN BORDER: ${markdownId}`);
  
  // Try multiple selectors to find code block
  let codeBlock: Element | null = null;
  const selectors = [
    'pre > code',           // Standard code block
    'code',                 // Any code element
    'pre',                  // Pre element
    '[class*="code"]',      // Any element with "code" in class
    '[class*="Code"]',      // Capitalized version
  ];
  
  console.log('Content: Trying multiple selectors to find code block...');
  for (const selector of selectors) {
    codeBlock = markdownElement.querySelector(selector);
    if (codeBlock && codeBlock.textContent && codeBlock.textContent.trim().length > 0) {
      console.log(`Content: ✅ Found code block with selector: "${selector}"`);
      break;
    } else if (codeBlock) {
      console.log(`Content: Found element with selector "${selector}" but it's empty`);
    }
  }
  
  if (!codeBlock || !codeBlock.textContent) {
    console.error('Content: ❌ No code block found with any selector!');
    console.error('Content: Markdown element structure:');
    console.error('Content: - Children count:', markdownElement.children.length);
    console.error('Content: - Text content length:', markdownElement.textContent?.length);
    console.error('Content: - Inner HTML length:', markdownElement.innerHTML.length);
    
    // Log all child elements
    console.error('Content: Child elements:');
    Array.from(markdownElement.children).forEach((child, index) => {
      console.error(`  [${index}] ${child.tagName}.${child.className} - text length: ${child.textContent?.length}`);
    });
    
    // Try to use the markdown element's text content directly if it contains "="
    if (markdownElement.textContent && markdownElement.textContent.includes('=')) {
      console.warn('Content: ⚠️  No code block found, but markdown has text with "=", using markdown text directly');
      codeBlock = markdownElement; // Use the markdown element itself
    } else {
      throw new Error('No code block found in response');
    }
  }
  
  console.log('Content: Code block text length:', codeBlock.textContent.length);
  console.log('Content: Code block full text:');
  console.log('---START CODE BLOCK---');
  console.log(codeBlock.textContent);
  console.log('---END CODE BLOCK---');
  
  // Highlight the code block with prominent green border
  const codeBlockElement = codeBlock as HTMLElement;
  const originalBorder = codeBlockElement.style.border;
  const originalBoxShadow = codeBlockElement.style.boxShadow;
  const originalBackgroundColor = codeBlockElement.style.backgroundColor;
  const originalPadding = codeBlockElement.style.padding;
  
  codeBlockElement.style.border = '4px solid #00ff00';
  codeBlockElement.style.boxShadow = '0 0 20px #00ff00';
  codeBlockElement.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
  codeBlockElement.style.padding = '10px';
  console.log('Content: ✅ Code block BORDERED with GREEN (will persist for 10 seconds)');
  
  // Keep border for 10 seconds for visibility
  setTimeout(() => {
    codeBlockElement.style.border = originalBorder;
    codeBlockElement.style.boxShadow = originalBoxShadow;
    codeBlockElement.style.backgroundColor = originalBackgroundColor;
    codeBlockElement.style.padding = originalPadding;
    console.log('Content: Green border removed after 10 seconds');
  }, 10000);
  
  try {
    // Parse "unit = value" format instead of JSON
    const lines = codeBlock.textContent.trim().split('\n');
    const result: Record<string, number> = {};
    
    console.log('Content: Parsing', lines.length, 'lines');
    console.log('Content: Lines to parse:', lines);
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      console.log(`Content: Processing line: "${trimmedLine}"`);
      
      if (!trimmedLine || !trimmedLine.includes('=')) {
        console.log(`Content: Skipping line (empty or no '=')`);
        continue;
      }
      
      // Parse "Unit = Value" format
      const [unit, value] = trimmedLine.split('=').map(s => s.trim());
      console.log(`Content: Split result - unit: "${unit}", value: "${value}"`);
      
      if (unit && value) {
        const numericValue = parseFloat(value);
        if (!isNaN(numericValue)) {
          result[unit] = numericValue;
          console.log(`Content: ✅ Parsed ${unit} = ${numericValue}`);
        } else {
          console.warn(`Content: ⚠️  Could not parse numeric value from "${value}"`);
        }
      }
    }
    
    console.log('Content: ========== EXTRACTION RESULTS ==========');
    console.log('Content: ✅ Successfully parsed units:', result);
    console.log('Content: Total units extracted:', Object.keys(result).length);
    console.log('Content: ========== MARKDOWN EXTRACTION COMPLETED ==========');
    return result;
  } catch (e) {
    console.error('Content: ❌ Parse error:', e);
    console.error('Content: Raw text that failed to parse:', codeBlock.textContent);
    throw new Error('Failed to parse units from response');
  }
}

// Message Listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Content Script received message:', message);
  if (message.type === 'EXECUTE_JOB') {
    executeJob(message.payload)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});
