// Devices View Controller - Network Overview
class DevicesController {
    constructor() {
        this.devices = [];
        this.filteredDevices = [];
    }

    async init() {
        await this.loadDevices();
        this.setupEventListeners();
        this.renderDevicesTable();
    }

    async loadDevices() {
        try {
            const sensors = await window.api.getSensors();
            this.devices = sensors.map(sensor => ({
                id: sensor.sensor_id,
                name: sensor.sensor_id,
                location: sensor.location,
                type: 'sensor',
                subtype: sensor.sensor_type,
                status: 'online',
                lastSeen: new Date(),
                lastValue: null
            }));

            // Load latest values and update status
            await this.updateDeviceStatus();
            this.filteredDevices = [...this.devices];

        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    }

    async updateDeviceStatus() {
        for (const device of this.devices) {
            try {
                const data = await window.api.getSensorData(device.id, 1);
                if (data && data.length > 0) {
                    device.lastValue = data[0].value;
                    device.lastSeen = new Date(data[0].timestamp);
                    
                    // Determine online/offline status based on last seen time
                    const timeSinceLastSeen = Date.now() - device.lastSeen.getTime();
                    device.status = timeSinceLastSeen > 300000 ? 'offline' : 'online'; // 5 minutes threshold
                } else {
                    device.status = 'offline';
                }
            } catch (error) {
                console.error(`Failed to update status for device ${device.id}:`, error);
                device.status = 'offline';
            }
        }
    }

    setupEventListeners() {
        // Filter controls
        const typeFilter = document.getElementById('deviceTypeFilter');
        const statusFilter = document.getElementById('deviceStatusFilter');
        const searchInput = document.getElementById('deviceSearch');

        if (typeFilter) {
            typeFilter.addEventListener('change', () => this.applyFilters());
        }
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.applyFilters());
        }
        if (searchInput) {
            searchInput.addEventListener('input', () => this.applyFilters());
        }

        // Real-time updates
        window.addEventListener('sensorUpdate', (event) => {
            this.handleDeviceUpdate(event.detail);
        });
    }

    applyFilters() {
        const typeFilter = document.getElementById('deviceTypeFilter')?.value || '';
        const statusFilter = document.getElementById('deviceStatusFilter')?.value || '';
        const searchTerm = document.getElementById('deviceSearch')?.value.toLowerCase() || '';

        this.filteredDevices = this.devices.filter(device => {
            const matchesType = !typeFilter || device.type === typeFilter;
            const matchesStatus = !statusFilter || device.status === statusFilter;
            const matchesSearch = !searchTerm || 
                device.id.toLowerCase().includes(searchTerm) ||
                device.name.toLowerCase().includes(searchTerm) ||
                device.location.toLowerCase().includes(searchTerm);

            return matchesType && matchesStatus && matchesSearch;
        });

        this.renderDevicesTable();
    }

    renderDevicesTable() {
        const tableBody = document.getElementById('devicesTableBody');
        if (!tableBody) return;

        if (this.filteredDevices.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7">No devices found</td></tr>';
            return;
        }

        tableBody.innerHTML = this.filteredDevices.map(device => `
            <tr class="device-row ${device.status}">
                <td class="device-id">
                    <span class="status-indicator ${device.status}"></span>
                    ${device.id}
                </td>
                <td>${device.name}</td>
                <td>${device.location}</td>
                <td>
                    <span class="device-type-badge ${device.type}">
                        ${device.subtype || device.type}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${device.status}">
                        ${device.status.charAt(0).toUpperCase() + device.status.slice(1)}
                    </span>
                </td>
                <td>${device.lastSeen ? device.lastSeen.toLocaleString() : 'Never'}</td>
                <td>
                    <button class="btn btn-sm" onclick="window.devicesController.showDeviceDetails('${device.id}')">
                        Details
                    </button>
                    ${device.status === 'offline' ? 
                        `<button class="btn btn-sm btn-warning" onclick="window.devicesController.pingDevice('${device.id}')">Ping</button>` : 
                        ''}
                </td>
            </tr>
        `).join('');
    }

    handleDeviceUpdate(data) {
        const device = this.devices.find(d => d.id === data.sensor_id);
        if (device) {
            device.lastValue = data.data.value;
            device.lastSeen = new Date(data.timestamp);
            device.status = 'online';
            
            // Re-apply filters and re-render
            this.applyFilters();
        }
    }

    showDeviceDetails(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) return;

        // Show device details (could be expanded to a modal)
        alert(`Device Details:\n\nID: ${device.id}\nName: ${device.name}\nLocation: ${device.location}\nType: ${device.subtype}\nStatus: ${device.status}\nLast Seen: ${device.lastSeen ? device.lastSeen.toLocaleString() : 'Never'}\nLast Value: ${device.lastValue !== null ? window.api.formatSensorValue(device.lastValue, device.subtype) : 'No Data'}`);
    }

    async pingDevice(deviceId) {
        // Simulate pinging a device
        alert(`Pinging device ${deviceId}...`);
        // In a real implementation, this might send a command to the device
    }
}

