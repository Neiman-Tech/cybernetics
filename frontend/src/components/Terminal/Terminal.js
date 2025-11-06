import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { useProject } from '../../contexts/ProjectContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTerminal } from '../../contexts/TerminalContext';
import { apiService } from '../../services/apiService';
import 'xterm/css/xterm.css';
import './Terminal.css';

const draculaTheme = {
  background: '#000000',
  foreground: '#f8f8f2',
  cursor: 'rgba(30, 251, 5, 1)',
  selectionBackground: '#44475a',
  black: '#000000',

};

const solarizedLightTheme = {
  background: '#eee',
  foreground: '#000',
  cursor: '#0e5ff4ff',
  selectionBackground: '#eee',
  white: '#eee',

};

const replaceHostname = (text) => {
  return text.replace(
    /root@pico-faraday-terminal-[a-z0-9-]+:/g,
    'root@cybernetic:'
  );
};

const Terminal = ({ terminalId, isActive }) => {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const commandBufferRef = useRef('');
  const isInitializedRef = useRef(false);

  const { refreshFiles, username } = useProject();
  const { theme } = useTheme();
  const { updateTerminalTitle } = useTerminal();

  const initializeTerminal = useCallback(async () => {
    if (isInitializedRef.current || !terminalRef.current || !username) {
      return;
    }

    isInitializedRef.current = true;

    try {
      const session = await apiService.createSession(username);

      let wsUrl = session.wsUrl;
      if (wsUrl.startsWith('ws://') && window.location.protocol === 'https:') {
        wsUrl = wsUrl.replace('ws://', 'wss://');
      }
      if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        wsUrl = 'wss://' + wsUrl;
      }

      const chosenTheme = theme === 'dark' ? draculaTheme : solarizedLightTheme;

      const xterm = new XTerm({
        cursorBlink: true,
        fontSize: 15,
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        theme: chosenTheme,
        scrollback: 1000,
        rows: 24,
        cols: 80,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      xterm.loadAddon(fitAddon);
      xterm.loadAddon(webLinksAddon);
      xterm.open(terminalRef.current);
      
      setTimeout(() => {
        fitAddon.fit();
      }, 100);

      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected for terminal:', terminalId);
        ws.send(JSON.stringify({
          type: 'start',
          cols: xterm.cols,
          rows: xterm.rows
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'output') {
            const processedData = replaceHostname(message.data);
            xterm.write(processedData);

            for (let char of message.data) {
              if (char === '\r' || char === '\n') {
                const cmd = commandBufferRef.current.trim().toLowerCase();
                
                if (cmd) {
                  updateTerminalTitle(terminalId, cmd.substring(0, 20));
                }

                const fileOps = ['touch', 'mkdir', 'rm', 'rmdir', 'mv', 'cp', 'nano', 'vi', 'vim'];
                const hasFileOp = fileOps.some(op => cmd.startsWith(op + ' ') || cmd === op);

                if (hasFileOp) {
                  setTimeout(() => refreshFiles(), 1000);
                }

                commandBufferRef.current = '';
              } else if (char === '\x7f' || char === '\b') {
                commandBufferRef.current = commandBufferRef.current.slice(0, -1);
              } else if (char === '\x03') {
                commandBufferRef.current = '';
              } else if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) < 127) {
                commandBufferRef.current += char;
              }
            }
          } else if (message.type === 'exit') {
            xterm.write('\r\n\x1b[31mProcess exited\x1b[0m\r\n');
            setTimeout(() => refreshFiles(), 500);
          } else if (message.type === 'ready') {
            setTimeout(() => refreshFiles(), 1500);
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket closed for terminal:', terminalId);
        setTimeout(() => refreshFiles(), 500);
      };

      xterm.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });

      xterm.onResize((size) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'resize',
            cols: size.cols,
            rows: size.rows
          }));
        }
      });

      const handleResize = () => {
        if (fitAddonRef.current && isActive) {
          setTimeout(() => {
            fitAddonRef.current.fit();
          }, 100);
        }
      };
      
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        xterm.dispose();
        isInitializedRef.current = false;
      };
    } catch (error) {
      console.error('Terminal init failed:', error);
      isInitializedRef.current = false;
    }
  }, [username, refreshFiles, theme, terminalId, updateTerminalTitle, isActive]);

  useEffect(() => {
    let cleanup;
    initializeTerminal().then(cleanupFn => {
      cleanup = cleanupFn;
    });
    return () => {
      if (cleanup) cleanup();
    };
  }, [initializeTerminal]);

  useEffect(() => {
    if (fitAddonRef.current && isActive) {
      setTimeout(() => {
        fitAddonRef.current.fit();
      }, 100);
    }
  }, [isActive]);

  useEffect(() => {
    if (xtermRef.current) {
      const newTheme = theme === 'dark' ? draculaTheme : solarizedLightTheme;
      xtermRef.current.options.theme = newTheme;
    }
  }, [theme]);

  return <div ref={terminalRef} className="terminal-instance" />;
};

export default Terminal;