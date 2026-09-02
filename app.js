let db = { 
    rooms: { "General Stuff": [] }, 
    activeRoom: "General Stuff", 
    deleted: [],
    folders: [], 
    deletedFolders: [],
    roomFolders: {}, 
    collapsedFolders: [],
    todos: [],
    deletedTodos: []
};

let autoSyncInterval = null;
let isSelectionMode = false;
let selectedMessageIds = new Set();
let targetMessageData = null;
let toastTimeout = null;

// ==========================================
// Toast & Clipboard Helpers
// ==========================================

function showToast(message = "Message copied") {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 2000);
}

function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast("Message copied");
    } catch (err) {
        console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
}

function copyMessageText(msg) {
    if (!msg) return;
    const textToCopy = (msg.type === 'file' || msg.type === 'media') 
        ? (msg.fileName || msg.data || '') 
        : (msg.text || '');
    
    if (!textToCopy) return;

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast("Message copied");
        }).catch(() => fallbackCopy(textToCopy));
    } else {
        fallbackCopy(textToCopy);
    }
}

// ==========================================
// General Utilities
// ==========================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function getCurrentTimeStr() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(fileName, fileType) {
    const ext = (fileName && fileName.includes('.') ? fileName.split('.').pop() : '').toLowerCase();
    if (['py', 'js', 'html', 'css', 'cpp', 'c', 'java', 'ts', 'json', 'sh', 'sql', 'ipynb'].includes(ext)) return '📄';
    if (['ppt', 'pptx'].includes(ext)) return '📊';
    if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return '📝';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📈';
    if (['pdf'].includes(ext)) return '📕';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
    if (fileType && fileType.startsWith('audio/')) return '🎵';
    return '📁';
}

function applyTheme(themeName) {
    if (!themeName || themeName === 'default') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeName);
    }
    localStorage.setItem('app_theme', themeName || 'default');
}

function loadSavedTheme() {
    const savedTheme = localStorage.getItem('app_theme') || 'default';
    applyTheme(savedTheme);
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = savedTheme;
}

// ==========================================
// To-Do Checklist Rendering
// ==========================================

function renderTodos() {
    var list = document.getElementById('todo-list');
    if (!list) return;
    list.innerHTML = '';

    var todos = db.todos || [];
    todos.forEach(function(item) {
        var li = document.createElement('li');
        li.className = 'todo-item' + (item.done ? ' completed' : '');

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'todo-checkbox';
        checkbox.checked = !!item.done;
        checkbox.onchange = function() {
            item.done = checkbox.checked;
            item.updatedAt = Date.now();
            saveData();
            renderTodos();
            queueSync();
        };

        var span = document.createElement('span');
        span.className = 'todo-text';
        span.textContent = item.text;

        var delBtn = document.createElement('button');
        delBtn.className = 'todo-delete-btn';
        delBtn.innerHTML = '🗑️';
        delBtn.title = 'Delete task';
        delBtn.onclick = function() {
            if (!db.deletedTodos) db.deletedTodos = [];
            db.deletedTodos.push(item.id);
            db.todos = db.todos.filter(function(t) { return t.id !== item.id; });
            saveData();
            renderTodos();
            queueSync();
        };

        li.appendChild(checkbox);
        li.appendChild(span);
        li.appendChild(delBtn);
        list.appendChild(li);
    });
}

// ==========================================
// Initialization & Persistence
// ==========================================

function initApp() {
    loadSavedTheme();

    if (typeof localforage === 'undefined') {
        setTimeout(initApp, 100);
        return;
    }

    localforage.getItem('self_chat_db').then((savedData) => {
        if (savedData && typeof savedData === 'object') {
            db = Object.assign(db, savedData);
        }
        
        if (!db.notes) db.notes = "";
        const notesArea = document.getElementById('quick-notes-input');
        if (notesArea) notesArea.value = db.notes || "";

        if (!db.rooms || Object.keys(db.rooms).length === 0) {
            db.rooms = { "General Stuff": [] };
        }
        if (!db.deleted) db.deleted = [];
        if (!db.folders) db.folders = [];
        if (!db.deletedFolders) db.deletedFolders = [];
        if (!db.roomFolders) db.roomFolders = {};
        if (!db.collapsedFolders) db.collapsedFolders = [];
        if (!db.todos) db.todos = [];
        if (!db.deletedTodos) db.deletedTodos = [];
        
        if (!db.activeRoom || !db.rooms[db.activeRoom]) {
            db.activeRoom = Object.keys(db.rooms)[0] || "General Stuff";
        }

        renderRooms(); 
        renderMessages(); 
        renderTodos();
        attachEventListeners();
        loadSyncCredentials();
        startAutoSync();
    }).catch((err) => {
        console.error("LocalForage load error:", err);
        renderRooms(); 
        renderMessages(); 
        renderTodos();
        attachEventListeners();
        loadSyncCredentials();
        startAutoSync();
    });
}

