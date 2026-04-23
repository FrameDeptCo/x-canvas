import React, { useState } from 'react'
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

export default function HUD({ onSync, onArrange, onRemix, panelOpen }) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [isMigrating, setIsMigrating] = useState(false)
  const [migrateStatus, setMigrateStatus] = useState('')
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')

  const canvasZoom            = useAppStore(s => s.canvasZoom)
  const setCanvasZoomCentered = useAppStore(s => s.setCanvasZoomCentered)

  const HEADER_H = 0
  const vw = () => window.innerWidth - (panelOpen ? 280 : 0)
  const vh = () => window.innerHeight - HEADER_H

  const sliderVal = Math.round(((canvasZoom - 0.25) / 1.75) * 100)

  const zoomTo = (z) => setCanvasZoomCentered(Math.max(0.15, Math.min(5, Math.round(z * 100) / 100)), vw(), vh())
  const zoomIn  = () => zoomTo(canvasZoom + 0.15)
  const zoomOut = () => zoomTo(canvasZoom - 0.15)
  const onSlider = (e) => {
    const pct = Number(e.target.value) / 100
    zoomTo(0.25 + pct * 1.75)
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncStatus('Syncing…')
    try {
      await syncBookmarks(setSyncStatus)
      setSyncStatus('Done')
      onSync?.()
      setTimeout(() => setSyncStatus(''), 2500)
    } catch (e) {
      setSyncStatus(`Error`)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleMigrate = () => {
    const saved = localStorage.getItem('x_username')
    if (saved) {
      runMigration(saved)
    } else {
      setShowUsernamePrompt(true)
    }
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
      `}</style>

      {/* Overlay — pointer-events off by default, on for children */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>

        {/* Top-center: zoom */}
        <div style={{
          position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(20,20,20,0.75)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: '0 12px', height: 36,
          pointerEvents: 'auto',
        }}>
          <button onClick={zoomOut} title="Zoom out" style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ccc'}
            onMouseLeave={e => e.currentTarget.style.color = '#666'}>
            <svg width="12" height="2" viewBox="0 0 12 2"><rect width="12" height="2" rx="1" fill="currentColor"/></svg>
          </button>
          <input type="range" min="0" max="100" value={sliderVal} onChange={onSlider} className="hud-slider" />
          <button onClick={zoomIn} title="Zoom in" style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ccc'}
            onMouseLeave={e => e.currentTarget.style.color = '#666'}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="0" y="5" width="12" height="2" rx="1" fill="currentColor"/>
              <rect x="5" y="0" width="2" height="12" rx="1" fill="currentColor"/>
            </svg>
          </button>
        </div>

        {/* Top-right: sync + grid + migrate */}
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
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h10v11l-5-3-5 3V2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </HudBtn>
          <HudBtn onClick={handleMigrate} title="Import likes to canvas" disabled={isMigrating} spinning={isMigrating}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 12C7 12 1.5 8.5 1.5 4.5a2.5 2.5 0 0 1 5-0c.276-.546.828-1 1.5-1a2.5 2.5 0 0 1 2.5 2.5C10.5 8.5 7 12 7 12z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
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

      </div>

      {/* Username prompt modal */}
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
