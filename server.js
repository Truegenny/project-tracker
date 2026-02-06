const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const { OIDCStrategy } = require('passport-azure-ad');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Microsoft OAuth configuration
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const MICROSOFT_SSO_ENABLED = !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET && MICROSOFT_TENANT_ID);

// Database setup
const db = new Database('/data/projects.db');

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    isAdmin INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    odid TEXT UNIQUE NOT NULL,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    owner TEXT NOT NULL,
    team TEXT,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    completedDate TEXT,
    tasks TEXT DEFAULT '[]',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_projects_userId ON projects(userId);
  CREATE INDEX IF NOT EXISTS idx_workspaces_userId ON workspaces(userId);
`);

// Migration: Add workspaceId column if it doesn't exist
try {
  db.exec('ALTER TABLE projects ADD COLUMN workspaceId INTEGER REFERENCES workspaces(id)');
  console.log('Migration: Added workspaceId column to projects table');
} catch (e) {
  // Column already exists, ignore
}

// Create index for workspaceId (after migration ensures column exists)
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_projects_workspaceId ON projects(workspaceId)');
} catch (e) {
  // Index might already exist
}

// Create workspace_shares table for sharing workspaces between users
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspaceId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    permission TEXT NOT NULL,
    sharedBy INTEGER NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspaceId) REFERENCES workspaces(id),
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (sharedBy) REFERENCES users(id),
    UNIQUE(workspaceId, userId)
  );
  CREATE INDEX IF NOT EXISTS idx_workspace_shares_workspaceId ON workspace_shares(workspaceId);
  CREATE INDEX IF NOT EXISTS idx_workspace_shares_userId ON workspace_shares(userId);
`);

// Migration: Add notes column if it doesn't exist
try {
  db.exec("ALTER TABLE projects ADD COLUMN notes TEXT DEFAULT '[]'");
  console.log('Migration: Added notes column to projects table');
} catch (e) {
  // Column already exists, ignore
}

// Create project_audit table for audit trail
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectOdid TEXT NOT NULL,
      userId INTEGER NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      changes TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_project_audit_odid ON project_audit(projectOdid);
  `);
} catch (e) {
  // Table/index might already exist
}

// Migration: Add lastUpdatedBy column if it doesn't exist
try {
  db.exec("ALTER TABLE projects ADD COLUMN lastUpdatedBy TEXT");
  console.log('Migration: Added lastUpdatedBy column to projects table');
} catch (e) {
  // Column already exists, ignore
}

// Migration: Add priority column if it doesn't exist
try {
  db.exec("ALTER TABLE projects ADD COLUMN priority INTEGER DEFAULT 3");
  console.log('Migration: Added priority column to projects table');
} catch (e) {
  // Column already exists, ignore
}

// Create project_links table for syncing projects across workspaces
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectOdid TEXT NOT NULL,
      workspaceId INTEGER NOT NULL,
      linkedBy INTEGER NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspaceId) REFERENCES workspaces(id),
      FOREIGN KEY (linkedBy) REFERENCES users(id),
      UNIQUE(projectOdid, workspaceId)
    );
    CREATE INDEX IF NOT EXISTS idx_project_links_odid ON project_links(projectOdid);
    CREATE INDEX IF NOT EXISTS idx_project_links_workspace ON project_links(workspaceId);
  `);
} catch (e) {
  // Table/indexes might already exist
}

