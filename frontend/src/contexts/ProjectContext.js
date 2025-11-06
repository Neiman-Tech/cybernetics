import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const ProjectContext = createContext();

const BASE_URL = process.env.REACT_APP_API_URL || '';
const API_URL = BASE_URL.replace(/\/api\/?$/, '');
const API_KEY = process.env.REACT_APP_API_KEY || 'your-secret-api-key';

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within ProjectProvider');
  }
  return context;
};

export const ProjectProvider = ({ children, username }) => {
  const [currentProject, setCurrentProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  
  const hasInitialized = useRef(false);
  const autoSyncIntervalRef = useRef(null);
  
  // Load user project on mount
  useEffect(() => {
    if (!username || hasInitialized.current) return;
    hasInitialized.current = true;
    console.log('🚀 ProjectContext: Initializing for user:', username);
    loadUserProject();
  }, [username]);

  const loadUserProject = async () => {
    if (isLoading || !username) return;
    setIsLoading(true);
    
    try {
      console.log('📂 Loading project for user:', username);
      const url = `${API_URL}/api/projects/${username}`;
      const response = await fetch(url, {
        headers: { 'X-API-Key': API_KEY }
      });

      if (response.status === 404) {
        console.warn('⚠️ Project not found, creating...');
        await createUserProject();
        return;
      }

      if (!response.ok) {
        console.error('❌ Failed to load project');
        setCurrentProject(null);
        setFiles([]);
        return;
      }

      const data = await response.json();
      console.log('✅ Project loaded:', data.project.name);
      setCurrentProject(data.project);
      
      // Load files immediately after project loads
      await loadFilesFromDatabase(username);
    } catch (error) {
      console.error('❌ Failed to load project:', error);
      setCurrentProject(null);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const createUserProject = async () => {
    try {
      console.log('🆕 Creating project for user:', username);
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({ username })
      });

      if (!response.ok) throw new Error('Failed to create project');

      const data = await response.json();
      console.log('✅ Project created:', data.project.name);
      setCurrentProject(data.project);
      await loadFilesFromDatabase(username);
    } catch (error) {
      console.error('❌ Failed to create project:', error);
    }
  };

  // IMPROVED: Load files with progressive updates
  const loadFilesFromDatabase = async (projectId) => {
    if (!projectId) return;

    try {
      const url = `${API_URL}/api/files?username=${projectId}`;
      const response = await fetch(url, {
        headers: { 'X-API-Key': API_KEY }
      });

      if (!response.ok) {
        console.warn('⚠️ Failed to fetch files');
        return;
      }

      const data = await response.json();
      const fileCount = data.files?.length || 0;
      console.log('✅ Files loaded:', fileCount);
      
      // Update files immediately - don't wait
      setFiles(data.files || []);
      
      return data.files;
    } catch (error) {
      console.error('❌ Failed to load files:', error);
      return [];
    }
  };

  // NEW: Check sync status
  const checkSyncStatus = useCallback(async () => {
    if (!currentProject?._id) return null;
    
    try {
      const url = `${API_URL}/api/projects/${currentProject._id}/sync-status`;
      const response = await fetch(url, {
        headers: { 'X-API-Key': API_KEY }
      });
      
      if (response.ok) {
        const status = await response.json();
        setIsSyncing(status.syncing || status.queued);
        return status;
      }
    } catch (error) {
      console.error('❌ Sync status check failed:', error);
    }
    return null;
  }, [currentProject]);

  // IMPROVED: Refresh files with immediate update
  const refreshFiles = useCallback(async (force = false) => {
    if (!currentProject?._id) return;
    
    console.log('🔄 Refreshing files...');
    const newFiles = await loadFilesFromDatabase(currentProject._id);
    
    // Update sync status
    await checkSyncStatus();
    
    return newFiles;
  }, [currentProject, checkSyncStatus]);

  // IMPROVED: Auto-sync with progressive updates
  useEffect(() => {
    if (!currentProject?._id || !username) return;

    console.log('🔄 Auto-sync started (2s interval)');
    
    // Clear any existing interval
    if (autoSyncIntervalRef.current) {
      clearInterval(autoSyncIntervalRef.current);
    }

    // Initial load
    refreshFiles();

    // Poll for updates every 2 seconds
    autoSyncIntervalRef.current = setInterval(async () => {
      await refreshFiles();
    }, 2000); // Faster polling for better UX

    return () => {
      console.log('⏹️ Auto-sync stopped');
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
      }
    };
  }, [currentProject?._id, username, refreshFiles]);

  const createFile = useCallback(async (path, content = '', type = 'file') => {
    if (!currentProject?._id || !username) return;
    
    try {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      console.log('📄 Creating file:', normalizedPath);
      
      const response = await fetch(`${API_URL}/api/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          username,
          path: normalizedPath,
          content,
          type
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create file');
      }

      const data = await response.json();
      console.log('✅ File created:', data.file.path);
      
      // Optimistic update
      setFiles(prev => [...prev, data.file]);
      
      return data.file;
    } catch (error) {
      console.error('❌ Failed to create file:', error);
      throw error;
    }
  }, [currentProject, username]);

  const updateFile = useCallback(async (fileId, content) => {
    if (!username) return;
    
    try {
      console.log('💾 Updating file:', fileId);
      
      const response = await fetch(`${API_URL}/api/files/${fileId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({ username, content })
      });

      if (!response.ok) throw new Error('Failed to update file');

      console.log('✅ File updated');
      
      // Update local state
      setFiles(prev => prev.map(f => 
        f._id === fileId ? { ...f, content, updatedAt: new Date() } : f
      ));
      
      setOpenFiles(prev => prev.map(f =>
        f._id === fileId ? { ...f, content, isDirty: false } : f
      ));
      
      if (activeFile?._id === fileId) {
        setActiveFile(prev => ({ ...prev, content, isDirty: false }));
      }
    } catch (error) {
      console.error('❌ Failed to update file:', error);
      throw error;
    }
  }, [activeFile, username]);

  const deleteFile = useCallback(async (fileId) => {
    if (!username) return;
    
    try {
      console.log('🗑️ Deleting file:', fileId);
      
      const response = await fetch(`${API_URL}/api/files/${fileId}?username=${username}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': API_KEY }
      });

      if (!response.ok) throw new Error('Failed to delete file');

      console.log('✅ File deleted');
      
      // Optimistic update
      setFiles(prev => prev.filter(f => f._id !== fileId));
      setOpenFiles(prev => prev.filter(f => f._id !== fileId));
      
      if (activeFile?._id === fileId) {
        setActiveFile(openFiles[0] || null);
      }
    } catch (error) {
      console.error('❌ Failed to delete file:', error);
      throw error;
    }
  }, [activeFile, openFiles, username]);

  const openFile = useCallback((file) => {
    setOpenFiles(prev => {
      const exists = prev.find(f => f._id === file._id);
      if (exists) return prev;
      return [...prev, { ...file, isDirty: false }];
    });
    setActiveFile(file);
  }, []);

  const closeFile = useCallback((fileId) => {
    setOpenFiles(prev => {
      const filtered = prev.filter(f => f._id !== fileId);
      if (activeFile?._id === fileId) {
        setActiveFile(filtered[filtered.length - 1] || null);
      }
      return filtered;
    });
  }, [activeFile]);

  const updateFileContent = useCallback((fileId, content) => {
    setOpenFiles(prev => prev.map(f =>
      f._id === fileId ? { ...f, content, isDirty: true } : f
    ));
    
    if (activeFile?._id === fileId) {
      setActiveFile(prev => ({ ...prev, content, isDirty: true }));
    }
  }, [activeFile]);

  return (
    <ProjectContext.Provider value={{
      currentProject,
      files,
      setFiles,
      openFiles,
      activeFile,
      isLoading,
      isSyncing,
      syncProgress,
      createFile,
      updateFile,
      deleteFile,
      openFile,
      closeFile,
      setActiveFile,
      updateFileContent,
      refreshFiles,
      checkSyncStatus,
      username,
    }}>
      {children}
    </ProjectContext.Provider>
  );
};