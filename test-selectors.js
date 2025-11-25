// ========================================
// PERPLEXITY AUTOMATION - SELECTOR TEST SCRIPT
// ========================================
// Copy and paste this entire script into Chrome DevTools Console
// while on https://www.perplexity.ai/

console.log('🧪 Starting Perplexity Automation Selector Test...\n');

// Test configuration
const SELECTORS = {
  INPUT: '#ask-input',
  SUBMIT_BUTTON: 'button[aria-label="Submit"]',
  STOP_BUTTON: 'button[data-testid="stop-generating-response-button"]',
  NEW_THREAD_BUTTON: 'button[data-testid="sidebar-new-thread"]',
  MARKDOWN_CONTENT: '[id^="markdown-content-"]',
  CODE_BLOCK: 'pre > code',
};

const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Helper function to test selector
function testSelector(name, selector, shouldExist = true) {
  console.log(`\n📍 Testing: ${name}`);
  console.log(`   Selector: ${selector}`);
  
  const element = document.querySelector(selector);
  const exists = !!element;
  
  if (exists) {
    console.log(`   ✅ Found element`);
    console.log(`   Element:`, element);
    
    // Check visibility
    const isVisible = element.offsetParent !== null;
    console.log(`   Visible: ${isVisible ? '✅ Yes' : '⚠️  No'}`);
    
    // Check if disabled (for buttons)
    if (element.tagName === 'BUTTON') {
      const isDisabled = element.hasAttribute('disabled');
      console.log(`   Disabled: ${isDisabled ? '⚠️  Yes' : '✅ No'}`);
    }
    
    // Check dimensions
    const rect = element.getBoundingClientRect();
    console.log(`   Position: (${Math.round(rect.left)}, ${Math.round(rect.top)})`);
    console.log(`   Size: ${Math.round(rect.width)}x${Math.round(rect.height)}`);
    
    results.passed.push(name);
    
    if (!isVisible) {
      results.warnings.push(`${name} exists but not visible`);
    }
    
    return element;
  } else {
    console.log(`   ❌ NOT FOUND`);
    results.failed.push(name);
    return null;
  }
}

// Helper to highlight element
function highlightElement(element, color = '#00ff00', duration = 2000) {
  if (!element) return;
  
  const original = {
    border: element.style.border,
    boxShadow: element.style.boxShadow,
    backgroundColor: element.style.backgroundColor
  };
  
  element.style.border = `5px solid ${color}`;
  element.style.boxShadow = `0 0 20px ${color}`;
  element.style.backgroundColor = `${color}33`;
  
  setTimeout(() => {
    element.style.border = original.border;
    element.style.boxShadow = original.boxShadow;
    element.style.backgroundColor = original.backgroundColor;
  }, duration);
}

// ========================================
// TEST 1: Input Field
// ========================================
console.log('\n' + '='.repeat(50));
console.log('TEST 1: Input Field');
console.log('='.repeat(50));

const input = testSelector('Input Field', SELECTORS.INPUT);
if (input) {
  highlightElement(input, '#00ff00');
  console.log('   🎨 Highlighted with GREEN border for 2 seconds');
}

// ========================================
// TEST 2: Submit Button
// ========================================
console.log('\n' + '='.repeat(50));
console.log('TEST 2: Submit Button');
console.log('='.repeat(50));

const submitBtn = testSelector('Submit Button', SELECTORS.SUBMIT_BUTTON);
if (submitBtn) {
  highlightElement(submitBtn, '#0000ff');
  console.log('   🎨 Highlighted with BLUE border for 2 seconds');
}

// ========================================
// TEST 3: Stop Button (AI Thinking)
// ========================================
console.log('\n' + '='.repeat(50));
console.log('TEST 3: Stop Button (AI Thinking Indicator)');
console.log('='.repeat(50));

const stopBtn = testSelector('Stop Button', SELECTORS.STOP_BUTTON, false);
if (stopBtn) {
  highlightElement(stopBtn, '#ff9900');
  console.log('   🎨 Highlighted with ORANGE border for 2 seconds');
  console.log('   ℹ️  This button appears only when AI is generating response');
} else {
  console.log('   ℹ️  This is normal - button only appears during AI generation');
}

// ========================================
// TEST 4: New Thread Button
// ========================================
console.log('\n' + '='.repeat(50));
console.log('TEST 4: New Thread Button');
console.log('='.repeat(50));