// Create project_templates table
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      tasks TEXT DEFAULT '[]',
      userId INTEGER,
      isGlobal INTEGER DEFAULT 0,
      createdBy INTEGER NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (createdBy) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_templates_userId ON project_templates(userId);
    CREATE INDEX IF NOT EXISTS idx_templates_global ON project_templates(isGlobal);
  `);
} catch (e) {
  // Table/indexes might already exist
}

// Migration: Add email column for Microsoft SSO
try {
  db.exec("ALTER TABLE users ADD COLUMN email TEXT");
  console.log('Migration: Added email column to users table');
} catch (e) {
  // Column already exists, ignore
}

// Migration: Add microsoft_id column for Microsoft SSO
try {
  db.exec("ALTER TABLE users ADD COLUMN microsoft_id TEXT");
  console.log('Migration: Added microsoft_id column to users table');
} catch (e) {
  // Column already exists, ignore
}

// Migration: Add auth_provider column for Microsoft SSO
try {
  db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'");
  console.log('Migration: Added auth_provider column to users table');
} catch (e) {
  // Column already exists, ignore
}

// Create default admin user if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.prepare('INSERT INTO users (username, password, isAdmin) VALUES (?, ?, 1)').run('admin', hashedPassword);
  console.log('Default admin user created (username: admin)');
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware (required for OAuth state)
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 10 * 60 * 1000 } // 10 min for OAuth flow only
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization (minimal - we use JWT after OAuth)
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Configure Microsoft OAuth strategy if credentials are provided
if (MICROSOFT_SSO_ENABLED) {
  passport.use(new OIDCStrategy({
    identityMetadata: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    responseType: 'code',
    responseMode: 'query',
    redirectUrl: `${APP_URL}/api/auth/microsoft/callback`,
    allowHttpForRedirectUrl: APP_URL.startsWith('http://'),
    scope: ['openid', 'profile', 'email'],
    passReqToCallback: false
  }, (iss, sub, profile, accessToken, refreshToken, done) => {
    // Extract email from profile
    const email = profile._json?.preferred_username || profile._json?.email || profile.upn;
    return done(null, { microsoftId: sub, email, profile });
  }));
  console.log('Microsoft SSO enabled');
} else {
  console.log('Microsoft SSO disabled (missing credentials)');
}

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts
  message: { error: 'Too many login attempts, please try again later' }
});

// Auth middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

// Helper: Get user's permission for a workspace
function getWorkspacePermission(workspaceId, userId) {
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (workspace && workspace.userId === userId) return 'owner';

  const share = db.prepare('SELECT permission FROM workspace_shares WHERE workspaceId = ? AND userId = ?')
    .get(workspaceId, userId);
  return share ? share.permission : null;
}

// Helper: Log audit trail entry
function logAudit(projectOdid, userId, username, action, changes = null) {
  try {
    db.prepare(`
      INSERT INTO project_audit (projectOdid, userId, username, action, changes)
      VALUES (?, ?, ?, ?, ?)
    `).run(projectOdid, userId, username, action, changes ? JSON.stringify(changes) : null);
  } catch (e) {
    console.error('Failed to log audit:', e);
  }
}

// Helper: Detect changes between old and new project data
function detectChanges(oldProject, newProject) {
  const changes = [];
  const changedFields = {};

  // Check status change
  if (oldProject.status !== newProject.status) {
    changes.push({
      action: 'STATUS_CHANGE',
      changes: { field: 'status', old: oldProject.status, new: newProject.status }
    });
  }

  // Check progress change
  if (oldProject.progress !== newProject.progress) {
    changes.push({
      action: 'PROGRESS_UPDATE',
      changes: { field: 'progress', old: oldProject.progress, new: newProject.progress }
    });
  }

  // Check timeline changes
  if (oldProject.startDate !== newProject.startDate || oldProject.endDate !== newProject.endDate) {
    changes.push({
      action: 'TIMELINE_CHANGE',
      changes: {
        field: 'timeline',
        old: { startDate: oldProject.startDate, endDate: oldProject.endDate },
        new: { startDate: newProject.startDate, endDate: newProject.endDate }
      }
    });
  }

  // Check for new notes
  const oldNotes = JSON.parse(oldProject.notes || '[]');
  const newNotes = JSON.parse(typeof newProject.notes === 'string' ? newProject.notes : JSON.stringify(newProject.notes || []));
  if (newNotes.length > oldNotes.length) {
    changes.push({
      action: 'NOTE_ADDED',
      changes: { count: newNotes.length - oldNotes.length }
    });
  }

  // Check for task changes
  const oldTasks = JSON.parse(oldProject.tasks || '[]');
  const newTasks = JSON.parse(typeof newProject.tasks === 'string' ? newProject.tasks : JSON.stringify(newProject.tasks || []));
  if (JSON.stringify(oldTasks) !== JSON.stringify(newTasks)) {
    changes.push({
      action: 'TASK_CHANGE',
      changes: { oldCount: oldTasks.length, newCount: newTasks.length }
    });
  }

  // Check for reactivation (from complete/finished back to active)
  if ((oldProject.status === 'complete' && oldProject.completedDate) &&
      (newProject.status !== 'complete' || !newProject.completedDate)) {
    changes.push({
      action: 'REACTIVATE',
      changes: { oldStatus: oldProject.status }
    });
  }

  // Check other field updates (name, description, owner, team)
  const fieldsToCheck = ['name', 'description', 'owner', 'team'];
  for (const field of fieldsToCheck) {
    if (oldProject[field] !== newProject[field]) {
      changedFields[field] = { old: oldProject[field], new: newProject[field] };
    }
  }

  if (Object.keys(changedFields).length > 0) {
    changes.push({
      action: 'UPDATE',
      changes: changedFields
    });
  }

  return changes;
}

// Auth routes
app.post('/api/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, isAdmin: user.isAdmin },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, user: { id: user.id, username: user.username, isAdmin: user.isAdmin } });
});

app.get('/api/me', authenticate, (req, res) => {
  // Get full user data including email and auth_provider
  const user = db.prepare('SELECT id, username, isAdmin, email, auth_provider FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: { ...req.user, email: user?.email, auth_provider: user?.auth_provider || 'local' } });
});

// Microsoft SSO status endpoint
app.get('/api/auth/microsoft/status', (req, res) => {
  res.json({ enabled: MICROSOFT_SSO_ENABLED });
});

// Microsoft OAuth routes
if (MICROSOFT_SSO_ENABLED) {
  // Initiate Microsoft OAuth flow
  app.get('/api/auth/microsoft', passport.authenticate('azuread-openidconnect', { failureRedirect: '/?error=oauth_failed' }));

  // Microsoft OAuth callback
  app.get('/api/auth/microsoft/callback',
    passport.authenticate('azuread-openidconnect', { failureRedirect: '/?error=oauth_failed' }),
    (req, res) => {
      const { microsoftId, email } = req.user;

      if (!email) {
        return res.redirect('/?error=no_email');
      }

      // Find user by email (case-insensitive)
      const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);

      if (!user) {
        // User not pre-registered
        return res.redirect('/?error=account_not_found');
      }

      // Update microsoft_id if not set
      if (!user.microsoft_id) {
        db.prepare('UPDATE users SET microsoft_id = ?, auth_provider = ? WHERE id = ?')
          .run(microsoftId, 'microsoft', user.id);
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, username: user.username, isAdmin: user.isAdmin },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Redirect with token (frontend will extract and store it)
      res.redirect(`/?token=${token}`);
    }
  );
}

// Admin routes - user management
app.get('/api/admin/users', authenticate, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, isAdmin, email, auth_provider, createdAt FROM users').all();
  res.json(users);
});

app.post('/api/admin/users', authenticate, requireAdmin, (req, res) => {
  const { username, password, isAdmin = false, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, isAdmin, email) VALUES (?, ?, ?, ?)').run(username, hashedPassword, isAdmin ? 1 : 0, email || null);
    res.json({ id: result.lastInsertRowid, username, isAdmin, email });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user email (for Microsoft SSO linking)
app.put('/api/admin/users/:id/email', authenticate, requireAdmin, (req, res) => {
  const { email } = req.body;
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', authenticate, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

  // Delete all workspace shares where user is involved (shared with them or they shared)
  db.prepare('DELETE FROM workspace_shares WHERE userId = ? OR sharedBy = ?').run(userId, userId);
  // Delete projects
  db.prepare('DELETE FROM projects WHERE userId = ?').run(userId);
  // Delete workspaces owned by user
  db.prepare('DELETE FROM workspaces WHERE userId = ?').run(userId);
  // Delete user
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ success: true });
});

app.put('/api/admin/users/:id/password', authenticate, requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.params.id);
  res.json({ success: true });
});

// Workspace routes
app.get('/api/workspaces', authenticate, (req, res) => {
  // Get owned workspaces
  let ownedWorkspaces = db.prepare('SELECT * FROM workspaces WHERE userId = ? ORDER BY createdAt ASC').all(req.user.id);

  // Create default workspace if none exist
  if (ownedWorkspaces.length === 0) {
    const result = db.prepare('INSERT INTO workspaces (userId, name) VALUES (?, ?)').run(req.user.id, 'Default');
    ownedWorkspaces = [{ id: result.lastInsertRowid, userId: req.user.id, name: 'Default' }];
    // Assign existing projects to default workspace
    db.prepare('UPDATE projects SET workspaceId = ? WHERE userId = ? AND workspaceId IS NULL').run(result.lastInsertRowid, req.user.id);
  }

  // Get shared workspaces
  const sharedWorkspaces = db.prepare(`
    SELECT w.*, ws.permission, u.username as ownerUsername
    FROM workspace_shares ws
    JOIN workspaces w ON ws.workspaceId = w.id
    JOIN users u ON w.userId = u.id
    WHERE ws.userId = ?
    ORDER BY w.createdAt ASC
  `).all(req.user.id);

  // Add isOwner and permission fields
  const owned = ownedWorkspaces.map(w => ({ ...w, isOwner: true, permission: 'owner' }));
  const shared = sharedWorkspaces.map(w => ({ ...w, isOwner: false }));

  res.json([...owned, ...shared]);
});

app.post('/api/workspaces', authenticate, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Workspace name required' });

  const result = db.prepare('INSERT INTO workspaces (userId, name) VALUES (?, ?)').run(req.user.id, name);
  res.json({ id: result.lastInsertRowid, name, success: true });
});

app.put('/api/workspaces/:id', authenticate, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Workspace name required' });

  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

  db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ success: true });
});

app.delete('/api/workspaces/:id', authenticate, (req, res) => {
  const workspaces = db.prepare('SELECT * FROM workspaces WHERE userId = ?').all(req.user.id);
  if (workspaces.length <= 1) return res.status(400).json({ error: 'Cannot delete the only workspace' });

  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

  // Delete all projects in this workspace
  db.prepare('DELETE FROM projects WHERE workspaceId = ? AND userId = ?').run(req.params.id, req.user.id);
  // Delete all shares for this workspace
  db.prepare('DELETE FROM workspace_shares WHERE workspaceId = ?').run(req.params.id);
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get users for sharing dropdown (excludes current user)
app.get('/api/users', authenticate, (req, res) => {
  const users = db.prepare('SELECT id, username FROM users WHERE id != ? ORDER BY username').all(req.user.id);
  res.json(users);
});

// Get shares for a workspace (owner only)
app.get('/api/workspaces/:id/shares', authenticate, (req, res) => {
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found or access denied' });

  const shares = db.prepare(`
    SELECT ws.id, ws.userId, u.username, ws.permission, ws.createdAt
    FROM workspace_shares ws
    JOIN users u ON ws.userId = u.id
    WHERE ws.workspaceId = ?
    ORDER BY ws.createdAt DESC
  `).all(req.params.id);

  res.json(shares);
});

// Add a share to a workspace (owner only)
app.post('/api/workspaces/:id/shares', authenticate, (req, res) => {
  const { userId, permission } = req.body;
  if (!userId || !permission) return res.status(400).json({ error: 'userId and permission required' });
  if (!['viewer', 'editor'].includes(permission)) return res.status(400).json({ error: 'Permission must be viewer or editor' });

  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found or access denied' });

  // Check user exists
  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  // Cannot share with yourself
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot share with yourself' });

  try {
    const result = db.prepare('INSERT INTO workspace_shares (workspaceId, userId, permission, sharedBy) VALUES (?, ?, ?, ?)')
      .run(req.params.id, userId, permission, req.user.id);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Workspace already shared with this user' });
    res.status(500).json({ error: 'Failed to create share' });
  }
});

// Update share permission (owner only)
app.put('/api/workspaces/:id/shares/:shareId', authenticate, (req, res) => {
  const { permission } = req.body;
  if (!permission) return res.status(400).json({ error: 'Permission required' });
  if (!['viewer', 'editor'].includes(permission)) return res.status(400).json({ error: 'Permission must be viewer or editor' });

  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found or access denied' });

  const share = db.prepare('SELECT * FROM workspace_shares WHERE id = ? AND workspaceId = ?').get(req.params.shareId, req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  db.prepare('UPDATE workspace_shares SET permission = ? WHERE id = ?').run(permission, req.params.shareId);
  res.json({ success: true });
});

// Remove a share (owner only)
app.delete('/api/workspaces/:id/shares/:shareId', authenticate, (req, res) => {
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found or access denied' });

  const result = db.prepare('DELETE FROM workspace_shares WHERE id = ? AND workspaceId = ?').run(req.params.shareId, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Share not found' });
  res.json({ success: true });
});

// Leave a shared workspace (remove yourself from share)
app.delete('/api/workspaces/:id/leave', authenticate, (req, res) => {
  const result = db.prepare('DELETE FROM workspace_shares WHERE workspaceId = ? AND userId = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Share not found' });
  res.json({ success: true });
});

// Project routes
app.get('/api/projects', authenticate, (req, res) => {
  const workspaceId = req.query.workspaceId;
  let projects;

  if (workspaceId) {
    // Check permission for this workspace
    const permission = getWorkspacePermission(workspaceId, req.user.id);
    if (!permission) return res.status(403).json({ error: 'Access denied to this workspace' });

    // Get projects from the workspace (owned by workspace owner, not current user)
    const workspace = db.prepare('SELECT userId FROM workspaces WHERE id = ?').get(workspaceId);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    // Get native projects (projects that belong to this workspace)
    const nativeProjects = db.prepare('SELECT * FROM projects WHERE workspaceId = ? ORDER BY createdAt DESC').all(workspaceId);

    // Get linked projects (projects linked to this workspace from other workspaces)
    const linkedProjects = db.prepare(`
      SELECT p.*, pl.id as linkId, w.name as sourceWorkspaceName
      FROM project_links pl
      JOIN projects p ON pl.projectOdid = p.odid
      JOIN workspaces w ON p.workspaceId = w.id
      WHERE pl.workspaceId = ?
      ORDER BY p.createdAt DESC
    `).all(workspaceId);

    // Combine and format projects
    projects = [
      ...nativeProjects.map(p => ({
        ...p,
        tasks: JSON.parse(p.tasks || '[]'),
        notes: JSON.parse(p.notes || '[]'),
        workspacePermission: permission,
        isLinked: false
      })),
      ...linkedProjects.map(p => ({
        ...p,
        tasks: JSON.parse(p.tasks || '[]'),
        notes: JSON.parse(p.notes || '[]'),
        workspacePermission: permission,
        isLinked: true,
        sourceWorkspaceName: p.sourceWorkspaceName
      }))
    ];
  } else {
    // Get all projects from owned workspaces only
    projects = db.prepare('SELECT * FROM projects WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id);
    projects = projects.map(p => ({
      ...p,
      tasks: JSON.parse(p.tasks || '[]'),
      notes: JSON.parse(p.notes || '[]'),
      workspacePermission: 'owner',
      isLinked: false
    }));
  }

  res.json(projects);
});

app.post('/api/projects', authenticate, (req, res) => {
  const { name, description, owner, team, startDate, endDate, status, progress, tasks, notes, completedDate, workspaceId } = req.body;
  if (!name || !owner || !startDate || !endDate) return res.status(400).json({ error: 'Missing required fields' });

  // Check permission if workspaceId is provided
  if (workspaceId) {
    const permission = getWorkspacePermission(workspaceId, req.user.id);
    if (!permission) return res.status(403).json({ error: 'Access denied to this workspace' });
    if (permission === 'viewer') return res.status(403).json({ error: 'Viewers cannot create projects' });
  }

  // Get the workspace owner's userId for the project
  let projectUserId = req.user.id;
  if (workspaceId) {
    const workspace = db.prepare('SELECT userId FROM workspaces WHERE id = ?').get(workspaceId);
    if (workspace) projectUserId = workspace.userId;
  }

  const odid = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const { priority } = req.body;
  const result = db.prepare(`
    INSERT INTO projects (odid, userId, workspaceId, name, description, owner, team, startDate, endDate, status, progress, tasks, notes, completedDate, lastUpdatedBy, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(odid, projectUserId, workspaceId || null, name, description || '', owner, team || '', startDate, endDate, status || 'active', progress || 0, JSON.stringify(tasks || []), JSON.stringify(notes || []), completedDate || null, req.user.username, priority || 3);

  // Log audit trail for project creation
  logAudit(odid, req.user.id, req.user.username, 'CREATE', { name, owner, status: status || 'active' });

  res.json({ id: odid, success: true });
});

