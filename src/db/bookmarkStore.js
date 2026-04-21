import { openDB } from 'idb'

const DB_NAME = 'xCanvasDB'
const DB_VERSION = 1
const BOOKMARKS_STORE = 'bookmarks'
const FOLDERS_STORE = 'folders'
const SYNC_STORE = 'syncMetadata'

let db = null

export async function initDB() {
  if (db) return db

  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Bookmarks store
      if (!db.objectStoreNames.contains(BOOKMARKS_STORE)) {
        const bookmarkStore = db.createObjectStore(BOOKMARKS_STORE, { keyPath: 'id' })
        bookmarkStore.createIndex('folderId', 'folderId')
        bookmarkStore.createIndex('createdAt', 'createdAt')
      }

      // Folders store
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' })
      }

      // Sync metadata
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: 'key' })
      }
    },
  })

  return db
}

export async function saveBookmark(bookmark) {
  const database = await initDB()
  return database.put(BOOKMARKS_STORE, bookmark)
}

export async function saveBookmarks(bookmarks) {
  const database = await initDB()
  const tx = database.transaction(BOOKMARKS_STORE, 'readwrite')
  await Promise.all(bookmarks.map(b => tx.store.put(b)))
  await tx.done
}

export async function getBookmarks() {
  const database = await initDB()
  return database.getAll(BOOKMARKS_STORE)
}

export async function getBookmarksByFolder(folderId) {
  const database = await initDB()
  return database.getAllFromIndex(BOOKMARKS_STORE, 'folderId', folderId)
}

export async function deleteBookmark(id) {
  const database = await initDB()
  return database.delete(BOOKMARKS_STORE, id)
}

export async function updateBookmarkPosition(id, x, y) {
  const database = await initDB()
  const bookmark = await database.get(BOOKMARKS_STORE, id)
  if (bookmark) {
    bookmark.position = { x, y }
    return database.put(BOOKMARKS_STORE, bookmark)
  }
}

export async function saveFolder(folder) {
  const database = await initDB()
  return database.put(FOLDERS_STORE, folder)
}

export async function getFolders() {
  const database = await initDB()
  return database.getAll(FOLDERS_STORE)
}

export async function setSyncMetadata(key, value) {
  const database = await initDB()
  return database.put(SYNC_STORE, { key, value, timestamp: Date.now() })
}

export async function getSyncMetadata(key) {
  const database = await initDB()
  const data = await database.get(SYNC_STORE, key)
  return data?.value
}

export async function clearAllData() {
  const database = await initDB()
  const tx = database.transaction([BOOKMARKS_STORE, FOLDERS_STORE], 'readwrite')
  await tx.objectStore(BOOKMARKS_STORE).clear()
  await tx.objectStore(FOLDERS_STORE).clear()
  await tx.done
}
