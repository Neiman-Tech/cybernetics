#!/bin/bash

echo "╔════════════════════════════════════════════╗"
echo "║   Render Deployment Verification          ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

# Check 1: Dockerfile exists
if [ -f "Dockerfile" ]; then
    echo -e "${GREEN}✓${NC} Dockerfile exists"
else
    echo -e "${RED}✗${NC} Dockerfile not found"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: server.js exists (or check what main file is)
if [ -f "server.js" ]; then
    echo -e "${GREEN}✓${NC} server.js exists"
    
    # Check if Dockerfile references correct file
    if grep -q "server.js" Dockerfile; then
        echo -e "${GREEN}✓${NC} Dockerfile references server.js"
    else
        echo -e "${RED}✗${NC} Dockerfile doesn't reference server.js"
        echo -e "  ${YELLOW}→${NC} Update Dockerfile to: COPY server.js ./"
        ERRORS=$((ERRORS + 1))
    fi
elif [ -f "api-server.js" ]; then
    echo -e "${YELLOW}⚠${NC} Found api-server.js instead of server.js"
    echo -e "  ${YELLOW}→${NC} Rename to server.js or update Dockerfile"
else
    echo -e "${RED}✗${NC} No server file found (server.js or api-server.js)"
    ERRORS=$((ERRORS + 1))
fi

# Check 3: public directory exists
if [ -d "public" ]; then
    echo -e "${GREEN}✓${NC} public/ directory exists"
    
    if [ -f "public/index.html" ]; then
        echo -e "${GREEN}✓${NC} public/index.html exists"
    else
        echo -e "${RED}✗${NC} public/index.html not found"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}✗${NC} public/ directory not found"
    ERRORS=$((ERRORS + 1))
fi

# Check 4: package.json exists
if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC} package.json exists"
    
    # Check for required dependencies
    if grep -q "express" package.json && grep -q "ws" package.json && grep -q "node-pty" package.json; then
        echo -e "${GREEN}✓${NC} Required dependencies found"
    else
        echo -e "${YELLOW}⚠${NC} Some dependencies might be missing"
        echo -e "  ${YELLOW}→${NC} Ensure: express, ws, node-pty, uuid, cors"
    fi
else
    echo -e "${RED}✗${NC} package.json not found"
    ERRORS=$((ERRORS + 1))
fi

# Check 5: PORT configuration in server file
SERVER_FILE=""
if [ -f "server.js" ]; then
    SERVER_FILE="server.js"
elif [ -f "api-server.js" ]; then
    SERVER_FILE="api-server.js"
fi

if [ -n "$SERVER_FILE" ]; then
    if grep -q "process.env.PORT" "$SERVER_FILE"; then
        echo -e "${GREEN}✓${NC} PORT is read from environment"
        
        if grep -q "parseInt.*process.env.PORT" "$SERVER_FILE"; then
            echo -e "${GREEN}✓${NC} PORT is properly parsed as integer"
        else
            echo -e "${YELLOW}⚠${NC} PORT should be parsed: parseInt(process.env.PORT, 10)"
        fi
    else
        echo -e "${RED}✗${NC} PORT not reading from environment"
        echo -e "  ${YELLOW}→${NC} Use: const PORT = parseInt(process.env.PORT, 10) || 4000"
        ERRORS=$((ERRORS + 1))
    fi
    
    if grep -q "listen.*0.0.0.0" "$SERVER_FILE"; then
        echo -e "${GREEN}✓${NC} Server binds to 0.0.0.0"
    else
        echo -e "${RED}✗${NC} Server should bind to 0.0.0.0"
        echo -e "  ${YELLOW}→${NC} Use: server.listen(PORT, '0.0.0.0', ...)"
        ERRORS=$((ERRORS + 1))
    fi
fi

# Check 6: .dockerignore exists
if [ -f ".dockerignore" ]; then
    echo -e "${GREEN}✓${NC} .dockerignore exists"
else
    echo -e "${YELLOW}⚠${NC} .dockerignore not found (optional but recommended)"
fi

# Check 7: render.yaml exists
if [ -f "render.yaml" ]; then
    echo -e "${GREEN}✓${NC} render.yaml exists"
else
    echo -e "${YELLOW}⚠${NC} render.yaml not found (optional for auto-config)"
fi

echo ""
echo "═══════════════════════════════════════════"

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready to deploy to Render${NC}"
    echo ""
    echo "Next steps:"
    echo "1. git add ."
    echo "2. git commit -m 'Ready for Render deployment'"
    echo "3. git push"
    echo "4. Connect to Render and deploy"
    exit 0
else
    echo -e "${RED}✗ Found $ERRORS error(s). Fix them before deploying${NC}"
    echo ""
    echo "Review the messages above and fix the issues."
    exit 1
fi

