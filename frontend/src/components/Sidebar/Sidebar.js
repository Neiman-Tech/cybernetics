import React, { useRef, useCallback } from 'react';
import Explorer from './views/Explorer';
import Search from './views/Search';
import SourceControl from './views/SourceControl';
import './Sidebar.css';

const Sidebar = ({ view, width, onResize }) => {
  const resizerRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e) => {
      const newWidth = startWidth + (e.clientX - startX);
      if (newWidth >= 200 && newWidth <= 600) {
        onResize(newWidth);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onResize]);

  const renderView = () => {
    switch (view) {
      case 'explorer':
        return <Explorer />;
      case 'search':
        return <Search />;
      case 'git':
        return <SourceControl />;
      default:
        return <div className="sidebar-placeholder">Coming soon...</div>;
    }
  };

  return (
    <div className="sidebar" style={{ width: `${width}px` }}>
      <div className="sidebar-content">
        {renderView()}
      </div>
      <div 
        ref={resizerRef}
        className="sidebar-resizer"
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};

export default Sidebar;