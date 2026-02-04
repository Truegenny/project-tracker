# Project Tracker - Developer Documentation

**Current Version: 2.7.0** | Last Updated: February 3, 2026 (Major iteration complete)

## Project Overview

**Ntiva Integration Project Tracker v2.7.0** is a feature-rich web-based project management application designed for tracking integration projects with visual timelines, progress tracking, status automation, executive reporting, and workspace organization. It provides team members and executives with real-time visibility into project health, timelines, and completion status across multiple isolated project collections.

The application features secure user authentication, comprehensive project management tools, automatic status updates based on progress and dates, multi-workspace support for project organization, extended note-taking capabilities, professional export options (PDF and CSV), and a professional interface with dark mode and demo mode support.

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
2. **Workspaces** - Separate project collections per user with isolation between users; auto-creates Default workspace on login
3. **Project Management** - Full CRUD operations for projects with team assignments, descriptions, custom statuses
4. **Status Tracking** - Automatic status transitions: Discovery → Active → On Track/Behind/On Pause → Complete/Finished
5. **Timeline Visualization** - Visual timeline bars showing project span with TODAY marker
6. **Progress Tracking** - Percentage-based progress bars with visual fill indicators
7. **Auto-Status Updates** - Status automatically set to "Behind" when overdue; "Complete" at 100% progress
8. **Project Notes** - Add timestamped notes to projects for progress tracking and team communication
9. **Export Features** - Generate professional PDF reports and CSV exports (dropdown menu)
10. **Finished Archive** - Completed projects can be archived and reactivated via Reactivate button
11. **Simple/Detailed View Toggle** - Switch between condensed and full project information on Overview tab
12. **Demo Mode** - Toggle demo mode in settings for testing and presentations (no data persistence)
13. **User Profile** - User avatar, username, and role badge display in settings
14. **About Modal** - Display version number and full changelog in modal
15. **Dark Mode** - Eye-friendly dark theme with persistent user preference
16. **Admin Panel** - User management, password resets, admin role assignment
17. **Responsive Design** - Works on desktop and tablet with boxy, minimal design aesthetic

## File Structure

### Backend
- **`server.js`** (300 lines) - Express server, database initialization, all API endpoints
  - Auth middleware and JWT verification
  - Database schema for users, workspaces, and projects with migrations
  - Routes: `/api/login`, `/api/me`, `/api/projects/*`, `/api/workspaces/*`, `/api/admin/*`
  - Workspace isolation logic for multi-user support
  - Notes and export-related backend processing

### Frontend
- **`public/index.html`** (62 lines) - HTML structure, Tailwind + custom CSS, script loading
- **`public/app.js`** (1388 lines) - Complete frontend application
  - State management (projects, workspaces, currentView, currentUser, darkMode, demoMode, simpleView)
  - API helper with JWT auth
  - Auth functions (login, logout, checkAuth)
  - Workspace management (load, switch, create)
  - Project operations (CRUD, status updates, notes)
  - PDF and CSV export functionality with dropdown menu
  - View renderers (login, overview, edit, finished, admin, settings)
  - Dark mode toggle, demo mode toggle, simple/detailed view toggle
  - Event listeners and form handlers
  - Version display and changelog

### Configuration
- **`package.json`** - Node.js dependencies and scripts
- **`Dockerfile`** - Alpine Linux Node.js 20 container definition with healthcheck
- **`docker-compose.yml`** - Service configuration, port 8085:3000, volume mapping, ghcr.io image
- **`.github/workflows/build-and-push.yml`** - GitHub Actions CI/CD for automatic Docker builds to ghcr.io
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

