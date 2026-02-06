// Version
const APP_VERSION = '2.15.0';

// State Management
let projects = [];
let workspaces = [];
let currentWorkspace = null;
let currentView = 'overview';
let currentUser = null;
let token = localStorage.getItem('token');
let darkMode = localStorage.getItem('darkMode') === 'true';
let simpleView = localStorage.getItem('simpleView') === 'true';
let sortBy = localStorage.getItem('sortBy') || 'status';
let demoMode = false;
let allUsers = [];  // For share dropdown
let templates = []; // For project templates
let microsoftSSOEnabled = false; // Microsoft SSO availability

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
        await loadWorkspaces();
        await loadProjects();
        await loadTemplates();
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
    workspaces = [];
    currentWorkspace = null;
    localStorage.removeItem('token');
    localStorage.removeItem('currentWorkspaceId');
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

// Check Microsoft SSO availability
async function checkMicrosoftSSO() {
    try {
        const res = await fetch('/api/auth/microsoft/status');
        const data = await res.json();
        microsoftSSOEnabled = data.enabled;
    } catch {
        microsoftSSOEnabled = false;
    }
}

// Handle OAuth callback token from URL
function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const error = params.get('error');

    // Clear URL parameters
    if (urlToken || error) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (urlToken) {
        token = urlToken;
        localStorage.setItem('token', token);
        return true;
    }

    if (error) {
        // Show error message on login page
        setTimeout(() => {
            const errorEl = document.getElementById('loginError');
            if (errorEl) {
                const messages = {
                    'account_not_found': 'No account found with this email. Please contact your administrator.',
                    'oauth_failed': 'Microsoft sign-in failed. Please try again.',
                    'no_email': 'Could not retrieve email from Microsoft. Please try again.'
                };
                errorEl.textContent = messages[error] || 'Sign-in failed. Please try again.';
                errorEl.classList.remove('hidden');
            }
        }, 100);
    }

    return false;
}

// Initiate Microsoft sign-in
function loginWithMicrosoft() {
    window.location.href = '/api/auth/microsoft';
}

async function loadWorkspaces() {
    try {
        workspaces = await api('/workspaces');
        // Always reset currentWorkspace to ensure it belongs to current user
        const savedWorkspaceId = localStorage.getItem('currentWorkspaceId');
        currentWorkspace = workspaces.find(w => w.id == savedWorkspaceId) || workspaces[0] || null;
        if (currentWorkspace) {
            localStorage.setItem('currentWorkspaceId', currentWorkspace.id);
        }
    } catch (err) {
        console.error('Failed to load workspaces:', err);
    }
}

async function loadProjects() {
    try {
        const endpoint = currentWorkspace ? `/projects?workspaceId=${currentWorkspace.id}` : '/projects';
        projects = await api(endpoint);
        updateAllStatuses();
        demoMode = projects.some(p => p.name.startsWith('[DEMO]'));
    } catch (err) {
        console.error('Failed to load projects:', err);
    }
}

// Permission helpers
function canEditWorkspace() {
    if (!currentWorkspace) return false;
    return currentWorkspace.permission === 'owner' || currentWorkspace.permission === 'editor';
}

function isWorkspaceOwner() {
    if (!currentWorkspace) return false;
    return currentWorkspace.isOwner === true || currentWorkspace.permission === 'owner';
}

// Share management functions
async function loadShareableUsers() {
    try {
        allUsers = await api('/users');
    } catch (err) {
        console.error('Failed to load users:', err);
        allUsers = [];
    }
}

async function loadWorkspaceShares(workspaceId) {
    try {
        return await api(`/workspaces/${workspaceId}/shares`);
    } catch (err) {
        console.error('Failed to load shares:', err);
        return [];
    }
}

async function addWorkspaceShare(workspaceId, userId, permission) {
    try {
        await api(`/workspaces/${workspaceId}/shares`, {
            method: 'POST',
            body: JSON.stringify({ userId, permission })
        });
        return true;
    } catch (err) {
        alert('Error: ' + err.message);
        return false;
    }
}

async function updateWorkspaceShare(workspaceId, shareId, permission) {
    try {
        await api(`/workspaces/${workspaceId}/shares/${shareId}`, {
            method: 'PUT',
            body: JSON.stringify({ permission })
        });
        return true;
    } catch (err) {
        alert('Error: ' + err.message);
        return false;
    }
}

async function removeWorkspaceShare(workspaceId, shareId) {
    try {
        await api(`/workspaces/${workspaceId}/shares/${shareId}`, { method: 'DELETE' });
        return true;
    } catch (err) {
        alert('Error: ' + err.message);
        return false;
    }
}

async function leaveWorkspace(workspaceId) {
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (!confirm(`Leave workspace "${workspace?.name}"? You will no longer have access to its projects.`)) return;

    try {
        await api(`/workspaces/${workspaceId}/leave`, { method: 'DELETE' });
        await loadWorkspaces();
        // Switch to first owned workspace if we left the current one
        if (currentWorkspace?.id === workspaceId) {
            const ownedWorkspace = workspaces.find(w => w.isOwner);
            if (ownedWorkspace) {
                currentWorkspace = ownedWorkspace;
                localStorage.setItem('currentWorkspaceId', ownedWorkspace.id);
            }
        }
        await loadProjects();
        render();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// Audit Trail Functions
async function loadProjectAudit(projectOdid) {
    try {
        return await api(`/projects/${projectOdid}/audit`);
    } catch (err) {
        console.error('Failed to load audit trail:', err);
        return [];
    }
}

function getActionColor(action) {
    const colors = {
        'CREATE': 'bg-green-100 text-green-800',
        'UPDATE': 'bg-blue-100 text-blue-800',
        'STATUS_CHANGE': 'bg-orange-100 text-orange-800',
        'PROGRESS_UPDATE': 'bg-cyan-100 text-cyan-800',
        'TIMELINE_CHANGE': 'bg-purple-100 text-purple-800',
        'NOTE_ADDED': 'bg-indigo-100 text-indigo-800',
        'TASK_CHANGE': 'bg-yellow-100 text-yellow-800',
        'DELETE': 'bg-red-100 text-red-800',
        'REACTIVATE': 'bg-emerald-100 text-emerald-800',
        'LINK': 'bg-fuchsia-100 text-fuchsia-800',
        'UNLINK': 'bg-pink-100 text-pink-800'
    };
    return colors[action] || 'bg-gray-100 text-gray-800';
}

function formatAuditEntry(entry) {
    const date = new Date(entry.timestamp);
    const formattedDate = date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
    });

    let description = '';
    const changes = entry.changes;

    switch (entry.action) {
        case 'CREATE':
            description = 'created project';
            break;
        case 'UPDATE':
            const fields = Object.keys(changes || {}).join(', ');
            description = `updated ${fields}`;
            break;
        case 'STATUS_CHANGE':
            description = `changed status: ${changes?.old} → ${changes?.new}`;
            break;
        case 'PROGRESS_UPDATE':
            description = `updated progress: ${changes?.old}% → ${changes?.new}%`;
            break;
        case 'TIMELINE_CHANGE':
            const oldStart = changes?.old?.startDate || 'N/A';
            const oldEnd = changes?.old?.endDate || 'N/A';
            const newStart = changes?.new?.startDate || 'N/A';
            const newEnd = changes?.new?.endDate || 'N/A';
            if (oldStart !== newStart && oldEnd !== newEnd) {
                description = `changed timeline: ${oldStart} - ${oldEnd} → ${newStart} - ${newEnd}`;
            } else if (oldStart !== newStart) {
                description = `changed start date: ${oldStart} → ${newStart}`;
            } else {
                description = `changed end date: ${oldEnd} → ${newEnd}`;
            }
            break;
        case 'NOTE_ADDED':
            const count = changes?.count || 1;
            description = count > 1 ? `added ${count} notes` : 'added note';
            break;
        case 'TASK_CHANGE':
            description = 'modified tasks';
            break;
        case 'DELETE':
            description = 'deleted project';
            break;
        case 'REACTIVATE':
            description = 'reactivated project';
            break;
        case 'LINK':
            description = `synced to workspace "${changes?.targetWorkspace || 'Unknown'}"`;
            break;
        case 'UNLINK':
            description = `unsynced from workspace "${changes?.targetWorkspace || 'Unknown'}"`;
            break;
        default:
            description = entry.action.toLowerCase().replace('_', ' ');
    }

    return `
        <div class="border-b border-gray-100 last:border-0 py-3">
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1">
                    <div class="text-xs text-gray-400 mb-1">${formattedDate}</div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${getActionColor(entry.action)}">${entry.action.replace('_', ' ')}</span>
                        <span class="text-sm text-gray-700"><strong>${entry.username}</strong> ${description}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Project Linking Functions
async function loadLinkableWorkspaces(excludeWorkspaceId) {
    try {
        return await api(`/workspaces/linkable?exclude=${excludeWorkspaceId || ''}`);
    } catch (err) {
        console.error('Failed to load linkable workspaces:', err);
        return [];
    }
}

async function loadProjectLinks(projectOdid) {
    try {
        return await api(`/projects/${projectOdid}/links`);
    } catch (err) {
        console.error('Failed to load project links:', err);
        return [];
    }
}

async function linkProject(projectOdid, targetWorkspaceId) {
    try {
        await api(`/projects/${projectOdid}/link`, {
            method: 'POST',
            body: JSON.stringify({ workspaceId: targetWorkspaceId })
        });
        return true;
    } catch (err) {
        alert('Error: ' + err.message);
        return false;
    }
}

async function unlinkProject(projectOdid, workspaceId) {
    try {
        await api(`/projects/${projectOdid}/link/${workspaceId}`, { method: 'DELETE' });
        return true;
    } catch (err) {
        alert('Error: ' + err.message);
        return false;
    }
}

async function showLinkModal(projectOdid) {
    const project = projects.find(p => p.odid === projectOdid);
    if (!project) return;

    // Show loading modal
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex items-center gap-2">
                        <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                        <h3 class="text-lg font-semibold">Sync Project: ${project.name}</h3>
                    </div>
                    <p class="text-sm text-gray-500 mt-1">Link this project to other workspaces for collaboration</p>
                </div>
                <div id="linkModalContent" class="p-6">
                    <div class="flex justify-center py-8">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    </div>
                </div>
                <div class="p-4 border-t flex justify-end">
                    <button onclick="closeModal()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Done</button>
                </div>
            </div>
        </div>
    `);

    // Load data
    const [linkableWorkspaces, existingLinks] = await Promise.all([
        loadLinkableWorkspaces(project.workspaceId),
        loadProjectLinks(projectOdid)
    ]);

    const linkedWorkspaceIds = existingLinks.map(l => l.workspaceId);
    const availableWorkspaces = linkableWorkspaces.filter(w => !linkedWorkspaceIds.includes(w.id));

    const contentEl = document.getElementById('linkModalContent');
    contentEl.innerHTML = `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Link to Workspace</label>
                <div class="flex gap-2">
                    <select id="linkWorkspaceSelect" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                        <option value="">Select workspace...</option>
                        ${availableWorkspaces.map(w => `
                            <option value="${w.id}">${w.name}${w.isOwner ? '' : ` (${w.ownerUsername})`}</option>
                        `).join('')}
                    </select>
                    <button onclick="handleLinkProject('${projectOdid}')" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                    </button>
                </div>
                ${availableWorkspaces.length === 0 ? '<p class="text-xs text-gray-400 mt-1">No additional workspaces available to link</p>' : ''}
            </div>
            <div class="border-t pt-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">Currently Synced To</label>
                <div id="linkedWorkspacesList" class="space-y-2">
                    ${existingLinks.length === 0 ? `
                        <p class="text-sm text-gray-500 italic">Not synced to any other workspaces</p>
                    ` : existingLinks.map(link => `
                        <div class="flex items-center justify-between p-3 bg-purple-50 rounded-lg" data-link-workspace="${link.workspaceId}">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                                <span class="font-medium text-gray-700">${link.workspaceName}</span>
                            </div>
                            <button onclick="handleUnlinkProject('${projectOdid}', ${link.workspaceId})" class="text-red-500 hover:text-red-700 text-sm">Unlink</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

