// Main Application Controller
class IoTDashboard {
    constructor() {
        this.isInitialized = false;
        this.socket = null;
        this.chartManager = null;
        this.controllers = {};
        this.currentView = 'dashboard';
    }

    async init() {
        try {
            console.log('Initializing Dashboard...');
            
            // Initialize components
            this.chartManager = new ChartManager();
            window.chartManager = this.chartManager;
            
            // Initialize view controllers
            this.controllers.dashboard = new RevisedDashboardController();
            this.controllers.devices = new DevicesController();
            this.controllers.sensorHistory = new SensorHistoryController();
            this.controllers.alarmHistory = new AlarmHistoryController();

            // Expose controllers globally for convenience
            window.dashboardController = this.controllers.dashboard;
            window.devicesController = this.controllers.devices;
            window.sensorHistoryController = this.controllers.sensorHistory;
            window.alarmHistoryController = this.controllers.alarmHistory;

            // Connect to backend
            await this.connectSocket();
            
            // Setup navigation
            this.setupNavigation();
            
            // Initialize current view
            await this.showView('dashboard');
            
            this.isInitialized = true;
            console.log('Dashboard initialized successfully');
            
            // Hide loading overlay
            this.hideLoadingOverlay();
            
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            this.showError('Failed to initialize dashboard. Please check the connection.');
            this.hideLoadingOverlay();
        }
    }

    setupNavigation() {
        // Setup navigation event listeners
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = item.getAttribute('data-view');
                if (viewName) {
                    this.showView(viewName);
                }
            });
        });
    }

    async showView(viewName) {
        try {
            // Hide all views
            document.querySelectorAll('.view').forEach(view => {
                view.style.display = 'none';
            });

            // Update navigation
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
                if (item.getAttribute('data-view') === viewName) {
                    item.classList.add('active');
                }
            });

            // Show target view
            const viewElement = document.getElementById(`${viewName}View`);
            if (viewElement) {
                viewElement.style.display = 'block';
            }

            // Convert kebab-case to camelCase for controller lookup
            const controllerName = viewName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            
            // Initialize controller if not already done
            const controller = this.controllers[controllerName];
            if (controller && !controller.isInitialized) {
                await controller.init();
                controller.isInitialized = true;
            }

            this.currentView = viewName;
            console.log(`Switched to ${viewName} view`);

        } catch (error) {
            console.error(`Failed to show ${viewName} view:`, error);
            this.showError(`Failed to load ${viewName} view`);
        }
    }

    async connectSocket() {
        return new Promise((resolve, reject) => {
            // Set initial connecting status
            if (window.api && window.api.updateConnectionStatus) {
                window.api.updateConnectionStatus('connecting', 'Connecting...');
            }
            
            this.socket = io('http://localhost:5000');
            
            this.socket.on('connect', () => {
                console.log('Connected to backend');
                // Update connection status
                if (window.api && window.api.updateConnectionStatus) {
                    window.api.updateConnectionStatus('connected', 'Connected');
                }
                resolve();
            });
            
            this.socket.on('disconnect', () => {
                console.log('Disconnected from backend');
                // Update connection status
                if (window.api && window.api.updateConnectionStatus) {
                    window.api.updateConnectionStatus('disconnected', 'Connection lost. Attempting to reconnect...');
                }
                this.showError('Connection lost. Attempting to reconnect...');
            });
            
            this.socket.on('sensor_update', (data) => {
                console.log('Received sensor data:', data);
                // Broadcast to all controllers
                window.dispatchEvent(new CustomEvent('sensorUpdate', { detail: data }));
            });

            this.socket.on('alarm_update', (data) => {
                console.log('Received alarm:', data);
                // Broadcast alarm event
                window.dispatchEvent(new CustomEvent('alarmUpdate', { detail: data }));
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('Socket connection error:', error);
                reject(error);
            });
        });
    }

    showError(message) {
        console.error(message);
        // Simple toast notification
        const toast = document.createElement('div');
        toast.className = 'toast error';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4757;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
            max-width: 300px;
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }

    showSuccess(message) {
        const toast = document.createElement('div');
        toast.className = 'toast success';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #2ecc71;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
            max-width: 300px;
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    hideLoadingOverlay() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const app = new IoTDashboard();
    window.dashboardApp = app;
    await app.init();
});
