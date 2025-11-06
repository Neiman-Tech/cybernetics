// utils/portDetection.js
// Cloudflared integration for automatic port detection and forwarding

export class PortDetector {
  constructor() {
    this.detectedPorts = new Map();
    this.listeners = new Set();
    this.checkInterval = null;
  }

  // Start monitoring for ports
  startMonitoring(intervalMs = 3000) {
    if (this.checkInterval) return;
    
    this.checkInterval = setInterval(() => {
      this.detectPorts();
    }, intervalMs);
    
    // Initial check
    this.detectPorts();
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // Detect running ports
  async detectPorts() {
    try {
      // Common development ports to check
      const portsToCheck = [
        3000, // React, Node
        3001, 
        4000, // GraphQL
        5000, // Flask, general
        5173, // Vite
        5174,
        8000, // Django, general
        8080, // General web
        8081,
        9000, // General
      ];

      const activePorts = [];

      for (const port of portsToCheck) {
        const isActive = await this.checkPort(port);
        if (isActive) {
          activePorts.push({
            port,
            status: 'running',
            protocol: 'http',
            address: `localhost:${port}`,
            detectedAt: new Date(),
            cloudflaredUrl: await this.getCloudflaredUrl(port)
          });
        }
      }

      // Update detected ports
      const newPortMap = new Map();
      activePorts.forEach(port => {
        newPortMap.set(port.port, port);
      });

      // Check for changes
      const hasChanges = this.hasPortChanges(newPortMap);
      
      if (hasChanges) {
        this.detectedPorts = newPortMap;
        this.notifyListeners(Array.from(newPortMap.values()));
      }
    } catch (error) {
      console.error('Port detection error:', error);
    }
  }

  // Check if a specific port is active
  async checkPort(port) {
    try {
      // Attempt to connect to the port
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const response = await fetch(`http://localhost:${port}`, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'no-cors' // Important for local development
      });

      clearTimeout(timeoutId);
      return true;
    } catch (error) {
      // Port is not active or not accessible
      return false;
    }
  }

  // Get cloudflared public URL for a port
  async getCloudflaredUrl(port) {
    try {
      const API_URL = process.env.REACT_APP_API_URL || '';
      const API_KEY = process.env.REACT_APP_API_KEY || 'your-secret-api-key';
      
      // Check if tunnel already exists
      const response = await fetch(`${API_URL}/api/cloudflared/tunnels`, {
        headers: { 'X-API-Key': API_KEY }
      });
      
      if (response.ok) {
        const { tunnels } = await response.json();
        const existingTunnel = tunnels.find(t => t.port === port);
        
        if (existingTunnel) {
          return existingTunnel.url;
        }
        
        // Create new tunnel
        const createResponse = await fetch(`${API_URL}/api/cloudflared/tunnel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY
          },
          body: JSON.stringify({ 
            port,
            username: localStorage.getItem('username') 
          })
        });
        
        if (createResponse.ok) {
          const { tunnel } = await createResponse.json();
          return tunnel.url;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting cloudflared URL:', error);
      return null;
    }
  }

  // Check if ports have changed
  hasPortChanges(newPortMap) {
    if (this.detectedPorts.size !== newPortMap.size) {
      return true;
    }

    for (const [port] of newPortMap) {
      if (!this.detectedPorts.has(port)) {
        return true;
      }
    }

    return false;
  }

  // Subscribe to port changes
  subscribe(listener) {
    this.listeners.add(listener);
    
    // Immediately notify with current ports
    listener(Array.from(this.detectedPorts.values()));
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Notify all listeners
  notifyListeners(ports) {
    this.listeners.forEach(listener => {
      try {
        listener(ports);
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }

  // Get all detected ports
  getPorts() {
    return Array.from(this.detectedPorts.values());
  }

  // Forward a specific port manually
  async forwardPort(port) {
    try {
      console.log(`Forwarding port ${port} via cloudflared...`);
      
      // Call your backend to set up cloudflared tunnel
      // const response = await fetch('/api/cloudflared/forward', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ port })
      // });
      
      // return await response.json();
      
      return {
        success: true,
        port,
        url: `https://tunnel-${port}.your-domain.dev`
      };
    } catch (error) {
      console.error('Port forwarding error:', error);
      throw error;
    }
  }

  // Stop forwarding a port
  async stopForwarding(port) {
    try {
      console.log(`Stopping forwarding for port ${port}...`);
      
      // Call your backend to stop cloudflared tunnel
      // await fetch(`/api/cloudflared/stop/${port}`, { method: 'DELETE' });
      
      return { success: true };
    } catch (error) {
      console.error('Stop forwarding error:', error);
      throw error;
    }
  }
}

// Singleton instance
export const portDetector = new PortDetector();


// Hook to use in React components
import { useState, useEffect } from 'react';

export function usePortDetection() {
  const [ports, setPorts] = useState([]);

  useEffect(() => {
    // Subscribe to port changes
    const unsubscribe = portDetector.subscribe(setPorts);

    // Start monitoring
    portDetector.startMonitoring();

    // Cleanup
    return () => {
      unsubscribe();
      portDetector.stopMonitoring();
    };
  }, []);

  return {
    ports,
    forwardPort: (port) => portDetector.forwardPort(port),
    stopForwarding: (port) => portDetector.stopForwarding(port),
    refresh: () => portDetector.detectPorts()
  };
}


// Example usage in TerminalPanel:
/*
import { usePortDetection } from '../../utils/portDetection';

const TerminalPanel = () => {
  const { ports, forwardPort, stopForwarding, refresh } = usePortDetection();
  
  // ports will automatically update when detected
  console.log('Active ports:', ports);
  
  return (
    // Your component JSX
  );
};
*/