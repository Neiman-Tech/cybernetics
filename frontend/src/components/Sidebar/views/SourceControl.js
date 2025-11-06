import React, { useState, useEffect } from 'react';
import { useProject } from '../../../contexts/ProjectContext';
import { apiService } from '../../../services/apiService';
import { VscRefresh, VscCheck } from 'react-icons/vsc';
import './SourceControl.css';

const SourceControl = () => {
  const { currentProject } = useProject();
  const [status, setStatus] = useState(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [branch, setBranch] = useState('main');

  useEffect(() => {
    if (currentProject) {
      loadGitStatus();
    }
  }, [currentProject]);

  const loadGitStatus = async () => {
    if (!currentProject) return;
    
    try {
      const data = await apiService.gitStatus(currentProject._id);
      setStatus(data.status);
      setBranch(data.branch || 'main');
    } catch (error) {
      console.error('Failed to load git status:', error);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || !currentProject) return;

    setIsCommitting(true);
    try {
      await apiService.gitCommit(currentProject._id, commitMessage);
      setCommitMessage('');
      await loadGitStatus();
    } catch (error) {
      console.error('Failed to commit:', error);
      alert('Failed to commit changes');
    } finally {
      setIsCommitting(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="source-control">
        <div className="source-control-header">
          <h3>Source Control</h3>
        </div>
        <div className="empty-state">
          <p>No project opened</p>
        </div>
      </div>
    );
  }

  const changedFiles = [
    ...(status?.modified || []),
    ...(status?.created || []),
    ...(status?.deleted || []),
  ];

  return (
    <div className="source-control">
      <div className="source-control-header">
        <h3>Source Control</h3>
        <button 
          onClick={loadGitStatus}
          className="icon-button"
          title="Refresh"
        >
          <VscRefresh />
        </button>
      </div>

      <div className="branch-info">
        <span className="branch-label">Branch:</span>
        <span className="branch-name">{branch}</span>
      </div>

      <div className="commit-section">
        <textarea
          placeholder="Commit message..."
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          className="commit-message-input"
          rows={3}
        />
        <button
          onClick={handleCommit}
          disabled={!commitMessage.trim() || isCommitting || changedFiles.length === 0}
          className="commit-button"
        >
          <VscCheck />
          {isCommitting ? 'Committing...' : 'Commit'}
        </button>
      </div>

      <div className="changes-section">
        <div className="changes-header">
          Changes ({changedFiles.length})
        </div>
        
        {changedFiles.length === 0 ? (
          <div className="no-changes">No changes</div>
        ) : (
          <div className="changes-list">
            {status?.modified?.map((file, index) => (
              <div key={index} className="change-item modified">
                <span className="change-status">M</span>
                <span className="change-file">{file}</span>
              </div>
            ))}
            {status?.created?.map((file, index) => (
              <div key={index} className="change-item created">
                <span className="change-status">A</span>
                <span className="change-file">{file}</span>
              </div>
            ))}
            {status?.deleted?.map((file, index) => (
              <div key={index} className="change-item deleted">
                <span className="change-status">D</span>
                <span className="change-file">{file}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SourceControl;