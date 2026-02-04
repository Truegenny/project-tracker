# Project Tracker - Developer Documentation

**Current Version: 2.8.1** | Last Updated: February 4, 2026 (Workspace Sharing & Leave Workspace complete)

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
3. **Workspace Sharing** - Share workspaces with other users as Viewer or Editor; manage permissions from workspace menu (NEW - v2.8.0)
4. **Project Management** - Full CRUD operations for projects with team assignments, descriptions, custom statuses
5. **Status Tracking** - Automatic status transitions: Discovery → Active → On Track/Behind/On Pause → Complete/Finished
6. **Timeline Visualization** - Visual timeline bars showing project span with TODAY marker
7. **Progress Tracking** - Percentage-based progress bars with visual fill indicators
8. **Auto-Status Updates** - Status automatically set to "Behind" when overdue; "Complete" at 100% progress
9. **Project Notes** - Add timestamped notes to projects for progress tracking and team communication
10. **Export Features** - Generate professional PDF reports and CSV exports (dropdown menu)
11. **Finished Archive** - Completed projects can be archived and reactivated via Reactivate button
12. **Simple/Detailed View Toggle** - Switch between condensed and full project information on Overview tab
13. **Demo Mode** - Toggle demo mode in settings for testing and presentations (no data persistence)
14. **User Profile** - User avatar, username, and role badge display in settings
15. **About Modal** - Display version number and full changelog in modal
16. **Dark Mode** - Eye-friendly dark theme with persistent user preference
17. **Admin Panel** - User management, password resets, admin role assignment
18. **Permission Badges** - Viewers see "View Only" badges, Editors can create/edit/delete projects
19. **Leave Workspace** - Users can remove themselves from shared workspaces with red button (NEW - v2.8.1)
20. **Responsive Design** - Works on desktop and tablet with boxy, minimal design aesthetic

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

### Workspace Shares Table (NEW - v2.8.0)
```sql
CREATE TABLE workspace_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspaceId INTEGER NOT NULL,        -- Foreign key to workspaces table
  userId INTEGER NOT NULL,             -- Foreign key to users table (person receiving share)
  permission TEXT NOT NULL,            -- 'viewer' or 'editor'
  sharedBy INTEGER NOT NULL,           -- Foreign key to users table (person sharing workspace)
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspaceId) REFERENCES workspaces(id),
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (sharedBy) REFERENCES users(id)
);
```

### Indexes
- `idx_projects_userId` - For efficient filtering by user
- `idx_projects_workspaceId` - For efficient filtering by workspace (NEW - v2.4.0)
- `idx_workspaces_userId` - For efficient filtering of workspaces by user (NEW - v2.4.0)
- `idx_workspace_shares_workspaceId` - For efficient filtering shares by workspace (NEW - v2.8.0)
- `idx_workspace_shares_userId` - For efficient filtering shares by user (NEW - v2.8.0)

### Database Migrations Applied
The server.js includes automatic migrations that run on startup:
1. Create workspaces table if not exists
2. Add workspaceId column to projects (if not exists)
3. Create workspaceId index (if not exists)
4. Add notes column to projects (if not exists)
5. Create workspace_shares table if not exists (NEW - v2.8.0)
6. Create workspace_shares indexes if not exists (NEW - v2.8.0)

## API Endpoints

### Authentication
- `POST /api/login` - Login with username/password, returns JWT token
- `GET /api/me` - Get current user info (requires auth)
- `PUT /api/me/password` - Change own password (requires auth)

### Workspaces (All require authentication)
- `GET /api/workspaces` - List all owned AND shared workspaces; returns `isOwner`, `permission`, `ownerUsername` fields (MODIFIED - v2.8.0)
- `POST /api/workspaces` - Create new workspace
- `PUT /api/workspaces/:id` - Update workspace by id
- `DELETE /api/workspaces/:id` - Delete workspace (prevents deleting last workspace)
- `DELETE /api/workspaces/:id/leave` - Leave a shared workspace (remove self from share) (NEW - v2.8.1)

### Workspace Sharing (NEW - v2.8.0, all require authentication)
- `GET /api/users` - List all users (excludes current user) for sharing dropdown
- `GET /api/workspaces/:id/shares` - List all shares for a workspace (owner only)
- `POST /api/workspaces/:id/shares` - Add a share to workspace (owner only), body: {userId, permission}
- `PUT /api/workspaces/:id/shares/:shareId` - Update share permission (owner only)
- `DELETE /api/workspaces/:id/shares/:shareId` - Remove a share from workspace (owner only)

