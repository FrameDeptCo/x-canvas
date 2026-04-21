import { create } from 'zustand'

export const useAppStore = create((set) => ({
  // Auth
  isAuthenticated: false,
  accessToken: null,
  setAccessToken: (token) => set({ accessToken: token, isAuthenticated: !!token }),

  // Sync
  isSyncing: false,
  lastSyncTime: null,
  setSyncing:  (v) => set({ isSyncing: v }),
  setSyncTime: (t) => set({ lastSyncTime: t }),

  // Folder filter
  selectedFolder: 'all',
  setSelectedFolder: (f) => set({ selectedFolder: f }),

  // Canvas
  canvasZoom: 1,
  canvasPan:  { x: 0, y: 0 },
  setCanvasZoom: (z) => set({ canvasZoom: z }),
  setCanvasPan:  (p) => set({ canvasPan: p }),
  // Zoom from viewport center (used by slider)
  setCanvasZoomCentered: (newZoom, viewportW, viewportH) => set(s => {
    const cx = viewportW / 2
    const cy = viewportH / 2
    const newPan = {
      x: cx - (cx - s.canvasPan.x) * (newZoom / s.canvasZoom),
      y: cy - (cy - s.canvasPan.y) * (newZoom / s.canvasZoom),
    }
    return { canvasZoom: newZoom, canvasPan: newPan }
  }),

  // Selected bookmark → info panel
  selectedBookmark: null,
  setSelectedBookmark: (b) => set({ selectedBookmark: b }),
  clearSelectedBookmark: () => set({ selectedBookmark: null }),

  // Data
  bookmarks: [],
  folders: [],
  setBookmarks: (bookmarks) => set({ bookmarks }),
  setFolders:   (folders)   => set({ folders }),

  // Aspect ratios reported by BookmarkCard on image/video load
  aspectRatios: {},
  setAspectRatio: (id, ratio) => set(s => ({ aspectRatios: { ...s.aspectRatios, [id]: ratio } })),

  // Filters
  activeFilters: {
    color: null,
    tags: [],
    shape: null,
    rating: null,
    types: [], // e.g. ['image', 'video', 'text']
  },
  setColorFilter: (color) => set(s => ({ activeFilters: { ...s.activeFilters, color } })),
  setTagsFilter: (tags) => set(s => ({ activeFilters: { ...s.activeFilters, tags } })),
  setShapeFilter: (shape) => set(s => ({ activeFilters: { ...s.activeFilters, shape } })),
  setRatingFilter: (rating) => set(s => ({ activeFilters: { ...s.activeFilters, rating } })),
  setTypesFilter: (types) => set(s => ({ activeFilters: { ...s.activeFilters, types } })),
  clearFilters: () => set({ activeFilters: { color: null, tags: [], shape: null, rating: null, types: [] } }),

  // Bookmark colors (extracted from thumbnails)
  bookmarkColors: {}, // { bookmarkId: '#RRGGBB' }
  setBookmarkColor: (id, color) => set(s => ({ bookmarkColors: { ...s.bookmarkColors, [id]: color } })),
}))
