// Global variables
let terminal, fitAddon, ws = null;
let editor = null;
let sessionId = null;
let isConnected = false;
let currentPath = '~';
let openFiles = new Map();
let activeFile = null;
let modalCallback = null;
let currentDirContents = new Set();

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('ide-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('ide-theme', newTheme);
  updateThemeIcon(newTheme);
  
  if (editor) {
    editor.updateOptions({ theme: newTheme === 'dark' ? 'vs-dark' : 'vs' });
  }
  
  if (terminal) {
    updateTerminalTheme(newTheme);
  }
  
  showNotification(`Switched to ${newTheme} theme`, 'success');
}

function updateThemeIcon(theme) {
  document.getElementById('themeIcon').className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function updateTerminalTheme(theme) {
  if (!terminal) return;
  terminal.options.theme = theme === 'dark' ? {
    background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#00ff00'
  } : {
    background: '#ffffff', foreground: '#333333', cursor: '#0078d4'
  };
}

// URL helpers
const getBaseURL = () => {
  const protocol = window.location.protocol;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return { http: `${protocol}//${host}`, ws: `${wsProtocol}//${host}` };
};

// Monaco Editor initialization
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
require(['vs/editor/editor.main'], function() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: '',
    language: 'javascript',
    theme: theme === 'dark' ? 'vs-dark' : 'vs',
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    fontFamily: "'Fira Code', 'Cascadia Code', monospace",
    fontLigatures: true
  });

  editor.onDidChangeModelContent(() => {
    if (activeFile && openFiles.has(activeFile)) {
      const fileData = openFiles.get(activeFile);
      fileData.modified = true;
      updateTab(activeFile);
    }
  });

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveFile());
});

// Terminal initialization
function initTerminal() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'Fira Code', monospace",
    theme: theme === 'dark' ? {
      background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#00ff00'
    } : {
      background: '#ffffff', foreground: '#333333', cursor: '#0078d4'
    }
  });
  
  fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(document.getElementById('terminal'));
  fitAddon.fit();
  
  terminal.writeln('\x1b[1;36m╔═══════════════════════════════════════╗\x1b[0m');
  terminal.writeln('\x1b[1;36m║   Web IDE - Direct Terminal Mode     ║\x1b[0m');
  terminal.writeln('\x1b[1;36m╚═══════════════════════════════════════╝\x1b[0m');
  terminal.writeln('');
  terminal.writeln('\x1b[32m✓\x1b[0m Terminal ready. Click Connect to start.');
  terminal.writeln('');

  terminal.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  window.addEventListener('resize', () => {
    fitAddon.fit();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'resize',
        cols: terminal.cols,
        rows: terminal.rows
      }));
    }
  });
}

// Resizable panels
function initResizers() {
  const sidebarResizer = document.getElementById('sidebarResizer');
  const sidebar = document.querySelector('.sidebar');
  let isResizingSidebar = false;
  
  sidebarResizer.addEventListener('mousedown', (e) => {
    isResizingSidebar = true;
    document.body.style.cursor = 'col-resize';
  });
  
  const terminalResizer = document.getElementById('terminalResizer');
  const terminalPanel = document.querySelector('.terminal-panel');
  let isResizingTerminal = false;
  
  terminalResizer.addEventListener('mousedown', (e) => {
    isResizingTerminal = true;
    document.body.style.cursor = 'row-resize';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isResizingSidebar) {
      const newWidth = e.clientX;
      if (newWidth > 200 && newWidth < 600) {
        sidebar.style.width = newWidth + 'px';
      }
    }
    if (isResizingTerminal) {
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 150 && newHeight < 600) {
        terminalPanel.style.height = newHeight + 'px';
        setTimeout(() => {
          fitAddon.fit();
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'resize',
              cols: terminal.cols,
              rows: terminal.rows
            }));
          }
        }, 100);
      }
    }
  });
  
  document.addEventListener('mouseup', () => {
    isResizingSidebar = false;
    isResizingTerminal = false;
    document.body.style.cursor = 'default';
  });
}

