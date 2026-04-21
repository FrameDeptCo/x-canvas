import {
  saveBookmarks,
  saveFolder,
  setSyncMetadata,
  getBookmarks,
  getFolders,
} from '../db/bookmarkStore'

export async function syncBookmarks(onProgress, testMode = false) {
  try {
    onProgress?.('Getting session cookie...')

    // Check if running in Electron or browser context
    const hasAPI = typeof window !== 'undefined' && window.api
    let cookie

    if (hasAPI) {
      cookie = await window.api.getSessionCookie()
    } else {
      // Browser fallback: check localStorage
      cookie = localStorage.getItem('x_session_cookie')
    }

    // Development mode: if testMode or localStorage flag, use sample data
    const useTestData = testMode || localStorage.getItem('x_test_mode') === 'true'

    // If test mode, use sample data
    if (useTestData) {
      onProgress?.('Loading test bookmarks...')
      const testBookmarks = generateTestBookmarks()
      await saveBookmarks(testBookmarks)
      await saveFolder({
        id: 'default',
        name: 'All Bookmarks',
        color: '#007bff',
        createdAt: new Date().toISOString(),
      })
      await setSyncMetadata('lastSync', new Date().toISOString())
      onProgress?.('Test bookmarks loaded!')
      return testBookmarks
    }

    if (!cookie) {
      throw new Error('No session cookie found. Please login first.')
    }

    onProgress?.('Fetching bookmarks from X...')
    let result

    if (hasAPI) {
      result = await window.api.fetchBookmarks(cookie)
    } else {
      // Browser fallback: use fetch API
      const response = await fetch('/api/fetch-bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie })
      })
      result = await response.json()
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch bookmarks')
    }

    const { bookmarks, collections } = result.data
    console.log('[Sync] Received bookmarks:', bookmarks)

    onProgress?.(`Processing ${bookmarks.length} bookmarks...`)

    // Compute masonry positions (renderer process has window dimensions)
    const validatedBookmarks = computeMasonryPositions(bookmarks)

    // Save all bookmarks
    await saveBookmarks(validatedBookmarks)

    // Save collections as folders
    if (collections && collections.length > 0) {
      onProgress?.(`Saving ${collections.length} collections...`)
      for (const collection of collections) {
        await saveFolder(collection)
      }
    } else {
      // Create default folder if no collections
      await saveFolder({
        id: 'default',
        name: 'All Bookmarks',
        color: '#007bff',
        createdAt: new Date().toISOString(),
      })
    }

    await setSyncMetadata('lastSync', new Date().toISOString())
    onProgress?.('Sync complete!')

    console.log('[Sync] Sync complete')

    return validatedBookmarks
  } catch (error) {
    console.error('Sync error:', error)
    throw error
  }
}

export async function getLocalBookmarks() {
  return getBookmarks()
}

export async function getLocalFolders() {
  return getFolders()
}

export async function addCustomFolder(name, color) {
  const folder = {
    id: `folder-${Date.now()}`,
    name,
    color,
    isCustom: true,
    createdAt: new Date().toISOString(),
  }
  await saveFolder(folder)
  return folder
}

// ─── Masonry layout ──────────────────────────────────────────────────────────
export const CARD_W = 200   // must match BookmarkCard.CARD_W
const GAP = 2               // tight 2px gap

export function computeMasonryPositions(bookmarks, viewportWidth, aspectRatios = {}) {
  const vw     = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280)
  const cols   = Math.max(2, Math.floor((vw + GAP) / (CARD_W + GAP)))
  const grid   = cols * CARD_W + (cols - 1) * GAP
  const startX = Math.max(GAP, Math.round((vw - grid) / 2))
  const colH   = new Array(cols).fill(GAP)

  return bookmarks.map(bm => {
    const hasMedia = !!(bm.thumbnail || bm.videoUrl)
    let cardH
    if (hasMedia) {
      // Use known aspect ratio if available, otherwise default to 16:9
      const ratio = aspectRatios[bm.id] ?? (16 / 9)
      cardH = Math.round(CARD_W / ratio)
    } else {
      cardH = 120   // text-only cards
    }

    const minH = Math.min(...colH)
    const col  = colH.indexOf(minH)
    const x    = startX + col * (CARD_W + GAP)
    const y    = colH[col]
    colH[col] += cardH + GAP

    return { ...bm, position: { x, y } }
  })
}

function generateTestBookmarks() {
  const samples = [
    { text: 'Just launched x-canvas - organize your web with infinite space! 🎨', author: 'test' },
    { text: 'Building the perfect bookmark management system', author: 'test' },
    { text: 'Infinite canvas with drag, drop, and spatial organization', author: 'test' },
    { text: 'Your bookmarks, visualized beautifully', author: 'test' },
    { text: 'Say goodbye to folder hierarchies. Hello spatial thinking! 🗺️', author: 'test' },
    { text: 'Every bookmark gets a home on your infinite canvas', author: 'test' },
  ]

  return samples.map((s, idx) => ({
    id: `test-${idx}`,
    text: s.text,
    author: s.author,
    authorName: 'Test User',
    authorImage: null,
    thumbnail: null,
    createdAt: new Date().toISOString(),
    url: `https://x.com/i/web/status/test-${idx}`,
    position: { x: (idx * 350) % 2000, y: (idx * 250) % 2000 },
    folderId: 'default',
  }))
}