async function handleLinkProject(projectOdid) {
    const workspaceId = document.getElementById('linkWorkspaceSelect').value;
    if (!workspaceId) { alert('Please select a workspace'); return; }

    const success = await linkProject(projectOdid, parseInt(workspaceId));
    if (success) {
        closeModal();
        showLinkModal(projectOdid); // Refresh modal
    }
}

async function handleUnlinkProject(projectOdid, workspaceId) {
    if (!confirm('Unlink this project from the workspace?')) return;

    const success = await unlinkProject(projectOdid, workspaceId);
    if (success) {
        // Remove from UI
        document.querySelector(`[data-link-workspace="${workspaceId}"]`)?.remove();
        // Check if list is empty
        const list = document.getElementById('linkedWorkspacesList');
        if (list && !list.querySelector('[data-link-workspace]')) {
            list.innerHTML = '<p class="text-sm text-gray-500 italic">Not synced to any other workspaces</p>';
        }
        // Reload projects if we're viewing the workspace it was unlinked from
        if (currentWorkspace?.id === workspaceId) {
            await loadProjects();
            render();
        }
    }
}

// Template Functions
async function loadTemplates() {
    try {
        templates = await api('/templates');
    } catch (err) {
        console.error('Failed to load templates:', err);
        templates = [];
    }
}

async function createTemplate(name, description, tasks, isGlobal = false) {
    try {
        await api('/templates', {
            method: 'POST',
            body: JSON.stringify({ name, description, tasks, isGlobal })
        });
        await loadTemplates();
        return true;
    } catch (err) {
        alert('Error: ' + err.message);
        return false;
    }
}

async function createTemplateFromProject(projectOdid, name, isGlobal = false) {
    try {
        await api(`/templates/from-project/${projectOdid}`, {
            method: 'POST',
            body: JSON.stringify({ name, isGlobal })
        });
        await loadTemplates();
        return true;
    } catch (err) {
        alert('Error: ' + err.message);
        return false;
    }
}

async function deleteTemplate(templateId) {
    try {
        await api(`/templates/${templateId}`, { method: 'DELETE' });
        await loadTemplates();
        return true;
    } catch (err) {
        alert('Error: ' + err.message);
        return false;
    }
}

function applyTemplate(templateId) {
    const template = templates.find(t => t.id === parseInt(templateId));
    if (!template) return;

    // Apply template tasks to the form
    const tasksList = document.getElementById('tasksList');
    if (tasksList) {
        // Clear existing tasks
        tasksList.innerHTML = '';
        // Add template tasks
        template.tasks.forEach(task => {
            tasksList.insertAdjacentHTML('beforeend', `
                <div class="flex gap-2 items-center task-row">
                    <input type="checkbox" class="task-completed rounded">
                    <input type="text" value="${task.name}" class="task-name flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 px-2">×</button>
                </div>
            `);
        });
    }
}