const newThreadBtn = testSelector('New Thread Button', SELECTORS.NEW_THREAD_BUTTON);
if (newThreadBtn) {
  highlightElement(newThreadBtn, '#ff0000');
  console.log('   🎨 Highlighted with RED border for 2 seconds');
  
  // Test click functionality
  console.log('\n   🖱️  Testing click functionality...');
  console.log('   Would you like to test clicking? (It will create a new thread)');
  console.log('   Run this to test: testNewThreadClick()');
  
  window.testNewThreadClick = async function() {
    console.log('   🔴 Clicking New Thread button...');
    
    // Scroll into view
    newThreadBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, 500));
    
    // Highlight before click
    highlightElement(newThreadBtn, '#ff0000', 3000);
    
    // Focus
    newThreadBtn.focus();
    await new Promise(r => setTimeout(r, 200));
    
    // Dispatch MouseEvent
    const rect = newThreadBtn.getBoundingClientRect();
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    });
    
    newThreadBtn.dispatchEvent(clickEvent);
    console.log('   ✅ MouseEvent dispatched');
    
    await new Promise(r => setTimeout(r, 100));
    newThreadBtn.click();
    console.log('   ✅ Regular click() called');
    
    console.log('   ⏳ Waiting 2 seconds to see if new thread is created...');
    await new Promise(r => setTimeout(r, 2000));
    console.log('   ✅ Check if URL changed or page refreshed');
  };
}

// ========================================
// TEST 5: Markdown Content Elements
// ========================================
console.log('\n' + '='.repeat(50));
console.log('TEST 5: Markdown Content Elements');
console.log('='.repeat(50));

const markdownElements = document.querySelectorAll(SELECTORS.MARKDOWN_CONTENT);
console.log(`   Found ${markdownElements.length} markdown elements`);

if (markdownElements.length > 0) {
  markdownElements.forEach((el, index) => {
    console.log(`\n   📄 Markdown ${index}: ${el.id}`);
    console.log(`      Text length: ${el.textContent?.length || 0} chars`);
    console.log(`      Has code block: ${!!el.querySelector(SELECTORS.CODE_BLOCK)}`);
    
    if (index === markdownElements.length - 1) {
      highlightElement(el, '#00ffff', 3000);
      console.log(`      🎨 Highlighted LATEST markdown with CYAN border`);
    }
  });
  
  results.passed.push('Markdown Elements');
} else {
  console.log('   ⚠️  No markdown elements found (send a message first)');
  results.warnings.push('No markdown elements - need to send message first');
}

// ========================================
// TEST 6: Code Block in Latest Markdown
// ========================================
console.log('\n' + '='.repeat(50));
console.log('TEST 6: Code Block Detection');
console.log('='.repeat(50));

if (markdownElements.length > 0) {
  const latestMarkdown = markdownElements[markdownElements.length - 1];
  console.log(`   Testing in: ${latestMarkdown.id}`);
  
  // Try multiple selectors
  const selectors = [
    'pre > code',
    'code',
    'pre',
    '[class*="code"]'
  ];
  
  for (const selector of selectors) {
    const codeBlock = latestMarkdown.querySelector(selector);
    if (codeBlock && codeBlock.textContent?.trim()) {
      console.log(`   ✅ Found with selector: "${selector}"`);
      console.log(`      Text length: ${codeBlock.textContent.length} chars`);
      console.log(`      Preview: ${codeBlock.textContent.substring(0, 100)}...`);
      highlightElement(codeBlock, '#00ff00', 3000);
      console.log(`      🎨 Highlighted with GREEN border`);
      results.passed.push('Code Block');
      break;
    }
  }
}

// ========================================
// SUMMARY
// ========================================
console.log('\n' + '='.repeat(50));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(50));

console.log(`\n✅ Passed (${results.passed.length}):`);
results.passed.forEach(item => console.log(`   • ${item}`));

if (results.failed.length > 0) {
  console.log(`\n❌ Failed (${results.failed.length}):`);
  results.failed.forEach(item => console.log(`   • ${item}`));
}

if (results.warnings.length > 0) {
  console.log(`\n⚠️  Warnings (${results.warnings.length}):`);
  results.warnings.forEach(item => console.log(`   • ${item}`));
}

console.log('\n' + '='.repeat(50));
console.log('🎯 NEXT STEPS:');
console.log('='.repeat(50));
console.log('1. Check highlighted elements on the page');
console.log('2. If New Thread button found, run: testNewThreadClick()');
console.log('3. Send a test message to verify markdown/code block detection');
console.log('4. Re-run this script after sending message to test code blocks');
console.log('\n✅ Test completed!');