function saveData() { 
    if (typeof localforage !== 'undefined') {
        localforage.setItem('self_chat_db', db).catch((err) => console.error("Save failed:", err));
    }
}

// ==========================================
// Sidebar & Room Navigation
// ==========================================

function createRoomElement(roomName, isNested = false) {
    const li = document.createElement('li');
    li.classList.add('room-item');
    if (isNested) li.classList.add('nested');
    li.textContent = roomName;
    if (roomName === db.activeRoom) li.classList.add('active');

    li.onclick = () => { 
        exitSelectionMode();
        db.activeRoom = roomName; 
        saveData(); 
        renderRooms(); 
        renderMessages(); 
        const appEl = document.getElementById('app');
        if (appEl) appEl.classList.add('show-chat');
    };
    return li;
}

function renderRooms() {
    const list = document.getElementById('room-list');
    if (!list) return;
    list.innerHTML = '';

    const allRooms = Object.keys(db.rooms || {});
    const categorizedRooms = new Set();

    (db.folders || []).forEach(folderName => {
        const folderSection = document.createElement('div');
        folderSection.classList.add('folder-section');
        if ((db.collapsedFolders || []).includes(folderName)) {
            folderSection.classList.add('collapsed');
        }

        const folderHeader = document.createElement('div');
        folderHeader.classList.add('folder-header');
        folderHeader.innerHTML = `
            <div class="folder-header-title">
                <span class="folder-arrow">▼</span>
                <span>📁 ${folderName}</span>
            </div>
            <span class="folder-options" title="Folder Settings">⚙</span>
        `;

        folderHeader.onclick = (e) => {
            if (e.target.classList.contains('folder-options')) return;
            if (!db.collapsedFolders) db.collapsedFolders = [];
            if (folderSection.classList.contains('collapsed')) {
                db.collapsedFolders = db.collapsedFolders.filter(f => f !== folderName);
            } else {
                db.collapsedFolders.push(folderName);
            }
            saveData();
            renderRooms();
        };

        const folderOpts = folderHeader.querySelector('.folder-options');
        if (folderOpts) {
            folderOpts.onclick = (e) => {
                e.stopPropagation();
                openFolderConfigModal(folderName);
            };
        }

        const folderRoomsUl = document.createElement('ul');
        folderRoomsUl.classList.add('folder-rooms');

        allRooms.forEach(roomName => {
            if (db.roomFolders && db.roomFolders[roomName] === folderName) {
                categorizedRooms.add(roomName);
                folderRoomsUl.appendChild(createRoomElement(roomName, true));
            }
        });

        folderSection.appendChild(folderHeader);
        folderSection.appendChild(folderRoomsUl);
        list.appendChild(folderSection);
    });

    allRooms.forEach(roomName => {
        if (!categorizedRooms.has(roomName)) {
            list.appendChild(createRoomElement(roomName, false));
        }
    });
}

// ==========================================
// Messages Rendering & Multi-Tap / Triple-Click
// ==========================================

