# Project Tracker - Developer Documentation

Last Updated: February 3, 2026

## Project Overview

**Ntiva Integration Project Tracker v2.0.0** is a web-based project management application designed for tracking integration projects with visual timelines, progress tracking, status automation, and executive reporting capabilities. It provides team members and executives with real-time visibility into project health, timelines, and completion status.

The application features secure user authentication, comprehensive project management tools, automatic status updates based on progress and dates, and a professional interface with dark mode support.

## Technology Stack

- **Backend**: Node.js with Express.js 4.x
- **Database**: SQLite3 (better-sqlite3)
- **Frontend**: Vanilla JavaScript (no frameworks)
- **Styling**: Tailwind CSS 3.x
- **Security**: bcryptjs (password hashing), jsonwebtoken (JWT auth), helmet.js (security headers)
- **Rate Limiting**: express-rate-limit
- **Deployment**: Docker & Docker Compose, optimized for Portainer GitOps
- **Frontend Export**: html2canvas + jspdf for PDF generation

## Key Features

1. **User Authentication** - Secure JWT-based login with rate limiting (10 attempts per 15 min)
2. **Project Management** - Full CRUD operations for projects with team assignments
3. **Status Tracking** - Automatic status transitions: Discovery → Active → On Track/Behind/On Pause → Complete/Finished
4. **Timeline Visualization** - Visual timeline bars showing project span with TODAY marker
5. **Progress Tracking** - Percentage-based progress bars with visual fill indicators
6. **Auto-Status Updates** - Status automatically set to "Behind" when overdue; "Complete" at 100% progress
7. **Finished Archive** - Completed projects can be archived and reactivated
8. **PDF Export** - Generate professional reports for executive distribution
9. **Dark Mode** - Eye-friendly dark theme with persistent user preference
10. **Admin Panel** - User management, password resets, admin role assignment
11. **Responsive Design** - Works on desktop and tablet with boxy, minimal design aesthetic

## File Structure

### Backend
- **`server.js`** (214 lines) - Express server, database initialization, all API endpoints
  - Auth middleware and JWT verification
  - Database schema for users and projects
  - Routes: `/api/login`, `/api/me`, `/api/projects/*`, `/api/admin/*`

### Frontend
- **`public/index.html`** (62 lines) - HTML structure, Tailwind + custom CSS, script loading
- **`public/app.js`** (922 lines) - Complete frontend application
  - State management (projects, currentView, currentUser, darkMode)
  - API helper with JWT auth
  - Auth functions (login, logout, checkAuth)
  - Project operations (CRUD, status updates)
  - PDF export functionality
  - View renderers (login, overview, edit, finished, admin)
  - Dark mode toggle
  - Event listeners and form handlers

