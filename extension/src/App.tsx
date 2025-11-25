import { useState, useEffect, useRef } from 'react';
import { MantineProvider, Container, Title, Stack, Card, Text, Group, Badge, Button, FileInput, Progress, ScrollArea } from '@mantine/core';
import { IconUpload, IconDownload, IconFileSpreadsheet, IconExternalLink } from '@tabler/icons-react';
import { API_CONFIG, AUTOMATION_CONFIG } from 'shared/constants';
import { ProcessingState } from 'shared/types';

// Simple notification function using Chrome API
const showNotification = (title: string, message: string) => {
  console.log(`[Notification] ${title}: ${message}`);
  // Could also use chrome.notifications.create() for system notifications
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ProcessingState>({ 
    total: 0, 
    processed: 0, 
    current: -1, 
    status: 'IDLE',
    success: 0,
    failed: 0,
    activeThreads: 0,
    workflowStep: ''
  });

  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const prevStatusRef = useRef<string>('IDLE');
  
  const [logs, setLogs] = useState<Array<{time: string, message: string, type: 'info' | 'warning' | 'error'}>>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Add log entry
  const addLog = (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-100), { time, message, type }]); // Keep last 100 logs
  };

  // Monitor status changes and show notifications
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = state.status;
    
    // Status changed
    if (prevStatus !== currentStatus) {
      console.log(`Status changed: ${prevStatus} → ${currentStatus}`);
      addLog(`Status: ${prevStatus} → ${currentStatus}`, 'info');
      
      // Automation completed
      if (currentStatus === 'COMPLETED' && prevStatus === 'PROCESSING') {
        addLog(`✅ Automation completed: ${state.success} success, ${state.failed} failed`, 'info');
        showNotification(
          '✅ Automation Completed',
          `Successfully processed ${state.success} rows. ${state.failed} failed.`
        );
      }
      
      // Automation stopped/paused
      if (currentStatus === 'PAUSED' && prevStatus === 'PROCESSING') {
        addLog('⏸️ Automation paused', 'warning');
        showNotification(
          '⏸️ Automation Paused',
          'Processing has been paused.'
        );
      }
      
      // Automation stopped due to error
      if (currentStatus === 'IDLE' && prevStatus === 'PROCESSING' && state.processed > 0) {
        addLog(`⚠️ Automation stopped at row ${state.current}`, 'error');
        showNotification(
          '⚠️ Automation Stopped',
          `Processing stopped at row ${state.current}. Check logs for errors.`
        );
      }
      
      prevStatusRef.current = currentStatus;
    }
    
    // Check for high failure rate
    if (state.failed > 0 && state.processed > 0) {
      const failureRate = (state.failed / state.processed) * 100;
      if (failureRate > 50 && state.failed % 10 === 0) { // Alert every 10 failures if >50% fail rate
        addLog(`⚠️ High failure rate: ${failureRate.toFixed(0)}%`, 'warning');
        showNotification(
          '⚠️ High Failure Rate',
          `${state.failed} failures out of ${state.processed} processed (${failureRate.toFixed(0)}%)`
        );
      }
    }
    
    // Log workflow step changes
    if (state.workflowStep && state.workflowStep !== 'Idle') {
      addLog(`📍 ${state.workflowStep}`, 'info');
    }
  }, [state.status, state.failed, state.processed, state.current, state.success, state.workflowStep]);

  // Don't poll automatically - only start after upload
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const handleFileChange = (newFile: File | null) => {
    setFile(newFile);
    // Reset state when new file is selected
    if (newFile) {
      // Stop polling to prevent loading old state
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
      
      setState({
        total: 0,
        processed: 0,
        current: -1,
        status: 'IDLE',
        success: 0,
        failed: 0,
        activeThreads: 0,
        workflowStep: 'Select file and click Upload & Start'
      });
      prevStatusRef.current = 'IDLE';
      setLogs([]); // Clear logs
      addLog(`📁 File selected: ${newFile.name}`, 'info');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    // Prevent multiple uploads
    if (state.status === 'PROCESSING') {
      addLog('⚠️ Already processing, please wait', 'warning');
      return;
    }
    
    addLog('🚀 Starting upload...', 'info');
    
    // Update status immediately to prevent double-click
    setState(prev => ({ ...prev, status: 'PROCESSING' }));
    
    // Reset extension state before new upload
    chrome.runtime.sendMessage({ type: 'RESET' });
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.UPLOAD}`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setState(data.state);
      
      addLog(`✅ File uploaded: ${data.state.total} rows to process`, 'info');
      
      // Show start notification
      showNotification(
        '🚀 Automation Started',
        `Processing ${data.state.total} rows`
      );
      
      // Restart polling after upload
      if (!pollingInterval) {
        const interval = setInterval(async () => {
          try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.STATUS}`);
            const data = await response.json();
            setState(data);
          } catch (error) {
            console.error('Failed to fetch status', error);
          }
        }, 1000) as unknown as number;
        setPollingInterval(interval);
      }
      
      // Tell background script to start polling
      chrome.runtime.sendMessage({ type: 'START_POLLING' });
    } catch (error) {
      console.error('Upload failed', error);
      addLog('❌ Upload failed', 'error');
      showNotification(
        '❌ Upload Failed',
        'Failed to upload file. Check console for details.'
      );
      // Reset status on error
      setState(prev => ({ ...prev, status: 'IDLE' }));
    }
  };

  const handleDownload = async () => {
    window.open(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DOWNLOAD}`, '_blank');
    addLog('📥 Downloading Excel file...', 'info');
    showNotification(
      '📥 Downloading',
      'Excel file download started'
    );
  };

  const handleOpenPerplexity = () => {
    chrome.tabs.create({ url: AUTOMATION_CONFIG.PERPLEXITY_URL });
  };

  const getLogColor = (type: 'info' | 'warning' | 'error') => {
    switch (type) {
      case 'error': return 'red';
      case 'warning': return 'orange';
      default: return 'dimmed';
    }
  };

  return (
    <MantineProvider>
      <Container p="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>Perplexity Automation</Title>
            <Button 
              variant="subtle" 
              size="xs" 
              onClick={handleOpenPerplexity}
              leftSection={<IconExternalLink size={14} />}
            >
              Open AI
            </Button>
          </Group>

          <Card withBorder shadow="sm">
            <Stack gap="sm">
              <FileInput
                placeholder="Select Excel file"
                leftSection={<IconFileSpreadsheet size={16} />}
                value={file}
                onChange={handleFileChange}
                accept=".xlsx"
              />
              <Button 
                onClick={handleUpload} 
                disabled={!file || state.status === 'PROCESSING'}
                leftSection={<IconUpload size={16} />}
              >
                Upload & Start
              </Button>
            </Stack>
          </Card>

          {state.total > 0 && (
            <Card withBorder shadow="sm">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={500}>Progress</Text>
                  <Badge color={state.status === 'PROCESSING' ? 'blue' : state.status === 'COMPLETED' ? 'green' : 'gray'}>
                    {state.status}
                  </Badge>
                </Group>
                <Progress 
                  value={(state.processed / state.total) * 100} 
                  animated={state.status === 'PROCESSING'} 
                  size="xl" 
                  radius="xl"
                />
                <Text size="sm" c="dimmed" ta="center">
                  {state.processed} / {state.total} rows processed
                </Text>

                <Group grow>
                  <Card withBorder padding="xs" radius="md">
                    <Text size="xs" c="dimmed">Success</Text>
                    <Text fw={700} c="green">{state.success}</Text>
                  </Card>
                  <Card withBorder padding="xs" radius="md">
                    <Text size="xs" c="dimmed">Failed</Text>
                    <Text fw={700} c="red">{state.failed}</Text>
                  </Card>
                </Group>

                <Card withBorder padding="xs" radius="md" bg="gray.0">
                  <Stack gap={4}>
                    <Group justify="space-between">
                      <Text size="xs" fw={500}>Active Threads</Text>
                      <Badge size="xs" variant="outline">{state.activeThreads}</Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" fw={500}>Current Row</Text>
                      <Text size="xs">{state.current}</Text>
                    </Group>
                    <Text size="xs" fw={500} mt={4}>Workflow Step:</Text>
                    <Text size="xs" c="blue" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {state.workflowStep}
                    </Text>
                  </Stack>
                </Card>
              </Stack>
            </Card>
          )}

          {logs.length > 0 && (
            <Card withBorder shadow="sm">
              <Stack gap="xs">
                <Text fw={500} size="sm">Live Logs</Text>
                <ScrollArea h={200} type="auto">
                  <Stack gap={2}>
                    {logs.map((log, i) => (
                      <Text 
                        key={i} 
                        size="xs" 
                        ff="monospace" 
                        c={getLogColor(log.type)}
                      >
                        [{log.time}] {log.message}
                      </Text>
                    ))}
                    <div ref={logsEndRef} />
                  </Stack>
                </ScrollArea>
              </Stack>
            </Card>
          )}

          <Button 
            variant="outline" 
            onClick={handleDownload}
            leftSection={<IconDownload size={16} />}
            disabled={state.processed === 0}
          >
            Download Result
          </Button>
        </Stack>
      </Container>
    </MantineProvider>
  );
}

export default App;
