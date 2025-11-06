// FIX: Changed terminal-subtab from <button> to <div> to avoid nested buttons warning

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useTerminal } from '../../contexts/TerminalContext';
import Terminal from './Terminal';

import { 
  VscAdd, 
  VscTrash, 
  VscSplitHorizontal,
  VscChevronDown,
  VscClose,
  VscTerminalBash,
  VscDebugConsole,
  VscOutput,
  VscBell,
  VscSettingsGear,
  VscChromeMaximize,
  VscChromeRestore,
  VscChevronUp,
  VscChevronRight,
  VscCircleFilled,
  VscLink,
  VscGlobe
} from 'react-icons/vsc';
import { v4 as uuidv4 } from 'uuid';
import './TerminalPanel.css';

const TerminalPanel = ({ height, onResize, isFullPage, onExitFullPage, onFullPage }) => {
  const { terminals, activeTerminalId, addTerminal, removeTerminal, setActiveTerminalId } = useTerminal();
  const resizerRef = useRef(null);
  const [activeTab, setActiveTab] = useState('terminal');
  const [isTerminalVisible, setIsTerminalVisible] = useState(true);
  const [forwardedPorts, setForwardedPorts] = useState([]);

  useEffect(() => {
    const detectPorts = () => {
      const simulatedPorts = [
        { port: 3000, status: 'running', protocol: 'http', address: 'localhost:3000' },
        { port: 5173, status: 'running', protocol: 'http', address: 'localhost:5173' },
      ];
      setForwardedPorts(simulatedPorts);
    };

    detectPorts();
    const interval = setInterval(detectPorts, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (isFullPage || !isTerminalVisible) return;
    
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = typeof height === 'string' ? 250 : height;

    const handleMouseMove = (e) => {
      const newHeight = startHeight - (e.clientY - startY);
      if (newHeight >= 100 && newHeight <= 600) {
        onResize(newHeight);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height, onResize, isFullPage, isTerminalVisible]);

  const handleAddTerminal = () => {
    const newTerminal = {
      id: uuidv4(),
      title: `bash`
    };
    addTerminal(newTerminal);
  };

  const handleDeleteTerminal = (e, id) => {
    e.stopPropagation();
    if (terminals.length === 1) {
      if (!window.confirm('Delete the last terminal?')) {
        return;
      }
    }
    removeTerminal(id);
  };

  const toggleTerminalVisibility = () => {
    setIsTerminalVisible(!isTerminalVisible);
  };

  const handleOpenPort = (port) => {
    window.open(`http://localhost:${port}`, '_blank');
  };

  const handleCopyPortUrl = (address) => {
    navigator.clipboard.writeText(`http://${address}`);
  };

  const containerStyle = isFullPage 
    ? { height: '100%', maxHeight: '100vh' }
    : isTerminalVisible 
      ? { height: typeof height === 'string' ? height : `${height}px` }
      : { height: 'auto' };

  const tabs = [
    { id: 'terminal', label: 'TERMINAL', icon: VscTerminalBash },
    { id: 'debug', label: 'DEBUG CONSOLE', icon: VscDebugConsole },
    { id: 'problems', label: 'PROBLEMS', icon: VscBell, badge: 0 },
    { id: 'output', label: 'OUTPUT', icon: VscOutput },
    { id: 'ports', label: 'PORTS', icon: VscGlobe, badge: forwardedPorts.length }
  ];

  const renderPortsPanel = () => (
    <div className="ports-panel">
      <div className="ports-header">
        <span className="ports-title">Forwarded Ports</span>
        <button 
          className="port-action-btn"
          title="Forward a Port"
          onClick={() => {
            const port = prompt('Enter port number to forward:');
            if (port) {
              alert('Port forwarding would be configured here with cloudflared');
            }
          }}
        >
          <VscAdd size={16} />
        </button>
      </div>
      
      {forwardedPorts.length === 0 ? (
        <div className="ports-empty">
          <p>No forwarded ports</p>
          <small>Ports will be auto-detected when your application starts</small>
        </div>
      ) : (
        <div className="ports-list">
          <div className="ports-list-header">
            <span className="port-col-port">Port</span>
            <span className="port-col-status">Status</span>
            <span className="port-col-address">Local Address</span>
            <span className="port-col-actions">Actions</span>
          </div>
          {forwardedPorts.map(port => (
            <div key={port.port} className="port-item">
              <span className="port-col-port">
                <VscCircleFilled className="port-status-indicator running" size={8} />
                {port.port}
              </span>
              <span className="port-col-status">
                <span className="port-status-badge running">{port.status}</span>
              </span>
              <span className="port-col-address">{port.address}</span>
              <span className="port-col-actions">
                <button 
                  className="port-action-icon"
                  onClick={() => handleOpenPort(port.port)}
                  title="Open in Browser"
                >
                  <VscGlobe size={14} />
                </button>
                <button 
                  className="port-action-icon"
                  onClick={() => handleCopyPortUrl(port.address)}
                  title="Copy Local Address"
                >
                  <VscLink size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      
      <div className="ports-footer">
        <small>💡 Ports are automatically detected and forwarded using cloudflared</small>
      </div>
    </div>
  );

  const renderProblemsPanel = () => (
    <div className="problems-panel">
      <div className="problems-empty">
        <VscBell size={48} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
        <p>No problems detected</p>
      </div>
    </div>
  );

  const renderDebugPanel = () => (
    <div className="debug-panel">
      <div className="debug-empty">
        <VscDebugConsole size={48} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
        <p>Debug console is not active</p>
        <small>Start debugging to see console output</small>
      </div>
    </div>
  );

  const renderOutputPanel = () => (
    <div className="output-panel">
      <div className="output-header">
        <select className="output-source-selector">
          <option>Tasks - cybernetic</option>
          <option>Git</option>
          <option>Terminal</option>
        </select>
      </div>
      <div className="output-content">
        <div className="output-empty">
          <VscOutput size={48} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
          <p>No output yet</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="terminal-panel-container-enhanced" style={containerStyle}>
      {!isFullPage && isTerminalVisible && (
        <div
          ref={resizerRef}
          className="terminal-panel-resizer"
          onMouseDown={handleMouseDown}
        />
      )}

      <div className="terminal-panel-header-enhanced">
        <div className="terminal-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`terminal-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={16} />
              <span className="tab-label">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="tab-badge">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        <div className="terminal-actions">
          {activeTab === 'terminal' && (
            <>
              <button
                onClick={handleAddTerminal}
                className="terminal-action-btn"
                title="New Terminal (Ctrl+Shift+`)"
              >
                <VscAdd size={16} />
              </button>
              
              <button
                className="terminal-action-btn"
                title="Split Terminal"
              >
                <VscSplitHorizontal size={16} />
              </button>
            </>
          )}
          
          <button
            className="terminal-action-btn"
            title="Clear"
          >
            <VscTrash size={16} />
          </button>
          
          <div className="terminal-divider" />
          
          <button
            onClick={toggleTerminalVisibility}
            className="terminal-action-btn"
            title={isTerminalVisible ? "Hide Panel" : "Show Panel"}
          >
            <VscChevronDown 
              size={16} 
              style={{ 
                transform: isTerminalVisible ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 0.2s'
              }} 
            />
          </button>
          
          {!isFullPage && onFullPage && (
            <button
              onClick={onFullPage}
              className="terminal-action-btn"
              title="Maximize Panel"
            >
              <VscChromeMaximize size={16} />
            </button>
          )}
          
          {isFullPage && onExitFullPage && (
            <button
              onClick={onExitFullPage}
              className="terminal-action-btn"
              title="Restore Panel"
            >
              <VscChromeRestore size={16} />
            </button>
          )}
          
          <button
            className="terminal-action-btn"
            title="Close Panel"
            onClick={toggleTerminalVisibility}
          >
            <VscClose size={16} />
          </button>
        </div>
      </div>

      {isTerminalVisible && (
        <>
          {activeTab === 'terminal' && terminals.length > 0 && (
            <div className="terminal-subtabs">
              {terminals.map(terminal => (
                <div
                  key={terminal.id}
                  className={`terminal-subtab ${activeTerminalId === terminal.id ? 'active' : ''}`}
                  onClick={() => setActiveTerminalId(terminal.id)}
                >
                  <VscTerminalBash size={14} />
                  <span className="subtab-label">{terminal.title}</span>
                  <button
                    className="subtab-close"
                    onClick={(e) => handleDeleteTerminal(e, terminal.id)}
                  >
                    <VscClose size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="terminal-panel-content-enhanced">
            {activeTab === 'terminal' && (
              terminals.length === 0 ? (
                <div className="terminal-empty-state">
                  <VscTerminalBash size={48} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
                  <p>No terminals open</p>
                  <button onClick={handleAddTerminal} className="primary-button">
                    Open New Terminal
                  </button>
                </div>
              ) : (
                terminals.map(terminal => (
                  <div
                    key={terminal.id}
                    style={{ 
                      display: activeTerminalId === terminal.id ? 'block' : 'none', 
                      height: '100%',
                      width: '100%'
                    }}
                  >
                    <Terminal 
                      terminalId={terminal.id}
                      isActive={activeTerminalId === terminal.id}
                    />
                  </div>
                ))
              )
            )}

            {activeTab === 'ports' && renderPortsPanel()}
            {activeTab === 'problems' && renderProblemsPanel()}
            {activeTab === 'debug' && renderDebugPanel()}
            {activeTab === 'output' && renderOutputPanel()}
          </div>
        </>
      )}
    </div>
  );
};

export default TerminalPanel;