### Projects (All require authentication)
- `GET /api/projects` - List all projects from owned and shared workspaces; adds `workspacePermission` to response (MODIFIED - v2.8.0)
- `POST /api/projects` - Create new project (checks for editor permission) (MODIFIED - v2.8.0)
- `PUT /api/projects/:id` - Update project by odid (checks for editor permission) (MODIFIED - v2.8.0)
- `DELETE /api/projects/:id` - Delete project by odid (checks for editor permission) (MODIFIED - v2.8.0)

### Admin (Require authentication + admin role)
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `DELETE /api/admin/users/:id` - Delete user (also cleans up workspace_shares) (MODIFIED - v2.8.1)
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

**Get workspaces (v2.8.0 response):**
```json
GET /api/workspaces
[
  {
    "id": 1,
    "userId": 1,
    "name": "Default",
    "isOwner": true,
    "permission": "owner",
    "ownerUsername": "john",
    "createdAt": "2026-02-04T10:00:00Z"
  },
  {
    "id": 5,
    "userId": 2,
    "name": "Client A Projects",
    "isOwner": false,
    "permission": "editor",
    "ownerUsername": "alice",
    "createdAt": "2026-02-04T11:00:00Z"
  }
]
```

**Add workspace share (v2.8.0):**
```json
POST /api/workspaces/1/shares
{
  "userId": 3,
  "permission": "viewer"
}
```

**Leave shared workspace (v2.8.1):**
```json
DELETE /api/workspaces/5/leave
```

## Frontend Views

### Login View
- Username and password input fields
- Rate-limited (10 attempts per 15 minutes)
- Error message display

### Overview Tab
- Workspace header with two sections: "MY WORKSPACES" and "SHARED WITH ME" (NEW - v2.8.0)
- Workspace selector dropdown at top for switching between project collections
- Shared workspaces display owner name and permission badge (Viewer/Editor) (NEW - v2.8.0)
- Grouped project display by status (Discovery, Active, On Track, Behind, On Pause, Complete, Finished)
- Permission badges: Viewers see "View Only" badges, viewers cannot create/edit/delete projects (NEW - v2.8.0)
- Quick status visual with color coding
- TODAY marker on timelines
- Reactivate button for finished projects (visible if editor or owner)
- Simple/Detailed view toggle switch (top right) - controls display density
  - Simple view: Condensed project cards with key info only
  - Detailed view: Full project details including descriptions and team info

### Edit Projects Tab
- Workspace-filtered project list (shows only projects in current workspace)
- Permission-based UI: viewers see "View Only" badge instead of edit/delete buttons (NEW - v2.8.0)
- Edit modal for individual projects with:
  - Basic info: name, description, owner, team
  - Timeline: start/end dates
  - Progress: percentage slider
  - Status: dropdown with current auto-status info
  - Tasks: add/remove/complete tasks (disabled for viewers)
  - Notes: add timestamped notes for team communication (disabled for viewers)
  - Actions: Save, Force move to finished, Delete, Reactivate (disabled for viewers)
  - Becomes read-only for viewers (NEW - v2.8.0)

### Finished Tab
- Archive of completed projects (filtered by workspace)
- Reactivate button to move back to active (only visible if editor or owner)
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
  - Full changelog showing all features added in each version (v2.0.0 through v2.8.1)
- Dark mode toggle
- Logout button

### Workspace Menu (NEW - v2.8.0)
- Click workspace name to open dropdown menu
- "Manage Shares" button for workspace owners to manage permissions
- "Leave Workspace" button in red for shared workspaces (NEW - v2.8.1)
- Share Modal UI with:
  - User dropdown to select users for sharing
  - Permission selector (Viewer or Editor)
  - List of existing shares with permission badges and remove buttons
  - Only accessible to workspace owner

### Share Modal (NEW - v2.8.0)
- Dropdown to select users (excludes current user)
- Permission selection (Viewer or Editor)
- Add button to create share
- List of current shares with permission level and remove button
- Only accessible to workspace owners

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

### Today's Session (February 4, 2026) - v2.8.0 to v2.8.1

This session delivered comprehensive workspace sharing and collaboration features:

