import React, { useState } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { TerminalProvider } from './contexts/TerminalContext';
import IDE from './components/IDE/IDE';
import Login from './Login';
import './App.css';

function App() {
  const [username, setUsername] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLoginSuccess = (user) => {
    console.log('✅ Login successful:', user);
    setUsername(user);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    console.log('👋 Logging out:', username);
    
    try {
      localStorage.removeItem('ide_username');
      console.log('✓ Session cleared from storage');
    } catch (error) {
      console.warn('⚠️ Could not clear storage:', error);
    }
    
    setUsername(null);
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <Login onLoginSuccess={handleLoginSuccess} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ProjectProvider username={username}>
        <TerminalProvider>
          <IDE onLogout={handleLogout} username={username} />
        </TerminalProvider>
      </ProjectProvider>
    </ThemeProvider>
  );
}

export default App;