FROM nginx:alpine

# Add labels for better organization in Portainer
LABEL maintainer="project-tracker"
LABEL description="Project Tracker - Static Web Application"
LABEL version="1.0"

# Copy application files
COPY index.html /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/

# Set proper permissions
RUN chmod -R 755 /usr/share/nginx/html

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