// Sensor History Controller
class SensorHistoryController {
    constructor() {
        this.charts = {};
        this.sensorTypes = ['humidity', 'vibration', 'stress'];
        this.devices = [];
        this.updateThrottle = new Map(); // Throttle updates per device
        this.throttleDelay = 1000; // 1 second throttle
    }

    async init() {
        await this.loadDevices();
        this.setupEventListeners();
        this.initializeCharts();
        await this.loadHistoricalData();
    }

    async loadDevices() {
        try {
            const sensors = await window.api.getSensors();
            this.devices = sensors;
            this.populateDeviceSelect();
        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    }

    populateDeviceSelect() {
        const deviceSelect = document.getElementById('deviceSelect');
        if (!deviceSelect) return;

        deviceSelect.innerHTML = this.devices.map(device => 
            `<option value="${device.sensor_id}">${device.sensor_id} (${device.sensor_type})</option>`
        ).join('');
    }

    setupEventListeners() {
        const sensorTypeSelect = document.getElementById('sensorTypeSelect');
        const dateRangeSelect = document.getElementById('dateRangeSelect');
        const deviceSelect = document.getElementById('deviceSelect');
        const exportBtn = document.getElementById('exportDataBtn');

        if (sensorTypeSelect) {
            sensorTypeSelect.addEventListener('change', () => this.updateChartVisibility());
        }

        if (dateRangeSelect) {
            dateRangeSelect.addEventListener('change', (e) => {
                const customDates = document.querySelectorAll('#customStartDate, #customEndDate');
                customDates.forEach(input => {
                    input.style.display = e.target.value === 'custom' ? 'block' : 'none';
                });
                this.loadHistoricalData();
            });
        }

        if (deviceSelect) {
            deviceSelect.addEventListener('change', () => this.loadHistoricalData());
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportData());
        }

        // Real-time updates
        window.addEventListener('sensorUpdate', (event) => {
            this.handleSensorUpdate(event.detail);
        });
    }

