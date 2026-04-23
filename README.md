# x-canvas

An Electron desktop app that syncs your X.com bookmarks **& likes** and displays them beautifully on an infinite, draggable canvas.

## Features

- 🔖 **Sync Bookmarks** — Import all your X.com bookmarks onto the canvas
- ❤️ **Import Likes** — Crawl your likes page and bring all liked media to the canvas
- 🎨 **Infinite Canvas** — Free-form spatial organization with zoom and pan
- 🖱️ **Drag to Organize** — Reposition any card anywhere on the canvas
- 🖼️ **Rich Previews** — Images, videos, author info, and tweet text
- 🔀 **Remix / Shuffle** — Randomly repack the grid layout
- 💾 **Local Storage** — Everything stored locally via IndexedDB, no server needed

## Quick Start

### Prerequisites
- Node.js 18+ and npm

### Installation

```bash
git clone https://github.com/FrameDeptCo/x-canvas.git
cd x-canvas
npm install
```

### Running

```bash
npm run dev
```

This starts both the Vite dev server and the Electron app together.

### Building

```bash
npm run build
```

## Usage

### Login
Click **Login to X.com** — a browser window opens for you to log in. The app captures your session cookie automatically once you're logged in.

### Sync Bookmarks 🔖
Click the **bookmark icon** in the top-right HUD. The app fetches all your X.com bookmarks via the GraphQL API and displays them as cards on the canvas.

### Import Likes ❤️
Click the **heart icon** in the top-right HUD. On first use, you'll be prompted for your `@handle`. The app then:
1. Opens a hidden browser window and loads your `x.com/{handle}/likes` page
2. Scrolls through it automatically to capture all your liked tweets
3. Saves any liked tweets with images or videos directly to your canvas

> **Note:** X.com made likes private in 2024, so this works by crawling your own likes page using your active session — no public API needed.

### Canvas Controls
- **Scroll** — Zoom in/out
- **Drag on background** — Pan the canvas
- **Right-click drag** — Pan from anywhere (including over cards)
- **Drag a card** — Reposition it
- **Grid icon** — Reset to masonry layout
- **Shuffle icon** — Remix / randomize the layout

## Architecture

```
public/
├── main.cjs          # Electron main process — IPC handlers, X.com API calls
└── preload.cjs       # IPC bridge between renderer and main

src/
├── components/
│   ├── HUD.jsx             # Floating controls (sync, likes, zoom, grid)
│   ├── InfiniteCanvas.jsx  # Konva Stage — infinite zoom/pan canvas
│   ├── BookmarkCard.jsx    # Individual tweet cards
│   └── InfoPanel.jsx       # Side panel with tweet details
├── services/
│   └── syncManager.js      # Bookmark + likes sync orchestration
├── db/
│   └── bookmarkStore.js    # IndexedDB wrapper
├── store/
│   └── appState.js         # Zustand global state
└── App.jsx                 # Root component
```

## Technologies

- **Electron** — Desktop shell
- **React 18** — UI
- **Vite** — Build tool
- **Konva.js / react-konva** — Canvas rendering
- **IndexedDB (idb)** — Local persistence
- **Zustand** — State management

## License

MIT