function renderMessages() {
    const container = document.getElementById('messages-container');
    const title = document.getElementById('current-room-title');
    const folderTag = document.getElementById('current-room-folder');
    if (!container || !title) return;
    container.innerHTML = '';
    
    if (!db.activeRoom || !db.rooms[db.activeRoom]) { 
        const available = Object.keys(db.rooms || {});
        if (available.length > 0) {
            db.activeRoom = available[0];
        } else {
            db.rooms = { "General Stuff": [] };
            db.activeRoom = "General Stuff";
        }
    }
    title.textContent = db.activeRoom;

    const currentFolder = db.roomFolders ? db.roomFolders[db.activeRoom] : null;
    if (folderTag) {
        folderTag.textContent = currentFolder ? `📁 ${currentFolder}` : '';
    }
    
    if (isSelectionMode) {
        container.classList.add('selecting');
    } else {
        container.classList.remove('selecting');
    }

    const messages = db.rooms[db.activeRoom] || [];
    messages.forEach((msg, index) => {
        if (typeof msg !== 'object') {
            msg = { id: generateId(), type: 'text', text: String(msg), timestamp: '' };
            db.rooms[db.activeRoom][index] = msg;
        } else if (!msg.id) {
            msg.id = generateId();
            db.rooms[db.activeRoom][index] = msg;
        }

        const div = document.createElement('div');
        div.classList.add('message', 'sent');
        if (selectedMessageIds.has(msg.id)) div.classList.add('selected');

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        let timeText = msg.timestamp || '';

        if (msg.type === 'media') {
            if (msg.fileType && msg.fileType.startsWith('image/')) {
                const img = document.createElement('img'); 
                img.src = msg.data; 
                img.style.maxWidth = '100%'; 
                img.style.borderRadius = '6px'; 
                contentDiv.appendChild(img);
            } else if (msg.fileType && msg.fileType.startsWith('video/')) {
                const video = document.createElement('video'); 
                video.src = msg.data; 
                video.controls = true; 
                video.style.maxWidth = '100%'; 
                video.style.borderRadius = '6px'; 
                contentDiv.appendChild(video);
            } else if (msg.fileType && msg.fileType.startsWith('audio/')) {
                const audio = document.createElement('audio');
                audio.src = msg.data;
                audio.controls = true;
                audio.style.width = '100%';
                contentDiv.appendChild(audio);
            }
        } else if (msg.type === 'file') {
            const fileCard = document.createElement('div');
            fileCard.classList.add('file-attachment');

            const fileIcon = document.createElement('div');
            fileIcon.classList.add('file-icon');
            fileIcon.textContent = getFileIcon(msg.fileName || '', msg.fileType || '');

            const fileInfo = document.createElement('div');
            fileInfo.classList.add('file-info');

            const fileName = document.createElement('span');
            fileName.classList.add('file-name');
            fileName.textContent = msg.fileName || 'Attachment';

            const fileMeta = document.createElement('span');
            fileMeta.classList.add('file-meta');
            const ext = (msg.fileName && msg.fileName.includes('.') ? msg.fileName.split('.').pop() : 'FILE').toUpperCase();
            fileMeta.textContent = `${ext} • ${formatBytes(msg.fileSize)}`;

            fileInfo.appendChild(fileName);
            fileInfo.appendChild(fileMeta);

            const downloadBtn = document.createElement('a');
            downloadBtn.classList.add('file-download-btn');
            downloadBtn.href = msg.data;
            downloadBtn.download = msg.fileName || 'file';
            downloadBtn.textContent = '⬇ Download';
            downloadBtn.onclick = (e) => e.stopPropagation();

            fileCard.appendChild(fileIcon);
            fileCard.appendChild(fileInfo);
            fileCard.appendChild(downloadBtn);
            contentDiv.appendChild(fileCard);
        } else {
            contentDiv.textContent = msg.text || '';
        }

        div.appendChild(contentDiv);

        if (timeText) {
            const timeSpan = document.createElement('span');
            timeSpan.classList.add('message-time');
            timeSpan.textContent = timeText + (msg.edited ? " (edited)" : "");
            div.appendChild(timeSpan);
        }

        // ==========================================
        // Unified Click & Multi-Tap Controller
        // ==========================================
        let clickTimer = null;
        let clickCounter = 0;

        function handleMessageInteraction(e, isTouch = false) {
            if (isSelectionMode) {
                if (!isTouch) {
                    e.stopPropagation();
                    toggleMessageSelection(msg.id);
                }
                return;
            }

            clickCounter++;

            if (clickCounter === 1) {
                clickTimer = setTimeout(() => {
                    clickCounter = 0;
                }, 300);
            } else if (clickCounter === 2) {
                clearTimeout(clickTimer);
                clickTimer = setTimeout(() => {
                    clickCounter = 0;
                    const coords = isTouch && e.changedTouches ? e.changedTouches[0] : e;
                    openContextMenu(coords, index, msg);
                }, 220);
            } else if (clickCounter >= 3) {
                clearTimeout(clickTimer);
                clickCounter = 0;
                hideContextMenu();
                copyMessageText(msg);
            }
        }

        div.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMessageInteraction(e, false);
        };

        div.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        div.ontouchend = (e) => {
            if (isSelectionMode) {
                e.preventDefault();
                e.stopPropagation();
                toggleMessageSelection(msg.id);
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            handleMessageInteraction(e, true);
        };

        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

// ==========================================
// File Upload & Paste Handling
// ==========================================

function handleFileUpload(file) {
    if (!file) return;
    if (!db.activeRoom) db.activeRoom = Object.keys(db.rooms)[0] || "General Stuff";

    const reader = new FileReader();
    reader.onload = (e) => {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');

        const mediaObj = {
            id: generateId(),
            type: (isImage || isVideo || isAudio) ? 'media' : 'file',
            fileName: file.name || (isImage ? `image_${Date.now()}.png` : 'file'),
            fileSize: file.size || 0,
            fileType: file.type || 'application/octet-stream',
            data: e.target.result,
            timestamp: getCurrentTimeStr(),
            updatedAt: Date.now()
        };

        if (!db.rooms[db.activeRoom]) db.rooms[db.activeRoom] = [];
        db.rooms[db.activeRoom].push(mediaObj);
        saveData();
        renderMessages();
        queueSync();
    };

    reader.readAsDataURL(file);
}

// ==========================================
// Context Menus & Modals
// ==========================================

function openContextMenu(e, index, msg) {
    targetMessageData = { index, msg };
    const menu = document.getElementById('message-context-menu');
    const editBtn = document.getElementById('menu-edit-btn');
    if (!menu) return;

    if (msg.type === 'media' || msg.type === 'file') {
        if (editBtn) editBtn.classList.add('hidden');
    } else {
        if (editBtn) editBtn.classList.remove('hidden');
    }
    menu.classList.remove('hidden');

    let x = e.clientX || (e.pageX || 100);
    let y = e.clientY || (e.pageY || 100);
    if (x + 150 > window.innerWidth) x = window.innerWidth - 160;
    if (y + 140 > window.innerHeight) y = window.innerHeight - 150;

    menu.style.left = `${Math.max(10, x)}px`;
    menu.style.top = `${Math.max(10, y)}px`;
}

function hideContextMenu() {
    const menu = document.getElementById('message-context-menu');
    if (menu) menu.classList.add('hidden');
    targetMessageData = null;
}

function openFolderConfigModal(folderName) {
    const modal = document.getElementById('folder-modal');
    const title = document.getElementById('folder-modal-title');
    const body = document.getElementById('folder-modal-body');
    if (!modal || !title || !body) return;

    title.textContent = `Folder: ${folderName}`;
    body.innerHTML = `
        <div class="folder-action-list">
            <button id="rename-folder-btn" class="folder-action-item">✏️ Rename Folder</button>
            <button id="delete-folder-btn" class="folder-action-item" style="color: #ea4335;">🗑️ Delete Folder (Keeps Chats)</button>
        </div>
    `;

    const renameBtn = document.getElementById('rename-folder-btn');
    if (renameBtn) {
        renameBtn.onclick = () => {
            const newName = prompt("Enter new folder name:", folderName);
            if (newName && newName.trim() && newName.trim() !== folderName) {
                const clean = newName.trim();
                db.folders = db.folders.map(f => f === folderName ? clean : f);
                Object.keys(db.roomFolders).forEach(r => {
                    if (db.roomFolders[r] === folderName) db.roomFolders[r] = clean;
                });
                saveData();
                renderRooms();
                renderMessages();
                modal.classList.add('hidden');
                queueSync();
            }
        };
    }

    const deleteBtn = document.getElementById('delete-folder-btn');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (confirm(`Delete folder "${folderName}"? All chats inside will be moved to Uncategorized.`)) {
                if (!db.deletedFolders) db.deletedFolders = [];
                db.deletedFolders.push(folderName);
                db.folders = db.folders.filter(f => f !== folderName);
                Object.keys(db.roomFolders).forEach(r => {
                    if (db.roomFolders[r] === folderName) delete db.roomFolders[r];
                });
                saveData();
                renderRooms();
                renderMessages();
                modal.classList.add('hidden');
                queueSync();
            }
        };
    }

    modal.classList.remove('hidden');
}

function queueSync() {
    if (window.syncDebounceTimer) clearTimeout(window.syncDebounceTimer);
    window.syncDebounceTimer = setTimeout(() => {
        runGistSync(true);
    }, 2500);
}

function openMoveRoomModal() {
    const modal = document.getElementById('folder-modal');
    const title = document.getElementById('folder-modal-title');
    const body = document.getElementById('folder-modal-body');
    const room = db.activeRoom;
    const currentFolder = db.roomFolders ? (db.roomFolders[room] || null) : null;
    if (!modal || !title || !body) return;

    title.textContent = `Move "${room}" to Folder`;
    let html = `<div class="folder-action-list">`;
    html += `
        <button class="folder-action-item ${!currentFolder ? 'active' : ''}" onclick="assignRoomToFolder('${room}', null)">
            <span>🚫 None (Uncategorized)</span>
            ${!currentFolder ? '<span>✓</span>' : ''}
        </button>
    `;

    (db.folders || []).forEach(folder => {
        const isCurrent = currentFolder === folder;
        html += `
            <button class="folder-action-item ${isCurrent ? 'active' : ''}" onclick="assignRoomToFolder('${room}', '${folder}')">
                <span>📁 ${folder}</span>
                ${isCurrent ? '<span>✓</span>' : ''}
            </button>
        `;
    });
    html += `</div>`;
    body.innerHTML = html;
    modal.classList.remove('hidden');
}

window.assignRoomToFolder = function(room, folder) {
    if (!db.roomFolders) db.roomFolders = {};
    if (!folder) {
        delete db.roomFolders[room];
    } else {
        db.roomFolders[room] = folder;
    }
    saveData();
    renderRooms();
    renderMessages();
    const modal = document.getElementById('folder-modal');
    if (modal) modal.classList.add('hidden');
    queueSync();
};

function openRoomActionsMenu() {
    if (!db.activeRoom) return;
    const room = db.activeRoom;
    const modal = document.getElementById('folder-modal');
    const title = document.getElementById('folder-modal-title');
    const body = document.getElementById('folder-modal-body');
    if (!modal || !title || !body) return;

    title.textContent = `Chat Settings: ${room}`;
    body.innerHTML = `
        <div class="folder-action-list">
            <button id="act-move-room" class="folder-action-item">📁 Move to Folder</button>
            <button id="act-rename-room" class="folder-action-item">✏️ Rename Chat</button>
            <button id="act-delete-room" class="folder-action-item" style="color: #ea4335;">🗑️ Delete Entire Chat</button>
        </div>
    `;

    const moveBtn = document.getElementById('act-move-room');
    if (moveBtn) moveBtn.onclick = openMoveRoomModal;
    
    const renameBtn = document.getElementById('act-rename-room');
    if (renameBtn) {
        renameBtn.onclick = () => {
            modal.classList.add('hidden');
            const newName = prompt("Enter new name for chat:", room);
            if (newName && newName.trim() && newName !== room) {
                const clean = newName.trim();
                db.rooms[clean] = db.rooms[room];
                delete db.rooms[room];
                if (db.roomFolders && db.roomFolders[room]) {
                    db.roomFolders[clean] = db.roomFolders[room];
                    delete db.roomFolders[room];
                }
                db.activeRoom = clean;
                saveData();
                renderRooms();
                renderMessages();
                queueSync();
            }
        };
    }

    const deleteBtn = document.getElementById('act-delete-room');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            modal.classList.add('hidden');
            if (confirm(`Permanently delete chat "${room}"?`)) {
                delete db.rooms[room];
                if (db.roomFolders) delete db.roomFolders[room];
                const remaining = Object.keys(db.rooms);
                db.activeRoom = remaining.length > 0 ? remaining[0] : "General Stuff";
                if (!db.rooms[db.activeRoom]) db.rooms[db.activeRoom] = [];
                saveData();
                renderRooms();
                renderMessages();
                queueSync();
            }
        };
    }

    modal.classList.remove('hidden');
}

