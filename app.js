let db = { 
    rooms: { "General Stuff": [] }, 
    activeRoom: "General Stuff", 
    deleted: [],
    folders: [], 
    deletedFolders: [],
    roomFolders: {}, 
    collapsedFolders: [] 
};

let autoSyncInterval = null;
let isSelectionMode = false;
let selectedMessageIds = new Set();
let targetMessageData = null;

// Utility functions
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

// App Initialization
function initApp() {
    console.log("Initializing App...");
    loadSavedTheme();

    if (typeof localforage === 'undefined') {
        console.warn("Waiting for localforage...");
        setTimeout(initApp, 100);
        return;
    }

    localforage.getItem('self_chat_db').then((savedData) => {
        if (savedData) {
            db = savedData;
        }
        // Ensure defaults exist
        if (!db.rooms) db.rooms = { "General Stuff": [] };
        if (!db.deleted) db.deleted = [];
        if (!db.folders) db.folders = [];
        if (!db.deletedFolders) db.deletedFolders = [];
        if (!db.roomFolders) db.roomFolders = {};
        if (!db.collapsedFolders) db.collapsedFolders = [];
        if (!db.activeRoom || !db.rooms[db.activeRoom]) {
            db.activeRoom = Object.keys(db.rooms)[0] || "General Stuff";
        }

        renderRooms(); 
        renderMessages(); 
        attachEventListeners();
        loadSyncCredentials();
        startAutoSync();
        console.log("App initialized successfully.");
    }).catch((err) => {
        console.error("LocalForage load error:", err);
        renderRooms(); 
        renderMessages(); 
        attachEventListeners();
        loadSyncCredentials();
        startAutoSync();
    });
}

function saveData() { 
    if (typeof localforage !== 'undefined') {
        localforage.setItem('self_chat_db', db).catch((err) => console.error("Error saving DB:", err));
    }
}

// Sidebar & Rooms
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

    // 1. Folders
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

    // 2. Uncategorized Chats
    allRooms.forEach(roomName => {
        if (!categorizedRooms.has(roomName)) {
            list.appendChild(createRoomElement(roomName, false));
        }
    });
}

// Chat Messages Rendering
function renderMessages() {
    const container = document.getElementById('messages-container');
    const title = document.getElementById('current-room-title');
    const folderTag = document.getElementById('current-room-folder');
    if (!container || !title) return;
    container.innerHTML = '';
    
    if (!db.activeRoom) { 
        title.textContent = "Select a room"; 
        if (folderTag) folderTag.textContent = "";
        return; 
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

        div.onclick = (e) => {
            if (isSelectionMode) {
                e.stopPropagation();
                toggleMessageSelection(msg.id);
            }
        };

        div.ondblclick = (e) => {
            if (isSelectionMode) return;
            e.stopPropagation();
            openContextMenu(e, index, msg);
        };

        let lastTap = 0;
        div.ontouchend = (e) => {
            if (isSelectionMode) return;
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault();
                e.stopPropagation();
                openContextMenu(e.changedTouches ? e.changedTouches[0] : e, index, msg);
            }
            lastTap = currentTime;
        };

        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

// File Upload Handler
function handleFileUpload(file) {
    if (!file || !db.activeRoom) return;

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
        runGistSync(true);
    };

    reader.readAsDataURL(file);
}

// Context Menu
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

// Folder Management Modal
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
                runGistSync(true);
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
                runGistSync(true);
            }
        };
    }

    modal.classList.remove('hidden');
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
    runGistSync(true);
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
                runGistSync(true);
            }
        };
    }

    const deleteBtn = document.getElementById('act-delete-room');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            modal.classList.add('hidden');
            if (confirm(`Are you sure you want to permanently delete the chat "${room}"?`)) {
                delete db.rooms[room];
                if (db.roomFolders) delete db.roomFolders[room];
                const remaining = Object.keys(db.rooms);
                db.activeRoom = remaining.length > 0 ? remaining[0] : "";
                saveData();
                renderRooms();
                renderMessages();
                runGistSync(true);
            }
        };
    }

    modal.classList.remove('hidden');
}

// Multi-Selection Logic
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
        runGistSync(true);
    }
}

