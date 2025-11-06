import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const ProjectContext = createContext();

const BASE_URL = process.env.REACT_APP_API_URL || '';
const API_URL = BASE_URL.replace(/\/api\/?$/, '');
const API_KEY = process.env.REACT_APP_API_KEY || 'your-secret-api-key';

console.log('🔧 API Configuration:', {
  REACT_APP_API_URL: process.env.REACT_APP_API_URL,
  API_URL: API_URL,
  API_KEY: API_KEY ? '***' : 'not set'
});

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
  
  const isSyncingRef = useRef(false);
  const syncQueuedRef = useRef(false);
  const hasInitialized = useRef(false);
  
  // Load user project on mount or when username changes
  useEffect(() => {
    if (!username) {
      console.log('⏸️ No username provided');
      return;
    }
    
    if (hasInitialized.current) {
      console.log('⏭️ Already initialized, skipping...');
      return;
    }
    
    hasInitialized.current = true;
    console.log('🚀 ProjectContext: Initializing for user:', username);
    loadUserProject();
  }, [username]);

  const loadUserProject = async () => {
    if (isLoading || !username) {
      console.log('⏸️ Already loading or no username');
      return;
    }
    
    setIsLoading(true);
    
    try {
      console.log('📂 Loading project for user:', username);
      
      const url = `${API_URL}/api/projects/${username}`;
      console.log('📡 GET:', url);
      
      const response = await fetch(url, {
        headers: { 'X-API-Key': API_KEY }
      });

      if (response.status === 404) {
        console.warn('⚠️ Project not found (404), creating it...');
        await createUserProject();
        return;
      }

      if (!response.ok) {
        console.error('❌ Failed to load project:', response.status, response.statusText);
        setCurrentProject(null);
        setFiles([]);
        return;
      }

      const data = await response.json();
      const project = data.project;
      console.log('✅ Project loaded:', project.name, '(ID:', project._id + ')');
      
      setCurrentProject(project);
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
      const username = localStorage.getItem('ide_username');
      console.log('🆕 Creating project for user:', username);
      
      const url = `${API_URL}/api/projects`;
      console.log('📡 POST:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({ username })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Create project failed:', response.status, errorText);
        throw new Error(`Failed to create project: ${response.status}`);
      }

      const data = await response.json();
      const project = data.project;
      console.log('✅ Project created:', project.name, '(ID:', project._id + ')');
      
      setCurrentProject(project);
      setFiles([]);
      await loadFilesFromDatabase(username);
    } catch (error) {
      console.error('❌ Failed to create project:', error);
      setCurrentProject(null);
      setFiles([]);
    }
  };

  const loadFilesFromDatabase = async (projectId) => {
    if (!projectId) {
      console.warn('⚠️ No projectId provided to loadFilesFromDatabase');
      return;
    }

    try {
      console.log('📂 Fetching files from database for project:', projectId);
      
      const url = `${API_URL}/api/files?username=${projectId}`;
      console.log('📡 Fetching:', url);
      
      const response = await fetch(url, {
        headers: { 'X-API-Key': API_KEY }
      });

      if (!response.ok) {
        console.warn('⚠️ Failed to fetch files:', response.status, response.statusText);
        setFiles([]);
        return;
      }

      const data = await response.json();
      const fileCount = data.files?.length || 0;
      console.log('✅ Files loaded from database:', fileCount);
      
      if (fileCount > 0) {
        console.log('📋 File list:');
        data.files.forEach((f, i) => {
          console.log(`  ${i + 1}. [${f.type}] ${f.path} (${f.size || 0} bytes)`);
        });
      } else {
        console.log('📭 No files in database for this project');
      }
      
      setFiles(data.files || []);
    } catch (error) {
      console.error('❌ Failed to load files from database:', error);
      setFiles([]);
    }
  };

  const syncFilesystemToDatabase = useCallback(async () => {
    if (!currentProject?._id) {
      console.log('⏸️ No project to sync');
      return;
    }

    if (isSyncingRef.current) {
      console.log('⏳ Sync in progress, queuing...');
      syncQueuedRef.current = true;
      return;
    }
    
    isSyncingRef.current = true;
    
    try {
      console.log('🔄 Syncing filesystem → database for project:', currentProject._id);
      
      const url = `${API_URL}/api/projects/${currentProject._id}/sync`;
      console.log('📡 POST:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        }
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Sync complete:', result.message);
      
      await loadFilesFromDatabase(currentProject._id);
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
    } finally {
      isSyncingRef.current = false;
      
      if (syncQueuedRef.current) {
        syncQueuedRef.current = false;
        console.log('▶️ Running queued sync...');
        setTimeout(() => syncFilesystemToDatabase(), 500);
      }
    }
  }, [currentProject]);

  const refreshFiles = useCallback(async (force = false) => {
    if (!currentProject?._id) {
      console.log('⏸️ No project to refresh');
      return;
    }

    console.log('🔄 Refreshing files from database...');
    await loadFilesFromDatabase(currentProject._id);
  }, [currentProject]);

  // Auto-sync: Always enabled to detect terminal changes
  useEffect(() => {
    if (!currentProject?._id || !username) {
      return;
    }

    console.log('🔄 Auto-sync started - checking for changes every 3 seconds');
    
    const interval = setInterval(async () => {
      try {
        // Sync filesystem to database first
        await syncFilesystemToDatabase();
        // Then reload files to show in explorer
        await loadFilesFromDatabase(currentProject._id);
      } catch (error) {
        console.error('❌ Auto-sync error:', error);
      }
    }, 3000); // Check every 3 seconds

    // Initial load
    syncFilesystemToDatabase().then(() => {
      loadFilesFromDatabase(currentProject._id);
    });

    return () => {
      console.log('⏹️ Auto-sync stopped');
      clearInterval(interval);
    };
  }, [currentProject?._id, username]);

  const createFile = useCallback(async (path, content = '', type = 'file') => {
    if (!currentProject?._id || !username) {
      console.error('❌ No project selected or no username');
      return;
    }
    
    try {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      
      console.log('📄 Creating file via API:', {
        username,
        projectId: currentProject._id,
        path: normalizedPath,
        type
      });
      
      const url = `${API_URL}/api/files`;
      console.log('📡 POST:', url);
       
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          username: username,
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
      
      await loadFilesFromDatabase(currentProject._id);
      
      return data.file;
    } catch (error) {
      console.error('❌ Failed to create file:', error);
      throw error;
    }
  }, [currentProject, username]);

  const updateFile = useCallback(async (fileId, content) => {
    if (!username) {
      console.error('❌ No username');
      return;
    }
    
    try {
      console.log('💾 Updating file:', fileId);
      
      const url = `${API_URL}/api/files/${fileId}`;
      console.log('📡 PUT:', url);
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({ username, content })
      });

      if (!response.ok) {
        throw new Error(`Failed to update file: ${response.status}`);
      }

      console.log('✅ File updated');
      
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
    if (!username) {
      console.error('❌ No username');
      return;
    }
    
    try {
      console.log('🗑️ Deleting file:', fileId);
      
      const url = `${API_URL}/api/files/${fileId}?username=${username}`;
      console.log('📡 DELETE:', url);
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'X-API-Key': API_KEY }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.status}`);
      }

      console.log('✅ File deleted');
      
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
    console.log('📖 Opening file:', file.path);
    setOpenFiles(prev => {
      const exists = prev.find(f => f._id === file._id);
      if (exists) return prev;
      return [...prev, { ...file, isDirty: false }];
    });
    setActiveFile(file);
  }, []);

  const closeFile = useCallback((fileId) => {
    console.log('📕 Closing file:', fileId);
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
      createFile,
      updateFile,
      deleteFile,
      openFile,
      closeFile,
      setActiveFile,
      updateFileContent,
      refreshFiles,
      syncFilesystemToDatabase,
      username,
    }}>
      {children}
    </ProjectContext.Provider>
  );
};