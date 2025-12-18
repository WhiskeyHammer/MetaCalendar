const calendar = document.getElementById('calendar');
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_TITLE = "Title";
const DEFAULT_BODY = "Notes...";
const DATA_VERSION = "v11"; 
const VIEW_SETTINGS_KEY = "tweek-view-settings";

// DEFAULT VIEW SETTINGS
const DEFAULT_TOTAL_DAYS = 7;
const DEFAULT_PAST_DAYS = 1;

let draggedElement = null;
let placeholder = document.createElement('div');
placeholder.className = 'placeholder';
let currentNoteElement = null;
let currentDateKey = null;

// NAVIGATION STATE
let navigationOffset = 0; // 0 = Default (based on pastDays setting)

function toggleDropdown() { document.getElementById('appDropdown').classList.toggle('show'); }
window.addEventListener('click', (e) => {
    if (!e.target.closest('.app-settings-container')) { document.getElementById('appDropdown').classList.remove('show'); }
});

function exportData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('tweek-')) { data[key] = localStorage.getItem(key); }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planner-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toggleDropdown();
}

function triggerImport() { document.getElementById('fileInput').click(); }
function importData(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('tweek-')) { keysToRemove.push(key); }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            Object.keys(data).forEach(key => { localStorage.setItem(key, data[key]); });
            alert('Import successful!'); location.reload(); 
        } catch (err) { alert('Error importing file: ' + err.message); }
    };
    reader.readAsText(file); toggleDropdown();
}

// --- VIEW & NAVIGATION LOGIC ---
function getViewSettings() {
    const saved = localStorage.getItem(VIEW_SETTINGS_KEY);
    if(saved) {
        const parsed = JSON.parse(saved);
        // Ensure darkMode exists if old settings are present
        if(parsed.darkMode === undefined) parsed.darkMode = false;
        return parsed;
    }
    return { total: DEFAULT_TOTAL_DAYS, past: DEFAULT_PAST_DAYS, darkMode: false };
}

function toggleDarkMode() {
    const settings = getViewSettings();
    settings.darkMode = !settings.darkMode;
    localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(settings));
    applyTheme();
}

