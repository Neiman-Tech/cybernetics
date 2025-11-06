#!/bin/bash

# Full Stack Runner - Backend + Frontend with Cloudflare Tunnels
# Fixed version with proper port handling and restart logic

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Read PORT from backend .env if it exists
BACKEND_PORT=4000
if [ -f .env ]; then
    ENV_PORT=$(grep "^PORT=" .env | cut -d '=' -f2 | tr -d ' ')
    if [ ! -z "$ENV_PORT" ]; then
        BACKEND_PORT=$ENV_PORT
        echo_info "Using PORT=${BACKEND_PORT} from .env"
    fi
fi

FRONTEND_PORT=3000
FRONTEND_DIR="./frontend"
RESTART_COUNT=0

# Cleanup function
cleanup() {
    echo ""
    echo_info "Stopping all processes..."
    
    # Kill by process name instead of PID (more reliable)
    pkill -f "node api-server.js" 2>/dev/null || true
    pkill -f "cloudflared" 2>/dev/null || true
    pkill -f "react-scripts" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    pkill -f "next" 2>/dev/null || true
    
    # Clean up log files
    rm -f /tmp/backend-tunnel.log /tmp/frontend-tunnel.log /tmp/backend.log /tmp/frontend.log
    
    echo_info "Cleanup complete"
    exit 0
}

# Trap Ctrl+C
trap cleanup INT TERM

echo "================================================"
echo "🚀 Full Stack Launcher"
echo "================================================"
echo ""
echo_info "Backend Port: ${BACKEND_PORT}"
echo_info "Frontend Port: ${FRONTEND_PORT}"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo_warn "cloudflared not found, installing..."
    
    # Download and install cloudflared
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /tmp/cloudflared
    chmod +x /tmp/cloudflared
    sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
    
    if command -v cloudflared &> /dev/null; then
        echo_info "✓ cloudflared installed successfully"
    else
        echo_error "Failed to install cloudflared"
        echo_error "Install manually: wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        exit 1
    fi
else
    echo_info "✓ cloudflared is installed"
fi
echo ""

# Check and install backend dependencies
if [ ! -d "node_modules" ]; then
    echo_info "Installing backend dependencies..."
    npm install
    echo_info "✓ Backend dependencies installed"
fi

# Kill any existing processes (thorough cleanup)
echo_info "Cleaning up existing processes..."
pkill -9 -f "node api-server.js" 2>/dev/null || true
pkill -9 -f "cloudflared" 2>/dev/null || true
pkill -9 -f "react-scripts" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true
pkill -9 -f "next" 2>/dev/null || true

# Wait for ports to be released
sleep 2

# Clean up old log files
rm -f /tmp/backend-tunnel.log /tmp/frontend-tunnel.log /tmp/backend.log /tmp/frontend.log

