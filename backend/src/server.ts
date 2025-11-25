import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { API_CONFIG } from 'shared/constants';
import { ExcelService } from './services/ExcelService';
import { QueueService } from './services/QueueService';

const app = express();

app.use(cors());
app.use(express.json());

// Services
const excelService = new ExcelService();
const queueService = new QueueService(excelService);

// File Upload
const upload = multer({ dest: API_CONFIG.UPLOAD_DIR });

app.post(API_CONFIG.ENDPOINTS.UPLOAD, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    await excelService.loadFile(req.file.path);
    await queueService.loadQueue();
    console.log('File uploaded and queue loaded');
    res.json({ message: 'File uploaded and queue loaded', state: queueService.getState() });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error processing file');
  }
});

app.get(API_CONFIG.ENDPOINTS.STATUS, (req, res) => {
  res.json(queueService.getState());
});

app.get(API_CONFIG.ENDPOINTS.DOWNLOAD, async (req, res) => {
  try {
    const buffer = await excelService.getFileBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${API_CONFIG.DOWNLOAD_FILENAME}`);
    res.send(buffer);
  } catch (error) {
    res.status(500).send('Error downloading file');
  }
});

// New HTTP Polling Endpoints
app.get(API_CONFIG.ENDPOINTS.NEXT_JOB, async (req, res) => {
  console.log('GET /api/next-job - Polling for next job');
  const job = await queueService.getNextJob();
  res.json({ job });
});

app.post(API_CONFIG.ENDPOINTS.COMPLETE_JOB, async (req, res) => {
  const { rowId, result } = req.body;
  console.log('POST /api/complete-job - Job completed:', rowId);
  try {
    await queueService.completeJob(rowId, result);
    res.json({ success: true });
  } catch (error) {
    console.error('Error completing job:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post(API_CONFIG.ENDPOINTS.FAIL_JOB, async (req, res) => {
  const { rowId, error } = req.body;
  console.log('POST /api/fail-job - Job failed:', rowId, error);
  try {
    await queueService.failJob(rowId, error);
    res.json({ success: true });
  } catch (err) {
    console.error('Error failing job:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post(API_CONFIG.ENDPOINTS.WORKFLOW_UPDATE, (req, res) => {
  const { step } = req.body;
  console.log('POST /api/workflow-update - Step:', step);
  queueService.updateWorkflowStep(step);
  res.json({ success: true });
});

// Test mode endpoint
app.post('/api/set-test-mode', (req, res) => {
  const { enabled } = req.body;
  console.log(`POST /api/set-test-mode - ${enabled ? 'ENABLING' : 'DISABLING'} test mode`);
  queueService.setTestMode(enabled);
  res.json({ success: true, testMode: enabled });
});

app.listen(API_CONFIG.PORT, () => {
  console.log(`Server running on ${API_CONFIG.BASE_URL}`);
});
