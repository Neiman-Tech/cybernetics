// Node.js Client Example for Terminal API
const axios = require('axios');
const WebSocket = require('ws');

const API_BASE = 'http://localhost:4000/api';
const API_KEY = 'your-secret-api-key';

class TerminalAPIClient {
  constructor(apiBase, apiKey) {
    this.apiBase = apiBase;
    this.apiKey = apiKey;
  }

  async createSession(userId, metadata = {}) {
    const response = await axios.post(
      `${this.apiBase}/sessions`,
      { userId, metadata },
      { headers: { 'X-API-Key': this.apiKey } }
    );
    return response.data;
  }

  async getSession(sessionId) {
    const response = await axios.get(
      `${this.apiBase}/sessions/${sessionId}`,
      { headers: { 'X-API-Key': this.apiKey } }
    );
    return response.data;
  }

  async killSession(sessionId) {
    const response = await axios.delete(
      `${this.apiBase}/sessions/${sessionId}`,
      { headers: { 'X-API-Key': this.apiKey } }
    );
    return response.data;
  }

  connectWebSocket(wsUrl, callbacks = {}) {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('WebSocket connected');
      if (callbacks.onOpen) callbacks.onOpen();
      ws.send(JSON.stringify({ type: 'start', cols: 80, rows: 24 }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.type === 'ready') {
        if (callbacks.onReady) callbacks.onReady(ws);
      } else if (message.type === 'output') {
        if (callbacks.onOutput) {
          callbacks.onOutput(message.data);
        } else {
          process.stdout.write(message.data);
        }
      }
    });

    ws.on('close', () => {
      console.log('WebSocket closed');
      if (callbacks.onClose) callbacks.onClose();
    });

    return ws;
  }

  sendInput(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  }
}

// Usage Example
async function main() {
  const client = new TerminalAPIClient(API_BASE, API_KEY);

  const session = await client.createSession('user123', { app: 'my-app' });
  console.log('Session created:', session.sessionId);

  const ws = client.connectWebSocket(session.wsUrl, {
    onReady: (ws) => {
      client.sendInput(ws, 'echo "Hello from API!"\n');
      client.sendInput(ws, 'pwd\n');
      
      setTimeout(() => {
        client.killSession(session.sessionId);
        ws.close();
      }, 5000);
    }
  });
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = TerminalAPIClient;