### Workspaces Table (NEW - v2.4.0)
```sql
CREATE TABLE workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,          -- Foreign key to users table
  name TEXT NOT NULL,               -- Workspace name (e.g., "Default", "Client A Projects")
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

### Projects Table
```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  odid TEXT UNIQUE NOT NULL,        -- Obfuscated project ID (timestamp-based)
  userId INTEGER NOT NULL,          -- Foreign key to users table
  workspaceId INTEGER,              -- Foreign key to workspaces table (NEW - v2.4.0)
  name TEXT NOT NULL,               -- Project name
  description TEXT,                 -- Optional description
  owner TEXT NOT NULL,              -- Project owner name
  team TEXT,                        -- Comma-separated team members
  startDate TEXT NOT NULL,          -- ISO 8601 format
  endDate TEXT NOT NULL,            -- ISO 8601 format
  status TEXT DEFAULT 'active',     -- discovery, active, on-track, behind, on-pause, complete, finished
  progress INTEGER DEFAULT 0,       -- 0-100 percentage
  completedDate TEXT,               -- When project was marked complete
  tasks TEXT DEFAULT '[]',          -- JSON array of task objects
  notes TEXT DEFAULT '[]',          -- JSON array of note objects with timestamps (NEW - v2.6.0)
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (workspaceId) REFERENCES workspaces(id)
);
```

### Indexes
- `idx_projects_userId` - For efficient filtering by user
- `idx_projects_workspaceId` - For efficient filtering by workspace (NEW - v2.4.0)
- `idx_workspaces_userId` - For efficient filtering of workspaces by user (NEW - v2.4.0)

### Database Migrations Applied
The server.js includes automatic migrations that run on startup:
1. Create workspaces table if not exists
2. Add workspaceId column to projects (if not exists)
3. Create workspaceId index (if not exists)
4. Add notes column to projects (if not exists)

## API Endpoints

### Authentication
- `POST /api/login` - Login with username/password, returns JWT token
- `GET /api/me` - Get current user info (requires auth)
- `PUT /api/me/password` - Change own password (requires auth)

### Workspaces (NEW - v2.4.0, all require authentication)
- `GET /api/workspaces` - List all workspaces for current user; auto-creates Default if none exist
- `POST /api/workspaces` - Create new workspace
- `PUT /api/workspaces/:id` - Update workspace by id
- `DELETE /api/workspaces/:id` - Delete workspace (prevents deleting last workspace)

### Projects (All require authentication)
- `GET /api/projects` - List all projects for current user (optionally filtered by workspaceId query param)
- `POST /api/projects` - Create new project (supports workspaceId in body)
- `PUT /api/projects/:id` - Update project by odid (supports notes field)
- `DELETE /api/projects/:id` - Delete project by odid

### Admin (Require authentication + admin role)
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `DELETE /api/admin/users/:id` - Delete user
- `PUT /api/admin/users/:id/password` - Reset user password

### Request/Response Examples

**Create project with workspace:**
```json
POST /api/projects
{
  "name": "Integration Project",
  "description": "...",
  "owner": "John Doe",
  "team": "Team A, Team B",
  "startDate": "2026-02-03",
  "endDate": "2026-03-15",
  "workspaceId": 1,
  "status": "active",
  "progress": 0,
  "tasks": [],
  "notes": []
}
```

**Add note to project:**
```json
PUT /api/projects/abc123xyz
{
  "name": "...",
  "notes": [
    {"text": "Started implementation phase", "timestamp": "2026-02-03T14:30:00Z"},
    {"text": "Awaiting client feedback", "timestamp": "2026-02-03T15:45:00Z"}
  ]
}
```

## Frontend Views

### Login View
- Username and password input fields
- Rate-limited (10 attempts per 15 minutes)
- Error message display

### Overview Tab
- Workspace selector dropdown at top for switching between project collections
- Grouped project display by status (Discovery, Active, On Track, Behind, On Pause, Complete, Finished)
- Quick status visual with color coding
- TODAY marker on timelines
- Reactivate button for finished projects
- Simple/Detailed view toggle switch (top right) - controls display density
  - Simple view: Condensed project cards with key info only
  - Detailed view: Full project details including descriptions and team info

### Edit Projects Tab
- Workspace-filtered project list (shows only projects in current workspace)
- Edit modal for individual projects with:
  - Basic info: name, description, owner, team
  - Timeline: start/end dates
  - Progress: percentage slider
  - Status: dropdown with current auto-status info
  - Tasks: add/remove/complete tasks
  - Notes: add timestamped notes for team communication
  - Actions: Save, Force move to finished, Delete, Reactivate

### Finished Tab
- Archive of completed projects (filtered by workspace)
- Reactivate button to move back to active
- Read-only display of archived projects

### Admin Panel
- User list with creation/deletion
- Password reset functionality
- Admin role assignment
- Only accessible to admin-role users

### Settings Menu
- **User Profile Section** (NEW - v2.5.1)
  - User avatar placeholder
  - Username display
  - Role badge (Admin / User)
- **Demo Mode Toggle** (NEW - v2.3.0) - For testing/presentations (no data persistence)
- **About Modal** (NEW in v2.2) with:
  - Version number display
  - Designer credit: Justin Cronin
  - Builder credit: Claude AI
  - Full changelog showing all features added in each version (v2.0.0 through v2.7.0)
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

## Development History

### Today's Major Iteration (February 3, 2026) - v2.4.0 to v2.7.0

This session delivered significant feature expansion and refinement:

**v2.7.0 - Export Enhancements**
- `8b20109` - Combine export buttons into dropdown menu (PDF and CSV together)
- `e115cdc` - Add CSV export feature alongside PDF

**v2.6.0 - Notes Feature**
- `b7b5793` - Add Notes feature to projects with timestamps for team communication

**v2.5.1 - User Profile**
- `83919aa` - Add enhanced user profile section in settings (avatar, username, role badge)

**v2.5.0 - Version Management**
- `d9e1ec7` - Bump version to 2.5.0 with changelog updates
- `7acdb24` - Add version display and changelog to About modal

**v2.4.0 - Workspaces (Major Feature)**
- `197ea20` - Add Workspaces feature for separate project collections (v2.4.0)

**Workspace Bug Fixes & Refinements**
- `b56c705` - Fix workspaces not loading on login
- `d6e2087` - Fix workspace isolation between users
- `e591a4e` - Make header more compact, increase workspace name space
- `2bff15f` - Fix workspace selector layout issues
- `a128cc3` - Fix database migration order for workspaceId column

**Pre-v2.4.0 Features (Earlier Session)**
- `65768bc` - Add GitHub Actions CI/CD for automatic Docker builds
- `9d36a01` - Add demo mode toggle in settings menu (v2.3.0)
- `90d814f` - Combine Simple/Overview views with toggle switch (v2.2.0)
- `7b5fae3` - Add Reactivate button to move finished projects back to Overview
- `6ca5a68` - Fix: Allow editing finished projects and moving them back
- `5992628` - Add backend with authentication and database (major milestone)

See full history with: `git log --oneline`

## Deployment

### Current Deployment Architecture

The application now uses GitHub Container Registry (ghcr.io) with automatic CI/CD builds:
- Image Registry: `ghcr.io/truegenny/project-tracker:latest`
- Automatic builds trigger on push to main branch via GitHub Actions
- Container image includes both `latest` tag and SHA-based tags for rollback capability

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | `change-this-secret-in-production` | Secret for signing JWT tokens - MUST change in production |
| `ADMIN_PASSWORD` | `admin123` | Initial admin user password - MUST change in production |
| `PORT` | `3000` | Internal container port (mapped to 8085 in compose) |

### Docker Compose Deployment

```bash
# Start application with GitHub Container Registry image
docker compose up -d

