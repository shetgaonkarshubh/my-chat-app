# Self Chat Space 💬

An offline-first, private personal messaging and organization workspace disguised as a modern chat app. 

Instead of messaging other people, **Self Chat Space** lets you message yourself to log thoughts, store notes, upload files and media, manage tasks, and organize conversations into structured folders—with an always-on, real-time cloud sync engine powered by **Supabase** (Free Tier).

---

## 🌟 Key Features

### 💬 Chat-Driven Note Taking
- **Familiar Chat UI**: Take notes, brainstorm ideas, log snippets, and organize thoughts in conversation threads just like WhatsApp or Telegram.
- **Rich Text & Multiline Support**: Use `Shift + Enter` for new lines, and `Enter` to send instantly.
- **Message Editing**: Edit any text message retroactively; edited messages show an `(edited)` timestamp tag.

### 📁 Folders & Room Management
- **Rooms / Channels**: Create dedicated chat rooms for different topics (e.g., *Ideas*, *Project Alpha*, *Quick Thoughts*).
- **Collapsible Folders**: Group related chat rooms into folders (e.g., *Work*, *Personal*, *Learning*) to keep your sidebar tidy.
- **Room Movement & Management**: Easily move rooms between folders, rename rooms or folders, or delete them when no longer needed.

### 📎 Media & File Storage
- **File Uploads**: Attach any file type—images, audio recordings, videos, PDFs, spreadsheets, Word documents, source code, and archives (`.zip`, `.tar.gz`).
- **File Previews**: Dedicated file attachment cards showing file extension badges, file size, custom file icons, and direct download buttons.
- **Media Previews**: Inline previews for images and videos with native playback controls for video and audio.
- **Clipboard Paste Support**: Directly paste images from your clipboard (`Ctrl + V` / `Cmd + V`) to upload them to the active room immediately.

### ⚡ Smart Multi-Tap & Gesture Controls
Interacting with messages is optimized for mobile and desktop:
- **Single Tap / Click**: Selects and highlights messages.
- **Double Tap / Double Click**: Opens the **Context Menu** with options to *✏️ Edit*, *☑️ Select*, or *🗑️ Delete*.
- **Triple Tap / Triple Click**: Instantly copies the message text or media URL to your clipboard with a confirmation toast.

### ☑️ Multi-Select & Batch Actions
- Enter selection mode via the context menu or multi-tap.
- Tap multiple messages to select them.
- Batch delete selected messages with one click.

### 📌 Integrated To-Do Checklist
- **Side Panel (Desktop)** & **Dedicated Tab (Mobile)**: Keep actionable tasks right beside your notes.
- Quick entry bar to add new items by pressing `Enter`.
- Check off completed items or delete finished tasks.
- Fully synchronized across your devices.

### ☁️ Real-Time Cloud Sync (Supabase Powered)
Sync your chats, folders, to-dos, and files across your phone and laptop 24/7 for free:
- **PostgreSQL + Row Level Security (RLS)**: Stores folders, rooms, messages, and to-dos as individual rows scoped strictly to your account (`auth.uid() = user_id`).
- **Private Media Storage**: Uploads images, videos, audio, and files to a private `self-chat-media` Supabase Storage bucket using signed URLs.
- **Instant Realtime Sync**: Uses Supabase Realtime WebSockets so messages and to-dos created on your phone appear on your laptop in under a second.
- **Offline-First**: Everything is cached locally in IndexedDB (`localforage`) and syncs automatically when you reconnect.

### 🎨 6 Aesthetic Color Themes
Easily switch between themes from the Settings (`⚙️`) modal:
1. **Classic**: Clean WhatsApp-style teal & crisp grey.
2. **Black & Crimson Red**: High-contrast dark theme with bold red accents.
3. **Light & Dark Blue**: Slate blue professional palette.
4. **Yellow & Orange**: Warm energetic tones.
5. **Pink & Deep Purple**: Creative vibrant violet and rose palette.
6. **Velvet OLED**: True pitch-black background with monochrome contrast for OLED screens.

### 📱 Responsive & PWA Ready
- **Desktop**: Three-column experience (Folders/Rooms Sidebar, Active Chat Area, and To-Do Panel).
- **Mobile**: Responsive layout featuring top navigation tabs (*💬 Chats* and *📌 To-Do List*) and full-screen chat with back navigation.
- **PWA (Progressive Web App)**: Installable to your mobile home screen or desktop via `manifest.json`.
- **Local Persistence**: Powered by `localforage` (IndexedDB fallback), ensuring your data remains accessible even when offline.

---

## 🏗️ Project Architecture & Tech Stack

This project is built with **zero external frameworks or bundlers** for minimal footprint and maximum longevity.

