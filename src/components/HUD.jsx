import React, { useState, useRef } from 'react'
import { useAppStore } from '../store/appState'
import { syncBookmarks, migrateLikesToBookmarks } from '../services/syncManager'

const btn = {
  background: 'rgba(20,20,20,0.75)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#888',
  borderRadius: 7,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  flexShrink: 0,
  transition: 'color 120ms, background 120ms',
}

const HudBtn = ({ onClick, title, disabled, spinning, children }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    style={{ ...btn, ...(disabled ? { cursor: 'not-allowed', opacity: 0.4 } : {}) }}
    onMouseEnter={e => { e.currentTarget.style.color = '#ddd'; e.currentTarget.style.background = 'rgba(40,40,40,0.85)' }}
    onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = 'rgba(20,20,20,0.75)' }}
  >
    <span style={spinning ? { display: 'inline-flex', animation: 'hud-spin 0.8s linear infinite' } : {}}>
      {children}
    </span>
  </button>
)

// ── Window traffic-light button ───────────────────────────────────────────────
const TrafficBtn = ({ color, hoverColor, onClick, title, icon }) => {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 12, height: 12, borderRadius: '50%',
        background: hov ? hoverColor : color,
        border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'background 100ms',
        WebkitAppRegion: 'no-drag',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {hov && icon}
    </button>
  )
}

