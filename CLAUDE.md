# Project Tracker - Developer Documentation

**Current Version: 2.17.0** | Last Updated: February 6, 2026

## Project Overview

**Ntiva Integration Project Tracker** is a feature-rich web-based project management application designed for tracking integration projects with visual timelines, progress tracking, status automation, executive reporting, and workspace organization. It provides team members and executives with real-time visibility into project health, timelines, and completion status across multiple isolated project collections.

## Technology Stack

- **Backend**: Node.js with Express.js 4.x
- **Database**: SQLite3 (better-sqlite3)
- **Frontend**: Vanilla JavaScript (no frameworks)
- **Styling**: Tailwind CSS 3.x (CDN)
- **Security**: bcryptjs (password hashing), jsonwebtoken (JWT auth), helmet.js (security headers)
- **Authentication**: passport, passport-azure-ad (Microsoft 365 SSO), express-session
- **Rate Limiting**: express-rate-limit
- **Deployment**: Docker & Docker Compose, optimized for Portainer GitOps
- **Frontend Export**: html2canvas + jspdf for PDF generation
- **Container Registry**: GitHub Container Registry (ghcr.io)

## Key Features

### Core Features
1. **User Authentication** - Secure JWT-based login with rate limiting (10 attempts per 15 min) + Microsoft 365 SSO
2. **Workspaces** - Separate project collections per user with isolation between users
3. **Workspace Sharing** - Share workspaces with other users as Viewer or Editor
4. **Project Management** - Full CRUD operations for projects with team assignments, descriptions, custom statuses
5. **Priority Levels** - 5-tier priority system (Critical, High, Medium, Low, Minimal) with color-coded badges
6. **Status Tracking** - Automatic status transitions: Discovery → Active → On Track/Behind/On Pause → Complete/Finished
7. **Timeline Visualization** - Visual timeline bars showing project span with TODAY marker
8. **Progress Tracking** - Percentage-based progress bars with visual fill indicators
9. **Auto-Status Updates** - Status automatically set to "Behind" when overdue; "Complete" at 100% progress

### Collaboration Features
10. **Project Sync** - Link projects across workspaces for cross-workspace collaboration
11. **Audit Trail** - Track all project changes with timestamps and user attribution
12. **Last Updated By** - Shows who last modified each project and when
13. **Project Notes** - Add timestamped notes to projects for progress tracking

### Organization Features
14. **Project Templates** - Create reusable task templates; user-specific and admin global templates
15. **Sorting** - Sort projects by Status, Name, Progress, Due Date, Recently Updated, or Priority
16. **Simple/Detailed View Toggle** - Switch between condensed and full project information
17. **Project Search** - Filter projects by name, description, owner, or team

### Export & Reporting
17. **PDF Export** - Generate professional PDF reports for executive review
18. **CSV Export** - Export project data to spreadsheet format
19. **Finished Archive** - Completed projects archived and reactivatable

### User Experience
20. **Dark Mode** - Eye-friendly dark theme with persistent preference
21. **Documentation** - In-app comprehensive user guide
22. **Demo Mode** - Load sample data for testing/presentations
23. **Admin Panel** - User management, password resets, admin role assignment

## File Structure

### Backend
- **`server.js`** (~700 lines) - Express server, database initialization, all API endpoints
  - Auth middleware and JWT verification
  - Database schema with migrations for all tables
  - Routes for auth, projects, workspaces, templates, audit, links, admin
  - Helper functions: `logAudit()`, `detectChanges()`, `getWorkspacePermission()`

### Frontend
- **`public/index.html`** (~80 lines) - HTML structure, Tailwind + custom dark mode CSS
- **`public/app.js`** (~2700 lines) - Complete frontend application
  - State: projects, workspaces, templates, currentView, currentUser, darkMode, simpleView, sortBy
  - All UI components rendered via template literals
  - Modal systems for projects, templates, audit, sharing, documentation

### Configuration
- **`Dockerfile`** - Alpine Linux Node.js 20 container (node:20-alpine3.19)
- **`docker-compose.yml`** - Service configuration, port 8085:3000, ghcr.io image
- **`.github/workflows/build-and-push.yml`** - GitHub Actions CI/CD

## Database Schema