    initializeCharts() {
        this.sensorTypes.forEach(type => {
            const canvasId = `${type}Chart`;
            const chart = window.chartManager.createChart(canvasId, 'line', {
                datasets: []
            }, {
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: this.getYAxisLabel(type)
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: `${type.charAt(0).toUpperCase() + type.slice(1)} Sensors History`
                    }
                }
            });
            
            this.charts[type] = chart;
        });
    }

    async loadHistoricalData() {
        const dateRange = document.getElementById('dateRangeSelect')?.value || 'week';
        const selectedDevices = Array.from(document.getElementById('deviceSelect')?.selectedOptions || [])
            .map(option => option.value);

        // Filter devices by selected ones or show all if none selected
        const devicesToLoad = selectedDevices.length > 0 ? 
            this.devices.filter(d => selectedDevices.includes(d.sensor_id)) : 
            this.devices;

        for (const type of this.sensorTypes) {
            const typeDevices = devicesToLoad.filter(d => d.sensor_type === type);
            const datasets = [];

            for (const device of typeDevices) {
                try {
                    const limit = this.getLimitForDateRange(dateRange);
                    const data = await window.api.getSensorData(device.sensor_id, limit);
                    
                    if (data && data.length > 0) {
                        datasets.push({
                            label: device.sensor_id,
                            data: data.map(point => ({
                                x: new Date(point.timestamp),
                                y: point.value
                            })).reverse(),
                            borderColor: this.getColorForDevice(device.sensor_id),
                            backgroundColor: this.getColorForDevice(device.sensor_id) + '20',
                            fill: false,
                            tension: 0.1
                        });
                    }
                } catch (error) {
                    console.error(`Failed to load data for ${device.sensor_id}:`, error);
                }
            }

            if (this.charts[type]) {
                this.charts[type].data.datasets = datasets;
                this.charts[type].update();
                
                // Update chart info
                const infoElement = document.getElementById(`${type}Info`);
                if (infoElement) {
                    infoElement.textContent = `${datasets.length} sensor(s), ${dateRange} range`;
                }
            }
        }

        this.updateChartVisibility();
    }

    updateChartVisibility() {
        const selectedType = document.getElementById('sensorTypeSelect')?.value || '';
        
        this.sensorTypes.forEach(type => {
            const card = document.getElementById(`${type}ChartCard`);
            if (card) {
                card.style.display = (!selectedType || selectedType === type) ? 'block' : 'none';
            }
        });
    }

    getLimitForDateRange(range) {
        switch (range) {
            case 'day': return 288; // 24 hours * 12 (5-minute intervals)
            case 'week': return 2016; // 7 days * 288
            case 'month': return 8640; // 30 days * 288
            default: return 2016;
        }
    }

    getYAxisLabel(type) {
        switch (type) {
            case 'humidity': return 'Humidity (%)';
            case 'vibration': return 'Vibration (Hz)';
            case 'stress': return 'Stress (MPa)';
            default: return 'Value';
        }
    }

    getColorForDevice(deviceId) {
        // Generate consistent colors for devices
        const colors = ['#3498db', '#e74c3c', '#f39c12', '#2ecc71', '#9b59b6', '#1abc9c'];
        const hash = deviceId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }

    exportData() {
        // Simple CSV export implementation
        alert('Export functionality would generate CSV with current chart data');
        // In a real implementation, this would collect all visible chart data and generate a CSV file
    }

    handleSensorUpdate(data) {
        // Check if this update is for a sensor we're currently displaying
        const selectedDevices = Array.from(document.getElementById('deviceSelect')?.selectedOptions || [])
            .map(option => option.value);
        
        // If no devices selected, show all, otherwise only show selected
        const shouldUpdate = selectedDevices.length === 0 || selectedDevices.includes(data.sensor_id);
        
        if (!shouldUpdate) return;

        // Skip if view is not active to save resources
        if (document.getElementById('sensor-historyView')?.style.display === 'none') return;

        // Throttle updates to prevent excessive chart redraws
        const now = Date.now();
        const lastUpdate = this.updateThrottle.get(data.sensor_id) || 0;
        
        if (now - lastUpdate < this.throttleDelay) {
            return; // Skip this update due to throttling
        }
        
        this.updateThrottle.set(data.sensor_id, now);

        // Find the device that matches this update
        const device = this.devices.find(d => d.sensor_id === data.sensor_id);
        if (!device) return;

        // Add new data point to the appropriate chart
        const sensorType = device.sensor_type;
        const chart = this.charts[sensorType];
        
        if (chart) {
            // Find the dataset for this device
            let dataset = chart.data.datasets.find(d => d.label === data.sensor_id);
            
            if (!dataset) {
                // Create new dataset if it doesn't exist
                dataset = {
                    label: data.sensor_id,
                    data: [],
                    borderColor: this.getColorForDevice(data.sensor_id),
                    backgroundColor: this.getColorForDevice(data.sensor_id) + '20',
                    fill: false,
                    tension: 0.1
                };
                chart.data.datasets.push(dataset);
            }

            // Add new data point
            const newPoint = {
                x: new Date(data.timestamp),
                y: data.value || data.data?.value || 0 // Handle different data structures
            };
            
            dataset.data.push(newPoint);

            // Keep only recent data points (e.g., last 1000 points)
            if (dataset.data.length > 1000) {
                dataset.data = dataset.data.slice(-1000);
            }

            // Sort data by timestamp to maintain order
            dataset.data.sort((a, b) => a.x.getTime() - b.x.getTime());

            // Update the chart with animation disabled for better performance
            chart.update('none');
        }
    }
}