app.put('/api/projects/:id', authenticate, (req, res) => {
  // First find the project (store original for comparison)
  const oldProject = db.prepare('SELECT * FROM projects WHERE odid = ?').get(req.params.id);
  if (!oldProject) return res.status(404).json({ error: 'Project not found' });

  // Check permission
  const permission = getWorkspacePermission(oldProject.workspaceId, req.user.id);
  if (!permission) return res.status(403).json({ error: 'Access denied' });
  if (permission === 'viewer') return res.status(403).json({ error: 'Viewers cannot edit projects' });

  const { name, description, owner, team, startDate, endDate, status, progress, tasks, notes, completedDate, priority } = req.body;
  db.prepare(`
    UPDATE projects SET name = ?, description = ?, owner = ?, team = ?, startDate = ?, endDate = ?, status = ?, progress = ?, tasks = ?, notes = ?, completedDate = ?, updatedAt = CURRENT_TIMESTAMP, lastUpdatedBy = ?, priority = ?
    WHERE odid = ?
  `).run(name, description || '', owner, team || '', startDate, endDate, status, progress, JSON.stringify(tasks || []), JSON.stringify(notes || []), completedDate || null, req.user.username, priority || 3, req.params.id);

  // Detect and log changes
  const newProjectData = { name, description: description || '', owner, team: team || '', startDate, endDate, status, progress, tasks, notes, completedDate };
  const changes = detectChanges(oldProject, newProjectData);
  for (const change of changes) {
    logAudit(req.params.id, req.user.id, req.user.username, change.action, change.changes);
  }

  res.json({ success: true });
});

