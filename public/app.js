// Version
const APP_VERSION = '2.2.0';

// State Management
let projects = [];
let currentView = 'overview';
let currentUser = null;
let token = localStorage.getItem('token');
let darkMode = localStorage.getItem('darkMode') === 'true';
let simpleView = localStorage.getItem('simpleView') === 'true';

// Apply dark mode on load
if (darkMode) document.body.classList.add('dark');

// API Helper
const api = async (endpoint, options = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api${endpoint}`, { ...options, headers });
    const data = await res.json();

    if (res.status === 401) {
        logout();
        throw new Error('Session expired');
    }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
};

// Auth Functions
async function login(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');

    try {
        const data = await api('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        token = data.token;
        currentUser = data.user;
        localStorage.setItem('token', token);
        await loadProjects();
        render();
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    }
}

function logout() {
    token = null;
    currentUser = null;
    projects = [];
    localStorage.removeItem('token');
    render();
}

async function checkAuth() {
    if (!token) return false;
    try {
        const data = await api('/me');
        currentUser = data.user;
        return true;
    } catch {
        logout();
        return false;
    }
}

async function loadProjects() {
    try {
        projects = await api('/projects');
        updateAllStatuses();
    } catch (err) {
        console.error('Failed to load projects:', err);
    }
}

// Utility Functions
const formatDate = (date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const daysBetween = (d1, d2) => Math.ceil((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));

const getTimelineProgress = (start, end) => {
    const today = new Date();
    const startDate = new Date(start);
    const endDate = new Date(end);
    const total = endDate - startDate;
    const elapsed = today - startDate;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
};

const getStatusColor = (status) => ({
    'on-track': 'bg-emerald-500',
    'behind': 'bg-red-500',
    'active': 'bg-blue-500',
    'on-pause': 'bg-amber-500',
    'discovery': 'bg-purple-500',
    'complete': 'bg-green-600'
}[status] || 'bg-gray-500');

const getStatusBg = (status) => ({
    'on-track': 'bg-emerald-100 text-emerald-800',
    'behind': 'bg-red-100 text-red-800',
    'active': 'bg-blue-100 text-blue-800',
    'on-pause': 'bg-amber-100 text-amber-800',
    'discovery': 'bg-purple-100 text-purple-800',
    'complete': 'bg-green-100 text-green-800'
}[status] || 'bg-gray-100 text-gray-800');

const autoUpdateStatus = (project) => {
    const isPastDue = new Date() > new Date(project.endDate);
    if (project.progress >= 100 && project.status !== 'complete') {
        project.status = 'complete';
        project.completedDate = project.completedDate || new Date().toISOString();
    } else if (project.progress < 100 && project.status === 'complete') {
        project.completedDate = null;
    } else if (isPastDue && project.status !== 'on-pause' && project.status !== 'complete') {
        project.status = 'behind';
    }
    return project;
};

const updateAllStatuses = () => {
    projects.forEach(p => autoUpdateStatus(p));
};

const isFinished = (project) => {
    if (project.status !== 'complete' || !project.completedDate) return false;
    const daysSinceComplete = daysBetween(project.completedDate, new Date());
    return daysSinceComplete >= 7;
};

const activeProjects = () => projects.filter(p => !isFinished(p));
const finishedProjects = () => projects.filter(p => isFinished(p));
const sortByBehindFirst = (arr) => [...arr].sort((a, b) => (a.status === 'behind' ? -1 : b.status === 'behind' ? 1 : 0));

// Login Page
const LoginPage = () => `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
        <div class="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
            <h1 class="text-2xl font-bold text-center mb-2">Ntiva Integration Project Tracker</h1>
            <p class="text-gray-500 text-center mb-6">Sign in to continue</p>
            <form onsubmit="login(event)" class="space-y-4">
                <div id="loginError" class="hidden p-3 bg-red-100 text-red-700 rounded-lg text-sm"></div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input type="text" id="username" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input type="password" id="password" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                </div>
                <button type="submit" class="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Sign In</button>
            </form>
        </div>
    </div>
`;

// Header Component
const Header = () => `
    <header class="bg-white shadow-sm border-b border-gray-200 no-print">
        <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <h1 class="text-2xl font-bold text-gray-900">Ntiva Integration Project Tracker <span class="text-sm font-normal text-blue-600">v${APP_VERSION}</span></h1>
            <nav class="flex gap-2 items-center">
                <button onclick="switchView('overview')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'overview' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Overview</button>
                <button onclick="switchView('finished')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'finished' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Finished</button>
                <button onclick="switchView('edit')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'edit' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Edit Projects</button>
                ${currentUser?.isAdmin ? `<button onclick="switchView('admin')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'admin' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Users</button>` : ''}
                <button onclick="exportPDF()" class="px-4 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition">Export PDF</button>
                <div class="relative">
                    <button onclick="toggleSettings()" class="px-3 py-2 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </button>
                    <div id="settingsMenu" class="hidden absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                        <div class="p-2">
                            <div class="px-3 py-2 text-xs text-gray-500 border-b mb-1">Signed in as <strong>${currentUser?.username}</strong></div>
                            <button onclick="toggleDarkMode()" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                                <span>${darkMode ? '☀️' : '🌙'}</span>
                                <span>${darkMode ? 'Light Mode' : 'Dark Mode'}</span>
                            </button>
                            <button onclick="showChangePassword()" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                                <span>🔑</span>
                                <span>Change Password</span>
                            </button>
                            <button onclick="showInfo()" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                                <span>ℹ️</span>
                                <span>About</span>
                            </button>
                            <button onclick="logout()" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                                <span>🚪</span>
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </div>
                </div>
            </nav>
        </div>
    </header>
`;

const ProjectCard = (project) => {
    const timelineProgress = getTimelineProgress(project.startDate, project.endDate);
    const daysRemaining = daysBetween(new Date(), project.endDate);
    const hasStarted = new Date() >= new Date(project.startDate);
    const pid = project.odid || project.id;

    return `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-4" data-project-id="${pid}">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-xl font-semibold text-gray-900">${project.name}</h3>
                    <p class="text-gray-500 text-sm mt-1">${project.description || ''}</p>
                </div>
                <span class="px-3 py-1 rounded-full text-sm font-medium ${getStatusBg(project.status)}">${project.status.replace('-', ' ').toUpperCase()}</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                <div><span class="text-gray-500">Owner:</span> <span class="font-medium">${project.owner}</span></div>
                <div><span class="text-gray-500">Team:</span> <span class="font-medium">${project.team || 'N/A'}</span></div>
                <div><span class="text-gray-500">Start:</span> <span class="font-medium">${formatDate(project.startDate)}</span></div>
                <div><span class="text-gray-500">End:</span> <span class="font-medium">${formatDate(project.endDate)}</span></div>
            </div>
            <div class="mb-6 pt-2">
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                    <span></span>
                    <span>${daysRemaining > 0 ? daysRemaining + ' days remaining' : 'OVERDUE'}</span>
                    <span></span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-600 font-medium w-20">${formatDate(project.startDate)}</span>
                    <div class="timeline-bar flex-1">
                        <div class="timeline-progress ${getStatusColor(project.status)}" style="width: ${timelineProgress}%"></div>
                        ${hasStarted ? `<div class="timeline-today" style="left: ${timelineProgress}%"></div>` : ''}
                    </div>
                    <span class="text-xs text-gray-600 font-medium w-20 text-right">${formatDate(project.endDate)}</span>
                </div>
            </div>
            <div class="mb-4">
                <div class="text-sm text-gray-600 mb-2 font-medium">Progress</div>
                <div class="progress-bar">
                    <div class="progress-fill ${getStatusColor(project.status)}" style="width: ${Math.max(project.progress, 8)}%">
                        <span>${project.progress}%</span>
                    </div>
                </div>
            </div>
            ${project.tasks && project.tasks.length > 0 ? `
                <div class="border-t pt-4">
                    <button onclick="toggleTasks('${pid}')" class="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                        <svg class="w-4 h-4 transition-transform" id="arrow-${pid}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                        Sub-tasks (${project.tasks.filter(t => t.completed).length}/${project.tasks.length})
                    </button>
                    <div class="dropdown-content mt-2" id="tasks-${pid}">
                        <ul class="space-y-2 pl-6">
                            ${project.tasks.map(task => `
                                <li class="flex items-center gap-2 text-sm ${task.completed ? 'text-gray-400 line-through' : 'text-gray-700'}">
                                    <span class="w-2 h-2 rounded-full ${task.completed ? 'bg-emerald-500' : 'bg-gray-300'}"></span>
                                    ${task.name}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
};

const OverviewPage = () => {
    const active = activeProjects();
    const sorted = sortByBehindFirst(active);

    const toggleHtml = `
        <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500">Detailed</span>
            <button onclick="toggleSimpleView()" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${simpleView ? 'bg-blue-600' : 'bg-gray-300'}">
                <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${simpleView ? 'translate-x-6' : 'translate-x-1'}"></span>
            </button>
            <span class="text-sm text-gray-500">Simple</span>
        </div>
    `;

    const detailedView = active.length === 0 ? `
        <div class="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p class="text-gray-500">No active projects.</p>
        </div>
    ` : active.map(ProjectCard).join('');

    const simpleTableView = sorted.length === 0 ? `
        <div class="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p class="text-gray-500">No active projects.</p>
        </div>
    ` : `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table class="w-full">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Project</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Owner</th>
                        <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                        <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Progress</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-1/3">Timeline</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${sorted.map(p => {
                        const timelinePos = getTimelineProgress(p.startDate, p.endDate);
                        const started = new Date() >= new Date(p.startDate);
                        return `
                        <tr class="${p.status === 'behind' ? 'bg-red-50' : ''}">
                            <td class="px-4 py-3 font-medium text-gray-900">${p.name}</td>
                            <td class="px-4 py-3 text-sm text-gray-600">${p.owner}</td>
                            <td class="px-4 py-3 text-center"><span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusBg(p.status)}">${p.status.replace('-', ' ')}</span></td>
                            <td class="px-4 py-3">
                                <div class="progress-bar h-6">
                                    <div class="progress-fill ${getStatusColor(p.status)}" style="width: ${Math.max(p.progress, 12)}%">
                                        <span>${p.progress}%</span>
                                    </div>
                                </div>
                            </td>
                            <td class="px-4 py-3">
                                <div class="flex items-center gap-2 text-xs text-gray-600 font-medium">
                                    <span class="w-16">${formatDate(p.startDate).split(',')[0]}</span>
                                    <div class="flex-1 h-5 bg-gray-100 border border-gray-300 relative">
                                        <div class="${getStatusColor(p.status)} h-full opacity-30" style="width: ${timelinePos}%"></div>
                                        ${started ? `<div class="absolute top-0 bottom-0 w-0.5 bg-red-600" style="left: ${timelinePos}%"></div>` : ''}
                                    </div>
                                    <span class="w-16 text-right">${formatDate(p.endDate).split(',')[0]}</span>
                                </div>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    return `
    <div id="export-content" class="max-w-7xl mx-auto px-4 py-8">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-semibold text-gray-900">Project Overview</h2>
            <div class="flex items-center gap-4">
                ${toggleHtml}
                <p class="text-gray-500 text-sm">${new Date().toLocaleString()}</p>
            </div>
        </div>
        ${simpleView ? simpleTableView : detailedView}
    </div>`;
};