export default function HUD({ onSync, onArrange, onRemix, panelOpen }) {
  const [isSyncing,          setIsSyncing]          = useState(false)
  const [syncStatus,         setSyncStatus]         = useState('')
  const [isMigrating,        setIsMigrating]        = useState(false)
  const [migrateStatus,      setMigrateStatus]      = useState('')
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false)
  const [usernameInput,      setUsernameInput]      = useState('')

  const canvasZoom             = useAppStore(s => s.canvasZoom)
  const setCanvasZoomCentered  = useAppStore(s => s.setCanvasZoomCentered)

  // Folder filter
  const folders            = useAppStore(s => s.folders)
  const selectedFolder     = useAppStore(s => s.selectedFolder)
  const setSelectedFolder  = useAppStore(s => s.setSelectedFolder)

  // Color filter
  const bookmarkColors = useAppStore(s => s.bookmarkColors)
  const activeFilters  = useAppStore(s => s.activeFilters)
  const setColorFilter = useAppStore(s => s.setColorFilter)

  // Top-8 most-frequent dominant colors across all cards
  const colorCounts = {}
  for (const c of Object.values(bookmarkColors)) {
    colorCounts[c] = (colorCounts[c] || 0) + 1
  }
  const paletteColors = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([c]) => c)

  // Is the active color a manual pick (not one of the auto-extracted swatches)?
  const isCustomColor = !!(activeFilters.color && !paletteColors.includes(activeFilters.color))

  // Non-default folders — determines whether the folder dropdown is shown
  const nonDefaultFolders = folders.filter(f => f.id !== 'default')

  // Ref for the hidden <input type="color"> that backs the custom picker button
  const colorInputRef = useRef(null)

  const HEADER_H = 0
  const vw = () => window.innerWidth - (panelOpen ? 280 : 0)
  const vh = () => window.innerHeight - HEADER_H

  const sliderVal = Math.round(((canvasZoom - 0.25) / 1.75) * 100)

  const zoomTo   = (z) => setCanvasZoomCentered(Math.max(0.15, Math.min(5, Math.round(z * 100) / 100)), vw(), vh())
  const zoomIn   = () => zoomTo(canvasZoom + 0.15)
  const zoomOut  = () => zoomTo(canvasZoom - 0.15)
  const onSlider = (e) => { zoomTo(0.25 + (Number(e.target.value) / 100) * 1.75) }

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncStatus('Syncing…')
    try {
      await syncBookmarks(setSyncStatus)
      setSyncStatus('Done')
      onSync?.()
      setTimeout(() => setSyncStatus(''), 2500)
    } catch {
      setSyncStatus('Error')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleMigrate = () => {
    const saved = localStorage.getItem('x_username')
    if (saved) runMigration(saved)
    else setShowUsernamePrompt(true)
  }

  const runMigration = async (username) => {
    const clean = username.replace(/^@/, '').trim()
    localStorage.setItem('x_username', clean)
    setShowUsernamePrompt(false)
    setIsMigrating(true)
    setMigrateStatus('Starting…')
    try {
      const result = await migrateLikesToBookmarks(setMigrateStatus, clean)
      setMigrateStatus(`Done: ${result.bookmarked} bookmarked`)
      onSync?.()
      setTimeout(() => setMigrateStatus(''), 3000)
    } catch (e) {
      setMigrateStatus('Error')
      console.error('[HUD] Migration error:', e)
    } finally {
      setIsMigrating(false)
    }
  }

  const isElectron = typeof window !== 'undefined' && !!window.api

  return (
    <>
      <style>{`
        @keyframes hud-spin { to { transform: rotate(360deg); } }
        .hud-slider {
          -webkit-appearance: none; appearance: none;
          width: 130px; height: 3px;
          background: rgba(255,255,255,0.15); border-radius: 2px;
          outline: none; cursor: pointer; border: none; padding: 0;
        }
        .hud-slider::-webkit-slider-thumb {
          -webkit-appearance: none; width: 13px; height: 13px;
          border-radius: 50%; background: #d0d0d0; cursor: pointer;
          border: none; box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }
        .hud-slider::-webkit-slider-thumb:hover { background: #fff; }
        .hud-folder-select {
          -webkit-appearance: none; appearance: none;
          background: rgba(20,20,20,0.75);
          border: 1px solid rgba(255,255,255,0.08);
          color: #888; font-size: 11px; font-family: monospace;
          border-radius: 7px; padding: 0 26px 0 10px; height: 32px;
          cursor: pointer; outline: none; max-width: 150px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
        }
        .hud-folder-select:hover { color: #ddd; }
        .hud-folder-select option { background: #111; color: #ccc; }
      `}</style>

      {/* Overlay — pointer-events off by default, on for children */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>

        {/* ── Top-left: window controls + folder filter ── */}
        {(isElectron || nonDefaultFolders.length > 0) && (
          <div style={{
            position: 'absolute', top: 20, left: 20,
            display: 'flex', flexDirection: 'column', gap: 7,
            pointerEvents: 'auto',
            WebkitAppRegion: 'no-drag',
          }}>
            {/* Traffic lights (close / minimize / maximize) — Electron only */}
            {isElectron && (
              <div style={{
                display: 'flex', gap: 6, alignItems: 'center',
                background: 'rgba(20,20,20,0.75)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '0 10px', height: 32,
              }}>
                <TrafficBtn
                  color="#ff5f57" hoverColor="#ff3b30"
                  onClick={() => window.api?.closeWindow()}
                  title="Close"
                  icon={
                    <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                      <path d="M1 1l4 4M5 1L1 5" stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  }
                />
                <TrafficBtn
                  color="#febc2e" hoverColor="#f0a500"
                  onClick={() => window.api?.minimizeWindow()}
                  title="Minimize"
                  icon={
                    <svg width="6" height="2" viewBox="0 0 6 2" fill="none">
                      <path d="M0 1h6" stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  }
                />
                <TrafficBtn
                  color="#28c840" hoverColor="#1aab30"
                  onClick={() => window.api?.maximizeWindow()}
                  title="Maximize"
                  icon={
                    <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                      <rect x="0.6" y="0.6" width="4.8" height="4.8" rx="1" stroke="rgba(0,0,0,0.45)" strokeWidth="1"/>
                    </svg>
                  }
                />
              </div>
            )}

            {/* Folder filter — always show so users can navigate collections */}
            <select
              className="hud-folder-select"
              value={selectedFolder}
              onChange={e => setSelectedFolder(e.target.value)}
              title="Filter by folder"
            >
              <option value="all">All</option>
              <option value="default">Bookmarks</option>
              {nonDefaultFolders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Top-center: zoom ── */}
        <div style={{
          position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(20,20,20,0.75)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: '0 12px', height: 36,
          pointerEvents: 'auto',
        }}>
          <button onClick={zoomOut} title="Zoom out"
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ccc'}
            onMouseLeave={e => e.currentTarget.style.color = '#666'}>
            <svg width="12" height="2" viewBox="0 0 12 2"><rect width="12" height="2" rx="1" fill="currentColor"/></svg>
          </button>
          <input type="range" min="0" max="100" value={sliderVal} onChange={onSlider} className="hud-slider" />
          <button onClick={zoomIn} title="Zoom in"
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ccc'}
            onMouseLeave={e => e.currentTarget.style.color = '#666'}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="0" y="5" width="12" height="2" rx="1" fill="currentColor"/>
              <rect x="5" y="0" width="2" height="12" rx="1" fill="currentColor"/>
            </svg>
          </button>
        </div>

        {/* ── Top-right: sync + likes + grid + remix ── */}
        <div style={{
          position: 'absolute', top: 20, right: 20,
          display: 'flex', gap: 6, alignItems: 'center',
          pointerEvents: 'auto',
        }}>
          {syncStatus && (
            <span style={{ fontSize: 10, color: '#666', fontFamily: 'monospace', background: 'rgba(20,20,20,0.75)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 8px' }}>
              {syncStatus}
            </span>
          )}
          {migrateStatus && (
            <span style={{ fontSize: 10, color: '#666', fontFamily: 'monospace', background: 'rgba(20,20,20,0.75)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 8px' }}>
              {migrateStatus}
            </span>
          )}
          <HudBtn onClick={handleSync} title="Sync bookmarks" disabled={isSyncing} spinning={isSyncing}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 2.75C3 1.784 3.784 1 4.75 1h6.5c.966 0 1.75.784 1.75 1.75v11.5a.75.75 0 0 1-1.227.579L8 11.722l-3.773 3.107A.751.751 0 0 1 3 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.91l3.023-2.489a.75.75 0 0 1 .954 0l3.023 2.49V2.75a.25.25 0 0 0-.25-.25Z"/>
            </svg>
          </HudBtn>
          <HudBtn onClick={handleMigrate} title="Import likes to canvas" disabled={isMigrating} spinning={isMigrating}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="m8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.744 2.584l-.018.01-.006.003h-.002ZM4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.58 20.58 0 0 0 8 13.393a20.58 20.58 0 0 0 3.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.749.749 0 0 1-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5Z"/>
            </svg>
          </HudBtn>
          <HudBtn onClick={onArrange} title="Reset grid layout">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          </HudBtn>
          <HudBtn onClick={onRemix} title="Remix — shuffle grid">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 4h8.5M1 10h8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M8 2l3 2-3 2M8 8l3 2-3 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </HudBtn>
        </div>

        {/* ── Bottom-center: color palette filter + custom picker ── */}
        {paletteColors.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(14,14,14,0.88)', backdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 24, padding: '0 14px', height: 34,
            pointerEvents: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
          }}>

            {/* Color swatches */}
            {paletteColors.map(color => {
              const isActive = activeFilters.color === color
              return (
                <button
                  key={color}
                  title={isActive ? 'Clear filter' : 'Filter by color'}
                  onClick={() => setColorFilter(isActive ? null : color)}
                  style={{
                    width: 13, height: 13, borderRadius: '50%', background: color,
                    border: isActive ? '2px solid rgba(255,255,255,0.95)' : '1.5px solid rgba(0,0,0,0.35)',
                    cursor: 'pointer', padding: 0, flexShrink: 0, outline: 'none',
                    boxShadow: isActive ? `0 0 0 2.5px rgba(255,255,255,0.18), 0 0 8px ${color}99` : 'none',
                    transform: isActive ? 'scale(1.35)' : 'scale(1)',
                    transition: 'transform 140ms ease, box-shadow 140ms ease, border 140ms ease',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.transform = 'scale(1.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = isActive ? 'scale(1.35)' : 'scale(1)' }}
                />
              )
            })}

            {/* Thin separator */}
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.09)', flexShrink: 0, margin: '0 2px' }} />

            {/* Custom color picker button — palette icon, fills with chosen color when active */}
            <button
              title="Pick a custom color"
              onClick={() => colorInputRef.current?.click()}
              style={{
                width: 26, height: 22, borderRadius: 6,
                background: isCustomColor ? activeFilters.color : 'rgba(255,255,255,0.05)',
                border: isCustomColor ? '2px solid rgba(255,255,255,0.85)' : '1px solid rgba(255,255,255,0.09)',
                cursor: 'pointer', padding: 0, flexShrink: 0, outline: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isCustomColor ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.32)',
                boxShadow: isCustomColor ? `0 0 0 2.5px rgba(255,255,255,0.14), 0 0 8px ${activeFilters.color}99` : 'none',
                transform: isCustomColor ? 'scale(1.08)' : 'scale(1)',
                transition: 'all 140ms ease',
              }}
              onMouseEnter={e => {
                if (!isCustomColor) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.65)'
                }
              }}
              onMouseLeave={e => {
                if (!isCustomColor) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.32)'
                }
              }}
            >
              {/* Palette icon */}
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 1 0 7 7 .5.5 0 0 0-.76-.43A2 2 0 0 1 11 8.5a2 2 0 0 1-2-2 .5.5 0 0 0-.5-.5A.5.5 0 0 0 8 6.5v.01A3.5 3.5 0 1 1 8 4.5v-.01A.5.5 0 0 0 7.5 4h.01A6 6 0 1 1 2 8a.5.5 0 0 0-1 0A7 7 0 1 0 8 1Z"/>
                <circle cx="5" cy="5.5" r="1"/><circle cx="3.5" cy="8" r="1"/>
                <circle cx="5" cy="10.5" r="1"/><circle cx="8" cy="12" r="1"/>
              </svg>
            </button>

            {/* Clear × — only visible when a filter is active */}
            {activeFilters.color && (
              <button
                onClick={() => setColorFilter(null)}
                title="Clear color filter"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', outline: 'none',
                  padding: '0 1px', display: 'flex', alignItems: 'center',
                  color: 'rgba(255,255,255,0.28)',
                  transition: 'color 120ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.28)' }}
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}

            {/* Hidden native color input */}
            <input
              ref={colorInputRef}
              type="color"
              defaultValue="#888888"
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
              onChange={e => setColorFilter(e.target.value)}
            />
          </div>
        )}

      </div>

      {/* ── Username prompt modal ── */}
      {showUsernamePrompt && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, pointerEvents: 'auto',
        }}>
          <div style={{
            background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
            padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 280,
          }}>
            <div style={{ color: '#ccc', fontSize: 13, fontFamily: 'monospace' }}>Your X username</div>
            <input
              autoFocus
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runMigration(usernameInput); if (e.key === 'Escape') setShowUsernamePrompt(false) }}
              placeholder="@handle"
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 7, padding: '8px 12px', color: '#eee', fontSize: 13, fontFamily: 'monospace', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUsernamePrompt(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: '#666', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              <button onClick={() => runMigration(usernameInput)} style={{ background: '#1d9bf0', border: 'none', borderRadius: 7, color: '#fff', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>Start</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
