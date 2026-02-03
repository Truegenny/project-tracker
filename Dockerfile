FROM node:20-alpine

LABEL maintainer="project-tracker"
LABEL description="Ntiva Integration Project Tracker"
LABEL version="2.0.0"

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy application files
COPY server.js ./
COPY public ./public

# Create data directory
RUN mkdir -p /data

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["node", "server.js"]