const FinishedPage = () => {
    const finished = finishedProjects();
    return `
    <div id="export-content" class="max-w-7xl mx-auto px-4 py-8">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-semibold text-gray-900">Finished Projects</h2>
            <p class="text-gray-500 text-sm">${finished.length} completed</p>
        </div>
        ${finished.length === 0 ? `
            <div class="text-center py-12 bg-white rounded-xl border border-gray-200">
                <p class="text-gray-500">No finished projects yet. Projects move here 7 days after completion.</p>
            </div>
        ` : `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table class="w-full">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Project</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Owner</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Completed</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Duration</th>
                        <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${finished.map(p => `
                        <tr>
                            <td class="px-4 py-3 font-medium text-gray-900">${p.name}</td>
                            <td class="px-4 py-3 text-sm text-gray-600">${p.owner}</td>
                            <td class="px-4 py-3 text-sm text-gray-600">${formatDate(p.completedDate)}</td>
                            <td class="px-4 py-3 text-sm text-gray-600">${daysBetween(p.startDate, p.endDate)} days</td>
                            <td class="px-4 py-3 text-right">
                                <button onclick="reactivateProject('${p.odid}')" class="text-emerald-600 hover:text-emerald-800 text-sm font-medium mr-2">Reactivate</button>
                                <button onclick="openProjectModal('${p.odid}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`}
    </div>`;
};

const EditPage = () => `
    <div class="max-w-7xl mx-auto px-4 py-8">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-semibold text-gray-900">Manage Projects</h2>
            <button onclick="openProjectModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">+ Add Project</button>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table class="w-full">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Project</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Owner</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Progress</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Dates</th>
                        <th class="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${projects.length === 0 ? `
                        <tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">No projects. Click "Add Project" to create one.</td></tr>
                    ` : projects.map(p => `
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3">
                                <div class="font-medium text-gray-900">${p.name}</div>
                                <div class="text-sm text-gray-500">${p.tasks?.length || 0} tasks</div>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-700">${p.owner}</td>
                            <td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusBg(p.status)}">${p.status.replace('-', ' ')}</span></td>
                            <td class="px-4 py-3">
                                <div class="progress-bar h-5">
                                    <div class="progress-fill ${getStatusColor(p.status)}" style="width: ${Math.max(p.progress, 15)}%">
                                        <span class="text-xs">${p.progress}%</span>
                                    </div>
                                </div>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-700">${formatDate(p.startDate)} - ${formatDate(p.endDate)}</td>
                            <td class="px-4 py-3 text-right">
                                <button onclick="openProjectModal('${p.odid}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium mr-2">Edit</button>
                                <button onclick="deleteProject('${p.odid}')" class="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
`;

const AdminPage = () => `
    <div class="max-w-4xl mx-auto px-4 py-8">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-semibold text-gray-900">User Management</h2>
            <button onclick="showAddUser()" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">+ Add User</button>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table class="w-full">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Username</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Role</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Created</th>
                        <th class="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
                    </tr>
                </thead>
                <tbody id="usersList" class="divide-y divide-gray-200">
                    <tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    </div>
`;

async function loadUsers() {
    try {
        const users = await api('/admin/users');
        document.getElementById('usersList').innerHTML = users.map(u => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-900">${u.username}</td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-xs font-medium ${u.isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}">${u.isAdmin ? 'Admin' : 'User'}</span></td>
                <td class="px-4 py-3 text-sm text-gray-500">${formatDate(u.createdAt)}</td>
                <td class="px-4 py-3 text-right">
                    <button onclick="resetPassword(${u.id}, '${u.username}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium mr-2">Reset Password</button>
                    ${u.id !== currentUser.id ? `<button onclick="deleteUser(${u.id}, '${u.username}')" class="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>` : ''}
                </td>
            </tr>
        `).join('');
    } catch (err) {
        document.getElementById('usersList').innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-red-500">${err.message}</td></tr>`;
    }
}

