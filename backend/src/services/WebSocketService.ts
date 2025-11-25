import { WebSocket, WebSocketServer } from 'ws';
import { QueueService } from './QueueService';
import { WebSocketMessage } from 'shared/types';

export class WebSocketService {
  private wss: WebSocketServer;
  private queueService: QueueService;

  constructor(wss: WebSocketServer, queueService: QueueService) {
    this.wss = wss;
    this.queueService = queueService;
    this.init();
  }

  private init() {
    this.wss.on('connection', (ws) => {
      console.log('Client connected');
      this.sendState(ws);

      ws.on('message', async (message) => {
        try {
          const parsed: WebSocketMessage = JSON.parse(message.toString());
          await this.handleMessage(ws, parsed);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });
    });
  }

  private async handleMessage(ws: WebSocket, message: WebSocketMessage) {
    console.log('WebSocketService: Received message from client:', message);
    switch (message.type) {
      case 'JOB_COMPLETED':
        console.log('WebSocketService: Handling JOB_COMPLETED');
        if (message.payload) {
          await this.queueService.completeJob(message.payload.rowId, message.payload.result);
          this.dispatchNextJob(ws);
          this.broadcastState();
        }
        break;
      case 'JOB_FAILED':
        console.log('WebSocketService: Handling JOB_FAILED');
        if (message.payload) {
          await this.queueService.failJob(message.payload.rowId, message.payload.error);
          this.dispatchNextJob(ws);
          this.broadcastState();
        }
        break;
      case 'WORKFLOW_UPDATE':
        console.log('WebSocketService: Handling WORKFLOW_UPDATE');
        if (message.payload) {
          this.queueService.updateWorkflowStep(message.payload.step);
          this.broadcastState();
        }
        break;
      case 'CONNECTION_ESTABLISHED': // Client asking for work
          console.log('WebSocketService: Handling CONNECTION_ESTABLISHED, dispatching job...');
          this.dispatchNextJob(ws);
          break;
      default:
        console.log('WebSocketService: Unknown message type:', message.type);
    }
  }

  private dispatchNextJob(ws: WebSocket) {
    console.log('WebSocketService: Getting next job...');
    const job = this.queueService.getNextJob();
    console.log('WebSocketService: Job from queue:', job);
    if (job) {
      const msg: WebSocketMessage = {
        type: 'JOB_ASSIGNED',
        payload: job,
      };
      console.log('WebSocketService: Sending JOB_ASSIGNED to client:', msg);
      ws.send(JSON.stringify(msg));
      console.log('WebSocketService: Message sent');
      this.broadcastState();
    } else {
      console.log('WebSocketService: No job available');
    }
  }

  private sendState(ws: WebSocket) {
    const state = this.queueService.getState();
    const msg: WebSocketMessage = {
      type: 'STATE_UPDATE',
      payload: state,
    };
    ws.send(JSON.stringify(msg));
  }

  private broadcastState() {
    const state = this.queueService.getState();
    const msg: WebSocketMessage = {
      type: 'STATE_UPDATE',
      payload: state,
    };
    const data = JSON.stringify(msg);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
  public startProcessing() {
    console.log(`Starting processing for ${this.wss.clients.size} clients`);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        console.log('Dispatching to client');
        this.dispatchNextJob(client);
      } else {
        console.log('Client not ready', client.readyState);
      }
    });
  }
}
