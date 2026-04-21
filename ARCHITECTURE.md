# x-canvas Architecture & Bookmark Sync Workflow

## Overview

x-canvas is an Electron desktop app that syncs X.com bookmarks and displays them on an infinite, draggable Konva canvas. This document explains the full architecture, the bookmark sync mechanism, and what to know before making changes.

---

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron 30 |
| Frontend | React + Vite |
| Canvas | react-konva (Konva.js) |
| Local storage | IndexedDB via `idb` |
| Persistent settings | electron-store |
| State management | Zustand (`src/store/appState.js`) |

---

## File Map

```
public/
  main.cjs          ← Electron main process (IPC handlers, API calls, session management)
  preload.cjs       ← Secure IPC bridge (exposes window.api to renderer)

src/
  App.jsx           ← Root component — login gate, sync trigger, canvas render
  store/
    appState.js     ← Zustand store (zoom, pan, selected folder, bookmarks)
  services/
    syncManager.js  ← Orchestrates fetch→validate→save→return flow
    xTwitterApi.js  ← (legacy, not used in current sync flow)
    xTwitterAuth.js ← (legacy OAuth, not used in current sync flow)
  components/
    Header.jsx      ← Sync button, folder selector, login button
    InfiniteCanvas.jsx ← Konva Stage with zoom/pan, renders BookmarkCard per bookmark
    BookmarkCard.jsx   ← Individual Konva card (drag-to-reposition, saves to IndexedDB)
    LoginForm.jsx   ← Login UI (opens X.com window or accepts manual cookie paste)
  db/
    bookmarkStore.js ← IndexedDB wrapper (get/save bookmarks, folders, positions)
```

---

## The Bookmark Sync Flow (End-to-End)

```
User clicks "Sync Bookmarks"
  │
  ▼
Header.handleSync()
  → syncManager.syncBookmarks(onProgress)
      → window.api.getSessionCookie()         [IPC: get-session-cookie]
      → window.api.fetchBookmarks(cookie)     [IPC: fetch-bookmarks]
          │
          ▼ (Electron main process)
          ensureBearerToken(sess)
            → if no bearer token yet:
                captureBookmarksFromPage(sess)
                  → opens hidden BrowserWindow loading x.com/i/bookmarks
                  → webRequest.onBeforeSendHeaders captures "Authorization: Bearer ..."
                  → webRequest.onCompleted captures Bookmarks GraphQL query ID from URL
                  → closes window after 1s, returns
          │
          discoverQueryId(sess, cookieStr, bearerToken)
            → fetches x.com homepage HTML
            → finds abs.twimg.com JS bundle URLs
            → downloads bundles, regex-searches for queryId:"...","operationName":"Bookmarks"
          │
          tries query IDs in order:
            1. capturedQueryId  (intercepted from real page load — most reliable)
            2. discoveredId     (extracted from JS bundle)
            3. "Fy0QMy4q_aZCpkO0PnyLYw"  (known fallback)
            4. "HuTx74BxAnezK1D2HLp9-A"  (known fallback)
            5. "Uv_m_cBXJL1lVXcgX0-u8Q"  (known fallback)
          │
          fetchBookmarksGraphQL(sess, queryId, cookieStr, ct0, bearerToken)
            → POST https://x.com/i/api/graphql/{queryId}/Bookmarks
            → parses JSON → parseGraphQLBookmarks(data)
          │
          if GraphQL fails → fetchBookmarksV2(sess, cookieStr, ct0, bearerToken)
            → GET https://x.com/i/api/2/timeline/bookmark.json?count=100
            → parses JSON → parseV2Bookmarks(data)
          │
          returns { success, data: { bookmarks[], collections[] } }
      │
      syncManager validates positions (ensures x,y are numbers)
      → saveBookmarks(validatedBookmarks)    [IndexedDB]
      → saveFolder(...)                       [IndexedDB]
      → returns validatedBookmarks
  │
  App.handleSync()
    → getLocalBookmarks()                    [IndexedDB]
    → setBookmarks(local)                    [React state]
  │
  InfiniteCanvas re-renders
    → bookmarks.map(b => <BookmarkCard key={b.id} bookmark={b} />)
  │
  Cards appear on canvas ✓
```

---

## Why X.com API Is Tricky

X.com uses an internal GraphQL API — **not a public API**. Three things make it fragile:

### 1. GraphQL Query IDs rotate
X.com's GraphQL operations use a hash-based `queryId` (e.g. `Fy0QMy4q_aZCpkO0PnyLYw`) that changes whenever they redeploy their frontend. There's no stable endpoint — the ID is embedded in their minified JS bundles.

**Our solution:** Three-layer query ID acquisition:
1. **Page interception** — load `x.com/i/bookmarks` in a hidden window; X.com's own JS makes the real API call; we capture the queryId from that request URL via `session.webRequest.onBeforeSendHeaders`
2. **JS bundle scanning** — fetch `x.com` homepage, find `abs.twimg.com` script URLs, download and regex-search for `queryId:"...","operationName":"Bookmarks"`
3. **Hardcoded fallbacks** — known recent query IDs tried in sequence