const ProjectModal = (project = null) => `
    <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
        <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b border-gray-200">
                <h3 class="text-lg font-semibold">${project ? 'Edit Project' : 'New Project'}</h3>
            </div>
            <form onsubmit="saveProject(event)" class="p-6 space-y-4">
                <input type="hidden" id="projectId" value="${project?.odid || ''}">
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
                        <input type="text" id="projectName" value="${project?.name || ''}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea id="projectDesc" rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">${project?.description || ''}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Owner *</label>
                        <input type="text" id="projectOwner" value="${project?.owner || ''}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Support Team</label>
                        <input type="text" id="projectTeam" value="${project?.team || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                        <input type="date" id="projectStart" value="${project?.startDate || ''}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                        <input type="date" id="projectEnd" value="${project?.endDate || ''}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select id="projectStatus" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            <option value="discovery" ${project?.status === 'discovery' ? 'selected' : ''}>Discovery</option>
                            <option value="active" ${project?.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="on-track" ${project?.status === 'on-track' ? 'selected' : ''}>On Track</option>
                            <option value="behind" ${project?.status === 'behind' ? 'selected' : ''}>Behind</option>
                            <option value="on-pause" ${project?.status === 'on-pause' ? 'selected' : ''}>On Pause</option>
                            <option value="complete" ${project?.status === 'complete' ? 'selected' : ''}>Complete</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Progress (%)</label>
                        <input type="number" id="projectProgress" min="0" max="100" value="${project?.progress || 0}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>
                <div class="flex items-center gap-2 pt-2">
                    <input type="checkbox" id="forceFinish" ${project && isFinished(project) ? 'checked' : ''} class="rounded">
                    <label for="forceFinish" class="text-sm text-gray-700">Move to Finished tab</label>
                </div>
                <div class="border-t pt-4 mt-4">
                    <div class="flex justify-between items-center mb-2">
                        <label class="text-sm font-medium text-gray-700">Sub-tasks</label>
                        <button type="button" onclick="addTaskField()" class="text-sm text-blue-600 hover:text-blue-800">+ Add Task</button>
                    </div>
                    <div id="tasksList" class="space-y-2">
                        ${(project?.tasks || []).map(t => `
                            <div class="flex gap-2 items-center task-row">
                                <input type="checkbox" ${t.completed ? 'checked' : ''} class="task-completed rounded">
                                <input type="text" value="${t.name}" class="task-name flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 px-2">×</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onclick="closeModal()" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Project</button>
                </div>
            </form>
        </div>
    </div>
