/*
  Grafik Pracy BLDSRV - Application Logic (V4)
  Implements advanced state management, LocalStorage persistence,
  dynamic autocomplete stack, preset columns, category blocks,
  unrecognized name interactive workflows, collaborator tracking,
  and a 200-action Undo/Redo engine.
  V4 updates: time auto-formatting, direct card deletion, 3-column modal footer,
  global modal Enter-save, cursor placement fixes, and adjusted deletion prompts.
*/

// --- INITIAL DATA SEEDING ---
const DEFAULT_EMPLOYEES = [
  { id: 'emp-1', name: 'Bartosz Toporowski', role: 'Administrator' },
  { id: 'emp-2', name: 'Jan Kowalski', role: 'Osoba' },
  { id: 'emp-3', name: 'Anna Nowak', role: 'Osoba' },
  { id: 'emp-4', name: 'Piotr Zieliński', role: 'Osoba' },
  { id: 'emp-5', name: 'Snizhana Fedunyshyn', role: 'Osoba' }
];

const DEFAULT_CATEGORIES = [
  {
    id: 'cat-1',
    name: 'Cleaning',
    tasks: ['Cleaning 1.0', 'Cleaning 2.0', 'Cleaning 2.1']
  },
  {
    id: 'cat-2',
    name: 'Housekeeping & Laundry',
    tasks: ['Housekeeping', 'Laundry (Pralnia)']
  }
];

const DEFAULT_SHIFTS = [
  // Poniedziałek - Cleaning 1.0
  { id: 'shift-1', taskId: 'Cleaning 1.0', day: 'Poniedziałek', employeeId: 'emp-2', time: '08:00–12:00' },
  { id: 'shift-2', taskId: 'Cleaning 1.0', day: 'Poniedziałek', employeeId: 'emp-3', time: '08:00–12:00' },
  { id: 'shift-3', taskId: 'Cleaning 1.0', day: 'Poniedziałek', employeeId: 'emp-4', time: '13:00–17:00' },
  // Środa - Cleaning 2.0
  { id: 'shift-4', taskId: 'Cleaning 2.0', day: 'Środa', employeeId: 'emp-4', time: '08:00–12:00' },
  // Piątek - Laundry (Pralnia)
  { id: 'shift-5', taskId: 'Laundry (Pralnia)', day: 'Piątek', employeeId: 'emp-5', time: '10:00–14:00' }
];

const DEFAULT_PRESETS = [
  { label: 'Rano (08-12)', time: '08:00–12:00' },
  { label: 'Popołudnie (13-17)', time: '13:00–17:00' },
  { label: 'Cały etat (08-16)', time: '08:00–16:00' },
  { label: 'Środek (10-14)', time: '10:00–14:00' },
  { label: '1 godzina', time: '1h' },
  { label: '2 godziny', time: '2h' }
];

const DAYS_OF_WEEK = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek'];

// --- STATE ---
let state = {
  employees: [],
  categories: [],
  shifts: [],
  presets: [],
  currentProfileId: '',
  activeTab: 'full-schedule', // 'my-tasks', 'full-schedule', 'manage-team'
  selectedRoleForNewPerson: 'Osoba',
  
  // Modal Context
  editingShiftId: null,
  activeCellTask: null,
  activeCellDay: null,
  modalPeople: [''], // Array of strings holding current name inputs in modal
  activeSuggestionIndex: -1,
  
  // Unrecognized Names Workflow Context
  unrecognizedNames: [],
  pendingSaveCallback: null
};

// --- COLLAPSIBLE CATEGORIES ---
let collapsedCategories = new Set();

function toggleCategoryCollapse(categoryId) {
  if (collapsedCategories.has(categoryId)) {
    collapsedCategories.delete(categoryId);
  } else {
    collapsedCategories.add(categoryId);
  }
  renderFullScheduleView();
}

// --- UNDO / REDO SYSTEM (200 actions) ---
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 200;

function recordAction() {
  const snapshot = JSON.stringify({
    employees: state.employees,
    categories: state.categories,
    shifts: state.shifts,
    presets: state.presets
  });
  
  if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapshot) {
    return;
  }
  
  undoStack.push(snapshot);
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  
  redoStack = [];
  updateUndoRedoButtons();
}

function undo() {
  if (undoStack.length === 0) return;
  
  const currentSnapshot = JSON.stringify({
    employees: state.employees,
    categories: state.categories,
    shifts: state.shifts,
    presets: state.presets
  });
  redoStack.push(currentSnapshot);
  
  const prevSnapshot = JSON.parse(undoStack.pop());
  state.employees = prevSnapshot.employees;
  state.categories = prevSnapshot.categories;
  state.shifts = prevSnapshot.shifts;
  state.presets = prevSnapshot.presets;
  
  saveStateToStorage();
  
  const exists = state.employees.some(e => e.id === state.currentProfileId);
  if (!exists) {
    const admin = state.employees.find(e => e.role === 'Administrator');
    state.currentProfileId = admin ? admin.id : state.employees[0]?.id || '';
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
  }
  
  populateProfileDropdown();
  updateRoleMode();
  renderActiveView();
  updateUndoRedoButtons();
  
  showToast('Cofnięto ostatnią akcję');
}

function redo() {
  if (redoStack.length === 0) return;
  
  const currentSnapshot = JSON.stringify({
    employees: state.employees,
    categories: state.categories,
    shifts: state.shifts,
    presets: state.presets
  });
  undoStack.push(currentSnapshot);
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  
  const nextSnapshot = JSON.parse(redoStack.pop());
  state.employees = nextSnapshot.employees;
  state.categories = nextSnapshot.categories;
  state.shifts = nextSnapshot.shifts;
  state.presets = nextSnapshot.presets;
  
  saveStateToStorage();
  
  const exists = state.employees.some(e => e.id === state.currentProfileId);
  if (!exists) {
    const admin = state.employees.find(e => e.role === 'Administrator');
    state.currentProfileId = admin ? admin.id : state.employees[0]?.id || '';
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
  }
  
  populateProfileDropdown();
  updateRoleMode();
  renderActiveView();
  updateUndoRedoButtons();
  
  showToast('Przywrócono akcję');
}

function updateUndoRedoButtons() {
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  if (btnUndo) btnUndo.disabled = undoStack.length === 0;
  if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}


// --- INITIALIZATION ---
function initApp() {
  state.employees = JSON.parse(localStorage.getItem('bldsrv_employees')) || DEFAULT_EMPLOYEES;
  state.categories = JSON.parse(localStorage.getItem('bldsrv_categories')) || DEFAULT_CATEGORIES;
  state.shifts = JSON.parse(localStorage.getItem('bldsrv_shifts')) || DEFAULT_SHIFTS;
  state.presets = JSON.parse(localStorage.getItem('bldsrv_presets')) || DEFAULT_PRESETS;
  
  migrateOldNaming();
  saveStateToStorage();

  const savedProfileId = localStorage.getItem('bldsrv_active_profile');
  const exists = state.employees.some(e => e.id === savedProfileId);
  if (savedProfileId && exists) {
    state.currentProfileId = savedProfileId;
  } else {
    const admin = state.employees.find(e => e.role === 'Administrator');
    state.currentProfileId = admin ? admin.id : state.employees[0]?.id || '';
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
  }

  setupEventListeners();
  populateProfileDropdown();
  updateRoleMode();
  renderTabs();
  renderActiveView();
  updateUndoRedoButtons();
}

function migrateOldNaming() {
  let changed = false;
  state.employees.forEach(emp => {
    if (emp.role === 'Nadzorca') {
      emp.role = 'Administrator';
      changed = true;
    } else if (emp.role === 'Pracownik') {
      emp.role = 'Osoba';
      changed = true;
    }
  });
  if (changed) {
    saveStateToStorage();
  }
}

function saveStateToStorage() {
  localStorage.setItem('bldsrv_employees', JSON.stringify(state.employees));
  localStorage.setItem('bldsrv_categories', JSON.stringify(state.categories));
  localStorage.setItem('bldsrv_shifts', JSON.stringify(state.shifts));
  localStorage.setItem('bldsrv_presets', JSON.stringify(state.presets));
}

function getCurrentProfile() {
  return state.employees.find(e => e.id === state.currentProfileId) || state.employees[0];
}

