const calendar = document.getElementById('calendar');
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_TITLE = "Title";
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

// HELPER: Convert Date object to "YYYY-MM-DD" using LOCAL time, not UTC.
function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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
        
        // FIX: Use local time date string for the ID to match visual header
        const dateKey = getLocalDateKey(currentDate);
        
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
        const dayHeader = col.querySelector('.day-header');
        const dateNumber = col.querySelector('.date-number');
        
        // Click on header or date number adds note at bottom
        dayHeader.onclick = () => createNote(container, dateKey);
        dateNumber.onclick = () => createNote(container, dateKey);
        
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
    
    if(total > 0 && past >= 0) {
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
                        seriesId: rule.id,
                        cards: []
                    });
                    addToHistory(creationKey);
                    hasChanges = true;
                }
            }
        }
    });
    if (hasChanges) { localStorage.setItem(`tweek-final-${DATA_VERSION}-${dateKey}`, JSON.stringify(notes)); }
}

function createNote(container, dateKey, data = { title: DEFAULT_TITLE, id: Date.now().toString(), cards: [] }, insertBeforeEl = null) {
    const note = document.createElement('div');
    note.className = 'note';
    if(data.seriesId) note.classList.add('linked');
    note.draggable = true;
    note.dataset.id = data.id || Date.now().toString();
    if(data.seriesId) note.dataset.seriesId = data.seriesId;

    note.innerHTML = `
        <div class="note-header">
            <div class="note-title" contenteditable="true">${data.title}</div>
            <div class="note-controls">
                <div class="icon icon-settings" title="Settings"></div>
                <div class="icon icon-close delete-btn" title="Delete"></div>
            </div>
        </div>
        <div class="card-container"></div>
    `;

    const titleEl = note.querySelector('.note-title');
    const settingsBtn = note.querySelector('.icon-settings');
    const cardContainer = note.querySelector('.card-container');

    // Click on time block (but not on cards) to add a new card
    note.addEventListener('click', (e) => {
        if (e.target === note || e.target === cardContainer) {
            createCard(cardContainer, dateKey, note.dataset.id);
        }
    });

    // Card drag and drop
    cardContainer.ondragover = (e) => handleCardDragOver(e, cardContainer);
    cardContainer.ondrop = (e) => handleCardDrop(e, cardContainer, dateKey, note.dataset.id);

    settingsBtn.onclick = (e) => { e.stopPropagation(); openModal(note, dateKey); };
    note.querySelector('.delete-btn').onclick = (e) => { e.stopPropagation(); note.remove(); saveNotes(dateKey); };

    const handleAutoSelect = (el, defaultVal) => {
        if (el.innerText.trim() === defaultVal) {
            setTimeout(() => { document.execCommand('selectAll', false, null); }, 0);
        }
    };
    
    titleEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } };

    titleEl.onfocus = () => handleAutoSelect(titleEl, DEFAULT_TITLE);
    titleEl.oninput = () => saveNotes(dateKey);
    titleEl.onblur = () => {
        const t = titleEl.innerText.trim();
        if (t === DEFAULT_TITLE || t === "") { note.remove(); }
        saveNotes(dateKey);
    };

    note.ondragstart = (e) => {
        if (e.target !== note) return;
        draggedElement = note;
        note.dataset.sourceDate = dateKey;
        setTimeout(() => note.classList.add('dragging'), 0);
    };
    note.ondragend = () => {
        note.classList.remove('dragging');
        if (placeholder.parentNode) placeholder.remove();
        draggedElement = null;
    };
    if (insertBeforeEl) container.insertBefore(note, insertBeforeEl);
    else container.appendChild(note);
    
    // Load existing cards
    if (data.cards && data.cards.length > 0) {
        data.cards.forEach(cardData => createCard(cardContainer, dateKey, note.dataset.id, cardData, null, false));
    }
    
    if (data.title === DEFAULT_TITLE && !data.seriesId) titleEl.focus();
}

// --- CARD FUNCTIONS ---
const DEFAULT_CARD_TITLE = "Task";
let draggedCard = null;
let cardPlaceholder = document.createElement('div');
cardPlaceholder.className = 'card-placeholder';