app.delete('/api/projects/:id', authenticate, (req, res) => {
  // First find the project
  const project = db.prepare('SELECT * FROM projects WHERE odid = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Check permission
  const permission = getWorkspacePermission(project.workspaceId, req.user.id);
  if (!permission) return res.status(403).json({ error: 'Access denied' });
  if (permission === 'viewer') return res.status(403).json({ error: 'Viewers cannot delete projects' });

  // Log audit trail before deletion
  logAudit(req.params.id, req.user.id, req.user.username, 'DELETE', { name: project.name, owner: project.owner });

  db.prepare('DELETE FROM projects WHERE odid = ?').run(req.params.id);
  res.json({ success: true });
});

// Get project audit trail
app.get('/api/projects/:id/audit', authenticate, (req, res) => {
  // First find the project to check workspace permission
  const project = db.prepare('SELECT * FROM projects WHERE odid = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Check permission (all workspace users can view audit trail)
  const permission = getWorkspacePermission(project.workspaceId, req.user.id);
  if (!permission) return res.status(403).json({ error: 'Access denied' });

  // Get audit trail entries
  const auditEntries = db.prepare(`
    SELECT * FROM project_audit
    WHERE projectOdid = ?
    ORDER BY timestamp DESC
  `).all(req.params.id);

  // Parse changes JSON
  const entries = auditEntries.map(entry => ({
    ...entry,
    changes: entry.changes ? JSON.parse(entry.changes) : null
  }));

  res.json(entries);
});

// Get workspaces a project is linked to
app.get('/api/projects/:id/links', authenticate, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE odid = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Check permission on source workspace
  const permission = getWorkspacePermission(project.workspaceId, req.user.id);
  if (!permission) return res.status(403).json({ error: 'Access denied' });

  const links = db.prepare(`
    SELECT pl.id, pl.workspaceId, w.name as workspaceName, u.username as linkedByUsername, pl.createdAt
    FROM project_links pl
    JOIN workspaces w ON pl.workspaceId = w.id
    JOIN users u ON pl.linkedBy = u.id
    WHERE pl.projectOdid = ?
    ORDER BY pl.createdAt DESC
  `).all(req.params.id);

  res.json(links);
});

// Link a project to another workspace
app.post('/api/projects/:id/link', authenticate, (req, res) => {
  const { workspaceId } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'Target workspaceId required' });

  const project = db.prepare('SELECT * FROM projects WHERE odid = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Check permission on source workspace (need at least viewer to see project)
  const sourcePermission = getWorkspacePermission(project.workspaceId, req.user.id);
  if (!sourcePermission) return res.status(403).json({ error: 'Access denied to source project' });

  // Check permission on target workspace (need editor or owner to link)
  const targetPermission = getWorkspacePermission(workspaceId, req.user.id);
  if (!targetPermission) return res.status(403).json({ error: 'Access denied to target workspace' });
  if (targetPermission === 'viewer') return res.status(403).json({ error: 'Viewers cannot link projects to workspace' });

  // Cannot link to the same workspace
  if (project.workspaceId === parseInt(workspaceId)) {
    return res.status(400).json({ error: 'Project already belongs to this workspace' });
  }

  try {
    const result = db.prepare('INSERT INTO project_links (projectOdid, workspaceId, linkedBy) VALUES (?, ?, ?)')
      .run(req.params.id, workspaceId, req.user.id);

    // Log audit
    const targetWorkspace = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId);
    logAudit(req.params.id, req.user.id, req.user.username, 'LINK', { targetWorkspace: targetWorkspace?.name, targetWorkspaceId: workspaceId });

    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Project already linked to this workspace' });
    res.status(500).json({ error: 'Failed to link project' });
  }
});