function updateRoleMode() {
  const profile = getCurrentProfile();
  const body = document.body;
  const tabManageTeamBtn = document.getElementById('tabManageTeam');
  const adminScheduleControls = document.getElementById('adminScheduleControls');
  const undoRedoHeader = document.getElementById('undoRedoHeader');
  
  if (!profile) return;

  if (profile.role === 'Administrator') {
    body.classList.add('app-mode-administrator');
    tabManageTeamBtn.classList.remove('hidden');
    adminScheduleControls.classList.remove('hidden');
    undoRedoHeader.classList.remove('hidden');
  } else {
    body.classList.remove('app-mode-administrator');
    tabManageTeamBtn.classList.add('hidden');
    adminScheduleControls.classList.add('hidden');
    undoRedoHeader.classList.add('hidden');
    
    document.getElementById('addCategoryFormContainer').classList.add('hidden');
    document.getElementById('btnShowAddCategory').classList.remove('hidden');
    
    if (state.activeTab === 'manage-team') {
      switchTab('full-schedule');
    }
  }
}

function populateProfileDropdown() {
  const select = document.getElementById('profileSelect');
  select.innerHTML = '';
  
  state.employees.forEach(emp => {
    const option = document.createElement('option');
    option.value = emp.id;
    option.textContent = `${emp.name} (${emp.role})`;
    if (emp.id === state.currentProfileId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  renderTabs();
  renderActiveView();
}

function renderTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    const dataTab = tab.getAttribute('data-tab');
    if (dataTab === state.activeTab) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  const sections = {
    'my-tasks': document.getElementById('contentMyTasks'),
    'full-schedule': document.getElementById('contentFullSchedule'),
    'manage-team': document.getElementById('contentManageTeam')
  };

  Object.keys(sections).forEach(key => {
    if (key === state.activeTab) {
      sections[key].classList.remove('hidden');
    } else {
      sections[key].classList.add('hidden');
    }
  });
}

function renderActiveView() {
  if (state.activeTab === 'my-tasks') {
    renderMyTasksView();
  } else if (state.activeTab === 'full-schedule') {
    renderFullScheduleView();
  } else if (state.activeTab === 'manage-team') {
    renderTeamManagementView();
  }
}

// --- HELPER: Time Overlap ---
function parseTimeRange(timeStr) {
  const clean = timeStr.trim();
  if (clean === '1h' || clean === '2h') return null;
  const parts = clean.split(/[-–—]/);
  if (parts.length < 2) return null;
  const toMinutes = (s) => {
    const trimmed = s.trim();
    const [h, m] = trimmed.split(':').map(Number);
    if (isNaN(h)) return null;
    return h * 60 + (isNaN(m) ? 0 : m);
  };
  const start = toMinutes(parts[0]);
  const end = toMinutes(parts[parts.length - 1]);
  if (start === null || end === null) return null;
  return { start, end };
}

function timesOverlap(timeA, timeB) {
  const a = parseTimeRange(timeA);
  const b = parseTimeRange(timeB);
  if (!a || !b) return true;
  return a.start < b.end && b.start < a.end;
}

// --- VIEW 1: MY TASKS ---
function renderMyTasksView() {
  const profile = getCurrentProfile();
  if (!profile) return;
  
  document.getElementById('myTasksUserName').textContent = profile.name;
  
  const date = new Date();
  let currentDayIndex = date.getDay() - 1; 
  if (currentDayIndex < 0 || currentDayIndex > 4) {
    currentDayIndex = -1;
  }
  
  const container = document.getElementById('myTasksGrid');
  container.innerHTML = '';
  
  DAYS_OF_WEEK.forEach((day, index) => {
    const isToday = index === currentDayIndex;
    const dayShifts = state.shifts.filter(s => s.employeeId === profile.id && s.day === day);
    
    const card = document.createElement('div');
    card.className = `day-column-card ${isToday ? 'is-today' : ''}`;
    
    let shiftsHtml = '';
    if (dayShifts.length > 0) {
      dayShifts.forEach(shift => {
        const coworkers = state.shifts.filter(s => 
          s.taskId === shift.taskId && 
          s.day === shift.day && 
          s.employeeId !== profile.id &&
          timesOverlap(shift.time, s.time)
        );
        
        let coworkersHtml = '';
        if (coworkers.length > 0) {
          coworkersHtml += `
            <div class="coworkers-section">
              <span class="coworkers-label">Współpracownicy:</span>
              <ul class="coworkers-list-mini">
          `;
          coworkers.forEach(coworkerShift => {
            const cowName = state.employees.find(e => e.id === coworkerShift.employeeId)?.name || 'Nieznany';
            coworkersHtml += `
              <li class="coworker-item-mini">
                <span class="coworker-name-group">
                  <span>${cowName}</span>
                </span>
                <span class="coworker-time-badge">${coworkerShift.time}</span>
              </li>
            `;
          });
          coworkersHtml += `</ul></div>`;
        }
        
        shiftsHtml += `
          <div class="shift-card">
            <div class="shift-card-header">
              <span class="employee-name">${shift.time}</span>
            </div>
            <span class="shift-task-badge">${shift.taskId}</span>
            ${coworkersHtml}
          </div>
        `;
      });
    } else {
      shiftsHtml = `<p class="no-tasks-text">Brak zaplanowanych zadań</p>`;
    }
    
    card.innerHTML = `
      <div class="day-column-header">
        <span class="day-name-label">${day}</span>
        ${isToday ? '<span class="today-badge">DZISIAJ</span>' : ''}
      </div>
      <div class="day-column-body">
        ${shiftsHtml}
      </div>
    `;
    
    container.appendChild(card);
  });
}

// --- VIEW 2: FULL SCHEDULE ---
function renderFullScheduleView() {
  const container = document.getElementById('categoriesContainer');
  container.innerHTML = '';
  
  const profile = getCurrentProfile();
  const isAdmin = profile && profile.role === 'Administrator';
  
  if (state.categories.length === 0) {
    container.innerHTML = `<p class="no-tasks-text">Brak zdefiniowanych kategorii. Dodaj pierwszą jako Administrator.</p>`;
    return;
  }
  
  state.categories.forEach(cat => {
    const block = document.createElement('div');
    block.className = 'category-block';
    block.setAttribute('data-category-id', cat.id);
    
    let deleteCategoryBtn = '';
    if (isAdmin) {
      deleteCategoryBtn = `
        <button class="btn-delete-category" onclick="deleteCategory('${cat.id}')" title="Usuń kategorię">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;
    }
    
    let editCategoryBtn = '';
    if (isAdmin) {
      editCategoryBtn = `
        <button class="btn-edit-category" onclick="editCategoryName('${cat.id}')" title="Edytuj nazwę kategorii">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
      `;
    }
    
    const isCollapsed = collapsedCategories.has(cat.id);
    const headerHtml = `
      <div class="category-title-container ${isCollapsed ? 'collapsed' : ''}">
        <button class="btn-collapse-category" onclick="toggleCategoryCollapse('${cat.id}')" title="${isCollapsed ? 'Rozwiń' : 'Zwiń'}">${isCollapsed ? '▶' : '▼'}</button>
        <span class="category-title">${cat.name}</span>
        ${editCategoryBtn}
        ${deleteCategoryBtn}
        <span class="drag-handle-area" title="Przeciągnij aby przenieść">⠿</span>
      </div>
    `;
    
    let tableHtml = `
      <div class="schedule-table-wrapper">
        <table class="schedule-table">
          <thead>
            <tr>
              <th class="col-task">ZADANIE</th>
              <th class="col-day" data-day-index="0">PONIEDZIAŁEK</th>
              <th class="col-day" data-day-index="1">WTOREK</th>
              <th class="col-day" data-day-index="2">ŚRODA</th>
              <th class="col-day" data-day-index="3">CZWARTEK</th>
              <th class="col-day" data-day-index="4">PIĄTEK</th>
            </tr>
          </thead>
          <tbody class="category-table-body" data-category-id="${cat.id}">
            <!-- Task rows -->
          </tbody>
        </table>
      </div>
    `;
    
    let footerHtml = '';
    if (isAdmin) {
      footerHtml = `
        <div class="category-footer">
          <div class="inline-add-task">
            <input type="text" placeholder="Nazwa nowego zadania..." class="input-new-task" data-category-id="${cat.id}">
            <button class="btn btn-success" onclick="handleAddTask('${cat.id}')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Dodaj zadanie
            </button>
          </div>
        </div>
      `;
    }
    
    block.innerHTML = headerHtml + `<div class="category-collapsible${isCollapsed ? ' hidden' : ''}">` + tableHtml + footerHtml + `</div>`;
    container.appendChild(block);
    
    const tbody = block.querySelector('.category-table-body');
    tbody.innerHTML = '';

    const currentDate = new Date();
    // getDay() zwraca 0 dla niedzieli, 1 dla poniedziałku...
    // Chcemy 0 dla Poniedziałku, 4 dla Piątku.
    let currentDayIdx = currentDate.getDay() - 1; 
    if (currentDayIdx < 0 || currentDayIdx > 4) {
      currentDayIdx = -1;
    }

    // Podświetlenie nagłówka dnia
    const dayHeaders = block.querySelectorAll('.schedule-table th.col-day');
    dayHeaders.forEach((header, index) => {
        if (index === currentDayIdx) {
            header.classList.add('col-today-th');
        }
    });
    
    cat.tasks.forEach((task, taskIdx) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-task-name', task);
      tr.setAttribute('data-category-id', cat.id);
      
      const tdTask = document.createElement('td');
      tdTask.className = 'cell-task-name';
      
      let deleteTaskBtn = '';
      if (isAdmin) {
        deleteTaskBtn = `
          <button class="btn-delete-task" onclick="deleteTask('${cat.id}', '${task}')" title="Usuń zadanie">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        `;
      }
      
      let editTaskBtn = '';
      if (isAdmin) {
        editTaskBtn = `
          <button class="btn-edit-task" onclick="editTaskName('${cat.id}', '${task}')" title="Edytuj nazwę zadania">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        `;
      }
      
      tdTask.innerHTML = `
        <div class="task-name-wrapper">
          <span>${task}</span>
          ${editTaskBtn}
          ${deleteTaskBtn}
          <span class="drag-handle-area" title="Przeciągnij aby przenieść">⠿</span>
        </div>
      `;
      tr.appendChild(tdTask);
      
      DAYS_OF_WEEK.forEach((day, dayIndex) => {
        const tdDay = document.createElement('td');
        tdDay.className = 'cell-day';
        if (dayIndex === currentDayIdx) {
          tdDay.classList.add('col-today-td');
        }
        
        tdDay.setAttribute('data-task', task);
        tdDay.setAttribute('data-day', day);
        
        const cellShifts = state.shifts.filter(s => s.taskId === task && s.day === day);
        
        const shiftsContainer = document.createElement('div');
        shiftsContainer.className = 'shifts-container';
        
        cellShifts.forEach(shift => {
          const emp = state.employees.find(e => e.id === shift.employeeId);
          const empName = emp ? emp.name : 'Nieznana osoba';
          
          // Hover-triggered card delete button (Point 6)
          let deleteCardBtn = '';
          if (isAdmin) {
            deleteCardBtn = `
              <button class="shift-card-delete-btn" title="Usuń dyżur z grafiku">
                &times;
              </button>
            `;
          }
          
          const card = document.createElement('div');
          card.className = 'shift-card';
          card.setAttribute('data-shift-id', shift.id);
          card.innerHTML = `
            <div class="shift-card-header">
              <span class="employee-name">${empName}</span>
              ${deleteCardBtn}
            </div>
            <div class="shift-card-body">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>${shift.time}</span>
            </div>
          `;
          
          // Click on shift card to edit (Admin only)
          card.addEventListener('click', (e) => {
            if (isAdmin) {
              e.stopPropagation(); 
              openAssignModal(task, day, shift.id);
            }
          });
          
          // Bind direct delete card button click (Point 6 & 9: instantly without double prompt)
          if (isAdmin && deleteCardBtn !== '') {
            const cardDelBtn = card.querySelector('.shift-card-delete-btn');
            cardDelBtn.addEventListener('click', (e) => {
              e.stopPropagation(); // prevent modal
              recordAction();
              state.shifts = state.shifts.filter(s => s.id !== shift.id);
              saveStateToStorage();
              renderFullScheduleView();
              showToast('Usunięto dyżur z grafiku');
            });
          }
          
          shiftsContainer.appendChild(card);
        });
        
        tdDay.appendChild(shiftsContainer);
        
        tdDay.addEventListener('click', () => {
          if (isAdmin) {
            openAssignModal(task, day);
          }
        });
        
        tr.appendChild(tdDay);
      });
      
      tbody.appendChild(tr);
    });
    
    // Always-visible add-task button at bottom of task list
    if (isAdmin) {
      const addRow = document.createElement('tr');
      addRow.className = 'add-task-row';
      const addCell = document.createElement('td');
      addCell.colSpan = 6;
      addCell.innerHTML = `
        <div class="inline-add-task-inline">
          <button class="btn-add-task-inline" title="Dodaj nowe zadanie">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Dodaj zadanie
          </button>
          <input type="text" class="input-new-task-inline" placeholder="Nazwa zadania..." autocomplete="off" style="display:none">
          <button class="btn btn-success btn-sm btn-confirm-task-inline" style="display:none">Dodaj</button>
          <button class="btn btn-text btn-sm btn-cancel-task-inline" style="display:none">Anuluj</button>
        </div>
      `;
      tbody.appendChild(addRow);
      
      const addBtn = addCell.querySelector('.btn-add-task-inline');
      const taskInput = addCell.querySelector('.input-new-task-inline');
      const confirmBtn = addCell.querySelector('.btn-confirm-task-inline');
      const cancelBtn = addCell.querySelector('.btn-cancel-task-inline');
      
      const showInput = () => {
        addBtn.style.display = 'none';
        taskInput.style.display = '';
        confirmBtn.style.display = '';
        cancelBtn.style.display = '';
        taskInput.focus();
      };
      
      const hideInput = () => {
        addBtn.style.display = '';
        taskInput.style.display = 'none';
        confirmBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        taskInput.value = '';
      };
      
      const doAdd = () => {
        const name = taskInput.value.trim();
        if (!name) return;
        const catIndex = state.categories.findIndex(c => c.id === cat.id);
        if (catIndex === -1) return;
        const exists = state.categories[catIndex].tasks.some(t => t.toLowerCase() === name.toLowerCase());
        if (exists) {
          showToast('Zadanie o tej nazwie już istnieje w tej kategorii', 'danger');
          return;
        }
        recordAction();
        state.categories[catIndex].tasks.push(name);
        saveStateToStorage();
        renderFullScheduleView();
        showToast(`Dodano zadanie "${name}"`);
      };
      
      addBtn.addEventListener('click', showInput);
      confirmBtn.addEventListener('click', doAdd);
      cancelBtn.addEventListener('click', hideInput);
      taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
        if (e.key === 'Escape') { e.preventDefault(); hideInput(); }
      });
    }
    
    if (isAdmin) {
      const taskInput = block.querySelector('.input-new-task');
      if (taskInput) {
        taskInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            handleAddTask(cat.id);
          }
        });
      }
    }
  });
  
  enableCategoryDragDrop();
  state.categories.forEach(cat => enableTaskDragDrop(cat.id));
}

// --- MOVE CATEGORIES & TASKS (ARROW BUTTONS) ---
function moveCategory(categoryId, direction) {
  const index = state.categories.findIndex(c => c.id === categoryId);
  if (index === -1) return;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.categories.length) return;
  recordAction();
  const [removed] = state.categories.splice(index, 1);
  state.categories.splice(newIndex, 0, removed);
  saveStateToStorage();
  renderFullScheduleView();
}

function moveTask(categoryId, taskName, direction) {
  const catIndex = state.categories.findIndex(c => c.id === categoryId);
  if (catIndex === -1) return;
  const tasks = state.categories[catIndex].tasks;
  const index = tasks.indexOf(taskName);
  if (index === -1) return;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= tasks.length) return;
  recordAction();
  const [removed] = tasks.splice(index, 1);
  tasks.splice(newIndex, 0, removed);
  saveStateToStorage();
  renderFullScheduleView();
}

// --- DRAG & DROP ---
let dragData = null;

function enableCategoryDragDrop() {
  const container = document.getElementById('categoriesContainer');
  
  container.querySelectorAll('.category-title-container').forEach(header => {
    header.setAttribute('draggable', 'true');
    
    header.addEventListener('dragstart', (e) => {
      const block = header.closest('.category-block');
      const id = block.getAttribute('data-category-id');
      dragData = { type: 'category', id };
      e.dataTransfer.effectAllowed = 'move';
      block.classList.add('dragging');
      const ghost = document.createElement('div');
      const titleEl = block.querySelector('.category-title');
      ghost.textContent = titleEl ? titleEl.textContent : 'Kategoria';
      ghost.style.cssText = 'padding:6px 16px;background:#82b440;color:#fff;border-radius:6px;font-weight:600;font-size:12px;white-space:nowrap';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 100, 16);
      requestAnimationFrame(() => ghost.remove());
    });
    
    header.addEventListener('dragend', () => {
      container.querySelectorAll('.category-block').forEach(b => b.classList.remove('dragging', 'drag-before', 'drag-after'));
      dragData = null;
    });
  });
  
  container.querySelectorAll('.category-block').forEach(block => {
    block.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragData || dragData.type !== 'category') return;
      const rect = block.getBoundingClientRect();
      const y = e.clientY - rect.top;
      block.classList.toggle('drag-before', y < rect.height / 2);
      block.classList.toggle('drag-after', y >= rect.height / 2);
    });
    
    block.addEventListener('dragleave', () => {
      block.classList.remove('drag-before', 'drag-after');
    });
    
    block.addEventListener('drop', (e) => {
      e.preventDefault();
      block.classList.remove('drag-before', 'drag-after');
      if (!dragData || dragData.type !== 'category') return;
      const draggedId = dragData.id;
      const targetId = block.getAttribute('data-category-id');
      if (draggedId === targetId) return;
      
      const draggedBlock = container.querySelector(`.category-block[data-category-id="${draggedId}"]`);
      if (!draggedBlock) return;
      
      const rect = block.getBoundingClientRect();
      const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
      
      pos === 'after' && block.nextSibling
        ? container.insertBefore(draggedBlock, block.nextSibling)
        : container.insertBefore(draggedBlock, block);
      
      const draggedIndex = state.categories.findIndex(c => c.id === draggedId);
      const insertAt = Array.from(container.children).indexOf(draggedBlock);
      const [removed] = state.categories.splice(draggedIndex, 1);
      state.categories.splice(insertAt, 0, removed);
      recordAction();
      saveStateToStorage();
    });
  });
}

function enableTaskDragDrop(categoryId) {
  const tbody = document.querySelector(`.category-table-body[data-category-id="${categoryId}"]`);
  if (!tbody) return;
  
  tbody.querySelectorAll('.task-name-wrapper').forEach(wrapper => {
    wrapper.setAttribute('draggable', 'true');
    
    wrapper.addEventListener('dragstart', (e) => {
      const row = wrapper.closest('tr');
      if (row.classList.contains('add-task-row')) { e.preventDefault(); return; }
      dragData = { type: 'task', categoryId, taskName: row.getAttribute('data-task-name') };
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
      const ghost = document.createElement('div');
      ghost.textContent = row.getAttribute('data-task-name') || 'Zadanie';
      ghost.style.cssText = 'padding:4px 12px;background:#82b440;color:#fff;border-radius:4px;font-weight:600;font-size:11px;white-space:nowrap';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 80, 14);
      requestAnimationFrame(() => ghost.remove());
    });
    
    wrapper.addEventListener('dragend', () => {
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('dragging', 'drag-before', 'drag-after'));
      if (dragData && dragData.type === 'task' && dragData.categoryId === categoryId) dragData = null;
    });
  });
  
  tbody.querySelectorAll('tr:not(.add-task-row)').forEach(row => {
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragData || dragData.type !== 'task' || dragData.categoryId !== categoryId) return;
      const rect = row.getBoundingClientRect();
      const y = e.clientY - rect.top;
      row.classList.toggle('drag-before', y < rect.height / 2);
      row.classList.toggle('drag-after', y >= rect.height / 2);
    });
    
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-before', 'drag-after');
    });
    
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-before', 'drag-after');
      if (!dragData || dragData.type !== 'task' || dragData.categoryId !== categoryId) return;
      
      const draggedTask = dragData.taskName;
      const targetTask = row.getAttribute('data-task-name');
      if (draggedTask === targetTask) return;
      
      const draggedRow = tbody.querySelector(`tr[data-task-name="${CSS.escape(draggedTask)}"]`);
      if (!draggedRow) return;
      
      const rect = row.getBoundingClientRect();
      const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
      
      pos === 'after' && row.nextSibling
        ? tbody.insertBefore(draggedRow, row.nextSibling)
        : tbody.insertBefore(draggedRow, row);
      
      const catIndex = state.categories.findIndex(c => c.id === categoryId);
      if (catIndex === -1) return;
      const tasks = state.categories[catIndex].tasks;
      const draggedIndex = tasks.indexOf(draggedTask);
      const insertAt = Array.from(tbody.querySelectorAll('tr:not(.add-task-row)')).indexOf(draggedRow);
      const [removed] = tasks.splice(draggedIndex, 1);
      tasks.splice(insertAt, 0, removed);
      recordAction();
      saveStateToStorage();
    });
  });
}

// --- CATEGORIES & TASKS ACTIONS (Point 10: keep prompts for categories and tasks) ---
function handleAddTask(categoryId) {
  const block = document.querySelector(`.category-block[data-category-id="${categoryId}"]`);
  const input = block.querySelector('.input-new-task');
  const taskName = input.value.trim();
  
  if (!taskName) return;
  
  const catIndex = state.categories.findIndex(c => c.id === categoryId);
  if (catIndex === -1) return;
  
  const exists = state.categories.some(c => c.tasks.some(t => t.toLowerCase() === taskName.toLowerCase()));
  if (exists) {
    showToast('Zadanie o tej nazwie już istnieje w grafiku', 'danger');
    return;
  }
  
  recordAction();
  state.categories[catIndex].tasks.push(taskName);
  saveStateToStorage();
  renderFullScheduleView();
  showToast(`Dodano zadanie "${taskName}" do kategorii "${state.categories[catIndex].name}"`);
  
  input.value = '';
}

function deleteTask(categoryId, taskName) {
  if (!confirm(`Czy na pewno chcesz usunąć zadanie "${taskName}"? Usunięte zostaną również wszystkie powiązane dyżury w tym tygodniu.`)) {
    return;
  }
  
  const catIndex = state.categories.findIndex(c => c.id === categoryId);
  if (catIndex === -1) return;
  
  recordAction();
  state.categories[catIndex].tasks = state.categories[catIndex].tasks.filter(t => t !== taskName);
  state.shifts = state.shifts.filter(s => s.taskId !== taskName);
  
  saveStateToStorage();
  renderFullScheduleView();
  showToast(`Usunięto zadanie "${taskName}"`);
}

function addCategory(name) {
  const cleanName = name.trim();
  if (!cleanName) return;
  
  const exists = state.categories.some(c => c.name.toLowerCase() === cleanName.toLowerCase());
  if (exists) {
    showToast('Kategoria o tej nazwie już istnieje', 'danger');
    return;
  }
  
  recordAction();
  const newCat = {
    id: 'cat-' + Date.now(),
    name: cleanName,
    tasks: []
  };
  
  state.categories.push(newCat);
  saveStateToStorage();
  renderFullScheduleView();
  showToast(`Dodano nową kategorię: "${cleanName}"`);
}

function deleteCategory(categoryId) {
  const cat = state.categories.find(c => c.id === categoryId);
  if (!cat) return;
  
  if (!confirm(`Czy na pewno chcesz usunąć całą kategorię "${cat.name}"? Spowoduje to usunięcie wszystkich należących do niej zadań (${cat.tasks.length}) oraz ich zaplanowanych zmian.`)) {
    return;
  }
  
  recordAction();
  cat.tasks.forEach(taskName => {
    state.shifts = state.shifts.filter(s => s.taskId !== taskName);
  });
  state.categories = state.categories.filter(c => c.id !== categoryId);
  
  saveStateToStorage();
  renderFullScheduleView();
  showToast(`Usunięto kategorię "${cat.name}"`);
}

// --- INLINE EDIT: CATEGORY & TASK NAMES ---
function editCategoryName(categoryId) {
  const cat = state.categories.find(c => c.id === categoryId);
  if (!cat) return;
  const container = document.querySelector(`.category-block[data-category-id="${categoryId}"] .category-title-container`);
  const titleSpan = container.querySelector('.category-title');
  const oldName = cat.name;
  titleSpan.innerHTML = `<input type="text" class="inline-edit-input" value="${escapeHtml(oldName)}" autocomplete="off">`;
  const input = titleSpan.querySelector('input');
  input.focus();
  input.select();
  
  const finish = (save) => {
    const val = input.value.trim();
    if (save && val && val !== oldName) {
      const exists = state.categories.some(c => c.name.toLowerCase() === val.toLowerCase() && c.id !== categoryId);
      if (exists) {
        showToast('Kategoria o tej nazwie już istnieje', 'danger');
        titleSpan.textContent = oldName;
        return;
      }
      recordAction();
      cat.name = val;
      saveStateToStorage();
      renderFullScheduleView();
      showToast(`Zmieniono nazwę kategorii na "${val}"`);
    } else {
      titleSpan.textContent = oldName;
    }
  };
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function editTaskName(categoryId, taskName) {
  const catIndex = state.categories.findIndex(c => c.id === categoryId);
  if (catIndex === -1) return;
  const row = document.querySelector(`tr[data-category-id="${categoryId}"][data-task-name="${escapeHtml(taskName)}"]`);
  if (!row) return;
  const nameSpan = row.querySelector('.task-name-wrapper > span:not(.drag-handle-area)');
  const oldName = taskName;
  nameSpan.innerHTML = `<input type="text" class="inline-edit-input" value="${escapeHtml(oldName)}" autocomplete="off" style="width:${Math.max(oldName.length * 8, 80)}px">`;
  const input = nameSpan.querySelector('input');
  input.focus();
  input.select();
  
  const taskIndex = state.categories[catIndex].tasks.indexOf(taskName);
  
  const finish = (save) => {
    const val = input.value.trim();
    if (save && val && val !== oldName) {
      const exists = state.categories[catIndex].tasks.some(t => t.toLowerCase() === val.toLowerCase());
      if (exists) {
        showToast('Zadanie o tej nazwie już istnieje w tej kategorii', 'danger');
        nameSpan.textContent = oldName;
        row.setAttribute('data-task-name', oldName);
        return;
      }
      recordAction();
      state.categories[catIndex].tasks[taskIndex] = val;
      state.shifts.forEach(s => {
        if (s.taskId === oldName) s.taskId = val;
      });
      saveStateToStorage();
      renderFullScheduleView();
      showToast(`Zmieniono nazwę zadania na "${val}"`);
    } else {
      nameSpan.textContent = oldName;
      row.setAttribute('data-task-name', oldName);
    }
  };
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

// --- VIEW 3: TEAM MANAGEMENT ---
function renderTeamManagementView() {
  document.getElementById('membersCount').textContent = state.employees.length;
  
  const container = document.getElementById('membersListContainer');
  container.innerHTML = '';
  
  const searchVal = document.getElementById('searchMemberInput').value.toLowerCase();
  const filteredEmployees = state.employees.filter(emp => 
    emp.name.toLowerCase().includes(searchVal)
  );
  
  if (filteredEmployees.length === 0) {
    container.innerHTML = `<p class="no-tasks-text">Brak pasujących osób w zespole</p>`;
    return;
  }
  
  filteredEmployees.forEach(emp => {
    const item = document.createElement('div');
    item.className = 'member-item';
    
    const initials = emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const roleClass = emp.role === 'Administrator' ? 'role-administrator' : 'role-osoba';
    const badgeClass = emp.role === 'Administrator' ? 'badge-administrator' : 'badge-osoba';
    
    const isActiveProfile = emp.id === state.currentProfileId;
    const isDisabled = isActiveProfile && emp.role === 'Administrator';
    
    item.innerHTML = `
      <div class="member-info">
        <div class="member-avatar ${roleClass}">${initials}</div>
        <div class="member-details">
          <span class="member-name">${emp.name}</span>
          <span class="role-badge ${badgeClass} ${isDisabled ? 'disabled' : ''}" data-emp-id="${emp.id}" title="${isDisabled ? 'Zalogowany Administrator' : 'Kliknij, aby zmienić rolę'}">
            ${emp.role}
            ${isDisabled ? '' : `
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
              </svg>
            `}
          </span>
        </div>
      </div>
      <button class="btn-delete-member" data-emp-id="${emp.id}" ${isDisabled ? 'disabled title="Nie możesz usunąć własnego konta administratora"' : 'title="Usuń osobę z zespołu"'}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>
    `;
    
    const roleBadge = item.querySelector('.role-badge');
    roleBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isDisabled) {
        showToast('Jako zalogowany Administrator nie możesz zmienić swojej własnej roli', 'danger');
        return;
      }
      toggleEmployeeRole(emp.id);
    });
    
    const deleteBtn = item.querySelector('.btn-delete-member');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isDisabled) {
        showToast('Nie możesz usunąć swojego własnego profilu Administratora', 'danger');
        return;
      }
      deleteEmployee(emp.id);
    });
    
    container.appendChild(item);
  });
}

function toggleEmployeeRole(empId) {
  const empIndex = state.employees.findIndex(e => e.id === empId);
  if (empIndex === -1) return;
  
  const oldRole = state.employees[empIndex].role;
  const newRole = oldRole === 'Administrator' ? 'Osoba' : 'Administrator';
  
  const admins = state.employees.filter(e => e.role === 'Administrator');
  if (oldRole === 'Administrator' && admins.length === 1) {
    showToast('W systemie musi pozostać przynajmniej jeden Administrator', 'danger');
    return;
  }
  
  recordAction();
  state.employees[empIndex].role = newRole;
  saveStateToStorage();
  
  populateProfileDropdown();
  updateRoleMode();
  renderTeamManagementView();
  if (state.activeTab === 'my-tasks') renderMyTasksView();
  
  showToast(`Zmieniono rolę użytkownika ${state.employees[empIndex].name} na ${newRole}`);
}

// Point 9: delete employee instantly without double confirmation prompt
function deleteEmployee(empId) {
  const empIndex = state.employees.findIndex(e => e.id === empId);
  if (empIndex === -1) return;
  
  const empName = state.employees[empIndex].name;
  const empRole = state.employees[empIndex].role;
  
  const admins = state.employees.filter(e => e.role === 'Administrator');
  if (empRole === 'Administrator' && admins.length === 1) {
    showToast('Nie można usunąć jedynego Administratora w systemie', 'danger');
    return;
  }
  
  recordAction();
  state.employees.splice(empIndex, 1);
  state.shifts = state.shifts.filter(s => s.employeeId !== empId);
  
  if (state.currentProfileId === empId) {
    const replacement = state.employees.find(e => e.role === 'Administrator') || state.employees[0];
    state.currentProfileId = replacement ? replacement.id : '';
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
  }
  
  saveStateToStorage();
  populateProfileDropdown();
  updateRoleMode();
  renderTeamManagementView();
  renderFullScheduleView();
  
  showToast(`Usunięto ${empName} z zespołu`);
}

// --- SHIFT ASSIGNMENT MODAL LOGIC ---
function openAssignModal(task, day, shiftId = null) {
  state.editingShiftId = shiftId;
  state.activeCellTask = task;
  state.activeCellDay = day;
  
  const modal = document.getElementById('assignModal');
  const titleTask = document.getElementById('modalTaskName');
  const titleDay = document.getElementById('modalDayName');
  const inputTime = document.getElementById('modalTimeInput');
  const deleteBtn = document.getElementById('btnDeleteShift');
  const mainContent = document.getElementById('modalMainContent');
  const unrecognizedPanel = document.getElementById('unrecognizedNamesPanel');
  
  mainContent.classList.remove('hidden');
  unrecognizedPanel.classList.add('hidden');
  
  titleTask.textContent = task;
  titleDay.textContent = day;
  
  if (shiftId) {
    const shift = state.shifts.find(s => s.id === shiftId);
    if (shift) {
      const emp = state.employees.find(e => e.id === shift.employeeId);
      state.modalPeople = [emp ? emp.name : ''];
      inputTime.value = shift.time;
      deleteBtn.classList.remove('hidden'); // Show delete (Point 7)
    }
  } else {
    state.modalPeople = [''];
    inputTime.value = '08:00–12:00'; 
    deleteBtn.classList.add('hidden'); // Hide delete (Point 7)
  }
  
  renderPeopleInputs();
  renderPresetButtons();
  syncPresetHighlight(inputTime.value);
  
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; 
  
  focusPeopleInputRow(0);
}

function closeAssignModal() {
  const modal = document.getElementById('assignModal');
  modal.classList.add('hidden');
  document.body.style.overflow = ''; 
  
  state.editingShiftId = null;
  state.activeCellTask = null;
  state.activeCellDay = null;
  state.modalPeople = [''];
  state.unrecognizedNames = [];
  state.pendingSaveContext = null; // Zmieniono na kontekst
}

// Funkcja do zamykania modala z opcjonalnym potwierdzeniem
function confirmCloseAssignModal() {
  // Sprawdź, czy są jakieś wprowadzone dane (osoby lub czas różny od domyślnego)
  const peopleInputsFilled = state.modalPeople.filter(n => n.trim() !== '').length > 0;
  const timeInputChanged = document.getElementById('modalTimeInput').value.trim() !== '08:00–12:00';

  if (peopleInputsFilled || timeInputChanged) {
    if (confirm('Czy na pewno chcesz wyjść bez zapisywania dyżuru?')) {
      closeAssignModal();
    }
  } else {
    closeAssignModal();
  }
}

// --- RENDER DYNAMIC AUTOCOMPLETE INPUTS (Point 3 & 4 fixed) ---
function renderPeopleInputs() {
  const container = document.getElementById('modalPeopleInputsContainer');
  container.innerHTML = '';
  
  state.modalPeople.forEach((nameValue, index) => {
    const row = document.createElement('div');
    row.className = 'autocomplete-row';
    row.setAttribute('data-index', index);
    
    let removeBtnHtml = '';
    if (state.modalPeople.length > 1) {
      removeBtnHtml = `
        <button type="button" class="btn-remove-row" onclick="removePeopleInputRow(${index})" title="Usuń wiersz">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;
    }
    
    row.innerHTML = `
      <input type="text" class="modal-person-input" placeholder="Wpisz imię i nazwisko..." value="${escapeHtml(nameValue)}" autocomplete="off">
      <div class="suggestions-dropdown hidden"></div>
      ${removeBtnHtml}
    `;
    
    container.appendChild(row);
    
    const input = row.querySelector('.modal-person-input');
    const dropdown = row.querySelector('.suggestions-dropdown');
    
    input.addEventListener('input', (e) => {
      let val = e.target.value;
      
      // Comma handling
      if (val.endsWith(',')) {
        val = val.slice(0, -1); 
        
        let chosenName = val.trim();
        const suggestions = dropdown.querySelectorAll('.suggestion-item');
        if (!dropdown.classList.contains('hidden') && state.activeSuggestionIndex !== -1 && suggestions[state.activeSuggestionIndex]) {
          chosenName = suggestions[state.activeSuggestionIndex].getAttribute('data-name');
        }
        
        state.modalPeople[index] = chosenName;
        state.modalPeople.push('');
        renderPeopleInputs();
        focusPeopleInputRow(state.modalPeople.length - 1);
        return;
      }
      
      state.modalPeople[index] = val;
      showAutocompleteSuggestions(index, val);
    });
    
    input.addEventListener('keydown', (e) => {
      const val = e.target.value;
      const suggestions = dropdown.querySelectorAll('.suggestion-item');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (suggestions.length > 0) {
          state.activeSuggestionIndex = (state.activeSuggestionIndex + 1) % suggestions.length;
          highlightSuggestion(dropdown);
        }
      } 
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (suggestions.length > 0) {
          state.activeSuggestionIndex = (state.activeSuggestionIndex - 1 + suggestions.length) % suggestions.length;
          highlightSuggestion(dropdown);
        }
      } 
      else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        
        if (!dropdown.classList.contains('hidden')) {
          if (state.activeSuggestionIndex !== -1 && suggestions[state.activeSuggestionIndex]) {
            const selectedName = suggestions[state.activeSuggestionIndex].getAttribute('data-name');
            selectAutocompleteSuggestion(index, selectedName); // Kursor zostanie na końcu
            // Nie przenosimy fokusu od razu, użytkownik może chcieć użyć przecinka lub ponownie nacisnąć Enter.
          } else {
            // Nic nie wybrano, zamknij dropdown i zachowaj fokus
            dropdown.classList.add('hidden');
            state.activeSuggestionIndex = -1;
            const len = input.value.length;
            input.setSelectionRange(len, len);
          }
        } else {
          // Dropdown jest zamknięty (albo nigdy nie był otwarty, albo został zamknięty Enterem wcześniej)
          // Przeniesienie fokusu:
          if (index < state.modalPeople.length - 1) {
            focusPeopleInputRow(index + 1);
          } else {
            document.getElementById('modalTimeInput').focus();
          }
        }
      }
      else if (e.key === ',') {
        e.preventDefault();
        e.stopPropagation();
        
        let chosenName = val.trim();
        if (!dropdown.classList.contains('hidden') && state.activeSuggestionIndex !== -1 && suggestions[state.activeSuggestionIndex]) {
          chosenName = suggestions[state.activeSuggestionIndex].getAttribute('data-name');
        }
        
        state.modalPeople[index] = chosenName;
        state.modalPeople.push('');
        renderPeopleInputs();
        focusPeopleInputRow(state.modalPeople.length - 1);
      }
    });
      
      input.addEventListener('focus', () => {
        if (input.value.trim() !== '') {
          showAutocompleteSuggestions(index, input.value);
        }
      });
      
      // Zdarzenie 'blur' musi być nieco opóźnione, aby umożliwić kliknięcie sugestii
      input.addEventListener('blur', () => {
        setTimeout(() => {
          dropdown.classList.add('hidden');
          state.activeSuggestionIndex = -1;
        }, 200); 
      });
    });

    // Dodaj przycisk "+" do dodawania kolejnego pola osoby
    const addPersonBtnContainer = document.createElement('div');
    addPersonBtnContainer.className = 'add-person-row-btn-container';
    addPersonBtnContainer.innerHTML = `
        <button type="button" class="btn-add-person-row" onclick="addPersonInputRow()" title="Dodaj kolejną osobę">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        </button>
    `;
    container.appendChild(addPersonBtnContainer);
}

