import React, { useState } from 'react';
import Sidebar from '../Sidebar/Sidebar';
import EditorArea from '../Editor/EditorArea';
import TerminalPanel from '../Terminal/TerminalPanel';
import StatusBar from '../StatusBar/StatusBar';
import ActivityBar from '../ActivityBar/ActivityBar';
import { useTerminal } from '../../contexts/TerminalContext';
import './IDE.css';

const IDE = ({ onLogout, username }) => {
  const [sidebarView, setSidebarView] = useState('explorer');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [terminalHeight, setTerminalHeight] = useState(250);
  const [isFullPageTerminal, setIsFullPageTerminal] = useState(false);
  
  const { terminals } = useTerminal();

  const handleFullPageTerminal = () => {
    setIsFullPageTerminal(!isFullPageTerminal);
  };

  if (isFullPageTerminal) {
    return (
      <div className="ide">
        <div className="fullpage-terminal">
          <TerminalPanel 
            height="100%"
            isFullPage={true}
            onExitFullPage={() => setIsFullPageTerminal(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="ide">
      <ActivityBar 
        activeView={sidebarView}
        onViewChange={setSidebarView}
        username={username}
        onLogout={onLogout}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
      />
      
      <div className="ide-main">
        {sidebarVisible && (
          <Sidebar 
            view={sidebarView}
            width={sidebarWidth}
            onResize={setSidebarWidth}
          />
        )}
        
        <div className="ide-content">
          <EditorArea />
          
          {/* Always show terminal panel - it will show "Open Terminal" button when empty */}
          <TerminalPanel 
            height={terminalHeight}
            onResize={setTerminalHeight}
            onFullPage={handleFullPageTerminal}
          />
        </div>
      </div>
      
      <StatusBar 
        username={username}
        onFullPageTerminal={handleFullPageTerminal}
      />
    </div>
  );
};

export default IDE;