// Unlink a project from a workspace
app.delete('/api/projects/:id/link/:workspaceId', authenticate, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE odid = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Check permission on the workspace being unlinked from (need editor or owner)
  const permission = getWorkspacePermission(req.params.workspaceId, req.user.id);
  if (!permission) return res.status(403).json({ error: 'Access denied' });
  if (permission === 'viewer') return res.status(403).json({ error: 'Viewers cannot unlink projects' });

  const result = db.prepare('DELETE FROM project_links WHERE projectOdid = ? AND workspaceId = ?')
    .run(req.params.id, req.params.workspaceId);

  if (result.changes === 0) return res.status(404).json({ error: 'Link not found' });

  // Log audit
  const targetWorkspace = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(req.params.workspaceId);
  logAudit(req.params.id, req.user.id, req.user.username, 'UNLINK', { targetWorkspace: targetWorkspace?.name, targetWorkspaceId: parseInt(req.params.workspaceId) });

  res.json({ success: true });
});

// Get workspaces available for linking (workspaces user has edit access to)
app.get('/api/workspaces/linkable', authenticate, (req, res) => {
  const excludeWorkspaceId = req.query.exclude;

  // Get owned workspaces
  let ownedWorkspaces = db.prepare('SELECT id, name FROM workspaces WHERE userId = ?').all(req.user.id);

  // Get shared workspaces with editor permission
  const sharedWorkspaces = db.prepare(`
    SELECT w.id, w.name, u.username as ownerUsername
    FROM workspace_shares ws
    JOIN workspaces w ON ws.workspaceId = w.id
    JOIN users u ON w.userId = u.id
    WHERE ws.userId = ? AND ws.permission = 'editor'
  `).all(req.user.id);

  // Combine and filter out the excluded workspace
  let linkable = [
    ...ownedWorkspaces.map(w => ({ ...w, isOwner: true })),
    ...sharedWorkspaces.map(w => ({ ...w, isOwner: false }))
  ];

  if (excludeWorkspaceId) {
    linkable = linkable.filter(w => w.id !== parseInt(excludeWorkspaceId));
  }

  res.json(linkable);
});

