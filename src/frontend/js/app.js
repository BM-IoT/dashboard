// Simplified Main Application Controller
class IoTDashboard {
    constructor() {
        this.controllers = {};
        this.currentView = 'dashboard';
        this.systemStartTime = Date.now();
    }

    async init() {
        try {
            console.log('Initializing Dashboard...');
            
            // Initialize API and data store
            await window.api.init();
            this._setupAPIEventHandlers();
            
            // Initialize chart manager
            window.chartManager = new ChartManager();
            
            // Initialize view controllers
            this.controllers = {
                dashboard: new DashboardController(),
                devices: new DevicesController(),
                sensorHistory: new SensorHistoryController(),
                alarmHistory: new AlarmHistoryController()
            };

            // Expose controllers globally for onclick handlers
            window.devicesController = this.controllers.devices;
            window.sensorHistoryController = this.controllers.sensorHistory;
            window.alarmHistoryController = this.controllers.alarmHistory;
            window.dashboardController = this.controllers.dashboard;

            // Initialize all controllers
            for (const [name, controller] of Object.entries(this.controllers)) {
                try {
                    await controller.init();
                    controller.isInitialized = true;
                    console.log(`${name} controller initialized`);
                } catch (error) {
                    console.error(`Failed to initialize ${name} controller:`, error);
                }
            }

            // Setup navigation and initial view
            this._setupNavigation();
            this._startTimeUpdate();
            
            // Connect to backend
            await this._connectToBackend();
            
            // Show initial view
            await this.showView('dashboard');
            
            console.log('Dashboard initialized successfully');
            this._hideLoadingOverlay();
            
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            this._showNotification('Failed to initialize dashboard', 'error');
            this._hideLoadingOverlay();
        }
    }

    async _connectToBackend() {
        try {
            await window.api.connect();
            this._showNotification('Connected to backend', 'success');
        } catch (error) {
            console.error('Failed to connect to backend:', error);
            this._showNotification('Failed to connect to backend', 'error');
        }
    }

    _setupAPIEventHandlers() {
        // Listen to API events and update store
        window.api.on('connectionStatus', (status) => {
            window.store.setConnectionStatus(status.status);
            this._updateConnectionUI(status);
        });

        window.api.on('sensorsLoaded', (sensors) => {
            window.store.setSensors(sensors);
            this._loadSystemStats();
        });

        window.api.on('sensorConnected', (sensor) => {
            window.store.addOrUpdateSensor(sensor);
        });

        window.api.on('sensorUpdate', (data) => {
            window.store.updateSensorData(
                data.sensor_id, 
                data.data?.value || data.value, 
                data.timestamp
            );
        });

        window.api.on('alarmUpdate', (data) => {
            window.store.addAlarm(data.alarm);
        });
    }

    async _loadSystemStats() {
        try {
            const stats = await window.api.getDashboardStats();
            window.store.updateSystemStats(stats);
        } catch (error) {
            console.error('Failed to load system stats:', error);
        }
    }

    _updateConnectionUI(status) {
        const healthEl = document.getElementById('healthStatus');
        const dotEl = document.getElementById('healthDot');
        
        if (status.status === 'connected') {
            if (healthEl) healthEl.style.color = '#2ecc71';
            if (dotEl) dotEl.className = 'health-dot connected';
        } else {
            if (healthEl) healthEl.style.color = '#e74c3c';
            if (dotEl) dotEl.className = 'health-dot error';
        }
    }

    _startTimeUpdate() {
        this._updateCurrentTime();
        setInterval(() => this._updateCurrentTime(), 1000);
    }

    _updateCurrentTime() {
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            const timeString = new Date().toLocaleTimeString('en-GB', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            timeElement.textContent = timeString;
        }

        // Update uptime
        const uptimeElement = document.getElementById('systemUptime');
        if (uptimeElement) {
            const uptime = Date.now() - this.systemStartTime;
            uptimeElement.textContent = this._formatUptime(uptime);
        }
    }

    _formatUptime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }

    _setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = item.getAttribute('data-view');
                if (viewName) this.showView(viewName);
            });
        });
    }

    async showView(viewName) {
        try {
            // Hide all views and update navigation
            document.querySelectorAll('.view').forEach(view => view.style.display = 'none');
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.toggle('active', item.getAttribute('data-view') === viewName);
            });

            // Show target view
            const viewElement = document.getElementById(`${viewName}View`);
            if (viewElement) viewElement.style.display = 'block';

            // Controllers are already initialized during app startup
            this.currentView = viewName;
            console.log(`Switched to ${viewName} view`);

        } catch (error) {
            console.error(`Failed to show ${viewName} view:`, error);
            this._showNotification(`Failed to load ${viewName} view`, 'error');
        }
    }

    _showNotification(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        const colors = {
            success: '#2ecc71',
            error: '#e74c3c',
            warning: '#f39c12',
            info: '#3498db'
        };

        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, type === 'error' ? 5000 : 3000);
    }

    _hideLoadingOverlay() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    window.dashboardApp = new IoTDashboard();
    await window.dashboardApp.init();
});
