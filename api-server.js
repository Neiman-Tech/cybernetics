const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use('/api',express.static('public'));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.API_KEY || 'your-secret-api-key';

// Enable CORS
app.use(cors());
app.use(express.json());

// Store active sessions
const sessions = new Map();
const sessionTimeouts = new Map();

// ================================================
// REST API ENDPOINTS
// ================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeSessions: sessions.size,
    uptime: process.uptime()
  });
});

// Create new terminal session
app.post('/api/sessions', authenticateAPI, (req, res) => {
  const sessionId = uuidv4();
  const { userId, metadata } = req.body;

  sessions.set(sessionId, {
    id: sessionId,
    userId: userId || 'anonymous',
    metadata: metadata || {},
    createdAt: new Date(),
    status: 'pending'
  });

  const wsProtocol = req.protocol === 'https' ? 'wss' : 'ws';
  const wsUrl = `${wsProtocol}://${req.get('host')}/terminal?sessionId=${sessionId}&apiKey=${API_KEY}`;

  res.json({
    sessionId,
    wsUrl,
    status: 'created'
  });
});

// Get session info
app.get('/api/sessions/:sessionId', authenticateAPI, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(session);
});

// List all sessions
app.get('/api/sessions', authenticateAPI, (req, res) => {
  const allSessions = Array.from(sessions.values()).map(s => ({
    id: s.id,
    userId: s.userId,
    status: s.status,
    createdAt: s.createdAt
  }));

  res.json({ sessions: allSessions, count: allSessions.length });
});

// Kill a session
app.delete('/api/sessions/:sessionId', authenticateAPI, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.ptyProcess) {
    session.ptyProcess.kill();
  }

  cleanup(req.params.sessionId);

  res.json({ message: 'Session terminated', sessionId: req.params.sessionId });
});

// Execute command in session
app.post('/api/sessions/:sessionId/execute', authenticateAPI, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  
  if (!session || !session.ptyProcess) {
    return res.status(404).json({ error: 'Session not found or not active' });
  }

  const { command } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }

  session.ptyProcess.write(command + '\n');

  res.json({ 
    message: 'Command sent', 
    command,
    sessionId: req.params.sessionId 
  });
});

// ================================================
// WEBSOCKET TERMINAL CONNECTION
// ================================================

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const apiKey = url.searchParams.get('apiKey');

  // Validate API key
  if (apiKey !== API_KEY) {
    ws.close(4001, 'Invalid API key');
    return;
  }

  // Validate session
  const session = sessions.get(sessionId);
  if (!session) {
    ws.close(4004, 'Session not found');
    return;
  }

  console.log(`WebSocket connected for session: ${sessionId}`);

  let ptyProcess = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'start') {
        const userHome = `/tmp/user_${sessionId}`;
        
        ptyProcess = pty.spawn('/bin/bash', [], {
          name: 'xterm-color',
          cols: data.cols || 80,
          rows: data.rows || 24,
          cwd: '/tmp',
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            HOME: userHome,
            PS1: '\\u@terminal:\\w\\$ '
          }
        });

        // Setup environment
        ptyProcess.write(`mkdir -p ${userHome}\n`);
        ptyProcess.write(`cd ${userHome}\n`);
        ptyProcess.write(`clear\n`);

        session.ptyProcess = ptyProcess;
        session.status = 'active';
        session.userHome = userHome;

        ws.send(JSON.stringify({ type: 'ready', sessionId }));

        // Stream output
        ptyProcess.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'output', data }));
          }
        });

        ptyProcess.onExit(() => {
          console.log(`PTY exited for session ${sessionId}`);
          cleanup(sessionId);
        });

        resetTimeout(sessionId);

      } else if (data.type === 'input') {
        if (ptyProcess) {
          ptyProcess.write(data.data);
          resetTimeout(sessionId);
        }
      } else if (data.type === 'resize') {
        if (ptyProcess) {
          ptyProcess.resize(data.cols, data.rows);
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket closed for session ${sessionId}`);
    cleanup(sessionId);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// ================================================
// HELPER FUNCTIONS
// ================================================

function authenticateAPI(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

function resetTimeout(sessionId) {
  if (sessionTimeouts.has(sessionId)) {
    clearTimeout(sessionTimeouts.get(sessionId));
  }
  
  const timeout = setTimeout(() => {
    console.log(`Session ${sessionId} timed out`);
    cleanup(sessionId);
  }, 15 * 60 * 1000);

  sessionTimeouts.set(sessionId, timeout);
}

function cleanup(sessionId) {
  if (!sessionId) return;

  if (sessionTimeouts.has(sessionId)) {
    clearTimeout(sessionTimeouts.get(sessionId));
    sessionTimeouts.delete(sessionId);
  }
  
  const session = sessions.get(sessionId);
  if (session) {
    if (session.ptyProcess) {
      session.ptyProcess.kill();
    }
    session.status = 'destroyed';
    
    setTimeout(() => {
      sessions.delete(sessionId);
    }, 5 * 60 * 1000);
  }
}

// Cleanup on shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  sessions.forEach((session, sessionId) => {
    cleanup(sessionId);
  });
  server.close(() => {
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`Terminal API Service running on port ${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/terminal`);
  console.log(`REST API: http://localhost:${PORT}/api`);
});