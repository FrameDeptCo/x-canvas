import React, { useEffect, useState } from 'react'
import { useAppStore } from './store/appState'
import { getLocalBookmarks, getLocalFolders, computeMasonryPositions } from './services/syncManager'
import { initDB, saveBookmarks } from './db/bookmarkStore'
import { isColorSimilar } from './utils/colorUtils'
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
  const activeFilters       = useAppStore(s => s.activeFilters)
  const bookmarkColors      = useAppStore(s => s.bookmarkColors)

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
    try {
      const bms = await getLocalBookmarks()
      console.log('[App] handleArrange - loaded', bms.length, 'bookmarks')
      console.log('[App] handleArrange - aspectRatios:', aspectRatios)

      // Account for info panel width (280px when open, 0 when closed)
      const panelW = panelOpen ? 280 : 0
      const vw = window.innerWidth - panelW

      const arranged = computeMasonryPositions(bms, vw, aspectRatios)
      console.log('[App] handleArrange - arranged first 3:', arranged.slice(0, 3).map(b => ({ id: b.id, pos: b.position })))

      await saveBookmarks(arranged)
      console.log('[App] handleArrange - saved to DB')

      setBookmarks(arranged)
      setBookmarks_(arranged)
      console.log('[App] handleArrange - state updated')
    } catch (error) {
      console.error('[App] handleArrange error:', error)
    }
  }

  // ── Filters (folder + color + others) ─────────────────────────────────────
  const filteredBookmarks = bookmarks.filter(b => {
    // Folder filter
    if (selectedFolder !== 'all' && b.folderId !== selectedFolder) return false

    // Color filter
    if (activeFilters.color) {
      const bColor = bookmarkColors[b.id]
      if (!bColor || !isColorSimilar(bColor, activeFilters.color)) return false
    }

    // Tag filter (future)
    if (activeFilters.tags.length > 0) {
      // TODO: implement when bookmarks have tags
    }

    // Type filter (future - filter by image/video/text)
    if (activeFilters.types.length > 0) {
      // TODO: implement when we track bookmark types
    }

    return true
  })

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
