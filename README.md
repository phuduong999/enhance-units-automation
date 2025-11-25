# Enhance Units Automation

Automated system for enhancing ingredient unit conversions using Perplexity AI.

## Features

- ✅ Automated Excel file processing
- ✅ AI-powered unit conversion verification
- ✅ Support for 35+ food categories
- ✅ Standard units table with precise conversions
- ✅ Auto-recovery from errors
- ✅ NEW_THREAD every 70 rows
- ✅ 15-minute AI timeout protection

## Quick Setup

### 1. Clone Repository
```bash
git clone https://github.com/Phuduong999/enhance-units-automation.git
cd enhance-units-automation
```

### 2. Run Setup (One Command)
```bash
chmod +x setup.sh
./setup.sh
```

This will:
- Install backend dependencies
- Install extension dependencies  
- Build Chrome extension

### 3. Start Backend
```bash
npm run dev:backend
```

Backend runs on `http://localhost:3000`

### 4. Load Chrome Extension

1. Open Chrome: `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select: `extension/dist` folder

## Usage

1. **Open Extension** - Click extension icon in Chrome toolbar
2. **Open Perplexity** - Click "Open AI" button or visit https://www.perplexity.ai
3. **Upload Excel** - Select your Excel file with ingredient data
4. **Click Upload & Start** - Automation begins
5. **Monitor Progress** - Watch live logs and progress bar
6. **Download Result** - Click "Download Result" when complete

## Excel File Format

Required columns:
- **Column A**: Status (PENDING/OKE/ERROR_WHEN_PROCESS)
- **Column K**: Raw ingredient data with units
- **Column L**: Output results (auto-filled)
- **Column M**: Status (auto-updated)
- **Column N**: BrandLink (optional)

## Configuration

### Production Settings (Default)
- NEW_THREAD: Every 70 rows
- Max Retries: 10 times
- AI Timeout: 15 minutes

### Files
- `prompt-force.md` - AI prompt template
- `shared/constants.ts` - Configuration settings
- `backend/src/services/QueueService.ts` - Job processing logic

## Troubleshooting

### Extension not working after clone?
```bash
# Delete old extension from Chrome
# Re-run setup
./setup.sh
# Reload extension in Chrome
```

### Backend can't find prompt?
```bash
# Restart backend
npm run dev:backend
```

### Stuck at "Waiting for AI Response"?
- Check Perplexity tab is open
- Check console logs for errors
- Extension auto-recovers after 15 min timeout

## Project Structure

```
enhance-units-automation/
├── backend/              # Express.js backend
│   ├── src/
│   │   ├── server.ts    # API endpoints
│   │   └── services/    # Business logic
├── extension/           # Chrome extension
│   ├── src/
│   │   ├── App.tsx      # Extension UI
│   │   ├── background/  # Background script
│   │   └── content/     # Content script
│   └── dist/           # Built extension (load this in Chrome)
├── shared/             # Shared types/constants
├── prompt-force.md     # AI instruction prompt
└── setup.sh           # One-command setup script
```

## Tech Stack

- **Backend**: Node.js, Express, ExcelJS
- **Extension**: React, TypeScript, Vite, Mantine UI
- **AI**: Perplexity AI Pro

## License

MIT
