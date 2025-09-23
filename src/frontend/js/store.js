// Centralized data store for simplified state management
class DataStore {
    constructor() {
        this.state = {
            sensors: new Map(),
            alarms: [],
            systemStats: {},
            connectionStatus: 'disconnected'
        };
        this.listeners = new Map();
    }

    // Subscribe to state changes
    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);
        
        return () => this.listeners.get(key).delete(callback);
    }

    // Notify listeners of state changes
    _notify(key, data) {
        if (this.listeners.has(key)) {
            this.listeners.get(key).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in listener for ${key}:`, error);
                }
            });
        }
    }

    // Sensor management
    setSensors(sensors) {
        this.state.sensors.clear();
        sensors.forEach(sensor => {
            this.state.sensors.set(sensor.sensor_id, {
                id: sensor.sensor_id,
                type: sensor.sensor_type,
                location: sensor.location,
                status: sensor.status || 'active',
                lastValue: null,
                lastUpdate: null,
                readings: []
            });
        });
        this._notify('sensors', Array.from(this.state.sensors.values()));
    }

    addOrUpdateSensor(sensorData) {
        const sensorId = sensorData.sensor_id || sensorData.id;
        if (!sensorId) return;

        let sensor = this.state.sensors.get(sensorId);
        if (!sensor) {
            sensor = {
                id: sensorId,
                type: sensorData.sensor_type || sensorData.type || 'unknown',
                location: sensorData.location || 'unknown',
                status: 'active',
                lastValue: null,
                lastUpdate: null,
                readings: []
            };
            this.state.sensors.set(sensorId, sensor);
        }

        // Update sensor metadata
        if (sensorData.sensor_type) sensor.type = sensorData.sensor_type;
        if (sensorData.location) sensor.location = sensorData.location;
        if (sensorData.status) sensor.status = sensorData.status;

        this._notify('sensorUpdated', sensor);
        this._notify('sensors', Array.from(this.state.sensors.values()));
    }

    updateSensorData(sensorId, value, timestamp) {
        const sensor = this.state.sensors.get(sensorId);
        if (!sensor) return;

        // Validate and sanitize the value
        let sanitizedValue = value;
        if (value !== null && value !== undefined) {
            // Convert string numbers to actual numbers
            if (typeof value === 'string') {
                const parsed = parseFloat(value);
                sanitizedValue = isNaN(parsed) ? null : parsed;
            } else if (typeof value === 'number' && !isNaN(value)) {
                sanitizedValue = value;
            } else {
                sanitizedValue = null;
            }
        } else {
            sanitizedValue = null;
        }

        sensor.lastValue = sanitizedValue;
        sensor.lastUpdate = new Date(timestamp);
        sensor.status = this._calculateSensorStatus(sensor);
        
        // Keep limited history - only add valid values to readings
        if (sanitizedValue !== null) {
            sensor.readings.push({ value: sanitizedValue, timestamp });
        }
        if (sensor.readings.length > 100) {
            sensor.readings = sensor.readings.slice(-100);
        }

        this._notify('sensorData', { sensorId, sensor });
        this._notify('sensors', Array.from(this.state.sensors.values()));
    }

    _calculateSensorStatus(sensor) {
        if (!sensor.lastUpdate) return 'offline';
        
        const timeSinceUpdate = Date.now() - sensor.lastUpdate.getTime();
        if (timeSinceUpdate > 300000) return 'offline'; // 5 minutes
        
        if (sensor.lastValue !== null) {
            return window.api.getSensorStatus(sensor.lastValue, sensor.type);
        }
        
        return 'active';
    }

    // Alarm management
    setAlarms(alarms) {
        this.state.alarms = alarms.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        this._notify('alarms', this.state.alarms);
    }

    addAlarm(alarm) {
        this.state.alarms.unshift(alarm);
        if (this.state.alarms.length > 1000) {
            this.state.alarms = this.state.alarms.slice(0, 1000);
        }
        this._notify('newAlarm', alarm);
        this._notify('alarms', this.state.alarms);
    }

    acknowledgeAlarm(alarmId) {
        const alarm = this.state.alarms.find(a => a.id === alarmId);
        if (alarm) {
            alarm.acknowledged = true;
            this._notify('alarms', this.state.alarms);
        }
    }

    // System stats
    updateSystemStats(stats) {
        this.state.systemStats = { ...stats };
        this._notify('systemStats', this.state.systemStats);
    }

    // Connection status
    setConnectionStatus(status) {
        this.state.connectionStatus = status;
        this._notify('connectionStatus', status);
    }

    // Getters
    getSensors() {
        return Array.from(this.state.sensors.values());
    }

    getSensor(sensorId) {
        return this.state.sensors.get(sensorId);
    }

    getAlarms() {
        return this.state.alarms;
    }

    getSystemStats() {
        return this.state.systemStats;
    }

    isConnected() {
        return this.state.connectionStatus === 'connected';
    }
}

// Create global store instance
window.store = new DataStore();