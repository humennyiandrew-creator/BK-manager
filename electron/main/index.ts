import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { registerBkDataSchemePrivileged, registerBkDataProtocol } from './protocol';
import { saveGame, loadGame, listSaves, deleteSave, type SaveData } from './saves';

registerBkDataSchemePrivileged();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0b0f1a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('bk:saveGame', (_e, slot: number, data: SaveData) => saveGame(slot, data));
ipcMain.handle('bk:loadGame', (_e, slot: number) => loadGame(slot));
ipcMain.handle('bk:listSaves', () => listSaves());
ipcMain.handle('bk:deleteSave', (_e, slot: number) => deleteSave(slot));

app.whenReady().then(() => {
  registerBkDataProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
