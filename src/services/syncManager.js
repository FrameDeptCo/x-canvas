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

    // Filter to media-only (images/videos) — text-only bookmarks don't display
    const mediaBookmarks = bookmarks.filter(b => b.thumbnail || b.videoUrl)
    console.log(`[Sync] ${bookmarks.length} total → ${mediaBookmarks.length} with media`)

    // Compute masonry positions (renderer process has window dimensions)
    const validatedBookmarks = computeMasonryPositions(mediaBookmarks)

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

export async function migrateLikesToBookmarks(onProgress, username) {
  try {
    onProgress?.('Fetching session cookie...')

    const hasAPI = typeof window !== 'undefined' && window.api
    let cookie

    if (hasAPI) {
      cookie = await window.api.getSessionCookie()
    } else {
      cookie = localStorage.getItem('x_session_cookie')
    }

    if (!cookie) {
      throw new Error('No session cookie found. Please login first.')
    }

    onProgress?.('Fetching all likes from X...')
    let result

    if (hasAPI) {
      result = await window.api.fetchLikes(cookie, username)
    } else {
      const response = await fetch('/api/fetch-likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie, username })
      })
      result = await response.json()
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch likes')
    }

    const { likes } = result.data
    console.log(`[Migration] Fetched ${likes.length} likes`)

    if (likes.length === 0) {
      onProgress?.('No likes found to migrate.')
      return { success: true, count: 0 }
    }

    onProgress?.(`Found ${likes.length} likes. Bookmarking via page...`)

    const tweetIds = likes.map(l => l.id)
    let bookmarked = 0
    let failed = 0

    if (hasAPI && window.api.bookmarkTweetsBatch) {
      const res = await window.api.bookmarkTweetsBatch(tweetIds, username)
      bookmarked = res.bookmarked || 0
      failed = res.failed || 0
    } else {
      failed = tweetIds.length
    }

    onProgress?.(`Done! Bookmarked ${bookmarked}/${likes.length}${failed > 0 ? ` (${failed} failed)` : ''}`)

    return {
      success: true,
      bookmarked,
      failed,
      total: likes.length,
    }
  } catch (error) {
    console.error('[Migration] Error:', error)
    throw error
  }
}

// ─── Masonry layout ──────────────────────────────────────────────────────────
export const CARD_W = 200   // must match BookmarkCard.CARD_W
const GAP = 2               // tight 2px gap

export function computeMasonryPositions(bookmarks, viewportWidth, aspectRatios = {}) {
  const vw = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280)

  // Minimum columns to fill the viewport, then expand to sqrt(N) so the grid
  // grows wider with more bookmarks — keeps it roughly square so users pan
  // horizontally as well as vertically instead of just one long column.
  const naturalCols = Math.max(2, Math.floor((vw + GAP) / (CARD_W + GAP)))
  const squareCols  = Math.ceil(Math.sqrt(bookmarks.length))
  const cols        = Math.max(naturalCols, squareCols)

  const startX = GAP
  const colH   = new Array(cols).fill(GAP)

  const placed = []
  const defaultRatio = 16 / 9 // use default 16:9 for bookmarks without known aspect ratio

  for (const bm of bookmarks) {
    const ratio = aspectRatios[bm.id] || defaultRatio
    const cardH = Math.round(CARD_W / ratio)
    const minH  = Math.min(...colH)
    const col   = colH.indexOf(minH)
    const x     = startX + col * (CARD_W + GAP)
    const y     = colH[col]
    colH[col]  += cardH + GAP

    placed.push({ ...bm, position: { x, y } })
  }

  return placed
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