`;

// Functions
function render() {
    if (!currentUser) {
        document.getElementById('app').innerHTML = LoginPage();
        return;
    }
    updateAllStatuses();
    const pages = { overview: OverviewPage, edit: EditPage, finished: FinishedPage, admin: AdminPage };
    document.getElementById('app').innerHTML = Header() + (pages[currentView] || OverviewPage)();
    if (currentView === 'admin') loadUsers();
}

function switchView(view) {
    currentView = view;
    render();
}

function toggleDarkMode() {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode);
    document.body.classList.toggle('dark', darkMode);
    closeSettings();
    render();
}

function toggleSimpleView() {
    simpleView = !simpleView;
    localStorage.setItem('simpleView', simpleView);
    render();
}

function toggleSettings() {
    document.getElementById('settingsMenu')?.classList.toggle('hidden');
}

function closeSettings() {
    document.getElementById('settingsMenu')?.classList.add('hidden');
}

function toggleTasks(projectId) {
    const content = document.getElementById(`tasks-${projectId}`);
    const arrow = document.getElementById(`arrow-${projectId}`);
    if (content) content.classList.toggle('open');
    if (arrow) arrow.style.transform = content?.classList.contains('open') ? 'rotate(180deg)' : '';
}

function openProjectModal(projectId = null) {
    const project = projectId ? projects.find(p => p.odid === projectId) : null;
    document.body.insertAdjacentHTML('beforeend', ProjectModal(project));
}

function closeModal() {
    document.getElementById('modal')?.remove();
}

function addTaskField() {
    document.getElementById('tasksList').insertAdjacentHTML('beforeend', `
        <div class="flex gap-2 items-center task-row">
            <input type="checkbox" class="task-completed rounded">
            <input type="text" class="task-name flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Task name">
            <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 px-2">×</button>
        </div>
    `);
}

async function saveProject(e) {
    e.preventDefault();
    const id = document.getElementById('projectId').value;
    const tasks = Array.from(document.querySelectorAll('.task-row')).map(row => ({
        name: row.querySelector('.task-name').value,
        completed: row.querySelector('.task-completed').checked
    })).filter(t => t.name.trim());

    const forceFinish = document.getElementById('forceFinish').checked;
    const existingProject = id ? projects.find(p => p.odid === id) : null;

    const projectData = {
        name: document.getElementById('projectName').value,
        description: document.getElementById('projectDesc').value,
        owner: document.getElementById('projectOwner').value,
        team: document.getElementById('projectTeam').value,
        startDate: document.getElementById('projectStart').value,
        endDate: document.getElementById('projectEnd').value,
        status: forceFinish ? 'complete' : document.getElementById('projectStatus').value,
        progress: forceFinish ? 100 : (parseInt(document.getElementById('projectProgress').value) || 0),
        completedDate: forceFinish ? new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() : null,
        tasks
    };

    try {
        if (id) {
            await api(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(projectData) });
        } else {
            await api('/projects', { method: 'POST', body: JSON.stringify(projectData) });
        }
        await loadProjects();
        closeModal();
        render();
    } catch (err) {
        alert('Error saving project: ' + err.message);
    }
}

async function deleteProject(id) {
    if (confirm('Delete this project?')) {
        try {
            await api(`/projects/${id}`, { method: 'DELETE' });
            await loadProjects();
            render();
        } catch (err) {
            alert('Error deleting project: ' + err.message);
        }
    }
}

async function reactivateProject(id) {
    const project = projects.find(p => p.odid === id);
    if (!project) return;

    if (confirm(`Reactivate "${project.name}" and move it back to Overview?`)) {
        try {
            await api(`/projects/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    ...project,
                    status: 'active',
                    completedDate: null,
                    progress: project.progress >= 100 ? 90 : project.progress
                })
            });
            await loadProjects();
            render();
        } catch (err) {
            alert('Error reactivating project: ' + err.message);
        }
    }
}

