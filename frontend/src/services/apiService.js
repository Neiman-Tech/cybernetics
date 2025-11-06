// Complete apiService.js with proper workspace path handling

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL;
const API_KEY = process.env.REACT_APP_API_KEY || 'your-secret-api-key';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  }
});

export const apiService = {
  async getHealth() {
    const { data } = await api.get('/health');
    return data;
  },

  async createProject(name, description, userId = 'default-user') {
    const { data } = await api.post('/projects', {
      userId,
      name,
      description,
      // Ensure workspace path is set
      workspacePath: `/app/workspace`
    });
    return data.project;
  },

  async getProjects(userId = 'default-user') {
    const { data } = await api.get('/projects', {
      params: { userId }
    });
    return data.projects;
  },

  async getProject(projectId) {
    const { data } = await api.get(`/projects/${projectId}`);
    return data.project;
  },

  async loadProject(projectId) {
    // Load project files from database to filesystem
    const { data } = await api.post(`/projects/${projectId}/load`);
    return data;
  },

  async syncProject(projectId) {
    const { data } = await api.post(`/projects/${projectId}/sync`);
    return data;
  },

  async scanDirectory(projectId) {
    // Scan terminal working directory and return files
    try {
      const { data } = await api.post(`/projects/${projectId}/scan`);
      return data.files || [];
    } catch (error) {
      console.error('Error scanning directory:', error);
      return [];
    }
  },

  async createFile(projectId, path, content = '', type = 'file') {
    // Remove leading slash and ensure path is relative
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    
    const { data } = await api.post('/files', {
      projectId,
      path: normalizedPath,
      content,
      type,
      // Backend will prepend /app/workspace/{projectId}/
      useWorkspacePath: true
    });
    return data.file;
  },
   async getFiles(username) {
  const { data } = await api.get('/files', {
    params: { username }  // Changed from projectId
  });
  return data.files;
},

  async updateFile(fileId, content) {
    const { data } = await api.put(`/files/${fileId}`, {
      content
    });
    return data;
  },

  async deleteFile(fileId) {
    const { data } = await api.delete(`/files/${fileId}`);
    return data;
  },

  async createSession(username, metadata = {}) {
  const { data } = await api.post('/sessions', {
    username,    // Backend expects 'username', not 'userId' or 'projectId'
    metadata
  });
  return data;

  },

  async getSession(sessionId) {
    const { data } = await api.get(`/sessions/${sessionId}`);
    return data;
  },

  async deleteSession(sessionId) {
    const { data } = await api.delete(`/sessions/${sessionId}`);
    return data;
  },

  async gitCommit(projectId, message) {
    const { data } = await api.post(`/git/${projectId}/commit`, {
      message
    });
    return data;
  },

  async gitStatus(projectId) {
    const { data } = await api.get(`/git/${projectId}/status`);
    return data;
  },

  async gitCreateBranch(projectId, name) {
    const { data } = await api.post(`/git/${projectId}/branch`, {
      name
    });
    return data;
  }
};

export default apiService;