# Access at http://localhost:8085
```

Updated `docker-compose.yml` pulls from ghcr.io and includes:
```yaml
image: ghcr.io/truegenny/project-tracker:latest
container_name: project-tracker-v2
ports:
  - "8085:3000"
restart: unless-stopped
environment:
  - JWT_SECRET=${JWT_SECRET:-change-this-to-a-secure-random-string}
  - ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}
volumes:
  - project-data:/data
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/"]
  interval: 30s
  timeout: 3s
  retries: 3
  start_period: 10s
```

### Container Details
- Image: `ghcr.io/truegenny/project-tracker:latest`
- Base: Alpine Linux with Node.js 20
- Container Name: `project-tracker-v2`
- Port Mapping: `8085:3000`
- Volume: `project-data:/data` (SQLite database persists here)
- Restart Policy: `unless-stopped`
- Health Check: HTTP GET to / every 30s with 10s startup grace period
- Logging: JSON file driver, 10MB max per file, 3 file rotation

### GitHub Actions CI/CD (NEW - v2.3.0)

Automatic Docker builds configured in `.github/workflows/build-and-push.yml`:
- **Trigger**: Push to main branch
- **Registry**: GitHub Container Registry (ghcr.io)
- **Authentication**: Uses GITHUB_TOKEN for login
- **Tags**: `latest` + SHA-based for rollback capability
- **Build Context**: Repository root with Dockerfile
- **Permissions**: Requires contents:read and packages:write

To use authenticated container pulls:
```bash
# Log in with GitHub token
docker login ghcr.io -u <username> -p <github_token>

