import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from './store/appState'
import { getLocalBookmarks, getLocalFolders, computeMasonryPositions } from './services/syncManager'
import { initDB, saveBookmarks } from './db/bookmarkStore'
import { isColorSimilar } from './utils/colorUtils'
import HUD from './components/HUD'
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
  const bumpGridResetKey    = useAppStore(s => s.bumpGridResetKey)

  const panelOpen = !!selectedBookmark
  const arrangeTimerRef = useRef(null)
  // Track how many aspect ratios we've already arranged at, to avoid re-running unnecessarily
  const lastArrangedCountRef = useRef(0)

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
    lastArrangedCountRef.current = 0  // reset so auto-arrange kicks in fresh
  }

  // ── Core arrange logic — shared by auto-arrange + manual reset button ─────
  const arrangeNow = async (ratios) => {
    try {
      const allBms = await getLocalBookmarks()
      const bms = allBms.filter(b => b.thumbnail || b.videoUrl)
      const panelW = panelOpen ? 280 : 0
      const vw = window.innerWidth - panelW
      const arranged = computeMasonryPositions(bms, vw, ratios)
      await saveBookmarks(arranged)
      const posMap = Object.fromEntries(arranged.map(b => [b.id, b.position]))
      const merged = allBms.map(b => posMap[b.id] ? { ...b, position: posMap[b.id] } : b)
      setBookmarks(merged)
      setBookmarks_(merged)
      lastArrangedCountRef.current = Object.keys(ratios).length
      console.log(`[App] auto-arrange complete — ${arranged.length} cards, ${Object.keys(ratios).length} ratios known`)
    } catch (err) {
      console.error('[App] arrangeNow error:', err)
    }
  }

  // ── Auto-arrange: fires whenever a new aspect ratio is learned ─────────────
  // Debounced 600ms so rapid image loads batch into one arrange pass.
  useEffect(() => {
    const count = Object.keys(aspectRatios).length
    if (count === 0) return
    if (count === lastArrangedCountRef.current) return  // nothing new
    clearTimeout(arrangeTimerRef.current)
    arrangeTimerRef.current = setTimeout(() => {
      arrangeNow(aspectRatios)
    }, 600)
    return () => clearTimeout(arrangeTimerRef.current)
  }, [aspectRatios])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Manual reset grid button ──────────────────────────────────────────────
  const handleArrange = () => {
    lastArrangedCountRef.current = 0
    bumpGridResetKey()
    arrangeNow(aspectRatios)
  }

  // ── Remix: shuffle order, repack into grid ────────────────────────────────
  const handleRemix = async () => {
    try {
      const allBms = await getLocalBookmarks()
      const bms = allBms.filter(b => b.thumbnail || b.videoUrl)
      // Fisher-Yates shuffle
      for (let i = bms.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bms[i], bms[j]] = [bms[j], bms[i]]
      }
      const panelW = panelOpen ? 280 : 0
      const vw = window.innerWidth - panelW
      const arranged = computeMasonryPositions(bms, vw, aspectRatios)
      await saveBookmarks(arranged)
      const posMap = Object.fromEntries(arranged.map(b => [b.id, b.position]))
      const merged = allBms.map(b => posMap[b.id] ? { ...b, position: posMap[b.id] } : b)
      setBookmarks(merged)
      setBookmarks_(merged)
      bumpGridResetKey()
    } catch (err) {
      console.error('[App] remix error:', err)
    }
  }

  // ── Filters (folder + color + others) ─────────────────────────────────────
  const filteredBookmarks = bookmarks.filter(b => {
    // Media-only: skip text-only bookmarks (no image or video)
    if (!b.thumbnail && !b.videoUrl) return false

    // Folder filter
    if (selectedFolder !== 'all' && b.folderId !== selectedFolder) return false

    // Color filter — threshold 60 gives good coverage for both swatch clicks and custom picker
    if (activeFilters.color) {
      const bColor = bookmarkColors[b.id]
      if (!bColor || !isColorSimilar(bColor, activeFilters.color, 60)) return false
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
    <div style={{ height: '100vh', position: 'relative', background: '#0a0a0a', overflow: 'hidden', display: 'flex' }}>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <InfiniteCanvas
          bookmarks={filteredBookmarks}
          panelOpen={panelOpen}
        />
        <HUD
          onSync={handleSync}
          onArrange={handleArrange}
          onRemix={handleRemix}
          panelOpen={panelOpen}
        />
        {/* Frameless window drag zone — Electron only, invisible strip at very top */}
        {window.api && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 14,
            WebkitAppRegion: 'drag',
            pointerEvents: 'none',
            zIndex: 25,
          }} />
        )}
      </div>

      {panelOpen && (
        <InfoPanel
          bookmark={selectedBookmark}
          onClose={clearSelected}
        />
      )}

    </div>
  )
}

export default App
