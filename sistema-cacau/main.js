const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let backendProcess;

function getBackendPath() {
  return path.join(__dirname, 'backend', 'index.js');
}

function getAppIcon() {
  if (process.platform === 'win32') {
    return path.join(__dirname, 'public', 'icon.ico');
  }

  return path.join(__dirname, 'public', 'icon.png');
}

function startBackend() {
  const backendPath = getBackendPath();
  const userDataPath = app.getPath('userData');

  backendProcess = fork(backendPath, [], {
    env: {
      ...process.env,
      NODE_ENV: app.isPackaged ? 'production' : 'development',
      USER_DATA_PATH: userDataPath
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });

  backendProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error('Backend fechou inesperadamente', code);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'RCM - Gestão',
    icon: getAppIcon(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  startBackend();
  setTimeout(createWindow, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});