# Pull image
docker pull ghcr.io/truegenny/project-tracker:latest
```

### Default Login Credentials
- **Username**: admin
- **Password**: admin123 (or ADMIN_PASSWORD env var value)

**CRITICAL**: Change admin password immediately after first login!

### Portainer Integration
- Labels configured for easy identification in Portainer
- GitOps ready - can be deployed via git-based automation
- Automatic deployment available via Portainer's Docker Hub integration (ghcr.io)

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
  workspaceId: "integer or null",  // NEW - v2.4.0
  startDate: "YYYY-MM-DD",
  endDate: "YYYY-MM-DD",
  status: "discovery|active|on-track|behind|on-pause|complete|finished",
  progress: 0-100,
  tasks: [{id, name, completed}],
  notes: [                           // NEW - v2.6.0
    {text: "string", timestamp: "ISO timestamp"},
    ...
  ],
  completedDate: "YYYY-MM-DD or null",
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
```

### Workspace Object Structure
```javascript
{
  id: "integer",
  userId: "integer",
  name: "string",
  createdAt: "ISO timestamp"
}
```

## How to Continue Development

### Understanding the Codebase
1. Start with `server.js` for backend architecture and workspace logic
2. Review `public/app.js` (1388 lines), focusing on:
   - State management (workspaces, currentWorkspace, projects)
   - Workspace loading and switching logic
   - Project rendering with workspace isolation
   - Export functionality (PDF and CSV)
   - Notes feature implementation
3. Check git history with `git log --oneline` for context on specific features
4. Pay special attention to commits from today's session for workspace implementation
5. Test locally with `npm start` (requires Node 20+)

### Key Implementation Details for Workspaces

**Frontend Workspace State**:
- `workspaces[]` - Array of workspace objects
- `currentWorkspace` - Currently selected workspace ID
- Projects filtered by `currentWorkspace` when rendered
- Workspace selector dropdown at top of page

**Backend Workspace Isolation**:
- All project queries include `userId` filter (user-level isolation)
- Workspace queries include `userId` filter
- Project creation assigns workspaceId
- Workspace deletion cascades to delete all projects in workspace
- GET /api/projects accepts optional `workspaceId` query param

### Common Tasks

**Add a new project field**:
1. Update database schema in `server.js` ALTER TABLE migration block
2. Update project object structure in frontend comments
3. Update API request body in POST/PUT endpoints
4. Update HTML form in `renderEditModal()`
5. Parse/stringify JSON fields appropriately (tasks, notes)
6. Test CRUD operations across workspaces

**Add a new view**:
1. Add case to `currentView` switch in `render()`
2. Create `render[ViewName]()` function
3. Add navigation tab/button
4. Ensure workspace isolation (filter by currentWorkspace)
5. Test navigation and state persistence

**Modify status logic**:
1. Update `updateAllStatuses()` in app.js
2. Update status color mapping in `getStatusColor()`
3. Test auto-transitions with various project dates/progress
4. Verify behavior in all workspaces