function createCard(container, dateKey, noteId, data = { title: DEFAULT_CARD_TITLE, id: Date.now().toString() }, insertBeforeEl = null, shouldFocus = true) {
    const card = document.createElement('div');
    card.className = 'card';
    card.draggable = true;
    card.dataset.id = data.id || Date.now().toString();

    card.innerHTML = `
        <div class="card-title" contenteditable="true">${data.title}</div>
        <div class="card-delete icon icon-close" title="Delete"></div>
    `;

    const titleEl = card.querySelector('.card-title');
    const deleteBtn = card.querySelector('.card-delete');

    deleteBtn.onclick = (e) => { 
        e.stopPropagation(); 
        card.remove(); 
        saveNotes(dateKey); 
    };

    titleEl.onclick = (e) => e.stopPropagation();
    titleEl.onkeydown = (e) => { 
        if (e.key === 'Enter') { 
            e.preventDefault(); 
            titleEl.blur(); 
        } 
    };
    titleEl.onfocus = () => {
        if (titleEl.innerText.trim() === DEFAULT_CARD_TITLE) {
            setTimeout(() => { document.execCommand('selectAll', false, null); }, 0);
        }
    };
    titleEl.oninput = () => saveNotes(dateKey);
    titleEl.onblur = () => {
        const t = titleEl.innerText.trim();
        if (t === DEFAULT_CARD_TITLE || t === "") { card.remove(); }
        saveNotes(dateKey);
    };

    card.ondragstart = (e) => {
        e.stopPropagation();
        draggedCard = card;
        card.dataset.sourceDate = dateKey;
        card.dataset.sourceNoteId = noteId;
        setTimeout(() => card.classList.add('dragging'), 0);
    };
    card.ondragend = () => {
        card.classList.remove('dragging');
        if (cardPlaceholder.parentNode) cardPlaceholder.remove();
        draggedCard = null;
    };

    if (insertBeforeEl) container.insertBefore(card, insertBeforeEl);
    else container.appendChild(card);
    
    if (shouldFocus && data.title === DEFAULT_CARD_TITLE) titleEl.focus();
}

function getCardInsertPosition(container, y) {
    const cards = [...container.querySelectorAll('.card:not(.dragging)')];
    return cards.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; }
        else { return closest; }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function handleCardDragOver(e, container) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedCard) return;
    
    // Don't show placeholder when hovering over the dragged card itself
    const draggedRect = draggedCard.getBoundingClientRect();
    if (e.clientY >= draggedRect.top && e.clientY <= draggedRect.bottom) {
        if (cardPlaceholder.parentNode) cardPlaceholder.remove();
        return;
    }
    
    const afterElement = getCardInsertPosition(container, e.clientY);
    
    if (afterElement == null) container.appendChild(cardPlaceholder);
    else container.insertBefore(cardPlaceholder, afterElement);
}

function handleCardDrop(e, targetContainer, targetDateKey, targetNoteId) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedCard) return;
    
    // If no placeholder visible, card stays in original position
    if (!cardPlaceholder.parentNode) {
        draggedCard = null;
        return;
    }
    
    const sourceDateKey = draggedCard.dataset.sourceDate;
    const sourceNoteId = draggedCard.dataset.sourceNoteId;

    const cardData = {
        id: draggedCard.dataset.id,
        title: draggedCard.querySelector('.card-title').innerText
    };

    if (cardPlaceholder.parentNode === targetContainer) {
        createCard(targetContainer, targetDateKey, targetNoteId, cardData, cardPlaceholder, false);
    } else {
        createCard(targetContainer, targetDateKey, targetNoteId, cardData, null, false);
    }

    draggedCard.remove();
    if (cardPlaceholder.parentNode) cardPlaceholder.remove();

    saveNotes(sourceDateKey);
    if (sourceDateKey !== targetDateKey) {
        saveNotes(targetDateKey);
    } else {
        saveNotes(targetDateKey);
    }

    draggedCard = null;
}

function saveNotes(dateKey) {
    const container = document.querySelector(`[data-date="${dateKey}"]`);
    if (!container) return;
    const notes = Array.from(container.querySelectorAll('.note')).map(n => {
        const cards = Array.from(n.querySelectorAll('.card')).map(c => ({
            id: c.dataset.id,
            title: c.querySelector('.card-title').innerText
        }));
        return {
            id: n.dataset.id,
            title: n.querySelector('.note-title').innerText,
            seriesId: n.dataset.seriesId || null,
            cards: cards
        };
    });
    localStorage.setItem(`tweek-final-${DATA_VERSION}-${dateKey}`, JSON.stringify(notes));
}

function loadNotes(dateKey) {
    const container = document.querySelector(`[data-date="${dateKey}"]`);
    const saved = JSON.parse(localStorage.getItem(`tweek-final-${DATA_VERSION}-${dateKey}`) || "[]");
    saved.forEach(data => createNote(container, dateKey, data));
}

const modalOverlay = document.getElementById('settingsModal');
const dayToggles = document.querySelectorAll('.day-toggle');
const stopRepeatBtn = document.getElementById('stopRepeatBtn');
dayToggles.forEach(toggle => { toggle.onclick = () => { toggle.classList.toggle('selected'); }; });
function openModal(noteEl, dateKey) {
    currentNoteElement = noteEl; currentDateKey = dateKey;
    const seriesId = noteEl.dataset.seriesId;
    
    // Reset Date Input
    document.getElementById('moveDateInput').value = '';

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
            stopRepeatBtn.style.display = 'block';
            stopRepeatBtn.innerText = "Clear Series";
            stopRepeatBtn.onclick = () => clearSeries(seriesId);
        }
    } else {
        const dayOfWeek = new Date(currentDateKey + 'T00:00:00').getDay();
        const currentDayBtn = document.querySelector(`.day-toggle[data-day="${dayOfWeek}"]`);
        if(currentDayBtn) currentDayBtn.classList.add('selected');
        stopRepeatBtn.style.display = 'none';
    }
    modalOverlay.style.display = 'flex';
}
function closeModal() { modalOverlay.style.display = 'none'; currentNoteElement = null; }

