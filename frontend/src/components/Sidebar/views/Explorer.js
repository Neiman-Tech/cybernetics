import React, { useState, useEffect, useCallback } from 'react';
import { useProject } from '../../../contexts/ProjectContext';
import FileTree from '../../FileTree/FileTree';
import { 
  VscNewFile, 
  VscNewFolder, 
  VscRefresh, 
  VscSync, 
  VscTerminal, 
  VscTrash, 
  VscWarning,
  VscLoading 
} from 'react-icons/vsc';
import './Explorer.css';

const BASE_URL = process.env.REACT_APP_API_URL || '';
const API_URL = BASE_URL.replace(/\/api\/?$/, '');
const API_KEY = process.env.REACT_APP_API_KEY || 'your-secret-api-key';

const Explorer = () => {
  const { 
    currentProject, 
    files, 
    setFiles,
    createProject, 
    isLoading,
    isSyncing,
    refreshFiles,
    checkSyncStatus,
  } = useProject();
  
  const [projectName, setProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(!currentProject);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const getUsername = useCallback(() => {
    const storedUsername = localStorage.getItem('ide_username');
    if (storedUsername) return storedUsername;
    if (currentProject?.userId) return currentProject.userId;
    if (currentProject?._id) return currentProject._id;
    return null;
  }, [currentProject]);

  useEffect(() => {
    setShowNewProject(!currentProject);
    if (currentProject?._id) {
      loadFilesFromDatabase();
    }
  }, [currentProject?._id]);

  // Monitor sync status
  useEffect(() => {
    if (!currentProject?._id) return;

    const checkInterval = setInterval(async () => {
      const status = await checkSyncStatus();
      if (status && !status.syncing && !status.queued) {
        setIsManualSyncing(false);
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [currentProject, checkSyncStatus]);

  const loadFilesFromDatabase = useCallback(async () => {
    const username = getUsername();
    if (!currentProject?._id || !username) return;

    try {
      setIsRefreshing(true);
      const newFiles = await refreshFiles(true);
      setLastSyncTime(new Date());
    } catch (error) {
      console.error('❌ Failed to load files:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [currentProject?._id, getUsername, refreshFiles]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    try {
      await createProject(projectName, 'New project');
      setProjectName('');
      setShowNewProject(false);
    } catch (error) {
      console.error('❌ Failed to create project:', error);
      alert('Failed to create project: ' + error.message);
    }
  };

  const handleNewFile = async () => {
    const fileName = prompt('Enter file name (e.g., src/app.js):');
    if (!fileName?.trim()) return;

    const username = getUsername();
    if (!currentProject?._id || !username) {
      alert('No project selected or user not authenticated');
      return;
    }

    try {
      const cleanPath = fileName.trim().replace(/^\/+/, '');
      const response = await fetch(`${API_URL}/api/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          username,
          path: cleanPath,
          content: '',
          type: 'file'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create file');
      }

      const result = await response.json();
      setFiles(prevFiles => [...prevFiles, result.file]);
      console.log('✅ File created:', result.file.path);
    } catch (error) {
      console.error('❌ Failed to create file:', error);
      alert('Failed to create file: ' + error.message);
    }
  };

  const handleNewFolder = async () => {
    const folderName = prompt('Enter folder name (e.g., components):');
    if (!folderName?.trim()) return;

    const username = getUsername();
    if (!currentProject?._id || !username) {
      alert('No project selected or user not authenticated');
      return;
    }

    try {
      const cleanPath = folderName.trim().replace(/^\/+/, '');
      const response = await fetch(`${API_URL}/api/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          username,
          path: cleanPath,
          content: '',
          type: 'folder'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create folder');
      }

      const result = await response.json();
      setFiles(prevFiles => [...prevFiles, result.file]);
      console.log('✅ Folder created:', result.file.path);
    } catch (error) {
      console.error('❌ Failed to create folder:', error);
      alert('Failed to create folder: ' + error.message);
    }
  };

  const handleSyncFromTerminal = async () => {
    const username = getUsername();
    if (!currentProject?._id || !username) {
      alert('No project selected or user not authenticated');
      return;
    }

    setIsManualSyncing(true);
    try {
      console.log('🔄 Triggering sync...');

      const response = await fetch(`${API_URL}/api/projects/${username}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync project');
      }

      console.log('✅ Sync queued');
      
      // Keep refreshing files while syncing
      const refreshInterval = setInterval(async () => {
        await refreshFiles();
        const status = await checkSyncStatus();
        if (!status?.syncing && !status?.queued) {
          clearInterval(refreshInterval);
          setIsManualSyncing(false);
          setLastSyncTime(new Date());
        }
      }, 500); // Refresh every 500ms during sync

    } catch (error) {
      console.error('❌ Sync failed:', error);
      alert('Failed to sync project: ' + error.message);
      setIsManualSyncing(false);
    }
  };

  const handleLoadFromDatabase = async () => {
    const username = getUsername();
    if (!currentProject?._id || !username) {
      alert('No project selected or user not authenticated');
      return;
    }

    setIsRefreshing(true);
    try {
      console.log('⬇️ Loading project from database...');

      const response = await fetch(`${API_URL}/api/projects/${username}/load`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load project');
      }

      const result = await response.json();
      console.log('✅ Project loaded:', result.filesLoaded, 'files');

      await refreshFiles();
      setLastSyncTime(new Date());
      alert(`✅ Loaded ${result.filesLoaded} files successfully!`);
    } catch (error) {
      console.error('❌ Load failed:', error);
      alert('Failed to load project: ' + error.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCompleteReset = async () => {
    setShowResetModal(false);
    const username = getUsername();
    
    if (!currentProject?._id || !username) {
      alert('No project to reset');
      return;
    }

    const confirmation = prompt('Type DELETE to confirm:');
    if (confirmation !== 'DELETE') {
      alert('Reset cancelled');
      return;
    }

    try {
      const filesResponse = await fetch(
        `${API_URL}/api/files?username=${username}`,
        { headers: { 'X-API-Key': API_KEY } }
      );
      
      if (filesResponse.ok) {
        const { files: serverFiles } = await filesResponse.json();
        await Promise.all(
          serverFiles.map(file =>
            fetch(`${API_URL}/api/files/${file._id}?username=${username}`, {
              method: 'DELETE',
              headers: { 'X-API-Key': API_KEY }
            })
          )
        );
      }
      
      setFiles([]);
      alert('✅ Reset complete!');
    } catch (error) {
      console.error('❌ Reset failed:', error);
      alert('⚠️ Reset failed: ' + error.message);
    }
  };

  const ResetModal = () => (
    <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <VscWarning className="warning-icon" />
          <h3>Complete Reset</h3>
        </div>
        <div className="modal-body">
          <p><strong>⚠️ WARNING: This action cannot be undone!</strong></p>
          <p>This will permanently delete ALL files.</p>
        </div>
        <div className="modal-footer">
          <button 
            className="modal-button secondary"
            onClick={() => setShowResetModal(false)}
          >
            Cancel
          </button>
          <button 
            className="modal-button danger"
            onClick={handleCompleteReset}
          >
            Yes, Delete Everything
          </button>
        </div>
      </div>
    </div>
  );

  if (showNewProject) {
    return (
      <div className="explorer">
        <div className="explorer-header">
          <h3>Get Started</h3>
        </div>
        <div className="new-project-form">
          <form onSubmit={handleCreateProject}>
            <input
              type="text"
              placeholder="Project name..."
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="project-name-input"
              autoFocus
            />
            <button type="submit" disabled={isLoading || !projectName.trim()}>
              {isLoading ? 'Creating...' : 'Create Project'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="explorer">
      <div className="explorer-header">
        <h3>{currentProject?.name || 'Explorer'}</h3>
        <div className="explorer-actions">
          <button 
            onClick={handleNewFile} 
            title="New File"
            className="icon-button"
          >
            <VscNewFile />
          </button>
          <button 
            onClick={handleNewFolder} 
            title="New Folder"
            className="icon-button"
          >
            <VscNewFolder />
          </button>
          <button 
            onClick={handleSyncFromTerminal}
            title={isManualSyncing || isSyncing ? "Syncing..." : "Sync Terminal → Database"}
            className={`icon-button ${isManualSyncing || isSyncing ? 'syncing' : ''}`}
            disabled={isManualSyncing || isSyncing}
          >
            {isManualSyncing || isSyncing ? <VscLoading className="spin" /> : <VscTerminal />}
          </button>
          <button 
            onClick={handleLoadFromDatabase}
            title="Load Database → Filesystem"
            className="icon-button"
            disabled={isRefreshing}
          >
            <VscSync className={isRefreshing ? 'spin' : ''} />
          </button>
          <button 
            onClick={loadFilesFromDatabase}
            title="Refresh File List"
            className="icon-button"
            disabled={isRefreshing}
          >
            <VscRefresh className={isRefreshing ? 'spin' : ''} />
          </button>
          <button
            onClick={() => setShowResetModal(true)}
            title="Complete Reset"
            className="icon-button danger"
          >
            <VscTrash />
          </button>
        </div>
      </div>
      
      <div className="explorer-content">
        {isRefreshing && files.length === 0 ? (
          <div className="loading-state">
            <VscLoading className="spin" />
            <p>Loading files...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="empty-state">
            <p>No files yet</p>
            <button onClick={handleNewFile} className="primary-button">
              Create your first file
            </button>
            <button onClick={handleSyncFromTerminal} className="secondary-button">
              <VscTerminal /> Sync from Terminal
            </button>
          </div>
        ) : (
          <>
            <FileTree files={files} />
            {(isManualSyncing || isSyncing) && (
              <div className="sync-indicator">
                <VscLoading className="spin" />
                <span>Syncing files...</span>
              </div>
            )}
          </>
        )}
      </div>
      
      <div className="explorer-footer">
        <div className="sync-status">
          {isSyncing || isManualSyncing ? (
            <>
              <VscLoading className="sync-icon spin" />
              <span>Syncing...</span>
            </>
          ) : (
            <>
              <VscSync className="sync-icon" />
              <span>Auto-sync active</span>
            </>
          )}
        </div>
        <div className="file-count">
          {files.length} {files.length === 1 ? 'file' : 'files'}
          {lastSyncTime && (
            <span className="last-sync">
              · Last synced {Math.round((Date.now() - lastSyncTime) / 1000)}s ago
            </span>
          )}
        </div>
      </div>
      
      {showResetModal && <ResetModal />}
    </div>
  );
};

export default Explorer;