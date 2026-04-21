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
}))