function applyTheme() {
    const settings = getViewSettings();
    if(settings.darkMode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

function navigate(direction) {
    navigationOffset += direction;
    initCalendar();
}

function initCalendar() {
    applyTheme(); // Apply theme on load
    calendar.innerHTML = '';
    
    // 1. Get Settings
    const settings = getViewSettings();
    const totalDays = settings.total;
    const pastDays = settings.past;

    // 2. Apply Dynamic Grid Columns
    calendar.style.gridTemplateColumns = `repeat(${totalDays}, 1fr)`;

    // 3. Calculate Start Date (Past Days Setting + Navigation Shift)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - pastDays + navigationOffset);

    // 4. Generate Columns
    for (let i = 0; i < totalDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateKey = currentDate.toISOString().split('T')[0];
        const isToday = new Date().toDateString() === currentDate.toDateString();
        
        materializeRecurringNotes(dateKey, currentDate.getDay());
        
        const col = document.createElement('div');
        col.className = 'day-column';
        col.innerHTML = `
            <div class="day-header">${days[currentDate.getDay()]}</div>
            <div class="date-number ${isToday ? 'today' : ''}">${currentDate.getDate()}</div>
            <div class="note-container" data-date="${dateKey}"></div>
        `;
        const container = col.querySelector('.note-container');
        container.onclick = (e) => {
            if(e.target === container) {
                const insertBefore = getInsertPosition(container, e.clientY);
                createNote(container, dateKey, undefined, insertBefore);
            }
        };
        container.ondragover = (e) => handleDragOver(e, container);
        container.ondrop = (e) => handleDrop(e, container, dateKey);
        calendar.appendChild(col);
        loadNotes(dateKey); 
    }
}

// --- VIEW MODAL HANDLERS ---
const viewModal = document.getElementById('viewModal');
function openViewModal() {
    const settings = getViewSettings();
    document.getElementById('settingTotalDays').value = settings.total;
    document.getElementById('settingPastDays').value = settings.past;
    viewModal.style.display = 'flex';
    toggleDropdown(); // Close menu
}
function closeViewModal() { viewModal.style.display = 'none'; }
function saveViewSettings() {
    const total = parseInt(document.getElementById('settingTotalDays').value);
    const past = parseInt(document.getElementById('settingPastDays').value);
    // Dark mode is handled separately via toggleDarkMode() now
    
    if(total > 0 && past >= 0) {
        // We must preserve the current darkMode state when saving days settings
        const currentSettings = getViewSettings();
        const newSettings = { total, past, darkMode: currentSettings.darkMode };
        
        localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(newSettings));
        navigationOffset = 0; 
        closeViewModal();
        initCalendar();
    } else {
        alert("Please enter valid numbers");
    }
}


function getRecurringRules() { return JSON.parse(localStorage.getItem(`tweek-rules-${DATA_VERSION}`) || "[]"); }
function setRecurringRules(rules) { localStorage.setItem(`tweek-rules-${DATA_VERSION}`, JSON.stringify(rules)); }
function getCreationHistory() { return JSON.parse(localStorage.getItem(`tweek-history-${DATA_VERSION}`) || "[]"); }
function addToHistory(uniqueKey) {
    const history = getCreationHistory();
    if(!history.includes(uniqueKey)) {
        history.push(uniqueKey);
        localStorage.setItem(`tweek-history-${DATA_VERSION}`, JSON.stringify(history));
    }
}
function materializeRecurringNotes(dateKey, dayOfWeek) {
    const rules = getRecurringRules();
    const history = getCreationHistory();
    let notes = JSON.parse(localStorage.getItem(`tweek-final-${DATA_VERSION}-${dateKey}`) || "[]");
    let hasChanges = false;
    rules.forEach(rule => {
        const creationKey = `${rule.id}_${dateKey}`;
        if (history.includes(creationKey)) return; 
        if (dateKey >= rule.startDate) {
            if (rule.days && rule.days.includes(dayOfWeek)) {
                const exists = notes.some(n => n.seriesId === rule.id);
                if (!exists) {
                    notes.push({
                        id: Date.now().toString() + Math.random(),
                        title: rule.title,
                        body: rule.scope === 'all' ? rule.body : DEFAULT_BODY,
                        seriesId: rule.id
                    });
                    addToHistory(creationKey);
                    hasChanges = true;
                }
            }
        }
    });
    if (hasChanges) { localStorage.setItem(`tweek-final-${DATA_VERSION}-${dateKey}`, JSON.stringify(notes)); }
}

function createNote(container, dateKey, data = { title: DEFAULT_TITLE, body: DEFAULT_BODY, id: Date.now().toString(), isDone: false }, insertBeforeEl = null) {
    const note = document.createElement('div');
    note.className = 'note';
    if(data.seriesId) note.classList.add('linked');
    if(data.isDone) note.classList.add('done');
    note.draggable = true;
    note.dataset.id = data.id || Date.now().toString();
    if(data.seriesId) note.dataset.seriesId = data.seriesId;

    note.innerHTML = `
        <div class="note-header">
            <div class="note-title" contenteditable="true">${data.title}</div>
            <div class="note-controls">
                <div class="icon icon-settings" title="Settings"></div>
                <div class="icon icon-close delete-btn" title="Delete"></div>
                <div class="note-checkbox" title="Mark as done"></div>
            </div>
        </div>
        <div class="note-body" contenteditable="true">${data.body}</div>
    `;

    const titleEl = note.querySelector('.note-title');
    const bodyEl = note.querySelector('.note-body');
    const checkboxEl = note.querySelector('.note-checkbox');
    const settingsBtn = note.querySelector('.icon-settings');

    checkboxEl.onclick = (e) => {
        e.stopPropagation();
        note.classList.toggle('done');
        saveNotes(dateKey);
    };

    const updateCollapseState = () => {
        const bodyText = bodyEl.innerText.trim();
        if (bodyText === DEFAULT_BODY || bodyText === "") {
            note.classList.add('collapsed');
        } else {
            note.classList.remove('collapsed');
        }
    };
    updateCollapseState();

    settingsBtn.onclick = (e) => { e.stopPropagation(); openModal(note, dateKey); };
    note.querySelector('.delete-btn').onclick = (e) => { e.stopPropagation(); note.remove(); saveNotes(dateKey); };

    const handleAutoSelect = (el, defaultVal) => {
        if (el.innerText.trim() === defaultVal) {
            setTimeout(() => { document.execCommand('selectAll', false, null); }, 0);
        }
    };
    titleEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); bodyEl.focus(); } };
    bodyEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); bodyEl.blur(); } };

    note.querySelectorAll('[contenteditable]').forEach(el => {
        const isTitle = el.classList.contains('note-title');
        const defaultText = isTitle ? DEFAULT_TITLE : DEFAULT_BODY;
        el.onfocus = () => handleAutoSelect(el, defaultText);
        el.oninput = () => saveNotes(dateKey);
        el.onblur = () => {
            const t = titleEl.innerText.trim();
            const b = bodyEl.innerText.trim();
            if ((t === DEFAULT_TITLE || t === "") && (b === DEFAULT_BODY || b === "")) { note.remove(); }
            updateCollapseState();
            saveNotes(dateKey);
        };
    });

    note.ondragstart = (e) => {
        draggedElement = note;
        note.classList.remove('collapsed');
        placeholder.style.height = `${note.offsetHeight}px`;
        note.dataset.sourceDate = dateKey;
        setTimeout(() => note.classList.add('dragging'), 0);
    };
    note.ondragend = () => {
        note.classList.remove('dragging');
        updateCollapseState();
        if (placeholder.parentNode) placeholder.remove();
        draggedElement = null;
    };
    if (insertBeforeEl) container.insertBefore(note, insertBeforeEl);
    else container.appendChild(note);
    if (data.title === DEFAULT_TITLE && !data.seriesId) titleEl.focus();
}