function addPersonInputRow() {
  recordAction(); 
  state.modalPeople.push('');
  renderPeopleInputs();
  focusPeopleInputRow(state.modalPeople.length - 1);
}

function focusPeopleInputRow(index) {
  const rows = document.querySelectorAll('.autocomplete-row');
  if (rows[index]) {
    const input = rows[index].querySelector('.modal-person-input');
    if (input) {
      input.focus();
      // Point 3: Explicitly place cursor at the very end of the text
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }
}

function removePeopleInputRow(index) {
  state.modalPeople.splice(index, 1);
  renderPeopleInputs();
  focusPeopleInputRow(state.modalPeople.length - 1);
}

// --- AUTOCOMPLETE SUGGESTIONS ENGINE ---
function showAutocompleteSuggestions(index, query) {
  const row = document.querySelector(`.autocomplete-row[data-index="${index}"]`);
  const dropdown = row.querySelector('.suggestions-dropdown');
  
  const cleanQuery = query.toLowerCase().trim();
  if (cleanQuery === '') {
    dropdown.innerHTML = '';
    dropdown.classList.add('hidden');
    state.activeSuggestionIndex = -1;
    return;
  }
  
  const matches = state.employees.filter(emp => 
    emp.name.toLowerCase().includes(cleanQuery)
  );
  
  if (matches.length === 0) {
    dropdown.innerHTML = '';
    dropdown.classList.add('hidden');
    state.activeSuggestionIndex = -1;
    return;
  }
  
  dropdown.innerHTML = '';
  state.activeSuggestionIndex = 0; 
  
  matches.forEach((emp, sIndex) => {
    const div = document.createElement('div');
    div.className = `suggestion-item ${sIndex === 0 ? 'highlighted' : ''}`;
    div.setAttribute('data-name', emp.name);
    
    const roleLabel = emp.role === 'Administrator' ? 'Admin' : 'Osoba';
    const roleClass = emp.role === 'Administrator' ? 'role-admin' : 'role-osoba';
    
    div.innerHTML = `
      <span class="suggestion-name">${emp.name}</span>
      <span class="suggestion-role ${roleClass}">${roleLabel}</span>
    `;
    
    div.addEventListener('mousedown', (e) => {
      e.preventDefault(); 
      selectAutocompleteSuggestion(index, emp.name);
    });
    
    dropdown.appendChild(div);
  });
  
  dropdown.classList.remove('hidden');
}

function highlightSuggestion(dropdown) {
  const items = dropdown.querySelectorAll('.suggestion-item');
  items.forEach((item, index) => {
    if (index === state.activeSuggestionIndex) {
      item.classList.add('highlighted');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('highlighted');
    }
  });
}

// Point 3 & 4: Direct DOM manipulation to avoid re-rendering and preserve focus & key handlers
function selectAutocompleteSuggestion(index, name) {
  state.modalPeople[index] = name;
  
  const row = document.querySelector(`.autocomplete-row[data-index="${index}"]`);
  if (row) {
    const input = row.querySelector('.modal-person-input');
    const dropdown = row.querySelector('.suggestions-dropdown');
    
    if (input) {
      input.value = name;
      input.focus();
      // Force cursor to the end
      const len = name.length;
      input.setSelectionRange(len, len);
    }
    
    if (dropdown) {
      dropdown.innerHTML = '';
      dropdown.classList.add('hidden');
    }
  }
}

// --- RENDER COMPACT PRESETS with inline deletion (Point 2 & 4) ---
function renderPresetButtons() {
  const grid = document.getElementById('quickSelectGrid');
  grid.innerHTML = '';
  
  state.presets.forEach((p, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'preset-wrapper';
    
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.setAttribute('data-time', p.time);
    btn.setAttribute('data-preset', p.label);
    btn.innerHTML = `
      <span class="preset-label">${p.label}</span>
      <span class="preset-value">${p.time}</span>
    `;
    
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'preset-delete-btn';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Usuń szablon';
    
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation(); 
      deletePreset(index);
    });
    
    wrapper.appendChild(btn);
    wrapper.appendChild(delBtn);
    grid.appendChild(wrapper);
  });
  
  syncPresetHighlight(document.getElementById('modalTimeInput').value);
}

