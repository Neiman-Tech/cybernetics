import React from 'react';
import { useProject } from '../../contexts/ProjectContext';
import EditorTabs from './EditorTabs';
import CodeEditor from './CodeEditor';
import './EditorArea.css';

const EditorArea = () => {
  const { openFiles, activeFile } = useProject();

  return (
    <div className="editor-area">
      {openFiles.length > 0 ? (
        <>
          <EditorTabs />
          {activeFile && <CodeEditor file={activeFile} />}
        </>
      ) : (
        <div className="editor-welcome">
          <div className="welcome-content">
            <h1>Welcome to Web IDE</h1>
            <p>Open a file from the explorer to start editing</p>
            <div className="welcome-shortcuts">
              <div className="shortcut">
                <kbd>Ctrl</kbd> + <kbd>S</kbd> - Save file
              </div>
              <div className="shortcut">
                <kbd>Ctrl</kbd> + <kbd>`</kbd> - Toggle terminal
              </div>
              <div className="shortcut">
                <kbd>Ctrl</kbd> + <kbd>P</kbd> - Quick open
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorArea;