const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');
const crypto = require('crypto');
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_DOCKER = process.env.IS_DOCKER === 'true' || fs.existsSync('/.dockerenv');
const IS_TEST_MODE = NODE_ENV === 'development' && !IS_DOCKER;
const PORT = parseInt(process.env.PORT, 10) || 7860;
const API_KEY = process.env.API_KEY || 'your-secret-api-key';

// Workspace configuration
const WORKSPACE_ROOT = IS_DOCKER ? '/app/workspace' : path.join(__dirname, 'test-workspace');
const USERS_DIR = path.join(WORKSPACE_ROOT, '.users');
const USERS_FILE = path.join(USERS_DIR, 'users.json');

console.log('Starting Advanced Web IDE Server (Multi-User)...');
console.log('Mode:', IS_TEST_MODE ? 'TEST (Local)' : 'PRODUCTION (Docker)');
console.log('Workspace:', WORKSPACE_ROOT);
console.log('Storage: JSON Files (Multi-User)');
console.log('Port:', PORT);

// Ensure directories exist
[WORKSPACE_ROOT, USERS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
});

// User Management Functions
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  return {};
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function getUserProjectPath(username) {
  return path.join(WORKSPACE_ROOT, username);
}

function getUserDataDir(username) {
  return path.join(getUserProjectPath(username), '.data');
}

function getProjectMetaFile(username) {
  return path.join(getUserDataDir(username), 'project.json');
}

function getFilesMetaFile(username) {
  return path.join(getUserDataDir(username), 'files.json');
}

// JSON Storage Functions (per user)
function loadProjectMeta(username) {
  try {
    const metaFile = getProjectMetaFile(username);
    if (fs.existsSync(metaFile)) {
      return JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading project meta:', error);
  }
  
  return {
    _id: username,
    userId: username,
    name: `${username}'s Project`,
    description: 'Personal workspace',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      gitEnabled: true,
      autoSave: true,
      autoSaveDelay: 1000,
    }
  };
}

