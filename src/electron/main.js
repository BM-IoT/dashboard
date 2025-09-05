const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let loadingWindow;
let backendProcess;

// Check if running in development mode
const isDev = process.argv.includes('--dev');

function createLoadingWindow() {
  // Create loading window
  loadingWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
    resizable: false,
    movable: false
  });

  // Create loading HTML content
  const loadingHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          border-radius: 10px;
          overflow: hidden;
        }
        .logo {
          font-size: 2rem;
          margin-bottom: 1rem;
          font-weight: bold;
        }
        .loading-text {
          font-size: 1rem;
          margin-bottom: 2rem;
          opacity: 0.9;
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255,255,255,0.3);
          border-top: 4px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .status {
          margin-top: 2rem;
          font-size: 0.9rem;
          opacity: 0.8;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="logo">🛡️ SHIELD Dashboard</div>
      <div class="loading-text">Starting Application...</div>
      <div class="spinner"></div>
      <div class="status" id="status">Initializing backend server...</div>
      <script>
        const { ipcRenderer } = require('electron');
        
        // Listen for status updates
        ipcRenderer.on('loading-status', (event, status) => {
          document.getElementById('status').textContent = status;
        });
      </script>
    </body>
    </html>
  `;

  loadingWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHTML));
  loadingWindow.center();
  loadingWindow.show();
}

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
    // Close loading window
    if (loadingWindow) {
      loadingWindow.close();
      loadingWindow = null;
    }
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

function updateLoadingStatus(status) {
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.webContents.send('loading-status', status);
  }
}

async function checkBackendHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:5000/health', (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(maxAttempts = 30) {
  updateLoadingStatus('Waiting for backend to start...');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    updateLoadingStatus(`Checking backend... (${attempt}/${maxAttempts})`);
    
    const isHealthy = await checkBackendHealth();
    if (isHealthy) {
      updateLoadingStatus('Backend ready! Loading application...');
      return true;
    }
    
    // Wait 1 second before next attempt
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  updateLoadingStatus('Backend failed to start. Please check logs.');
  return false;
}

function startBackend() {
  // In development mode, backend is started by npm run dev
  if (isDev) {
    console.log('Development mode: Backend should be started by npm run dev');
    updateLoadingStatus('Development mode: Using external backend...');
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    updateLoadingStatus('Starting backend server...');
    
    // Start Flask backend for production
    const backendPath = path.join(process.resourcesPath, 'backend');
    
    // Check if backend path exists
    if (!require('fs').existsSync(backendPath)) {
      console.error('Backend path not found:', backendPath);
      console.log('Available resources:', require('fs').readdirSync(process.resourcesPath || __dirname));
      updateLoadingStatus('Error: Backend files not found');
      reject(new Error('Backend path not found'));
      return;
    }
    
    console.log('Starting backend from:', backendPath);
    updateLoadingStatus('Launching backend process...');
    
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
      stdio: 'inherit',
      env: { ...process.env, PYTHONPATH: backendPath }
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
      updateLoadingStatus('Failed to start backend');
      reject(err);
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
      if (code !== 0) {
        updateLoadingStatus(`Backend exited with code ${code}`);
      }
    });

    // Give the backend a moment to start
    setTimeout(() => {
      updateLoadingStatus('Backend process started, checking health...');
      resolve();
    }, 2000);
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// App event handlers
app.whenReady().then(async () => {
  // Create and show loading window first
  createLoadingWindow();
  
  try {
    // Start backend server and wait for it
    await startBackend();
    
    // Wait for backend to be healthy
    const backendReady = await waitForBackend();
    
    if (backendReady) {
      // Backend is ready, create main window
      createWindow();
    } else {
      // Backend failed to start
      updateLoadingStatus('Failed to start backend. Please try again.');
      setTimeout(() => {
        app.quit();
      }, 3000);
      return;
    }
  } catch (error) {
    console.error('Failed to initialize application:', error);
    updateLoadingStatus('Application failed to start');
    setTimeout(() => {
      app.quit();
    }, 3000);
    return;
  }

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
