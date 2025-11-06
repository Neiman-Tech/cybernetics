import React, { useState, useEffect } from 'react';

// Use environment variables from .env file
const API_CONFIG = {
  API_URL: process.env.REACT_APP_API_URL || 'http://localhost:4000/api',
  API_KEY: process.env.REACT_APP_API_KEY || 'your-secret-api-key'
};

console.log('🔧 API Configuration:', {
  API_URL: API_CONFIG.API_URL,
  API_KEY: '***', // Don't log the actual key
  REACT_APP_API_URL: process.env.REACT_APP_API_URL
});

export default function Login({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkStoredSession();
  }, []);

  const checkStoredSession = async () => {
    try {
      // Check if window.storage exists
      if (!window.storage) {
        console.warn('⚠️ window.storage not available');
        setChecking(false);
        return;
      }

      const result = await window.storage.get('ide_username');
      if (result && result.value) {
        console.log('✓ Found stored session:', result.value);
        // Skip verification, trust the stored session
        onLoginSuccess(result.value);
      } else {
        console.log('ℹ️ No stored session found');
        setChecking(false);
      }
    } catch (error) {
      console.log('ℹ️ No stored session:', error);
      setChecking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError('Username must be 3-20 characters (letters, numbers, underscore only)');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const fullUrl = `${API_CONFIG.API_URL}${endpoint}`;
      
      console.log('🔗 Attempting auth request to:', fullUrl);
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_CONFIG.API_KEY
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        try {
          if (window.storage) {
            const saveResult = await window.storage.set('ide_username', username);
            if (saveResult) {
              console.log('✓ Session saved to storage successfully');
            } else {
              console.warn('⚠️ Storage set returned null');
            }
          } else {
            console.warn('⚠️ window.storage not available, session will not persist');
          }
        } catch (storageError) {
          console.error('❌ Storage error:', storageError);
          setError('Warning: Session may not persist after reload');
        }
        
        console.log('✓ Authentication successful:', username);
        onLoginSuccess(username);
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError('Network error. Please check if the backend is running at: ' + API_CONFIG.API_URL);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(to bottom right, #1a1a2e, #6b21a8, #1a1a2e)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white'
      }}>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid rgba(255,255,255,0.3)',
            borderTop: '3px solid white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <p style={{ fontSize: '18px' }}>Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom right, #1a1a2e, #6b21a8, #1a1a2e)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        background: '#1f2937',
        padding: '30px',
        borderRadius: '10px',
        border: '1px solid #374151'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            display: 'inline-block',
            padding: '15px',
            background: '#9333ea',
            borderRadius: '50%',
            marginBottom: '15px'
          }}>
            <svg width="40" height="40" fill="none" stroke="white" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h1 style={{ color: 'white', fontSize: '32px', margin: '0 0 10px 0' }}>Web IDE</h1>
          <p style={{ color: '#9ca3af', margin: 0 }}>Your personal coding workspace</p>
        </div>

        <div style={{
          display: 'flex',
          background: '#111827',
          padding: '4px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <button
            onClick={() => {
              setIsLogin(true);
              setError('');
            }}
            style={{
              flex: 1,
              padding: '10px',
              background: isLogin ? '#9333ea' : 'transparent',
              color: isLogin ? 'white' : '#9ca3af',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            Login
          </button>
          <button
            onClick={() => {
              setIsLogin(false);
              setError('');
            }}
            style={{
              flex: 1,
              padding: '10px',
              background: !isLogin ? '#9333ea' : 'transparent',
              color: !isLogin ? 'white' : '#9ca3af',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            Register
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: '#d1d5db', marginBottom: '8px', fontSize: '14px' }}>
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit(e)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              boxSizing: 'border-box',
              outline: 'none'
            }}
            placeholder="Enter your username"
            disabled={loading}
            autoComplete="username"
          />
          <small style={{ color: '#6b7280', fontSize: '12px', display: 'block', marginTop: '4px' }}>
            3-20 characters (letters, numbers, underscore)
          </small>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: '#d1d5db', marginBottom: '8px', fontSize: '14px' }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit(e)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              boxSizing: 'border-box',
              outline: 'none'
            }}
            placeholder="Enter your password"
            disabled={loading}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
        </div>

        {!isLogin && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#d1d5db', marginBottom: '8px', fontSize: '14px' }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit(e)}
              style={{
                width: '100%',
                padding: '12px',
                background: '#111827',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
              placeholder="Confirm your password"
              disabled={loading}
              autoComplete="new-password"
            />
          </div>
        )}

        {error && (
          <div style={{
            marginBottom: '20px',
            padding: '12px',
            background: '#7f1d1d',
            border: '1px solid #991b1b',
            borderRadius: '8px',
            color: '#fecaca',
            fontSize: '13px'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: loading ? '#6b7280' : '#9333ea',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? (isLogin ? 'Logging in...' : 'Creating account...') : (isLogin ? 'Login' : 'Create Account')}
        </button>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: '#9ca3af' }}>
          {isLogin ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => setIsLogin(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#c084fc',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                Register here
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setIsLogin(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#c084fc',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                Login here
              </button>
            </>
          )}
        </div>

        <div style={{
          marginTop: '20px',
          padding: '12px',
          background: '#111827',
          border: '1px solid #374151',
          borderRadius: '8px'
        }}>
          <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>
            <strong style={{ color: '#c084fc' }}>Backend:</strong> {API_CONFIG.API_URL}
          </p>
        </div>
      </div>
    </div>
  );
}