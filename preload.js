const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getXCookies: () => ipcRenderer.invoke('get-x-cookies'),
  setXCookies: (cookies) => ipcRenderer.invoke('set-x-cookies', cookies),
  openXLogin: () => ipcRenderer.invoke('open-x-login'),
  clearXCookies: () => ipcRenderer.invoke('clear-x-cookies'),
});
