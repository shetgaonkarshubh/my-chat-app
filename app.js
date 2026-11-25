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
// Base64 & Text Helpers (Unicode Safe)
// ==========================================

function encodeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64(str) {
    return decodeURIComponent(escape(atob(str)));
}

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
            sbUpsertTodo(item);
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
            sbDeleteTodo(item.id);
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
        
        // ... (other initialization code) ...

        renderRooms(); 
        renderMessages(); 
        renderTodos();
        attachEventListeners();
        initSupabase();
    }).catch((err) => {
        console.error("LocalForage load error:", err);
        renderRooms(); 
        renderMessages(); 
        renderTodos();
        attachEventListeners();
        initSupabase();
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
// Messages Rendering & Multi-Tap Controller
// ==========================================

function renderMessages() {
    const container = document.getElementById('messages-container');
    const title = document.getElementById('current-room-title');
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

    const folderTag = document.getElementById('current-room-folder');
    if (folderTag) {
        folderTag.textContent = '';
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
                img.loading = 'lazy';
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
            downloadBtn.target = '_blank';
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
// Supabase Cloud & Realtime Sync Engine
// ==========================================

const SB_BUCKET = 'self-chat-media';
let sbClient = null;
let sbUser = null;
let sbChannel = null;
const signedUrlCache = new Map();

function getSupabaseConfig() {
    const url = (localStorage.getItem('sb_url') || '').trim().replace(/\/$/, '');
    const key = (localStorage.getItem('sb_key') || '').trim();
    return { url, key };
}

function setSyncStatus(text) {
    const statusEl = document.getElementById('sync-status');
    if (statusEl) statusEl.textContent = text;
    const notesStatus = document.getElementById('notes-save-status');
    if (notesStatus && (text.startsWith('Synced') || text.startsWith('Offline') || text.startsWith('Live'))) {
        notesStatus.textContent = text.startsWith('Offline') ? 'Offline' : 'Synced';
    }
}

function updateAuthUI() {
    const signedOutBox = document.getElementById('sb-signed-out-box');
    const signedInBox = document.getElementById('sb-signed-in-box');
    const userInfo = document.getElementById('sb-user-info');
    if (!signedOutBox || !signedInBox) return;

    if (sbUser) {
        signedOutBox.classList.add('hidden');
        signedInBox.classList.remove('hidden');
        if (userInfo) userInfo.textContent = `Signed in as ${sbUser.email}`;
    } else {
        signedOutBox.classList.remove('hidden');
        signedInBox.classList.add('hidden');
        if (userInfo) userInfo.textContent = '';
    }
}

async function initSupabase() {
    const { url, key } = getSupabaseConfig();
    const urlInput = document.getElementById('sb-url-input');
    const keyInput = document.getElementById('sb-key-input');
    if (urlInput) urlInput.value = url;
    if (keyInput) keyInput.value = key;

    if (!url || !key || typeof window.supabase === 'undefined') {
        sbClient = null;
        sbUser = null;
        updateAuthUI();
        return;
    }

    sbClient = window.supabase.createClient(url, key);

    try {
        const { data } = await sbClient.auth.getSession();
        sbUser = data?.session?.user || null;
        updateAuthUI();

        if (sbUser) {
            await syncFromSupabase();
            subscribeRealtime();
        }
    } catch (err) {
        console.error('Supabase init error:', err);
        setSyncStatus('Offline (using local data)');
    }

    if (!window._sbVisibilityBound) {
        window._sbVisibilityBound = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && sbClient && sbUser) {
                syncFromSupabase(true);
            }
        });
        window.addEventListener('online', () => {
            if (sbClient && sbUser) syncFromSupabase(true);
        });
    }
}

async function refreshSignedUrlsForMessages(msgs) {
    if (!sbClient || !sbUser) return;
    const paths = [];
    msgs.forEach(m => {
        if (m && m.filePath) paths.push(m.filePath);
    });
    if (paths.length === 0) return;

    const uniquePaths = Array.from(new Set(paths));
    try {
        const { data, error } = await sbClient.storage
            .from(SB_BUCKET)
            .createSignedUrls(uniquePaths, 3600);
        if (error || !data) return;

        data.forEach(item => {
            if (item.path && item.signedUrl) {
                signedUrlCache.set(item.path, item.signedUrl);
            }
        });

        msgs.forEach(m => {
            if (m && m.filePath && signedUrlCache.has(m.filePath)) {
                m.data = signedUrlCache.get(m.filePath);
            }
        });
    } catch (e) {
        console.warn('Could not refresh signed URLs:', e);
    }
}

async function uploadMediaToSupabase(file) {
    if (!sbClient || !sbUser) {
        throw new Error('Sign in to Supabase in Settings before uploading files.');
    }

    const cleanName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${sbUser.id}/${Date.now()}_${cleanName}`;

    const { error: uploadError } = await sbClient.storage
        .from(SB_BUCKET)
        .upload(filePath, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false
        });

    if (uploadError) throw uploadError;

    const { data: signedData, error: signError } = await sbClient.storage
        .from(SB_BUCKET)
        .createSignedUrl(filePath, 3600);

    if (signError) throw signError;

    signedUrlCache.set(filePath, signedData.signedUrl);
    return { filePath, signedUrl: signedData.signedUrl };
}

async function syncFromSupabase(isSilent = false) {
    if (!sbClient || !sbUser) {
        if (!isSilent) setSyncStatus('Sign in to Supabase in Settings.');
        return;
    }

    if (!isSilent) setSyncStatus('Syncing...');

    try {
        const [foldersRes, roomsRes, msgsRes, todosRes] = await Promise.all([
            sbClient.from('folders').select('*').order('created_at', { ascending: true }),
            sbClient.from('rooms').select('*').order('created_at', { ascending: true }),
            sbClient.from('messages').select('*').order('updated_at', { ascending: true }),
            sbClient.from('todos').select('*').order('updated_at', { ascending: false })
        ]);

        if (foldersRes.error) throw foldersRes.error;
        if (roomsRes.error) throw roomsRes.error;
        if (msgsRes.error) throw msgsRes.error;
        if (todosRes.error) throw todosRes.error;

        const remoteFolders = (foldersRes.data || []).map(f => f.name);
        const remoteRoomsObj = {};
        const remoteRoomFolders = {};

        (roomsRes.data || []).forEach(r => {
            remoteRoomsObj[r.name] = [];
            if (r.folder) remoteRoomFolders[r.name] = r.folder;
        });

        const allMsgs = (msgsRes.data || []).map(m => {
            const msgObj = {
                id: m.id,
                type: m.type || 'text',
                text: m.text || '',
                filePath: m.file_path || undefined,
                fileName: m.file_name || undefined,
                fileSize: m.file_size || undefined,
                fileType: m.file_type || undefined,
                data: m.file_path ? (signedUrlCache.get(m.file_path) || '') : undefined,
                timestamp: m.timestamp || '',
                edited: !!m.edited,
                updatedAt: m.updated_at || Date.now()
            };
            if (!remoteRoomsObj[m.room]) remoteRoomsObj[m.room] = [];
            remoteRoomsObj[m.room].push(msgObj);
            return msgObj;
        });

        await refreshSignedUrlsForMessages(allMsgs);

        if (Object.keys(remoteRoomsObj).length === 0) {
            remoteRoomsObj['General Stuff'] = [];
        }

        const remoteTodos = (todosRes.data || []).map(t => ({
            id: t.id,
            text: t.text,
            done: !!t.done,
            updatedAt: t.updated_at || Date.now()
        }));

        const activeRoom = (db.activeRoom && remoteRoomsObj[db.activeRoom])
            ? db.activeRoom
            : Object.keys(remoteRoomsObj)[0];

        db = {
            rooms: remoteRoomsObj,
            activeRoom,
            deleted: [],
            folders: remoteFolders,
            deletedFolders: [],
            roomFolders: remoteRoomFolders,
            collapsedFolders: db.collapsedFolders || [],
            todos: remoteTodos,
            deletedTodos: []
        };

        saveData();
        renderRooms();
        renderMessages();
        renderTodos();
        setSyncStatus(`Synced (${getCurrentTimeStr()})`);
    } catch (err) {
        console.error('Supabase sync error:', err);
        if (!isSilent) setSyncStatus('Sync failed: ' + err.message);
    }
}

async function pushLocalToCloud() {
    if (!sbClient || !sbUser) {
        alert('Please sign in to Supabase first!');
        return;
    }
    setSyncStatus('Pushing local data to cloud...');

    try {
        const uid = sbUser.id;
        const folderRows = (db.folders || []).map(name => ({
            id: `${uid}::folder::${name}`,
            user_id: uid,
            name,
            created_at: Date.now()
        }));

        const roomRows = Object.keys(db.rooms || {}).map(name => ({
            id: `${uid}::room::${name}`,
            user_id: uid,
            name,
            folder: (db.roomFolders && db.roomFolders[name]) || null,
            created_at: Date.now()
        }));

        const msgRows = [];
        Object.keys(db.rooms || {}).forEach(roomName => {
            (db.rooms[roomName] || []).forEach(m => {
                if (!m || !m.id) return;
                msgRows.push({
                    id: m.id,
                    user_id: uid,
                    room: roomName,
                    type: m.type || 'text',
                    text: m.text || null,
                    file_path: m.filePath || null,
                    file_name: m.fileName || null,
                    file_size: m.fileSize || 0,
                    file_type: m.fileType || null,
                    timestamp: m.timestamp || '',
                    edited: !!m.edited,
                    updated_at: m.updatedAt || Date.now()
                });
            });
        });

        const todoRows = (db.todos || []).map(t => ({
            id: t.id,
            user_id: uid,
            text: t.text,
            done: !!t.done,
            updated_at: t.updatedAt || Date.now()
        }));

        if (folderRows.length) {
            const { error } = await sbClient.from('folders').upsert(folderRows);
            if (error) throw error;
        }
        if (roomRows.length) {
            const { error } = await sbClient.from('rooms').upsert(roomRows);
            if (error) throw error;
        }
        if (msgRows.length) {
            const { error } = await sbClient.from('messages').upsert(msgRows);
            if (error) throw error;
        }
        if (todoRows.length) {
            const { error } = await sbClient.from('todos').upsert(todoRows);
            if (error) throw error;
        }

        setSyncStatus(`Pushed to cloud! (${getCurrentTimeStr()})`);
    } catch (err) {
        console.error('Push failed:', err);
        setSyncStatus('Push failed: ' + err.message);
    }
}

function subscribeRealtime() {
    if (!sbClient || !sbUser) return;
    if (sbChannel) {
        sbClient.removeChannel(sbChannel);
        sbChannel = null;
    }

    sbChannel = sbClient
        .channel('self-chat-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => syncFromSupabase(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => syncFromSupabase(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'folders' }, () => syncFromSupabase(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => syncFromSupabase(true))
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                setSyncStatus(`Live sync active (${getCurrentTimeStr()})`);
            }
        });
}

// Granular cloud mutation helpers
async function sbCreateMessage(room, msgObj) {
    if (!sbClient || !sbUser) return;
    const { error } = await sbClient.from('messages').upsert({
        id: msgObj.id,
        user_id: sbUser.id,
        room,
        type: msgObj.type || 'text',
        text: msgObj.text || null,
        file_path: msgObj.filePath || null,
        file_name: msgObj.fileName || null,
        file_size: msgObj.fileSize || 0,
        file_type: msgObj.fileType || null,
        timestamp: msgObj.timestamp || '',
        edited: !!msgObj.edited,
        updated_at: msgObj.updatedAt || Date.now()
    });
    if (error) console.error('sbCreateMessage error:', error);
}

async function sbUpdateMessage(msgObj) {
    if (!sbClient || !sbUser) return;
    const { error } = await sbClient
        .from('messages')
        .update({ text: msgObj.text, edited: true, updated_at: msgObj.updatedAt })
        .eq('id', msgObj.id)
        .eq('user_id', sbUser.id);
    if (error) console.error('sbUpdateMessage error:', error);
}

async function sbDeleteMessages(msgsToDelete) {
    if (!sbClient || !sbUser || !msgsToDelete.length) return;
    const ids = msgsToDelete.map(m => m.id).filter(Boolean);
    const paths = msgsToDelete.map(m => m.filePath).filter(Boolean);
    if (paths.length) {
        await sbClient.storage.from(SB_BUCKET).remove(paths).catch(() => {});
    }
    if (ids.length) {
        const { error } = await sbClient.from('messages').delete().in('id', ids).eq('user_id', sbUser.id);
        if (error) console.error('sbDeleteMessages error:', error);
    }
}

async function sbUpsertTodo(item) {
    if (!sbClient || !sbUser) return;
    const { error } = await sbClient.from('todos').upsert({
        id: item.id,
        user_id: sbUser.id,
        text: item.text,
        done: !!item.done,
        updated_at: item.updatedAt || Date.now()
    });
    if (error) console.error('sbUpsertTodo error:', error);
}

async function sbDeleteTodo(id) {
    if (!sbClient || !sbUser) return;
    const { error } = await sbClient.from('todos').delete().eq('id', id).eq('user_id', sbUser.id);
    if (error) console.error('sbDeleteTodo error:', error);
}

async function sbCreateFolder(name) {
    if (!sbClient || !sbUser) return;
    const { error } = await sbClient.from('folders').upsert({
        id: `${sbUser.id}::folder::${name}`,
        user_id: sbUser.id,
        name,
        created_at: Date.now()
    });
    if (error) console.error('sbCreateFolder error:', error);
}

async function sbRenameFolder(oldName, newName) {
    if (!sbClient || !sbUser) return;
    await sbClient.from('folders').delete().eq('user_id', sbUser.id).eq('name', oldName);
    await sbCreateFolder(newName);
    await sbClient.from('rooms').update({ folder: newName }).eq('user_id', sbUser.id).eq('folder', oldName);
}

async function sbDeleteFolder(name) {
    if (!sbClient || !sbUser) return;
    await sbClient.from('folders').delete().eq('user_id', sbUser.id).eq('name', name);
    await sbClient.from('rooms').update({ folder: null }).eq('user_id', sbUser.id).eq('folder', name);
}

async function sbCreateRoom(name, folder = null) {
    if (!sbClient || !sbUser) return;
    const { error } = await sbClient.from('rooms').upsert({
        id: `${sbUser.id}::room::${name}`,
        user_id: sbUser.id,
        name,
        folder: folder || null,
        created_at: Date.now()
    });
    if (error) console.error('sbCreateRoom error:', error);
}

async function sbUpdateRoomFolder(name, folder) {
    if (!sbClient || !sbUser) return;
    await sbClient.from('rooms').update({ folder: folder || null }).eq('user_id', sbUser.id).eq('name', name);
}

async function sbRenameRoom(oldName, newName, folder = null) {
    if (!sbClient || !sbUser) return;
    await sbClient.from('rooms').delete().eq('user_id', sbUser.id).eq('name', oldName);
    await sbCreateRoom(newName, folder);
    await sbClient.from('messages').update({ room: newName }).eq('user_id', sbUser.id).eq('room', oldName);
}

async function sbDeleteRoom(name) {
    if (!sbClient || !sbUser) return;
    await sbClient.from('rooms').delete().eq('user_id', sbUser.id).eq('name', name);
    await sbClient.from('messages').delete().eq('user_id', sbUser.id).eq('room', name);
}

async function handleFileUpload(file) {
    if (!file) return;
    if (!db.activeRoom) db.activeRoom = Object.keys(db.rooms)[0] || "General Stuff";

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    setSyncStatus("Uploading file...");

    let uploadRes;
    try {
        uploadRes = await uploadMediaToSupabase(file);
    } catch (err) {
        console.error("Upload error:", err);
        showToast("Upload failed: " + err.message);
        setSyncStatus("Upload failed");
        return;
    }

    const mediaObj = {
        id: generateId(),
        type: (isImage || isVideo || isAudio) ? 'media' : 'file',
        fileName: file.name || (isImage ? `image_${Date.now()}.jpg` : 'file'),
        fileSize: file.size || 0,
        fileType: file.type || 'application/octet-stream',
        filePath: uploadRes.filePath,
        data: uploadRes.signedUrl,
        timestamp: getCurrentTimeStr(),
        updatedAt: Date.now()
    };

    if (!db.rooms[db.activeRoom]) db.rooms[db.activeRoom] = [];
    db.rooms[db.activeRoom].push(mediaObj);
    saveData();
    renderMessages();
    await sbCreateMessage(db.activeRoom, mediaObj);
    setSyncStatus(`Synced (${getCurrentTimeStr()})`);
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
                sbRenameFolder(folderName, clean);
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
                sbDeleteFolder(folderName);
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
    sbUpdateRoomFolder(room, folder);
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
                sbRenameRoom(room, clean, db.roomFolders ? db.roomFolders[clean] : null);
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
                sbDeleteRoom(room);
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
        const deletedMsgs = [];
        selectedMessageIds.forEach(id => db.deleted.push(id));
        db.rooms[db.activeRoom] = (db.rooms[db.activeRoom] || []).filter(msg => {
            const msgId = typeof msg === 'object' ? msg.id : null;
            if (selectedMessageIds.has(msgId)) {
                deletedMsgs.push(msg);
                return false;
            }
            return true;
        });
        saveData();
        exitSelectionMode();
        sbDeleteMessages(deletedMsgs);
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

    var combinedFolders = new Set([...(local.folders || []), ...(remote.folders || [])]);
    deletedFolders.forEach(function(df) { combinedFolders.delete(df); });

    var mergedRoomFolders = Object.assign({}, remote.roomFolders || {}, local.roomFolders || {});
    Object.keys(mergedRoomFolders).forEach(function(r) {
        if (deletedFolders.has(mergedRoomFolders[r])) delete mergedRoomFolders[r];
    });

    var allRooms = new Set([...Object.keys(local.rooms || {}), ...Object.keys(remote.rooms || {})]);
    if (allRooms.size === 0) allRooms.add("General Stuff");

    var chosenActiveRoom = local.activeRoom;
    if (!chosenActiveRoom || !allRooms.has(chosenActiveRoom)) {
        chosenActiveRoom = Array.from(allRooms)[0] || "General Stuff";
    }

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
    
    allRooms.forEach(function(room) {
        var localMsgs = local.rooms ? (local.rooms[room] || []) : [];
        var remoteMsgs = remote.rooms ? (remote.rooms[room] || []) : [];
        var map = new Map();

        [...localMsgs, ...remoteMsgs].forEach(function(msg) {
            if (!msg) return;
            var msgObj = typeof msg === 'object' ? Object.assign({}, msg) : { type: 'text', text: String(msg), timestamp: '' };
            if (!msgObj.id) msgObj.id = generateId();

            if (deleted.has(msgObj.id)) return;

            var key = msgObj.id;
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

// ==========================================
// Event Listeners Registration
// ==========================================

function attachEventListeners() {
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
            }, 1000);
        });
    }

    const todoForm = document.getElementById('todo-form');
    const todoInput = document.getElementById('todo-input');
    if (todoForm && todoInput) {
        todoForm.onsubmit = (e) => {
            e.preventDefault();
            const val = todoInput.value.trim();
            if (!val) return;

            if (!db.todos) db.todos = [];
            const todoObj = {
                id: generateId(),
                text: val,
                done: false,
                updatedAt: Date.now()
            };
            db.todos.unshift(todoObj);

            todoInput.value = '';
            saveData();
            renderTodos();
            sbUpsertTodo(todoObj);
        };
    }

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
                sbUpdateMessage(msg);
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
                sbDeleteMessages([msg]);
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
                    sbCreateFolder(cleanName);
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
                    sbCreateRoom(clean, null);
                }
            }
        };
    }

    const saveSyncBtn = document.getElementById('save-sync-btn');
    if (saveSyncBtn) {
        saveSyncBtn.onclick = async () => {
            const url = (document.getElementById('sb-url-input')?.value || '').trim().replace(/\/$/, '');
            const key = (document.getElementById('sb-key-input')?.value || '').trim();
            const theme = document.getElementById('theme-select')?.value || 'default';
            
            localStorage.setItem('sb_url', url);
            localStorage.setItem('sb_key', key);
            applyTheme(theme);
            
            setSyncStatus("Settings saved!");
            await initSupabase();
        };
    }

    const signInBtn = document.getElementById('sb-signin-btn');
    if (signInBtn) {
        signInBtn.onclick = async () => {
            const url = (document.getElementById('sb-url-input')?.value || '').trim().replace(/\/$/, '');
            const key = (document.getElementById('sb-key-input')?.value || '').trim();
            const email = (document.getElementById('sb-email-input')?.value || '').trim();
            const password = document.getElementById('sb-password-input')?.value || '';
            if (!url || !key) { setSyncStatus("Enter Supabase URL & Anon Key first."); return; }
            if (!email || !password) { setSyncStatus("Enter email and password."); return; }

            localStorage.setItem('sb_url', url);
            localStorage.setItem('sb_key', key);
            if (!sbClient) sbClient = window.supabase.createClient(url, key);

            setSyncStatus("Signing in...");
            const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
            if (error) {
                setSyncStatus("Sign in failed: " + error.message);
                return;
            }
            sbUser = data.user;
            updateAuthUI();
            await syncFromSupabase();
            subscribeRealtime();
        };
    }

    const signUpBtn = document.getElementById('sb-signup-btn');
    if (signUpBtn) {
        signUpBtn.onclick = async () => {
            const url = (document.getElementById('sb-url-input')?.value || '').trim().replace(/\/$/, '');
            const key = (document.getElementById('sb-key-input')?.value || '').trim();
            const email = (document.getElementById('sb-email-input')?.value || '').trim();
            const password = document.getElementById('sb-password-input')?.value || '';
            if (!url || !key) { setSyncStatus("Enter Supabase URL & Anon Key first."); return; }
            if (!email || !password) { setSyncStatus("Enter email and password."); return; }

            localStorage.setItem('sb_url', url);
            localStorage.setItem('sb_key', key);
            if (!sbClient) sbClient = window.supabase.createClient(url, key);

            setSyncStatus("Creating account...");
            const { data, error } = await sbClient.auth.signUp({ email, password });
            if (error) {
                setSyncStatus("Sign up failed: " + error.message);
                return;
            }
            if (data.session) {
                sbUser = data.user;
                updateAuthUI();
                await pushLocalToCloud();
                subscribeRealtime();
            } else {
                setSyncStatus("Check your email to confirm your account, then Sign In.");
            }
        };
    }

    const signOutBtn = document.getElementById('sb-signout-btn');
    if (signOutBtn) {
        signOutBtn.onclick = async () => {
            if (sbChannel && sbClient) {
                await sbClient.removeChannel(sbChannel);
                sbChannel = null;
            }
            if (sbClient) await sbClient.auth.signOut();
            sbUser = null;
            updateAuthUI();
            setSyncStatus("Signed out.");
        };
    }

    const runSyncBtn = document.getElementById('run-sync-btn');
    if (runSyncBtn) runSyncBtn.onclick = () => syncFromSupabase(false);

    const pushBtn = document.getElementById('push-btn');
    if (pushBtn) pushBtn.onclick = pushLocalToCloud;

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
                sbCreateMessage(db.activeRoom, textObj);
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

// Register Service Worker for offline PWA support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
    });
}

document.addEventListener('click', (e) => {
    if (e.target.closest('#open-sync-modal-btn')) {
        document.getElementById('sync-modal').classList.remove('hidden');
    }
    if (e.target.closest('#close-modal-btn')) {
        document.getElementById('sync-modal').classList.add('hidden');
    }
});