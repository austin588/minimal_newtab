const NOTES_STORAGE_KEY = 'scratchpad-notes';
const NOTES_UPDATED_KEY = 'scratchpad-notes-updated';
const SAVE_DELAY_MS = 400;

// Same scheme as the to-do list: localStorage is the fast working copy and
// chrome.storage keeps a backup (sync follows the Chrome profile).
const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

const notesIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M15 3v5h5"/><path d="M8 13h8M8 17h5"/></svg>`;

function getNotes() {
    return localStorage.getItem(NOTES_STORAGE_KEY) || '';
}

function localUpdatedAt() {
    return Number(localStorage.getItem(NOTES_UPDATED_KEY)) || 0;
}

function backupNotes(text, updatedAt) {
    if (!hasChromeStorage) return;
    const notesBackup = { text, updatedAt };
    chrome.storage.local.set({ notesBackup });
    // Sync caps a single item at 8KB; the local copy still holds long notes
    chrome.storage.sync.set({ notesBackup }).catch((err) => {
        console.warn('Notes too large to sync; kept in local backup only.', err);
    });
}

function saveNotes(text) {
    const updatedAt = Date.now();
    localStorage.setItem(NOTES_STORAGE_KEY, text);
    localStorage.setItem(NOTES_UPDATED_KEY, String(updatedAt));
    backupNotes(text, updatedAt);
}

// Take a backup copy if it's newer than what this page has (another tab or
// device changed it, or local data was cleared)
function adoptIfNewer(notesBackup) {
    if (!notesBackup || typeof notesBackup.text !== 'string') return false;
    const localEmpty = !getNotes() && !localStorage.getItem(NOTES_UPDATED_KEY);
    if (notesBackup.updatedAt <= localUpdatedAt() && !localEmpty) return false;
    localStorage.setItem(NOTES_STORAGE_KEY, notesBackup.text);
    localStorage.setItem(NOTES_UPDATED_KEY, String(notesBackup.updatedAt || Date.now()));
    return true;
}

function renderScratchpad() {
    const button = document.createElement('div');
    button.className = 'scratchpad-toggle';
    button.title = 'Scratchpad (Esc)';
    button.innerHTML = `<span class="scratchpad-icon">${notesIcon}</span><span class="scratchpad-label">Notes</span>`;

    const panel = document.createElement('div');
    panel.className = 'scratchpad-panel';
    panel.innerHTML = `
        <div class="scratchpad-header">
            <h3>Scratchpad</h3>
            <span class="scratchpad-status"></span>
            <span class="scratchpad-close" title="Close">&times;</span>
        </div>
        <textarea class="scratchpad-text" spellcheck="true" placeholder="Jot anything down. It saves as you type."></textarea>
    `;

    const backdrop = document.createElement('div');
    backdrop.className = 'scratchpad-backdrop';

    const textarea = panel.querySelector('.scratchpad-text');
    const status = panel.querySelector('.scratchpad-status');
    textarea.value = getNotes();

    let saveTimer = null;
    const flush = () => {
        if (!saveTimer) return;
        clearTimeout(saveTimer);
        saveTimer = null;
        saveNotes(textarea.value);
        status.textContent = 'Saved';
    };

    textarea.addEventListener('input', () => {
        status.textContent = 'Saving…';
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, SAVE_DELAY_MS);
    });
    // Don't lose the last few keystrokes if the tab closes mid-debounce
    window.addEventListener('pagehide', flush);
    textarea.addEventListener('blur', flush);

    const open = () => {
        panel.classList.add('open');
        backdrop.classList.add('open');
        status.textContent = '';
        textarea.focus();
    };
    const close = () => {
        flush();
        panel.classList.remove('open');
        backdrop.classList.remove('open');
        // Hand focus back to the page so the next Esc reopens instead of landing
        // in the hidden notes
        if (document.activeElement === textarea) textarea.blur();
    };

    const toggle = () => (panel.classList.contains('open') ? close() : open());
    button.addEventListener('click', toggle);
    panel.querySelector('.scratchpad-close').addEventListener('click', close);
    // Esc toggles. Closing works from anywhere, including mid-note; opening waits
    // until you're not in another box, where Esc already means cancel
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.repeat) return;
        if (panel.classList.contains('open')) {
            close();
            return;
        }
        const target = e.target;
        const typing = target !== textarea &&
            (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
        if (!typing) open();
    });
    document.addEventListener('mousedown', (e) => {
        if (panel.classList.contains('open') && !panel.contains(e.target) && !button.contains(e.target)) close();
    });

    // Keyboard shortcut (Option+N by default) arrives from the background worker
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message) => {
            if (message.action !== 'toggleScratchpad') return;
            chrome.tabs.getCurrent((tab) => {
                if (tab && tab.id === message.tabId) toggle();
            });
        });
    }
    // Show the actual shortcut in the tooltip, since it can be remapped
    if (typeof chrome !== 'undefined' && chrome.commands && chrome.commands.getAll) {
        chrome.commands.getAll((commands) => {
            const command = commands.find((cmd) => cmd.name === 'toggle-scratchpad');
            if (command && command.shortcut) button.title = `Scratchpad (Esc or ${command.shortcut})`;
        });
    }

    if (hasChromeStorage) {
        Promise.all([chrome.storage.sync.get('notesBackup'), chrome.storage.local.get('notesBackup')])
            .then(([synced, local]) => {
                const newest = [synced.notesBackup, local.notesBackup]
                    .filter(Boolean)
                    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
                if (adoptIfNewer(newest)) {
                    if (!saveTimer) textarea.value = getNotes();
                } else if (!newest ? getNotes() !== '' : newest.updatedAt < localUpdatedAt()) {
                    // First run with existing notes, or the backup is behind: back up now
                    backupNotes(getNotes(), localUpdatedAt() || Date.now());
                }
            });
        // Another tab edited the notes; take them unless this tab is mid-edit
        chrome.storage.onChanged.addListener((changes) => {
            if (!changes.notesBackup || saveTimer) return;
            if (adoptIfNewer(changes.notesBackup.newValue)) textarea.value = getNotes();
        });
    }

    document.body.append(button, backdrop, panel);
}

export { renderScratchpad };