**v2.8.1 - Leave Workspace (Latest)**
- New backend endpoint: `DELETE /api/workspaces/:id/leave` - Users can remove themselves from shared workspaces
- New frontend function: `leaveWorkspace(workspaceId)` with confirmation dialog
- "Leave Workspace" button in workspace menu (red button, visible only for shared workspaces)
- Auto-switches to owned workspace after leaving
- Clean-up in admin delete user endpoint to cascade remove shares

**v2.8.0 - Workspace Sharing (Major Feature)**
- **Database**: New `workspace_shares` table with columns for workspaceId, userId, permission, sharedBy, createdAt
- **Database**: New indexes for efficient querying: idx_workspace_shares_workspaceId, idx_workspace_shares_userId
- **Backend Helper**: `getWorkspacePermission(workspaceId, userId)` returns 'owner', 'viewer', 'editor', or null
- **New Endpoints**:
  - `GET /api/users` - List users for sharing dropdown (excludes current user)
  - `GET /api/workspaces/:id/shares` - List workspace shares (owner only)
  - `POST /api/workspaces/:id/shares` - Add share (owner only)
  - `PUT /api/workspaces/:id/shares/:shareId` - Update permission (owner only)
  - `DELETE /api/workspaces/:id/shares/:shareId` - Remove share (owner only)
- **Modified Endpoints**:
  - `GET /api/workspaces` - Returns owned AND shared workspaces with isOwner, permission, ownerUsername
  - `GET /api/projects` - Includes workspacePermission field, shows shared workspace projects
  - `POST/PUT/DELETE /api/projects` - Checks for editor permission before allowing modifications
- **Frontend State**: New `allUsers` array for share dropdown
- **Frontend Functions**: `loadShareableUsers()`, `loadWorkspaceShares()`, `addWorkspaceShare()`, `updateWorkspaceShare()`, `removeWorkspaceShare()`, `canEditWorkspace()`, `isWorkspaceOwner()`
- **UI**: Share Modal for managing workspace permissions
- **UI**: Header sections "MY WORKSPACES" and "SHARED WITH ME"
- **UI**: Shared workspaces show owner name and permission badge
- **UI**: Permission badges ("View Only") for viewers; viewers cannot edit/create/delete projects
- **UI**: "Manage Shares" button in workspace menu (owner only)

