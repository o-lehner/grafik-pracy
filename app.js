/*
  Grafik Pracy BLDSRV - Application Logic
  Implements state management, LocalStorage persistence,
  dynamic rendering, modal interactions, and role-based views.
*/

// --- INITIAL DATA SEEDING ---
const DEFAULT_EMPLOYEES = [
  { id: 'emp-1', name: 'Bartosz Toporowski', role: 'Nadzorca' },
  { id: 'emp-2', name: 'Jan Kowalski', role: 'Pracownik' },
  { id: 'emp-3', name: 'Anna Nowak', role: 'Pracownik' },
  { id: 'emp-4', name: 'Piotr Zieliński', role: 'Pracownik' },
  { id: 'emp-5', name: 'Snizhana Fedunyshyn', role: 'Pracownik' }
];

const DEFAULT_TASKS = [
  'Cleaning 1.0',
  'Cleaning 2.0',
  'Cleaning 2.1',
  'Housekeeping',
  'Laundry (Pralnia)'
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

const DAYS_OF_WEEK = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek'];

// --- STATE STATE STATE ---
let state = {
  employees: [],
  tasks: [],
  shifts: [],
  currentProfileId: '',
  activeTab: 'full-schedule', // 'my-tasks', 'full-schedule', 'manage-team'
  selectedRoleForNewPerson: 'Pracownik',
  editingShiftId: null,
  activeCellTask: null,
  activeCellDay: null
};

// --- INITIALIZATION ---
function initApp() {
  // Load from localStorage or seed defaults
  state.employees = JSON.parse(localStorage.getItem('bldsrv_employees')) || DEFAULT_EMPLOYEES;
  state.tasks = JSON.parse(localStorage.getItem('bldsrv_tasks')) || DEFAULT_TASKS;
  state.shifts = JSON.parse(localStorage.getItem('bldsrv_shifts')) || DEFAULT_SHIFTS;
  
  // Save defaults back to storage if they weren't there
  if (!localStorage.getItem('bldsrv_employees')) {
    localStorage.setItem('bldsrv_employees', JSON.stringify(state.employees));
    localStorage.setItem('bldsrv_tasks', JSON.stringify(state.tasks));
    localStorage.setItem('bldsrv_shifts', JSON.stringify(state.shifts));
  }

  // Set default current profile (first supervisor, or first employee)
  const savedProfileId = localStorage.getItem('bldsrv_active_profile');
  const exists = state.employees.some(e => e.id === savedProfileId);
  if (savedProfileId && exists) {
    state.currentProfileId = savedProfileId;
  } else {
    const supervisor = state.employees.find(e => e.role === 'Nadzorca');
    state.currentProfileId = supervisor ? supervisor.id : state.employees[0]?.id || '';
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
  }

  // Setup Event Listeners
  setupEventListeners();
  
  // Render Everything
  populateProfileDropdown();
  updateRoleMode();
  renderTabs();
  renderActiveView();
}

// --- STATE SAVING ---
function saveStateToStorage() {
  localStorage.setItem('bldsrv_employees', JSON.stringify(state.employees));
  localStorage.setItem('bldsrv_tasks', JSON.stringify(state.tasks));
  localStorage.setItem('bldsrv_shifts', JSON.stringify(state.shifts));
}

// --- HELPER: GET CURRENT PROFILE ROLE ---
function getCurrentProfile() {
  return state.employees.find(e => e.id === state.currentProfileId) || state.employees[0];
}

// --- UPDATE ROLE CAPABILITIES (Supervisor vs Employee) ---
function updateRoleMode() {
  const profile = getCurrentProfile();
  const body = document.body;
  const tabManageTeamBtn = document.getElementById('tabManageTeam');
  
  if (!profile) return;

  if (profile.role === 'Nadzorca') {
    body.classList.add('app-mode-supervisor');
    tabManageTeamBtn.classList.remove('hidden');
  } else {
    body.classList.remove('app-mode-supervisor');
    // Hide management tab for regular employees
    tabManageTeamBtn.classList.add('hidden');
    
    // If the active tab was team management, redirect to full schedule
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
  
  // Determine current day of week to highlight
  // Default to Thursday (index 3) to match screenshot if today is weekend, otherwise use real day
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
        shiftsHtml += `
          <div class="shift-card">
            <div class="shift-card-header">
              <span class="status-dot"></span>
              <span class="employee-name">${shift.time}</span>
            </div>
            <span class="shift-task-badge">${shift.taskId}</span>
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

// --- VIEW 2: FULL SCHEDULE (CAŁY GRAFIK) ---
function renderFullScheduleView() {
  const tbody = document.getElementById('scheduleTableBody');
  tbody.innerHTML = '';
  
  state.tasks.forEach(task => {
    const tr = document.createElement('tr');
    
    // Task Category Cell
    const tdTask = document.createElement('td');
    tdTask.className = 'cell-task-name';
    tdTask.textContent = task;
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
        const empName = emp ? emp.name : 'Nieznany pracownik';
        
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
        
        // Clicks on shift card to edit (only for supervisor)
        card.addEventListener('click', (e) => {
          const profile = getCurrentProfile();
          if (profile && profile.role === 'Nadzorca') {
            e.stopPropagation(); // prevent triggering tdDay click
            openAssignModal(task, day, shift.id);
          }
        });
        
        shiftsContainer.appendChild(card);
      });
      
      tdDay.appendChild(shiftsContainer);
      
      // Click cell to assign (only for supervisor)
      tdDay.addEventListener('click', () => {
        const profile = getCurrentProfile();
        if (profile && profile.role === 'Nadzorca') {
          openAssignModal(task, day);
        }
      });
      
      tr.appendChild(tdDay);
    });
    
    tbody.appendChild(tr);
  });
}

// --- VIEW 3: TEAM MANAGEMENT (ZARZĄDZANIE ZESPOŁEM) ---
function renderTeamManagementView() {
  // Update members count
  document.getElementById('membersCount').textContent = state.employees.length;
  
  const container = document.getElementById('membersListContainer');
  container.innerHTML = '';
  
  const searchVal = document.getElementById('searchMemberInput').value.toLowerCase();
  const filteredEmployees = state.employees.filter(emp => 
    emp.name.toLowerCase().includes(searchVal)
  );
  
  if (filteredEmployees.length === 0) {
    container.innerHTML = `<p class="no-tasks-text">Brak pasujących członków zespołu</p>`;
    return;
  }
  
  filteredEmployees.forEach(emp => {
    const item = document.createElement('div');
    item.className = 'member-item';
    
    // Avatar initials
    const initials = emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const roleClass = emp.role === 'Nadzorca' ? 'role-nadzorca' : 'role-pracownik';
    const badgeClass = emp.role === 'Nadzorca' ? 'badge-nadzorca' : 'badge-pracownik';
    
    item.innerHTML = `
      <div class="member-info">
        <div class="member-avatar ${roleClass}">${initials}</div>
        <div class="member-details">
          <span class="member-name">${emp.name}</span>
          <span class="role-badge ${badgeClass}" data-emp-id="${emp.id}">
            ${emp.role}
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
          </span>
        </div>
      </div>
      <button class="btn-delete-member" data-emp-id="${emp.id}" title="Usuń członka zespołu">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>
    `;
    
    // Toggle role when clicking the badge
    const badge = item.querySelector('.role-badge');
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEmployeeRole(emp.id);
    });
    
    // Delete member
    const deleteBtn = item.querySelector('.btn-delete-member');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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
  const newRole = oldRole === 'Nadzorca' ? 'Pracownik' : 'Nadzorca';
  
  // If we're changing the last supervisor to an employee, warn/prevent to avoid lockouts
  const supervisors = state.employees.filter(e => e.role === 'Nadzorca');
  if (oldRole === 'Nadzorca' && supervisors.length === 1) {
    showToast('W systemie musi pozostać przynajmniej jeden Nadzorca', 'danger');
    return;
  }
  
  state.employees[empIndex].role = newRole;
  saveStateToStorage();
  
  // Sync views
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
  
  // Check if we are deleting the last supervisor
  const supervisors = state.employees.filter(e => e.role === 'Nadzorca');
  if (empRole === 'Nadzorca' && supervisors.length === 1) {
    showToast('Nie można usunąć jedynego Nadzorcy w systemie', 'danger');
    return;
  }
  
  if (confirm(`Czy na pewno chcesz usunąć ${empName} z zespołu? Usunięte zostaną również wszystkie powiązane dyżury.`)) {
    // Remove employee
    state.employees.splice(empIndex, 1);
    
    // Clean up shifts
    state.shifts = state.shifts.filter(s => s.employeeId !== empId);
    
    // If active profile was deleted, switch to the first supervisor or first available
    if (state.currentProfileId === empId) {
      const replacement = state.employees.find(e => e.role === 'Nadzorca') || state.employees[0];
      state.currentProfileId = replacement ? replacement.id : '';
      localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
    }
    
    saveStateToStorage();
    
    // Refresh views
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
  const selectEmp = document.getElementById('modalEmployeeSelect');
  const inputTime = document.getElementById('modalTimeInput');
  const deleteBtn = document.getElementById('btnDeleteShift');
  
  // Set subtitle task and day
  titleTask.textContent = task;
  titleDay.textContent = day;
  
  // Populate employee select list
  selectEmp.innerHTML = '';
  state.employees.forEach(emp => {
    const option = document.createElement('option');
    option.value = emp.id;
    option.textContent = emp.name;
    selectEmp.appendChild(option);
  });
  
  // Setup modal for editing or creating
  if (shiftId) {
    // Edit Mode
    const shift = state.shifts.find(s => s.id === shiftId);
    if (shift) {
      selectEmp.value = shift.employeeId;
      inputTime.value = shift.time;
      deleteBtn.classList.remove('hidden');
    }
  } else {
    // Create Mode
    selectEmp.value = selectEmp.options[0]?.value || '';
    inputTime.value = '08:00–12:00'; // Default to morning shift
    deleteBtn.classList.add('hidden');
  }
  
  // Highlight active preset button if match
  syncPresetHighlight(inputTime.value);
  
  // Open modal with transitions
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // Lock scrolling
  
  // Focus on time input
  setTimeout(() => inputTime.focus(), 50);
}

function closeAssignModal() {
  const modal = document.getElementById('assignModal');
  modal.classList.add('hidden');
  document.body.style.overflow = ''; // Unlock scrolling
  state.editingShiftId = null;
  state.activeCellTask = null;
  state.activeCellDay = null;
}

function syncPresetHighlight(timeString) {
  const presetButtons = document.querySelectorAll('.preset-btn');
  presetButtons.forEach(btn => {
    const btnTime = btn.getAttribute('data-time');
    if (btnTime === timeString) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function saveShift(closeAfter = true) {
  const empSelect = document.getElementById('modalEmployeeSelect');
  const timeInput = document.getElementById('modalTimeInput');
  
  const empId = empSelect.value;
  const time = timeInput.value.trim();
  
  if (!empId) {
    showToast('Wybierz osobę z listy', 'danger');
    return false;
  }
  if (!time) {
    showToast('Podaj godziny pracy', 'danger');
    return false;
  }
  
  if (state.editingShiftId) {
    // Update existing shift
    const shiftIndex = state.shifts.findIndex(s => s.id === state.editingShiftId);
    if (shiftIndex !== -1) {
      state.shifts[shiftIndex].employeeId = empId;
      state.shifts[shiftIndex].time = time;
    }
    showToast('Zaktualizowano zmianę pomyślnie');
  } else {
    // Create new shift
    const newShift = {
      id: 'shift-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      taskId: state.activeCellTask,
      day: state.activeCellDay,
      employeeId: empId,
      time: time
    };
    state.shifts.push(newShift);
    showToast('Dodano nową zmianę');
  }
  
  saveStateToStorage();
  renderFullScheduleView();
  
  if (closeAfter) {
    closeAssignModal();
  } else {
    // If "Assign another", reset name dropdown to next person if possible, clear input
    // To make assigning multiple people fast and seamless
    const currentEmpIndex = state.employees.findIndex(e => e.id === empId);
    const nextEmp = state.employees[(currentEmpIndex + 1) % state.employees.length];
    if (nextEmp) {
      empSelect.value = nextEmp.id;
    }
    showToast('Przypisano. Możesz wybrać kolejną osobę do tego samego zadania.');
  }
  
  return true;
}

function deleteActiveShift() {
  if (!state.editingShiftId) return;
  
  if (confirm('Czy na pewno chcesz usunąć tę zmianę?')) {
    state.shifts = state.shifts.filter(s => s.id !== state.editingShiftId);
    saveStateToStorage();
    renderFullScheduleView();
    closeAssignModal();
    showToast('Zmiana została usunięta');
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
  
  // Remove toast after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'toast-in 0.25s reverse forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

// --- EVENT LISTENERS CONFIGURATION ---
function setupEventListeners() {
  // 1. Profile Switched
  const profileSelect = document.getElementById('profileSelect');
  profileSelect.addEventListener('change', (e) => {
    state.currentProfileId = e.target.value;
    localStorage.setItem('bldsrv_active_profile', state.currentProfileId);
    
    updateRoleMode();
    if (state.activeTab === 'my-tasks') {
      renderMyTasksView();
    }
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

  // 3. Add Person Form
  const addPersonForm = document.getElementById('addPersonForm');
  addPersonForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('newPersonName');
    const name = nameInput.value.trim();
    
    if (!name) return;
    
    // Create new employee
    const newEmp = {
      id: 'emp-' + Date.now(),
      name: name,
      role: state.selectedRoleForNewPerson
    };
    
    state.employees.push(newEmp);
    saveStateToStorage();
    
    // Reset form
    nameInput.value = '';
    
    // Sync UI
    populateProfileDropdown();
    renderTeamManagementView();
    
    showToast(`Dodano nowego członka zespołu: ${name}`);
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

  // 6. Modal Close Buttons
  document.getElementById('btnModalClose').addEventListener('click', closeAssignModal);
  document.getElementById('btnCancelShift').addEventListener('click', closeAssignModal);
  
  // Close modal on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAssignModal();
    }
  });

  // 7. Preset Selection in Modal
  const presetGrid = document.getElementById('quickSelectGrid');
  presetGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    
    const timeVal = btn.getAttribute('data-time');
    document.getElementById('modalTimeInput').value = timeVal;
    
    syncPresetHighlight(timeVal);
  });

  // 8. Custom Time Input Sync Preset
  const timeInput = document.getElementById('modalTimeInput');
  timeInput.addEventListener('input', (e) => {
    syncPresetHighlight(e.target.value.trim());
  });

  // 9. Save Shift Button
  document.getElementById('assignForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveShift(true);
  });
  
  // 10. Assign Another Person Button
  document.getElementById('btnAssignAnother').addEventListener('click', () => {
    saveShift(false);
  });

  // 11. Delete Shift Button
  document.getElementById('btnDeleteShift').addEventListener('click', deleteActiveShift);

  // 12. Modal Overlay click to close
  const modalOverlay = document.getElementById('assignModal');
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeAssignModal();
    }
  });
  
  // Prevent modal container clicks from closing the modal
  document.querySelector('.modal-container').addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 13. Manage Presets link (just showing a toast as extra premium feature description)
  document.getElementById('btnManagePresets').addEventListener('click', () => {
    showToast('Funkcja dostosowywania szablonów godzin jest dostępna w wersji PRO', 'info');
  });
}

// --- START UP ---
window.addEventListener('DOMContentLoaded', initApp);
