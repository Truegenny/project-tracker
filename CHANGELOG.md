# Changelog

All notable changes to Project Tracker are documented here.

## [2.17.0] - 2026-02-06

### Security
- **XSS Protection**: Added HTML escaping for all user-rendered data to prevent cross-site scripting attacks
- **Secure OAuth Flow**: Token exchange now uses secure POST request instead of exposing JWT in URL parameters
- **Input Validation**: Added length limits on all text fields (names: 200 chars, descriptions: 5000 chars)
- **Production Hardening**: JWT_SECRET environment variable required in production mode
- **Session Security**: Cookies now use httpOnly, sameSite, and secure flags in production
- **Content Security Policy**: CSP headers enabled in production to prevent unauthorized script execution
- **CORS Restrictions**: API restricted to configured APP_URL origin in production
- **Rate Limiting**: General API rate limit of 100 requests per minute added

## [2.16.0] - 2026-02-06

### Added
- Project search bar in Overview and Edit tabs
- Filter projects by name, description, owner, or team
- Search persists across tab switches
- Clear button to reset search

### Fixed
- Search input losing focus after each keystroke

## [2.15.0] - 2026-02-06

### Added
- Microsoft 365 Single Sign-On (SSO) support
- Single tenant Azure AD integration
- Email field in user management for SSO linking
- Auth provider badge in admin panel (Local/Microsoft SSO)

### Notes
- SSO is optional - disabled when environment variables not configured
- Users must be pre-registered by admin before using Microsoft sign-in

## [2.14.1] - 2026-02-06

### Added
- Priority badges visible on project cards and tables
- Color-coded priority indicators: Critical (red), High (orange), Medium (yellow), Low (blue), Minimal (gray)

## [2.14.0] - 2026-02-06

### Added
- Priority field for projects (5-tier scale: Critical, High, Medium, Low, Minimal)
- Sort by Priority option
- Demo data includes priority examples

## [2.13.0] - 2026-02-06

### Added
- Sort feature for projects in Overview and Edit tabs
- Sort options: Status, Name, Progress, Due Date, Recently Updated, Priority

## [2.12.0] - 2026-02-06

### Added
- In-app documentation page with comprehensive user guide

### Fixed
- Dark mode text colors in documentation

## [2.11.0] - 2026-02-06

### Added
- Project Templates feature
- Template selector in new project modal
- Save existing projects as templates
- User-specific and admin global templates

### Fixed
- Various dark mode and UX improvements

## [2.10.0] - 2026-02-06

### Added
- Project Sync - link projects across workspaces
- Synced projects display purple badge
- Manage links from sync modal

## [2.9.0] - 2026-02-06

### Added
- Audit Trail - track all project changes with timestamps
- Last Updated By field showing who modified each project
- Change history modal accessible from project cards

### Fixed
- Progress bar text display issues

## [2.8.0] - 2026-02-06

### Added
- Workspace Sharing with Viewer/Editor permissions
- Leave Workspace functionality for shared workspaces
- Permission badges in workspace dropdown

## [2.7.0] and earlier

### Core Features
- User authentication with JWT tokens
- Workspaces for organizing projects
- Project management with CRUD operations
- Timeline visualization with TODAY marker
- Progress tracking with visual bars
- Auto-status updates (Behind when overdue, Complete at 100%)
- PDF and CSV export
- Dark mode support
- Demo mode for testing
- Admin panel for user management
