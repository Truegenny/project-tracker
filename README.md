# Ntiva Integration Project Tracker

A web application for tracking integration projects with timelines, progress tracking, and executive reporting.

## Features

- **User Authentication** - Secure login with JWT tokens
- **Project Management** - Add, edit, delete projects with sub-tasks
- **Status Tracking** - Discovery, Active, On Track, Behind, On Pause, Complete
- **Timeline Visualization** - Visual timeline with TODAY marker
- **Progress Tracking** - Percentage-based progress bars
- **Auto-status Updates** - Behind when overdue, Complete at 100%
- **Finished Archive** - Projects auto-archive 7 days after completion
- **PDF Export** - Generate reports for executives
- **Dark Mode** - Eye-friendly dark theme
- **Admin Panel** - User management for admins

## Deployment

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `change-this-...` | Secret key for JWT tokens (CHANGE IN PRODUCTION) |
| `ADMIN_PASSWORD` | `admin123` | Initial admin password (CHANGE IN PRODUCTION) |

### Docker Compose

```bash
docker compose up -d
```

Access at `http://localhost:8085`

### Default Login

- **Username:** admin
- **Password:** admin123 (or value of ADMIN_PASSWORD)

**Change the admin password after first login!**

## Data Persistence

Project data is stored in SQLite database at `/data/projects.db` inside the container. The `project-data` volume ensures data persists across container restarts.

## Security Notes

1. Change `JWT_SECRET` to a long random string in production
2. Change default admin password immediately
3. Use HTTPS (configure at reverse proxy level)
4. Regular backups of the `project-data` volume

---
Designed by Justin Cronin | Built with Claude AI
