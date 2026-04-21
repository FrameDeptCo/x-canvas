const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSessionCookie: () => ipcRenderer.invoke("get-session-cookie"),
  setSessionCookie: (cookie) => ipcRenderer.invoke("set-session-cookie", cookie),
  openLoginWindow: () => ipcRenderer.invoke("open-login-window"),
  fetchBookmarks: (cookie) => ipcRenderer.invoke("fetch-bookmarks", cookie),
  logout: () => ipcRenderer.invoke("logout"),
});