function saveNotes(dateKey) {
    const container = document.querySelector(`[data-date="${dateKey}"]`);
    if (!container) return;
    const notes = Array.from(container.querySelectorAll('.note')).map(n => ({
        id: n.dataset.id,
        title: n.querySelector('.note-title').innerText,
        body: n.querySelector('.note-body').innerText,
        seriesId: n.dataset.seriesId || null,
        isDone: n.classList.contains('done')
    }));
    localStorage.setItem(`tweek-final-${DATA_VERSION}-${dateKey}`, JSON.stringify(notes));
}

function loadNotes(dateKey) {
    const container = document.querySelector(`[data-date="${dateKey}"]`);
    const saved = JSON.parse(localStorage.getItem(`tweek-final-${DATA_VERSION}-${dateKey}`) || "[]");
    saved.forEach(data => createNote(container, dateKey, data));
}

const modalOverlay = document.getElementById('settingsModal');
const dayToggles = document.querySelectorAll('.day-toggle');
const repeatScopeSelect = document.getElementById('repeatScope');
const stopRepeatBtn = document.getElementById('stopRepeatBtn');
dayToggles.forEach(toggle => { toggle.onclick = () => { toggle.classList.toggle('selected'); }; });
function openModal(noteEl, dateKey) {
    currentNoteElement = noteEl; currentDateKey = dateKey;
    const seriesId = noteEl.dataset.seriesId;
    dayToggles.forEach(t => t.classList.remove('selected'));
    if (seriesId) {
        const rules = getRecurringRules();
        const rule = rules.find(r => r.id === seriesId);
        if (rule) {
            if (rule.days) {
                rule.days.forEach(dayIndex => {
                    const btn = document.querySelector(`.day-toggle[data-day="${dayIndex}"]`);
                    if(btn) btn.classList.add('selected');
                });
            }
            repeatScopeSelect.value = rule.scope;
            stopRepeatBtn.style.display = 'block';
            stopRepeatBtn.innerText = "Clear Series";
            stopRepeatBtn.onclick = () => clearSeries(seriesId);
        }
    } else {
        const dayOfWeek = new Date(currentDateKey + 'T00:00:00').getDay();
        const currentDayBtn = document.querySelector(`.day-toggle[data-day="${dayOfWeek}"]`);
        if(currentDayBtn) currentDayBtn.classList.add('selected');
        repeatScopeSelect.value = 'all';
        stopRepeatBtn.style.display = 'none';
    }
    modalOverlay.style.display = 'flex';
}
function closeModal() { modalOverlay.style.display = 'none'; currentNoteElement = null; }
function saveSettings() {
    const title = currentNoteElement.querySelector('.note-title').innerText;
    const body = currentNoteElement.querySelector('.note-body').innerText;
    const scope = repeatScopeSelect.value;
    const selectedDays = [];
    document.querySelectorAll('.day-toggle.selected').forEach(toggle => { selectedDays.push(parseInt(toggle.dataset.day)); });
    let rules = getRecurringRules();
    const currentSeriesId = currentNoteElement.dataset.seriesId;
    if (currentSeriesId) {
        if (selectedDays.length === 0) { clearSeries(currentSeriesId); return; }
        else {
            const rule = rules.find(r => r.id === currentSeriesId);
            if(rule) { rule.days = selectedDays; rule.scope = scope; rule.title = title; rule.body = body; }
        }
    } else {
        if (selectedDays.length > 0) {
            const newSeriesId = Date.now().toString();
            rules.push({ id: newSeriesId, title: title, body: body, scope: scope, days: selectedDays, startDate: currentDateKey });
            currentNoteElement.dataset.seriesId = newSeriesId;
            currentNoteElement.classList.add('linked');
            addToHistory(`${newSeriesId}_${currentDateKey}`);
        }
    }
    setRecurringRules(rules); closeModal(); saveNotes(currentDateKey); initCalendar(); 
}
function clearSeries(seriesId) {
    let rules = getRecurringRules();
    rules = rules.filter(r => r.id !== seriesId);
    setRecurringRules(rules);
    delete currentNoteElement.dataset.seriesId;
    currentNoteElement.classList.remove('linked');
    saveNotes(currentDateKey); closeModal(); initCalendar();
}
function getInsertPosition(container, y) {
    const draggableElements = [...container.querySelectorAll('.note:not(.dragging):not(.placeholder)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; }
        else { return closest; }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}
function handleDragOver(e, container) {
    e.preventDefault();
    const afterElement = getInsertPosition(container, e.clientY);
    if (afterElement == null) container.appendChild(placeholder);
    else container.insertBefore(placeholder, afterElement);
}
function handleDrop(e, targetContainer, targetDateKey) {
    e.preventDefault();
    if (!draggedElement) return;
    const sourceDateKey = draggedElement.dataset.sourceDate;
    targetContainer.replaceChild(draggedElement, placeholder);
    saveNotes(sourceDateKey); saveNotes(targetDateKey);
    draggedElement.dataset.sourceDate = targetDateKey;
}
window.onclick = function(event) { 
    if (event.target == modalOverlay) closeModal(); 
    if (event.target == viewModal) closeViewModal(); 
}
initCalendar();
