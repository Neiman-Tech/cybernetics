#!/bin/bash

echo "╔════════════════════════════════════════════╗"
echo "║   Render Deployment Diagnostics           ║"
echo "╚════════════════════════════════════════════╝"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo -e "${BLUE}=== File Structure ===${NC}"
echo ""

# Check main server file
echo "Looking for server file..."
SERVER_FILE=""
for file in server.js index.js app.js api-server.js; do
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✓${NC} Found: $file"
        SERVER_FILE="$file"
    fi
done

if [ -z "$SERVER_FILE" ]; then
    echo -e "  ${RED}✗${NC} No server file found!"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check package.json
echo "Checking package.json..."
if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC} package.json exists"
    
    # Check start script
    START_SCRIPT=$(grep -A 1 '"start"' package.json | grep -o '".*"' | tail -1 | tr -d '"')
    if [ -n "$START_SCRIPT" ]; then
        echo -e "  Start script: ${BLUE}$START_SCRIPT${NC}"
        
        # Extract filename from start script
        START_FILE=$(echo "$START_SCRIPT" | grep -o '[a-zA-Z0-9_-]*\.js' | head -1)
        if [ -n "$START_FILE" ] && [ -f "$START_FILE" ]; then
            echo -e "  ${GREEN}✓${NC} Start file exists: $START_FILE"
        elif [ -n "$START_FILE" ]; then
            echo -e "  ${RED}✗${NC} Start file NOT found: $START_FILE"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e "  ${RED}✗${NC} No start script defined!"
        ERRORS=$((ERRORS + 1))
    fi
    
    # Check node-pty dependency
    if grep -q '"node-pty"' package.json; then
        echo -e "  ${GREEN}✓${NC} node-pty dependency found"
    else
        echo -e "  ${RED}✗${NC} node-pty dependency missing!"
        ERRORS=$((ERRORS + 1))
    fi
    
    # Check for postinstall
    if grep -q '"postinstall"' package.json; then
        echo -e "  ${GREEN}✓${NC} postinstall script found"
    else
        echo -e "  ${YELLOW}⚠${NC} No postinstall script (recommended)"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${RED}✗${NC} package.json not found!"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check Dockerfile
echo "Checking Dockerfile..."
if [ -f "Dockerfile" ]; then
    echo -e "${GREEN}✓${NC} Dockerfile exists"
    
    # Check for build tools
    if grep -q "python3.*make.*g++" Dockerfile || grep -q "apk add.*python3" Dockerfile; then
        echo -e "  ${GREEN}✓${NC} Build tools present"
    else
        echo -e "  ${RED}✗${NC} Missing build tools (python3, make, g++)"
        ERRORS=$((ERRORS + 1))
    fi
    
    # Check for bash
    if grep -q "bash" Dockerfile; then
        echo -e "  ${GREEN}✓${NC} Bash installed"
    else
        echo -e "  ${YELLOW}⚠${NC} Bash not installed (needed for terminal)"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    # Check for node-pty rebuild
    if grep -q "rebuild.*node-pty" Dockerfile || grep -q "npm.*rebuild" Dockerfile; then
        echo -e "  ${GREEN}✓${NC} node-pty rebuild found"
    else
        echo -e "  ${RED}✗${NC} No node-pty rebuild step!"
        echo -e "     ${YELLOW}→${NC} Add: RUN npm rebuild node-pty --build-from-source"
        ERRORS=$((ERRORS + 1))
    fi
    
    # Check for workspace directory
    if grep -q "workspace" Dockerfile; then
        echo -e "  ${GREEN}✓${NC} Workspace directory setup"
    else
        echo -e "  ${YELLOW}⚠${NC} No workspace directory"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    # Check CMD
    CMD_LINE=$(grep "^CMD" Dockerfile)
    if [ -n "$CMD_LINE" ]; then
        echo -e "  CMD: ${BLUE}$CMD_LINE${NC}"
    else
        echo -e "  ${RED}✗${NC} No CMD instruction!"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}✗${NC} Dockerfile not found!"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check .dockerignore
echo "Checking .dockerignore..."
if [ -f ".dockerignore" ]; then
    echo -e "${GREEN}✓${NC} .dockerignore exists"
    if grep -q "node_modules" .dockerignore; then
        echo -e "  ${GREEN}✓${NC} Excludes node_modules"
    fi
else
    echo -e "${YELLOW}⚠${NC} .dockerignore not found (recommended)"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# Check public directory
echo "Checking public directory..."
if [ -d "public" ]; then
    echo -e "${GREEN}✓${NC} public/ directory exists"
    if [ -f "public/index.html" ]; then
        echo -e "  ${GREEN}✓${NC} public/index.html exists"
    else
        echo -e "  ${RED}✗${NC} public/index.html not found!"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}✗${NC} public/ directory not found!"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "═══════════════════════════════════════════"
echo ""

# Summary
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready to deploy!${NC}"
    echo ""
    echo "Deploy with:"
    echo "  git add ."
    echo "  git commit -m 'Ready for production'"
    echo "  git push"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    echo "  Can deploy but consider fixing warnings"
else
    echo -e "${RED}✗ $ERRORS error(s) found${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    fi
    echo ""
    echo "Most common fixes:"
    echo ""
    echo "1. Add node-pty rebuild to Dockerfile:"
    echo "   ${BLUE}RUN npm rebuild node-pty --build-from-source${NC}"
    echo ""
    echo "2. Ensure package.json has correct start script:"
    echo "   ${BLUE}\"start\": \"node $SERVER_FILE\"${NC}"
    echo ""
    echo "3. Use multi-stage Dockerfile (see Dockerfile.bulletproof)"
    echo ""
fi

echo ""
echo "For detailed fix instructions, see:"
echo "  - FIX-NODE-PTY.md"
echo "  - QUICK-FIX.md"
echo ""

exit $ERRORS