// ==========================================
// Multi-Selection Logic
// ==========================================

function enterSelectionMode(initialMsgId) {
    isSelectionMode = true;
    selectedMessageIds.clear();
    if (initialMsgId) selectedMessageIds.add(initialMsgId);
    
    const chatHeader = document.getElementById('chat-header');
    const selectHeader = document.getElementById('selection-header');
    if (chatHeader) chatHeader.classList.add('hidden');
    if (selectHeader) selectHeader.classList.remove('hidden');
    updateSelectionCounter();
    renderMessages();
}

function exitSelectionMode() {
    isSelectionMode = false;
    selectedMessageIds.clear();
    const chatHeader = document.getElementById('chat-header');
    const selectHeader = document.getElementById('selection-header');
    if (selectHeader) selectHeader.classList.add('hidden');
    if (chatHeader) chatHeader.classList.remove('hidden');
    renderMessages();
}

function toggleMessageSelection(id) {
    if (selectedMessageIds.has(id)) {
        selectedMessageIds.delete(id);
    } else {
        selectedMessageIds.add(id);
    }
    if (selectedMessageIds.size === 0) {
        exitSelectionMode();
    } else {
        updateSelectionCounter();
        renderMessages();
    }
}

function updateSelectionCounter() {
    const countEl = document.getElementById('selected-count');
    if (countEl) countEl.textContent = `${selectedMessageIds.size} selected`;
}