# Verify port is free
if lsof -Pi :${BACKEND_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo_warn "Port ${BACKEND_PORT} is still in use, forcing cleanup..."
    lsof -ti:${BACKEND_PORT} | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Start Backend
echo_info "Starting backend on port ${BACKEND_PORT}..."
PORT=${BACKEND_PORT} node api-server.js > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo_info "Backend PID: ${BACKEND_PID}"

# Wait longer for backend to start
sleep 5

# Check if backend actually started
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo_error "Backend failed to start!"
    echo_error "Error log:"
    cat /tmp/backend.log
    exit 1
fi

# Verify backend is responding
echo_info "Verifying backend..."
for i in {1..10}; do
    if curl -s http://localhost:${BACKEND_PORT}/api/health >/dev/null 2>&1; then
        echo_info "✓ Backend is responding"
        break
    fi
    if [ $i -eq 10 ]; then
        echo_error "Backend not responding after 10 seconds"
        cat /tmp/backend.log
        exit 1
    fi
    sleep 1
done

# Start Backend Tunnel
echo_info "Creating backend tunnel..."
cloudflared tunnel --url http://localhost:${BACKEND_PORT} > /tmp/backend-tunnel.log 2>&1 &
BACKEND_TUNNEL_PID=$!
echo_info "Tunnel PID: ${BACKEND_TUNNEL_PID}"

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    echo_warn "Frontend directory not found: $FRONTEND_DIR"
    echo_warn "Running backend only"
    FRONTEND_SKIP=true
else
    FRONTEND_SKIP=false
fi

# Wait for backend tunnel URL (increase timeout)
echo_info "Waiting for backend tunnel URL..."
BACKEND_URL=""

for i in {1..60}; do
    if [ -f /tmp/backend-tunnel.log ]; then
        BACKEND_URL=$(grep -o 'https://[a-z0-9\-]*\.trycloudflare\.com' /tmp/backend-tunnel.log | head -1)
        if [ ! -z "$BACKEND_URL" ]; then
            echo_info "✓ Backend tunnel URL: $BACKEND_URL"
            
            # Verify tunnel is working
            sleep 2
            if curl -s -H "X-API-Key: your-secret-api-key" "${BACKEND_URL}/api/health" >/dev/null 2>&1; then
                echo_info "✓ Tunnel is working"
                break
            else
                echo_warn "Tunnel URL found but not responding yet, waiting..."
            fi
        fi
    fi
    
    if [ $i -eq 60 ]; then
        echo_error "Backend tunnel URL not found after 60s"
        echo_error "Tunnel log:"
        cat /tmp/backend-tunnel.log
        BACKEND_URL="http://localhost:${BACKEND_PORT}"
    fi
    sleep 1
done

# Setup and Start Frontend
if [ "$FRONTEND_SKIP" = false ]; then
    echo_info "Setting up frontend..."
    cd "$FRONTEND_DIR"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo_info "Installing frontend dependencies..."
        npm install
    fi
    
    # Update frontend .env BEFORE starting frontend
    echo_info "Creating frontend .env with backend URL..."
    ENV_FILE=".env"
    
    # Backup existing .env if it exists
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%s)"
    fi
    
    # Write new .env file
    cat > "$ENV_FILE" << ENV_CONTENT
# API Configuration (Auto-generated by cybernetics.sh)
REACT_APP_API_URL=${BACKEND_URL}/api
REACT_APP_API_KEY=your-secret-api-key

