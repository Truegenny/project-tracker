const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

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
  res.json({ user: req.user });
});

// Admin routes - user management
app.get('/api/admin/users', authenticate, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, isAdmin, createdAt FROM users').all();
  res.json(users);
});

app.post('/api/admin/users', authenticate, requireAdmin, (req, res) => {
  const { username, password, isAdmin = false } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, isAdmin) VALUES (?, ?, ?)').run(username, hashedPassword, isAdmin ? 1 : 0);
    res.json({ id: result.lastInsertRowid, username, isAdmin });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
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

    projects = db.prepare('SELECT * FROM projects WHERE workspaceId = ? ORDER BY createdAt DESC').all(workspaceId);
    // Add workspace permission to response
    projects = projects.map(p => ({
      ...p,
      tasks: JSON.parse(p.tasks || '[]'),
      notes: JSON.parse(p.notes || '[]'),
      workspacePermission: permission
    }));
  } else {
    // Get all projects from owned workspaces only
    projects = db.prepare('SELECT * FROM projects WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id);
    projects = projects.map(p => ({
      ...p,
      tasks: JSON.parse(p.tasks || '[]'),
      notes: JSON.parse(p.notes || '[]'),
      workspacePermission: 'owner'
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
  const result = db.prepare(`
    INSERT INTO projects (odid, userId, workspaceId, name, description, owner, team, startDate, endDate, status, progress, tasks, notes, completedDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(odid, projectUserId, workspaceId || null, name, description || '', owner, team || '', startDate, endDate, status || 'active', progress || 0, JSON.stringify(tasks || []), JSON.stringify(notes || []), completedDate || null);

  res.json({ id: odid, success: true });
});

app.put('/api/projects/:id', authenticate, (req, res) => {
  // First find the project
  const project = db.prepare('SELECT * FROM projects WHERE odid = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Check permission
  const permission = getWorkspacePermission(project.workspaceId, req.user.id);
  if (!permission) return res.status(403).json({ error: 'Access denied' });
  if (permission === 'viewer') return res.status(403).json({ error: 'Viewers cannot edit projects' });

  const { name, description, owner, team, startDate, endDate, status, progress, tasks, notes, completedDate } = req.body;
  db.prepare(`
    UPDATE projects SET name = ?, description = ?, owner = ?, team = ?, startDate = ?, endDate = ?, status = ?, progress = ?, tasks = ?, notes = ?, completedDate = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE odid = ?
  `).run(name, description || '', owner, team || '', startDate, endDate, status, progress, JSON.stringify(tasks || []), JSON.stringify(notes || []), completedDate || null, req.params.id);

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

  db.prepare('DELETE FROM projects WHERE odid = ?').run(req.params.id);
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
