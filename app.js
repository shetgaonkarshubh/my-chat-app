let db = { rooms: { "General Stuff": [] }, activeRoom: "General Stuff" };

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
    }).catch(() => {
        renderRooms(); 
        renderMessages(); 
        attachEventListeners();
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

        // Handle structured object messages (Media or Text with timestamp)
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
            // Legacy plain string messages
            contentDiv.textContent = msg;
        }

        div.appendChild(contentDiv);

        // Append timestamp if available
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

function attachEventListeners() {
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.onclick = () => {
            document.getElementById('app').classList.remove('show-chat');
        };
    }

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
            }
        };
    }
}

window.onload = initApp;
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(() => {}); }