# Generated at: $(date)
# Backend URL: ${BACKEND_URL}
ENV_CONTENT
    
    echo_info "✓ Frontend .env created with: ${BACKEND_URL}/api"
    
    # Verify port is free
    if lsof -Pi :${FRONTEND_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo_warn "Port ${FRONTEND_PORT} is in use, forcing cleanup..."
        lsof -ti:${FRONTEND_PORT} | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    
    echo_info "Starting frontend on port ${FRONTEND_PORT}..."
    
    # Start frontend (works for React, Vite, Next.js)
    if [ -f "package.json" ]; then
        if grep -q "react-scripts" package.json; then
            BROWSER=none PORT=${FRONTEND_PORT} npm start > /tmp/frontend.log 2>&1 &
        elif grep -q "vite" package.json; then
            npm run dev -- --port ${FRONTEND_PORT} > /tmp/frontend.log 2>&1 &
        elif grep -q "next" package.json; then
            npm run dev -- -p ${FRONTEND_PORT} > /tmp/frontend.log 2>&1 &
        else
            npm start > /tmp/frontend.log 2>&1 &
        fi
        
        FRONTEND_PID=$!
        cd ..
        
        echo_info "Frontend PID: ${FRONTEND_PID}"
        
        # Wait longer for frontend to start
        sleep 10
        
        if ! kill -0 $FRONTEND_PID 2>/dev/null; then
            echo_warn "Frontend failed to start. Check /tmp/frontend.log"
            echo_warn "Last 20 lines of frontend log:"
            tail -20 /tmp/frontend.log
        else
            echo_info "✓ Frontend started"
            
            # Start Frontend Tunnel
            echo_info "Creating frontend tunnel..."
            cloudflared tunnel --url http://localhost:${FRONTEND_PORT} > /tmp/frontend-tunnel.log 2>&1 &
            FRONTEND_TUNNEL_PID=$!
        fi
    else
        echo_error "No package.json found in frontend directory"
        cd ..
    fi
fi

# Wait for frontend tunnel URL
FRONTEND_URL=""

if [ "$FRONTEND_SKIP" = false ] && [ ! -z "$FRONTEND_TUNNEL_PID" ]; then
    echo_info "Waiting for frontend tunnel URL..."
    
    for i in {1..30}; do
        if [ -f /tmp/frontend-tunnel.log ]; then
            FRONTEND_URL=$(grep -o 'https://[a-z0-9\-]*\.trycloudflare\.com' /tmp/frontend-tunnel.log | head -1)
            if [ ! -z "$FRONTEND_URL" ]; then
                echo_info "✓ Frontend tunnel URL: $FRONTEND_URL"
                break
            fi
        fi
        sleep 1
    done
fi

# Display Results
echo ""
echo "================================================"
echo "🌐 Full Stack Running!"
echo "================================================"
echo ""
echo -e "${CYAN}BACKEND:${NC}"
echo "  Local:  http://localhost:${BACKEND_PORT}"
echo "  API:    http://localhost:${BACKEND_PORT}/api"
if [ ! -z "$BACKEND_URL" ]; then
    echo "  Public: $BACKEND_URL"
    echo "  API:    ${BACKEND_URL}/api"
else
    echo "  Public: ⚠️  Tunnel still connecting..."
fi
echo ""

if [ "$FRONTEND_SKIP" = false ]; then
    echo -e "${CYAN}FRONTEND:${NC}"
    echo "  Local:  http://localhost:${FRONTEND_PORT}"
    if [ ! -z "$FRONTEND_URL" ]; then
        echo "  Public: $FRONTEND_URL"
    else
        echo "  Public: ⚠️  Tunnel connecting..."
    fi
    echo ""
    echo -e "${CYAN}CONFIGURATION:${NC}"
    echo "  .env file: ${FRONTEND_DIR}/.env"
    echo "  API URL:   ${BACKEND_URL}/api"
    echo ""
fi

echo "================================================"
echo ""
echo "💡 Tips:"
echo "   Test backend:  curl -H 'X-API-Key: your-secret-api-key' ${BACKEND_URL}/api/health"
echo "   Backend logs:  tail -f /tmp/backend.log"
if [ "$FRONTEND_SKIP" = false ]; then
    echo "   Frontend logs: tail -f /tmp/frontend.log"
fi
echo "   Stop all:      Press Ctrl+C"
echo ""
echo "✓ Ready to use! Press Ctrl+C to stop everything"
echo ""

# Monitor processes (improved)
while true; do
    # Check backend
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo_warn "Backend crashed! Check logs: tail -f /tmp/backend.log"
        echo_warn "Restarting backend..."
        PORT=${BACKEND_PORT} node api-server.js > /tmp/backend.log 2>&1 &
        BACKEND_PID=$!
        sleep 3
    fi
    
    # Check backend tunnel
    if ! kill -0 $BACKEND_TUNNEL_PID 2>/dev/null; then
        echo_warn "Backend tunnel crashed! Restarting..."
        rm -f /tmp/backend-tunnel.log
        cloudflared tunnel --url http://localhost:${BACKEND_PORT} > /tmp/backend-tunnel.log 2>&1 &
        BACKEND_TUNNEL_PID=$!
    fi
    
    # Check frontend (if running)
    if [ "$FRONTEND_SKIP" = false ] && [ ! -z "$FRONTEND_PID" ]; then
        if ! kill -0 $FRONTEND_PID 2>/dev/null; then
            RESTART_COUNT=$((RESTART_COUNT + 1))
            
            if [ $RESTART_COUNT -gt 3 ]; then
                echo_error "Frontend crashed $RESTART_COUNT times. Stopping auto-restart."
                echo_error "Check logs: tail -f /tmp/frontend.log"
                FRONTEND_SKIP=true
            else
                echo_warn "Frontend crashed! Restarting... (attempt $RESTART_COUNT/3)"
                echo_warn "Last 10 lines of log:"
                tail -10 /tmp/frontend.log
                
                cd "$FRONTEND_DIR"
                if grep -q "react-scripts" package.json; then
                    BROWSER=none PORT=${FRONTEND_PORT} npm start > /tmp/frontend.log 2>&1 &
                else
                    npm start > /tmp/frontend.log 2>&1 &
                fi
                FRONTEND_PID=$!
                cd ..
                sleep 5
            fi
        fi
        
        # Check frontend tunnel
        if [ ! -z "$FRONTEND_TUNNEL_PID" ] && ! kill -0 $FRONTEND_TUNNEL_PID 2>/dev/null; then
            echo_warn "Frontend tunnel crashed! Restarting..."
            cloudflared tunnel --url http://localhost:${FRONTEND_PORT} > /tmp/frontend-tunnel.log 2>&1 &
            FRONTEND_TUNNEL_PID=$!
        fi
    fi
    
    sleep 10
done