function deleteSelectedMessages() {
    if (selectedMessageIds.size === 0) return;
    if (confirm(`Delete ${selectedMessageIds.size} selected message(s)?`)) {
        if (!db.deleted) db.deleted = [];
        selectedMessageIds.forEach(id => db.deleted.push(id));
        db.rooms[db.activeRoom] = (db.rooms[db.activeRoom] || []).filter(msg => {
            const msgId = typeof msg === 'object' ? msg.id : null;
            return !selectedMessageIds.has(msgId);
        });
        saveData();
        exitSelectionMode();
        queueSync();
    }
}

// ==========================================
// Conflict-Free Merge & Sync
// ==========================================
function mergeDatabases(local, remote) {
    if (!remote || typeof remote !== 'object') return local;

    var deleted = new Set([...(local.deleted || []), ...(remote.deleted || [])]);
    var deletedFolders = new Set([...(local.deletedFolders || []), ...(remote.deletedFolders || [])]);
    var deletedTodos = new Set([...(local.deletedTodos || []), ...(remote.deletedTodos || [])]);

    // 1. Merge Folders
    var combinedFolders = new Set([...(local.folders || []), ...(remote.folders || [])]);
    deletedFolders.forEach(function(df) { combinedFolders.delete(df); });

    var mergedRoomFolders = Object.assign({}, remote.roomFolders || {}, local.roomFolders || {});
    Object.keys(mergedRoomFolders).forEach(function(r) {
        if (deletedFolders.has(mergedRoomFolders[r])) delete mergedRoomFolders[r];
    });

    // 2. Merge Rooms
    var allRooms = new Set([...Object.keys(local.rooms || {}), ...Object.keys(remote.rooms || {})]);
    if (allRooms.size === 0) allRooms.add("General Stuff");

    var chosenActiveRoom = local.activeRoom;
    if (!chosenActiveRoom || !allRooms.has(chosenActiveRoom)) {
        chosenActiveRoom = Array.from(allRooms)[0] || "General Stuff";
    }

    // 3. Merge To-Dos (Highest timestamp wins; deleted items stay deleted)
    var todoMap = new Map();
    [...(local.todos || []), ...(remote.todos || [])].forEach(function(item) {
        if (!item || !item.id || deletedTodos.has(item.id)) return;
        if (!todoMap.has(item.id)) {
            todoMap.set(item.id, item);
        } else {
            var existing = todoMap.get(item.id);
            if ((item.updatedAt || 0) >= (existing.updatedAt || 0)) {
                todoMap.set(item.id, item);
            }
        }
    });

    var merged = { 
        rooms: {}, 
        activeRoom: chosenActiveRoom,
        deleted: Array.from(deleted),
        deletedFolders: Array.from(deletedFolders),
        folders: Array.from(combinedFolders),
        roomFolders: mergedRoomFolders,
        collapsedFolders: local.collapsedFolders || [],
        todos: Array.from(todoMap.values()),
        deletedTodos: Array.from(deletedTodos),
        notes: (remote.notesUpdated && remote.notesUpdated > (local.notesUpdated || 0)) 
            ? (remote.notes || "") 
            : (local.notes || remote.notes || ""),
        notesUpdated: Math.max(local.notesUpdated || 0, remote.notesUpdated || 0)
    };
    
    // 4. Merge Chat Messages & Photos by unique ID
    allRooms.forEach(function(room) {
        var localMsgs = local.rooms ? (local.rooms[room] || []) : [];
        var remoteMsgs = remote.rooms ? (remote.rooms[room] || []) : [];
        var map = new Map();

        [...localMsgs, ...remoteMsgs].forEach(function(msg) {
            if (!msg) return;
            var msgObj = typeof msg === 'object' ? Object.assign({}, msg) : { type: 'text', text: String(msg), timestamp: '' };
            if (!msgObj.id) msgObj.id = generateId();

            if (deleted.has(msgObj.id)) return;

            var key = msgObj.id; // Map directly by unique ID to preserve photos
            if (!map.has(key)) {
                map.set(key, msgObj);
            } else {
                var existing = map.get(key);
                if ((msgObj.updatedAt || 0) >= (existing.updatedAt || 0)) {
                    map.set(key, msgObj);
                }
            }
        });
        
        merged.rooms[room] = Array.from(map.values());
    });

    var activeNotesEl = document.getElementById('quick-notes-input');
    if (activeNotesEl && document.activeElement !== activeNotesEl) {
        activeNotesEl.value = merged.notes || "";
    }

    return merged;
}

