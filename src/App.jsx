import React, { useEffect, useState } from 'react'
import { useAppStore } from './store/appState'
import { getLocalBookmarks, getLocalFolders, computeMasonryPositions } from './services/syncManager'
import { initDB, saveBookmarks } from './db/bookmarkStore'
import Header from './components/Header'
import InfiniteCanvas from './components/InfiniteCanvas'
import InfoPanel from './components/InfoPanel'
import LoginForm from './components/LoginForm'

function App() {
  const [bookmarks,      setBookmarks]      = useState([])
  const [folders,        setFolders]        = useState([])
  const [isInitialized,  setIsInitialized]  = useState(false)
  const [showLogin,      setShowLogin]      = useState(true)

  const selectedFolder      = useAppStore(s => s.selectedFolder)
  const setBookmarks_       = useAppStore(s => s.setBookmarks)
  const setFolders_         = useAppStore(s => s.setFolders)
  const selectedBookmark    = useAppStore(s => s.selectedBookmark)
  const clearSelected       = useAppStore(s => s.clearSelectedBookmark)
  const aspectRatios        = useAppStore(s => s.aspectRatios)

  const panelOpen = !!selectedBookmark

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        await initDB()
        const [localBMs, localFolders] = await Promise.all([
          getLocalBookmarks(),
          getLocalFolders(),
        ])
        setBookmarks(localBMs)
        setFolders(localFolders)
        setBookmarks_(localBMs)
        setFolders_(localFolders)

        // Check saved session
        let hasCookie = false
        if (window.api) {
          const c = await window.api.getSessionCookie()
          if (c) hasCookie = true
        } else {
          if (localStorage.getItem('x_session_cookie')) hasCookie = true
        }
        if (hasCookie) setShowLogin(false)
      } catch (err) {
        console.error('[App] init error:', err)
      } finally {
        setIsInitialized(true)
      }
    }
    init()
  }, [setBookmarks_, setFolders_])

  // ── After sync: reload bookmarks ──────────────────────────────────────────
  const handleSync = async () => {
    const [bms, flds] = await Promise.all([getLocalBookmarks(), getLocalFolders()])
    setBookmarks(bms)
    setFolders(flds)
    setBookmarks_(bms)
    setFolders_(flds)

    // Auto-arrange 3 seconds later when images have loaded and reported aspect ratios
    setTimeout(() => {
      handleArrange()
    }, 3000)
  }

  // ── Reset / arrange all bookmarks back into the masonry grid ─────────────
  const handleArrange = async () => {
    const bms = await getLocalBookmarks()
    const arranged = computeMasonryPositions(bms, window.innerWidth, aspectRatios)
    await saveBookmarks(arranged)
    setBookmarks(arranged)
    setBookmarks_(arranged)
  }

  // ── Folder filter ─────────────────────────────────────────────────────────
  const filteredBookmarks = selectedFolder === 'all'
    ? bookmarks
    : bookmarks.filter(b => b.folderId === selectedFolder)

  if (!isInitialized) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#333', fontSize: 13 }}>
      Loading…
    </div>
  )

  if (showLogin) return <LoginForm onSave={() => setShowLogin(false)} />

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a', overflow: 'hidden' }}>

      <Header
        folders={folders}
        onSync={handleSync}
        onLogin={() => setShowLogin(true)}
        onArrange={handleArrange}
        panelOpen={panelOpen}
      />

      {/* Canvas + panel side-by-side */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <InfiniteCanvas
            bookmarks={filteredBookmarks}
            panelOpen={panelOpen}
          />
        </div>

        {/* Info panel slides in from right */}
        {panelOpen && (
          <InfoPanel
            bookmark={selectedBookmark}
            onClose={clearSelected}
          />
        )}
      </div>

    </div>
  )
}

export default App
