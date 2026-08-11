cat << 'EOF' > app.js
let db = JSON.parse(localStorage.getItem('self_chat_db')) || { rooms: { "General Stuff": [] }, activeRoom: "General Stuff" };

function saveData() { 
    try {
        localStorage.setItem('self_chat_db', JSON.stringify(db)); 
    } catch (e) {
        alert("Storage Full! Local storage can only hold roughly 5MB of text/media before it cuts off.");
    }
}

function renderRooms() {
    const list = document.getElementById('room-list');
    list.innerHTML = '';
    Object.keys(db.rooms).forEach(roomName => {
        const li = document.createElement('li');
        li.textContent = roomName;
        if(roomName === db.activeRoom) li.classList.add('active');
        li.onclick = () => { db.activeRoom = roomName; saveData(); renderRooms(); renderMessages(); };
        list.appendChild(li);
    });
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    const title = document.getElementById('current-room-title');
    container.innerHTML = '';
    
    if(!db.activeRoom) { title.textContent = "Select a room"; return; }
    title.textContent = db.activeRoom;
    
    const messages = db.rooms[db.activeRoom] || [];
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.classList.add('message', 'sent');
        
        // Check if the message item is an object holding media data
        if (typeof msg === 'object' && msg.type === 'media') {
            if (msg.fileType.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = msg.data;
                img.style.maxWidth = '100%';
                img.style.borderRadius = '4px';
                div.appendChild(img);
            } else if (msg.fileType.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = msg.data;
                video.controls = true;
                video.style.maxWidth = '100%';
                video.style.borderRadius = '4px';
                div.appendChild(video);
            }
        } else {
            // Standard Text Message
            div.textContent = msg;
        }
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

// Media Attachment Mechanics
const mediaInput = document.getElementById('media-input');
document.getElementById('attach-btn').onclick = () => mediaInput.click();

mediaInput.onchange = () => {
    const file = mediaInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const mediaObj = {
            type: 'media',
            fileType: file.type,
            data: e.target.result // This is the Base64 file string
        };
        db.rooms[db.activeRoom].push(mediaObj);
        saveData();
        renderMessages();
    };
    reader.readAsDataURL(file);
    mediaInput.value = ''; // Reset input
};

document.getElementById('add-room-btn').onclick = () => {
    const name = prompt("Enter new chat category name:");
    if(name && !db.rooms[name]) { db.rooms[name] = []; db.activeRoom = name; saveData(); renderRooms(); renderMessages(); }
};

document.getElementById('message-form').onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if(text && db.activeRoom) { db.rooms[db.activeRoom].push(text); input.value = ''; saveData(); renderMessages(); }
};

renderRooms(); renderMessages();
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(() => {}); }
EOF