function loadSyncCredentials() {
    const token = localStorage.getItem('gh_token') || '';
    const gistId = localStorage.getItem('gist_id') || '';
    const tokenInput = document.getElementById('gh-token-input');
    const gistInput = document.getElementById('gist-id-input');
    if (tokenInput) tokenInput.value = token;
    if (gistInput) gistInput.value = gistId;
}

async function runGistSync(isSilent = false) {
    var statusEl = document.getElementById('sync-status');
    var tokenInput = document.getElementById('gh-token-input');
    var gistInput = document.getElementById('gist-id-input');
    
    if (tokenInput && tokenInput.value.trim()) {
        localStorage.setItem('gh_token', tokenInput.value.trim());
    }
    if (gistInput && gistInput.value.trim()) {
        localStorage.setItem('gist_id', gistInput.value.trim());
    }

    var token = (localStorage.getItem('gh_token') || '').trim();
    var currentGistId = (localStorage.getItem('gist_id') || '').trim();

    if (!token) {
        if (statusEl && !isSilent) statusEl.textContent = "Token missing. Set your GitHub Token.";
        return;
    }

    if (statusEl && !isSilent) statusEl.textContent = "Syncing...";

    try {
        if (currentGistId) {
            var getUrl = 'https://api.github.com/gists/' + currentGistId;
            var res = await fetch(getUrl, {
                headers: { 
                    'Authorization': 'token ' + token,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (res.status === 401 || res.status === 403) {
                throw new Error("Bad credentials. Recheck your GitHub token.");
            }
            if (res.status === 404) {
                throw new Error("Gist ID not found. Clear Gist ID to recreate.");
            }

            if (res.ok) {
                var data = await res.json();
                var fileKeys = Object.keys(data.files || {});
                var fileObj = fileKeys.length > 0 ? data.files[fileKeys[0]] : null;

                if (fileObj) {
                    var content = fileObj.content;

                    // Large photo payload (>1MB): fetch complete raw string
                    if (fileObj.truncated && fileObj.raw_url) {
                        var separator = fileObj.raw_url.indexOf('?') === -1 ? '?' : '&';
                        var rawRes = await fetch(fileObj.raw_url + separator + 'nocache=' + Date.now());
                        if (!rawRes.ok) throw new Error('Raw fetch failed (' + rawRes.status + ')');
                        content = await rawRes.text();
                    }

                    if (content) {
                        var remoteDb = JSON.parse(content);
                        db = mergeDatabases(db, remoteDb);
                        saveData();
                        renderRooms();
                        renderMessages();
                        renderTodos();
                    }
                }
            }
        }

        var payload = {
            description: "Self Chat Backup DB",
            public: false,
            files: { 
                "self_chat_db.json": { 
                    content: JSON.stringify(db) 
                } 
            }
        };

        var syncMethod = currentGistId ? 'PATCH' : 'POST';
        var syncUrl = currentGistId ? ('https://api.github.com/gists/' + currentGistId) : 'https://api.github.com/gists';

        var pushRes = await fetch(syncUrl, {
            method: syncMethod,
            headers: { 
                'Authorization': 'token ' + token,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(payload)
        });

        if (!pushRes.ok) {
            var errJson = await pushRes.json().catch(function() { return {}; });
            throw new Error(errJson.message || ('HTTP ' + pushRes.status));
        }
        
        var pushData = await pushRes.json();
        if (pushData && pushData.id) {
            currentGistId = pushData.id;
            localStorage.setItem('gist_id', currentGistId);
            if (gistInput) gistInput.value = currentGistId;
        }

        if (statusEl) statusEl.textContent = 'Synced (' + getCurrentTimeStr() + ')';
    } catch (err) {
        console.error("Gist sync error:", err);
        if (statusEl && !isSilent) statusEl.textContent = 'Sync failed: ' + err.message;
    }
}

function startAutoSync() {
    runGistSync(true);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') runGistSync(true);
    });
    if (autoSyncInterval) clearInterval(autoSyncInterval);
    autoSyncInterval = setInterval(() => runGistSync(true), 300000);
}

// ==========================================
// Event Listeners Registration
// ==========================================

function attachEventListeners() {
    // Quick Notes Auto-Save Listener
    const notesInput = document.getElementById('quick-notes-input');
    const notesStatus = document.getElementById('notes-save-status');
    let notesTimer = null;

    if (notesInput) {
        notesInput.addEventListener('input', () => {
            if (notesStatus) notesStatus.textContent = "Saving...";
            db.notes = notesInput.value;
            db.notesUpdated = Date.now();
            
            if (notesTimer) clearTimeout(notesTimer);
            notesTimer = setTimeout(() => {
                saveData();
                if (notesStatus) notesStatus.textContent = "Saved";
                queueSync();
            }, 1000);
        });
    }

    // Interactive To-Do List Submission
    const todoForm = document.getElementById('todo-form');
    const todoInput = document.getElementById('todo-input');
    if (todoForm && todoInput) {
        todoForm.onsubmit = (e) => {
            e.preventDefault();
            const val = todoInput.value.trim();
            if (!val) return;

            if (!db.todos) db.todos = [];
            db.todos.unshift({
                id: generateId(),
                text: val,
                done: false,
                updatedAt: Date.now()
            });

            todoInput.value = '';
            saveData();
            renderTodos();
            queueSync();
        };
    }

    // Mobile Switcher Tabs
    const tabChats = document.getElementById('mobile-tab-chats');
    const tabTodos = document.getElementById('mobile-tab-todos');
    if (tabChats && tabTodos) {
        tabChats.onclick = () => {
            tabChats.classList.add('active');
            tabTodos.classList.remove('active');
            document.body.classList.remove('show-todos');
        };
        tabTodos.onclick = () => {
            tabTodos.classList.add('active');
            tabChats.classList.remove('active');
            document.body.classList.add('show-todos');
        };
    }

    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.onclick = () => document.getElementById('app').classList.remove('show-chat');

    const roomOptionsBtn = document.getElementById('room-options-btn');
    if (roomOptionsBtn) roomOptionsBtn.onclick = openRoomActionsMenu;

    const closeFolderBtn = document.getElementById('close-folder-modal-btn');
    if (closeFolderBtn) {
        closeFolderBtn.onclick = () => {
            const folderModal = document.getElementById('folder-modal');
            if (folderModal) folderModal.classList.add('hidden');
        };
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#message-context-menu')) hideContextMenu();
    });

    const menuEditBtn = document.getElementById('menu-edit-btn');
    if (menuEditBtn) {
        menuEditBtn.onclick = () => {
            if (!targetMessageData) return;
            const { msg } = targetMessageData;
            hideContextMenu();
            const newText = prompt("Edit your message:", msg.text);
            if (newText !== null && newText.trim() !== '') {
                msg.text = newText.trim();
                msg.edited = true;
                msg.updatedAt = Date.now();
                saveData();
                renderMessages();
                queueSync();
            }
        };
    }

    const menuDeleteBtn = document.getElementById('menu-delete-btn');
    if (menuDeleteBtn) {
        menuDeleteBtn.onclick = () => {
            if (!targetMessageData) return;
            const { index, msg } = targetMessageData;
            hideContextMenu();
            if (confirm("Delete this message?")) {
                if (!db.deleted) db.deleted = [];
                db.deleted.push(msg.id);
                db.rooms[db.activeRoom].splice(index, 1);
                saveData();
                renderMessages();
                queueSync();
            }
        };
    }

    const menuSelectBtn = document.getElementById('menu-select-btn');
    if (menuSelectBtn) {
        menuSelectBtn.onclick = () => {
            if (!targetMessageData) return;
            const { msg } = targetMessageData;
            hideContextMenu();
            enterSelectionMode(msg.id);
        };
    }

    const cancelSelectBtn = document.getElementById('cancel-selection-btn');
    if (cancelSelectBtn) cancelSelectBtn.onclick = exitSelectionMode;

    const deleteSelectBtn = document.getElementById('delete-selected-btn');
    if (deleteSelectBtn) deleteSelectBtn.onclick = deleteSelectedMessages;

    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.onchange = (e) => {
            applyTheme(e.target.value);
        };
    }

    const addFolderBtn = document.getElementById('add-folder-btn');
    if (addFolderBtn) {
        addFolderBtn.onclick = () => {
            const folderName = prompt("Enter new folder name (e.g. Work, Notes, Spotify):");
            if (folderName && folderName.trim()) {
                const cleanName = folderName.trim();
                if (!db.folders) db.folders = [];
                if (!db.folders.includes(cleanName)) {
                    db.folders.push(cleanName);
                    if (db.deletedFolders) {
                        db.deletedFolders = db.deletedFolders.filter(df => df !== cleanName);
                    }
                    saveData();
                    renderRooms();
                    queueSync();
                } else {
                    alert("Folder already exists.");
                }
            }
        };
    }

    const addRoomBtn = document.getElementById('add-room-btn');
    if (addRoomBtn) {
        addRoomBtn.onclick = () => {
            const name = prompt("Enter new chat category name:");
            if (name && name.trim()) {
                const clean = name.trim();
                if (!db.rooms[clean]) {
                    db.rooms[clean] = []; 
                    db.activeRoom = clean; 
                    saveData(); 
                    renderRooms(); 
                    renderMessages(); 
                    const appEl = document.getElementById('app');
                    if (appEl) appEl.classList.add('show-chat');
                    queueSync();
                }
            }
        };
    }

    const syncModal = document.getElementById('sync-modal');
    const syncSettingsBtn = document.getElementById('sync-settings-btn');
    if (syncSettingsBtn && syncModal) syncSettingsBtn.onclick = () => syncModal.classList.remove('hidden');

    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn && syncModal) closeModalBtn.onclick = () => syncModal.classList.add('hidden');

    const saveSyncBtn = document.getElementById('save-sync-btn');
    if (saveSyncBtn) {
        saveSyncBtn.onclick = () => {
            const token = (document.getElementById('gh-token-input')?.value || '').trim();
            const gistId = (document.getElementById('gist-id-input')?.value || '').trim();
            const theme = document.getElementById('theme-select')?.value || 'default';
            
            localStorage.setItem('gh_token', token);
            localStorage.setItem('gist_id', gistId);
            applyTheme(theme);
            
            const statusEl = document.getElementById('sync-status');
            if (statusEl) statusEl.textContent = "Settings saved!";
            runGistSync(false);
        };
    }

    const runSyncBtn = document.getElementById('run-sync-btn');
    if (runSyncBtn) runSyncBtn.onclick = () => runGistSync(false);

    const mediaInput = document.getElementById('media-input');
    const attachBtn = document.getElementById('attach-btn');
    if (attachBtn && mediaInput) {
        attachBtn.onclick = () => mediaInput.click();
        mediaInput.onchange = () => {
            const file = mediaInput.files[0];
            if (file) handleFileUpload(file);
            mediaInput.value = '';
        };
    }

    window.addEventListener('paste', (e) => {
        if (!db.activeRoom) return;
        const items = (e.clipboardData || window.clipboardData)?.items || [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) {
                    e.preventDefault();
                    handleFileUpload(file);
                    return;
                }
            }
        }
    });

    const textarea = document.getElementById('message-input');
    const messageForm = document.getElementById('message-form');

    if (textarea && messageForm) {
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                messageForm.dispatchEvent(new Event('submit', { cancelable: true }));
            }
        });

        messageForm.onsubmit = (e) => {
            e.preventDefault();
            const text = textarea.value.trim();

            if (!db.activeRoom || !db.rooms[db.activeRoom]) {
                const available = Object.keys(db.rooms || {});
                db.activeRoom = available.length > 0 ? available[0] : "General Stuff";
                if (!db.rooms[db.activeRoom]) db.rooms[db.activeRoom] = [];
            }

            if (text && db.activeRoom) {
                const textObj = { 
                    id: generateId(),
                    type: 'text', 
                    text: text, 
                    timestamp: getCurrentTimeStr(),
                    updatedAt: Date.now()
                };
                if (!db.rooms[db.activeRoom]) db.rooms[db.activeRoom] = [];
                db.rooms[db.activeRoom].push(textObj); 
                
                textarea.value = ''; 
                textarea.style.height = 'auto';
                saveData(); 
                renderRooms();
                renderMessages();
                queueSync();
            }
        };
    }
}

// ==========================================
// Bootstrap
// ==========================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

if ('serviceWorker' in navigator) { 
    navigator.serviceWorker.register('sw.js').catch(() => {}); 
}