function syncPresetHighlight(timeString) {
  const wrappers = document.querySelectorAll('.preset-wrapper');
  wrappers.forEach(wrap => {
    const btn = wrap.querySelector('.preset-btn');
    const btnTime = btn.getAttribute('data-time');
    if (btnTime === timeString) {
      wrap.classList.add('active');
    } else {
      wrap.classList.remove('active');
    }
  });
}

// --- ACTIONS: PRESETS ---
function addPreset() {
  const labelInput = document.getElementById('newPresetLabel');
  const timeInput = document.getElementById('newPresetTime');
  
  const label = labelInput.value.trim();
  const rawTime = timeInput.value.trim();
  
  if (!label || !rawTime) {
    showToast('Wypełnij oba pola szablonu (Etykieta i Godziny)', 'danger');
    return;
  }
  
  // Format the time input (Point 5)
  const time = parseAndFormatTime(rawTime);
  
  recordAction();
  state.presets.push({ label, time });
  saveStateToStorage();
  
  labelInput.value = '';
  timeInput.value = '';
  
  renderPresetButtons();
  showToast(`Dodano szablon "${label}"`);
}

function deletePreset(index) {
  const p = state.presets[index];
  recordAction();
  state.presets.splice(index, 1);
  saveStateToStorage();
  
  renderPresetButtons();
  showToast(`Usunięto szablon "${p.label}"`);
}

