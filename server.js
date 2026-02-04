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

  db.prepare('DELETE FROM projects WHERE userId = ?').run(userId);
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
  let workspaces = db.prepare('SELECT * FROM workspaces WHERE userId = ? ORDER BY createdAt ASC').all(req.user.id);

  // Create default workspace if none exist
  if (workspaces.length === 0) {
    const result = db.prepare('INSERT INTO workspaces (userId, name) VALUES (?, ?)').run(req.user.id, 'Default');
    workspaces = [{ id: result.lastInsertRowid, userId: req.user.id, name: 'Default' }];
    // Assign existing projects to default workspace
    db.prepare('UPDATE projects SET workspaceId = ? WHERE userId = ? AND workspaceId IS NULL').run(result.lastInsertRowid, req.user.id);
  }

  res.json(workspaces);
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
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Project routes
app.get('/api/projects', authenticate, (req, res) => {
  const workspaceId = req.query.workspaceId;
  let projects;

  if (workspaceId) {
    projects = db.prepare('SELECT * FROM projects WHERE userId = ? AND workspaceId = ? ORDER BY createdAt DESC').all(req.user.id, workspaceId);
  } else {
    projects = db.prepare('SELECT * FROM projects WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id);
  }

  res.json(projects.map(p => ({ ...p, tasks: JSON.parse(p.tasks || '[]') })));
});

app.post('/api/projects', authenticate, (req, res) => {
  const { name, description, owner, team, startDate, endDate, status, progress, tasks, completedDate, workspaceId } = req.body;
  if (!name || !owner || !startDate || !endDate) return res.status(400).json({ error: 'Missing required fields' });

  const odid = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const result = db.prepare(`
    INSERT INTO projects (odid, userId, workspaceId, name, description, owner, team, startDate, endDate, status, progress, tasks, completedDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(odid, req.user.id, workspaceId || null, name, description || '', owner, team || '', startDate, endDate, status || 'active', progress || 0, JSON.stringify(tasks || []), completedDate || null);

  res.json({ id: odid, success: true });
});

app.put('/api/projects/:id', authenticate, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE odid = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, description, owner, team, startDate, endDate, status, progress, tasks, completedDate } = req.body;
  db.prepare(`
    UPDATE projects SET name = ?, description = ?, owner = ?, team = ?, startDate = ?, endDate = ?, status = ?, progress = ?, tasks = ?, completedDate = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE odid = ? AND userId = ?
  `).run(name, description || '', owner, team || '', startDate, endDate, status, progress, JSON.stringify(tasks || []), completedDate || null, req.params.id, req.user.id);

  res.json({ success: true });
});

app.delete('/api/projects/:id', authenticate, (req, res) => {
  const result = db.prepare('DELETE FROM projects WHERE odid = ? AND userId = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Project not found' });
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