// Template routes

// Get templates (user's own + global templates)
app.get('/api/templates', authenticate, (req, res) => {
  // Get user's own templates
  const userTemplates = db.prepare(`
    SELECT t.*, u.username as createdByUsername
    FROM project_templates t
    JOIN users u ON t.createdBy = u.id
    WHERE t.userId = ?
    ORDER BY t.name ASC
  `).all(req.user.id);

  // Get global templates
  const globalTemplates = db.prepare(`
    SELECT t.*, u.username as createdByUsername
    FROM project_templates t
    JOIN users u ON t.createdBy = u.id
    WHERE t.isGlobal = 1
    ORDER BY t.name ASC
  `).all();

  // Parse tasks JSON
  const templates = [
    ...userTemplates.map(t => ({ ...t, tasks: JSON.parse(t.tasks || '[]'), isOwner: true })),
    ...globalTemplates.map(t => ({ ...t, tasks: JSON.parse(t.tasks || '[]'), isOwner: t.createdBy === req.user.id }))
  ];

  res.json(templates);
});

// Create a new template
app.post('/api/templates', authenticate, (req, res) => {
  const { name, description, tasks, isGlobal } = req.body;
  if (!name) return res.status(400).json({ error: 'Template name required' });

  // Only admins can create global templates
  if (isGlobal && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Only admins can create global templates' });
  }

  const result = db.prepare(`
    INSERT INTO project_templates (name, description, tasks, userId, isGlobal, createdBy)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name,
    description || '',
    JSON.stringify(tasks || []),
    isGlobal ? null : req.user.id,
    isGlobal ? 1 : 0,
    req.user.id
  );

  res.json({ id: result.lastInsertRowid, success: true });
});

// Create template from existing project
app.post('/api/templates/from-project/:projectId', authenticate, (req, res) => {
  const { name, isGlobal } = req.body;
  if (!name) return res.status(400).json({ error: 'Template name required' });

  // Only admins can create global templates
  if (isGlobal && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Only admins can create global templates' });
  }

  // Get the project
  const project = db.prepare('SELECT * FROM projects WHERE odid = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Check permission
  const permission = getWorkspacePermission(project.workspaceId, req.user.id);
  if (!permission) return res.status(403).json({ error: 'Access denied' });

  const tasks = JSON.parse(project.tasks || '[]');
  // Reset completed status for template tasks
  const templateTasks = tasks.map(t => ({ name: t.name, completed: false }));

  const result = db.prepare(`
    INSERT INTO project_templates (name, description, tasks, userId, isGlobal, createdBy)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name,
    `Created from project: ${project.name}`,
    JSON.stringify(templateTasks),
    isGlobal ? null : req.user.id,
    isGlobal ? 1 : 0,
    req.user.id
  );

  res.json({ id: result.lastInsertRowid, success: true });
});