### Previous Session (February 3, 2026) - v2.4.0 to v2.7.0

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
  createdAt: "ISO timestamp",
  isOwner: "boolean",              // NEW - v2.8.0
  permission: "owner|viewer|editor", // NEW - v2.8.0
  ownerUsername: "string"          // NEW - v2.8.0 (only in shared workspaces)
}
```

### Workspace Share Object Structure (NEW - v2.8.0)
```javascript
{
  id: "integer",
  workspaceId: "integer",
  userId: "integer",
  permission: "viewer|editor",
  sharedBy: "integer",
  createdAt: "ISO timestamp"
}
```

## How to Continue Development

### Understanding the Codebase
1. Start with `server.js` for backend architecture and workspace/sharing logic
2. Review `public/app.js` (expanded to include sharing logic), focusing on:
   - State management (workspaces, currentWorkspace, projects, allUsers)
   - Workspace loading and switching logic with permission awareness
   - Workspace sharing and permission management
   - Project rendering with workspace isolation and permission checks
   - Export functionality (PDF and CSV)
   - Notes feature implementation
   - Permission-based UI rendering (viewers vs editors)
3. Check git history with `git log --oneline` for context on specific features
4. Pay special attention to commits from today's session for workspace sharing implementation
5. Test locally with `npm start` (requires Node 20+)
6. Key functions to understand for sharing: `getWorkspacePermission()`, `canEditWorkspace()`, `isWorkspaceOwner()`, `loadWorkspaceShares()`, `addWorkspaceShare()`, `leaveWorkspace()`

### Key Implementation Details for Workspaces and Sharing

**Frontend Workspace State**:
- `workspaces[]` - Array of workspace objects (owned + shared)
- `currentWorkspace` - Currently selected workspace ID
- `allUsers[]` - Array of users available for sharing (NEW - v2.8.0)
- Projects filtered by `currentWorkspace` when rendered
- Workspace selector dropdown at top of page with "MY WORKSPACES" and "SHARED WITH ME" sections

**Backend Workspace Isolation**:
- All project queries include `userId` filter (user-level isolation)
- Workspace queries include `userId` filter and JOIN with workspace_shares to include shared workspaces
- Project creation assigns workspaceId and checks permission
- Project modification checks `getWorkspacePermission()` - must be 'editor' or 'owner'
- Workspace deletion cascades to delete all projects in workspace
- GET /api/projects accepts optional `workspaceId` query param
- Shared workspaces include permission data (isOwner, permission, ownerUsername)

**Permission Logic (NEW - v2.8.0)**:
- `getWorkspacePermission(workspaceId, userId)` returns: 'owner', 'viewer', 'editor', or null
- Owners can: create/edit/delete projects, manage shares, see all shared projects
- Editors can: create/edit/delete projects, view all shared projects
- Viewers can: view projects only (read-only UI), cannot modify anything
- Workspace owners determined by userId matching workspace creator
- Viewers cannot see edit/delete buttons, modal is read-only
- CSV/PDF export available to all permission levels (read-only data)

### Common Tasks

**Add a new project field**:
1. Update database schema in `server.js` ALTER TABLE migration block
2. Update project object structure in frontend comments
3. Update API request body in POST/PUT endpoints
4. Update HTML form in `renderEditModal()`
5. Parse/stringify JSON fields appropriately (tasks, notes)
6. Test CRUD operations across workspaces
7. Verify permission checks still work (editors can modify, viewers cannot)

**Add a new view**:
1. Add case to `currentView` switch in `render()`
2. Create `render[ViewName]()` function
3. Add navigation tab/button
4. Ensure workspace isolation (filter by currentWorkspace)
5. Include permission checks for edit/delete buttons
6. Test navigation and state persistence

**Modify status logic**:
1. Update `updateAllStatuses()` in app.js
2. Update status color mapping in `getStatusColor()`
3. Test auto-transitions with various project dates/progress
4. Verify behavior in all workspaces and permission levels

**Add workspace functionality**:
1. Add new workspace API endpoint in server.js
2. Add frontend method to call new endpoint
3. Update UI to expose workspace feature
4. Ensure projects are properly scoped to workspace
5. Check permissions if feature affects sharing
6. Test with multiple workspaces and permission levels

**Manage workspace shares**:
1. Use `GET /api/users` to load users for dropdown
2. Use `POST /api/workspaces/:id/shares` to add new share
3. Use `PUT /api/workspaces/:id/shares/:shareId` to update permission
4. Use `DELETE /api/workspaces/:id/shares/:shareId` to remove share
5. Only workspace owners can manage shares
6. After updating shares, reload workspace list to refresh isOwner/permission fields

### Testing
- No automated test suite currently; manual testing required
- Use browser DevTools for debugging frontend
- Check `/data/projects.db` with sqlite3 CLI to verify data:
  ```bash
  docker exec project-tracker-v2 sqlite3 /data/projects.db
  sqlite> SELECT * FROM workspaces;
  sqlite> SELECT * FROM workspace_shares;
  sqlite> SELECT * FROM projects WHERE workspaceId = ?;
  ```
- **Test workspace isolation**: Log in as different users, verify project visibility
- **Test workspace sharing**:
  - Owner creates workspace and adds user as viewer/editor
  - Verify shared workspace appears in receiver's "SHARED WITH ME" section
  - Test viewer cannot edit projects, editor can edit
  - Test viewer sees "View Only" badges and read-only modal
  - Test editor sees full edit UI and can modify projects
  - Test permission changes: update viewer to editor, verify UI changes
  - Test removing share: verify workspace disappears from receiver's list
- **Test leave workspace**: User removes themselves from shared workspace, auto-switches to owned workspace
- **Test auth with rate limiting**: Attempt login >10 times
- **Test CSV export with various project types**
- **Test Notes feature with multiple notes per project**
- **Test admin delete user**: Verify workspace_shares cleaned up, no orphaned shares

### Deployment Workflow
1. Commit changes to feature branch
2. Create pull request for review
3. Merge to main branch
4. Push to GitHub
5. Pull/rebuild in Portainer for auto-deployment

## Key Enhancements (Today's Session - v2.8.0 to v2.8.1)

1. **Workspace Sharing** - Users can now share workspaces with others as viewers or editors
2. **Permission-Based Access** - Viewers have read-only access, editors can create/modify/delete projects
3. **Share Management UI** - Modal interface for workspace owners to manage shares and permissions
4. **Leave Workspace** - Users can remove themselves from shared workspaces with one click
5. **User Segregation** - Workspaces separated into "MY WORKSPACES" and "SHARED WITH ME" sections
6. **Admin Cleanup** - Deleting users now properly cascades to remove associated shares
7. **Enhanced Project Response** - Projects now include workspace permission data for UI rendering

## Previous Bug Fixes (Earlier Session)

1. **Workspace Isolation** - Users only see projects from their own workspaces, no cross-user data leakage
2. **Workspaces Loading on Login** - Fixed issue where workspaces weren't loading when user logged in
3. **Header Layout for Long Names** - Improved header responsiveness to accommodate longer workspace names
4. **Workspace Selector Layout** - Fixed layout issues in workspace dropdown menu

## Known Issues & Technical Debt

- No automated tests (manual testing only)
- Frontend is single file (now includes sharing logic, could split into modules)
- No real-time multi-user synchronization (shares don't update live, require refresh)
- 7-day archive is frontend-side, not enforced by backend
- PDF export uses html2canvas which may have styling issues
- CSV export is basic (no formatting enhancements yet)
- Demo mode doesn't persist data (intentional, but could add demo database)
- No audit logging for share changes (who shared with whom and when)

## Next Steps / Considerations

1. Add automated tests for API endpoints, workspace isolation, and permission checks
2. Implement backend-enforced 7-day archive logic
3. Add project templates for common scenarios
4. Add email notifications for:
   - Workspace share invitations
   - Status changes and project updates
   - Permission changes (viewer to editor, etc.)
5. Enhance CSV export with formatting and advanced options
6. Add project analytics/reports dashboard with workspace-wide views
7. Implement undo/history for project changes
8. Backend-stored demo mode for testing without affecting main data
9. Frontend module/component architecture refactor for maintainability
10. Implement project duplication within workspaces
11. Add bulk operations (export multiple projects, batch status updates)
12. Add audit logging for workspace share changes
13. Implement real-time share updates (WebSocket or polling)
14. Add role-based access control (project-level permissions)
15. Implement workspace team management with invite links

## Contact & Attribution

- **Designer**: Justin Cronin
- **Built with**: Claude AI
- **Repository**: https://github.com/Truegenny/project-tracker
- **License**: Not specified in codebase (check repo for LICENSE file)

---

## Quick Reference

**Switch Workspaces**: Click workspace dropdown in header, select from "MY WORKSPACES" or "SHARED WITH ME"
**Create Workspace**: Click "+" button in workspace selector
**Share Workspace**: Click workspace name > "Manage Shares" (owner only) > select user, pick permission, add
**Update Share Permission**: Click workspace name > "Manage Shares" > click permission to change > update
**Remove Share**: Click workspace name > "Manage Shares" > click remove button next to share
**Leave Shared Workspace**: Click workspace name > "Leave Workspace" (red button, shared workspaces only)
**Check Permission**: Look for "View Only" badge (viewers) or full edit buttons (editors/owners)
**Add Project Note**: Open project in Edit modal, scroll to Notes section, add timestamped note
**Export Project**: Use Export dropdown menu > PDF or CSV (available to all permission levels)
**Toggle Simple/Detailed View**: Click view toggle switch on Overview tab (top right)
**Enable Demo Mode**: Settings menu > Demo Mode toggle (for testing without affecting data)
**View Changelog**: Settings menu > About modal (shows all versions v2.0.0 to v2.8.1)
**Check Project Status**: Navigate to Overview tab, status shown in colored pill
**Add New User**: Admin panel > Create user
**Change Password**: Admin panel for other users, settings menu for own password
**Debug Backend**: Check container logs with `docker compose logs project-tracker-v2`
**Access Database**: `docker exec project-tracker-v2 sqlite3 /data/projects.db`
**Check Shares**: `sqlite> SELECT * FROM workspace_shares;`
**Reset Password**: Stop container, delete `/data/projects.db`, restart (creates new admin user)
**Pull Latest Image**: `docker pull ghcr.io/truegenny/project-tracker:latest`
**Verify Workspace Sharing**: Log in as different users, share workspace, verify access levels
**Test Permission Levels**: Share as viewer (should see "View Only" badge), as editor (should edit)
