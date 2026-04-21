import { app, BrowserWindow, ipcMain, dialog, Notification, Menu, Tray, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import crypto from 'crypto';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate a stable encryption key based on machine identity
const encryptionKey = crypto
  .createHash('sha256')
  .update(os.userInfo().username + os.hostname())
  .digest();

const store = new Store({
  encryptionKey: encryptionKey,
});

let mainWindow = null;
let loginWindow = null;

// Check if dist exists or assume dev mode
import fs from 'fs';
const distExists = fs.existsSync(path.join(__dirname, 'dist'));
const isDev = !distExists;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const startUrl = isDev
    ? 'http://localhost:5177'  // Vite port
    : `file://${path.join(__dirname, 'dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers

ipcMain.handle('get-x-cookies', async () => {
  return store.get('x_cookies', null);
});

ipcMain.handle('set-x-cookies', async (_, cookies) => {
  store.set('x_cookies', cookies);
  return true;
});

// Open login window and extract X.com cookies
ipcMain.handle('open-x-login', async () => {
  return new Promise((resolve) => {
    if (loginWindow) {
      loginWindow.focus();
      return resolve({ success: false, error: 'Login window already open' });
    }

    loginWindow = new BrowserWindow({
      width: 600,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Load X.com bookmarks page
    loginWindow.loadURL('https://x.com/i/bookmarks');

    // Monitor for successful login by checking cookies
    const checkLoginInterval = setInterval(async () => {
      if (!loginWindow) {
        clearInterval(checkLoginInterval);
        return;
      }

      try {
        const cookies = await loginWindow.webContents.session.cookies.get({
          url: 'https://x.com',
        });

        const ct0 = cookies.find((c) => c.name === 'ct0');
        const authToken = cookies.find((c) => c.name === 'auth_token');

        if (ct0 && authToken) {
          // Build cookie string for API requests
          const cookieString = cookies
            .map((c) => `${c.name}=${c.value}`)
            .join('; ');

          // Save for later use
          store.set('x_cookies', {
            ct0: ct0.value,
            auth_token: authToken.value,
            full_cookie: cookieString,
          });

          // Close the login window
          clearInterval(checkLoginInterval);
          if (loginWindow) {
            loginWindow.close();
            loginWindow = null;
          }

          resolve({
            success: true,
            cookies: {
              ct0: ct0.value,
              auth_token: authToken.value,
            },
          });
        }
      } catch (error) {
        // Continue checking
      }
    }, 1000);

    loginWindow.on('closed', () => {
      clearInterval(checkLoginInterval);
      loginWindow = null;
      resolve({ success: false, error: 'Login window closed' });
    });
  });
});

// Clear saved cookies
ipcMain.handle('clear-x-cookies', async () => {
  store.delete('x_cookies');
  return { success: true };
});