function showAddUser() {
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
                <div class="p-6 border-b border-gray-200"><h3 class="text-lg font-semibold">Add User</h3></div>
                <form onsubmit="createUser(event)" class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                        <input type="text" id="newUsername" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Password (min 6 chars)</label>
                        <input type="password" id="newPassword" required minlength="6" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="newIsAdmin" class="rounded">
                        <label for="newIsAdmin" class="text-sm text-gray-700">Admin privileges</label>
                    </div>
                    <div class="flex justify-end gap-3 pt-4">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Create User</button>
                    </div>
                </form>
            </div>
        </div>
    `);
}

async function createUser(e) {
    e.preventDefault();
    try {
        await api('/admin/users', {
            method: 'POST',
            body: JSON.stringify({
                username: document.getElementById('newUsername').value,
                password: document.getElementById('newPassword').value,
                isAdmin: document.getElementById('newIsAdmin').checked
            })
        });
        closeModal();
        loadUsers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function resetPassword(userId, username) {
    const newPassword = prompt(`Enter new password for ${username} (min 6 characters):`);
    if (!newPassword) return;
    if (newPassword.length < 6) { alert('Password must be at least 6 characters'); return; }
    try {
        await api(`/admin/users/${userId}/password`, { method: 'PUT', body: JSON.stringify({ password: newPassword }) });
        alert('Password reset successfully');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteUser(userId, username) {
    if (confirm(`Delete user "${username}"? This will also delete all their projects.`)) {
        try {
            await api(`/admin/users/${userId}`, { method: 'DELETE' });
            loadUsers();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }
}

function showChangePassword() {
    closeSettings();
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
                <div class="p-6 border-b border-gray-200"><h3 class="text-lg font-semibold">Change Password</h3></div>
                <form onsubmit="changePassword(event)" class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                        <input type="password" id="currentPwd" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">New Password (min 6 chars)</label>
                        <input type="password" id="newPwd" required minlength="6" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div class="flex justify-end gap-3 pt-4">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Update Password</button>
                    </div>
                </form>
            </div>
        </div>
    `);
}

