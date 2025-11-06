import React from 'react';
import { 
  VscFiles, 
  VscSearch, 
  VscSourceControl, 
  VscDebugAlt, 
  VscExtensions,
  VscSettingsGear,
  VscSignOut,
  VscMenu
} from 'react-icons/vsc';
import './ActivityBar.css';

const ActivityBar = ({ 
  activeView, 
  onViewChange, 
  username, 
  onLogout,
  sidebarVisible,
  onToggleSidebar
}) => {
  const items = [
    { id: 'explorer', icon: VscFiles, label: 'Explorer' },
    { id: 'search', icon: VscSearch, label: 'Search' },
    { id: 'git', icon: VscSourceControl, label: 'Source Control' },
    { id: 'debug', icon: VscDebugAlt, label: 'Debug' },
    { id: 'extensions', icon: VscExtensions, label: 'Extensions' },
  ];

  return (
    <div className="activity-bar">
      <div className="activity-bar-items">
        <button
          className="activity-bar-item"
          onClick={onToggleSidebar}
          title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
        >
          <VscMenu size={24} />
        </button>
        
        {items.map(item => (
          <button
            key={item.id}
            className={`activity-bar-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
            title={item.label}
          >
            <item.icon size={24} />
          </button>
        ))}
      </div>
      
      <div className="activity-bar-bottom">
        <button 
          className="activity-bar-item"
          title="Settings"
        >
          <VscSettingsGear size={24} />
        </button>
        
        <button
          className="activity-bar-item"
          onClick={onLogout}
          title={`Logout (${username})`}
        >
          <VscSignOut size={24} />
        </button>
      </div>
    </div>
  );
};

export default ActivityBar;