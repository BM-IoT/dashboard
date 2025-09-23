// Simplified API client with unified interface
class API {
    constructor() {
        this.baseURL = 'http://localhost:5000/api';
        this.socket = null;
        this.isConnected = false;
        this.eventListeners = new Map();
    }

    async init() {
        // Get backend URL from Electron if available
        if (window.electronAPI) {
            try {
                const backendUrl = await window.electronAPI.getBackendUrl();
                this.baseURL = `${backendUrl}/api`;
            } catch (error) {
                console.warn('Could not get backend URL from Electron:', error);
            }
        }
    }

    // Simplified socket connection with automatic event handling
    async connect() {
        if (this.socket?.connected) return;

        const socketURL = this.baseURL.replace('/api', '');
        this.socket = io(socketURL, { autoConnect: false });

        return new Promise((resolve, reject) => {
            this.socket.once('connect', () => {
                console.log('Connected to backend');
                this.isConnected = true;
                this._updateConnectionStatus('connected', 'Connected');
                this._setupEventHandlers();
                resolve();
            });

            this.socket.once('connect_error', (error) => {
                console.error('Connection error:', error);
                this.isConnected = false;
                this._updateConnectionStatus('error', 'Connection Error');
                reject(error);
            });

            this.socket.connect();
            this._updateConnectionStatus('connecting', 'Connecting...');
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this._updateConnectionStatus('disconnected', 'Disconnected');
        }
    }

    // Event handling with simplified interface
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).delete(callback);
        }
    }

    _emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    _setupEventHandlers() {
        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from backend:', reason);
            this.isConnected = false;
            this._updateConnectionStatus('disconnected', 'Disconnected');
        });

        this.socket.on('sensor_update', (data) => {
            this._emit('sensorUpdate', data);
        });

        this.socket.on('alarm_update', (data) => {
            this._emit('alarmUpdate', data);
        });

        this.socket.on('sensor_connected', (data) => {
            this._emit('sensorConnected', data);
        });

        // Load initial sensor list
        this.getSensors().then(sensors => {
            this._emit('sensorsLoaded', sensors);
        }).catch(console.error);
    }

    _updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('statusText');
        const indicatorElement = document.getElementById('statusIndicator');
        
        if (statusElement) statusElement.textContent = message;
        if (indicatorElement) {
            indicatorElement.className = `status-indicator ${status}`;
        }

        this._emit('connectionStatus', { status, message });
    }

    // Simplified HTTP request method
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        };

        try {
            const response = await fetch(url, config);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    // API endpoints
    async getSensors() {
        return this.request('/sensors');
    }

    async getSensorData(sensorId, limit = 100) {
        return this.request(`/sensors/${sensorId}/data?limit=${limit}`);
    }

    async getAlarms(limit = 50, acknowledged = null) {
        let url = `/alarms?limit=${limit}`;
        if (acknowledged !== null) {
            url += `&acknowledged=${acknowledged}`;
        }
        return this.request(url);
    }

    async acknowledgeAlarm(alarmId) {
        return this.request(`/alarms/${alarmId}/acknowledge`, { method: 'POST' });
    }

    async getDashboardStats() {
        return this.request('/dashboard/stats');
    }

    // Utility methods
    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    formatSensorValue(value, sensorType) {
        // Handle null, undefined, or non-numeric values
        if (value === null || value === undefined || isNaN(value)) {
            return 'No Data';
        }
        
        // Convert to number if it's a string
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(numValue)) {
            return 'Invalid Data';
        }
        
        const formatters = {
            humidity: v => `${v.toFixed(1)}%`,
            vibration: v => `${v.toFixed(2)} Hz`,
            stress: v => `${v.toFixed(1)} MPa`,
            default: v => v.toFixed(2)
        };
        return (formatters[sensorType] || formatters.default)(numValue);
    }

    getSensorStatus(value, sensorType) {
        // Handle null, undefined, or non-numeric values
        if (value === null || value === undefined || isNaN(value)) {
            return 'offline';
        }
        
        // Convert to number if it's a string
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(numValue)) {
            return 'offline';
        }
        
        const thresholds = {
            humidity: { critical: [[0, 20], [80, 100]], warning: [[20, 30], [70, 80]] },
            vibration: { critical: [[50, Infinity]], warning: [[20, 50]] },
            stress: { critical: [[80, Infinity]], warning: [[60, 80]] }
        };

        const threshold = thresholds[sensorType];
        if (!threshold) return 'normal';

        const checkRanges = (ranges) => ranges.some(([min, max]) => numValue >= min && numValue <= max);
        
        if (checkRanges(threshold.critical)) return 'critical';
        if (checkRanges(threshold.warning)) return 'warning';
        return 'normal';
    }
}

// Create global API instance
window.api = new API();