async function showSaveAsTemplateModal(projectOdid) {
    const project = projects.find(p => p.odid === projectOdid);
    if (!project) return;

    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
                <div class="p-6 border-b border-gray-200">
                    <h3 class="text-lg font-semibold">Save as Template</h3>
                    <p class="text-sm text-gray-500 mt-1">Create a reusable template from "${project.name}"</p>
                </div>
                <form onsubmit="handleSaveAsTemplate(event, '${projectOdid}')" class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
                        <input type="text" id="templateName" required placeholder="e.g., Standard Integration" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div class="bg-gray-50 rounded-lg p-3">
                        <div class="text-sm font-medium text-gray-700 mb-2">Tasks to include (${project.tasks?.length || 0})</div>
                        <ul class="text-sm text-gray-600 space-y-1 max-h-32 overflow-y-auto">
                            ${(project.tasks || []).map(t => `<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>${t.name}</li>`).join('')}
                            ${(!project.tasks || project.tasks.length === 0) ? '<li class="text-gray-400 italic">No tasks</li>' : ''}
                        </ul>
                    </div>
                    ${currentUser?.isAdmin ? `
                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="templateGlobal" class="rounded">
                            <label for="templateGlobal" class="text-sm text-gray-700">Make available to all users (Global)</label>
                        </div>
                    ` : ''}
                    <div class="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Template</button>
                    </div>
                </form>
            </div>
        </div>
    `);
}

async function handleSaveAsTemplate(e, projectOdid) {
    e.preventDefault();
    const name = document.getElementById('templateName').value;
    const isGlobal = document.getElementById('templateGlobal')?.checked || false;

    const success = await createTemplateFromProject(projectOdid, name, isGlobal);
    if (success) {
        closeModal();
        alert('Template saved successfully!');
    }
}

async function showManageTemplatesModal() {
    closeSettings();
    await loadTemplates();

    const userTemplates = templates.filter(t => !t.isGlobal);
    const globalTemplates = templates.filter(t => t.isGlobal);

    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
                <div class="p-6 border-b border-gray-200 flex-shrink-0">
                    <div class="flex items-center justify-between">
                        <h3 class="text-lg font-semibold">Manage Templates</h3>
                        <button onclick="showCreateTemplateModal()" class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ New Template</button>
                    </div>
                </div>
                <div class="p-6 overflow-y-auto flex-1">
                    ${userTemplates.length > 0 ? `
                        <div class="mb-4">
                            <div class="text-sm font-medium text-gray-500 mb-2">MY TEMPLATES</div>
                            <div class="space-y-2">
                                ${userTemplates.map(t => `
                                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div>
                                            <div class="font-medium text-gray-900">${t.name}</div>
                                            <div class="text-xs text-gray-500">${t.tasks.length} tasks</div>
                                        </div>
                                        <div class="flex gap-2">
                                            <button onclick="showEditTemplateModal(${t.id})" class="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
                                            <button onclick="handleDeleteTemplate(${t.id})" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${globalTemplates.length > 0 ? `
                        <div>
                            <div class="text-sm font-medium text-gray-500 mb-2">GLOBAL TEMPLATES</div>
                            <div class="space-y-2">
                                ${globalTemplates.map(t => `
                                    <div class="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                                        <div>
                                            <div class="font-medium text-gray-900 flex items-center gap-2">
                                                ${t.name}
                                                <span class="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded">Global</span>
                                            </div>
                                            <div class="text-xs text-gray-500">${t.tasks.length} tasks • by ${t.createdByUsername}</div>
                                        </div>
                                        ${t.isOwner || currentUser?.isAdmin ? `
                                            <div class="flex gap-2">
                                                <button onclick="showEditTemplateModal(${t.id})" class="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
                                                <button onclick="handleDeleteTemplate(${t.id})" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
                                            </div>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${templates.length === 0 ? `
                        <div class="text-center py-8 text-gray-500">
                            <p>No templates yet.</p>
                            <p class="text-sm mt-1">Create templates to quickly add tasks to new projects.</p>
                        </div>
                    ` : ''}
                </div>
                <div class="p-4 border-t flex justify-end flex-shrink-0">
                    <button onclick="closeModal()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Done</button>
                </div>
            </div>
        </div>
    `);
}

async function showCreateTemplateModal() {
    closeModal();

    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
                <div class="p-6 border-b border-gray-200 flex-shrink-0">
                    <h3 class="text-lg font-semibold">Create Template</h3>
                </div>
                <form onsubmit="handleCreateTemplate(event)" class="p-6 space-y-4 overflow-y-auto flex-1">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
                        <input type="text" id="newTemplateName" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <input type="text" id="newTemplateDesc" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <label class="text-sm font-medium text-gray-700">Tasks</label>
                            <button type="button" onclick="addTemplateTaskField()" class="text-sm text-blue-600 hover:text-blue-800">+ Add Task</button>
                        </div>
                        <div id="templateTasksList" class="space-y-2">
                        </div>
                    </div>
                    ${currentUser?.isAdmin ? `
                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="newTemplateGlobal" class="rounded">
                            <label for="newTemplateGlobal" class="text-sm text-gray-700">Make available to all users (Global)</label>
                        </div>
                    ` : ''}
                    <div class="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onclick="closeModal(); showManageTemplatesModal();" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Template</button>
                    </div>
                </form>
            </div>
        </div>
    `);
}

function addTemplateTaskField() {
    document.getElementById('templateTasksList').insertAdjacentHTML('beforeend', `
        <div class="flex gap-2 items-center template-task-row">
            <input type="text" class="template-task-name flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Task name">
            <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 px-2">×</button>
        </div>
    `);
}

async function handleCreateTemplate(e) {
    e.preventDefault();
    const name = document.getElementById('newTemplateName').value;
    const description = document.getElementById('newTemplateDesc').value;
    const isGlobal = document.getElementById('newTemplateGlobal')?.checked || false;

    const tasks = Array.from(document.querySelectorAll('.template-task-row')).map(row => ({
        name: row.querySelector('.template-task-name').value,
        completed: false
    })).filter(t => t.name.trim());

    const success = await createTemplate(name, description, tasks, isGlobal);
    if (success) {
        closeModal();
        showManageTemplatesModal();
    }
}

async function showEditTemplateModal(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    closeModal();

    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
                <div class="p-6 border-b border-gray-200 flex-shrink-0">
                    <h3 class="text-lg font-semibold">Edit Template</h3>
                </div>
                <form onsubmit="handleUpdateTemplate(event, ${templateId})" class="p-6 space-y-4 overflow-y-auto flex-1">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
                        <input type="text" id="editTemplateName" value="${template.name}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <input type="text" id="editTemplateDesc" value="${template.description || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <label class="text-sm font-medium text-gray-700">Tasks</label>
                            <button type="button" onclick="addEditTemplateTaskField()" class="text-sm text-blue-600 hover:text-blue-800">+ Add Task</button>
                        </div>
                        <div id="editTemplateTasksList" class="space-y-2">
                            ${template.tasks.map(t => `
                                <div class="flex gap-2 items-center edit-template-task-row">
                                    <input type="text" value="${t.name}" class="edit-template-task-name flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 px-2">×</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ${currentUser?.isAdmin ? `
                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="editTemplateGlobal" ${template.isGlobal ? 'checked' : ''} class="rounded">
                            <label for="editTemplateGlobal" class="text-sm text-gray-700">Make available to all users (Global)</label>
                        </div>
                    ` : ''}
                    <div class="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onclick="closeModal(); showManageTemplatesModal();" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    `);
}

function addEditTemplateTaskField() {
    document.getElementById('editTemplateTasksList').insertAdjacentHTML('beforeend', `
        <div class="flex gap-2 items-center edit-template-task-row">
            <input type="text" class="edit-template-task-name flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Task name">
            <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 px-2">×</button>
        </div>
    `);
}

async function handleUpdateTemplate(e, templateId) {
    e.preventDefault();
    const name = document.getElementById('editTemplateName').value;
    const description = document.getElementById('editTemplateDesc').value;
    const isGlobal = document.getElementById('editTemplateGlobal')?.checked || false;

    const tasks = Array.from(document.querySelectorAll('.edit-template-task-row')).map(row => ({
        name: row.querySelector('.edit-template-task-name').value,
        completed: false
    })).filter(t => t.name.trim());

    try {
        await api(`/templates/${templateId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, description, tasks, isGlobal })
        });
        await loadTemplates();
        closeModal();
        showManageTemplatesModal();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function handleDeleteTemplate(templateId) {
    if (!confirm('Delete this template?')) return;
    const success = await deleteTemplate(templateId);
    if (success) {
        closeModal();
        showManageTemplatesModal();
    }
}

async function showAuditModal(projectOdid) {
    const project = projects.find(p => p.odid === projectOdid);
    const projectName = project?.name || 'Unknown Project';

    // Show loading state
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
                <div class="p-6 border-b border-gray-200 flex-shrink-0">
                    <div class="flex items-center gap-2">
                        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <h3 class="text-lg font-semibold">Activity History: ${projectName}</h3>
                    </div>
                </div>
                <div id="auditContent" class="p-6 overflow-y-auto flex-1">
                    <div class="flex justify-center py-8">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                </div>
                <div class="p-4 border-t flex justify-end flex-shrink-0">
                    <button onclick="closeModal()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Close</button>
                </div>
            </div>
        </div>
    `);

    // Load audit trail
    const auditEntries = await loadProjectAudit(projectOdid);

    const contentEl = document.getElementById('auditContent');
    if (auditEntries.length === 0) {
        contentEl.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <p>No activity history yet</p>
            </div>
        `;
    } else {
        contentEl.innerHTML = auditEntries.map(formatAuditEntry).join('');
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

const getPriorityLabel = (priority) => ({
    1: 'Critical',
    2: 'High',
    3: 'Medium',
    4: 'Low',
    5: 'Minimal'
}[priority] || 'Medium');

const getPriorityBg = (priority) => ({
    1: 'bg-red-100 text-red-800',
    2: 'bg-orange-100 text-orange-800',
    3: 'bg-yellow-100 text-yellow-800',
    4: 'bg-sky-100 text-sky-800',
    5: 'bg-gray-100 text-gray-600'
}[priority] || 'bg-yellow-100 text-yellow-800');

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

const sortProjects = (arr) => {
    const statusOrder = ['behind', 'on-pause', 'active', 'discovery', 'on-track', 'complete'];
    return [...arr].sort((a, b) => {
        switch(sortBy) {
            case 'name': return a.name.localeCompare(b.name);
            case 'name-desc': return b.name.localeCompare(a.name);
            case 'progress': return b.progress - a.progress;
            case 'progress-asc': return a.progress - b.progress;
            case 'end-date': return new Date(a.endDate) - new Date(b.endDate);
            case 'end-date-desc': return new Date(b.endDate) - new Date(a.endDate);
            case 'updated': return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
            case 'priority': return (a.priority || 3) - (b.priority || 3);
            case 'priority-desc': return (b.priority || 3) - (a.priority || 3);
            case 'status':
            default: return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
        }
    });
};

function changeSort(value) {
    sortBy = value;
    localStorage.setItem('sortBy', sortBy);
    render();
}

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
            ${microsoftSSOEnabled ? `
            <div class="mt-6">
                <div class="relative">
                    <div class="absolute inset-0 flex items-center">
                        <div class="w-full border-t border-gray-300"></div>
                    </div>
                    <div class="relative flex justify-center text-sm">
                        <span class="px-2 bg-white text-gray-500">or</span>
                    </div>
                </div>
                <button onclick="loginWithMicrosoft()" type="button" class="mt-4 w-full py-2 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 bg-white hover:bg-gray-50 flex items-center justify-center gap-2 microsoft-btn">
                    <svg class="w-5 h-5" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                        <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                        <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                        <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                        <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                    </svg>
                    Sign in with Microsoft
                </button>
            </div>
            ` : ''}
        </div>
    </div>
`;

// Header Component
const Header = () => {
    const getPermissionBadge = (w) => {
        if (w.isOwner) return '';
        if (w.permission === 'editor') return '<span class="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Editor</span>';
        return '<span class="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Viewer</span>';
    };

    const getWorkspaceIcon = (w) => {
        if (!w.isOwner) {
            // Shared workspace icon
            return '<svg class="w-4 h-4 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>';
        }
        return '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>';
    };

    const currentPermBadge = currentWorkspace && !currentWorkspace.isOwner
        ? `<span class="ml-1 px-1.5 py-0.5 text-xs ${currentWorkspace.permission === 'editor' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'} rounded">${currentWorkspace.permission === 'editor' ? 'Editor' : 'Viewer'}</span>`
        : '';

    // Separate owned and shared workspaces
    const ownedWorkspaces = workspaces.filter(w => w.isOwner);
    const sharedWorkspaces = workspaces.filter(w => !w.isOwner);

    return `
    <header class="bg-white shadow-sm border-b border-gray-200 no-print">
        <div class="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-3">
            <div class="flex items-center gap-3">
                <h1 class="text-lg font-semibold text-gray-900 whitespace-nowrap">Project Tracker <span class="text-xs font-normal text-blue-600">v${APP_VERSION}</span></h1>
                <div class="relative">
                    <button onclick="toggleWorkspaceMenu()" class="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition max-w-[320px]">
                        ${currentWorkspace && !currentWorkspace.isOwner
                            ? '<svg class="w-4 h-4 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>'
                            : '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>'
                        }
                        <span class="truncate">${currentWorkspace?.name || 'Select Workspace'}${currentWorkspace && !currentWorkspace.isOwner ? ` (${currentWorkspace.ownerUsername})` : ''}</span>
                        ${currentPermBadge}
                        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    <div id="workspaceMenu" class="hidden absolute left-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                        <div class="p-2">
                            <div class="px-3 py-2 text-xs text-gray-500 border-b mb-1 font-medium">MY WORKSPACES</div>
                            ${ownedWorkspaces.map(w => `
                                <button onclick="switchWorkspace(${w.id})" class="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg ${currentWorkspace?.id === w.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}">
                                    <span class="truncate">${w.name}</span>
                                    ${currentWorkspace?.id === w.id ? '<svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' : ''}
                                </button>
                            `).join('')}
                            ${sharedWorkspaces.length > 0 ? `
                                <div class="px-3 py-2 text-xs text-gray-500 border-b border-t mt-2 mb-1 font-medium">SHARED WITH ME</div>
                                ${sharedWorkspaces.map(w => `
                                    <button onclick="switchWorkspace(${w.id})" class="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg ${currentWorkspace?.id === w.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}">
                                        <div class="flex items-center gap-2 min-w-0">
                                            <svg class="w-4 h-4 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                            <span class="truncate">${w.name}</span>
                                            <span class="text-xs text-gray-400">(${w.ownerUsername})</span>
                                        </div>
                                        <div class="flex items-center gap-1 flex-shrink-0">
                                            ${getPermissionBadge(w)}
                                            ${currentWorkspace?.id === w.id ? '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' : ''}
                                        </div>
                                    </button>
                                `).join('')}
                            ` : ''}
                            <div class="border-t my-1"></div>
                            <button onclick="showCreateWorkspace()" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                New Workspace
                            </button>
                            ${ownedWorkspaces.length > 0 && isWorkspaceOwner() ? `
                            <button onclick="showShareWorkspace(${currentWorkspace?.id})" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                                Share Workspace
                            </button>
                            ` : ''}
                            ${currentWorkspace && !currentWorkspace.isOwner ? `
                            <button onclick="leaveWorkspace(${currentWorkspace?.id})" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                Leave Workspace
                            </button>
                            ` : ''}
                            ${ownedWorkspaces.length > 1 ? `
                            <button onclick="showManageWorkspaces()" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                Manage Workspaces
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
            <nav class="flex gap-2 items-center">
                <button onclick="switchView('overview')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'overview' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Overview</button>
                <button onclick="switchView('finished')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'finished' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Finished</button>
                <button onclick="switchView('edit')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'edit' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Edit Projects</button>
                ${currentUser?.isAdmin ? `<button onclick="switchView('admin')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'admin' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Users</button>` : ''}
                <div class="relative">
                    <button onclick="toggleExportMenu()" class="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition">
                        <span>Export</span>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    <div id="exportMenu" class="hidden absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                        <div class="p-2">
                            <button onclick="exportPDF(); closeExportMenu();" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                                <svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"></path></svg>
                                <span>Export PDF</span>
                            </button>
                            <button onclick="exportCSV(); closeExportMenu();" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                                <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clip-rule="evenodd"></path></svg>
                                <span>Export CSV</span>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="relative">
                    <button onclick="toggleSettings()" class="px-3 py-2 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </button>
                    <div id="settingsMenu" class="hidden absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                        <div class="p-3 bg-gray-50 border-b">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                                    ${currentUser?.username?.charAt(0).toUpperCase() || '?'}
                                </div>
                                <div>
                                    <div class="font-semibold text-gray-900">${currentUser?.username}</div>
                                    <div class="text-xs ${currentUser?.isAdmin ? 'text-purple-600' : 'text-gray-500'}">${currentUser?.isAdmin ? 'Administrator' : 'User'}</div>
                                </div>
                            </div>
                        </div>
                        <div class="p-2">
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
                            <button onclick="showDocumentation()" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                                <span>📖</span>
                                <span>Documentation</span>
                            </button>
                            <button onclick="showManageTemplatesModal()" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                                <span>📋</span>
                                <span>Manage Templates</span>
                            </button>
                            <div class="border-t my-1"></div>
                            <button onclick="toggleDemoMode()" class="w-full flex items-center gap-3 px-3 py-2 text-sm ${demoMode ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:bg-gray-100'} rounded-lg">
                                <span>🧪</span>
                                <span>${demoMode ? 'Remove Demo Data' : 'Load Demo Data'}</span>
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
};

const ProjectCard = (project) => {
    const timelineProgress = getTimelineProgress(project.startDate, project.endDate);
    const daysRemaining = daysBetween(new Date(), project.endDate);
    const hasStarted = new Date() >= new Date(project.startDate);
    const pid = project.odid || project.id;
    const lastUpdatedDate = project.updatedAt ? formatDate(project.updatedAt) : formatDate(project.createdAt);
    const lastUpdatedBy = project.lastUpdatedBy || 'Unknown';
    const canEdit = canEditWorkspace();

    return `
        <div class="bg-white rounded-xl shadow-sm border ${project.isLinked ? 'border-purple-300' : 'border-gray-200'} p-6 mb-4" data-project-id="${pid}">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <div class="flex items-center gap-2">
                        <h3 class="text-xl font-semibold text-gray-900">${project.name}</h3>
                        ${project.isLinked ? `
                            <span class="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full flex items-center gap-1" title="Synced from ${project.sourceWorkspaceName}">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                                Synced
                            </span>
                        ` : ''}
                    </div>
                    <p class="text-gray-500 text-sm mt-1">${project.description || ''}</p>
                </div>
                <div class="flex items-center gap-2">
                    ${!project.isLinked && canEdit ? `
                        <button onclick="showLinkModal('${pid}')" class="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition" title="Sync to Other Workspaces">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                        </button>
                    ` : ''}
                    <button onclick="showAuditModal('${pid}')" class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition" title="View History">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </button>
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${getPriorityBg(project.priority || 3)}">${getPriorityLabel(project.priority || 3)}</span>
                    <span class="px-3 py-1 rounded-full text-sm font-medium ${getStatusBg(project.status)}">${project.status.replace('-', ' ').toUpperCase()}</span>
                </div>
            </div>
            <div class="mb-4 text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Last updated by <span class="font-medium text-gray-500">${lastUpdatedBy}</span> on ${lastUpdatedDate}
                ${project.isLinked ? `<span class="ml-2 text-purple-500">• From ${project.sourceWorkspaceName}</span>` : ''}
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
                <div class="progress-bar relative">
                    <div class="progress-fill ${getStatusColor(project.status)}" style="width: ${project.progress}%"></div>
                    <span class="absolute inset-0 flex items-center justify-center text-sm font-semibold ${project.progress > 50 ? 'text-white' : 'text-gray-700'}">${project.progress}%</span>
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
            ${project.notes && project.notes.length > 0 ? `
                <div class="${project.tasks && project.tasks.length > 0 ? 'pt-4' : 'border-t pt-4'}">
                    <button onclick="toggleNotes('${pid}')" class="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                        <svg class="w-4 h-4 transition-transform" id="notes-arrow-${pid}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                        Notes (${project.notes.length})
                    </button>
                    <div class="dropdown-content mt-2" id="notes-${pid}">
                        <div class="space-y-3 pl-6">
                            ${project.notes.map(note => `
                                <div class="bg-gray-50 rounded-lg p-3">
                                    <div class="text-xs text-gray-400 mb-1">${new Date(note.timestamp).toLocaleString()}</div>
                                    <div class="text-sm text-gray-700 whitespace-pre-wrap">${note.text}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
};

const OverviewPage = () => {
    const active = activeProjects();
    const sorted = sortProjects(active);

    const sortDropdown = `
        <select onchange="changeSort(this.value)" class="px-2 py-1 text-sm border border-gray-300 rounded-lg bg-white text-gray-700">
            <option value="status" ${sortBy === 'status' ? 'selected' : ''}>Sort: Status</option>
            <option value="name" ${sortBy === 'name' ? 'selected' : ''}>Sort: Name (A-Z)</option>
            <option value="name-desc" ${sortBy === 'name-desc' ? 'selected' : ''}>Sort: Name (Z-A)</option>
            <option value="progress" ${sortBy === 'progress' ? 'selected' : ''}>Sort: Progress (High)</option>
            <option value="progress-asc" ${sortBy === 'progress-asc' ? 'selected' : ''}>Sort: Progress (Low)</option>
            <option value="end-date" ${sortBy === 'end-date' ? 'selected' : ''}>Sort: Due Date (Soon)</option>
            <option value="end-date-desc" ${sortBy === 'end-date-desc' ? 'selected' : ''}>Sort: Due Date (Later)</option>
            <option value="updated" ${sortBy === 'updated' ? 'selected' : ''}>Sort: Recently Updated</option>
            <option value="priority" ${sortBy === 'priority' ? 'selected' : ''}>Sort: Priority (High)</option>
            <option value="priority-desc" ${sortBy === 'priority-desc' ? 'selected' : ''}>Sort: Priority (Low)</option>
        </select>
    `;

    const toggleHtml = `
        <div class="flex items-center gap-4">
            ${sortDropdown}
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500">Detailed</span>
                <button onclick="toggleSimpleView()" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${simpleView ? 'bg-blue-600' : 'bg-gray-300'}">
                    <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${simpleView ? 'translate-x-6' : 'translate-x-1'}"></span>
                </button>
                <span class="text-sm text-gray-500">Simple</span>
            </div>
        </div>
    `;

    const detailedView = sorted.length === 0 ? `
        <div class="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p class="text-gray-500">No active projects.</p>
        </div>
    ` : sorted.map(ProjectCard).join('');

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
                        <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Priority</th>
                        <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                        <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Progress</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Timeline</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Last Updated</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${sorted.map(p => {
                        const timelinePos = getTimelineProgress(p.startDate, p.endDate);
                        const started = new Date() >= new Date(p.startDate);
                        const lastUpdated = p.updatedAt ? formatDate(p.updatedAt) : formatDate(p.createdAt);
                        const updatedBy = p.lastUpdatedBy || 'Unknown';
                        return `
                        <tr class="${p.status === 'behind' ? 'bg-red-50' : ''} ${p.isLinked ? 'border-l-2 border-l-purple-400' : ''}">
                            <td class="px-4 py-3">
                                <div class="flex items-center gap-2">
                                    <span class="font-medium text-gray-900">${p.name}</span>
                                    ${p.isLinked ? `<span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded" title="From ${p.sourceWorkspaceName}">Synced</span>` : ''}
                                </div>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-600">${p.owner}</td>
                            <td class="px-4 py-3 text-center"><span class="px-2 py-1 rounded-full text-xs font-medium ${getPriorityBg(p.priority || 3)}">${getPriorityLabel(p.priority || 3)}</span></td>
                            <td class="px-4 py-3 text-center"><span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusBg(p.status)}">${p.status.replace('-', ' ')}</span></td>
                            <td class="px-4 py-3">
                                <div class="progress-bar h-6 relative">
                                    <div class="progress-fill ${getStatusColor(p.status)}" style="width: ${p.progress}%"></div>
                                    <span class="absolute inset-0 flex items-center justify-center text-xs font-semibold ${p.progress > 50 ? 'text-white' : 'text-gray-700'}">${p.progress}%</span>
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
                            <td class="px-4 py-3 text-xs text-gray-500">
                                <div class="font-medium text-gray-700">${updatedBy}</div>
                                <div>${lastUpdated}</div>
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
    const canEdit = canEditWorkspace();
    const isViewer = currentWorkspace && !currentWorkspace.isOwner && currentWorkspace.permission === 'viewer';

    return `
    <div id="export-content" class="max-w-7xl mx-auto px-4 py-8">
        <div class="flex justify-between items-center mb-6">
            <div class="flex items-center gap-3">
                <h2 class="text-xl font-semibold text-gray-900">Finished Projects</h2>
                ${isViewer ? '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">View Only</span>' : ''}
            </div>
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
                                <button onclick="showAuditModal('${p.odid}')" class="text-gray-400 hover:text-gray-600 text-sm font-medium mr-2" title="View History">
                                    <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                </button>
                                ${canEdit ? `
                                    <button onclick="reactivateProject('${p.odid}')" class="text-emerald-600 hover:text-emerald-800 text-sm font-medium mr-2">Reactivate</button>
                                    <button onclick="openProjectModal('${p.odid}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                                ` : `
                                    <button onclick="openProjectModal('${p.odid}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium">View</button>
                                `}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`}
    </div>`;
};

const EditPage = () => {
    const canEdit = canEditWorkspace();
    const isViewer = currentWorkspace && !currentWorkspace.isOwner && currentWorkspace.permission === 'viewer';
    const sorted = sortProjects(projects);

    const sortDropdown = `
        <select onchange="changeSort(this.value)" class="px-2 py-1 text-sm border border-gray-300 rounded-lg bg-white text-gray-700">
            <option value="status" ${sortBy === 'status' ? 'selected' : ''}>Sort: Status</option>
            <option value="name" ${sortBy === 'name' ? 'selected' : ''}>Sort: Name (A-Z)</option>
            <option value="name-desc" ${sortBy === 'name-desc' ? 'selected' : ''}>Sort: Name (Z-A)</option>
            <option value="progress" ${sortBy === 'progress' ? 'selected' : ''}>Sort: Progress (High)</option>
            <option value="progress-asc" ${sortBy === 'progress-asc' ? 'selected' : ''}>Sort: Progress (Low)</option>
            <option value="end-date" ${sortBy === 'end-date' ? 'selected' : ''}>Sort: Due Date (Soon)</option>
            <option value="end-date-desc" ${sortBy === 'end-date-desc' ? 'selected' : ''}>Sort: Due Date (Later)</option>
            <option value="updated" ${sortBy === 'updated' ? 'selected' : ''}>Sort: Recently Updated</option>
            <option value="priority" ${sortBy === 'priority' ? 'selected' : ''}>Sort: Priority (High)</option>
            <option value="priority-desc" ${sortBy === 'priority-desc' ? 'selected' : ''}>Sort: Priority (Low)</option>
        </select>
    `;

    return `
    <div class="max-w-7xl mx-auto px-4 py-8">
        <div class="flex justify-between items-center mb-6">
            <div class="flex items-center gap-3">
                <h2 class="text-xl font-semibold text-gray-900">Manage Projects</h2>
                ${isViewer ? '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">View Only</span>' : ''}
                ${sortDropdown}
            </div>
            ${canEdit ? `<button onclick="openProjectModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">+ Add Project</button>` : ''}
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table class="w-full">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Project</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Owner</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Priority</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Progress</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Dates</th>
                        <th class="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${sorted.length === 0 ? `
                        <tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">${canEdit ? 'No projects. Click "Add Project" to create one.' : 'No projects in this workspace.'}</td></tr>
                    ` : sorted.map(p => `
                        <tr class="hover:bg-gray-50 ${p.isLinked ? 'border-l-2 border-l-purple-400' : ''}">
                            <td class="px-4 py-3">
                                <div class="flex items-center gap-2">
                                    <span class="font-medium text-gray-900">${p.name}</span>
                                    ${p.isLinked ? `<span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded" title="From ${p.sourceWorkspaceName}">Synced</span>` : ''}
                                </div>
                                <div class="text-sm text-gray-500">${p.tasks?.length || 0} tasks</div>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-700">${p.owner}</td>
                            <td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-xs font-medium ${getPriorityBg(p.priority || 3)}">${getPriorityLabel(p.priority || 3)}</span></td>
                            <td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusBg(p.status)}">${p.status.replace('-', ' ')}</span></td>
                            <td class="px-4 py-3">
                                <div class="progress-bar h-5 relative">
                                    <div class="progress-fill ${getStatusColor(p.status)}" style="width: ${p.progress}%"></div>
                                    <span class="absolute inset-0 flex items-center justify-center text-xs font-semibold ${p.progress > 50 ? 'text-white' : 'text-gray-700'}">${p.progress}%</span>
                                </div>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-700">${formatDate(p.startDate)} - ${formatDate(p.endDate)}</td>
                            <td class="px-4 py-3 text-right">
                                ${!p.isLinked && canEdit ? `
                                    <button onclick="showLinkModal('${p.odid}')" class="text-purple-400 hover:text-purple-600 text-sm font-medium mr-2" title="Sync to Other Workspaces">
                                        <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                                    </button>
                                ` : ''}
                                <button onclick="showAuditModal('${p.odid}')" class="text-gray-400 hover:text-gray-600 text-sm font-medium mr-2" title="View History">
                                    <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                </button>
                                ${canEdit ? `
                                    <button onclick="openProjectModal('${p.odid}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium mr-2">Edit</button>
                                    <button onclick="deleteProject('${p.odid}')" class="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                                ` : `
                                    <button onclick="openProjectModal('${p.odid}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium">View</button>
                                `}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
`;
};

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
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Email (SSO)</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Role</th>
                        <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Created</th>
                        <th class="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
                    </tr>
                </thead>
                <tbody id="usersList" class="divide-y divide-gray-200">
                    <tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
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
                <td class="px-4 py-3">
                    <div class="font-medium text-gray-900">${u.username}</div>
                    ${u.auth_provider === 'microsoft' ? '<span class="text-xs text-blue-600">Microsoft SSO</span>' : ''}
                </td>
                <td class="px-4 py-3">
                    ${u.email ? `
                        <span class="text-sm text-gray-700">${u.email}</span>
                        <button onclick="editUserEmail(${u.id}, '${u.email || ''}')" class="ml-1 text-gray-400 hover:text-gray-600">
                            <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                    ` : `
                        <button onclick="editUserEmail(${u.id}, '')" class="text-sm text-gray-400 hover:text-blue-600">+ Add email</button>
                    `}
                </td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-xs font-medium ${u.isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}">${u.isAdmin ? 'Admin' : 'User'}</span></td>
                <td class="px-4 py-3 text-sm text-gray-500">${formatDate(u.createdAt)}</td>
                <td class="px-4 py-3 text-right">
                    <button onclick="resetPassword(${u.id}, '${u.username}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium mr-2">Reset Password</button>
                    ${u.id !== currentUser.id ? `<button onclick="deleteUser(${u.id}, '${u.username}')" class="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>` : ''}
                </td>
            </tr>
        `).join('');
    } catch (err) {
        document.getElementById('usersList').innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-500">${err.message}</td></tr>`;
    }
}

const ProjectModal = (project = null) => {
    const canEdit = canEditWorkspace();
    const isViewOnly = !canEdit && project;
    const disabled = isViewOnly ? 'disabled' : '';
    const disabledClass = isViewOnly ? 'bg-gray-100 cursor-not-allowed' : '';
    const isNewProject = !project;
    const hasTasks = project?.tasks?.length > 0;

    return `
    <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" ${isNewProject ? '' : 'onclick="if(event.target.id===\'modal\')closeModal()"'}>
        <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b border-gray-200">
                <div class="flex items-center justify-between">
                    <h3 class="text-lg font-semibold">${isViewOnly ? 'View Project' : (project ? 'Edit Project' : 'New Project')}</h3>
                    <div class="flex items-center gap-2">
                        ${!isViewOnly && hasTasks ? `
                            <button type="button" onclick="closeModal(); showSaveAsTemplateModal('${project.odid}')" class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
                                Save as Template
                            </button>
                        ` : ''}
                        ${isViewOnly ? '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">View Only</span>' : ''}
                    </div>
                </div>
            </div>
            <form onsubmit="${isViewOnly ? 'event.preventDefault(); closeModal();' : 'saveProject(event)'}" class="p-6 space-y-4">
                <input type="hidden" id="projectId" value="${project?.odid || ''}">
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Project Name ${isViewOnly ? '' : '*'}</label>
                        <input type="text" id="projectName" value="${project?.name || ''}" ${isViewOnly ? '' : 'required'} ${disabled} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${disabledClass}">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea id="projectDesc" rows="2" ${disabled} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${disabledClass}">${project?.description || ''}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Owner ${isViewOnly ? '' : '*'}</label>
                        <input type="text" id="projectOwner" value="${project?.owner || ''}" ${isViewOnly ? '' : 'required'} ${disabled} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${disabledClass}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Support Team</label>
                        <input type="text" id="projectTeam" value="${project?.team || ''}" ${disabled} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${disabledClass}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Start Date ${isViewOnly ? '' : '*'}</label>
                        <input type="date" id="projectStart" value="${project?.startDate || ''}" ${isViewOnly ? '' : 'required'} ${disabled} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${disabledClass}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">End Date ${isViewOnly ? '' : '*'}</label>
                        <input type="date" id="projectEnd" value="${project?.endDate || ''}" ${isViewOnly ? '' : 'required'} ${disabled} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${disabledClass}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select id="projectStatus" ${disabled} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${disabledClass}">
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
                        <input type="number" id="projectProgress" min="0" max="100" value="${project?.progress || 0}" ${disabled} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${disabledClass}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                        <select id="projectPriority" ${disabled} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${disabledClass}">
                            <option value="1" ${(project?.priority || 3) === 1 ? 'selected' : ''}>1 - Critical</option>
                            <option value="2" ${(project?.priority || 3) === 2 ? 'selected' : ''}>2 - High</option>
                            <option value="3" ${(project?.priority || 3) === 3 ? 'selected' : ''}>3 - Medium</option>
                            <option value="4" ${(project?.priority || 3) === 4 ? 'selected' : ''}>4 - Low</option>
                            <option value="5" ${(project?.priority || 3) === 5 ? 'selected' : ''}>5 - Minimal</option>
                        </select>
                    </div>
                </div>
                ${!isViewOnly ? `
                <div class="flex items-center gap-2 pt-2">
                    <input type="checkbox" id="forceFinish" ${project && isFinished(project) ? 'checked' : ''} class="rounded">
                    <label for="forceFinish" class="text-sm text-gray-700">Move to Finished tab</label>
                </div>
                ` : ''}
                <div class="border-t pt-4 mt-4">
                    ${isNewProject && templates.length > 0 ? `
                    <div class="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-4">
                        <label class="block text-sm font-medium text-blue-800 mb-2">Start from Template (Optional)</label>
                        <select id="templateSelect" onchange="applyTemplate(this.value)" class="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500">
                            <option value="">Select a template...</option>
                            ${templates.filter(t => !t.isGlobal).length > 0 ? `
                                <optgroup label="My Templates">
                                    ${templates.filter(t => !t.isGlobal).map(t => `<option value="${t.id}">${t.name} (${t.tasks.length} tasks)</option>`).join('')}
                                </optgroup>
                            ` : ''}
                            ${templates.filter(t => t.isGlobal).length > 0 ? `
                                <optgroup label="Global Templates">
                                    ${templates.filter(t => t.isGlobal).map(t => `<option value="${t.id}">${t.name} (${t.tasks.length} tasks)</option>`).join('')}
                                </optgroup>
                            ` : ''}
                        </select>
                        <p class="text-xs text-blue-600 mt-1">Selecting a template will populate the tasks below</p>
                    </div>
                    ` : ''}
                    <div class="flex justify-between items-center mb-2">
                        <label class="text-sm font-medium text-gray-700">Sub-tasks</label>
                        ${!isViewOnly ? `<button type="button" onclick="addTaskField()" class="text-sm text-blue-600 hover:text-blue-800">+ Add Task</button>` : ''}
                    </div>
                    <div id="tasksList" class="space-y-2">
                        ${(project?.tasks || []).map(t => `
                            <div class="flex gap-2 items-center task-row">
                                <input type="checkbox" ${t.completed ? 'checked' : ''} ${disabled} class="task-completed rounded ${disabledClass}">
                                <input type="text" value="${t.name}" ${disabled} class="task-name flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm ${disabledClass}">
                                ${!isViewOnly ? `<button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 px-2">×</button>` : ''}
                            </div>
                        `).join('')}
                        ${isViewOnly && (!project?.tasks || project.tasks.length === 0) ? '<p class="text-sm text-gray-500 italic">No tasks</p>' : ''}
                    </div>
                </div>
                <div class="border-t pt-4 mt-4">
                    <div class="flex justify-between items-center mb-2">
                        <label class="text-sm font-medium text-gray-700">Notes</label>
                        ${!isViewOnly ? `<button type="button" onclick="addNoteField()" class="text-sm text-blue-600 hover:text-blue-800">+ Add Note</button>` : ''}
                    </div>
                    <div id="notesList" class="space-y-2">
                        ${(project?.notes || []).map(n => `
                            <div class="note-row bg-gray-50 rounded-lg p-3">
                                <div class="flex justify-between items-start mb-1">
                                    <span class="text-xs text-gray-400">${new Date(n.timestamp).toLocaleString()}</span>
                                    ${!isViewOnly ? `<button type="button" onclick="this.closest('.note-row').remove()" class="text-red-500 hover:text-red-700 text-xs">Remove</button>` : ''}
                                </div>
                                <textarea class="note-text w-full px-2 py-1 border border-gray-300 rounded text-sm ${disabledClass}" rows="2" ${disabled}>${n.text}</textarea>
                                <input type="hidden" class="note-timestamp" value="${n.timestamp}">
                            </div>
                        `).join('')}
                        ${isViewOnly && (!project?.notes || project.notes.length === 0) ? '<p class="text-sm text-gray-500 italic">No notes</p>' : ''}
                    </div>
                </div>
                <div class="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onclick="closeModal()" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">${isViewOnly ? 'Close' : 'Cancel'}</button>
                    ${!isViewOnly ? `<button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Project</button>` : ''}
                </div>
            </form>
        </div>
    </div>
`;
};

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

async function toggleDemoMode() {
    closeSettings();

    if (demoMode) {
        // Remove demo projects
        const demoProjects = projects.filter(p => p.name.startsWith('[DEMO]'));
        for (const p of demoProjects) {
            await api(`/projects/${p.odid}`, { method: 'DELETE' });
        }
        demoMode = false;
        await loadProjects();
        render();
    } else {
        // Create demo projects
        const today = new Date();
        const demoData = [
            {
                name: '[DEMO] Cloud Migration',
                description: 'Migrate on-premise infrastructure to AWS',
                owner: 'Sarah Chen',
                team: 'Infrastructure',
                startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                endDate: new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'on-track',
                progress: 45,
                priority: 2,
                tasks: [
                    { name: 'Assessment complete', completed: true },
                    { name: 'Network setup', completed: true },
                    { name: 'Data migration', completed: false },
                    { name: 'Testing & validation', completed: false }
                ]
            },
            {
                name: '[DEMO] CRM Integration',
                description: 'Connect Salesforce with internal systems',
                owner: 'Mike Johnson',
                team: 'Sales Ops',
                startDate: new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                endDate: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'behind',
                progress: 70,
                priority: 1,
                tasks: [
                    { name: 'API mapping', completed: true },
                    { name: 'Data sync setup', completed: true },
                    { name: 'User training', completed: false }
                ]
            },
            {
                name: '[DEMO] Security Audit',
                description: 'Annual security compliance review',
                owner: 'Alex Rivera',
                team: 'Security',
                startDate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                endDate: new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'active',
                progress: 25,
                priority: 1,
                tasks: [
                    { name: 'Vulnerability scan', completed: true },
                    { name: 'Penetration testing', completed: false },
                    { name: 'Report generation', completed: false }
                ]
            },
            {
                name: '[DEMO] Mobile App Launch',
                description: 'Release new customer mobile application',
                owner: 'Emma Wilson',
                team: 'Product',
                startDate: new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                endDate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'on-track',
                progress: 85,
                priority: 3,
                tasks: [
                    { name: 'Development', completed: true },
                    { name: 'QA testing', completed: true },
                    { name: 'App store submission', completed: true },
                    { name: 'Marketing launch', completed: false }
                ]
            },
            {
                name: '[DEMO] Data Warehouse',
                description: 'Build centralized reporting platform',
                owner: 'David Park',
                team: 'Data',
                startDate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                endDate: new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'discovery',
                progress: 0,
                priority: 4,
                tasks: [
                    { name: 'Requirements gathering', completed: false },
                    { name: 'Architecture design', completed: false },
                    { name: 'ETL development', completed: false }
                ]
            }
        ];

        for (const project of demoData) {
            await api('/projects', { method: 'POST', body: JSON.stringify({ ...project, workspaceId: currentWorkspace?.id }) });
        }
        demoMode = true;
        await loadProjects();
        render();
    }
}

function toggleSettings() {
    document.getElementById('settingsMenu')?.classList.toggle('hidden');
    document.getElementById('workspaceMenu')?.classList.add('hidden');
    document.getElementById('exportMenu')?.classList.add('hidden');
}

function closeSettings() {
    document.getElementById('settingsMenu')?.classList.add('hidden');
}

function toggleExportMenu() {
    document.getElementById('exportMenu')?.classList.toggle('hidden');
    document.getElementById('settingsMenu')?.classList.add('hidden');
    document.getElementById('workspaceMenu')?.classList.add('hidden');
}

function closeExportMenu() {
    document.getElementById('exportMenu')?.classList.add('hidden');
}

function toggleWorkspaceMenu() {
    document.getElementById('workspaceMenu')?.classList.toggle('hidden');
    document.getElementById('settingsMenu')?.classList.add('hidden');
    document.getElementById('exportMenu')?.classList.add('hidden');
}

function closeWorkspaceMenu() {
    document.getElementById('workspaceMenu')?.classList.add('hidden');
}

async function switchWorkspace(workspaceId) {
    currentWorkspace = workspaces.find(w => w.id === workspaceId);
    localStorage.setItem('currentWorkspaceId', workspaceId);
    closeWorkspaceMenu();
    await loadProjects();
    render();
}

function showCreateWorkspace() {
    closeWorkspaceMenu();
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
                <div class="p-6 border-b border-gray-200"><h3 class="text-lg font-semibold">Create New Workspace</h3></div>
                <form onsubmit="createWorkspace(event)" class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Workspace Name</label>
                        <input type="text" id="workspaceName" required placeholder="e.g., Q1 Planning, Client Projects" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div class="flex justify-end gap-3 pt-4">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Create Workspace</button>
                    </div>
                </form>
            </div>
        </div>
    `);
}

async function createWorkspace(e) {
    e.preventDefault();
    const name = document.getElementById('workspaceName').value;
    try {
        const result = await api('/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
        await loadWorkspaces();
        await switchWorkspace(result.id);
        closeModal();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function showManageWorkspaces() {
    closeWorkspaceMenu();
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
                <div class="p-6 border-b border-gray-200"><h3 class="text-lg font-semibold">Manage Workspaces</h3></div>
                <div class="p-6 space-y-2" id="workspaceList">
                    ${workspaces.map(w => `
                        <div class="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
                            <span class="font-medium truncate ${currentWorkspace?.id === w.id ? 'text-blue-600' : 'text-gray-700'}">${w.name}</span>
                            <div class="flex gap-2 flex-shrink-0">
                                <button onclick="renameWorkspace(${w.id}, '${w.name.replace(/'/g, "\\'")}')" class="text-sm text-blue-600 hover:text-blue-800">Rename</button>
                                ${workspaces.length > 1 ? `<button onclick="deleteWorkspace(${w.id}, '${w.name.replace(/'/g, "\\'")}')" class="text-sm text-red-600 hover:text-red-800">Delete</button>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="p-4 border-t flex justify-end">
                    <button onclick="closeModal()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg">Close</button>
                </div>
            </div>
        </div>
    `);
}

async function renameWorkspace(id, currentName) {
    const newName = prompt('Enter new workspace name:', currentName);
    if (!newName || newName === currentName) return;
    try {
        await api(`/workspaces/${id}`, { method: 'PUT', body: JSON.stringify({ name: newName }) });
        await loadWorkspaces();
        closeModal();
        render();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function showShareWorkspace(workspaceId) {
    closeWorkspaceMenu();
    await loadShareableUsers();
    const shares = await loadWorkspaceShares(workspaceId);
    const workspace = workspaces.find(w => w.id === workspaceId);

    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
                <div class="p-6 border-b border-gray-200">
                    <h3 class="text-lg font-semibold">Share "${workspace?.name || 'Workspace'}"</h3>
                    <p class="text-sm text-gray-500 mt-1">Invite others to view or edit projects in this workspace</p>
                </div>
                <div class="p-6 space-y-4">
                    <div class="flex gap-2">
                        <select id="shareUserSelect" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            <option value="">Select a user...</option>
                            ${allUsers.filter(u => !shares.some(s => s.userId === u.id)).map(u => `
                                <option value="${u.id}">${u.username}</option>
                            `).join('')}
                        </select>
                        <select id="sharePermSelect" class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                        </select>
                        <button onclick="handleAddShare(${workspaceId})" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add</button>
                    </div>
                    <div class="border-t pt-4">
                        <div class="text-sm font-medium text-gray-700 mb-2">Shared with</div>
                        <div id="sharesList" class="space-y-2 max-h-64 overflow-y-auto">
                            ${shares.length === 0 ? `
                                <p class="text-sm text-gray-500 italic">Not shared with anyone yet</p>
                            ` : shares.map(s => `
                                <div class="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg" data-share-id="${s.id}">
                                    <div class="flex items-center gap-2">
                                        <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                                            ${s.username.charAt(0).toUpperCase()}
                                        </div>
                                        <span class="font-medium text-gray-700">${s.username}</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <select onchange="handleUpdateShare(${workspaceId}, ${s.id}, this.value)" class="text-sm px-2 py-1 border border-gray-300 rounded">
                                            <option value="viewer" ${s.permission === 'viewer' ? 'selected' : ''}>Viewer</option>
                                            <option value="editor" ${s.permission === 'editor' ? 'selected' : ''}>Editor</option>
                                        </select>
                                        <button onclick="handleRemoveShare(${workspaceId}, ${s.id})" class="text-red-500 hover:text-red-700 text-sm">Remove</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="p-4 border-t flex justify-end">
                    <button onclick="closeModal()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Done</button>
                </div>
            </div>
        </div>
    `);
}

async function handleAddShare(workspaceId) {
    const userId = parseInt(document.getElementById('shareUserSelect').value);
    const permission = document.getElementById('sharePermSelect').value;
    if (!userId) { alert('Please select a user'); return; }

    const success = await addWorkspaceShare(workspaceId, userId, permission);
    if (success) {
        closeModal();
        await showShareWorkspace(workspaceId);
    }
}

async function handleUpdateShare(workspaceId, shareId, permission) {
    await updateWorkspaceShare(workspaceId, shareId, permission);
}

async function handleRemoveShare(workspaceId, shareId) {
    if (confirm('Remove this user from the workspace?')) {
        const success = await removeWorkspaceShare(workspaceId, shareId);
        if (success) {
            document.querySelector(`[data-share-id="${shareId}"]`)?.remove();
            // Check if shares list is now empty
            const sharesList = document.getElementById('sharesList');
            if (sharesList && !sharesList.querySelector('[data-share-id]')) {
                sharesList.innerHTML = '<p class="text-sm text-gray-500 italic">Not shared with anyone yet</p>';
            }
        }
    }
}

async function deleteWorkspace(id, name) {
    if (!confirm(`Delete workspace "${name}"? All projects in this workspace will be deleted.`)) return;
    try {
        await api(`/workspaces/${id}`, { method: 'DELETE' });
        await loadWorkspaces();
        if (currentWorkspace?.id === id) {
            currentWorkspace = workspaces[0];
            localStorage.setItem('currentWorkspaceId', currentWorkspace.id);
        }
        await loadProjects();
        closeModal();
        render();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function toggleTasks(projectId) {
    const content = document.getElementById(`tasks-${projectId}`);
    const arrow = document.getElementById(`arrow-${projectId}`);
    if (content) content.classList.toggle('open');
    if (arrow) arrow.style.transform = content?.classList.contains('open') ? 'rotate(180deg)' : '';
}

function toggleNotes(projectId) {
    const content = document.getElementById(`notes-${projectId}`);
    const arrow = document.getElementById(`notes-arrow-${projectId}`);
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

function addNoteField() {
    const timestamp = new Date().toISOString();
    document.getElementById('notesList').insertAdjacentHTML('afterbegin', `
        <div class="note-row bg-gray-50 rounded-lg p-3">
            <div class="flex justify-between items-start mb-1">
                <span class="text-xs text-gray-400">${new Date(timestamp).toLocaleString()}</span>
                <button type="button" onclick="this.closest('.note-row').remove()" class="text-red-500 hover:text-red-700 text-xs">Remove</button>
            </div>
            <textarea class="note-text w-full px-2 py-1 border border-gray-300 rounded text-sm" rows="2" placeholder="Enter note..."></textarea>
            <input type="hidden" class="note-timestamp" value="${timestamp}">
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

    const notes = Array.from(document.querySelectorAll('.note-row')).map(row => ({
        text: row.querySelector('.note-text').value,
        timestamp: row.querySelector('.note-timestamp').value
    })).filter(n => n.text.trim());

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
        priority: parseInt(document.getElementById('projectPriority').value) || 3,
        completedDate: forceFinish ? new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() : null,
        tasks,
        notes
    };

    try {
        if (id) {
            await api(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(projectData) });
        } else {
            await api('/projects', { method: 'POST', body: JSON.stringify({ ...projectData, workspaceId: currentWorkspace?.id }) });
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
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email (for Microsoft SSO)</label>
                        <input type="email" id="newEmail" placeholder="user@company.com" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        <p class="mt-1 text-xs text-gray-500">User can sign in with Microsoft using this email</p>
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
                email: document.getElementById('newEmail').value || null,
                isAdmin: document.getElementById('newIsAdmin').checked
            })
        });
        closeModal();
        loadUsers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function editUserEmail(userId, currentEmail) {
    const newEmail = prompt('Enter email address for Microsoft SSO:', currentEmail);
    if (newEmail === null) return; // Cancelled
    try {
        await api(`/admin/users/${userId}/email`, {
            method: 'PUT',
            body: JSON.stringify({ email: newEmail || null })
        });
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
                                <p class="font-medium text-gray-800">v2.14.1 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Priority badges visible on project cards and tables</li>
                                    <li>Color-coded: Critical (red), High (orange), Medium (yellow), Low (blue), Minimal (gray)</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.14.0 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Priority field for projects (1-5 scale)</li>
                                    <li>Sort by Priority (High/Low) added</li>
                                    <li>Demo data includes priority examples</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.13.0 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Sort feature for projects in Overview and Edit tabs</li>
                                    <li>Sort by: Status, Name, Progress, Due Date, Recently Updated</li>
                                    <li>Sort preference saved to browser</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.12.1 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Fixed documentation text colors in dark mode</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.12.0 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Documentation page - comprehensive user guide</li>
                                    <li>Accessible from Settings menu</li>
                                    <li>Covers all features: views, projects, workspaces, sharing, templates, exports</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.11.4 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Prevent accidental close when clicking outside new project modal</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.11.3 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Moved template selector next to tasks in new project modal</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.11.2 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Fixed status badge colors in dark mode</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.11.1 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Fixed template selector dark mode styling</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.11.0 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Project Templates - create reusable task lists</li>
                                    <li>Template selector when creating new projects</li>
                                    <li>Save existing projects as templates</li>
                                    <li>User templates + admin global templates</li>
                                    <li>Manage Templates from settings menu</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.10.0 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Project Sync - link projects across workspaces</li>
                                    <li>Sync button on project cards and edit table</li>
                                    <li>Synced projects show purple "Synced" badge</li>
                                    <li>Manage links from sync modal</li>
                                    <li>Enables cross-workspace collaboration</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.9.2 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Fixed progress bar text display</li>
                                    <li>Percentage always centered inside bar regardless of fill level</li>
                                    <li>Text color adapts based on fill (white on dark, dark on light)</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.9.1 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Last Updated By - shows who last modified each project</li>
                                    <li>Visible in both Overview (detailed) and Simple views</li>
                                    <li>Helps execs verify info is current</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.9.0 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Audit Trail - track all project changes with timestamps</li>
                                    <li>History button on project cards and edit list</li>
                                    <li>View who made changes and when</li>
                                    <li>Tracks: create, update, status, progress, timeline, notes, tasks, delete, reactivate</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.8.1 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Leave Workspace - users can leave workspaces shared with them</li>
                                    <li>Auto-switches to owned workspace after leaving</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.8.0 <span class="text-gray-400">- Feb 4, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Workspace Sharing - share workspaces with other users</li>
                                    <li>Two permission levels: Viewer (read-only) and Editor (can edit)</li>
                                    <li>Share management modal for workspace owners</li>
                                    <li>Owners can remove shared users from the Share modal</li>
                                    <li>Visual indicators for shared workspaces</li>
                                    <li>Permission-based UI (view-only mode for viewers)</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.7.0 <span class="text-gray-400">- Feb 3, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Added CSV export button</li>
                                    <li>Exports all project data to spreadsheet format</li>
                                    <li>Includes task counts and notes count</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.6.0 <span class="text-gray-400">- Feb 3, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Added Notes feature to projects</li>
                                    <li>Notes auto-timestamp on creation</li>
                                    <li>View notes in collapsible dropdown on Overview</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.5.1 <span class="text-gray-400">- Feb 3, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Enhanced user profile section in settings</li>
                                    <li>Shows avatar, username, and role badge</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.5.0 <span class="text-gray-400">- Feb 3, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Workspaces now properly isolated per user</li>
                                    <li>Fixed workspaces not loading on login</li>
                                    <li>Compact header with more room for workspace names</li>
                                    <li>Long workspace names now truncate properly</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.4.0 <span class="text-gray-400">- Feb 3, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Added Workspaces feature for separate project collections</li>
                                    <li>Create, rename, and delete workspaces</li>
                                    <li>Switch between workspaces from header dropdown</li>
                                    <li>Projects isolated per workspace</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium text-gray-800">v2.3.0 <span class="text-gray-400">- Feb 3, 2026</span></p>
                                <ul class="list-disc pl-4 text-gray-500">
                                    <li>Added demo mode toggle in settings menu</li>
                                    <li>Creates sample projects to showcase features</li>
                                    <li>Toggle removes demo data when disabled</li>
                                </ul>
                            </div>
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

function showDocumentation() {
    closeSettings();
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
            <div class="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div class="p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
                    <div class="flex items-center justify-between">
                        <h3 class="text-lg font-semibold">Documentation</h3>
                        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                    </div>
                </div>
                <div class="p-6 space-y-6 text-sm text-gray-600">

                    <section>
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-blue-600">1.</span> Getting Started
                        </h4>
                        <p class="mb-2">Welcome to the Project Tracker! This application helps you manage integration projects with visual timelines, progress tracking, and team collaboration.</p>
                        <ul class="list-disc pl-5 space-y-1">
                            <li><strong>Login:</strong> Use your credentials to access the system</li>
                            <li><strong>Default Workspace:</strong> A workspace is automatically created for you on first login</li>
                            <li><strong>Navigation:</strong> Use the tabs at the top to switch between views</li>
                        </ul>
                    </section>

                    <section>
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-blue-600">2.</span> Views Explained
                        </h4>
                        <div class="space-y-3">
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <p class="font-medium text-gray-800">Overview (Simple/Detailed Toggle)</p>
                                <p class="text-gray-600 mt-1">Your main dashboard. Use the toggle in the top-right to switch between:</p>
                                <ul class="list-disc pl-5 mt-1">
                                    <li><strong>Simple View:</strong> Compact table with key metrics - great for executive summaries</li>
                                    <li><strong>Detailed View:</strong> Full project cards with timelines, descriptions, and expandable sections</li>
                                </ul>
                            </div>
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <p class="font-medium text-gray-800">Edit Projects</p>
                                <p class="text-gray-600 mt-1">Manage your projects - add new ones, edit existing, or delete. Click any project row to open the edit modal.</p>
                            </div>
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <p class="font-medium text-gray-800">Finished</p>
                                <p class="text-gray-600 mt-1">Archive of completed projects. Projects automatically move here 7 days after reaching 100%. Use "Reactivate" to bring them back.</p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-blue-600">3.</span> Creating & Managing Projects
                        </h4>
                        <ul class="list-disc pl-5 space-y-2">
                            <li><strong>New Project:</strong> Click "+ New Project" on the Edit Projects tab</li>
                            <li><strong>Required Fields:</strong> Project Name, Owner, Start Date, End Date</li>
                            <li><strong>Templates:</strong> Use templates to pre-populate tasks for common project types</li>
                            <li><strong>Sub-tasks:</strong> Break projects into manageable tasks with checkboxes</li>
                            <li><strong>Notes:</strong> Add timestamped notes for progress updates and communication</li>
                            <li><strong>Progress:</strong> Update the percentage manually or let tasks influence it</li>
                        </ul>
                    </section>

                    <section>
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-blue-600">4.</span> Status Colors & Auto-Updates
                        </h4>
                        <div class="grid grid-cols-2 gap-2">
                            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-purple-500"></span> <strong>Discovery</strong> - Initial planning phase</div>
                            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-blue-500"></span> <strong>Active</strong> - Work in progress</div>
                            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-emerald-500"></span> <strong>On Track</strong> - Progressing as expected</div>
                            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-red-500"></span> <strong>Behind</strong> - Past due date (auto-set)</div>
                            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-amber-500"></span> <strong>On Pause</strong> - Temporarily halted</div>
                            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-green-600"></span> <strong>Complete</strong> - 100% done (auto-set)</div>
                        </div>
                        <p class="mt-3 text-xs text-gray-500">Note: Status automatically changes to "Behind" if past end date, and "Complete" when progress reaches 100%.</p>
                    </section>

                    <section>
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-blue-600">5.</span> Workspaces
                        </h4>
                        <ul class="list-disc pl-5 space-y-2">
                            <li><strong>Purpose:</strong> Organize projects into separate collections (e.g., by client, department, or project type)</li>
                            <li><strong>Create:</strong> Click the "+" button next to the workspace dropdown</li>
                            <li><strong>Switch:</strong> Use the dropdown in the header to change workspaces</li>
                            <li><strong>Manage:</strong> Click workspace name > "Manage Workspaces" to rename or delete</li>
                        </ul>
                    </section>

                    <section>
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-blue-600">6.</span> Sharing & Collaboration
                        </h4>
                        <ul class="list-disc pl-5 space-y-2">
                            <li><strong>Share Workspace:</strong> Click workspace name > "Manage Shares" to invite others</li>
                            <li><strong>Permission Levels:</strong>
                                <ul class="list-disc pl-5 mt-1">
                                    <li><strong>Viewer:</strong> Can view projects but cannot edit</li>
                                    <li><strong>Editor:</strong> Can create, edit, and delete projects</li>
                                </ul>
                            </li>
                            <li><strong>Project Sync:</strong> Link a project to appear in multiple workspaces using the sync button</li>
                            <li><strong>Leave Workspace:</strong> Remove yourself from a shared workspace via the workspace menu</li>
                        </ul>
                    </section>

                    <section>
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-blue-600">7.</span> Templates
                        </h4>
                        <ul class="list-disc pl-5 space-y-2">
                            <li><strong>Use Template:</strong> When creating a new project, select a template to auto-fill tasks</li>
                            <li><strong>Create Template:</strong> Open an existing project with tasks > click "Save as Template"</li>
                            <li><strong>Manage:</strong> Settings > "Manage Templates" to edit or delete templates</li>
                            <li><strong>Global Templates:</strong> Admins can create templates available to all users</li>
                        </ul>
                    </section>

                    <section>
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-blue-600">8.</span> Exporting Data
                        </h4>
                        <ul class="list-disc pl-5 space-y-2">
                            <li><strong>PDF Export:</strong> Click "Export" > "PDF" to generate a printable report of current view</li>
                            <li><strong>CSV Export:</strong> Click "Export" > "CSV" to download project data as a spreadsheet</li>
                            <li><strong>Tip:</strong> Use Simple View for cleaner PDF reports</li>
                        </ul>
                    </section>

                    <section>
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-blue-600">9.</span> Activity History (Audit Trail)
                        </h4>
                        <p class="mb-2">Track all changes made to a project:</p>
                        <ul class="list-disc pl-5 space-y-1">
                            <li>Click the clock icon on any project card or in the edit list</li>
                            <li>View who made changes, what changed, and when</li>
                            <li>Tracks: creation, updates, status changes, progress, timeline, notes, and deletions</li>
                        </ul>
                    </section>

                    <section>
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-blue-600">10.</span> Tips & Shortcuts
                        </h4>
                        <ul class="list-disc pl-5 space-y-1">
                            <li><strong>Dark Mode:</strong> Toggle in Settings for eye-friendly viewing</li>
                            <li><strong>Demo Mode:</strong> Load sample data to explore features without affecting real projects</li>
                            <li><strong>Timeline Bar:</strong> The red line shows TODAY's position in the project timeline</li>
                            <li><strong>Last Updated:</strong> Check who last modified a project and when in the project info</li>
                        </ul>
                    </section>

                    ${currentUser?.isAdmin ? `
                    <section class="border-t pt-4">
                        <h4 class="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-purple-600">Admin</span> Features
                        </h4>
                        <ul class="list-disc pl-5 space-y-1">
                            <li><strong>Admin Panel:</strong> Accessible from navigation - manage all users</li>
                            <li><strong>Create Users:</strong> Add new users with username and password</li>
                            <li><strong>Reset Passwords:</strong> Reset any user's password if they're locked out</li>
                            <li><strong>Global Templates:</strong> Create templates available to all users</li>
                        </ul>
                    </section>
                    ` : ''}

                </div>
                <div class="p-4 border-t flex justify-end sticky bottom-0 bg-white">
                    <button onclick="closeModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Close</button>
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

function exportCSV() {
    if (projects.length === 0) {
        alert('No projects to export');
        return;
    }

    const escapeCSV = (str) => {
        if (str === null || str === undefined) return '';
        const s = String(str);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    };

    const headers = ['Name', 'Description', 'Owner', 'Team', 'Start Date', 'End Date', 'Status', 'Progress', 'Tasks Completed', 'Total Tasks', 'Notes Count', 'Created At'];

    const rows = projects.map(p => [
        escapeCSV(p.name),
        escapeCSV(p.description),
        escapeCSV(p.owner),
        escapeCSV(p.team),
        escapeCSV(p.startDate),
        escapeCSV(p.endDate),
        escapeCSV(p.status),
        p.progress + '%',
        (p.tasks || []).filter(t => t.completed).length,
        (p.tasks || []).length,
        (p.notes || []).length,
        escapeCSV(p.createdAt)
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `projects-${currentWorkspace?.name || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

document.addEventListener('click', (e) => {
    const settingsMenu = document.getElementById('settingsMenu');
    const workspaceMenu = document.getElementById('workspaceMenu');
    const exportMenu = document.getElementById('exportMenu');
    if (!e.target.closest('.relative')) {
        if (settingsMenu) closeSettings();
        if (workspaceMenu) closeWorkspaceMenu();
        if (exportMenu) closeExportMenu();
    }
});

// Initialize
(async () => {
    // Check Microsoft SSO availability
    await checkMicrosoftSSO();

    // Handle OAuth callback (token in URL)
    handleOAuthCallback();

    if (await checkAuth()) {
        await loadWorkspaces();
        await loadProjects();
        await loadTemplates();
    }
    render();
})();
