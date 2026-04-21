// X.com API - currently disabled pending backend implementation
// The app uses local bookmarks for now via IndexedDB

export async function fetchBookmarks(userToken, paginationToken = null) {
  console.warn('Bookmark sync not yet implemented')
  return { data: [], includes: {} }
}

export async function getAllBookmarks(userToken) {
  console.warn('Bookmark sync not yet implemented')
  return { bookmarks: [], users: new Map(), media: new Map() }
}

export function formatBookmarkForCanvas(tweet, user, media) {
  return {
    id: tweet.id,
    tweetId: tweet.id,
    text: tweet.text,
    author: user?.username || 'Unknown',
    authorName: user?.name || 'Unknown',
    authorImage: user?.profile_image_url || null,
    thumbnail: null,
    createdAt: tweet.created_at,
    metrics: tweet.public_metrics || {},
    position: { x: Math.random() * 2000, y: Math.random() * 2000 },
    folderId: 'default',
  }
}
