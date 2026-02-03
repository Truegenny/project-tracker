FROM nginx:alpine

LABEL maintainer="project-tracker"
LABEL description="Project Tracker - Static Web Application"
LABEL version="1.0"

# Install git for auto-update on restart
RUN apk add --no-cache git

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
