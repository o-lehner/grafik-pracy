/*
  Grafik Pracy BLDSRV - Application Logic (V3)
  Implements advanced state management, LocalStorage persistence,
  dynamic autocomplete stack, preset management, category blocks,
  unrecognized name interactive workflows, collaborator tracking,
  and a 200-action Undo/Redo engine (Point 1).
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

// --- UNDO / REDO SYSTEM (Point 1: 200 actions) ---
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 200;

function recordAction() {
  // Capture a deep clone of structural state
  const snapshot = JSON.stringify({
    employees: state.employees,
    categories: state.categories,
    shifts: state.shifts,
    presets: state.presets
  });
  
  // Do not record if identical to the top of the stack
  if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapshot) {
    return;
  }
  
  undoStack.push(snapshot);
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift(); // keep last 200
  }
  
  // Clear redo stack on new actions
  redoStack = [];
  updateUndoRedoButtons();
}

function undo() {
  if (undoStack.length === 0) return;
  
  // Push current state to redo stack
  const currentSnapshot = JSON.stringify({
    employees: state.employees,
    categories: state.categories,
    shifts: state.shifts,
    presets: state.presets
  });
  redoStack.push(currentSnapshot);
  
  // Pop and apply previous state
  const prevSnapshot = JSON.parse(undoStack.pop());
  state.employees = prevSnapshot.employees;
  state.categories = prevSnapshot.categories;
  state.shifts = prevSnapshot.shifts;
  state.presets = prevSnapshot.presets;
  
  saveStateToStorage();
  
  // Sync active profile in case it was reverted
  const exists = state.employees.some(e => e.id === state.currentProfileId);
  if (!exists) {
    const admin = state.employees.find(e => e.role === 'Administrator');
    state.currentProfileId = admin ? admin.id : state.employees[0]?.id || '';
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
  }
  
  // Refresh UI
  populateProfileDropdown();
  updateRoleMode();
  renderActiveView();
  updateUndoRedoButtons();
  
  showToast('Cofnięto ostatnią akcję');
}

function redo() {
  if (redoStack.length === 0) return;
  
  // Push current state to undo stack
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
  
  // Pop and apply next state
  const nextSnapshot = JSON.parse(redoStack.pop());
  state.employees = nextSnapshot.employees;
  state.categories = nextSnapshot.categories;
  state.shifts = nextSnapshot.shifts;
  state.presets = nextSnapshot.presets;
  
  saveStateToStorage();
  
  // Sync active profile
  const exists = state.employees.some(e => e.id === state.currentProfileId);
  if (!exists) {
    const admin = state.employees.find(e => e.role === 'Administrator');
    state.currentProfileId = admin ? admin.id : state.employees[0]?.id || '';
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
  }
  
  // Refresh UI
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
  // Load from localStorage or seed defaults
  state.employees = JSON.parse(localStorage.getItem('bldsrv_employees')) || DEFAULT_EMPLOYEES;
  state.categories = JSON.parse(localStorage.getItem('bldsrv_categories')) || DEFAULT_CATEGORIES;
  state.shifts = JSON.parse(localStorage.getItem('bldsrv_shifts')) || DEFAULT_SHIFTS;
  state.presets = JSON.parse(localStorage.getItem('bldsrv_presets')) || DEFAULT_PRESETS;
  
  // Perform naming migration for existing data
  migrateOldNaming();

  // Save back to storage
  saveStateToStorage();

  // Set default current profile
  const savedProfileId = localStorage.getItem('bldsrv_active_profile');
  const exists = state.employees.some(e => e.id === savedProfileId);
  if (savedProfileId && exists) {
    state.currentProfileId = savedProfileId;
  } else {
    const admin = state.employees.find(e => e.role === 'Administrator');
    state.currentProfileId = admin ? admin.id : state.employees[0]?.id || '';
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
  }

  // Setup Event Listeners
  setupEventListeners();
  
  // Render Everything
  populateProfileDropdown();
  updateRoleMode();
  renderTabs();
  renderActiveView();
  
  // Sync undo/redo buttons status initially
  updateUndoRedoButtons();
}

// --- MIGRATION: Nadzorca/Pracownik -> Administrator/Osoba ---
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

// --- STATE SAVING ---
function saveStateToStorage() {
  localStorage.setItem('bldsrv_employees', JSON.stringify(state.employees));
  localStorage.setItem('bldsrv_categories', JSON.stringify(state.categories));
  localStorage.setItem('bldsrv_shifts', JSON.stringify(state.shifts));
  localStorage.setItem('bldsrv_presets', JSON.stringify(state.presets));
}

// --- HELPER: GET CURRENT PROFILE ---
function getCurrentProfile() {
  return state.employees.find(e => e.id === state.currentProfileId) || state.employees[0];
}

// --- UPDATE ROLE CAPABILITIES (Admin vs Osoba) ---
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
    undoRedoHeader.classList.remove('hidden'); // Show Undo/Redo to Admins
  } else {
    body.classList.remove('app-mode-administrator');
    tabManageTeamBtn.classList.add('hidden');
    adminScheduleControls.classList.add('hidden');
    undoRedoHeader.classList.add('hidden'); // Hide Undo/Redo from regular employees
    
    // Hide inline category adding container
    document.getElementById('addCategoryFormContainer').classList.add('hidden');
    document.getElementById('btnShowAddCategory').classList.remove('hidden');
    
    // Redirect if on forbidden tab
    if (state.activeTab === 'manage-team') {
      switchTab('full-schedule');
    }
  }
}

// --- POPULATE HEADER PROFILE DROPDOWN ---
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

// --- TAB ROUTING ---
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

  // Toggle content section visibility
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

// --- VIEW 1: MY TASKS (PULPIT OSOBISTY) ---
function renderMyTasksView() {
  const profile = getCurrentProfile();
  if (!profile) return;
  
  // Set user name
  document.getElementById('myTasksUserName').textContent = profile.name;
  
  // Determine current day of week to highlight (default to Thursday to match screenshots)
  const date = new Date();
  let currentDayIndex = date.getDay() - 1; // 0 for Mon, 4 for Fri
  if (currentDayIndex < 0 || currentDayIndex > 4) {
    currentDayIndex = 3; // default to Thursday
  }
  
  const container = document.getElementById('myTasksGrid');
  container.innerHTML = '';
  
  DAYS_OF_WEEK.forEach((day, index) => {
    const isToday = index === currentDayIndex;
    
    // Filter shifts for this user and day
    const dayShifts = state.shifts.filter(s => s.employeeId === profile.id && s.day === day);
    
    const card = document.createElement('div');
    card.className = `day-column-card ${isToday ? 'is-today' : ''}`;
    
    let shiftsHtml = '';
    if (dayShifts.length > 0) {
      dayShifts.forEach(shift => {
        // Look up coworkers for the same task and day (Point 8)
        const coworkers = state.shifts.filter(s => 
          s.taskId === shift.taskId && 
          s.day === shift.day && 
          s.employeeId !== profile.id
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
              <span class="status-dot"></span>
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

// --- VIEW 2: FULL SCHEDULE with Category Blocks (Point 5 & 7) ---
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
    
    // Category Header
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
    
    const headerHtml = `
      <div class="category-title-container">
        <span class="category-title">${cat.name}</span>
        ${deleteCategoryBtn}
      </div>
    `;
    
    // Category Table
    let rowsHtml = '';
    if (cat.tasks.length === 0) {
      rowsHtml = `
        <tr>
          <td colspan="6" class="no-tasks-text" style="text-align: center;">Brak zadań w tej kategorii.</td>
        </tr>
      `;
    }
    
    let tableHtml = `
      <div class="schedule-table-wrapper">
        <table class="schedule-table">
          <thead>
            <tr>
              <th class="col-task">ZADANIE</th>
              <th class="col-day">PONIEDZIAŁEK</th>
              <th class="col-day">WTOREK</th>
              <th class="col-day">ŚRODA</th>
              <th class="col-day highlighted">CZWARTEK</th>
              <th class="col-day">PIĄTEK</th>
            </tr>
          </thead>
          <tbody class="category-table-body" data-category-id="${cat.id}">
            <!-- Task rows loaded dynamically -->
          </tbody>
        </table>
      </div>
    `;
    
    // Category Footer for Admin (Inline add task)
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
    
    block.innerHTML = headerHtml + tableHtml + footerHtml;
    container.appendChild(block);
    
    // Render the task rows for this category
    const tbody = block.querySelector('.category-table-body');
    tbody.innerHTML = '';
    
    cat.tasks.forEach(task => {
      const tr = document.createElement('tr');
      
      // Task Name cell with optional delete button for Admin
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
      
      tdTask.innerHTML = `
        <div class="task-name-wrapper">
          <span>${task}</span>
          ${deleteTaskBtn}
        </div>
      `;
      tr.appendChild(tdTask);
      
      // Day Cells
      DAYS_OF_WEEK.forEach(day => {
        const tdDay = document.createElement('td');
        tdDay.className = 'cell-day';
        if (day === 'Czwartek') {
          tdDay.classList.add('col-thursday-cell');
        }
        
        tdDay.setAttribute('data-task', task);
        tdDay.setAttribute('data-day', day);
        
        const cellShifts = state.shifts.filter(s => s.taskId === task && s.day === day);
        
        const shiftsContainer = document.createElement('div');
        shiftsContainer.className = 'shifts-container';
        
        cellShifts.forEach(shift => {
          const emp = state.employees.find(e => e.id === shift.employeeId);
          const empName = emp ? emp.name : 'Nieznana osoba';
          
          const card = document.createElement('div');
          card.className = 'shift-card';
          card.setAttribute('data-shift-id', shift.id);
          card.innerHTML = `
            <div class="shift-card-header">
              <span class="status-dot"></span>
              <span class="employee-name">${empName}</span>
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
              e.stopPropagation(); // prevent tdDay click
              openAssignModal(task, day, shift.id);
            }
          });
          
          shiftsContainer.appendChild(card);
        });
        
        tdDay.appendChild(shiftsContainer);
        
        // Click cell to assign (Admin only)
        tdDay.addEventListener('click', () => {
          if (isAdmin) {
            openAssignModal(task, day);
          }
        });
        
        tr.appendChild(tdDay);
      });
      
      tbody.appendChild(tr);
    });
    
    // Add event listener to input fields in category footer for Enter keypress
    if (isAdmin) {
      const taskInput = block.querySelector('.input-new-task');
      taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleAddTask(cat.id);
        }
      });
    }
  });
}

// --- CATEGORIES & TASKS ACTIONS ---
function handleAddTask(categoryId) {
  const block = document.querySelector(`.category-block[data-category-id="${categoryId}"]`);
  const input = block.querySelector('.input-new-task');
  const taskName = input.value.trim();
  
  if (!taskName) return;
  
  // Find category
  const catIndex = state.categories.findIndex(c => c.id === categoryId);
  if (catIndex === -1) return;
  
  // Check if task already exists in any category
  const exists = state.categories.some(c => c.tasks.some(t => t.toLowerCase() === taskName.toLowerCase()));
  if (exists) {
    showToast('Zadanie o tej nazwie już istnieje w grafiku', 'danger');
    return;
  }
  
  // Record action for undo/redo
  recordAction();
  
  // Add task to category
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
  
  // Record action
  recordAction();
  
  // Remove task from category
  state.categories[catIndex].tasks = state.categories[catIndex].tasks.filter(t => t !== taskName);
  
  // Remove shifts associated with this task
  state.shifts = state.shifts.filter(s => s.taskId !== taskName);
  
  saveStateToStorage();
  renderFullScheduleView();
  showToast(`Usunięto zadanie "${taskName}"`);
}

function addCategory(name) {
  const cleanName = name.trim();
  if (!cleanName) return;
  
  // Check if category name exists
  const exists = state.categories.some(c => c.name.toLowerCase() === cleanName.toLowerCase());
  if (exists) {
    showToast('Kategoria o tej nazwie już istnieje', 'danger');
    return;
  }
  
  // Record action
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
  
  // Record action
  recordAction();
  
  // Remove shifts for all tasks in this category
  cat.tasks.forEach(taskName => {
    state.shifts = state.shifts.filter(s => s.taskId !== taskName);
  });
  
  // Remove category
  state.categories = state.categories.filter(c => c.id !== categoryId);
  
  saveStateToStorage();
  renderFullScheduleView();
  showToast(`Usunięto kategorię "${cat.name}"`);
}

// --- VIEW 3: TEAM MANAGEMENT (ZARZĄDZANIE ZESPOŁEM) ---
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
    
    // Avatar initials
    const initials = emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const roleClass = emp.role === 'Administrator' ? 'role-administrator' : 'role-osoba';
    const badgeClass = emp.role === 'Administrator' ? 'badge-administrator' : 'badge-osoba';
    
    // Safe role controls (Point 4: Admin cannot change their own role or delete themselves)
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
    
    // Toggle role (only if not disabled)
    const badge = item.querySelector('.role-badge');
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isDisabled) {
        showToast('Jako zalogowany Administrator nie możesz zmienić swojej własnej roli', 'danger');
        return;
      }
      toggleEmployeeRole(emp.id);
    });
    
    // Delete member (only if not disabled)
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

// --- ACTIONS: TEAM MANAGEMENT ---
function toggleEmployeeRole(empId) {
  const empIndex = state.employees.findIndex(e => e.id === empId);
  if (empIndex === -1) return;
  
  const oldRole = state.employees[empIndex].role;
  const newRole = oldRole === 'Administrator' ? 'Osoba' : 'Administrator';
  
  // Safe role check: double check to make sure at least one administrator is left
  const admins = state.employees.filter(e => e.role === 'Administrator');
  if (oldRole === 'Administrator' && admins.length === 1) {
    showToast('W systemie musi pozostać przynajmniej jeden Administrator', 'danger');
    return;
  }
  
  // Record action
  recordAction();
  
  state.employees[empIndex].role = newRole;
  saveStateToStorage();
  
  populateProfileDropdown();
  updateRoleMode();
  renderTeamManagementView();
  if (state.activeTab === 'my-tasks') renderMyTasksView();
  
  showToast(`Zmieniono rolę użytkownika ${state.employees[empIndex].name} na ${newRole}`);
}

function deleteEmployee(empId) {
  const empIndex = state.employees.findIndex(e => e.id === empId);
  if (empIndex === -1) return;
  
  const empName = state.employees[empIndex].name;
  const empRole = state.employees[empIndex].role;
  
  // Safe check
  const admins = state.employees.filter(e => e.role === 'Administrator');
  if (empRole === 'Administrator' && admins.length === 1) {
    showToast('Nie można usunąć jedynego Administratora w systemie', 'danger');
    return;
  }
  
  if (confirm(`Czy na pewno chcesz usunąć ${empName} z zespołu? Usunięte zostaną również wszystkie powiązane dyżury.`)) {
    // Record action
    recordAction();
    
    state.employees.splice(empIndex, 1);
    state.shifts = state.shifts.filter(s => s.employeeId !== empId);
    
    // Switch active profile if we deleted the current one
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
  
  // Ensure we display main form and hide unrecognized panels on open
  mainContent.classList.remove('hidden');
  unrecognizedPanel.classList.add('hidden');
  
  // Set subtitle task and day
  titleTask.textContent = task;
  titleDay.textContent = day;
  
  // Setup modal people names array
  if (shiftId) {
    // Edit Mode - single shift card
    const shift = state.shifts.find(s => s.id === shiftId);
    if (shift) {
      const emp = state.employees.find(e => e.id === shift.employeeId);
      state.modalPeople = [emp ? emp.name : ''];
      inputTime.value = shift.time;
      deleteBtn.classList.remove('hidden');
    }
  } else {
    // Create Mode - empty slate
    state.modalPeople = [''];
    inputTime.value = '08:00–12:00'; // Default
    deleteBtn.classList.add('hidden');
  }
  
  // Render autocomplete name inputs
  renderPeopleInputs();
  
  // Render quick presets
  renderPresetButtons();
  
  // Highlight active preset button if match
  syncPresetHighlight(inputTime.value);
  
  // Open modal with transitions
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // Lock scrolling
  
  // Focus the first name input
  focusPeopleInputRow(0);
}

function closeAssignModal() {
  const modal = document.getElementById('assignModal');
  modal.classList.add('hidden');
  document.body.style.overflow = ''; // Unlock scrolling
  
  // Reset state
  state.editingShiftId = null;
  state.activeCellTask = null;
  state.activeCellDay = null;
  state.modalPeople = [''];
  state.unrecognizedNames = [];
  state.pendingSaveCallback = null;
}

// --- RENDER DYNAMIC AUTOCOMPLETE INPUTS (Point 2 & 3) ---
function renderPeopleInputs() {
  const container = document.getElementById('modalPeopleInputsContainer');
  container.innerHTML = '';
  
  state.modalPeople.forEach((nameValue, index) => {
    const row = document.createElement('div');
    row.className = 'autocomplete-row';
    row.setAttribute('data-index', index);
    
    // Close row button if multiple
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
    
    // Input elements
    const input = row.querySelector('.modal-person-input');
    const dropdown = row.querySelector('.suggestions-dropdown');
    
    // Bind Key and Input Events for Autocomplete and Nav
    input.addEventListener('input', (e) => {
      let val = e.target.value;
      
      // Fallback for Comma handling (Point 2: triggers when comma is entered in input)
      if (val.endsWith(',')) {
        val = val.slice(0, -1); // strip comma
        
        // Autocomplete with highlighted suggestion if open
        let chosenName = val.trim();
        const suggestions = dropdown.querySelectorAll('.suggestion-item');
        if (!dropdown.classList.contains('hidden') && state.activeSuggestionIndex !== -1 && suggestions[state.activeSuggestionIndex]) {
          chosenName = suggestions[state.activeSuggestionIndex].getAttribute('data-name');
        }
        
        // Complete current row and append a new one
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
        
        // Point 3: Enter autocompletes but KEEPS focus in current input
        if (!dropdown.classList.contains('hidden')) {
          if (state.activeSuggestionIndex !== -1 && suggestions[state.activeSuggestionIndex]) {
            const selectedName = suggestions[state.activeSuggestionIndex].getAttribute('data-name');
            state.modalPeople[index] = selectedName;
            renderPeopleInputs();
            // Focus remains on this row so they can type comma next
            focusPeopleInputRow(index);
          }
        } else {
          // Dropdown is already closed: press Enter again to move focus
          if (val.trim() !== '') {
            // Move to next input or to time input
            if (index < state.modalPeople.length - 1) {
              focusPeopleInputRow(index + 1);
            } else {
              document.getElementById('modalTimeInput').focus();
            }
          }
        }
      }
      else if (e.key === ',') {
        e.preventDefault(); // prevent comma char
        
        // Autocomplete with highlighted suggestion if open
        let chosenName = val.trim();
        if (!dropdown.classList.contains('hidden') && state.activeSuggestionIndex !== -1 && suggestions[state.activeSuggestionIndex]) {
          chosenName = suggestions[state.activeSuggestionIndex].getAttribute('data-name');
        }
        
        // Complete current row and append a new one (Point 2)
        state.modalPeople[index] = chosenName;
        state.modalPeople.push('');
        renderPeopleInputs();
        focusPeopleInputRow(state.modalPeople.length - 1);
      }
    });
    
    // Handle clicking outside to close suggestions
    input.addEventListener('focus', () => {
      if (input.value.trim() !== '') {
        showAutocompleteSuggestions(index, input.value);
      }
    });
    
    // Close dropdown on delay so click events on suggestions can process
    input.addEventListener('blur', () => {
      setTimeout(() => {
        dropdown.classList.add('hidden');
      }, 200);
    });
  });
}

function focusPeopleInputRow(index) {
  const rows = document.querySelectorAll('.autocomplete-row');
  if (rows[index]) {
    const input = rows[index].querySelector('.modal-person-input');
    if (input) input.focus();
  }
}

function removePeopleInputRow(index) {
  state.modalPeople.splice(index, 1);
  renderPeopleInputs();
  // Focus the last remaining input row
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
  
  // Filter team members based on typed text
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
  state.activeSuggestionIndex = 0; // Default highlight the first option
  
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
      e.preventDefault(); // prevent blur
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

function selectAutocompleteSuggestion(index, name) {
  state.modalPeople[index] = name;
  renderPeopleInputs();
  // Focus remains in the input (Point 3)
  focusPeopleInputRow(index);
}

// --- RENDER COMPACT PRESETS with inline deletion (Point 4) ---
function renderPresetButtons() {
  const grid = document.getElementById('quickSelectGrid');
  grid.innerHTML = '';
  
  state.presets.forEach((p, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'preset-wrapper';
    
    // Select button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.setAttribute('data-time', p.time);
    btn.setAttribute('data-preset', p.label);
    btn.innerHTML = `
      <span class="preset-label">${p.label}</span>
      <span class="preset-value">${p.time}</span>
    `;
    
    // Delete button next to it (Point 4)
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'preset-delete-btn';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Usuń szablon';
    
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent triggering selection
      deletePreset(index);
    });
    
    wrapper.appendChild(btn);
    wrapper.appendChild(delBtn);
    grid.appendChild(wrapper);
  });
  
  // Resync active selection highlights
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

// --- ACTIONS: PRESETS (Point 4) ---
function addPreset() {
  const labelInput = document.getElementById('newPresetLabel');
  const timeInput = document.getElementById('newPresetTime');
  
  const label = labelInput.value.trim();
  const time = timeInput.value.trim();
  
  if (!label || !time) {
    showToast('Wypełnij oba pola szablonu (Etykieta i Godziny)', 'danger');
    return;
  }
  
  // Record action
  recordAction();
  
  // Add to state
  state.presets.push({ label, time });
  saveStateToStorage();
  
  // Clear inputs
  labelInput.value = '';
  timeInput.value = '';
  
  // Re-render
  renderPresetButtons();
  showToast(`Dodano szablon "${label}"`);
}

function deletePreset(index) {
  const p = state.presets[index];
  
  // Record action
  recordAction();
  
  state.presets.splice(index, 1);
  saveStateToStorage();
  
  renderPresetButtons();
  showToast(`Usunięto szablon "${p.label}"`);
}


// --- SAVE SHIFT LOGIC ---
function saveShift(closeAfter = true) {
  const timeInput = document.getElementById('modalTimeInput');
  const time = timeInput.value.trim();
  
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
  
  // Check if any names are not in the team database (Point 3)
  const unrecognized = [];
  names.forEach(name => {
    const exists = state.employees.some(emp => emp.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      unrecognized.push(name);
    }
  });
  
  if (unrecognized.length > 0) {
    // Pause save, launch unrecognized names workflow (Point 3)
    state.unrecognizedNames = unrecognized;
    state.pendingSaveCallback = () => executeSave(names, time, closeAfter);
    openUnrecognizedNamesPanel();
    return false;
  }
  
  return executeSave(names, time, closeAfter);
}

function executeSave(names, time, closeAfter) {
  // Record action for undo/redo
  recordAction();
  
  // Map names to employee IDs
  const employeeIds = names.map(name => {
    const emp = state.employees.find(e => e.name.toLowerCase() === name.toLowerCase());
    return emp.id;
  });
  
  if (state.editingShiftId) {
    // Edit Mode - single shift update
    const shiftIndex = state.shifts.findIndex(s => s.id === state.editingShiftId);
    if (shiftIndex !== -1) {
      state.shifts[shiftIndex].employeeId = employeeIds[0];
      state.shifts[shiftIndex].time = time;
    }
    showToast('Zaktualizowano zmianę pomyślnie');
  } else {
    // Create Mode - create shifts for each entered person in the cell
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

// --- UNRECOGNIZED NAMES INTERACTIVE PANEL (Point 3) ---
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
  // Record action for undo/redo
  recordAction();
  
  // Create member in database
  const newEmp = {
    id: 'emp-' + Date.now() + '-' + Math.floor(Math.random() * 100),
    name: name,
    role: role
  };
  
  state.employees.push(newEmp);
  saveStateToStorage();
  
  // Sync UI
  populateProfileDropdown();
  updateRoleMode();
  
  // Remove from unrecognized list
  state.unrecognizedNames = state.unrecognizedNames.filter(n => n !== name);
  showToast(`Dodano "${name}" do zespołu jako ${role}`);
  
  if (state.unrecognizedNames.length === 0) {
    if (state.pendingSaveCallback) {
      state.pendingSaveCallback();
    }
  } else {
    renderUnrecognizedNamesList();
  }
}

function handleCorrectUnrecognizedName(name) {
  closeUnrecognizedNamesPanel();
  
  // Find which input had this name and focus it
  const inputRows = document.querySelectorAll('.autocomplete-row');
  inputRows.forEach(row => {
    const input = row.querySelector('.modal-person-input');
    if (input && input.value.trim().toLowerCase() === name.toLowerCase()) {
      input.focus();
      input.select();
    }
  });
}

// --- DELETE SHIFT ---
function deleteActiveShift() {
  if (!state.editingShiftId) return;
  
  if (confirm('Czy na pewno chcesz usunąć tę zmianę?')) {
    // Record action
    recordAction();
    
    state.shifts = state.shifts.filter(s => s.id !== state.editingShiftId);
    saveStateToStorage();
    renderFullScheduleView();
    closeAssignModal();
    showToast('Zmiana została usunięta');
  }
}

// --- AUTO-SAVE ON CLICK OUTSIDE / BLUR ---
function autoSaveAndClose() {
  const timeInput = document.getElementById('modalTimeInput');
  const time = timeInput.value.trim();
  
  // Collect entered names
  const names = state.modalPeople
    .map(n => n.trim())
    .filter(n => n !== '');
  
  if (names.length > 0 && time !== '') {
    // Check for unrecognized names
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
  // 1. Profile Switched
  const profileSelect = document.getElementById('profileSelect');
  profileSelect.addEventListener('change', (e) => {
    state.currentProfileId = e.target.value;
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
    
    updateRoleMode();
    if (state.activeTab === 'my-tasks') renderMyTasksView();
    renderFullScheduleView();
    showToast(`Przełączono profil na: ${getCurrentProfile().name}`);
  });

  // 2. Navigation Tabs
  const tabButtons = document.querySelectorAll('.nav-tab');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // 3. Add Person Form (in Team Management View)
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
    
    // Record action
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

  // 4. Role Toggle Buttons (in Add Person card)
  const roleToggleBtns = document.querySelectorAll('.role-toggle-btn');
  roleToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      roleToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedRoleForNewPerson = btn.getAttribute('data-role');
    });
  });

  // 5. Search Members Input
  const searchInput = document.getElementById('searchMemberInput');
  searchInput.addEventListener('input', () => {
    renderTeamManagementView();
  });

  // 6. Modal Close and Cancel
  document.getElementById('btnModalClose').addEventListener('click', closeAssignModal);
  document.getElementById('btnCancelShift').addEventListener('click', closeAssignModal);
  
  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('assignModal').classList.contains('hidden')) {
      closeAssignModal();
    }
  });

  // 7. Preset Selection inside Grid
  const presetGrid = document.getElementById('quickSelectGrid');
  presetGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    
    const timeVal = btn.getAttribute('data-time');
    document.getElementById('modalTimeInput').value = timeVal;
    
    syncPresetHighlight(timeVal);
  });

  // 8. Custom Time Input Sync
  const timeInput = document.getElementById('modalTimeInput');
  timeInput.addEventListener('input', (e) => {
    syncPresetHighlight(e.target.value.trim());
  });
  
  // 9. Time Input Enter keypress to submit
  timeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveShift(true);
    }
  });

  // 10. Save Shift Button Submit
  document.getElementById('assignForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveShift(true);
  });

  // 11. Delete Shift Button
  document.getElementById('btnDeleteShift').addEventListener('click', deleteActiveShift);

  // 12. Simplified Preset Add Inline Form (Point 4)
  document.getElementById('btnInlineAddPreset').addEventListener('click', addPreset);
  
  // Support Enter keypress in inline preset inputs
  const presetInputs = [document.getElementById('newPresetLabel'), document.getElementById('newPresetTime')];
  presetInputs.forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addPreset();
      }
    });
  });

  // 13. Auto-save on Click Outside (detect when clicked outside modal container)
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

  // 14. Admin Schedule Controls - Add Category Block (Point 7)
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

  // 15. Undo and Redo Button clicks (Point 1)
  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnRedo').addEventListener('click', redo);
  
  // 16. Keyboard Shortcuts for Undo / Redo (Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Y) (Point 1)
  document.addEventListener('keydown', (e) => {
    // Check if focused element is a text input - if so, allow default browser text undo/redo
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
          redo(); // Shift+Cmd+Z/Shift+Ctrl+Z to redo
        } else {
          undo();
        }
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo(); // Cmd+Y/Ctrl+Y to redo
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
