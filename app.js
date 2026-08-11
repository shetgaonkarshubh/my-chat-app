let db = JSON.parse(localStorage.getItem('self_chat_db')) || { rooms: { "General Stuff": [] }, activeRoom: "General Stuff" };
function saveData() { localStorage.setItem('self_chat_db', JSON.stringify(db)); }
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
        div.textContent = msg;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}
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
