import { API_CONFIG, AUTOMATION_CONFIG } from 'shared/constants';
import { JobPayload } from 'shared/types';

let isProcessing = false;
let pollingIntervalId: number | null = null;
const injectedTabs = new Set<number>(); // Track which tabs have content script
let workerId: string = '';

// Initialize worker ID
async function initWorkerId() {
  const result = await chrome.storage.local.get('workerId');
  if (result.workerId) {
    workerId = result.workerId;
    console.log('Background: Loaded existing workerId:', workerId);
  } else {
    workerId = 'worker_' + Math.random().toString(36).substring(2, 15);
    await chrome.storage.local.set({ workerId });
    console.log('Background: Generated new workerId:', workerId);
  }
}

// Start polling for jobs
async function startPolling() {
  if (pollingIntervalId) {
    console.log('Background: Polling already started');
    return;
  }

  if (!workerId) {
    await initWorkerId();
  }

  console.log('Background: Starting job polling with workerId:', workerId);
  
  pollingIntervalId = setInterval(pollForJobs, API_CONFIG.POLLING_INTERVAL) as unknown as number;
}

async function pollForJobs() {
  console.log('Background: Polling for jobs, isProcessing=', isProcessing);
  
  if (isProcessing) {
    console.log('Background: Already processing, skipping poll');
    return;
  }

  try {
    // Send workerId in query param
    const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.NEXT_JOB}?workerId=${workerId}`);
    if (!response.ok) {
      console.error('Background: Failed to poll jobs:', response.statusText);
      return;
    }
    
    const data = await response.json();
    
    if (!data.job || Object.keys(data.job).length === 0) {
      console.log('Background: No job available');
      return;
    }

    const job = data.job as JobPayload;
    console.log('Background: Job received:', job.rowId, job.type);
    await processJob(job);
  } catch (error) {
    console.error('Background: Error polling jobs:', error);
  }
}

function stopPolling() {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
    console.log('Background: Polling stopped');
  }
}

async function processJob(job: JobPayload) {
  if (isProcessing) {
    console.log('Background: Already processing, skipping job', job.rowId);
    return;
  }
  isProcessing = true;
  console.log('Background: Handling job', job);

  try {
    console.log('Background: Looking for Perplexity tab...');
    // First, try to find an active one in the current window
    let tabs = await chrome.tabs.query({ url: AUTOMATION_CONFIG.PERPLEXITY_URL_PATTERN, active: true, currentWindow: true });
    console.log('Background: Active tabs found', tabs.length);
    
    // If no active one, find any in current window
    if (tabs.length === 0) {
      tabs = await chrome.tabs.query({ url: AUTOMATION_CONFIG.PERPLEXITY_URL_PATTERN, currentWindow: true });
      console.log('Background: Current window tabs found', tabs.length);
    }
    
    // If still none, find any globally
    if (tabs.length === 0) {
      tabs = await chrome.tabs.query({ url: AUTOMATION_CONFIG.PERPLEXITY_URL_PATTERN });
      console.log('Background: Global tabs found', tabs.length);
    }

    let tabId: number;

    if (tabs.length > 0 && tabs[0].id) {
      tabId = tabs[0].id;
      console.log('Background: Using existing tab', tabId);
      // Activate the tab
      await chrome.tabs.update(tabId, { active: true });
    } else {
      console.log('Background: Creating new tab');
      const tab = await chrome.tabs.create({ url: AUTOMATION_CONFIG.PERPLEXITY_URL, active: true });
      if (!tab.id) throw new Error('Failed to create tab');
      tabId = tab.id;
      // Wait for load
      await new Promise(resolve => setTimeout(resolve, AUTOMATION_CONFIG.TIMEOUTS.PAGE_LOAD));
    }

    // Wait a bit for the tab to be ready/focused
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Programmatically inject content script ONLY if not already injected
    if (!injectedTabs.has(tabId)) {
      console.log('Background: Injecting content script into tab', tabId);
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/index.js']
        });
        injectedTabs.add(tabId);
        console.log('Background: Content script injected successfully');
        // Wait for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (injectError) {
        console.log('Background: Injection failed:', injectError);
        throw injectError;
      }
    } else {
      console.log('Background: Content script already injected in tab', tabId);
    }

    console.log('Background: Sending EXECUTE_JOB to tab', tabId);

    // Send message to content script with timeout (15 minutes for AI thinking)
    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_JOB',
        payload: job
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Message timeout after 15 minutes')), 900000) // 15 mins = 900000ms
      )
    ]);

    console.log('Background: Job completed successfully', response);
    
    // Report completion to backend
    await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.COMPLETE_JOB}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rowId: job.rowId,
        result: response.result,
        workerId // Send workerId
      })
    });
  } catch (error: any) {
    console.error('Background: Job failed', error);
    
    // Check if it's a timeout error
    const isTimeout = error.message && error.message.includes('timeout');
    
    if (isTimeout) {
      console.warn('Background: ⏱️ AI TIMEOUT (15 minutes) - Triggering NEW_THREAD');
      
      // Download current Excel file before triggering NEW_THREAD
      try {
        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DOWNLOAD}`);
        const blob = await response.blob();
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        
        await chrome.downloads.download({
          url: URL.createObjectURL(blob),
          filename: `processed_timeout_${timestamp}.xlsx`,
          saveAs: false
        });
        
        console.log('Background: ✅ Excel file auto-downloaded due to timeout');
      } catch (downloadError) {
        console.error('Background: Failed to download Excel on timeout:', downloadError);
      }
      
      // Report timeout to backend - backend will trigger NEW_THREAD
      await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.FAIL_JOB}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowId: job.rowId,
          error: 'AI timeout after 15 minutes - NEW_THREAD will be triggered',
          workerId // Send workerId
        })
      });
    } else {
      // Regular error - just fail the job
      await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.FAIL_JOB}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowId: job.rowId,
          error: error.message || 'Unknown error',
          workerId // Send workerId
        })
      });
    }
  } finally {
    isProcessing = false;
  }
}

// Listen for messages from Side Panel and Content Script
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'START_POLLING') {
    console.log('Background: Received START_POLLING command');
    startPolling();
  } else if (message.type === 'STOP_POLLING') {
    console.log('Background: Received STOP_POLLING command');
    stopPolling();
  } else if (message.type === 'RESET') {
    console.log('Background: Received RESET command - clearing all state');
    stopPolling();
    isProcessing = false;
    injectedTabs.clear();
    console.log('Background: State reset complete');
  } else if (message.type === 'WORKFLOW_UPDATE') {
    // Post workflow update to backend
    fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.WORKFLOW_UPDATE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: message.payload.step })
    }).catch(error => {
      console.error('Background: Failed to post workflow update:', error);
    });
  }
});

// Initialize workerId on load
initWorkerId();

console.log('Background: Ready (polling will start when user clicks Upload & Start)');

