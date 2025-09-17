// Dashboard Controller - Live System State
class DashboardController {
    constructor() {
        this.devices = [];
        this.mqttTopics = new Map();
        this.systemStartTime = Date.now();
        this.lastUpdateTime = null;
    }

    async init() {
        await this.loadSystemData();
        this.setupEventListeners();
        this.startPeriodicUpdates();
    }

    async loadSystemData() {
        try {
            // Load sensors as devices
            const sensors = await window.api.getSensors();
            this.devices = sensors.map(sensor => ({
                id: sensor.sensor_id,
                name: sensor.sensor_id,
                location: sensor.location,
                type: 'sensor',
                subtype: sensor.sensor_type,
                status: 'online',
                lastValue: null,
                lastSeen: new Date(),
                lastUpdate: null
            }));

            // Load latest values for each device
            await this.loadDeviceValues();
            
            // Update UI
            this.updateSystemHealth();
            this.updateDeviceCards();
            this.updateMqttTopics();

        } catch (error) {
            console.error('Failed to load system data:', error);
        }
    }

    async loadDeviceValues() {
        for (const device of this.devices) {
            try {
                const data = await window.api.getSensorData(device.id, 1);
                if (data && data.length > 0) {
                    device.lastValue = data[0].value;
                    device.lastUpdate = new Date(data[0].timestamp);
                    device.lastSeen = new Date(data[0].timestamp);
                    device.status = this.calculateDeviceStatus(device);
                }
            } catch (error) {
                console.error(`Failed to load data for device ${device.id}:`, error);
                device.status = 'offline';
            }
        }
    }

    calculateDeviceStatus(device) {
        if (!device.lastValue || !device.lastUpdate) return 'offline';
        
        const timeSinceUpdate = Date.now() - device.lastUpdate.getTime();
        if (timeSinceUpdate > 300000) return 'offline'; // 5 minutes
        
        const status = window.api.getSensorStatus(device.lastValue, device.subtype);
        return status;
    }

    updateSystemHealth() {
        const activeDevices = this.devices.filter(d => d.status !== 'offline').length;
        const criticalDevices = this.devices.filter(d => d.status === 'critical').length;
        const warningDevices = this.devices.filter(d => d.status === 'warning').length;
        
        // Determine overall system health
        let systemHealth = 'normal';
        let healthStatus = 'NORMAL';
        
        if (criticalDevices > 0) {
            systemHealth = 'critical';
            healthStatus = 'CRITICAL';
        } else if (warningDevices > 0) {
            systemHealth = 'warning';
            healthStatus = 'WARNING';
        }

        // Update health indicator
        const healthStatusEl = document.getElementById('healthStatus');
        const healthDotEl = document.getElementById('healthDot');
        
        if (healthStatusEl) {
            healthStatusEl.textContent = healthStatus;
            healthStatusEl.style.color = this.getStatusColor(systemHealth);
        }
        
        if (healthDotEl) {
            healthDotEl.className = `health-dot ${systemHealth}`;
        }

        // Update metrics
        this.updateElement('activeDevices', activeDevices);
        this.updateElement('criticalAlarms', criticalDevices);
        this.updateElement('systemUptime', this.formatUptime(Date.now() - this.systemStartTime));
        this.updateElement('lastUpdate', new Date().toLocaleTimeString());
    }