### Configuration
- **`package.json`** - Node.js dependencies and scripts
- **`Dockerfile`** - Alpine Linux Node.js 20 container definition with healthcheck
- **`docker-compose.yml`** - Service configuration, port 8085:3000, volume mapping, logging
- **`.gitignore`** - Standard Node.js exclusions
- **`README.md`** - User-facing documentation

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,           -- bcrypt hashed
  isAdmin INTEGER DEFAULT 0,        -- 1 for admins, 0 for regular users
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Projects Table
```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  odid TEXT UNIQUE NOT NULL,        -- Obfuscated project ID (timestamp-based)
  userId INTEGER NOT NULL,          -- Foreign key to users table
  name TEXT NOT NULL,               -- Project name
  description TEXT,                 -- Optional description
  owner TEXT NOT NULL,              -- Project owner name
  team TEXT,                        -- Comma-separated team members
  startDate TEXT NOT NULL,          -- ISO 8601 format
  endDate TEXT NOT NULL,            -- ISO 8601 format
  status TEXT DEFAULT 'active',     -- discovery, active, on-track, behind, on-pause, complete
  progress INTEGER DEFAULT 0,       -- 0-100 percentage
  completedDate TEXT,               -- When project was marked complete
  tasks TEXT DEFAULT '[]',          -- JSON array of task objects
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

### Indexes
- `idx_projects_userId` - For efficient filtering by user

## API Endpoints

### Authentication
- `POST /api/login` - Login with username/password, returns JWT token
- `GET /api/me` - Get current user info (requires auth)
- `PUT /api/me/password` - Change own password (requires auth)

### Projects (All require authentication)
- `GET /api/projects` - List all projects for current user
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project by odid
- `DELETE /api/projects/:id` - Delete project by odid

### Admin (Require authentication + admin role)
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `DELETE /api/admin/users/:id` - Delete user
- `PUT /api/admin/users/:id/password` - Reset user password

## Frontend Views

### Login View
- Username and password input fields
- Rate-limited (10 attempts per 15 minutes)
- Error message display

### Overview Tab
- Grouped project display by status
- "Overview" (all active projects)
- "Finished" (completed/archived projects)
- Quick status visual with color coding
- TODAY marker on timelines
- Reactivate button for finished projects

### Edit Projects Tab
- Edit modal for individual projects
- Add/remove tasks
- Change status, progress, dates
- Force move to finished option
- Delete project

### Finished Tab
- Archive of completed projects
- Reactivate button to move back to active
- 7-day auto-archive capability (logic in frontend)

### Admin Panel
- User list with creation/deletion
- Password reset functionality
- Admin role assignment

### Settings Menu
- About information (Designer: Justin Cronin, Built with Claude AI)
- Dark mode toggle
- Logout button

## Status Management Logic

Projects follow an auto-status update system:
1. **Discovery** → Initial status when created
2. **Active** → User-set status, project is in progress
3. **On Track** → Automatic when progress matches timeline progress
4. **Behind** → Automatic when current date exceeds end date
5. **On Pause** → User-set manual status
6. **Complete** → Automatic when progress reaches 100%
7. **Finished** → Archive status after 7 days of completion (7-day soft delete)

Auto-update logic is triggered on every page load via `updateAllStatuses()` function.

## Development History (Recent Commits)

- **40b665d** (Latest) - Remove image tag to fix Portainer deployment
- **7b5fae3** - Add Reactivate button to move finished projects back to Overview
- **6ca5a68** - Fix: Allow editing finished projects and moving them back
- **ea6e39c** - Fix build context and rename container to avoid conflict
- **454f2bf** - Add image version tag 2.0.0 for clean upgrades
- **5992628** - Add backend with authentication and database (major milestone)
- **30b2406** - Add Justin Cronin as design author
- **48e64cb** - Add settings gear menu with About info and dark mode toggle
- **8f21456** - Add dark mode toggle and styling
- **b17e156** - Auto-update project status based on progress and date

See full history with: `git log --oneline`

## Deployment

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | `change-this-secret-in-production` | Secret for signing JWT tokens - MUST change in production |
| `ADMIN_PASSWORD` | `admin123` | Initial admin user password - MUST change in production |
| `PORT` | `3000` | Internal container port (mapped to 8085 in compose) |

### Docker Compose Deployment

```bash
# Start application
docker compose up -d

