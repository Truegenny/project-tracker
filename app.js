// State Management
let projects = JSON.parse(localStorage.getItem('projects')) || [];
let currentView = 'overview';
let editingProject = null;
let darkMode = localStorage.getItem('darkMode') === 'true';

// Apply dark mode on load
if (darkMode) document.body.classList.add('dark');

// Auto-update statuses on load
const updateAllStatuses = () => {
    let changed = false;
    projects.forEach(p => {
        const oldStatus = p.status;
        autoUpdateStatus(p);
        if (oldStatus !== p.status) changed = true;
    });
    if (changed) saveProjects();
};


const saveProjects = () => localStorage.setItem('projects', JSON.stringify(projects));

// Utility Functions
const formatDate = (date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const daysBetween = (d1, d2) => Math.ceil((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

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
    'complete': 'bg-gray-500'
}[status] || 'bg-gray-500');

const getStatusBg = (status) => ({
    'on-track': 'bg-emerald-100 text-emerald-800',
    'behind': 'bg-red-100 text-red-800',
    'active': 'bg-blue-100 text-blue-800',
    'on-pause': 'bg-amber-100 text-amber-800',
    'discovery': 'bg-purple-100 text-purple-800',
    'complete': 'bg-gray-200 text-gray-700'
}[status] || 'bg-gray-100 text-gray-800');

const autoUpdateStatus = (project) => {
    const isPastDue = new Date() > new Date(project.endDate);
    if (project.progress >= 100) {
        project.status = 'complete';
    } else if (isPastDue && project.status !== 'on-pause') {
        project.status = 'behind';
    }
    return project;
};

const sortByBehindFirst = (arr) => [...arr].sort((a, b) => (a.status === 'behind' ? -1 : b.status === 'behind' ? 1 : 0));

// Components
const Header = () => `
    <header class="bg-white shadow-sm border-b border-gray-200 no-print">
        <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <h1 class="text-2xl font-bold text-gray-900">Ntiva Integration Project Tracker <span class="text-sm font-normal text-blue-600">Beta</span></h1>
            <nav class="flex gap-2">
                <button onclick="switchView('simple')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'simple' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Simple</button>
                <button onclick="switchView('overview')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'overview' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Overview</button>
                <button onclick="switchView('edit')" class="px-4 py-2 rounded-lg font-medium transition ${currentView === 'edit' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Edit Projects</button>
                <button onclick="exportPDF()" class="px-4 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition">Export PDF</button>
                <button onclick="toggleDarkMode()" class="px-3 py-2 rounded-lg font-medium bg-gray-700 text-white hover:bg-gray-800 transition">${darkMode ? '☀️' : '🌙'}</button>
            </nav>
        </div>
    </header>
`;

const ProjectCard = (project) => {
    const timelineProgress = getTimelineProgress(project.startDate, project.endDate);
    const totalDays = daysBetween(project.startDate, project.endDate);
    const daysRemaining = daysBetween(new Date(), project.endDate);
    const hasStarted = new Date() >= new Date(project.startDate);

    return `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-4" data-project-id="${project.id}">
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

            <!-- Timeline -->
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

            <!-- Progress Bar -->
            <div class="mb-4">
                <div class="text-sm text-gray-600 mb-2 font-medium">Progress</div>
                <div class="progress-bar">
                    <div class="progress-fill ${getStatusColor(project.status)}" style="width: ${Math.max(project.progress, 8)}%">
                        <span>${project.progress}%</span>
                    </div>
                </div>
            </div>

            <!-- Tasks Dropdown -->
            ${project.tasks && project.tasks.length > 0 ? `
                <div class="border-t pt-4">
                    <button onclick="toggleTasks('${project.id}')" class="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                        <svg class="w-4 h-4 transition-transform" id="arrow-${project.id}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                        Sub-tasks (${project.tasks.filter(t => t.completed).length}/${project.tasks.length})
                    </button>
                    <div class="dropdown-content mt-2" id="tasks-${project.id}">
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

const OverviewPage = () => `
    <div id="export-content" class="max-w-7xl mx-auto px-4 py-8">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-semibold text-gray-900">Project Overview</h2>
            <p class="text-gray-500 text-sm">Last updated: ${new Date().toLocaleString()}</p>
        </div>
        ${projects.length === 0 ? `
            <div class="text-center py-12 bg-white rounded-xl border border-gray-200">
                <p class="text-gray-500">No projects yet. Go to Edit Projects to add one.</p>
            </div>
        ` : projects.map(ProjectCard).join('')}
    </div>
`;

const SimplePage = () => {
    const sorted = sortByBehindFirst(projects);
    return `
    <div id="export-content" class="max-w-7xl mx-auto px-4 py-8">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-semibold text-gray-900">Simplified Overview</h2>
            <p class="text-gray-500 text-sm">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
        ${projects.length === 0 ? `
            <div class="text-center py-12 bg-white rounded-xl border border-gray-200">
                <p class="text-gray-500">No projects yet.</p>
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
                        const daysLeft = daysBetween(new Date(), p.endDate);
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
                                <button onclick="openProjectModal('${p.id}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium mr-2">Edit</button>
                                <button onclick="deleteProject('${p.id}')" class="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
`;

const ProjectModal = (project = null) => `
    <div id="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target.id==='modal')closeModal()">
        <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b border-gray-200">
                <h3 class="text-lg font-semibold">${project ? 'Edit Project' : 'New Project'}</h3>
            </div>
            <form onsubmit="saveProject(event)" class="p-6 space-y-4">
                <input type="hidden" id="projectId" value="${project?.id || ''}">

                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
                        <input type="text" id="projectName" value="${project?.name || ''}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
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

                <div class="border-t pt-4 mt-4">
                    <div class="flex justify-between items-center mb-2">
                        <label class="text-sm font-medium text-gray-700">Sub-tasks</label>
                        <button type="button" onclick="addTaskField()" class="text-sm text-blue-600 hover:text-blue-800">+ Add Task</button>
                    </div>
                    <div id="tasksList" class="space-y-2">
                        ${(project?.tasks || []).map((t, i) => `
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
    updateAllStatuses();
    const pages = { simple: SimplePage, overview: OverviewPage, edit: EditPage };
    document.getElementById('app').innerHTML = Header() + (pages[currentView] || OverviewPage)();
}

function switchView(view) {
    currentView = view;
    render();
}

function toggleDarkMode() {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode);
    document.body.classList.toggle('dark', darkMode);
    render();
}

function toggleTasks(projectId) {
    const content = document.getElementById(`tasks-${projectId}`);
    const arrow = document.getElementById(`arrow-${projectId}`);
    content.classList.toggle('open');
    arrow.style.transform = content.classList.contains('open') ? 'rotate(180deg)' : '';
}

function openProjectModal(projectId = null) {
    const project = projectId ? projects.find(p => p.id === projectId) : null;
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

function saveProject(e) {
    e.preventDefault();
    const id = document.getElementById('projectId').value;
    const tasks = Array.from(document.querySelectorAll('.task-row')).map(row => ({
        name: row.querySelector('.task-name').value,
        completed: row.querySelector('.task-completed').checked
    })).filter(t => t.name.trim());

    const projectData = {
        id: id || generateId(),
        name: document.getElementById('projectName').value,
        description: document.getElementById('projectDesc').value,
        owner: document.getElementById('projectOwner').value,
        team: document.getElementById('projectTeam').value,
        startDate: document.getElementById('projectStart').value,
        endDate: document.getElementById('projectEnd').value,
        status: document.getElementById('projectStatus').value,
        progress: parseInt(document.getElementById('projectProgress').value) || 0,
        tasks
    };

    if (id) {
        const idx = projects.findIndex(p => p.id === id);
        projects[idx] = projectData;
    } else {
        projects.push(projectData);
    }

    saveProjects();
    closeModal();
    render();
}

function deleteProject(id) {
    if (confirm('Delete this project?')) {
        projects = projects.filter(p => p.id !== id);
        saveProjects();
        render();
    }
}

async function exportPDF() {
    const { jsPDF } = window.jspdf;
    const content = document.getElementById('export-content');
    if (!content) { alert('Switch to Simple or Overview to export'); return; }

    // Expand all dropdowns for export
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

    // Collapse dropdowns back
    document.querySelectorAll('.dropdown-content').forEach(el => el.classList.remove('open'));
}

// Initialize
render();
