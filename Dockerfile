FROM node:18-bookworm-slim

# Install dependencies needed for node-pty and basic utilities
RUN apt-get update && apt-get install -y \
    python3 \
    sudo \
    make \
    g++ \
    bash \
    git \
    vim \
    nano \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Create workspace directory with proper permissions
RUN mkdir -p /app/workspace && chmod 777 /app/workspace

# Create a non-root user for better security
RUN useradd -m -s /bin/bash developer && \
    chown -R developer:developer /app

# Environment variables
ENV NODE_ENV=production
ENV WORKDIR=/app/workspace
ENV PORT=7860
ENV IS_DOCKER=true

# Expose port - Hugging Face expects 7860
EXPOSE 7860

# Use volume for persistent storage
VOLUME ["/app/workspace"]

# Switch to non-root user (optional, comment out if you need root access)
# USER developer

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7860/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["npm", "start"]