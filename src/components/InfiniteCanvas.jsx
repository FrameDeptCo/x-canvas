import React, { useRef, useEffect, useState } from 'react'
import { Stage, Layer, Text } from 'react-konva'
import { useAppStore } from '../store/appState'
import BookmarkCard from './BookmarkCard'

const HEADER_H = 74  // nav row (42) + filter chips row (32)

const InfiniteCanvas = ({ bookmarks, panelOpen }) => {
  const stageRef    = useRef(null)
  const isPanning   = useRef(false)
  const lastPtr     = useRef({ x: 0, y: 0 })
  const rafRef      = useRef(null)

  const panelW = panelOpen ? 280 : 0

  const [winSize, setWinSize] = useState({
    width:  window.innerWidth  - panelW,
    height: window.innerHeight - HEADER_H,
  })

  // Resize when window or panel changes
  useEffect(() => {
    const onResize = () => setWinSize({
      width:  window.innerWidth  - panelW,
      height: window.innerHeight - HEADER_H,
    })
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [panelW])

  const canvasZoom    = useAppStore(s => s.canvasZoom)
  const canvasPan     = useAppStore(s => s.canvasPan)
  const setCanvasZoom = useAppStore(s => s.setCanvasZoom)
  const setCanvasPan  = useAppStore(s => s.setCanvasPan)
  const selectedBookmark    = useAppStore(s => s.selectedBookmark)
  const setSelectedBookmark = useAppStore(s => s.setSelectedBookmark)
  const clearSelected       = useAppStore(s => s.clearSelectedBookmark)

  // ── Video animation loop (keep Konva in sync with video frames) ───────────
  const hasVideos = bookmarks?.some(b => !!b.videoUrl)

  useEffect(() => {
    if (!hasVideos) return
    const tick = () => {
      stageRef.current?.batchDraw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [hasVideos])

  // ── Zoom via scroll wheel (zoom toward cursor) ────────────────────────────
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const SCALE = 1.08

    const onWheel = (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? SCALE : 1 / SCALE
      const next   = Math.max(0.1, Math.min(canvasZoom * factor, 5))
      const ptr    = stage.getPointerPosition()
      if (!ptr) return

      setCanvasPan({
        x: ptr.x - (ptr.x - canvasPan.x) * (next / canvasZoom),
        y: ptr.y - (ptr.y - canvasPan.y) * (next / canvasZoom),
      })
      setCanvasZoom(next)
    }

    const el = stage.content?.querySelector?.('canvas') ?? stage.content
    el?.addEventListener('wheel', onWheel, { passive: false })
    return () => el?.removeEventListener('wheel', onWheel)
  }, [canvasZoom, canvasPan, setCanvasZoom, setCanvasPan])

  // ── Zoom slider change (zoom from viewport center) ──────────────────────
  // Called from Header when user moves the zoom slider
  const handleSliderZoom = (newZoom) => {
    const cx = winSize.width / 2
    const cy = winSize.height / 2
    setCanvasPan({
      x: cx - (cx - canvasPan.x) * (newZoom / canvasZoom),
      y: cy - (cy - canvasPan.y) * (newZoom / canvasZoom),
    })
    setCanvasZoom(newZoom)
  }

  // ── Pan on stage drag ─────────────────────────────────────────────────────
  const onMouseDown = (e) => {
    if (e.target !== stageRef.current) return   // only empty canvas
    isPanning.current = true
    lastPtr.current   = { x: e.evt.clientX, y: e.evt.clientY }
  }

  const onMouseMove = (e) => {
    if (!isPanning.current) return
    const dx = e.evt.clientX - lastPtr.current.x
    const dy = e.evt.clientY - lastPtr.current.y
    lastPtr.current = { x: e.evt.clientX, y: e.evt.clientY }
    setCanvasPan({ x: canvasPan.x + dx, y: canvasPan.y + dy })
  }

  const stopPan = () => { isPanning.current = false }

  // ── Click empty canvas → deselect ─────────────────────────────────────────
  const onStageClick = (e) => {
    if (e.target === stageRef.current) clearSelected()
  }

  const cx = winSize.width  / 2
  const cy = winSize.height / 2

  return (
    <Stage
      ref={stageRef}
      width={winSize.width}
      height={winSize.height}
      style={{ display: 'block', background: '#0a0a0a', cursor: isPanning.current ? 'grabbing' : 'default' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopPan}
      onMouseLeave={stopPan}
      onClick={onStageClick}
    >
      <Layer x={canvasPan.x} y={canvasPan.y} scaleX={canvasZoom} scaleY={canvasZoom}>
        {bookmarks?.length > 0 ? (
          bookmarks.map(bm => (
            <BookmarkCard
              key={bm.id}
              bookmark={bm}
              isSelected={selectedBookmark?.id === bm.id}
              onSelect={setSelectedBookmark}
            />
          ))
        ) : (
          <Text
            x={(cx - canvasPan.x) / canvasZoom - 160}
            y={(cy - canvasPan.y) / canvasZoom}
            text="No bookmarks yet — click Sync to import from X.com"
            fontSize={13}
            fill="#333"
            width={320}
            align="center"
          />
        )}
      </Layer>
    </Stage>
  )
}

export default InfiniteCanvas