// Update a template
app.put('/api/templates/:id', authenticate, (req, res) => {
  const template = db.prepare('SELECT * FROM project_templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  // Check ownership (user owns it or admin for global)
  const canEdit = template.userId === req.user.id || (template.isGlobal && req.user.isAdmin);
  if (!canEdit) return res.status(403).json({ error: 'Access denied' });

  const { name, description, tasks, isGlobal } = req.body;

  // Only admins can toggle global status
  if (isGlobal !== undefined && isGlobal !== !!template.isGlobal && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Only admins can change global status' });
  }

  db.prepare(`
    UPDATE project_templates
    SET name = ?, description = ?, tasks = ?, isGlobal = ?, userId = ?
    WHERE id = ?
  `).run(
    name || template.name,
    description !== undefined ? description : template.description,
    tasks ? JSON.stringify(tasks) : template.tasks,
    isGlobal ? 1 : 0,
    isGlobal ? null : (template.userId || req.user.id),
    req.params.id
  );

  res.json({ success: true });
});

// Delete a template
app.delete('/api/templates/:id', authenticate, (req, res) => {
  const template = db.prepare('SELECT * FROM project_templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  // Check ownership (user owns it or admin for global)
  const canDelete = template.userId === req.user.id || (template.isGlobal && req.user.isAdmin);
  if (!canDelete) return res.status(403).json({ error: 'Access denied' });

  db.prepare('DELETE FROM project_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Change own password
app.put('/api/me/password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.user.id);
  res.json({ success: true });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
