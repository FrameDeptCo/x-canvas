# x-canvas

## 🎯 THE ACTUAL GOAL
**An Electron desktop app that syncs X.com bookmarks and displays them beautifully on an infinite, draggable canvas.**

Users can:
1. Login to X.com (auto-captures session cookie)
2. Click "Sync Bookmarks" to import ALL their real X.com bookmarks
3. See bookmark cards APPEAR on the canvas
4. Drag cards to organize them spatially
5. Zoom and pan the infinite canvas

**THIS IS NOT A PROTOTYPE - BOOKMARKS MUST ACTUALLY IMPORT AND DISPLAY**

## 🚫 CRITICAL REQUIREMENT
The app must:
- ✅ Accept user's existing X.com login (cookie already saved)
- ✅ Fetch bookmarks from user's real X.com account  
- ✅ Parse and extract all bookmark data
- ✅ Save to local IndexedDB
- ✅ **DISPLAY BOOKMARK CARDS ON THE CANVAS**

If bookmarks don't appear on screen after clicking Sync, the app is broken. No exceptions.

## 📁 Architecture
- **Electron main process** (public/main.cjs) - IPC handlers, X.com API calls
- **IPC bridge** (public/preload.cjs) - Secure renderer ↔ main communication
- **React app** (src/App.jsx) - Orchestrates login, sync, display
- **Infinite canvas** (src/components/InfiniteCanvas.jsx) - Konva Stage with zoom/pan
- **Bookmark cards** (src/components/BookmarkCard.jsx) - Individual bookmark rendering
- **Local storage** (src/db/bookmarkStore.js) - IndexedDB for persistence
- **Sync logic** (src/services/syncManager.js) - Orchestrates the fetch→save→display flow

## 🔄 The Sync Flow (Must Work End-to-End)
```
User clicks "Sync" 
  → fetch-bookmarks IPC handler called
  → Fetches from https://x.com/i/bookmarks 
  → Parses HTML for tweet data
  → Returns bookmarks array
  → syncManager validates positions
  → Saves to IndexedDB
  → App.handleSync loads from IndexedDB
  → InfiniteCanvas re-renders
  → BookmarkCard components render
  → Konva Stage displays cards
  → BOOKMARKS VISIBLE ON SCREEN ✓
```

## ❌ What's Broken
Bookmarks are NOT appearing on the canvas after sync. The debug process:
1. Check if fetch-bookmarks is called (console logs)
2. Check if bookmarks are returned
3. Check if saved to IndexedDB
4. Check if loaded back
5. Check if passed to InfiniteCanvas
6. Check if BookmarkCard renders
7. Check if Konva Stage renders
8. Check positions/visibility

## ⚠️ Current Issue
Loop until this is ACTUALLY working. Not "should work" - actually test and verify each step.