    updateDeviceCards() {
        const container = document.getElementById('deviceCards');
        if (!container) return;

        container.innerHTML = this.devices.map(device => {
            const timeDelta = device.lastUpdate ? 
                this.formatTimeDelta(Date.now() - device.lastUpdate.getTime()) : 'Never';
            
            return `
                <div class="device-card ${device.status}" data-device-id="${device.id}">
                    <div class="device-card-header">
                        <div class="device-id">${device.id}</div>
                        <div class="device-status-dot ${device.status}"></div>
                    </div>
                    <div class="device-value">
                        ${device.lastValue !== null ? 
                            window.api.formatSensorValue(device.lastValue, device.subtype) : 
                            'No Data'}
                    </div>
                    <div class="device-meta">
                        <div class="device-location">${device.location}</div>
                        <div class="device-delta">${timeDelta}</div>
                    </div>
                    <div class="device-info">
                        <small>${device.subtype} • ${device.status}</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateMqttTopics() {
        const tableBody = document.getElementById('mqttTopicsBody');
        if (!tableBody) return;

        if (this.mqttTopics.size === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">No MQTT data received yet</td></tr>';
            return;
        }

        tableBody.innerHTML = Array.from(this.mqttTopics.entries()).map(([topic, data]) => {
            const timeDelta = this.formatTimeDelta(Date.now() - data.timestamp.getTime());
            const deltaClass = this.getTimeDeltaClass(Date.now() - data.timestamp.getTime());
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

    handleSensorUpdate(data) {
        // Update device data
        const device = this.devices.find(d => d.id === data.sensor_id);
        if (device) {
            device.lastValue = data.data.value;
            device.lastUpdate = new Date(data.timestamp);
            device.lastSeen = new Date(data.timestamp);
            device.status = this.calculateDeviceStatus(device);
        }

        // Update MQTT topics
        const topic = `sensors/${data.sensor_id}/data`;
        this.mqttTopics.set(topic, {
            payload: data.data,
            timestamp: new Date(data.timestamp)
        });

        // Update UI
        this.updateSystemHealth();
        this.updateDeviceCards();
        this.updateMqttTopics();
    }

    handleAlarmUpdate(data) {
        // Update MQTT topics
        const topic = `alarms/${data.sensor_id}`;
        this.mqttTopics.set(topic, {
            payload: data.alarm,
            timestamp: new Date(data.timestamp)
        });

        // Update device status if it's an alarm
        const device = this.devices.find(d => d.id === data.sensor_id);
        if (device && data.alarm.level === 'critical') {
            device.status = 'critical';
        }

        // Update UI
        this.updateSystemHealth();
        this.updateDeviceCards();
        this.updateMqttTopics();
    }

    setupEventListeners() {
        // Real-time updates
        window.addEventListener('sensorUpdate', (event) => {
            this.handleSensorUpdate(event.detail);
        });

        window.addEventListener('alarmUpdate', (event) => {
            this.handleAlarmUpdate(event.detail);
        });

        // MQTT refresh button
        const refreshBtn = document.getElementById('refreshMqttBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.updateMqttTopics();
            });
        }

        // Device card click handlers
        document.addEventListener('click', (e) => {
            const deviceCard = e.target.closest('.device-card');
            if (deviceCard) {
                const deviceId = deviceCard.dataset.deviceId;
                this.showDeviceDetails(deviceId);
            }
        });
    }

    startPeriodicUpdates() {
        // Update every 30 seconds
        setInterval(() => {
            this.updateSystemHealth();
            
            // Check for stale devices
            this.devices.forEach(device => {
                if (device.lastUpdate) {
                    const timeSinceUpdate = Date.now() - device.lastUpdate.getTime();
                    if (timeSinceUpdate > 300000 && device.status !== 'offline') { // 5 minutes
                        device.status = 'offline';
                    }
                }
            });
            
            this.updateDeviceCards();
        }, 10000);
    }

    showDeviceDetails(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) return;

        // For now, show an alert with device details
        // In a full implementation, this could open a modal or navigate to a detail view
        alert(`Device Details:\n\nID: ${device.id}\nType: ${device.subtype}\nLocation: ${device.location}\nStatus: ${device.status}\nLast Value: ${device.lastValue !== null ? window.api.formatSensorValue(device.lastValue, device.subtype) : 'No Data'}\nLast Seen: ${device.lastSeen ? device.lastSeen.toLocaleString() : 'Never'}`);
    }

    // Utility methods
    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    formatUptime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    formatTimeDelta(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return `${seconds}s ago`;
    }

    getTimeDeltaClass(milliseconds) {
        const minutes = milliseconds / (1000 * 60);
        if (minutes > 10) return 'offline';
        if (minutes > 5) return 'stale';
        return '';
    }

    getStatusColor(status) {
        switch (status) {
            case 'critical': return '#ff4757';
            case 'warning': return '#ffa502';
            case 'normal': return '#2ed573';
            default: return '#666';
        }
    }
}

// Create global dashboard instance
window.dashboard = new DashboardController();
