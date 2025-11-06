import React from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { FileIcon } from '../../utils/fileIcons';
import { VscClose, VscCircleFilled } from 'react-icons/vsc';
import './EditorTabs.css';

const EditorTabs = () => {
  const { openFiles, activeFile, setActiveFile, closeFile } = useProject();

  const handleCloseTab = (e, fileId) => {
    e.stopPropagation();
    closeFile(fileId);
  };

  return (
    <div className="editor-tabs">
      <div className="tabs-container">
        {openFiles.map(file => (
          <div
            key={file._id}
            className={`editor-tab ${activeFile?._id === file._id ? 'active' : ''}`}
            onClick={() => setActiveFile(file)}
          >
            <FileIcon fileName={file.path.split('/').pop()} size={14} />
            <span className="tab-label">{file.path.split('/').pop()}</span>
            
            {file.isDirty ? (
              <VscCircleFilled className="tab-dirty" size={12} />
            ) : (
              <button
                className="tab-close"
                onClick={(e) => handleCloseTab(e, file._id)}
              >
                <VscClose size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EditorTabs;