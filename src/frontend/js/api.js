// API configuration and utilities
class API {
    constructor() {
        this.baseURL = 'http://localhost:5000/api';
        this.socket = null;
        this.isConnected = false;
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

        // Prepare socket (but don't auto-connect) — use connect() to start
        this.socket = null;
        this.isConnected = false;
    }

    // Create the socket instance but don't connect automatically
    createSocket() {
        if (this.socket) return this.socket;

        const socketURL = this.baseURL.replace('/api', '');
        // Create socket with autoConnect false so we can control connection lifecycle
        this.socket = io(socketURL, { autoConnect: false });

        // Wire socket events
        this.socket.on('connect', () => {
            console.log('Connected to backend (API)');
            this.isConnected = true;
            this.updateConnectionStatus('connected', 'Connected');
            // Emit a global event for other parts of the app
            window.dispatchEvent(new CustomEvent('connectionStatus', { detail: { status: 'connected', message: 'Connected' } }));
            // Fetch current sensors list on connect so UI can show newly appeared sensors
            this.getSensors().then(list => {
                window.dispatchEvent(new CustomEvent('sensorsList', { detail: list }));
            }).catch(err => {
                console.warn('Failed to fetch sensors after connect:', err);
            });
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from backend (API)', reason);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Disconnected');
            window.dispatchEvent(new CustomEvent('connectionStatus', { detail: { status: 'disconnected', message: 'Disconnected' } }));
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error (API):', error);
            this.isConnected = false;
            this.updateConnectionStatus('error', 'Connection Error');
            window.dispatchEvent(new CustomEvent('connectionStatus', { detail: { status: 'error', message: 'Connection Error', error } }));
        });

        // Forward domain events
        this.socket.on('sensor_update', (data) => this.onSensorUpdate(data));
        this.socket.on('alarm_update', (data) => this.onAlarmUpdate(data));
        // New sensor connected (server-side notification)
        this.socket.on('sensor_connected', (data) => {
            console.log('sensor_connected event received:', data);
            // Emit a higher-level event for controllers to handle
            window.dispatchEvent(new CustomEvent('sensorConnected', { detail: data }));
        });

        return this.socket;
    }

    // Connect to the backend socket; returns a Promise that resolves on successful connect
    connect() {
        return new Promise((resolve, reject) => {
            try {
                const socket = this.createSocket();
                // Handle immediate connect state
                if (socket.connected) {
                    this.isConnected = true;
                    this.updateConnectionStatus('connected', 'Connected');
                    resolve();
                    return;
                }

                socket.once('connect', () => resolve());
                socket.once('connect_error', (err) => reject(err));

                socket.connect();
                this.updateConnectionStatus('connecting', 'Connecting...');
                window.dispatchEvent(new CustomEvent('connectionStatus', { detail: { status: 'connecting', message: 'Connecting...' } }));
            } catch (err) {
                reject(err);
            }
        });
    }

    // Graceful disconnect
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Disconnected');
            window.dispatchEvent(new CustomEvent('connectionStatus', { detail: { status: 'disconnected', message: 'Disconnected' } }));
        }
    }

    initSocket() {
        const socketURL = this.baseURL.replace('/api', '');
        this.socket = io(socketURL);

        this.socket.on('connect', () => {
            console.log('Connected to backend');
            this.isConnected = true;
            this.updateConnectionStatus('connected', 'Connected');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from backend');
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Disconnected');
        });

        this.socket.on('connect_error', () => {
            console.log('Connection error');
            this.isConnected = false;
            this.updateConnectionStatus('error', 'Connection Error');
        });

        // Listen for real-time updates
        this.socket.on('sensor_update', (data) => {
            this.onSensorUpdate(data);
        });

        this.socket.on('alarm_update', (data) => {
            this.onAlarmUpdate(data);
        });
    }

    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('statusText');
        const indicatorElement = document.getElementById('statusIndicator');
        
        if (statusElement) statusElement.textContent = message;
        if (indicatorElement) {
            indicatorElement.className = 'status-indicator';
            if (status === 'connected') {
                indicatorElement.classList.add('connected');
            } else if (status === 'connecting') {
                indicatorElement.classList.add('connecting');
            }
        }
    }

    onSensorUpdate(data) {
        // Emit custom event for sensor updates
        window.dispatchEvent(new CustomEvent('sensorUpdate', { detail: data }));
    }

    onAlarmUpdate(data) {
        // Emit custom event for alarm updates
        window.dispatchEvent(new CustomEvent('alarmUpdate', { detail: data }));
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
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

    // Sensor endpoints
    async getSensors() {
        return this.request('/sensors');
    }

    async getSensorData(sensorId, limit = 100) {
        return this.request(`/sensors/${sensorId}/data?limit=${limit}`);
    }

    // Alarm endpoints
    async getAlarms(limit = 50, acknowledged = null) {
        let url = `/alarms?limit=${limit}`;
        if (acknowledged !== null) {
            url += `&acknowledged=${acknowledged}`;
        }
        return this.request(url);
    }

    async acknowledgeAlarm(alarmId) {
        return this.request(`/alarms/${alarmId}/acknowledge`, {
            method: 'POST'
        });
    }

    // Dashboard endpoints
    async getDashboardStats() {
        return this.request('/dashboard/stats');
    }

    // Utility methods
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString();
    }

    formatSensorValue(value, sensorType) {
        switch (sensorType) {
            case 'humidity':
                return `${value.toFixed(1)}%`;
            case 'vibration':
                return `${value.toFixed(2)} Hz`;
            case 'stress':
                return `${value.toFixed(1)} MPa`;
            default:
                return value.toFixed(2);
        }
    }

    getSensorStatus(value, sensorType) {
        // Define thresholds for different sensor types
        const thresholds = {
            humidity: { critical: [0, 20, 80, 100], warning: [20, 30, 70, 80] },
            vibration: { critical: [50, Infinity], warning: [20, 50] },
            stress: { critical: [80, Infinity], warning: [60, 80] }
        };

        const threshold = thresholds[sensorType];
        if (!threshold) return 'normal';

        // Check critical thresholds
        for (let i = 0; i < threshold.critical.length; i += 2) {
            const min = threshold.critical[i];
            const max = threshold.critical[i + 1];
            if (value >= min && value <= max) {
                return 'critical';
            }
        }

        // Check warning thresholds
        for (let i = 0; i < threshold.warning.length; i += 2) {
            const min = threshold.warning[i];
            const max = threshold.warning[i + 1];
            if (value >= min && value <= max) {
                return 'warning';
            }
        }

        return 'normal';
    }
}

// Create global API instance
window.api = new API();