// Alarm History Controller
class AlarmHistoryController {
    constructor() {
        this.alarms = [];
        this.timelineChart = null;
        this.lastUpdate = 0;
        this.updateThrottle = 2000; // 2 second throttle for alarm updates
    }

    async init() {
        await this.loadAlarmHistory();
        this.setupEventListeners();
        this.initializeTimelineChart();
        this.updateAlarmStats();
        this.renderAlarmTable();
    }

    async loadAlarmHistory() {
        try {
            this.alarms = await window.api.getAlarms(1000); // Load more alarms for history
        } catch (error) {
            console.error('Failed to load alarm history:', error);
        }
    }

    setupEventListeners() {
        const dateRangeSelect = document.getElementById('alarmDateRange');
        const deviceFilter = document.getElementById('alarmDeviceFilter');
        const levelFilter = document.getElementById('alarmLevelFilter');
        const exportBtn = document.getElementById('exportAlarmsBtn');

        [dateRangeSelect, deviceFilter, levelFilter].forEach(element => {
            if (element) {
                element.addEventListener('change', () => this.applyFilters());
            }
        });

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportAlarms());
        }

        // Populate device filter
        this.populateDeviceFilter();

        // Real-time updates
        window.addEventListener('alarmUpdate', (event) => {
            this.handleAlarmUpdate(event.detail);
        });
    }

    populateDeviceFilter() {
        const deviceFilter = document.getElementById('alarmDeviceFilter');
        if (!deviceFilter) return;

        const uniqueDevices = [...new Set(this.alarms.map(alarm => alarm.sensor_id))];
        deviceFilter.innerHTML = '<option value="">All Devices</option>' +
            uniqueDevices.map(deviceId => 
                `<option value="${deviceId}">${deviceId}</option>`
            ).join('');
    }

    initializeTimelineChart() {
        this.timelineChart = window.chartManager.createChart('alarmTimelineChart', 'bar', {
            datasets: []
        }, {
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Alarms'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Alarm Timeline'
                }
            }
        });

        this.updateTimelineChart();
    }

    updateTimelineChart() {
        if (!this.timelineChart) return;

        // Group alarms by date and level
        const alarmsByDate = {};
        this.alarms.forEach(alarm => {
            const date = new Date(alarm.timestamp).toDateString();
            if (!alarmsByDate[date]) {
                alarmsByDate[date] = { critical: 0, warning: 0, info: 0 };
            }
            alarmsByDate[date][alarm.level] = (alarmsByDate[date][alarm.level] || 0) + 1;
        });

        const dates = Object.keys(alarmsByDate).sort();
        const datasets = [
            {
                label: 'Critical',
                data: dates.map(date => ({
                    x: new Date(date),
                    y: alarmsByDate[date].critical
                })),
                backgroundColor: '#ff4757',
                borderColor: '#ff4757'
            },
            {
                label: 'Warning', 
                data: dates.map(date => ({
                    x: new Date(date),
                    y: alarmsByDate[date].warning
                })),
                backgroundColor: '#ffa502',
                borderColor: '#ffa502'
            },
            // {
            //     label: 'Info',
            //     data: dates.map(date => ({
            //         x: new Date(date),
            //         y: alarmsByDate[date].info
            //     })),
            //     backgroundColor: '#3742fa',
            //     borderColor: '#3742fa'
            // }
        ];

        this.timelineChart.data.datasets = datasets;
        this.timelineChart.update();
    }

    updateAlarmStats() {
        const statsContainer = document.getElementById('alarmStats');
        if (!statsContainer) return;

        // Calculate statistics
        const totalAlarms = this.alarms.length;
        const criticalAlarms = this.alarms.filter(a => a.level === 'critical').length;
        const warningAlarms = this.alarms.filter(a => a.level === 'warning').length;
        
        // Alarms by device
        const alarmsByDevice = {};
        this.alarms.forEach(alarm => {
            alarmsByDevice[alarm.sensor_id] = (alarmsByDevice[alarm.sensor_id] || 0) + 1;
        });
        
        const topDevice = Object.entries(alarmsByDevice)
            .sort(([,a], [,b]) => b - a)[0];

        statsContainer.innerHTML = `
            <div class="stat-box">
                <div class="stat-title">Total Alarms</div>
                <div class="stat-number">${totalAlarms}</div>
            </div>
            <div class="stat-box critical">
                <div class="stat-title">Critical Alarms</div>
                <div class="stat-number">${criticalAlarms}</div>
            </div>
            <div class="stat-box warning">
                <div class="stat-title">Warning Alarms</div>
                <div class="stat-number">${warningAlarms}</div>
            </div>
            <div class="stat-box">
                <div class="stat-title">Most Active Device</div>
                <div class="stat-number">${topDevice ? topDevice[0] : 'N/A'}</div>
                <div class="stat-title">${topDevice ? topDevice[1] + ' alarms' : ''}</div>
            </div>
        `;
    }

    applyFilters() {
        // Filter logic would be implemented here
        this.renderAlarmTable();
    }

    renderAlarmTable() {
        const tableBody = document.getElementById('alarmHistoryBody');
        if (!tableBody) return;

        // Apply current filters (simplified for this example)
        const filteredAlarms = this.alarms.slice(0, 50); // Show first 50 for performance

        tableBody.innerHTML = filteredAlarms.map(alarm => `
            <tr>
                <td>${new Date(alarm.timestamp).toLocaleString()}</td>
                <td>${alarm.sensor_id}</td>
                <td><span class="alarm-level ${alarm.level}">${alarm.level}</span></td>
                <td>${alarm.message || 'Alarm triggered'}</td>
                <td>-</td>
                <td>${alarm.acknowledged ? 'Acknowledged' : 'Active'}</td>
            </tr>
        `).join('');
    }

    exportAlarms() {
        alert('Alarm export functionality would generate CSV with alarm history data');
    }

    handleAlarmUpdate(data) {
        // Add new alarm to the beginning of the array
        this.alarms.unshift({
            timestamp: data.timestamp,
            sensor_id: data.sensor_id,
            level: data.level || data.alarm?.level || 'warning',
            message: data.message || data.alarm?.message || 'Alarm triggered',
            acknowledged: false
        });

        // Keep only recent alarms (e.g., last 1000)
        if (this.alarms.length > 1000) {
            this.alarms = this.alarms.slice(0, 1000);
        }

        // Throttle UI updates to prevent excessive redraws
        const now = Date.now();
        if (now - this.lastUpdate < this.updateThrottle) {
            return; // Skip UI update due to throttling
        }
        this.lastUpdate = now;

        // Update components if currently in alarm history view
        const alarmHistoryView = document.getElementById('alarm-historyView');
        if (alarmHistoryView?.style.display !== 'none') {
            this.updateAlarmStats();
            this.updateTimelineChart();
            this.renderAlarmTable();
            this.populateDeviceFilter(); // Update device filter with new devices
        }
    }
}

// Global controller instances
window.devicesController = new DevicesController();
window.sensorHistoryController = new SensorHistoryController();
window.alarmHistoryController = new AlarmHistoryController();