// --- SMART TIME FORMATTING PARSER (Point 5) ---
function parseAndFormatTime(str) {
  const clean = str.trim();
  if (!clean) return '';
  
  if (clean.toLowerCase() === '1h') return '1h';
  if (clean.toLowerCase() === '2h') return '2h';
  
  // Split by range separators: dash, en-dash, spaces, "do", "to"
  const parts = clean.split(/[-–—\s]|do|to/i).filter(p => p.trim() !== '');
  if (parts.length < 2) {
    // Fallbacks for typing numbers without spaces, e.g. "0812" -> "08 12"
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 6) {
      return parseAndFormatTime(`${digits.substring(0, 3)} ${digits.substring(3)}`);
    }
    if (digits.length === 8) {
      return parseAndFormatTime(`${digits.substring(0, 4)} ${digits.substring(4)}`);
    }
    if (digits.length === 4 && !clean.includes(':')) {
      return parseAndFormatTime(`${digits.substring(0, 2)} ${digits.substring(2)}`);
    }
    return clean;
  }
  
  const formatPart = (part) => {
    const p = part.trim();
    if (p.includes(':')) {
      const subparts = p.split(':');
      const h = subparts[0].padStart(2, '0');
      const m = subparts[1].padStart(2, '0');
      return `${h}:${m}`;
    }
    
    const digits = p.replace(/\D/g, '');
    if (digits.length === 1) {
      return `0${digits}:00`;
    } else if (digits.length === 2) {
      return `${digits.padStart(2, '0')}:00`;
    } else if (digits.length === 3) {
      return `0${digits[0]}:${digits.substring(1)}`;
    } else if (digits.length === 4) {
      return `${digits.substring(0, 2)}:${digits.substring(2)}`;
    }
    return p;
  };
  
  const start = formatPart(parts[0]);
  const end = formatPart(parts[parts.length - 1]);
  
  return `${start}–${end}`;
}


