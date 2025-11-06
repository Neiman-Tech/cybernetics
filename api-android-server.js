const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const os = require('os');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.API_KEY || 'your-secret-api-key';
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT) || 15 * 60 * 1000;

const sessions = new Map();
const sessionTimeouts = new Map();

// Middleware for API authentication
function authenticateAPI(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

// Detect available shell and working directory
function getShellConfig() {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return {
      shell: process.env.COMSPEC || 'cmd.exe',
      cwd: process.env.USERPROFILE || process.cwd()
    };
  }
  
  let cwd = process.env.HOME || process.cwd();
  let shell = process.env.SHELL || '/bin/bash';
  
  if (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) {
    cwd = process.env.HOME || '/data/data/com.termux/files/home';
    shell = process.env.SHELL || `${process.env.PREFIX}/bin/bash`;
  }
  
  return { shell, cwd };
}

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: sessions.size,
    uptime: process.uptime(),
    platform: os.platform(),
    nodeVersion: process.version
  });
});

app.post('/api/sessions', authenticateAPI, (req, res) => {
  try {
    const sessionId = uuidv4();
    const { userId, metadata } = req.body;

    sessions.set(sessionId, {
      id: sessionId,
      userId: userId || 'anonymous',
      metadata: metadata || {},
      createdAt: new Date(),
      status: 'pending',
      proc: null
    });

    const wsProtocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
    const host = req.get('host');
    const wsUrl = `${wsProtocol}://${host}/terminal?sessionId=${sessionId}&apiKey=${API_KEY}`;

    res.status(201).json({
      sessionId,
      wsUrl,
      status: 'created',
      expiresIn: SESSION_TIMEOUT
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/api/sessions', authenticateAPI, (req, res) => {
  const sessionList = Array.from(sessions.values()).map(s => ({
    id: s.id,
    userId: s.userId,
    status: s.status,
    createdAt: s.createdAt
  }));
  res.json({ sessions: sessionList, count: sessionList.length });
});

app.get('/api/sessions/:sessionId', authenticateAPI, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const { proc, ...sessionInfo } = session;
  res.json(sessionInfo);
});

app.delete('/api/sessions/:sessionId', authenticateAPI, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  cleanup(req.params.sessionId);
  res.json({ 
    message: 'Session terminated', 
    sessionId: req.params.sessionId 
  });
});

app.post('/api/sessions/:sessionId/execute', authenticateAPI, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (!session.proc || session.status !== 'active') {
    return res.status(400).json({ error: 'Session not active' });
  }
  
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }

  try {
    session.proc.stdin.write(command + '\n');
    resetTimeout(req.params.sessionId);
    res.json({ message: 'Command sent', command });
  } catch (error) {
    console.error('Error executing command:', error);
    res.status(500).json({ error: 'Failed to execute command' });
  }
});

// WebSocket Terminal Connection
wss.on('connection', (ws, req) => {
  let sessionId;
  
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    sessionId = url.searchParams.get('sessionId');
    const apiKey = url.searchParams.get('apiKey');

    if (!apiKey || apiKey !== API_KEY) {
      ws.close(4001, 'Invalid API key');
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      ws.close(4004, 'Session not found');
      return;
    }

    console.log(`WebSocket connected for session: ${sessionId}`);

    const { shell, cwd } = getShellConfig();
    console.log(`Starting shell: ${shell} in ${cwd}`);

    // Use script command for PTY simulation on Unix systems
    let spawnCmd, spawnArgs;
    
    if (os.platform() === 'win32') {
      spawnCmd = shell;
      spawnArgs = [];
    } else {
      // Use script command to create pseudo-terminal
      spawnCmd = 'script';
      spawnArgs = [
        '-qfc',
        shell,
        '/dev/null'
      ];
    }

    const proc = spawn(spawnCmd, spawnArgs, {
      cwd,
      env: { 
        ...process.env, 
        TERM: 'xterm-256color',
        PS1: '\\u@\\h:\\w\\$ ' // Set a basic prompt
      }
    });

    session.proc = proc;
    session.status = 'active';
    
    resetTimeout(sessionId);

    ws.send(JSON.stringify({ 
      type: 'ready', 
      sessionId,
      shell,
      cwd
    }));

    // Buffer to handle partial data
    let outputBuffer = '';
    
    proc.stdout.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'output', 
          data: data.toString() 
        }));
      }
    });

    proc.stderr.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'output', 
          data: data.toString() 
        }));
      }
    });

    proc.on('error', (error) => {
      console.error(`Process error for session ${sessionId}:`, error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          data: `Process error: ${error.message}` 
        }));
      }
      cleanup(sessionId);
    });

    proc.on('exit', (code, signal) => {
      console.log(`Session ${sessionId} ended - code: ${code}, signal: ${signal}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'exit', 
          code, 
          signal 
        }));
      }
      cleanup(sessionId);
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        if (data.type === 'input' && session.proc && session.proc.stdin.writable) {
          session.proc.stdin.write(data.data);
          resetTimeout(sessionId);
        } else if (data.type === 'resize' && data.cols && data.rows) {
          // Store resize info for reference
          session.cols = data.cols;
          session.rows = data.rows;
          console.log(`Terminal resize requested: ${data.cols}x${data.rows}`);
        }
      } catch (err) {
        console.error('Invalid WebSocket message:', err);
        ws.send(JSON.stringify({ 
          type: 'error', 
          data: 'Invalid message format' 
        }));
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`WebSocket closed for session ${sessionId}: ${code} - ${reason}`);
      cleanup(sessionId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for session ${sessionId}:`, error);
      cleanup(sessionId);
    });

  } catch (error) {
    console.error('WebSocket connection error:', error);
    if (sessionId) cleanup(sessionId);
    ws.close(4000, 'Connection error');
  }
});

// Helper Functions
function resetTimeout(sessionId) {
  if (sessionTimeouts.has(sessionId)) {
    clearTimeout(sessionTimeouts.get(sessionId));
  }
  
  const timeout = setTimeout(() => {
    console.log(`Session ${sessionId} timed out due to inactivity`);
    cleanup(sessionId);
  }, SESSION_TIMEOUT);
  
  sessionTimeouts.set(sessionId, timeout);
}

function cleanup(sessionId) {
  const session = sessions.get(sessionId);
  
  if (session) {
    if (session.proc) {
      try {
        session.proc.kill();
      } catch (error) {
        console.error(`Error killing process for session ${sessionId}:`, error);
      }
    }
    
    sessions.delete(sessionId);
  }
  
  if (sessionTimeouts.has(sessionId)) {
    clearTimeout(sessionTimeouts.get(sessionId));
    sessionTimeouts.delete(sessionId);
  }
}

// Graceful shutdown
function shutdown() {
  console.log('Shutting down gracefully...');
  
  sessions.forEach((session, id) => {
    cleanup(id);
  });
  
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Start server
server.listen(PORT, () => {
  console.log(`✅ Terminal API Service running on port ${PORT}`);
  console.log(`🌐 REST API: http://localhost:${PORT}/api`);
  console.log(`🔗 WebSocket: ws://localhost:${PORT}/terminal`);
  console.log(`🔑 API Key: ${API_KEY === 'your-secret-api-key' ? '⚠️  Using default key!' : '✓'}`);
  console.log(`⏱️  Session timeout: ${SESSION_TIMEOUT / 1000}s`);
});