# Access at http://localhost:8085
```

### Container Details
- Image: `node:20-alpine` (lightweight)
- Container Name: `project-tracker-v2`
- Port Mapping: `8085:3000`
- Volume: `project-data:/data` (SQLite database persists here)
- Restart Policy: `unless-stopped`
- Health Check: HTTP GET to / every 30s with 10s startup grace period
- Logging: JSON file driver, 10MB max per file, 3 file rotation

### Default Login Credentials
- **Username**: admin
- **Password**: admin123 (or ADMIN_PASSWORD env var value)

**CRITICAL**: Change admin password immediately after first login!

### Portainer Integration
- Labels configured for easy identification in Portainer
- GitOps ready - can be deployed via git-based automation
- No image tag pinning (uses latest/rebuilt on each compose up)

## Security Considerations

1. **JWT Tokens** - 24-hour expiration, signed with JWT_SECRET
2. **Password Hashing** - bcryptjs with salt round 10
3. **Rate Limiting** - Login endpoint limited to 10 attempts per 15 minutes
4. **Helmet.js** - Security headers enabled (except CSP, which is disabled for Tailwind)
5. **CORS** - Enabled for cross-origin requests
6. **User Isolation** - Projects are filtered by userId; users only see their own projects
7. **Admin Verification** - All admin endpoints check isAdmin flag

### Production Recommendations
1. Change `JWT_SECRET` to long random string (32+ characters)
2. Change default `ADMIN_PASSWORD` immediately
3. Set up HTTPS at reverse proxy layer (nginx/Traefik)
4. Enable database backups for SQLite volume
5. Use environment file (.env) for secrets, never commit to git
6. Rotate admin passwords regularly

## Key Code Patterns

### Frontend State Management
- Global variables: `projects[]`, `currentView`, `currentUser`, `token`, `darkMode`
- Projects stored in memory, loaded on auth
- Rendered via single `render()` function
- View switching via tabs in navigation

### API Usage Pattern
```javascript
const data = await api('/endpoint', {
  method: 'POST',
  body: JSON.stringify({ /* payload */ })
});
```
- Helper automatically adds JWT auth header
- Returns parsed JSON or throws error
- Auto-logout on 401 status

### Project Object Structure
```javascript
{
  id: "string (odid)",
  name: "string",
  description: "string",
  owner: "string",
  team: "string",
  startDate: "YYYY-MM-DD",
  endDate: "YYYY-MM-DD",
  status: "discovery|active|on-track|behind|on-pause|complete|finished",
  progress: 0-100,
  tasks: [{id, name, completed}],
  completedDate: "YYYY-MM-DD or null",
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
```

## How to Continue Development

### Understanding the Codebase
1. Start with `server.js` for backend architecture
2. Review `public/app.js` line-by-line, focusing on state management
3. Check git history for context on specific features
4. Test locally with `npm start` (requires Node 20+)

### Common Tasks

**Add a new project field**:
1. Update database schema in `server.js` ALTER TABLE
2. Update project object structure in frontend
3. Update API request body in POST/PUT endpoints
4. Update HTML form in `renderEditModal()`
5. Test CRUD operations

**Add a new view**:
1. Add case to `currentView` switch in `render()`
2. Create `render[ViewName]()` function
3. Add navigation tab/button
4. Test navigation and state persistence

**Modify status logic**:
1. Update `updateAllStatuses()` in app.js
2. Update status color mapping in `getStatusColor()`
3. Test auto-transitions with various project dates/progress

### Testing
- No automated test suite currently; manual testing required
- Use browser DevTools for debugging frontend
- Check `/data/projects.db` with sqlite3 CLI to verify data
- Test auth with rate limiting by attempting login >10 times

### Deployment Workflow
1. Commit changes to feature branch
2. Create pull request for review
3. Merge to main branch
4. Push to GitHub
5. Pull/rebuild in Portainer for auto-deployment

## Known Issues & Technical Debt

- No automated tests (manual testing only)
- Frontend is single 922-line file (could split into modules)
- No real-time multi-user synchronization
- 7-day archive is frontend-side, not enforced by backend
- PDF export uses html2canvas which may have styling issues

## Next Steps / Considerations

1. Add automated tests for API endpoints
2. Implement backend-enforced 7-day archive logic
3. Add project templates for common scenarios
4. Implement multi-user project collaboration features
5. Add email notifications for status changes
6. Create CSV export alongside PDF
7. Add project analytics/reports dashboard
8. Implement undo/history for project changes
9. Database migration system for schema changes
10. Frontend module/component architecture refactor

## Contact & Attribution

- **Designer**: Justin Cronin
- **Built with**: Claude AI
- **Repository**: https://github.com/Truegenny/project-tracker
- **License**: Not specified in codebase (check repo for LICENSE file)

---

## Quick Reference

**Check Project Status**: Navigate to Overview tab, status shown in colored pill
**Export to PDF**: Use settings menu or print function
**Add New User**: Admin panel > Create user
**Change Password**: Admin panel for other users, settings menu for own password
**Debug Backend**: Check container logs with `docker compose logs project-tracker-v2`
**Access Database**: `docker exec project-tracker-v2 sqlite3 /data/projects.db`
**Reset Password**: Stop container, delete `/data/projects.db`, restart (creates new admin user)