// --- MOVE NOTE LOGIC ---
function moveNoteToDate() {
    const targetDate = document.getElementById('moveDateInput').value;
    if (!targetDate) return;

    if (targetDate === currentDateKey) {
        alert("Select a different date to move.");
        return;
    }

    const cards = Array.from(currentNoteElement.querySelectorAll('.card')).map(c => ({
        id: c.dataset.id,
        title: c.querySelector('.card-title').innerText
    }));

    const noteData = {
        id: currentNoteElement.dataset.id,
        title: currentNoteElement.querySelector('.note-title').innerText,
        seriesId: currentNoteElement.dataset.seriesId || null,
        cards: cards
    };

    const targetNotes = JSON.parse(localStorage.getItem(`tweek-final-${DATA_VERSION}-${targetDate}`) || "[]");
    targetNotes.push(noteData);
    localStorage.setItem(`tweek-final-${DATA_VERSION}-${targetDate}`, JSON.stringify(targetNotes));

    currentNoteElement.remove();
    saveNotes(currentDateKey);

    const targetContainer = document.querySelector(`[data-date="${targetDate}"]`);
    if (targetContainer) {
        createNote(targetContainer, targetDate, noteData);
    }

    closeModal();
}

function saveSettings() {
    const title = currentNoteElement.querySelector('.note-title').innerText;
    const selectedDays = [];
    document.querySelectorAll('.day-toggle.selected').forEach(toggle => { selectedDays.push(parseInt(toggle.dataset.day)); });
    let rules = getRecurringRules();
    const currentSeriesId = currentNoteElement.dataset.seriesId;
    if (currentSeriesId) {
        if (selectedDays.length === 0) { clearSeries(currentSeriesId); return; }
        else {
            const rule = rules.find(r => r.id === currentSeriesId);
            if(rule) { rule.days = selectedDays; rule.title = title; }
        }
    } else {
        if (selectedDays.length > 0) {
            const newSeriesId = Date.now().toString();
            rules.push({ id: newSeriesId, title: title, days: selectedDays, startDate: currentDateKey });
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
    if (draggedCard) return; // Don't show time block placeholder when dragging cards
    if (!draggedElement) return;
    
    const afterElement = getInsertPosition(container, e.clientY);
    
    // Get the next sibling of dragged element, ignoring placeholder
    let nextSibling = draggedElement.nextElementSibling;
    if (nextSibling === placeholder) nextSibling = nextSibling.nextElementSibling;
    
    // Don't show placeholder if dropping here would keep element in same position
    if (afterElement === nextSibling) {
        if (placeholder.parentNode) placeholder.remove();
        return;
    }
    
    if (afterElement == null) container.appendChild(placeholder);
    else container.insertBefore(placeholder, afterElement);
}

// --- UPDATED handleDrop: Re-creates element AND inserts at placeholder position ---
function handleDrop(e, targetContainer, targetDateKey) {
    e.preventDefault();
    if (!draggedElement || draggedCard) return; // Ignore if dragging a card
    
    // If no placeholder visible, element stays in original position
    if (!placeholder.parentNode) {
        draggedElement = null;
        return;
    }
    
    const sourceDateKey = draggedElement.dataset.sourceDate;

    // 1. Extract data including cards
    const cards = Array.from(draggedElement.querySelectorAll('.card')).map(c => ({
        id: c.dataset.id,
        title: c.querySelector('.card-title').innerText
    }));

    const noteData = {
        id: draggedElement.dataset.id,
        title: draggedElement.querySelector('.note-title').innerText,
        seriesId: draggedElement.dataset.seriesId || null,
        cards: cards
    };

    // 2. Insert new note in the correct position (where the placeholder is)
    if (placeholder.parentNode === targetContainer) {
        // Insert new note before the placeholder to hold the spot
        createNote(targetContainer, targetDateKey, noteData, placeholder);
    } else {
        // Fallback (append)
        createNote(targetContainer, targetDateKey, noteData);
    }

    // 3. Remove old elements
    draggedElement.remove();
    if (placeholder.parentNode) placeholder.remove();

    // 4. Save
    saveNotes(sourceDateKey);
    saveNotes(targetDateKey);

    draggedElement = null; // Cleanup
}

window.onclick = function(event) { 
    if (event.target == modalOverlay) closeModal(); 
    if (event.target == viewModal) closeViewModal(); 
}
initCalendar();