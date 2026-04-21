import React, { useState, useEffect, useRef } from 'react'
import { Group, Rect, Image as KonvaImage } from 'react-konva'
import { useAppStore } from '../store/appState'
import { extractDominantColor } from '../utils/colorUtils'
import { updateBookmarkPosition } from '../db/bookmarkStore'

export const CARD_W  = 200
const RADIUS         = 4

const BookmarkCard = ({ bookmark, onSelect, isSelected }) => {
  const [image,      setImage]      = useState(null)
  const [imgAspect,  setImgAspect]  = useState(16 / 9)
  const wasDragged   = useRef(false)
  const videoRef     = useRef(null)
  const setAspectRatio = useAppStore(s => s.setAspectRatio)
  const setBookmarkColor = useAppStore(s => s.setBookmarkColor)

  const validPos = {
    x: typeof bookmark.position?.x === 'number' ? bookmark.position.x : 0,
    y: typeof bookmark.position?.y === 'number' ? bookmark.position.y : 0,
  }
  const [pos, setPos] = useState(validPos)

  // Sync pos when bookmark.position changes (e.g. after Reset Grid)
  useEffect(() => {
    setPos({
      x: typeof bookmark.position?.x === 'number' ? bookmark.position.x : 0,
      y: typeof bookmark.position?.y === 'number' ? bookmark.position.y : 0,
    })
  }, [bookmark.position?.x, bookmark.position?.y])

  // ── Load video ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!bookmark.videoUrl) return
    const vid = document.createElement('video')
    vid.src = bookmark.videoUrl
    vid.muted = true
    vid.loop = true
    vid.autoplay = true
    vid.playsInline = true
    vid.crossOrigin = 'anonymous'
    vid.onloadedmetadata = () => {
      if (vid.videoWidth && vid.videoHeight) {
        const ratio = vid.videoWidth / vid.videoHeight
        setImgAspect(ratio)
        setAspectRatio(bookmark.id, ratio)
      }
      // Extract dominant color from video frame
      const color = extractDominantColor(vid)
      if (color) setBookmarkColor(bookmark.id, color)
      vid.play().catch(() => {})
      setImage(vid)
    }
    videoRef.current = vid
    return () => {
      vid.pause()
      vid.src = ''
    }
  }, [bookmark.videoUrl, bookmark.id, setAspectRatio])

  // ── Load thumbnail (only if no video) ────────────────────────────────────
  useEffect(() => {
    if (bookmark.videoUrl) return   // video takes priority
    if (!bookmark.thumbnail) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = bookmark.thumbnail.includes('pbs.twimg.com')
      ? bookmark.thumbnail + ':large'
      : bookmark.thumbnail
    img.onload = () => {
      setImage(img)
      if (img.naturalWidth && img.naturalHeight) {
        const ratio = img.naturalWidth / img.naturalHeight
        setImgAspect(ratio)
        setAspectRatio(bookmark.id, ratio)
      }
      // Extract dominant color for filtering
      const color = extractDominantColor(img)
      if (color) setBookmarkColor(bookmark.id, color)
    }
  }, [bookmark.thumbnail, bookmark.videoUrl, bookmark.id, setAspectRatio])

  // ── Height ────────────────────────────────────────────────────────────────
  const hasImg  = !!image
  const imgH    = hasImg ? Math.round(CARD_W / imgAspect) : 0
  const CARD_H  = imgH

  // ── Don't render until media has loaded ──────────────────────────────────
  // Media bookmarks show nothing until image/video is ready.
  // This keeps the canvas images/video only.
  const hasMedia = !!(bookmark.thumbnail || bookmark.videoUrl)
  if (hasMedia && !hasImg) return null

  // ── Drag ─────────────────────────────────────────────────────────────────
  const onDragStart = () => {
    wasDragged.current = false
  }
  const onDragMove = () => {
    wasDragged.current = true
  }
  const onDragEnd = (e) => {
    const p = { x: e.target.x(), y: e.target.y() }
    setPos(p)
    updateBookmarkPosition(bookmark.id, p.x, p.y).catch(console.error)
  }

  // ── Click → select (only if not a drag) ──────────────────────────────────
  const onClick = () => {
    if (wasDragged.current) return
    onSelect?.(bookmark)
  }

  return (
    <Group
      x={pos.x}
      y={pos.y}
      draggable
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onTap={onClick}
    >
      {/* ── Selection glow ── */}
      {isSelected && (
        <Rect
          x={-2} y={-2}
          width={CARD_W + 4}
          height={CARD_H + 4}
          stroke="#4d9fff"
          strokeWidth={2}
          cornerRadius={RADIUS + 2}
          fill="transparent"
          listening={false}
        />
      )}

      {/* ── Image / video thumbnail ── */}
      <KonvaImage
        image={image}
        x={0} y={0}
        width={CARD_W}
        height={imgH}
        cornerRadius={RADIUS}
      />
    </Group>
  )
}

export default BookmarkCard