**Add workspace functionality**:
1. Add new workspace API endpoint in server.js
2. Add frontend method to call new endpoint
3. Update UI to expose workspace feature
4. Ensure projects are properly scoped to workspace
5. Test with multiple workspaces and users

### Testing
- No automated test suite currently; manual testing required
- Use browser DevTools for debugging frontend
- Check `/data/projects.db` with sqlite3 CLI to verify data:
  ```bash
  docker exec project-tracker-v2 sqlite3 /data/projects.db
  sqlite> SELECT * FROM workspaces;
  sqlite> SELECT * FROM projects WHERE workspaceId = ?;
  ```
- Test workspace isolation: Log in as different users, verify project visibility
- Test auth with rate limiting by attempting login >10 times
- Test CSV export with various project types
- Test Notes feature with multiple notes per project

### Deployment Workflow
1. Commit changes to feature branch
2. Create pull request for review
3. Merge to main branch
4. Push to GitHub
5. Pull/rebuild in Portainer for auto-deployment

## Key Bug Fixes (Today's Session)

1. **Workspace Isolation** - Users now only see projects from their own workspaces, no cross-user data leakage
2. **Workspaces Loading on Login** - Fixed issue where workspaces weren't loading when user logged in
3. **Header Layout for Long Names** - Improved header responsiveness to accommodate longer workspace names
4. **Workspace Selector Layout** - Fixed layout issues in workspace dropdown menu

## Known Issues & Technical Debt

- No automated tests (manual testing only)
- Frontend is single 1388-line file (could split into modules)
- No real-time multi-user synchronization
- 7-day archive is frontend-side, not enforced by backend
- PDF export uses html2canvas which may have styling issues
- CSV export is basic (no formatting enhancements yet)
- Demo mode doesn't persist data (intentional, but could add demo database)

## Next Steps / Considerations

1. Add automated tests for API endpoints and workspace isolation
2. Implement backend-enforced 7-day archive logic
3. Add project templates for common scenarios
4. Implement multi-user project collaboration/sharing features
5. Add email notifications for status changes and project updates
6. Enhance CSV export with formatting and advanced options
7. Add project analytics/reports dashboard with workspace-wide views
8. Implement undo/history for project changes
9. Backend-stored demo mode for testing without affecting main data
10. Frontend module/component architecture refactor for maintainability
11. Add workspace sharing and collaboration features
12. Implement project duplication within workspaces
13. Add bulk operations (export multiple projects, batch status updates)

## Contact & Attribution

- **Designer**: Justin Cronin
- **Built with**: Claude AI
- **Repository**: https://github.com/Truegenny/project-tracker
- **License**: Not specified in codebase (check repo for LICENSE file)

---

## Quick Reference

**Switch Workspaces**: Click workspace dropdown in header
**Create Workspace**: Click "+" button in workspace selector
**Add Project Note**: Open project in Edit modal, scroll to Notes section, add timestamped note
**Export Project**: Use Export dropdown menu > PDF or CSV
**Toggle Simple/Detailed View**: Click view toggle switch on Overview tab (top right)
**Enable Demo Mode**: Settings menu > Demo Mode toggle (for testing without affecting data)
**View Changelog**: Settings menu > About modal (shows all versions v2.0.0 to v2.7.0)
**Check Project Status**: Navigate to Overview tab, status shown in colored pill
**Add New User**: Admin panel > Create user
**Change Password**: Admin panel for other users, settings menu for own password
**Debug Backend**: Check container logs with `docker compose logs project-tracker-v2`
**Access Database**: `docker exec project-tracker-v2 sqlite3 /data/projects.db`
**Reset Password**: Stop container, delete `/data/projects.db`, restart (creates new admin user)
**Pull Latest Image**: `docker pull ghcr.io/truegenny/project-tracker:latest`
**Verify Workspace Isolation**: Check projects in different workspaces, confirm no cross-workspace visibility