```
├── index.html            # Core HTML5 layout, UI modals, and structure
├── app.js                # Application logic, state management, GitHub sync engine
├── style.css             # Theme definitions, CSS variables, responsive grid/flexbox
├── localforage.min.js    # Client-side IndexedDB abstraction library
├── sw.js                 # Service Worker for offline asset caching
├── manifest.json         # PWA configuration for installation on iOS/Android
└── pages_config.json     # Cloudflare/GitHub Pages static deployment metadata
```

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3 with Custom Properties (Variables).
- **Typography**: Google Fonts (*JetBrains Mono* for code/monospaced details, *Plus Jakarta Sans* for clean UI text).
- **Local Database**: IndexedDB (via [localForage](https://localforage.github.io/localForage/)).
- **Cloud Backend**: GitHub REST API v3 (Contents API).

---

## 🗄️ Data Structure (`db.json`)

The state of your application is stored locally in IndexedDB and synchronized to `db.json` on GitHub with this structure:

```json
{
  "activeRoom": "General Stuff",
  "rooms": {
    "General Stuff": [
      {
        "id": "kw9s8x1abc",
        "type": "text",
        "text": "Meeting notes for today...",
        "timestamp": "10:15 AM",
        "updatedAt": 1700000000000,
        "edited": false
      },
      {
        "id": "kw9s8x2def",
        "type": "file",
        "fileName": "presentation.pdf",
        "fileSize": 2450000,
        "fileType": "application/pdf",
        "data": "https://raw.githubusercontent.com/.../media/1700000000000_presentation.pdf",
        "timestamp": "10:18 AM",
        "updatedAt": 1700000000000
      }
    ]
  },
  "folders": ["Work", "Projects"],
  "roomFolders": {
    "General Stuff": "Work"
  },
  "collapsedFolders": [],
  "todos": [
    {
      "id": "todo_123",
      "text": "Review project roadmap",
      "done": false,
      "updatedAt": 1700000000000
    }
  ],
  "deleted": [],
  "deletedFolders": [],
  "deletedTodos": []
}
```

---

## 🚀 Getting Started

### 1. Run Locally
Because Self Chat Space is a static web application, you do not need build steps or package managers. Simply serve the directory with any local HTTP server:

#### Using Python 3:
```bash
python3 -m http.server 8000
```
Then visit `http://localhost:8000` in your browser.

#### Using Node.js:
```bash
npx serve .
# or
npx http-server -p 8000
```

#### Using VS Code:
Right-click `index.html` and click **"Open with Live Server"**.

---

### 2. Configure Supabase Cloud Sync (Free Tier)

To sync your chats and files across devices (phone, laptop, tablet) 24/7:

1. **Create a Free Supabase Project**:
   - Go to [Supabase](https://supabase.com/) and create a new project.
2. **Initialize Tables, Realtime & Storage**:
   - Open your project's **SQL Editor** in the Supabase Dashboard.
   - Copy and run the entire contents of [`supabase_schema.sql`](supabase_schema.sql).
3. **Link in App Settings**:
   - Open Self Chat in your browser (or deploy it to GitHub Pages / Cloudflare Pages).
   - Click the gear icon (**⚙️**) in the sidebar header to open **App Settings**.
   - Paste your **Project URL** and **Anon Public Key** (from **Project Settings → API**).
   - Enter an email & password and click **Sign Up** on your first device (or **Sign In** on your second device).
   - Your existing local notes are automatically pushed on sign-up, and all future changes sync in real time!

---

## ⌨️ Shortcuts & Gestures Cheat Sheet

| Action | Shortcut / Gesture | Result |
|---|---|---|
| **Send Message** | `Enter` (inside chat input) | Sends text message immediately |
| **New Line** | `Shift + Enter` | Inserts a new line into the message textarea |
| **Paste Image** | `Ctrl + V` / `Cmd + V` | Automatically uploads image from clipboard to active chat |
| **Context Menu** | Double-tap / Double-click on message | Opens message action menu (*Edit*, *Select*, *Delete*) |
| **Quick Copy** | Triple-tap / Triple-click on message | Copies message text or media URL to clipboard with toast notification |
| **Select Message** | Click on message while in selection mode | Toggles message selection checkmark |
| **Add To-Do** | `Enter` (inside to-do input) | Appends task to the top of your checklist |

---

## 🔒 Privacy & Security

- **Self-Hosted Data**: All data resides strictly on your local browser (IndexedDB) and in your personal private GitHub repository.
- **No Third-Party Analytics**: Zero third-party trackers, telemetry, or external analytics scripts.
- **Token Storage**: Your GitHub Personal Access Token is saved only in browser `localStorage`. No intermediate servers or proxies ever touch your token or messages.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) (or Open Source). Feel free to adapt and customize it for your personal productivity workflow.
