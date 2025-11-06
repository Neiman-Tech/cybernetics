const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises; // Use promises API
const fsSync = require('fs'); // Keep sync for some operations
const simpleGit = require('simple-git');
const crypto = require('crypto');
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_DOCKER = process.env.IS_DOCKER === 'true' || fsSync.existsSync('/.dockerenv');
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
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
});

// Sync queue management
const syncQueues = new Map(); // username -> { syncing: boolean, queued: boolean }
const syncLocks = new Map(); // username -> promise

// User Management Functions
function loadUsers() {
  try {
    if (fsSync.existsSync(USERS_FILE)) {
      return JSON.parse(fsSync.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  return {};
}

function saveUsers(users) {
  try {
    fsSync.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
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
async function loadProjectMeta(username) {
  try {
    const metaFile = getProjectMetaFile(username);
    if (fsSync.existsSync(metaFile)) {
      const content = await fs.readFile(metaFile, 'utf8');
      return JSON.parse(content);
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

async function saveProjectMeta(username, project) {
  try {
    const dataDir = getUserDataDir(username);
    if (!fsSync.existsSync(dataDir)) {
      await fs.mkdir(dataDir, { recursive: true });
    }
    project.updatedAt = new Date().toISOString();
    await fs.writeFile(getProjectMetaFile(username), JSON.stringify(project, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving project meta:', error);
  }
}

async function loadFilesMeta(username) {
  try {
    const filesFile = getFilesMetaFile(username);
    if (fsSync.existsSync(filesFile)) {
      const content = await fs.readFile(filesFile, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error loading files meta:', error);
  }
  return [];
}

async function saveFilesMeta(username, files) {
  try {
    const dataDir = getUserDataDir(username);
    if (!fsSync.existsSync(dataDir)) {
      await fs.mkdir(dataDir, { recursive: true });
    }
    await fs.writeFile(getFilesMetaFile(username), JSON.stringify(files, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving files meta:', error);
  }
}

// Initialize user project
async function initializeUserProject(username) {
  const userPath = getUserProjectPath(username);
  const dataDir = getUserDataDir(username);
  
  for (const dir of [userPath, dataDir]) {
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true, mode: 0o755 });
    }
  }
  
  let project = await loadProjectMeta(username);
  await saveProjectMeta(username, project);
  
  const gitDir = path.join(userPath, '.git');
  if (!fsSync.existsSync(gitDir)) {
    try {
      const git = simpleGit(userPath);
      await git.init();
      await git.addConfig('user.name', username);
      await git.addConfig('user.email', `${username}@webide.dev`);
    } catch (error) {
      console.warn('Git init failed:', error.message);
    }
  }
}

// Improved async sync functions with batching
async function syncFileToMeta(username, filePath, filesMeta) {
  try {
    const userPath = getUserProjectPath(username);
    const fullPath = path.join(userPath, filePath);
    
    try {
      await fs.access(fullPath);
    } catch {
      // File doesn't exist, remove from meta
      return filesMeta.filter(f => f.path !== filePath);
    }

    const stats = await fs.stat(fullPath);
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
      const content = await fs.readFile(fullPath, 'utf8');
      fileData.content = content;
      fileData.size = Buffer.byteLength(content, 'utf8');
    }
    
    if (existingIndex >= 0) {
      filesMeta[existingIndex] = fileData;
    } else {
      filesMeta.push(fileData);
    }
    
    return filesMeta;
  } catch (error) {
    console.error('Sync file error:', error);
    return filesMeta;
  }
}

async function syncDirectoryToMetaBatch(username, relativePath = '', filesMeta = null, maxDepth = 10, currentDepth = 0) {
  if (currentDepth > maxDepth) {
    console.warn(`Max depth reached for ${relativePath}`);
    return filesMeta || [];
  }

  try {
    const userPath = getUserProjectPath(username);
    const currentPath = path.join(userPath, relativePath);
    
    let items;
    try {
      items = await fs.readdir(currentPath);
    } catch (error) {
      console.error(`Cannot read directory ${currentPath}:`, error.message);
      return filesMeta || [];
    }

    if (filesMeta === null) {
      filesMeta = await loadFilesMeta(username);
    }

    // Filter out excluded items
    const filteredItems = items.filter(item => 
      !['.git', 'node_modules', '.bashrc', '.data'].includes(item)
    );

    // Process in batches to avoid overwhelming the system
    const BATCH_SIZE = 50;
    for (let i = 0; i < filteredItems.length; i += BATCH_SIZE) {
      const batch = filteredItems.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (item) => {
        const itemRelativePath = path.join(relativePath, item);
        const itemFullPath = path.join(currentPath, item);
        
        try {
          const stats = await fs.stat(itemFullPath);
          filesMeta = await syncFileToMeta(username, itemRelativePath, filesMeta);
          
          if (stats.isDirectory()) {
            filesMeta = await syncDirectoryToMetaBatch(username, itemRelativePath, filesMeta, maxDepth, currentDepth + 1);
          }
        } catch (error) {
          console.error(`Error processing ${itemRelativePath}:`, error.message);
        }
      }));

      // Save after each batch to prevent data loss
      if (i % (BATCH_SIZE * 2) === 0) {
        await saveFilesMeta(username, filesMeta);
      }
    }

    return filesMeta;
  } catch (error) {
    console.error('Sync directory error:', error);
    return filesMeta || [];
  }
}

// Debounced sync with queue management
async function queuedSync(username) {
  // Initialize queue state
  if (!syncQueues.has(username)) {
    syncQueues.set(username, { syncing: false, queued: false });
  }

  const queue = syncQueues.get(username);

  // If already syncing, mark as queued and return
  if (queue.syncing) {
    queue.queued = true;
    console.log(`⏳ Sync queued for user: ${username}`);
    return;
  }

  // Start syncing
  queue.syncing = true;
  queue.queued = false;

  try {
    console.log(`🔄 Starting sync for user: ${username}`);
    const filesMeta = await syncDirectoryToMetaBatch(username);
    await saveFilesMeta(username, filesMeta);
    console.log(`✓ Sync completed for user: ${username} (${filesMeta.length} files)`);
  } catch (error) {
    console.error(`❌ Sync failed for user ${username}:`, error);
  } finally {
    queue.syncing = false;

    // If another sync was queued, start it
    if (queue.queued) {
      setImmediate(() => queuedSync(username));
    }
  }
}

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development
    if (IS_TEST_MODE) return callback(null, true);
    
    // In production, you might want to restrict this
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Handle preflight requests
app.options('*', cors(corsOptions));

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
app.post('/api/auth/register', authenticateAPI, async (req, res) => {
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
    await initializeUserProject(username);
    
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

app.post('/api/auth/login', authenticateAPI, async (req, res) => {
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
    await initializeUserProject(username);
    
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

app.post('/api/auth/verify', authenticateAPI, async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    const users = loadUsers();
    if (!users[username]) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    await initializeUserProject(username);
    
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
    
    await initializeUserProject(username);
    const project = await loadProjectMeta(username);
    
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
    
    const project = await loadProjectMeta(username);
    res.json({ projects: [project] });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:projectId', authenticateAPI, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const users = loadUsers();
    if (!users[projectId]) {
      return res.status(404).json({ error: 'User/Project not found' });
    }
    
    const project = await loadProjectMeta(projectId);
    res.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load project from metadata to filesystem
app.post('/api/projects/:projectId/load', authenticateAPI, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const users = loadUsers();
    if (!users[projectId]) {
      return res.status(404).json({ error: 'User/Project not found' });
    }

    const userPath = getUserProjectPath(projectId);
    if (!fsSync.existsSync(userPath)) {
      await fs.mkdir(userPath, { recursive: true });
    }

    const files = await loadFilesMeta(projectId);

    for (const file of files) {
      const fullPath = path.join(userPath, file.path);
      
      if (file.type === 'folder') {
        if (!fsSync.existsSync(fullPath)) {
          await fs.mkdir(fullPath, { recursive: true });
        }
      } else {
        const dir = path.dirname(fullPath);
        if (!fsSync.existsSync(dir)) {
          await fs.mkdir(dir, { recursive: true });
        }
        await fs.writeFile(fullPath, file.content || '');
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
      await fs.mkdir(fullPath, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content || '');
    }

    const files = await loadFilesMeta(username);
    files.push(file);
    await saveFilesMeta(username, files);

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

    const files = await loadFilesMeta(username);
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
    await fs.writeFile(fullPath, content);

    files[fileIndex].content = content;
    files[fileIndex].size = Buffer.byteLength(content, 'utf8');
    files[fileIndex].updatedAt = new Date().toISOString();
    await saveFilesMeta(username, files);

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
    
    const files = await loadFilesMeta(username);
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

    const files = await loadFilesMeta(username);
    const file = files.find(f => f._id === fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const userPath = getUserProjectPath(username);

    if (!isPathSafe(file.path, userPath)) {
      return res.status(403).json({ error: 'Access denied: Path outside workspace' });
    }

    const fullPath = path.join(userPath, file.path);
    
    if (fsSync.existsSync(fullPath)) {
      if (file.type === 'folder') {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
    }

    const updatedFiles = files.filter(f => f._id !== fileId);
    await saveFilesMeta(username, updatedFiles);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Improved sync endpoint with queue
app.post('/api/projects/:projectId/sync', authenticateAPI, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const users = loadUsers();
    if (!users[projectId]) {
      return res.status(404).json({ error: 'User/Project not found' });
    }

    const userPath = getUserProjectPath(projectId);
    if (!fsSync.existsSync(userPath)) {
      return res.status(404).json({ error: 'Project directory not found' });
    }

    // Queue the sync operation (non-blocking)
    queuedSync(projectId);

    res.json({ success: true, message: 'Sync queued', syncing: true });
  } catch (error) {
    console.error('Sync project error:', error);
    res.status(500).json({ error: error.message });
  }
});

// New endpoint to check sync status
app.get('/api/projects/:projectId/sync-status', authenticateAPI, (req, res) => {
  const { projectId } = req.params;
  const queue = syncQueues.get(projectId);
  
  if (!queue) {
    return res.json({ syncing: false, queued: false });
  }
  
  res.json({ syncing: queue.syncing, queued: queue.queued });
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

// WebSocket Terminal Handler with improved sync handling
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
  let lastSyncTime = Date.now();
  const SYNC_DEBOUNCE_MS = 5000; // Sync at most every 5 seconds

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'start') {
        const sessionDir = getUserProjectPath(session.userId);
        
        if (!fsSync.existsSync(sessionDir)) {
          fsSync.mkdirSync(sessionDir, { recursive: true });
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
        fsSync.writeFileSync(bashrcPath, bashrcContent);

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
            
            // Debounced sync after command execution
            const now = Date.now();
            if (now - lastSyncTime > SYNC_DEBOUNCE_MS) {
              lastSyncTime = now;
              // Trigger sync asynchronously without blocking
              setImmediate(() => queuedSync(session.userId));
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
      } else if (data.type === 'sync') {
        // Manual sync trigger from client
        queuedSync(session.userId);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'sync-started' }));
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket closed: ${sessionId}`);
    
    // Final sync before cleanup
    if (session.userId) {
      console.log(`📝 Final sync for user: ${session.userId}`);
      queuedSync(session.userId);
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
  const syncPromises = [];
  sessions.forEach((session) => {
    if (session.userId) {
      console.log(`📝 Final sync for user: ${session.userId}`);
      syncPromises.push(queuedSync(session.userId));
    }
  });
  
  // Wait for all syncs to complete (with timeout)
  await Promise.race([
    Promise.all(syncPromises),
    new Promise(resolve => setTimeout(resolve, 10000)) // 10s timeout
  ]);
  
  sessions.forEach((session, sessionId) => {
    cleanup(sessionId);
  });
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

// Periodic sync for active sessions (every 30 seconds)
setInterval(() => {
  sessions.forEach((session) => {
    if (session.status === 'active' && session.userId) {
      const queue = syncQueues.get(session.userId);
      // Only sync if not already syncing or queued
      if (!queue || (!queue.syncing && !queue.queued)) {
        queuedSync(session.userId);
      }
    }
  });
}, 30000);

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║   Advanced Web IDE Backend (Multi-User)    ║`);
  console.log(`╚════════════════════════════════════════════╝\n`);
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`💾 Storage: JSON Files (Multi-User)`);
  console.log(`📦 Mode: ${IS_TEST_MODE ? 'TEST' : 'PRODUCTION'}`);
  console.log(`🔒 Security: Command filtering enabled`);
  console.log(`🔄 Auto-sync: Debounced + Queued (5s interval)`);
  console.log(`👥 Users: ${Object.keys(loadUsers()).length} registered`);
  console.log(`📂 Workspace: ${WORKSPACE_ROOT}`);
  console.log(`\n✓ Ready\n`);
});