import React, { useState } from 'react'
import { useAppStore } from '../store/appState'
import { syncBookmarks } from '../services/syncManager'
import './Header.css'

// ── SVG icons ────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 14, ...p }) => (
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" {...p}>
    <path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const FILTER_CHIPS = [
  { id: 'color',  label: 'Color',  icon: <span className="chip-dot" /> },
  { id: 'tags',   label: 'Tags',   icon: <span className="chip-icon">🏷</span> },
  { id: 'folder', label: 'Folder', icon: <span className="chip-icon">📁</span> },
  { id: 'shape',  label: 'Shape',  icon: <span className="chip-icon">◇</span> },
  { id: 'rating', label: 'Rating', icon: <span className="chip-icon">★</span> },
  { id: 'types',  label: 'Types',  icon: <span className="chip-icon">≡</span> },
]

export default function Header({ folders, onSync, onLogin, onArrange, panelOpen }) {
  const [syncStatus, setSyncStatus] = useState('')
  const [isSyncing,  setIsSyncing]  = useState(false)
  const [search,     setSearch]     = useState('')
  const [activeChip, setActiveChip] = useState(null)

  const canvasZoom           = useAppStore(s => s.canvasZoom)
  const setCanvasZoom        = useAppStore(s => s.setCanvasZoom)
  const setCanvasZoomCentered = useAppStore(s => s.setCanvasZoomCentered)
  const selectedFolder       = useAppStore(s => s.selectedFolder)
  const setSelectedFolder    = useAppStore(s => s.setSelectedFolder)

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncStatus('Syncing…')
    try {
      await syncBookmarks(setSyncStatus)
      setSyncStatus('Done')
      onSync?.()
      setTimeout(() => setSyncStatus(''), 2500)
    } catch (e) {
      setSyncStatus(`Error: ${e.message}`)
    } finally {
      setIsSyncing(false)
    }
  }

  // Zoom: slider maps 0–100 → zoom 0.25–2.0 (from viewport center)
  const HEADER_H = 74
  const sliderVal = Math.round(((canvasZoom - 0.25) / 1.75) * 100)
  const onSlider  = (e) => {
    const pct  = Number(e.target.value) / 100
    const zoom = 0.25 + pct * 1.75
    const newZoom = Math.round(zoom * 100) / 100
    const vw = window.innerWidth - (panelOpen ? 280 : 0)
    const vh = window.innerHeight - HEADER_H
    setCanvasZoomCentered(newZoom, vw, vh)
  }
  const zoomIn  = () => {
    const newZoom = Math.min(5, Math.round((canvasZoom + 0.15) * 100) / 100)
    const vw = window.innerWidth - (panelOpen ? 280 : 0)
    const vh = window.innerHeight - HEADER_H
    setCanvasZoomCentered(newZoom, vw, vh)
  }
  const zoomOut = () => {
    const newZoom = Math.max(0.15, Math.round((canvasZoom - 0.15) * 100) / 100)
    const vw = window.innerWidth - (panelOpen ? 280 : 0)
    const vh = window.innerHeight - HEADER_H
    setCanvasZoomCentered(newZoom, vw, vh)
  }

  // Folder filter chip
  const handleChip = (chipId) => {
    if (chipId === activeChip) {
      setActiveChip(null)
    } else {
      setActiveChip(chipId)
    }
  }

  return (
    <header className="header">

      {/* ── Row 1: navigation bar ── */}
      <div className="nav-row">

        {/* Left group */}
        <div className="nav-left">
          {/* Sidebar toggle (decorative for now) */}
          <button className="nav-icon-btn" title="Toggle sidebar">
            <svg width="15" height="12" viewBox="0 0 15 12" fill="none">
              <rect x="0" y="0"  width="15" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="0" y="5"  width="15" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="0" y="10" width="15" height="1.5" rx="0.75" fill="currentColor"/>
            </svg>
          </button>

          <button className="nav-icon-btn" title="Back" style={{ opacity: 0.4 }}>
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
              <path d="M6 1L1 6l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button className="nav-icon-btn" title="Forward" style={{ opacity: 0.4 }}>
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
              <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <span className="nav-title">x-canvas</span>
        </div>

        {/* Center: zoom slider */}
        <div className="nav-center">
          <button className="zoom-btn" onClick={zoomOut} title="Zoom out">
            <svg width="12" height="2" viewBox="0 0 12 2">
              <rect x="0" y="0" width="12" height="2" rx="1" fill="currentColor"/>
            </svg>
          </button>

          <div className="zoom-track">
            <input
              type="range"
              min="0" max="100"
              value={sliderVal}
              onChange={onSlider}
              className="zoom-slider"
            />
          </div>

          <button className="zoom-btn" onClick={zoomIn} title="Zoom in">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="0" y="5" width="12" height="2" rx="1" fill="currentColor"/>
              <rect x="5" y="0" width="2" height="12" rx="1" fill="currentColor"/>
            </svg>
          </button>
        </div>

        {/* Right group */}
        <div className="nav-right">
          {/* Sync */}
          <button
            className={`nav-icon-btn nav-sync${isSyncing ? ' spinning' : ''}`}
            onClick={handleSync}
            disabled={isSyncing}
            title="Sync bookmarks"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M12 7A5 5 0 1 1 7 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M7 2l2.5 2.5L7 2 4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {syncStatus && <span className="nav-status">{syncStatus}</span>}

          {/* Reset grid */}
          <button className="nav-icon-btn" onClick={onArrange} title="Reset grid layout">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          </button>

          {/* Filter toggle */}
          <button className="nav-icon-btn" title="Filter">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3h10M4 7h6M6 11h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Search */}
          <div className="nav-search">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: '#555' }}>
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="nav-search-input"
            />
          </div>

          {/* Login / account */}
          <button className="nav-icon-btn" onClick={onLogin} title="Account">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M2 12.5c0-2.485 2.239-4.5 5-4.5s5 2.015 5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Row 2: filter chips ── */}
      <div className="filter-row">
        {FILTER_CHIPS.map(chip => (
          <button
            key={chip.id}
            className={`filter-chip${activeChip === chip.id ? ' active' : ''}`}
            onClick={() => handleChip(chip.id)}
          >
            {chip.icon}
            {chip.label}
          </button>
        ))}

        {/* Folder filter — functional */}
        {folders.length > 0 && (
          <select
            className="filter-select"
            value={selectedFolder}
            onChange={e => setSelectedFolder(e.target.value)}
          >
            <option value="all">All Folders</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        )}

        <button className="filter-chip filter-chip--add" title="Add filter">+</button>
      </div>

    </header>
  )
}