### Tables
```sql
-- Users
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  isAdmin INTEGER DEFAULT 0,
  email TEXT,                              -- For Microsoft SSO linking
  microsoft_id TEXT,                       -- Azure AD object ID
  auth_provider TEXT DEFAULT 'local',      -- 'local' or 'microsoft'
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Workspaces
CREATE TABLE workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  name TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- Projects
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  odid TEXT UNIQUE NOT NULL,
  userId INTEGER NOT NULL,
  workspaceId INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  owner TEXT NOT NULL,
  team TEXT,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  progress INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 3,
  completedDate TEXT,
  tasks TEXT DEFAULT '[]',
  notes TEXT DEFAULT '[]',
  lastUpdatedBy TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (workspaceId) REFERENCES workspaces(id)
);

-- Workspace Shares
CREATE TABLE workspace_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspaceId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  permission TEXT NOT NULL,
  sharedBy INTEGER NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Project Audit Trail
CREATE TABLE project_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectOdid TEXT NOT NULL,
  userId INTEGER NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  changes TEXT,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Project Links (for syncing across workspaces)
CREATE TABLE project_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectOdid TEXT NOT NULL,
  workspaceId INTEGER NOT NULL,
  linkedBy INTEGER NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(projectOdid, workspaceId)
);

-- Project Templates
CREATE TABLE project_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tasks TEXT DEFAULT '[]',
  isGlobal INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Authentication
- `POST /api/login` - Login, returns JWT token
- `GET /api/me` - Get current user info
- `PUT /api/me/password` - Change own password

### Projects
- `GET /api/projects` - List all projects (includes linked projects)
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `GET /api/projects/:id/audit` - Get project audit trail

### Workspaces
- `GET /api/workspaces` - List owned and shared workspaces
- `POST /api/workspaces` - Create workspace
- `PUT /api/workspaces/:id` - Update workspace
- `DELETE /api/workspaces/:id` - Delete workspace
- `DELETE /api/workspaces/:id/leave` - Leave shared workspace

### Workspace Sharing
- `GET /api/users` - List users for sharing dropdown
- `GET /api/workspaces/:id/shares` - List workspace shares
- `POST /api/workspaces/:id/shares` - Add share
- `PUT /api/workspaces/:id/shares/:shareId` - Update permission
- `DELETE /api/workspaces/:id/shares/:shareId` - Remove share

### Project Links
- `GET /api/projects/:id/links` - Get project links
- `POST /api/projects/:id/links` - Create link to workspace
- `DELETE /api/project-links/:linkId` - Remove link

### Templates
- `GET /api/templates` - List templates (user + global)
- `POST /api/templates` - Create template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user
- `DELETE /api/admin/users/:id` - Delete user
- `PUT /api/admin/users/:id/password` - Reset password

## Project Object Structure
```javascript
{
  odid: "string",
  name: "string",
  description: "string",
  owner: "string",
  team: "string",
  workspaceId: "integer",
  startDate: "YYYY-MM-DD",
  endDate: "YYYY-MM-DD",
  status: "discovery|active|on-track|behind|on-pause|complete|finished",
  progress: 0-100,
  priority: 1-5,  // 1=Critical, 2=High, 3=Medium, 4=Low, 5=Minimal
  tasks: [{name, completed}],
  notes: [{text, timestamp}],
  lastUpdatedBy: "username",
  isLinked: boolean,  // Added by frontend for linked projects
  sourceWorkspaceName: "string"  // Added for linked projects
}
```

## Frontend State Variables
```javascript
let projects = [];
let workspaces = [];
let currentWorkspace = null;
let currentView = 'overview';  // overview, edit, finished, admin
let currentUser = null;
let token = localStorage.getItem('token');
let darkMode = localStorage.getItem('darkMode') === 'true';
let simpleView = localStorage.getItem('simpleView') === 'true';
let sortBy = localStorage.getItem('sortBy') || 'status';
let demoMode = false;
let allUsers = [];
let templates = [];
```

## Key Frontend Functions

### Helper Functions
- `getStatusColor(status)` - Returns Tailwind bg class for status
- `getStatusBg(status)` - Returns Tailwind bg+text classes for status badge
- `getPriorityLabel(priority)` - Returns priority name (Critical, High, etc.)
- `getPriorityBg(priority)` - Returns Tailwind classes for priority badge
- `sortProjects(arr)` - Sorts projects by current sortBy value
- `formatDate(date)` - Formats date for display

### Project Operations
- `saveProject(e)` - Save/create project from modal
- `deleteProject(odid)` - Delete project with confirmation
- `reactivateProject(odid)` - Move finished project back to active
- `applyTemplate(templateId)` - Apply template tasks to new project

### Modal Functions
- `openProjectModal(odid)` - Open project edit/create modal
- `showAuditModal(odid)` - Show project history
- `showLinkModal(odid)` - Show project sync options
- `showDocumentation()` - Show user guide
- `showManageTemplatesModal()` - Manage templates

## Dark Mode Implementation

Dark mode uses CSS overrides in `index.html`, NOT Tailwind's `dark:` prefix:
```css
body.dark { background: #111827 !important; }
.dark .bg-white { background: #1f2937 !important; }
.dark .text-gray-800 { color: #f3f4f6 !important; }
/* ... many more overrides */
```

When adding new UI elements, add corresponding `.dark` CSS rules in index.html.

## Deployment

### Docker Image
- Registry: `ghcr.io/truegenny/project-tracker:latest`
- Base: `node:20-alpine3.19`
- Port: 3000 (mapped to 8085 in compose)

### Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | `change-this-secret-in-production` | JWT signing |
| `ADMIN_PASSWORD` | `admin123` | Initial admin password |
| `PORT` | `3000` | Server port |
| `MICROSOFT_CLIENT_ID` | (none) | Azure AD Application ID (SSO) |
| `MICROSOFT_CLIENT_SECRET` | (none) | Azure AD Client Secret (SSO) |
| `MICROSOFT_TENANT_ID` | (none) | Azure AD Tenant ID (SSO) |
| `APP_URL` | `http://localhost:3000` | Public URL for OAuth callbacks |

### Private Repository Setup
To use with private GitHub repo:
1. Create GitHub PAT with `read:packages` scope
2. In Portainer: Registries > Add > Custom > ghcr.io with PAT
3. Portainer will authenticate when pulling images

## Version History (Recent)

### v2.17.0 (Feb 6, 2026)
- **Security**: XSS protection with HTML escaping for all user-rendered data
- **Security**: OAuth token exchange via secure POST instead of URL parameter
- **Security**: Input validation with length limits on all text fields
- **Security**: Production mode requires JWT_SECRET environment variable
- **Security**: Secure session cookies (httpOnly, sameSite) in production
- **Security**: Content Security Policy headers in production
- **Security**: CORS restrictions in production
- **Security**: General API rate limiting (100 req/min)

### v2.16.0 (Feb 6, 2026)
- Project search bar in Overview and Edit tabs
- Filter by project name, description, owner, or team
- Search persists across tab switches
- Clear button to reset search

### v2.15.0 (Feb 6, 2026)
- Microsoft 365 SSO support (optional)
- Single tenant Azure AD integration
- Users can sign in with Microsoft after admin pre-registration
- Email field added to user management for SSO linking
- Admin panel shows auth provider (Local/Microsoft SSO)

### v2.14.1 (Feb 6, 2026)
- Priority badges visible on project cards and tables
- Color-coded: Critical (red), High (orange), Medium (yellow), Low (blue), Minimal (gray)

### v2.14.0
- Priority field for projects (1-5 scale)
- Sort by Priority option added
- Demo data includes priority examples

### v2.13.0
- Sort feature for projects in Overview and Edit tabs
- Sort by: Status, Name, Progress, Due Date, Recently Updated, Priority

### v2.12.0-v2.12.1
- Documentation page with comprehensive user guide
- Fixed dark mode text colors in documentation

### v2.11.0-v2.11.4
- Project Templates feature
- Template selector in new project modal
- Save existing projects as templates
- Various dark mode and UX fixes

### v2.10.0
- Project Sync - link projects across workspaces
- Synced projects show purple badge
- Manage links from sync modal

### v2.9.0-v2.9.2
- Audit Trail - track all project changes
- Last Updated By field
- Progress bar text display fixes

### v2.8.0-v2.8.1
- Workspace Sharing (Viewer/Editor permissions)
- Leave Workspace functionality

## Quick Reference

| Action | How To |
|--------|--------|
| Switch Workspace | Click workspace dropdown in header |
| Share Workspace | Workspace menu > Manage Shares |
| Sync Project | Click link icon on project card/row |
| View History | Click clock icon on project |
| Sort Projects | Use sort dropdown (Overview/Edit tabs) |
| Use Template | New project > Select template above tasks |
| Create Template | Edit project > Save as Template button |
| Export | Export dropdown > PDF or CSV |
| Toggle View | Overview tab > Simple/Detailed toggle |
| Documentation | Settings > Documentation |
| Dark Mode | Settings > Dark/Light Mode |

## Contact & Attribution

- **Designer**: Justin Cronin
- **Built with**: Claude AI
- **Repository**: https://github.com/Truegenny/project-tracker
