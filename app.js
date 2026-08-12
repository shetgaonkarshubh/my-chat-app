let db = { rooms: { "General Stuff": [] }, activeRoom: "General Stuff" };
let autoSyncInterval = null;

function initApp() {
    if (typeof localforage === 'undefined') {
        setTimeout(initApp, 100);
        return;
    }
    localforage.getItem('self_chat_db').then((savedData) => {
        if (savedData) db = savedData;
        renderRooms(); 
        renderMessages(); 
        attachEventListeners();
        loadSyncCredentials();
        startAutoSync(); // Start background sync timer
    }).catch(() => {
        renderRooms(); 
        renderMessages(); 
        attachEventListeners();
        loadSyncCredentials();
        startAutoSync(); // Start background sync timer
    });
}

function saveData() { 
    if (typeof localforage !== 'undefined') {
        localforage.setItem('self_chat_db', db).catch((err) => console.error(err));
    }
}

function getCurrentTimeStr() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function renderRooms() {
    const list = document.getElementById('room-list');
    if (!list) return;
    list.innerHTML = '';
    Object.keys(db.rooms).forEach(roomName => {
        const li = document.createElement('li');
        li.textContent = roomName;
        if(roomName === db.activeRoom) li.classList.add('active');
        li.onclick = () => { 
            db.activeRoom = roomName; 
            saveData(); 
            renderRooms(); 
            renderMessages(); 
            document.getElementById('app').classList.add('show-chat');
        };
        list.appendChild(li);
    });
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    const title = document.getElementById('current-room-title');
    if (!container || !title) return;
    container.innerHTML = '';
    if(!db.activeRoom) { title.textContent = "Select a room"; return; }
    title.textContent = db.activeRoom;
    
    const messages = db.rooms[db.activeRoom] || [];
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.classList.add('message', 'sent');

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        let timeText = '';

        if (msg && typeof msg === 'object') {
            timeText = msg.timestamp || '';
            if (msg.type === 'media') {
                if (msg.fileType && msg.fileType.startsWith('image/')) {
                    const img = document.createElement('img'); 
                    img.src = msg.data; 
                    img.style.maxWidth = '100%'; 
                    img.style.borderRadius = '4px'; 
                    contentDiv.appendChild(img);
                } else if (msg.fileType && msg.fileType.startsWith('video/')) {
                    const video = document.createElement('video'); 
                    video.src = msg.data; 
                    video.controls = true; 
                    video.style.maxWidth = '100%'; 
                    video.style.borderRadius = '4px'; 
                    contentDiv.appendChild(video);
                }
            } else if (msg.type === 'text') {
                contentDiv.textContent = msg.text;
            } else {
                contentDiv.textContent = JSON.stringify(msg);
            }
        } else {
            contentDiv.textContent = msg;
        }

        div.appendChild(contentDiv);

        if (timeText) {
            const timeSpan = document.createElement('span');
            timeSpan.classList.add('message-time');
            timeSpan.textContent = timeText;
            div.appendChild(timeSpan);
        }

        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

// Merge Local and Remote DB without dropping unique messages
function mergeDatabases(local, remote) {
    const merged = { rooms: {}, activeRoom: local.activeRoom || remote.activeRoom || "General Stuff" };
    const allRooms = new Set([...Object.keys(local.rooms || {}), ...Object.keys(remote.rooms || {})]);
    
    allRooms.forEach(room => {
        const localMsgs = local.rooms[room] || [];
        const remoteMsgs = remote.rooms[room] || [];
        
        const map = new Map();
        [...localMsgs, ...remoteMsgs].forEach(msg => {
            const key = typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
            map.set(key, msg);
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
    
    // Auto-grab current input values if present in the modal
    const tokenInput = document.getElementById('gh-token-input');
    const gistInput = document.getElementById('gist-id-input');
    
    if (tokenInput && tokenInput.value.trim()) {
        localStorage.setItem('gh_token', tokenInput.value.trim());
    }
    if (gistInput && gistInput.value.trim()) {
        localStorage.setItem('gist_id', gistInput.value.trim());
    }

    const token = (localStorage.getItem('gh_token') || '').trim();
    let gistId = (localStorage.getItem('gist_id') || '').trim();

    if (!token) {
        if (statusEl && !isSilent) statusEl.textContent = "Error: Token missing. Save your GitHub Token first.";
        return;
    }

    if (statusEl && !isSilent) statusEl.textContent = "Syncing with GitHub...";

    try {
        // 1. Fetch Remote Gist Data if Gist ID exists (Cache-Busted for iOS Safari)
        if (gistId) {
            const res = await fetch(`https://api.github.com/gists/${gistId}?t=${Date.now()}`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                },
                cache: 'no-store'
            });

            if (res.status === 401) {
                throw new Error("401 Unauthorized (Check token permissions or paste token again)");
            }

            if (res.ok) {
                const data = await res.json();
                const content = data.files['self_chat_db.json']?.content;
                if (content) {
                    const remoteDb = JSON.parse(content);
                    db = mergeDatabases(db, remoteDb);
                    saveData();
                    renderRooms();
                    renderMessages();
                }
            }
        }

        // 2. Upload Merged Data Back to Gist
        const payload = {
            description: "Self Chat Backup DB",
            public: false,
            files: {
                "self_chat_db.json": { content: JSON.stringify(db) }
            }
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

// Automatically syncs in the background every 5 minutes and on app focus
function startAutoSync() {
    // Initial sync on app load (silent)
    runGistSync(true);

    // Sync when user re-opens the app/tab
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            runGistSync(true);
        }
    });

    // Background interval: every 5 minutes (300,000 ms)
    if (autoSyncInterval) clearInterval(autoSyncInterval);
    autoSyncInterval = setInterval(() => {
        runGistSync(true);
    }, 300000);
}

function attachEventListeners() {
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.onclick = () => document.getElementById('app').classList.remove('show-chat');
    }

    // Modal listeners
    const modal = document.getElementById('sync-modal');
    document.getElementById('sync-settings-btn').onclick = () => modal.classList.remove('hidden');
    document.getElementById('close-modal-btn').onclick = () => modal.classList.add('hidden');

    document.getElementById('save-sync-btn').onclick = () => {
        const token = document.getElementById('gh-token-input').value.trim();
        const gistId = document.getElementById('gist-id-input').value.trim();
        localStorage.setItem('gh_token', token);
        localStorage.setItem('gist_id', gistId);
        document.getElementById('sync-status').textContent = "Credentials saved locally!";
        runGistSync(false);
    };

    document.getElementById('run-sync-btn').onclick = () => runGistSync(false);

    document.getElementById('add-room-btn').onclick = () => {
        const name = prompt("Enter new chat category name:");
        if(name && !db.rooms[name]) { 
            db.rooms[name] = []; 
            db.activeRoom = name; 
            saveData(); 
            renderRooms(); 
            renderMessages(); 
            document.getElementById('app').classList.add('show-chat');
        }
    };

    const mediaInput = document.getElementById('media-input');
    const attachBtn = document.getElementById('attach-btn');
    if (attachBtn && mediaInput) {
        attachBtn.onclick = () => mediaInput.click();
        mediaInput.onchange = () => {
            const file = mediaInput.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const mediaObj = { 
                    type: 'media', 
                    fileType: file.type, 
                    data: e.target.result, 
                    timestamp: getCurrentTimeStr() 
                };
                if (!db.rooms[db.activeRoom]) db.rooms[db.activeRoom] = [];
                db.rooms[db.activeRoom].push(mediaObj); 
                saveData(); 
                renderMessages();
                runGistSync(true); // Trigger sync after uploading media
            };
            reader.readAsDataURL(file); 
            mediaInput.value = '';
        };
    }

    const messageForm = document.getElementById('message-form');
    if (messageForm) {
        messageForm.onsubmit = (e) => {
            e.preventDefault();
            const input = document.getElementById('message-input'); if (!input) return;
            const text = input.value.trim();
            if(text && db.activeRoom) {
                const textObj = { 
                    type: 'text', 
                    text: text, 
                    timestamp: getCurrentTimeStr() 
                };
                if (!db.rooms[db.activeRoom]) db.rooms[db.activeRoom] = [];
                db.rooms[db.activeRoom].push(textObj); 
                input.value = ''; 
                saveData(); 
                renderMessages();
                runGistSync(true); // Trigger sync after sending text
            }
        };
    }
}

window.onload = initApp;
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(() => {}); }