import React, { createContext, useContext, useState, useCallback } from 'react';

const TerminalContext = createContext();

export const useTerminal = () => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal must be used within TerminalProvider');
  }
  return context;
};

export const TerminalProvider = ({ children }) => {
  const [terminals, setTerminals] = useState([]);
  const [activeTerminalId, setActiveTerminalId] = useState(null);

  const addTerminal = useCallback((terminal) => {
    console.log('➕ Adding terminal:', terminal.id);
    setTerminals(prev => [...prev, terminal]);
    setActiveTerminalId(terminal.id);
  }, []);

  const removeTerminal = useCallback((id) => {
    console.log('➖ Removing terminal:', id);
    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== id);
      if (activeTerminalId === id && filtered.length > 0) {
        setActiveTerminalId(filtered[filtered.length - 1].id);
      } else if (filtered.length === 0) {
        setActiveTerminalId(null);
      }
      return filtered;
    });
  }, [activeTerminalId]);

  const getActiveTerminal = useCallback(() => {
    return terminals.find(t => t.id === activeTerminalId);
  }, [terminals, activeTerminalId]);

  const updateTerminalTitle = useCallback((id, title) => {
    setTerminals(prev => prev.map(t => 
      t.id === id ? { ...t, title } : t
    ));
  }, []);

  return (
    <TerminalContext.Provider value={{
      terminals,
      activeTerminalId,
      addTerminal,
      removeTerminal,
      setActiveTerminalId,
      getActiveTerminal,
      updateTerminalTitle
    }}>
      {children}
    </TerminalContext.Provider>
  );
};