### 2. Bearer token required
Every X.com API request needs `Authorization: Bearer <token>`. This token is embedded in their JS and changes with deployments. **We capture it from real network requests** via `session.webRequest.onBeforeSendHeaders` — the same token X.com's own page uses.

### 3. ct0 cookie = CSRF token
The `ct0` cookie value must also be sent as the `x-csrf-token` header. It's extracted from the stored session cookie string.

---

## Authentication Flow

```
LoginForm → "Login with X.com" button
  → window.api.openLoginWindow()               [IPC: open-login-window]
  → Electron opens BrowserWindow at x.com/i/flow/login
  → User logs in normally in that window
  → Every 1s: check session.cookies.get({ url: "https://x.com" })
  → When auth_token + ct0 found:
      → save full cookie string to electron-store ("sessionCookie")
      → close login window
      → resolve { success: true, cookie }
  → LoginForm calls onSave() → App hides login screen → shows canvas
```

Session cookies persist in `electron-store` across app restarts. On startup, `App.jsx` calls `window.api.getSessionCookie()` — if a cookie exists, it skips the login screen.

---

## Canvas System

- **Zoom**: mouse wheel, clamped to 0.1–10×
- **Pan**: click-drag on empty canvas area
- **Card drag**: each `BookmarkCard` is a Konva `Group` with `draggable=true`; on `dragEnd`, saves new x/y to IndexedDB via `updateBookmarkPosition()`
- **Card positions**: stored per-bookmark in IndexedDB; on first sync, cards are laid out in a 5-column grid: `x = (idx % 5) * 380 + 50`, `y = Math.floor(idx / 5) * 250 + 50`

---

## IPC Bridge (preload.cjs → window.api)

| Method | IPC channel | What it does |
|---|---|---|
| `getSessionCookie()` | `get-session-cookie` | Reads stored cookie from electron-store |
| `setSessionCookie(c)` | `set-session-cookie` | Saves cookie to electron-store |
| `openLoginWindow()` | `open-login-window` | Opens X.com login window, resolves when logged in |
| `fetchBookmarks(c)` | `fetch-bookmarks` | Full bookmark fetch (see flow above) |
| `logout()` | `logout` | Deletes cookie from electron-store |

---

## GraphQL Request Shape

```js
POST https://x.com/i/api/graphql/{queryId}/Bookmarks
Content-Type: application/json
Authorization: Bearer {capturedBearerToken}
x-csrf-token: {ct0}
x-twitter-active-user: yes
x-twitter-auth-type: OAuth2Session
x-twitter-client-language: en
Cookie: {full cookie string}
Referer: https://x.com/i/bookmarks
Origin: https://x.com

Body:
{
  "variables": {
    "count": 100,
    "includePromotedContent": false,
    "withBirdwatchNotes": false,
    "withClientEventToken": false,
    "withVoice": true,
    "withV2Timeline": true,
    "cursor": null
  },
  "features": { ... }
}
```

### Response parsing path
```
data.bookmark_timeline_v2.timeline.instructions[]
  → entries[]
    → content.itemContent.tweet_results.result      (single tweet)
    → content.items[].item.itemContent.tweet_results.result  (module/grouped)
      → legacy.full_text           tweet text
      → legacy.id_str              tweet ID
      → legacy.created_at          date
      → core.user_results.result.legacy.screen_name  @handle
      → core.user_results.result.legacy.name         display name
      → core.user_results.result.legacy.profile_image_url_https
      → extended_entities.media[0].media_url_https   thumbnail
```

---

## Common Issues & Fixes

| Symptom | Cause | Fix |
|---|---|---|
| `{"message":"Query not found"}` (404) | Stale hardcoded query ID | Page interception + JS bundle scan finds the current one automatically |
| `Unexpected end of JSON input` | Response gzipped / empty | Added `.text()` logging; v2 API may return empty for some accounts |
| Cards all stack at 0,0 | Position `0` is a valid number so validation didn't spread them | Grid layout assigned in `parseGraphQLBookmarks` using `idx % 5` |
| Bearer token missing | No X.com page loaded yet | `ensureBearerToken` loads `x.com/i/bookmarks` in hidden window to trigger real API calls |
| Login skipped on restart | Cookie already in electron-store | `App.jsx` checks `getSessionCookie()` on init and hides login if found |

---

## Dev Workflow

```bash
npm run dev        # starts Vite + Electron together (via dev.cjs)
npm run build      # vite build + electron-builder
```

Electron DevTools open automatically in dev mode. All `[Electron]` logs appear in the **terminal** (main process stdout). React/canvas logs appear in the **DevTools console** (renderer process).

---

## What NOT to Break

- `session: electronSession.defaultSession` on the login window — must match the main window's session so cookies are shared
- `webRequest.onBeforeSendHeaders` is set on `app.on("ready")` — must stay global so it captures tokens from all windows
- `session.fetch()` (Electron 25+) is used instead of `axios` or Node `https` because it uses Chromium's network stack, bypassing CORS and using the session's certificate store
- Card positions are saved to IndexedDB on `dragEnd` — don't wipe IndexedDB on every sync or users lose their layout
