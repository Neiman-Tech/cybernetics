# Terminal API Service

A standalone cloud-based terminal service that provides isolated terminal sessions via REST API and WebSocket connections. Perfect for integrating terminals into any application.

## 🚀 Features

- **REST API** - Create, manage, and control terminal sessions
- **WebSocket** - Real-time terminal I/O
- **Isolated Sessions** - Each user gets their own environment
- **API Key Authentication** - Secure access control
- **Cross-Platform** - Use from any language/framework
- **Auto-cleanup** - Sessions timeout after inactivity

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env and set your API_KEY
nano .env

# Start server
npm start
```

Server runs on `http://localhost:4000`

## 📡 API Endpoints

### Create Session
```http
POST /api/sessions
Headers: X-API-Key: your-api-key
Body: {
  "userId": "user123",
  "metadata": { "app": "my-app" }
}
```

### List Sessions
```http
GET /api/sessions
Headers: X-API-Key: your-api-key
```

### Kill Session
```http
DELETE /api/sessions/:sessionId
Headers: X-API-Key: your-api-key
```

### WebSocket Connection
Connect to the `wsUrl` returned from session creation:
```javascript
ws.send(JSON.stringify({ type: 'start', cols: 80, rows: 24 }));
ws.send(JSON.stringify({ type: 'input', data: 'ls\n' }));
```

## 🚢 Deploy to Render

1. Push to GitHub
2. Connect to Render
3. Set `API_KEY` environment variable
4. Deploy!

## 📝 License

MIT