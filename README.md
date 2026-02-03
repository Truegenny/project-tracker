# Project Tracker

A simple, elegant project tracking web application built with vanilla JavaScript and Tailwind CSS.

## Features

- Track multiple projects with timeline visualization
- Project status management (On Track, Behind, Active, On Pause)
- Timeline view with progress indicators
- Export functionality (PDF support)
- Responsive design
- Local storage persistence

## Technology Stack

- HTML5
- Vanilla JavaScript
- Tailwind CSS
- Nginx (for serving)

## Docker Deployment

This application is containerized and ready for deployment with Docker and Portainer.

### Quick Start with Docker Compose

```bash
docker compose up -d
```

The application will be available at `http://localhost:8080`

### Building the Docker Image

```bash
docker build -t project-tracker:latest .
```

### Running with Docker

```bash
docker run -d -p 8080:80 --name project-tracker project-tracker:latest
```

## Portainer Deployment

This project is optimized for Portainer stack deployment:

1. In Portainer, navigate to Stacks
2. Click "Add stack"
3. Choose "Git Repository" or "Upload" the docker-compose.yml
4. Deploy the stack

The docker-compose.yml includes:
- Health checks for monitoring
- Proper restart policies
- Logging configuration
- Portainer-friendly labels

## Project Structure

```
project-tracker/
├── index.html          # Main HTML file
├── app.js             # Application logic
├── Dockerfile         # Docker image configuration
├── docker-compose.yml # Docker Compose configuration
├── .dockerignore      # Docker build exclusions
└── .gitignore         # Git exclusions
```

## Health Check

The container includes a health check that pings the nginx server every 30 seconds to ensure the application is running properly.

## Logging

Logs are configured with:
- JSON file driver
- Maximum size: 10MB per file
- Maximum 3 log files retained

## License

MIT