// Notification system
function showNotification(message, type = 'success') {
  const icons = {
    success: 'check-circle',
    error: 'exclamation-circle',
    warning: 'exclamation-triangle'
  };
  
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.innerHTML = `
    <i class="fas fa-${icons[type]}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(notif);
  
  setTimeout(() => {
    notif.style.animation = 'slideOut 0.3s';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// WebSocket connection
async function connect() {
  const baseURL = getBaseURL();
  const apiKey = document.getElementById('apiKey').value || 'your-secret-api-key';

  if (ws && ws.readyState === WebSocket.OPEN) {
    showNotification('Already connected', 'warning');
    return;
  }

  const connectBtn = document.getElementById('connectBtn');
  connectBtn.disabled = true;
  connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Connecting...</span>';
  
  document.getElementById('statusText').textContent = 'Connecting...';
  terminal.writeln('\r\n\x1b[33m→ Connecting to server...\x1b[0m');

  try {
    const res = await fetch(`${baseURL.http}/api/sessions`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId: 'ide-user' })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const session = await res.json();
    sessionId = session.sessionId;
    const wsUrl = session.wsUrl;

    terminal.writeln(`\x1b[32m✓\x1b[0m Session: \x1b[90m${sessionId}\x1b[0m`);
    terminal.writeln('');

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected = true;
      document.getElementById('statusDot').classList.add('connected');
      document.getElementById('statusText').textContent = 'Connected';
      connectBtn.style.display = 'none';
      document.getElementById('disconnectBtn').style.display = 'flex';
      
      terminal.writeln('\x1b[1;32m✓ Connected!\x1b[0m');
      showNotification('Connected successfully!', 'success');

      ws.send(JSON.stringify({
        type: 'start',
        cols: terminal.cols,
        rows: terminal.rows
      }));
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        msg = { type: 'output', data: event.data };
      }

      if (msg.type === 'output') {
        terminal.write(msg.data);
      } else if (msg.type === 'ready') {
        terminal.writeln('\r\n\x1b[1;36m═══════════════════════════════════════\x1b[0m');
        terminal.writeln('\x1b[1;32m✓ Terminal ready!\x1b[0m');
        terminal.writeln('\x1b[1;36m═══════════════════════════════════════\x1b[0m\r\n');
        currentPath = msg.cwd || '~';
        refreshFileExplorer();
      } else if (msg.type === 'exit') {
        terminal.writeln(`\r\n\x1b[31m✗ Session ended (code: ${msg.code})\x1b[0m`);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      document.getElementById('statusDot').classList.remove('connected');
      document.getElementById('statusText').textContent = 'Disconnected';
      connectBtn.style.display = 'flex';
      connectBtn.disabled = false;
      connectBtn.innerHTML = '<i class="fas fa-plug"></i><span>Connect</span>';
      document.getElementById('disconnectBtn').style.display = 'none';
      terminal.writeln('\r\n\x1b[31m✗ Disconnected\x1b[0m');
      showNotification('Disconnected', 'warning');
    };

    ws.onerror = (err) => {
      showNotification('Connection error', 'error');
      console.error('WebSocket error:', err);
    };

  } catch (err) {
    showNotification('Connection failed: ' + err.message, 'error');
    terminal.writeln(`\x1b[31m✗ Error: ${err.message}\x1b[0m`);
    connectBtn.disabled = false;
    connectBtn.innerHTML = '<i class="fas fa-plug"></i><span>Connect</span>';
  }
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

// Simple command execution - capture output between markers
function runCommand(command) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      resolve('');
      return;
    }

    const marker = `__MARKER_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
    let output = '';
    let capturing = false;

    function handler(event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') {
          const data = msg.data;
          
          if (data.includes(`START_${marker}`)) {
            capturing = true;
            return;
          }
          
          if (data.includes(`END_${marker}`)) {
            ws.removeEventListener('message', handler);
            resolve(output);
            return;
          }
          
          if (capturing) {
            output += data;
          }
        }
      } catch (e) {}
    }

    ws.addEventListener('message', handler);
    
    setTimeout(() => {
      ws.removeEventListener('message', handler);
      resolve(output);
    }, 5000);

    ws.send(JSON.stringify({ 
      type: 'input', 
      data: `echo "START_${marker}" && ${command} && echo "END_${marker}"\n`
    }));
  });
}

// Refresh file explorer - just run "ls"
async function refreshFileExplorer() {
  if (!isConnected) return;
  
  const explorer = document.getElementById('fileExplorer');
  explorer.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>';
  
  const output = await runCommand('ls -1');
  const lines = output.split('\n').filter(l => l.trim() && !l.includes('START_') && !l.includes('END_'));
  
  explorer.innerHTML = '';
  document.getElementById('pathDisplay').textContent = currentPath;
  currentDirContents.clear();
  
  if (lines.length === 0) {
    explorer.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>Empty directory</p></div>';
    return;
  }
  
  for (const name of lines) {
    currentDirContents.add(name.toLowerCase());
    
    // Check if it's a directory
    const isDir = (await runCommand(`[ -d "${name}" ] && echo "DIR"`)).includes('DIR');
    
    const div = document.createElement('div');
    div.className = `file-item ${isDir ? 'folder' : 'file'}`;
    div.dataset.name = name;
    
    if (isDir) {
      div.innerHTML = `
        <i class="fas fa-folder"></i>
        <span class="file-item-name">${escapeHtml(name)}</span>
        <div class="file-item-actions">
          <button onclick="event.stopPropagation(); renameItem('${escapeHtml(name)}')" title="Rename">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="event.stopPropagation(); deleteItem('${escapeHtml(name)}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
      div.onclick = () => openFolder(name);
    } else {
      const icon = getFileIcon(name);
      div.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span class="file-item-name">${escapeHtml(name)}</span>
        <div class="file-item-actions">
          <button onclick="event.stopPropagation(); renameItem('${escapeHtml(name)}')" title="Rename">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="event.stopPropagation(); deleteItem('${escapeHtml(name)}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
      div.onclick = () => openFile(name);
    }
    
    explorer.appendChild(div);
  }
}

// Open folder - just cd into it
async function openFolder(folderName) {
  ws.send(JSON.stringify({ type: 'input', data: `cd "${folderName}"\n` }));
  currentPath = `${currentPath}/${folderName}`;
  setTimeout(() => refreshFileExplorer(), 300);
}

// Open file - just cat it
async function openFile(filename) {
  if (!isConnected) {
    showNotification('Not connected', 'warning');
    return;
  }

  const fullPath = `${currentPath}/${filename}`;
  
  if (openFiles.has(fullPath)) {
    setActiveFile(fullPath);
    return;
  }

  showNotification(`Opening ${filename}...`, 'success');
  
  const content = await runCommand(`cat "${filename}"`);
  const cleanContent = content.replace(/START_.*?__\n?/g, '').replace(/END_.*?__\n?/g, '').trim();
  
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('editor').style.display = 'block';
  
  const language = detectLanguage(filename);
  const model = monaco.editor.createModel(cleanContent, language);
  
  openFiles.set(fullPath, {
    filename,
    filepath: fullPath,
    model,
    modified: false
  });

  addTab(fullPath, filename);
  setActiveFile(fullPath);
  
  showNotification(`Opened ${filename}`, 'success');
}

// Save file - use heredoc
async function saveFile() {
  if (!activeFile || !openFiles.has(activeFile)) {
    showNotification('No file open', 'warning');
    return;
  }

  const fileData = openFiles.get(activeFile);
  const content = fileData.model.getValue();
  const filename = fileData.filename;

  const delimiter = `EOF_${Date.now()}`;
  const command = `cat > "${filename}" <<'${delimiter}'\n${content}\n${delimiter}`;
  
  ws.send(JSON.stringify({ type: 'input', data: command + '\n' }));
  
  fileData.modified = false;
  updateTab(activeFile);
  showNotification(`💾 Saved ${filename}`, 'success');
}

// Create new file - just touch or redirect
function showNewFileDialog() {
  if (!isConnected) {
    showNotification('Not connected', 'warning');
    return;
  }
  
  document.getElementById('modalTitle').textContent = 'New File';
  document.getElementById('modalInput').value = '';
  document.getElementById('modalInput').placeholder = 'filename.txt';
  document.getElementById('modal').classList.add('active');
  document.getElementById('modalInput').focus();
  
  modalCallback = async (name) => {
    if (!name) return;
    
    if (currentDirContents.has(name.toLowerCase())) {
      showNotification(`"${name}" already exists`, 'error');
      return;
    }
    
    ws.send(JSON.stringify({ type: 'input', data: `touch "${name}"\n` }));
    showNotification(`Created ${name}`, 'success');
    
    setTimeout(() => {
      refreshFileExplorer();
      setTimeout(() => openFile(name), 500);
    }, 300);
  };
}

// Create new folder - just mkdir
function showNewFolderDialog() {
  if (!isConnected) {
    showNotification('Not connected', 'warning');
    return;
  }
  
  document.getElementById('modalTitle').textContent = 'New Folder';
  document.getElementById('modalInput').value = '';
  document.getElementById('modalInput').placeholder = 'folder-name';
  document.getElementById('modal').classList.add('active');
  document.getElementById('modalInput').focus();
  
  modalCallback = async (name) => {
    if (!name) return;
    
    if (currentDirContents.has(name.toLowerCase())) {
      showNotification(`"${name}" already exists`, 'error');
      return;
    }
    
    ws.send(JSON.stringify({ type: 'input', data: `mkdir "${name}"\n` }));
    showNotification(`Created folder ${name}`, 'success');
    
    setTimeout(() => refreshFileExplorer(), 300);
  };
}

// Rename - just mv
async function renameItem(oldName) {
  const newName = prompt(`Rename "${oldName}" to:`, oldName);
  if (!newName || newName === oldName) return;
  
  if (currentDirContents.has(newName.toLowerCase())) {
    showNotification(`"${newName}" already exists`, 'error');
    return;
  }
  
  ws.send(JSON.stringify({ type: 'input', data: `mv "${oldName}" "${newName}"\n` }));
  showNotification(`Renamed to ${newName}`, 'success');
  
  // Update open file if renamed
  const oldPath = `${currentPath}/${oldName}`;
  const newPath = `${currentPath}/${newName}`;
  
  if (openFiles.has(oldPath)) {
    const fileData = openFiles.get(oldPath);
    openFiles.delete(oldPath);
    fileData.filepath = newPath;
    fileData.filename = newName;
    openFiles.set(newPath, fileData);
    
    const tab = document.querySelector(`.tab[data-filepath="${oldPath}"]`);
    if (tab) {
      tab.dataset.filepath = newPath;
      tab.querySelector('span').textContent = newName;
    }
    
    if (activeFile === oldPath) {
      activeFile = newPath;
    }
  }
  
  setTimeout(() => refreshFileExplorer(), 300);
}

// Delete - just rm
async function deleteItem(name) {
  if (!confirm(`Delete "${name}"?`)) return;
  
  ws.send(JSON.stringify({ type: 'input', data: `rm -rf "${name}"\n` }));
  showNotification(`Deleted ${name}`, 'success');
  
  const fullPath = `${currentPath}/${name}`;
  if (openFiles.has(fullPath)) {
    closeTab(fullPath);
  }
  
  setTimeout(() => refreshFileExplorer(), 300);
}

// Helper functions
function getFileIcon(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const iconMap = {
    'js': 'file-code', 'jsx': 'file-code', 'ts': 'file-code', 'tsx': 'file-code',
    'html': 'file-code', 'css': 'file-code', 'scss': 'file-code',
    'json': 'file-code', 'xml': 'file-code', 'yaml': 'file-code', 'yml': 'file-code',
    'md': 'file-alt', 'txt': 'file-alt',
    'py': 'file-code', 'java': 'file-code', 'cpp': 'file-code', 'c': 'file-code',
    'go': 'file-code', 'rs': 'file-code', 'php': 'file-code', 'rb': 'file-code',
    'sh': 'file-code', 'bash': 'file-code',
    'jpg': 'file-image', 'jpeg': 'file-image', 'png': 'file-image', 'gif': 'file-image',
    'pdf': 'file-pdf', 'zip': 'file-archive', 'tar': 'file-archive', 'gz': 'file-archive'
  };
  return iconMap[ext] || 'file';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function detectLanguage(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const map = {
    'js': 'javascript', 'jsx': 'javascript',
    'ts': 'typescript', 'tsx': 'typescript',
    'py': 'python', 'java': 'java', 'cpp': 'cpp', 'c': 'c',
    'html': 'html', 'css': 'css', 'scss': 'scss',
    'json': 'json', 'xml': 'xml', 'yaml': 'yaml', 'yml': 'yaml',
    'md': 'markdown', 'txt': 'plaintext',
    'sh': 'shell', 'bash': 'shell',
    'php': 'php', 'rb': 'ruby', 'go': 'go', 'rs': 'rust', 'sql': 'sql'
  };
  return map[ext] || 'plaintext';
}

// Tab management
function addTab(filepath, filename) {
  const tabs = document.getElementById('tabs');
  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.dataset.filepath = filepath;
  tab.innerHTML = `
    <i class="fas fa-${getFileIcon(filename)}"></i>
    <span>${escapeHtml(filename)}</span>
    <i class="fas fa-times tab-close"></i>
  `;
  
  tab.onclick = (e) => {
    if (!e.target.classList.contains('tab-close')) {
      setActiveFile(filepath);
    }
  };
  
  tab.querySelector('.tab-close').onclick = (e) => {
    e.stopPropagation();
    closeTab(filepath);
  };
  
  tabs.appendChild(tab);
}

function setActiveFile(filepath) {
  if (!openFiles.has(filepath)) return;
  
  activeFile = filepath;
  const fileData = openFiles.get(filepath);
  editor.setModel(fileData.model);
  
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filepath === filepath);
  });
  
  document.querySelectorAll('.file-item').forEach(item => {
    item.classList.toggle('active', `${currentPath}/${item.dataset.name}` === filepath);
  });
}

function updateTab(filepath) {
  const fileData = openFiles.get(filepath);
  if (!fileData) return;
  
  const tab = document.querySelector(`.tab[data-filepath="${filepath}"]`);
  if (tab) {
    tab.classList.toggle('modified', fileData.modified);
  }
}

function closeTab(filepath) {
  const fileData = openFiles.get(filepath);
  if (!fileData) return;
  
  if (fileData.modified) {
    if (!confirm(`${fileData.filename} has unsaved changes. Close anyway?`)) {
      return;
    }
  }
  
  fileData.model.dispose();
  openFiles.delete(filepath);
  
  const tab = document.querySelector(`.tab[data-filepath="${filepath}"]`);
  if (tab) tab.remove();
  
  if (activeFile === filepath) {
    const remaining = Array.from(openFiles.keys());
    if (remaining.length > 0) {
      setActiveFile(remaining[0]);
    } else {
      activeFile = null;
      editor.setModel(null);
      document.getElementById('editor').style.display = 'none';
      document.getElementById('welcomeScreen').style.display = 'flex';
    }
  }
}

// Modal functions
function closeModal() {
  document.getElementById('modal').classList.remove('active');
  modalCallback = null;
}

function modalSubmit() {
  const value = document.getElementById('modalInput').value.trim();
  if (value && modalCallback) {
    modalCallback(value);
  }
  closeModal();
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveFile();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
    e.preventDefault();
    if (activeFile) closeTab(activeFile);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    showNewFileDialog();
  }
  if (e.key === 'Escape') {
    closeModal();
  }
});

document.getElementById('modalInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    modalSubmit();
  }
});

// Initialize on page load
window.addEventListener('load', () => {
  initTheme();
  initTerminal();
  initResizers();
  setTimeout(() => {
    showNotification('✨ Simple & Direct - Terminal integrated!', 'success');
  }, 500);
});