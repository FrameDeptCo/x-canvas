const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSessionCookie: () => ipcRenderer.invoke("get-session-cookie"),
  setSessionCookie: (cookie) => ipcRenderer.invoke("set-session-cookie", cookie),
  openLoginWindow: () => ipcRenderer.invoke("open-login-window"),
  fetchBookmarks: (cookie) => ipcRenderer.invoke("fetch-bookmarks", cookie),
  fetchLikes: (cookie, username) => ipcRenderer.invoke("fetch-likes", cookie, username),
  bookmarkTweet: (tweetId, cookie) => ipcRenderer.invoke("bookmark-tweet", tweetId, cookie),
  bookmarkTweetsBatch: (tweetIds, username) => ipcRenderer.invoke("bookmark-tweets-batch", tweetIds, username),
  logout: () => ipcRenderer.invoke("logout"),
});