async function changePassword(e) {
    e.preventDefault();
    try {
        await api('/me/password', {
            method: 'PUT',
            body: JSON.stringify({
                currentPassword: document.getElementById('currentPwd').value,
                newPassword: document.getElementById('newPwd').value
            })
        });
        alert('Password updated successfully');
        closeModal();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function showInfo() {
    closeSettings();
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div class="p-6 border-b border-gray-200"><h3 class="text-lg font-semibold">About Ntiva Integration Project Tracker</h3></div>
                <div class="p-6 space-y-4 text-sm text-gray-600">
                    <p><strong>Purpose:</strong> Track and manage integration projects with clear timelines, progress tracking, and status visibility for executive reporting.</p>
                    <p><strong>How to Use:</strong></p>
                    <ul class="list-disc pl-5 space-y-1">
                        <li><strong>Simple View:</strong> Quick overview with projects sorted by priority</li>
                        <li><strong>Overview:</strong> Detailed project cards with timelines and sub-tasks</li>
                        <li><strong>Finished:</strong> Archived completed projects (auto-moves after 7 days)</li>
                        <li><strong>Edit Projects:</strong> Add, modify, or remove projects</li>
                        <li><strong>Export PDF:</strong> Generate reports for executive review</li>
                    </ul>
                    <div class="pt-4 border-t">
                        <p class="font-semibold text-gray-700 mb-2">Changelog</p>
                        <div class="space-y-3 text-xs">
                            <div>
                                <p class="font-medium text-gray-800">v2.2.0 <span class="text-gray-400">- Feb 3, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Combined Simple/Overview into single tab with toggle</li>
                                    <li>Toggle preference saved to localStorage</li>
                                    <li>Cleaner navigation with fewer tabs</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.1.0 <span class="text-gray-400">- Feb 3, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Added version number display in header</li>
                                    <li>Added changelog to About modal</li>
                                    <li>Added Reactivate button for finished projects</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.0.0 <span class="text-gray-400">- Feb 3, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Complete backend rewrite with authentication</li>
                                    <li>SQLite database for persistent storage</li>
                                    <li>User management admin panel</li>
                                    <li>JWT-based secure login</li>
                                    <li>Per-user project isolation</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v1.0.0 <span class="text-gray-400">- Initial Release</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Project tracking with timelines</li>
                                    <li>Status auto-updates</li>
                                    <li>Dark mode support</li>
                                    <li>PDF export</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="pt-4 border-t text-xs text-gray-400">
                        <p>Designed by Justin Cronin | Built with Claude AI</p>
                        <p>Version ${APP_VERSION} | Data stored securely on server</p>
                    </div>
                </div>
                <div class="p-4 border-t flex justify-end">
                    <button onclick="closeModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Close</button>
                </div>
            </div>
        </div>
    `);
}

async function exportPDF() {
    const { jsPDF } = window.jspdf;
    const content = document.getElementById('export-content');
    if (!content) { alert('Switch to Simple or Overview to export'); return; }
    document.querySelectorAll('.dropdown-content').forEach(el => el.classList.add('open'));
    const canvas = await html2canvas(content, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    let position = 0;
    const pageHeight = pdf.internal.pageSize.getHeight();
    while (position < pdfHeight) {
        if (position > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -position, pdfWidth, pdfHeight);
        position += pageHeight;
    }
    pdf.save(`project-overview-${new Date().toISOString().split('T')[0]}.pdf`);
    document.querySelectorAll('.dropdown-content').forEach(el => el.classList.remove('open'));
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('settingsMenu');
    if (menu && !e.target.closest('.relative')) closeSettings();
});

// Initialize
(async () => {
    if (await checkAuth()) {
        await loadProjects();
    }
    render();
})();