// Sync & Database Conflict Merger
function mergeDatabases(local, remote) {
    const deleted = new Set([...(local.deleted || []), ...(remote.deleted || [])]);
    const deletedFolders = new Set([...(local.deletedFolders || []), ...(remote.deletedFolders || [])]);

    const combinedFolders = new Set([...(local.folders || []), ...(remote.folders || [])]);
    deletedFolders.forEach(df => combinedFolders.delete(df));

    const mergedRoomFolders = { ...(remote.roomFolders || {}), ...(local.roomFolders || {}) };
    Object.keys(mergedRoomFolders).forEach(r => {
        if (deletedFolders.has(mergedRoomFolders[r])) delete mergedRoomFolders[r];
    });

    const allRooms = new Set([...Object.keys(local.rooms || {}), ...Object.keys(remote.rooms || {})]);
    
    // Ensure activeRoom never resets to blank or invalid room
    let chosenActiveRoom = local.activeRoom;
    if (!chosenActiveRoom || (!local.rooms?.[chosenActiveRoom] && !remote.rooms?.[chosenActiveRoom])) {
        chosenActiveRoom = remote.activeRoom || Array.from(allRooms)[0] || "General Stuff";
    }

    const merged = { 
        rooms: {}, 
        activeRoom: chosenActiveRoom,
        deleted: Array.from(deleted),
        deletedFolders: Array.from(deletedFolders),
        folders: Array.from(combinedFolders),
        roomFolders: mergedRoomFolders,
        collapsedFolders: local.collapsedFolders || []
    };
    
    allRooms.forEach(room => {
        const localMsgs = local.rooms?.[room] || [];
        const remoteMsgs = remote.rooms?.[room] || [];
        const map = new Map();

        [...localMsgs, ...remoteMsgs].forEach(msg => {
            if (!msg) return;
            let msgObj = typeof msg === 'object' ? { ...msg } : { type: 'text', text: String(msg), timestamp: '' };
            if (!msgObj.id) msgObj.id = generateId();

            if (deleted.has(msgObj.id)) return;

            const contentKey = (msgObj.type === 'media' || msgObj.type === 'file')
                ? `file_${msgObj.fileName || ''}_${(msgObj.data || '').length}_${msgObj.timestamp || ''}` 
                : `text_${msgObj.text || ''}_${msgObj.timestamp || ''}`;

            if (!map.has(contentKey)) {
                map.set(contentKey, msgObj);
            } else {
                const existing = map.get(contentKey);
                if (msgObj.updatedAt && existing.updatedAt && msgObj.updatedAt > existing.updatedAt) {
                    map.set(contentKey, msgObj);
                }
            }
        });
        
        merged.rooms[room] = Array.from(map.values());
    });
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
    const statusEl = document.getElementById('sync-status');
    const tokenInput = document.getElementById('gh-token-input');
    const gistInput = document.getElementById('gist-id-input');
    
    if (tokenInput && tokenInput.value.trim()) localStorage.setItem('gh_token', tokenInput.value.trim());
    if (gistInput && gistInput.value.trim()) localStorage.setItem('gist_id', gistInput.value.trim());

    const token = (localStorage.getItem('gh_token') || '').trim();
    let gistId = (localStorage.getItem('gist_id') || '').trim();

    if (!token) {
        if (statusEl && !isSilent) statusEl.textContent = "Error: Token missing. Save your GitHub Token first.";
        return;
    }

    if (statusEl && !isSilent) statusEl.textContent = "Syncing with GitHub...";

    try {
        if (gistId) {
            const res = await fetch(`https://api.github.com/gists/${gistId}?t=${Date.now()}`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                },
                cache: 'no-store'
            });

            if (res.status === 401) throw new Error("401 Unauthorized (Check token permissions)");

            if (res.ok) {
                const data = await res.json();
                const fileKey = Object.keys(data.files || {})[0];
                const content = fileKey ? data.files[fileKey]?.content : null;

                if (content) {
                    const remoteDb = JSON.parse(content);
                    db = mergeDatabases(db, remoteDb);
                    saveData();
                    renderRooms();
                    renderMessages();
                }
            }
        }

        const payload = {
            description: "Self Chat Backup DB",
            public: false,
            files: { "self_chat_db.json": { content: JSON.stringify(db) } }
        };

        const method = gistId ? 'PATCH' : 'POST';
        const url = gistId ? `https://api.github.com/gists/${gistId}` : `https://api.github.com/gists`;

        const pushRes = await fetch(url, {
            method: method,
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(payload)
        });

        if (!pushRes.ok) throw new Error(`HTTP error! status: ${pushRes.status}`);
        
        const pushData = await pushRes.json();
        if (pushData.id) {
            gistId = pushData.id;
            localStorage.setItem('gist_id', gistId);
            if (gistInput) gistInput.value = gistId;
        }

        if (statusEl) statusEl.textContent = `Sync successful! (${getCurrentTimeStr()})`;
    } catch (err) {
        console.error(err);
        if (statusEl && !isSilent) statusEl.textContent = `Sync failed: ${err.message}`;
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

// Event Listeners
function attachEventListeners() {
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
                runGistSync(true);
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
                runGistSync(true);
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
                    runGistSync(true);
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
                    runGistSync(true);
                }
            }
        };
    }

    // Settings Modal
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

    // Media & File Attachment Input
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

    // Paste handler for screenshots / files
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

    // Message input form
    const messageForm = document.getElementById('message-form');
    if (messageForm) {
// Message Form Submit
    const messageForm = document.getElementById('message-form');
    if (messageForm) {
        messageForm.onsubmit = (e) => {
            e.preventDefault();
            const input = document.getElementById('message-input');
            if (!input) return;
            const text = input.value.trim();

            // If no room is active, select the first available room
            if (!db.activeRoom || !db.rooms[db.activeRoom]) {
                const availableRooms = Object.keys(db.rooms || {});
                if (availableRooms.length > 0) {
                    db.activeRoom = availableRooms[0];
                } else {
                    db.rooms["General Stuff"] = [];
                    db.activeRoom = "General Stuff";
                }
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
                input.value = ''; 
                saveData(); 
                renderRooms();
                renderMessages();
                runGistSync(true);
            }
        };
    }
    }
}

// Boot up
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

if ('serviceWorker' in navigator) { 
    navigator.serviceWorker.register('sw.js').catch(() => {}); 
}