import React from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTerminal } from '../../contexts/TerminalContext';
import { detectLanguage } from '../../utils/languageDetector';
import { VscTerminal, VscInfo, VscChevronUp, VscChromeMaximize } from 'react-icons/vsc';
import './StatusBar.css';

const StatusBar = ({ username, onFullPageTerminal }) => {
  const { activeFile, openFiles } = useProject();
  const { theme, toggleTheme } = useTheme();
  const { terminals, activeTerminalId, setActiveTerminalId, getActiveTerminal } = useTerminal();

  const language = activeFile ? detectLanguage(activeFile.path) : null;
  const fileName = activeFile ? activeFile.path.split('/').pop() : null;
  const activeTerminal = getActiveTerminal();

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {activeFile && (
          <>
            <div className="status-item">
              <VscInfo />
              <span>{fileName}</span>
            </div>
            
            {language && (
              <div className="status-item">
                <span>{language.toUpperCase()}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="status-bar-center">
        {terminals.length > 0 && (
          <div className="terminal-indicator">
            <VscTerminal />
            <span>{terminals.length} terminal{terminals.length !== 1 ? 's' : ''}</span>
            {activeTerminal && (
              <span className="terminal-current">· {activeTerminal.title}</span>
            )}
          </div>
        )}
      </div>

      <div className="status-bar-right">
        {terminals.length > 1 && (
          <div className="terminal-switcher">
            <button
              className="status-item clickable"
              title="Switch Terminal"
            >
              <VscChevronUp />
              <select 
                value={activeTerminalId || ''}
                onChange={(e) => setActiveTerminalId(e.target.value)}
                className="terminal-select"
              >
                {terminals.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </button>
          </div>
        )}

        {terminals.length > 0 && onFullPageTerminal && (
          <button
            className="status-item clickable"
            onClick={onFullPageTerminal}
            title="Maximize Terminal"
          >
            <VscChromeMaximize />
          </button>
        )}
        
        <div className="status-item">
          <span>{openFiles.length} file{openFiles.length !== 1 ? 's' : ''}</span>
        </div>
        
        <button 
          className="status-item clickable"
          onClick={toggleTheme}
          title="Toggle Theme"
        >
          <span>{theme === 'dark' ? '🌙' : '☀️'}</span>
        </button>

        <div className="status-item">
          <span>👤 {username}</span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;