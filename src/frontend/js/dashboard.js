// Simplified Dashboard Controller - Live System State
class DashboardController {
    constructor() {
        this.mqttTopics = new Map();
        this.updateInterval = null;
    }

    async init() {
        this._setupEventListeners();
        this._startPeriodicUpdates();
        this._loadInitialData();
    }

    _setupEventListeners() {
        // Subscribe to store updates
        window.store.subscribe('sensors', (sensors) => this._updateDeviceCards(sensors));
        window.store.subscribe('systemStats', (stats) => this._updateSystemMetrics(stats));
        window.store.subscribe('connectionStatus', (status) => this._updateSystemHealth(status));
        window.store.subscribe('sensorData', ({ sensor }) => this._updateDeviceCard(sensor));
        
        // Subscribe to API events for MQTT table updates
        window.api.on('sensorUpdate', (data) => this._handleSensorUpdate(data));
        window.api.on('alarmUpdate', (data) => this._handleAlarmUpdate(data));
        
        // MQTT refresh button
        const refreshBtn = document.getElementById('refreshMqttBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this._updateMqttTopics());
        }

        // Device card click handlers
        document.addEventListener('click', (e) => {
            const deviceCard = e.target.closest('.device-card');
            if (deviceCard) {
                const deviceId = deviceCard.dataset.deviceId;
                this._showDeviceDetails(deviceId);
            }
        });
    }

    async _loadInitialData() {
        try {
            this._updateDeviceCards(window.store.getSensors());
            this._updateSystemMetrics(window.store.getSystemStats());
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        }
    }

    _startPeriodicUpdates() {
        this.updateInterval = setInterval(() => {
            this._updateMqttTopics();
        }, 5000);
    }

    _updateSystemHealth(connectionStatus) {
        const sensors = window.store.getSensors();
        const activeSensors = sensors.filter(s => s.status !== 'offline').length;
        const criticalSensors = sensors.filter(s => s.status === 'critical').length;
        
        let healthStatus = 'NORMAL';
        let healthClass = 'normal';
        
        if (connectionStatus !== 'connected') {
            healthStatus = 'DISCONNECTED';
            healthClass = 'error';
        } else if (criticalSensors > 0) {
            healthStatus = 'CRITICAL';
            healthClass = 'critical';
        } else if (sensors.some(s => s.status === 'warning')) {
            healthStatus = 'WARNING';
            healthClass = 'warning';
        }

        this._updateElement('healthStatus', healthStatus);
        this._updateElement('activeDevices', activeSensors);
        this._updateElement('criticalAlarms', criticalSensors);
        
        const healthDot = document.getElementById('healthDot');
        if (healthDot) {
            healthDot.className = `health-dot ${healthClass}`;
        }
    }

    _updateSystemMetrics(stats) {
        if (stats.active_sensors !== undefined) {
            this._updateElement('activeDevices', stats.active_sensors);
        }
        if (stats.unacknowledged_alarms !== undefined) {
            this._updateElement('criticalAlarms', stats.unacknowledged_alarms);
        }
    }

    _updateDeviceCards(sensors) {
        const container = document.getElementById('deviceCards');
        if (!container) return;

        if (sensors.length === 0) {
            container.innerHTML = '<div class="no-devices">No devices connected</div>';
            return;
        }

        container.innerHTML = sensors.map(sensor => this._createDeviceCard(sensor)).join('');
        this._updateElement('lastUpdate', new Date().toLocaleTimeString());
    }

    _updateDeviceCard(sensor) {
        const card = document.querySelector(`[data-device-id="${sensor.id}"]`);
        if (card) {
            card.outerHTML = this._createDeviceCard(sensor);
        }
    }

    _createDeviceCard(sensor) {
        const timeDelta = sensor.lastUpdate ? 
            this._formatTimeDelta(Date.now() - sensor.lastUpdate.getTime()) : 'Never';
        
        return `
            <div class="device-card ${sensor.status}" data-device-id="${sensor.id}">
                <div class="device-card-header">
                    <div class="device-id">${sensor.id}</div>
                    <div class="device-status-dot ${sensor.status}"></div>
                </div>
                <div class="device-value">
                    ${(sensor.lastValue !== null && sensor.lastValue !== undefined) ? 
                        window.api.formatSensorValue(sensor.lastValue, sensor.type) : 
                        'No Data'}
                </div>
                <div class="device-meta">
                    <div class="device-location">${sensor.location}</div>
                    <div class="device-delta">${timeDelta}</div>
                </div>
                <div class="device-info">
                    <small>${sensor.type} • ${sensor.status}</small>
                </div>
            </div>
        `;
    }

    _updateMqttTopics() {
        const tableBody = document.getElementById('mqttTopicsBody');
        if (!tableBody) return;

        if (this.mqttTopics.size === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">No MQTT data received yet</td></tr>';
            return;
        }

        tableBody.innerHTML = Array.from(this.mqttTopics.entries()).map(([topic, data]) => {
            const timeDelta = this._formatTimeDelta(Date.now() - data.timestamp.getTime());
            const deltaClass = this._getTimeDeltaClass(Date.now() - data.timestamp.getTime());
            const fullMessage = JSON.stringify(data.payload, null, 2);
            const truncatedMessage = JSON.stringify(data.payload).substring(0, 50);
            
            return `
                <tr>
                    <td class="mqtt-topic">${topic}</td>
                    <td class="mqtt-payload" title="${fullMessage.replace(/\"/g, '&quot;')}">${truncatedMessage}${truncatedMessage.length < JSON.stringify(data.payload).length ? '...' : ''}</td>
                    <td class="time-delta ${deltaClass}">${timeDelta}</td>
                    <td class="mqtt-timestamp">${data.timestamp.toLocaleString()}</td>
                </tr>
            `;
        }).join('');
    }

    _showDeviceDetails(deviceId) {
        const sensor = window.store.getSensor(deviceId);
        if (!sensor) return;

        alert(`Device Details:\n\nID: ${sensor.id}\nType: ${sensor.type}\nLocation: ${sensor.location}\nStatus: ${sensor.status}\nLast Value: ${(sensor.lastValue !== null && sensor.lastValue !== undefined) ? window.api.formatSensorValue(sensor.lastValue, sensor.type) : 'No Data'}\nLast Update: ${sensor.lastUpdate ? sensor.lastUpdate.toLocaleString() : 'Never'}`);
    }

    _updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    _formatTimeDelta(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return `${seconds}s ago`;
    }

    _getTimeDeltaClass(milliseconds) {
        const minutes = milliseconds / (1000 * 60);
        if (minutes > 10) return 'offline';
        if (minutes > 5) return 'stale';
        return '';
    }

    _handleSensorUpdate(data) {
        // Update MQTT topics table
        const topic = `sensors/${data.sensor_id}/data`;
        this.mqttTopics.set(topic, {
            payload: data.data || data,
            timestamp: new Date(data.timestamp)
        });
        this._updateMqttTopics();
    }

    _handleAlarmUpdate(data) {
        // Update MQTT topics table
        const topic = `alarms/${data.sensor_id}`;
        this.mqttTopics.set(topic, {
            payload: data.alarm || data,
            timestamp: new Date(data.timestamp)
        });
        this._updateMqttTopics();
    }
}
