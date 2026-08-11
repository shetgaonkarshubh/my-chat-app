// Initialize empty memory state structure
let db = { rooms: { "General Stuff": [] }, activeRoom: "General Stuff" };

// Fetch data from high-capacity phone storage (IndexedDB)
localforage.getItem('self_chat_db').then((savedData) => {
    if (savedData) {
        db = savedData;
    }
    renderRooms(); 
    renderMessages();
}).catch(() => {
    renderRooms(); 
    renderMessages();
});

function saveData() { 
    localforage.setItem('self_chat_db', db).catch((err) => {
        alert("Database write error encountered: " + err);
    });
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
        };
        list.appendChild(li);
    });
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    const title = document.getElementById('current-room-title');
    if (!container || !title) return;
    container.innerHTML = '';
    
    if(!db.activeRoom) { 
        title.textContent = "Select a room"; 
        return; 
    }
    
    title.textContent = db.activeRoom;
    const messages = db.rooms[db.activeRoom] || [];
    
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.classList.add('message', 'sent');
        
        if (msg && typeof msg === 'object' && msg.type === 'media') {
            if (msg.fileType && msg.fileType.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = msg.data;
                img.style.maxWidth = '100%';
                img.style.borderRadius = '4px';
                div.appendChild(img);
            } else if (msg.fileType && msg.fileType.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = msg.data;
                video.controls = true;
                video.style.maxWidth = '100%';
                video.style.borderRadius = '4px';
                div.appendChild(video);
            }
        } else {
            div.textContent = typeof msg === 'object' ? JSON.stringify(msg) : msg;
        }
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

const addRoomBtn = document.getElementById('add-room-btn');
if (addRoomBtn) {
    addRoomBtn.onclick = () => {
        const name = prompt("Enter new chat category name:");
        if(name && !db.rooms[name]) { 
            db.rooms[name] = []; 
            db.activeRoom = name; 
            saveData(); 
            renderRooms(); 
            renderMessages(); 
        }
    };
}

const mediaInput = document.getElementById('media-input');
const attachBtn = document.getElementById('attach-btn');
if (attachBtn && mediaInput) {
    attachBtn.onclick = () => mediaInput.click();
    mediaInput.onchange = () => {
        const file = mediaInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const mediaObj = {
                type: 'media',
                fileType: file.type,
                data: e.target.result
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
        const input = document.getElementById('message-input');
        if (!input) return;
        const text = input.value.trim();
        if(text && db.activeRoom) { 
            if (!db.rooms[db.activeRoom]) db.rooms[db.activeRoom] = [];
            db.rooms[db.activeRoom].push(text); 
            input.value = ''; 
            saveData(); 
            renderMessages(); 
        }
    };
}

if ('serviceWorker' in navigator) { 
    navigator.serviceWorker.register('sw.js').catch(() => {}); 
}