// --- SAVE SHIFT ---
function saveShift(closeAfter = true) {
  const timeInput = document.getElementById('modalTimeInput');
  // Format the time input before saving (Point 5)
  const time = parseAndFormatTime(timeInput.value.trim());
  
  if (!time) {
    showToast('Podaj godziny pracy', 'danger');
    return false;
  }
  
  const names = state.modalPeople
    .map(n => n.trim())
    .filter(n => n !== '');
    
  if (names.length === 0) {
    showToast('Wpisz imię i nazwisko przynajmniej jednej osoby', 'danger');
    return false;
  }
  
  const unrecognized = [];
  names.forEach(name => {
    const exists = state.employees.some(emp => emp.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      unrecognized.push(name);
    }
  });
  
  if (unrecognized.length > 0) {
    state.unrecognizedNames = unrecognized;
    state.pendingSaveContext = { // Zmieniono na kontekst, aby przekazać wszystkie potrzebne dane
        names: names,
        time: time,
        closeAfter: closeAfter
    };
    openUnrecognizedNamesPanel();
    return false;
  }
  
  return executeSave(names, time, closeAfter);
}

function executeSave(names, time, closeAfter) {
  recordAction();
  
  const employeeIds = names.map(name => {
    const emp = state.employees.find(e => e.name.toLowerCase() === name.toLowerCase());
    return emp.id;
  });
  
  if (state.editingShiftId) {
    const shiftIndex = state.shifts.findIndex(s => s.id === state.editingShiftId);
    if (shiftIndex !== -1) {
      state.shifts[shiftIndex].employeeId = employeeIds[0];
      state.shifts[shiftIndex].time = time;
    }
    showToast('Zaktualizowano zmianę pomyślnie');
  } else {
    employeeIds.forEach(empId => {
      const duplicate = state.shifts.some(s => 
        s.taskId === state.activeCellTask && 
        s.day === state.activeCellDay && 
        s.employeeId === empId && 
        s.time === time
      );
      
      if (!duplicate) {
        const newShift = {
          id: 'shift-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          taskId: state.activeCellTask,
          day: state.activeCellDay,
          employeeId: empId,
          time: time
        };
        state.shifts.push(newShift);
      }
    });
    showToast('Dodano nowe zmiany do grafiku');
  }
  
  saveStateToStorage();
  renderFullScheduleView();
  
  if (closeAfter) {
    closeAssignModal();
  }
  return true;
}