function saveProjectMeta(username, project) {
  try {
    const dataDir = getUserDataDir(username);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    project.updatedAt = new Date().toISOString();
    fs.writeFileSync(getProjectMetaFile(username), JSON.stringify(project, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving project meta:', error);
  }
}

function loadFilesMeta(username) {
  try {
    const filesFile = getFilesMetaFile(username);
    if (fs.existsSync(filesFile)) {
      return JSON.parse(fs.readFileSync(filesFile, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading files meta:', error);
  }
  return [];
}

function saveFilesMeta(username, files) {
  try {
    const dataDir = getUserDataDir(username);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(getFilesMetaFile(username), JSON.stringify(files, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving files meta:', error);
  }
}

// Initialize user project
function initializeUserProject(username) {
  const userPath = getUserProjectPath(username);
  const dataDir = getUserDataDir(username);
  
  [userPath, dataDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    }
  });
  
  let project = loadProjectMeta(username);
  saveProjectMeta(username, project);
  
  const gitDir = path.join(userPath, '.git');
  if (!fs.existsSync(gitDir)) {
    try {
      const git = simpleGit(userPath);
      git.init();
      git.addConfig('user.name', username);
      git.addConfig('user.email', `${username}@webide.dev`);
    } catch (error) {
      console.warn('Git init failed:', error.message);
    }
  }
}

// Sync functions
function syncFileToMeta(username, filePath) {
  try {
    const userPath = getUserProjectPath(username);
    const fullPath = path.join(userPath, filePath);
    const filesMeta = loadFilesMeta(username);
    
    if (!fs.existsSync(fullPath)) {
      saveFilesMeta(username, filesMeta.filter(f => f.path !== filePath));
      return;
    }

    const stats = fs.statSync(fullPath);
    const existingIndex = filesMeta.findIndex(f => f.path === filePath);
    
    const fileData = {
      _id: existingIndex >= 0 ? filesMeta[existingIndex]._id : uuidv4(),
      projectId: username,
      path: filePath,
      type: stats.isDirectory() ? 'folder' : 'file',
      createdAt: existingIndex >= 0 ? filesMeta[existingIndex].createdAt : stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
    };
    
    if (!stats.isDirectory()) {
      const content = fs.readFileSync(fullPath, 'utf8');
      fileData.content = content;
      fileData.size = Buffer.byteLength(content, 'utf8');
    }
    
    if (existingIndex >= 0) {
      filesMeta[existingIndex] = fileData;
    } else {
      filesMeta.push(fileData);
    }
    
    saveFilesMeta(username, filesMeta);
  } catch (error) {
    console.error('Sync file error:', error);
  }
}

function syncDirectoryToMeta(username, relativePath = '') {
  try {
    const userPath = getUserProjectPath(username);
    const currentPath = path.join(userPath, relativePath);
    const items = fs.readdirSync(currentPath);

    for (const item of items) {
      if (['.git', 'node_modules', '.bashrc', '.data'].includes(item)) continue;

      const itemRelativePath = path.join(relativePath, item);
      const itemFullPath = path.join(currentPath, item);
      const stats = fs.statSync(itemFullPath);

      syncFileToMeta(username, itemRelativePath);
      
      if (stats.isDirectory()) {
        syncDirectoryToMeta(username, itemRelativePath);
      }
    }
  } catch (error) {
    console.error('Sync directory error:', error);
  }
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();
const sessionTimeouts = new Map();

function isPathSafe(requestedPath, baseDir) {
  const resolvedPath = path.resolve(baseDir, requestedPath);
  const resolvedBase = path.resolve(baseDir);
  return resolvedPath.startsWith(resolvedBase);
}

function filterDangerousCommand(input, workspaceDir) {
  const dangerousPatterns = [/\.\.\//g, /\.\.[\/\\]/g, /\$\(.*\.\.\)/g, /`.*\.\.`/g];
  const containsDangerousPattern = dangerousPatterns.some(pattern => pattern.test(input));
  
  if (containsDangerousPattern) {
    const dangerousCommands = ['rm', 'mv', 'cp', 'chmod', 'chown', 'cat', 'vi', 'vim', 'nano', 'touch', 'mkdir'];
    const firstWord = input.trim().split(/\s+/)[0];
    
    if (dangerousCommands.includes(firstWord)) {
      return {
        blocked: true,
        message: '\r\n\x1b[31m⚠️  Security: Path traversal detected. Operations outside workspace are blocked.\x1b[0m\r\n'
      };
    }
  }

  return { blocked: false };
}

function getWebSocketUrl(req, sessionId, apiKey) {
  const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME;
  if (renderHost) return `wss://${renderHost}/terminal?sessionId=${sessionId}&apiKey=${apiKey}`;
  
  const codespaceUrl = process.env.CODESPACE_NAME;
  if (codespaceUrl) return `wss://${codespaceUrl}-${PORT}.app.github.dev/terminal?sessionId=${sessionId}&apiKey=${apiKey}`;
  
  const forwardedProto = req.get('x-forwarded-proto');
  const forwardedHost = req.get('x-forwarded-host');
  
  if (forwardedHost) {
    const wsProtocol = forwardedProto === 'https' ? 'wss' : 'ws';
    return `${wsProtocol}://${forwardedHost}/terminal?sessionId=${sessionId}&apiKey=${apiKey}`;
  }
  
  const protocol = req.protocol === 'https' ? 'wss' : 'ws';
  const host = req.get('host');
  return `${protocol}://${host}/terminal?sessionId=${sessionId}&apiKey=${apiKey}`;
}

function authenticateAPI(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeSessions: sessions.size,
    uptime: process.uptime(),
    port: PORT,
    mode: IS_TEST_MODE ? 'test' : 'production',
    isDocker: IS_DOCKER,
    storage: 'JSON Files (Multi-User)',
    workspace: WORKSPACE_ROOT,
    userCount: Object.keys(loadUsers()).length,
  });
});

// Authentication Routes
app.post('/api/auth/register', authenticateAPI, (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ 
        error: 'Username must be 3-20 characters (letters, numbers, underscore only)' 
      });
    }
    
    const users = loadUsers();
    
    if (users[username]) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    users[username] = {
      username,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };
    
    saveUsers(users);
    initializeUserProject(username);
    
    console.log('✓ User registered:', username);
    
    res.json({ 
      success: true, 
      username,
      message: 'Account created successfully'
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', authenticateAPI, (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const users = loadUsers();
    const user = users[username];
    
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    user.lastLogin = new Date().toISOString();
    saveUsers(users);
    initializeUserProject(username);
    
    console.log('✓ User logged in:', username);
    
    res.json({ 
      success: true, 
      username,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/verify', authenticateAPI, (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    const users = loadUsers();
    if (!users[username]) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    initializeUserProject(username);
    
    res.json({ success: true, username, valid: true });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Project Management
app.post('/api/projects', authenticateAPI, async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    const users = loadUsers();
    if (!users[username]) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    initializeUserProject(username);
    const project = loadProjectMeta(username);
    
    res.json({ success: true, project });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects', authenticateAPI, async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    const project = loadProjectMeta(username);
    res.json({ projects: [project] });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:projectId', authenticateAPI, async (req, res) => {
  try {
    const { projectId } = req.params; // projectId is username
    
    const users = loadUsers();
    if (!users[projectId]) {
      return res.status(404).json({ error: 'User/Project not found' });
    }
    
    const project = loadProjectMeta(projectId);
    res.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load project from metadata to filesystem
app.post('/api/projects/:projectId/load', authenticateAPI, async (req, res) => {
  try {
    const { projectId } = req.params; // projectId is username
    
    const users = loadUsers();
    if (!users[projectId]) {
      return res.status(404).json({ error: 'User/Project not found' });
    }

    const userPath = getUserProjectPath(projectId);
    if (!fs.existsSync(userPath)) {
      fs.mkdirSync(userPath, { recursive: true });
    }

    const files = loadFilesMeta(projectId);

    for (const file of files) {
      const fullPath = path.join(userPath, file.path);
      
      if (file.type === 'folder') {
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
      } else {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, file.content || '');
      }
    }

    res.json({ success: true, filesLoaded: files.length });
  } catch (error) {
    console.error('Load project error:', error);
    res.status(500).json({ error: error.message });
  }
});

// File Management
app.post('/api/files', authenticateAPI, async (req, res) => {
  try {
    const { username, path: filePath, content, type } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    const userPath = getUserProjectPath(username);
    const fileId = uuidv4();

    if (!isPathSafe(filePath, userPath)) {
      return res.status(403).json({ error: 'Access denied: Path outside workspace' });
    }

    const file = {
      _id: fileId,
      projectId: username,
      path: filePath,
      content,
      type,
      size: Buffer.byteLength(content || '', 'utf8'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const fullPath = path.join(userPath, filePath);
    
    if (type === 'folder') {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content || '');
    }

    const files = loadFilesMeta(username);
    files.push(file);
    saveFilesMeta(username, files);

    res.json({ success: true, file });
  } catch (error) {
    console.error('Create file error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/files/:fileId', authenticateAPI, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { username, content } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    const files = loadFilesMeta(username);
    const fileIndex = files.findIndex(f => f._id === fileId);
    
    if (fileIndex < 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[fileIndex];
    const userPath = getUserProjectPath(username);

    if (!isPathSafe(file.path, userPath)) {
      return res.status(403).json({ error: 'Access denied: Path outside workspace' });
    }

    const fullPath = path.join(userPath, file.path);
    fs.writeFileSync(fullPath, content);

    files[fileIndex].content = content;
    files[fileIndex].size = Buffer.byteLength(content, 'utf8');
    files[fileIndex].updatedAt = new Date().toISOString();
    saveFilesMeta(username, files);

    res.json({ success: true });
  } catch (error) {
    console.error('Update file error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/files', authenticateAPI, async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    const files = loadFilesMeta(username);
    res.json({ files });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/files/:fileId', authenticateAPI, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    const files = loadFilesMeta(username);
    const file = files.find(f => f._id === fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const userPath = getUserProjectPath(username);

    if (!isPathSafe(file.path, userPath)) {
      return res.status(403).json({ error: 'Access denied: Path outside workspace' });
    }

    const fullPath = path.join(userPath, file.path);
    
    if (fs.existsSync(fullPath)) {
      if (file.type === 'folder') {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }

    const updatedFiles = files.filter(f => f._id !== fileId);
    saveFilesMeta(username, updatedFiles);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync endpoint
app.post('/api/projects/:projectId/sync', authenticateAPI, async (req, res) => {
  try {
    const { projectId } = req.params; // projectId is username
    
    const users = loadUsers();
    if (!users[projectId]) {
      return res.status(404).json({ error: 'User/Project not found' });
    }

    const userPath = getUserProjectPath(projectId);
    if (!fs.existsSync(userPath)) {
      return res.status(404).json({ error: 'Project directory not found' });
    }

    syncDirectoryToMeta(projectId);

    res.json({ success: true, message: 'Project synced to JSON metadata' });
  } catch (error) {
    console.error('Sync project error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Git Operations
app.post('/api/git/:projectId/commit', authenticateAPI, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { message } = req.body;
    
    const userPath = getUserProjectPath(projectId);
    const git = simpleGit(userPath);

    await git.add('.');
    await git.commit(message);
    const log = await git.log({ maxCount: 1 });

    res.json({ success: true, commit: log.latest });
  } catch (error) {
    console.error('Git commit error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/git/:projectId/status', authenticateAPI, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userPath = getUserProjectPath(projectId);
    const git = simpleGit(userPath);

    const status = await git.status();
    const branch = await git.branchLocal();

    res.json({ status, branch: branch.current });
  } catch (error) {
    console.error('Git status error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/git/:projectId/branch', authenticateAPI, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name } = req.body;
    const userPath = getUserProjectPath(projectId);
    const git = simpleGit(userPath);

    await git.checkoutLocalBranch(name);

    res.json({ success: true, branch: name });
  } catch (error) {
    console.error('Git branch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Session Management
app.post('/api/sessions', authenticateAPI, async (req, res) => {
  const sessionId = uuidv4();
  const { username, metadata } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  const session = {
    id: sessionId,
    userId: username,
    projectId: username,
    metadata: metadata || {},
    createdAt: new Date(),
    status: 'pending',
    lastActivity: new Date(),
  };

  sessions.set(sessionId, session);

  const wsUrl = getWebSocketUrl(req, sessionId, API_KEY);

  console.log(`Created session ${sessionId} for user ${username}`);

  res.json({
    sessionId,
    wsUrl,
    status: 'created',
    mode: IS_TEST_MODE ? 'test' : 'production',
    projectId: username
  });
});

app.get('/api/sessions/:sessionId', authenticateAPI, async (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

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

// WebSocket Terminal Handler
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const apiKey = url.searchParams.get('apiKey');

  if (apiKey !== API_KEY) {
    ws.close(4001, 'Invalid API key');
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    ws.close(4004, 'Session not found');
    return;
  }

  console.log(`WebSocket connected: ${sessionId}`);

  let ptyProcess = null;
  let commandBuffer = '';

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'start') {
        const sessionDir = getUserProjectPath(session.userId);
        
        if (!fs.existsSync(sessionDir)) {
          fs.mkdirSync(sessionDir, { recursive: true });
        }

        const bashrcPath = path.join(sessionDir, '.bashrc');
        const bashrcContent = `
export BASH_SILENCE_DEPRECATION_WARNING=1
export PS1='\\[\\033[01;32m\\]root@cybernetic\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ '

WORKSPACE="${sessionDir}"

cd() {
  local target="\${1:-.}"
  local abs_target=\$(builtin cd "$target" 2>/dev/null && pwd)
  
  if [[ "$abs_target" == "$WORKSPACE"* ]]; then
    builtin cd "$target"
  else
    echo "⚠️  Access denied: Cannot navigate outside workspace"
    return 1
  fi
}

builtin cd "$WORKSPACE"
clear
`;
        fs.writeFileSync(bashrcPath, bashrcContent);

        ptyProcess = pty.spawn('/bin/bash', ['--rcfile', bashrcPath, '-i'], {
          name: 'xterm-color',
          cols: data.cols || 80,
          rows: data.rows || 24,
          cwd: sessionDir,
          env: {
            TERM: 'xterm-256color',
            HOME: sessionDir,
            USER: 'root',
            SHELL: '/bin/bash',
            PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
            WORKDIR: sessionDir,
            HOSTNAME: 'cybernetic',
            PS1: '\\[\\033[01;32m\\]root@cybernetic\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ ',
          }
        });

        session.ptyProcess = ptyProcess;
        session.status = 'active';
        session.workspaceDir = sessionDir;

        ws.send(JSON.stringify({ type: 'ready', sessionId }));

        ptyProcess.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'output', data }));
          }
        });

        ptyProcess.onExit((exitCode) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'exit', code: exitCode.exitCode }));
          }
          cleanup(sessionId);
        });

        resetTimeout(sessionId);
      } else if (data.type === 'input') {
        if (ptyProcess) {
          if (data.data === '\r') {
            const check = filterDangerousCommand(commandBuffer, session.workspaceDir);
            if (check.blocked) {
              ptyProcess.write('\x03');
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'output', data: check.message }));
              }
              commandBuffer = '';
              return;
            }
            commandBuffer = '';
          } else if (data.data === '\x7f' || data.data === '\b') {
            commandBuffer = commandBuffer.slice(0, -1);
          } else if (data.data === '\x03') {
            commandBuffer = '';
          } else if (data.data.charCodeAt(0) >= 32) {
            commandBuffer += data.data;
          }

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
    console.log(`WebSocket closed: ${sessionId}`);
    
    // Sync filesystem to metadata before cleanup
    if (session.userId) {
      syncDirectoryToMeta(session.userId);
      console.log(`Synced project for user: ${session.userId}`);
    }
    
    cleanup(sessionId);
  });
});

function resetTimeout(sessionId) {
  if (sessionTimeouts.has(sessionId)) {
    clearTimeout(sessionTimeouts.get(sessionId));
  }
  
  const timeout = setTimeout(() => {
    console.log(`Session ${sessionId} timed out`);
    cleanup(sessionId);
  }, 30 * 60 * 1000);

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
      try {
        session.ptyProcess.kill();
      } catch (e) {
        console.error('Error killing PTY:', e);
      }
    }
    session.status = 'destroyed';
    sessions.delete(sessionId);
  }
}

// Graceful Shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  console.log('\nShutting down...');
  
  // Sync all active sessions
  sessions.forEach((session) => {
    if (session.userId) {
      console.log(`📝 Final sync for user: ${session.userId}`);
      syncDirectoryToMeta(session.userId);
    }
  });
  
  sessions.forEach((session, sessionId) => {
    cleanup(sessionId);
  });
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║   Advanced Web IDE Backend (Multi-User)    ║`);
  console.log(`╚════════════════════════════════════════════╝\n`);
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`💾 Storage: JSON Files (Multi-User)`);
  console.log(`📦 Mode: ${IS_TEST_MODE ? 'TEST' : 'PRODUCTION'}`);
  console.log(`🔒 Security: Command filtering enabled`);
  console.log(`🔄 Auto-sync: Enabled on terminal close`);
  console.log(`👥 Users: ${Object.keys(loadUsers()).length} registered`);
  console.log(`📂 Workspace: ${WORKSPACE_ROOT}`);
  console.log(`\n✓ Ready\n`);
});