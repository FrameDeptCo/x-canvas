import React, { useEffect, useRef, useState } from 'react'
import './InfoPanel.css'

// Extract up to 5 dominant colours from an image via a tiny canvas
function extractColors(imgEl, count = 5) {
  try {
    const size = 80
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imgEl, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data
    const buckets = {}
    for (let i = 0; i < data.length; i += 4 * 4) { // sample every 4th pixel
      const r = Math.round(data[i]     / 32) * 32
      const g = Math.round(data[i + 1] / 32) * 32
      const b = Math.round(data[i + 2] / 32) * 32
      const key = `${r},${g},${b}`
      buckets[key] = (buckets[key] || 0) + 1
    }
    return Object.entries(buckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([k]) => {
        const [r, g, b] = k.split(',')
        return `rgb(${r},${g},${b})`
      })
  } catch {
    return []
  }
}

export default function InfoPanel({ bookmark, onClose }) {
  const [colors, setColors]   = useState([])
  const [visible, setVisible] = useState(false)
  const imgRef = useRef(null)

  // Slide-in on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Extract colours when image loads
  const handleImgLoad = (e) => {
    setColors(extractColors(e.target))
  }

  if (!bookmark) return null

  const date = bookmark.createdAt
    ? new Date(bookmark.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      })
    : '—'

  const thumbSrc = bookmark.thumbnail
    ? (bookmark.thumbnail.includes('pbs.twimg.com')
        ? bookmark.thumbnail + ':large'
        : bookmark.thumbnail)
    : null

  return (
    <aside className={`info-panel${visible ? ' visible' : ''}`}>

      {/* ── Thumbnail ── */}
      {thumbSrc ? (
        <div className="ip-thumb">
          <img
            ref={imgRef}
            src={thumbSrc}
            alt=""
            crossOrigin="anonymous"
            onLoad={handleImgLoad}
          />
          {/* Format badge */}
          <span className="ip-badge">JPG</span>
        </div>
      ) : (
        <div className="ip-thumb ip-thumb--text">
          <span>No image</span>
        </div>
      )}

      {/* ── Colour swatches ── */}
      <div className="ip-swatches">
        {(colors.length ? colors : ['#2a2a2a','#333','#3a3a3a','#2e2e2e','#404040'])
          .map((c, i) => (
            <div key={i} className="ip-swatch" style={{ background: c }} />
          ))}
      </div>

      {/* ── Author ── */}
      <div className="ip-section">
        <p className="ip-title">{bookmark.authorName || bookmark.author || '—'}</p>
        {bookmark.author && bookmark.author !== 'unknown' && (
          <p className="ip-handle">@{bookmark.author}</p>
        )}
      </div>

      {/* ── Tweet text ── */}
      {bookmark.text && (
        <div className="ip-section ip-section--pad">
          <div className="ip-label">Notes</div>
          <p className="ip-notes">{bookmark.text}</p>
        </div>
      )}

      {/* ── URL ── */}
      {bookmark.url && (
        <div className="ip-section ip-section--pad">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noreferrer"
            className="ip-url"
            onClick={(e) => {
              // In Electron, open in external browser
              if (window.api?.openExternal) {
                e.preventDefault()
                window.api.openExternal(bookmark.url)
              }
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M4.5 2H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M7 1h3v3M10 1 5.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{bookmark.url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 48)}</span>
          </a>
        </div>
      )}

      {/* ── Tags placeholder ── */}
      <div className="ip-section ip-section--pad">
        <div className="ip-label">Tags</div>
        <button className="ip-add-tag">+ New tag</button>
      </div>

      {/* ── Folders ── */}
      <div className="ip-section ip-section--pad">
        <div className="ip-label">Folders</div>
        <div className="ip-chips">
          <span className="ip-chip">
            All Bookmarks
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </span>
          <button className="ip-chip-add">+</button>
        </div>
      </div>

      {/* ── Properties ── */}
      <div className="ip-section ip-section--pad">
        <div className="ip-label">Properties</div>
        <div className="ip-props">
          <div className="ip-prop-row">
            <span>Date</span>
            <span>{date}</span>
          </div>
          <div className="ip-prop-row">
            <span>Type</span>
            <span>Tweet</span>
          </div>
          <div className="ip-prop-row">
            <span>Author</span>
            <span>@{bookmark.author || '—'}</span>
          </div>
        </div>
      </div>

      {/* ── Open button ── */}
      <div className="ip-footer">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noreferrer"
          className="ip-open-btn"
          onClick={(e) => {
            if (window.api?.openExternal) {
              e.preventDefault()
              window.api.openExternal(bookmark.url)
            }
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M5 2H2.5A1.5 1.5 0 0 0 1 3.5v6A1.5 1.5 0 0 0 2.5 11h6A1.5 1.5 0 0 0 10 9.5V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M7.5 1H11v3.5M11 1 5.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Open in X.com
        </a>
      </div>

    </aside>
  )
}