// --- UNRECOGNIZED NAMES INTERACTIVE PANEL ---
function openUnrecognizedNamesPanel() {
  const mainContent = document.getElementById('modalMainContent');
  const unrecognizedPanel = document.getElementById('unrecognizedNamesPanel');
  
  mainContent.classList.add('hidden');
  unrecognizedPanel.classList.remove('hidden');
  
  renderUnrecognizedNamesList();
}

function closeUnrecognizedNamesPanel() {
  const mainContent = document.getElementById('modalMainContent');
  const unrecognizedPanel = document.getElementById('unrecognizedNamesPanel');
  
  unrecognizedPanel.classList.add('hidden');
  mainContent.classList.remove('hidden');
}

function renderUnrecognizedNamesList() {
  const container = document.getElementById('unrecognizedNamesListContainer');
  container.innerHTML = '';
  
  state.unrecognizedNames.forEach((name, index) => {
    const card = document.createElement('div');
    card.className = 'unrecognized-card';
    
    card.innerHTML = `
      <div class="unrecognized-card-name">
        Wpisałeś osobę: <span>${escapeHtml(name)}</span>
      </div>
      <div class="unrecognized-actions">
        <button type="button" class="btn btn-success" onclick="handleAddUnrecognizedMember('${escapeHtml(name)}', 'Osoba')">
          Dodaj jako Osoba
        </button>
        <button type="button" class="btn btn-primary" onclick="handleAddUnrecognizedMember('${escapeHtml(name)}', 'Administrator')">
          Dodaj jako Administrator
        </button>
        <button type="button" class="btn btn-text" onclick="handleCorrectUnrecognizedName('${escapeHtml(name)}')">
          Popraw
        </button>
      </div>
    `;
    
    container.appendChild(card);
  });
}

function handleAddUnrecognizedMember(name, role) {
  recordAction();
  
  const newEmp = {
    id: 'emp-' + Date.now() + '-' + Math.floor(Math.random() * 100),
    name: name,
    role: role
  };
  
  state.employees.push(newEmp);
  saveStateToStorage();
  
  populateProfileDropdown();
  updateRoleMode();
  
  state.unrecognizedNames = state.unrecognizedNames.filter(n => n !== name);
  showToast(`Dodano "${name}" do zespołu jako ${role}`);
  
  if (state.unrecognizedNames.length === 0) {
    if (state.pendingSaveContext) {
      // Pobierz aktualne imiona, które mogą zawierać nowo dodane osoby
      const updatedNames = state.modalPeople
          .map(n => n.trim())
          .filter(n => n !== '');
      executeSave(updatedNames, state.pendingSaveContext.time, state.pendingSaveContext.closeAfter);
      closeUnrecognizedNamesPanel(); 
      // Jeśli closeAfter jest true, modal zostanie zamknięty w executeSave
      if (state.pendingSaveContext.closeAfter) {
          closeAssignModal();
      }
      state.pendingSaveContext = null; // Wyczyść kontekst po użyciu
    }
  } else {
    renderUnrecognizedNamesList();
  }
}

