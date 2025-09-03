const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

// Check if running in development mode
const isDev = process.argv.includes('--dev');

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false
  });

  // Load the frontend
  mainWindow.loadFile(path.join(__dirname, '../frontend/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  // In development mode, backend is started by npm run dev
  if (isDev) {
    console.log('Development mode: Backend should be started by npm run dev');
    return;
  }
  
  // Start Flask backend for production
  const backendPath = path.join(process.resourcesPath, 'backend');
  
  // Check if backend path exists
  if (!require('fs').existsSync(backendPath)) {
    console.error('Backend path not found:', backendPath);
    console.log('Available resources:', require('fs').readdirSync(process.resourcesPath || __dirname));
    return;
  }
  
  console.log('Starting backend from:', backendPath);
  
  // Use the startup script for better dependency management
  const startScript = path.join(backendPath, 'start_backend.sh');
  let command, args;
  
  if (process.platform === 'win32') {
    // For Windows, fallback to direct Python execution
    command = 'python';
    args = ['app.py'];
  } else {
    // For Unix-like systems, use the startup script
    command = 'bash';
    args = ['start_backend.sh'];
  }
  
  backendProcess = spawn(command, args, {
    cwd: backendPath,
    stdio: isDev ? 'inherit' : 'pipe',
    env: { ...process.env, PYTHONPATH: backendPath }
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// App event handlers
app.whenReady().then(() => {
  createWindow();
  
  // Start backend server
  startBackend();

  // Create application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Dashboard',
          click: () => {
            if (mainWindow) {
              mainWindow.loadFile(path.join(__dirname, '../frontend/index.html'));
            }
          }
        },
        {
          label: 'Sensors',
          click: () => {
            if (mainWindow) {
              mainWindow.loadFile(path.join(__dirname, '../frontend/sensors.html'));
            }
          }
        },
        {
          label: 'Alarms',
          click: () => {
            if (mainWindow) {
              mainWindow.loadFile(path.join(__dirname, '../frontend/alarms.html'));
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About SHIELD Dashboard',
          click: () => {
            // Show about dialog
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About SHIELD Dashboard',
              message: 'SHIELD Dashboard v1.0.0',
              detail: 'IoT sensor monitoring system for construction infrastructure.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

// IPC handlers
ipcMain.handle('get-backend-url', () => {
  return 'http://localhost:5000';
});

ipcMain.handle('app-version', () => {
  return app.getVersion();
});
