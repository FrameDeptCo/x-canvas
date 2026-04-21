# x-canvas

An infinite canvas app for organizing and visualizing X.com (Twitter) bookmarks.

## Features

- 🔗 **OAuth 2.0 Authentication** - Secure login with X.com
- 📥 **Sync Bookmarks** - Fetch all your bookmarks from X.com
- 🎨 **Infinite Canvas** - Free-form organization with zoom and pan
- 🏷️ **Folder Organization** - Organize bookmarks into custom folders
- 🖼️ **Rich Preview** - See tweet text, author info, and thumbnails
- 💾 **Local Storage** - All bookmarks stored locally with IndexedDB

## Quick Start

### Prerequisites
- Node.js 16+ and npm

### Installation

1. Clone the repo:
```bash
git clone <repo-url>
cd x-canvas
```

2. Install dependencies:
```bash
npm install
```

3. Set up X.com API credentials:
   - Go to [X.com Developer Portal](https://developer.twitter.com/en/portal/dashboard)
   - Create an app (if you haven't already)
   - Generate API credentials
   - Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
VITE_X_CLIENT_ID=your_client_id
VITE_X_CLIENT_SECRET=your_client_secret
VITE_X_REDIRECT_URI=http://localhost:5173/callback
```

### Running

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Building

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Usage

1. **Login** - Click "Login & Sync" button to authenticate with X.com
2. **Sync** - After login, click "Sync Bookmarks" to fetch all your bookmarks
3. **Explore** - Bookmarks appear on the canvas. Use mouse wheel to zoom and drag to pan
4. **Organize** - Drag bookmark cards to reposition them on the canvas
5. **Filter** - Use the folder dropdown to show specific folders or all bookmarks

## Architecture

```
src/
├── components/        # React components
│   ├── InfiniteCanvas.jsx   # Konva-based canvas
│   ├── BookmarkCard.jsx     # Individual bookmark cards
│   └── Header.jsx           # UI controls
├── services/          # External integrations
│   ├── xTwitterAuth.js      # OAuth handler
│   ├── xTwitterApi.js       # X.com API client
│   └── syncManager.js       # Bookmark sync logic
├── db/               # Database layer
│   └── bookmarkStore.js     # IndexedDB wrapper
├── store/            # State management
│   └── appState.js         # Zustand store
└── App.jsx           # Root component
```

## Technologies

- **React 18** - UI framework
- **Vite** - Build tool
- **Konva.js** - Canvas rendering
- **IndexedDB** - Local data storage
- **Zustand** - State management
- **X.com API v2** - Bookmark data

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_X_CLIENT_ID` | X.com OAuth client ID |
| `VITE_X_CLIENT_SECRET` | X.com OAuth client secret |
| `VITE_X_REDIRECT_URI` | OAuth callback URL (default: http://localhost:5173/callback) |

## License

MIT