function handleCorrectUnrecognizedName(name) {
  closeUnrecognizedNamesPanel();
  
  const inputRows = document.querySelectorAll('.autocomplete-row');
  inputRows.forEach(row => {
    const input = row.querySelector('.modal-person-input');
    if (input && input.value.trim().toLowerCase() === name.toLowerCase()) {
      input.focus();
      input.select();
    }
  });
}

// Point 9: Delete shift instantly without confirmation prompt
function deleteActiveShift() {
  if (!state.editingShiftId) return;
  
  recordAction();
  state.shifts = state.shifts.filter(s => s.id !== state.editingShiftId);
  saveStateToStorage();
  renderFullScheduleView();
  closeAssignModal();
  showToast('Zmiana została usunięta');
}

// --- AUTO-SAVE ON CLICK OUTSIDE / BLUR ---
function autoSaveAndClose() {
  const timeInput = document.getElementById('modalTimeInput');
  const time = parseAndFormatTime(timeInput.value.trim());
  
  const names = state.modalPeople
    .map(n => n.trim())
    .filter(n => n !== '');
  
  if (names.length > 0 && time !== '') {
    const unrecognized = [];
    names.forEach(name => {
      const exists = state.employees.some(emp => emp.name.toLowerCase() === name.toLowerCase());
      if (!exists) {
        unrecognized.push(name);
      }
    });
    
    if (unrecognized.length > 0) {
      closeAssignModal();
    } else {
      executeSave(names, time, true);
    }
  } else {
    closeAssignModal();
  }
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? 
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : 
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    
  toast.innerHTML = `${icon} <span>${message}</span>`;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toast-in 0.25s reverse forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  const profileSelect = document.getElementById('profileSelect');
  profileSelect.addEventListener('change', (e) => {
    state.currentProfileId = e.target.value;
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
    
    updateRoleMode();
    if (state.activeTab === 'my-tasks') renderMyTasksView();
    renderFullScheduleView();
    showToast(`Przełączono profil na: ${getCurrentProfile().name}`);
  });

  const tabButtons = document.querySelectorAll('.nav-tab');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  const addPersonForm = document.getElementById('addPersonForm');
  addPersonForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('newPersonName');
    const name = nameInput.value.trim();
    
    if (!name) return;
    
    const exists = state.employees.some(emp => emp.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      showToast('Osoba o tym imieniu i nazwisku już istnieje w zespole', 'danger');
      return;
    }
    
    recordAction();
    const newEmp = {
      id: 'emp-' + Date.now(),
      name: name,
      role: state.selectedRoleForNewPerson
    };
    
    state.employees.push(newEmp);
    saveStateToStorage();
    
    nameInput.value = '';
    populateProfileDropdown();
    renderTeamManagementView();
    
    showToast(`Dodano do zespołu: ${name}`);
  });

  const roleToggleBtns = document.querySelectorAll('.role-toggle-btn');
  roleToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      roleToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedRoleForNewPerson = btn.getAttribute('data-role');
    });
  });

  const searchInput = document.getElementById('searchMemberInput');
  searchInput.addEventListener('input', () => {
    renderTeamManagementView();
  });

  document.getElementById('btnModalClose').addEventListener('click', closeAssignModal);
  document.getElementById('btnCancelShift').addEventListener('click', closeAssignModal);

  const presetGrid = document.getElementById('quickSelectGrid');
  presetGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    
    const timeVal = btn.getAttribute('data-time');
    document.getElementById('modalTimeInput').value = timeVal;
    
    syncPresetHighlight(timeVal);
  });

  const timeInput = document.getElementById('modalTimeInput');
  
  // Czyść pole po kliknięciu tylko gdy to domyślny placeholder
  timeInput.addEventListener('focus', (e) => {
    if (e.target.value === '08:00–12:00') {
      e.target.value = '';
    }
  });

  // Format on blur (Point 5)
  timeInput.addEventListener('blur', (e) => {
    const formatted = parseAndFormatTime(e.target.value.trim());
    if (formatted !== '') {
      e.target.value = formatted;
      syncPresetHighlight(formatted);
    }
  });
  
  timeInput.addEventListener('input', (e) => {
    // Highlight presets dynamically as they type
    syncPresetHighlight(e.target.value.trim());
  });
  
  timeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation(); // Dodano: Zatrzymuje propagację, aby globalny listener nie wywołał saveShift
      saveShift(true);
    }
  });

  document.getElementById('assignForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveShift(true);
  });

  document.getElementById('btnDeleteShift').addEventListener('click', deleteActiveShift);

  // Simplified Preset Add Inline Form (Point 4)
  document.getElementById('btnInlineAddPreset').addEventListener('click', addPreset);
  
  const presetInputs = [document.getElementById('newPresetLabel'), document.getElementById('newPresetTime')];
  presetInputs.forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addPreset();
      }
    });
  });

  document.addEventListener('mousedown', (e) => {
    const modal = document.getElementById('assignModal');
    const container = document.querySelector('.modal-container');
    const toastContainer = document.getElementById('toastContainer');
    
    if (!modal.classList.contains('hidden') && 
        !container.contains(e.target) && 
        !toastContainer.contains(e.target)) {
      autoSaveAndClose();
    }
  });

  const btnShowAddCategory = document.getElementById('btnShowAddCategory');
  const btnCancelCategory = document.getElementById('btnCancelCategory');
  const addCategoryFormContainer = document.getElementById('addCategoryFormContainer');
  
  btnShowAddCategory.addEventListener('click', () => {
    btnShowAddCategory.classList.add('hidden');
    addCategoryFormContainer.classList.remove('hidden');
    document.getElementById('newCategoryNameInput').focus();
  });
  
  btnCancelCategory.addEventListener('click', () => {
    addCategoryFormContainer.classList.add('hidden');
    btnShowAddCategory.classList.remove('hidden');
    document.getElementById('newCategoryNameInput').value = '';
  });
  
  document.getElementById('btnSubmitCategory').addEventListener('click', () => {
    const input = document.getElementById('newCategoryNameInput');
    addCategory(input.value);
    input.value = '';
    addCategoryFormContainer.classList.add('hidden');
    btnShowAddCategory.classList.remove('hidden');
  });
  
  document.getElementById('newCategoryNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = document.getElementById('newCategoryNameInput');
      addCategory(input.value);
      input.value = '';
      addCategoryFormContainer.classList.add('hidden');
      btnShowAddCategory.classList.remove('hidden');
    }
  });

  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnRedo').addEventListener('click', redo);
  
  // Point 8: Global Enter keypress to save shift when modal is open and focus is not inside an active suggestions input
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('assignModal');
    if (modal && !modal.classList.contains('hidden')) {
      if (e.key === 'Enter') {
        const active = document.activeElement;
        
        // Determine if we are focused on a person input with suggestions dropdown visible
        const isAutocompleteInput = active && active.classList.contains('modal-person-input');
        const suggestionsOpen = isAutocompleteInput && active.nextElementSibling && !active.nextElementSibling.classList.contains('hidden');
        
        // Check if focused on other fields that shouldn't trigger global save directly
        const isButton = active && (active.tagName === 'BUTTON');
        
        // Zapisz, jeśli nie ma aktywnych sugestii i nie jesteśmy na przycisku.
        // Również, jeśli jesteśmy w polu osoby, ale dropdown jest zamknięty, to potraktuj to jako koniec wpisywania osoby.
        if (!suggestionsOpen && !isButton) {
          e.preventDefault();
          saveShift(true);
        }
      } else if (e.key === 'Escape') { // Dodano obsługę klawisza Escape
        e.preventDefault(); 
        confirmCloseAssignModal(); 
      }
    }
    
    // Keyboard Shortcuts for Undo / Redo (Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Y)
    const active = document.activeElement;
    const isEditingText = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    if (isEditingText) return;
    
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    const profile = getCurrentProfile();
    const isAdmin = profile && profile.role === 'Administrator';
    
    if (isAdmin && isCmdOrCtrl) {
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo(); 
        } else {
          undo();
        }
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo(); 
      }
    }
  });
}

// --- HELPER: ESCAPE HTML ---
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- START UP ---
window.addEventListener('DOMContentLoaded', initApp);
