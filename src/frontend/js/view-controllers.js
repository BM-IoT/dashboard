// Simplified View Controllers using centralized store

// Devices Controller
class DevicesController {
    constructor() {
        this.filteredSensors = [];
    }

    async init() {
        this._setupEventListeners();
        this._loadDevices();
        this._populateTypeFilter();
    }

    _populateTypeFilter() {
        const typeFilter = document.getElementById('deviceTypeFilter');
        if (!typeFilter) return;

        // Remember the current selection
        const currentSelection = typeFilter.value;
        
        const sensors = window.store.getSensors();
        const uniqueTypes = [...new Set(sensors.map(sensor => sensor.type))];
        
        // Only rebuild if the available types have actually changed
        const currentOptions = Array.from(typeFilter.options).slice(1).map(opt => opt.value);
        const typesChanged = uniqueTypes.length !== currentOptions.length || 
                           !uniqueTypes.every(type => currentOptions.includes(type));
        
        if (typesChanged) {
            typeFilter.innerHTML = '<option value="">All Types</option>' +
                uniqueTypes.map(type => 
                    `<option value="${type}">${type.charAt(0).toUpperCase() + type.slice(1)}</option>`
                ).join('');
            
            // Restore the previous selection if it still exists
            if (currentSelection && uniqueTypes.includes(currentSelection)) {
                typeFilter.value = currentSelection;
            }
        }
    }

    _setupEventListeners() {
        // Subscribe to store updates
        window.store.subscribe('sensors', (sensors) => {
            // Preserve current filter state
            const currentFilters = this._getCurrentFilterState();
            
            this.filteredSensors = [...sensors];
            this._populateTypeFilter();
            
            // Restore filters after a brief delay to ensure DOM is updated
            setTimeout(() => {
                const typeFilter = document.getElementById('deviceTypeFilter');
                const statusFilter = document.getElementById('deviceStatusFilter');
                const searchFilter = document.getElementById('deviceSearch');
                
                if (typeFilter && currentFilters.type) typeFilter.value = currentFilters.type;
                if (statusFilter && currentFilters.status) statusFilter.value = currentFilters.status;
                if (searchFilter && currentFilters.search) searchFilter.value = currentFilters.search;
                
                this._applyFilters();
            }, 50);
        });

        // Filter controls
        ['deviceTypeFilter', 'deviceStatusFilter', 'deviceSearch'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                const event = id === 'deviceSearch' ? 'input' : 'change';
                element.addEventListener(event, () => this._applyFilters());
            }
        });
    }

    async _loadDevices() {
        try {
            // Get sensors from store
            this.filteredSensors = window.store.getSensors() || [];
            console.log('Loaded devices:', this.filteredSensors.length);
            
            // Apply current filters
            this._applyFilters();
            
            // Update the filter info
            this._updateFilterInfo();
            
        } catch (error) {
            console.error('Error loading devices:', error);
            this.filteredSensors = [];
            this._renderDevicesTable();
        }
    }

    _getCurrentFilterState() {
        return {
            type: document.getElementById('deviceTypeFilter')?.value || '',
            status: document.getElementById('deviceStatusFilter')?.value || '',
            search: document.getElementById('deviceSearch')?.value || ''
        };
    }

    _applyFilters() {
        const filters = this._getCurrentFilterState();

        const allSensors = window.store.getSensors();
        this.filteredSensors = allSensors.filter(sensor => {
            // Type filter
            const matchesType = !filters.type || (sensor.type && sensor.type.toLowerCase() === filters.type.toLowerCase());
            
            // Status filter
            const sensorStatus = sensor.status || 'offline';
            const matchesStatus = !filters.status || sensorStatus.toLowerCase() === filters.status.toLowerCase();
            
            // Search filter
            const searchTerm = filters.search.toLowerCase();
            const matchesSearch = !searchTerm || 
                (sensor.id && sensor.id.toLowerCase().includes(searchTerm)) ||
                (sensor.location && sensor.location.toLowerCase().includes(searchTerm)) ||
                (sensor.type && sensor.type.toLowerCase().includes(searchTerm)) ||
                (sensor.name && sensor.name.toLowerCase().includes(searchTerm));

            return matchesType && matchesStatus && matchesSearch;
        });

        this._renderDevicesTable();
        
        // Update filter info
        this._updateFilterInfo();
    }

    _updateFilterInfo() {
        const totalSensors = window.store.getSensors().length;
        const filteredCount = this.filteredSensors.length;
        
        const filterInfoElement = document.getElementById('deviceFilterInfo');
        if (filterInfoElement) {
            const onlineCount = this.filteredSensors.filter(s => s.status === 'online').length;
            const offlineCount = filteredCount - onlineCount;
            
            filterInfoElement.textContent = `Showing ${filteredCount} of ${totalSensors} devices (${onlineCount} online, ${offlineCount} offline)`;
        }
        
        console.log(`Showing ${filteredCount} of ${totalSensors} devices`);
    }

    refreshDevices() {
        console.log('Refreshing devices...');
        
        // Store current filter state before refresh
        const currentFilters = this._getCurrentFilterState();
        
        this._loadDevices();
        this._populateTypeFilter();
        
        // Restore filter state after refresh
        setTimeout(() => {
            const typeFilter = document.getElementById('deviceTypeFilter');
            const statusFilter = document.getElementById('deviceStatusFilter');
            const searchFilter = document.getElementById('deviceSearch');
            
            if (typeFilter && currentFilters.type) typeFilter.value = currentFilters.type;
            if (statusFilter && currentFilters.status) statusFilter.value = currentFilters.status;
            if (searchFilter && currentFilters.search) searchFilter.value = currentFilters.search;
            
            // Reapply filters with restored state
            this._applyFilters();
        }, 100);
        
        // Show a brief feedback
        const filterInfoElement = document.getElementById('deviceFilterInfo');
        if (filterInfoElement) {
            const originalText = filterInfoElement.textContent;
            filterInfoElement.textContent = 'Refreshing...';
            setTimeout(() => {
                this._updateFilterInfo();
            }, 500);
        }
    }

    _renderDevicesTable() {
        const tableBody = document.getElementById('devicesTableBody');
        if (!tableBody) return;

        if (this.filteredSensors.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;">No devices found</td></tr>';
            return;
        }

        tableBody.innerHTML = this.filteredSensors.map(sensor => `
            <tr class="device-row ${sensor.status || 'offline'}">
                <td class="device-id">
                    <span class="status-indicator ${sensor.status || 'offline'}"></span>
                    ${sensor.id}
                </td>
                <td>${sensor.name || sensor.id}</td>
                <td>${sensor.location || 'Unknown'}</td>
                <td>
                    <span class="device-type-badge sensor">
                        ${(sensor.type || 'sensor').charAt(0).toUpperCase() + (sensor.type || 'sensor').slice(1)}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${sensor.status || 'offline'}">
                        ${((sensor.status || 'offline').charAt(0).toUpperCase() + (sensor.status || 'offline').slice(1))}
                    </span>
                </td>
                <td>${sensor.lastUpdate ? new Date(sensor.lastUpdate).toLocaleString() : 'Never'}</td>
                <td>
                    <button class="btn btn-sm" onclick="window.devicesController.showDeviceDetails('${sensor.id}')">
                        Details
                    </button>
                </td>
            </tr>
        `).join('');
    }

    showDeviceDetails(sensorId) {
        const sensor = window.store.getSensor(sensorId);
        if (!sensor) {
            alert('Device not found');
            return;
        }

        const formatValue = (value, type) => {
            if (value === null || value === undefined) return 'No Data';
            if (window.api && window.api.formatSensorValue) {
                return window.api.formatSensorValue(value, type);
            }
            return value.toString();
        };

        const details = [
            `Device Details:`,
            ``,
            `ID: ${sensor.id}`,
            `Name: ${sensor.name || sensor.id}`,
            `Type: ${sensor.type || 'Unknown'}`,
            `Location: ${sensor.location || 'Unknown'}`,
            `Status: ${sensor.status || 'Offline'}`,
            `Last Value: ${formatValue(sensor.lastValue, sensor.type)}`,
            `Last Update: ${sensor.lastUpdate ? new Date(sensor.lastUpdate).toLocaleString() : 'Never'}`,
            ``,
            `Raw Data:`,
            JSON.stringify(sensor, null, 2)
        ].join('\n');

        alert(details);
    }
}

// Sensor History Controller
class SensorHistoryController {
    constructor() {
        this.charts = {};
        this.sensorTypes = ['humidity', 'vibration', 'stress'];
    }

    async init() {
        this._setupEventListeners();
        this._initializeCharts();
        this._loadDevices();
        await this._loadHistoricalData();
    }

    _setupEventListeners() {
        // Subscribe to store updates for real-time data
        window.store.subscribe('sensorData', (data) => this._handleSensorUpdate(data));
        window.store.subscribe('sensors', (sensors) => this._loadDevices());

        // Control event listeners
        const sensorTypeSelect = document.getElementById('sensorTypeSelect');
        const dateRangeSelect = document.getElementById('dateRangeSelect');
        const deviceSelect = document.getElementById('deviceSelect');
        const exportBtn = document.getElementById('exportDataBtn');
        const customStartDate = document.getElementById('customStartDate');
        const customEndDate = document.getElementById('customEndDate');

        if (sensorTypeSelect) {
            sensorTypeSelect.addEventListener('change', () => {
                this._updateChartVisibility();
                this._loadHistoricalData();
            });
        }

        if (dateRangeSelect) {
            dateRangeSelect.addEventListener('change', (e) => {
                const customDates = document.querySelectorAll('#customStartDate, #customEndDate');
                customDates.forEach(input => {
                    input.style.display = e.target.value === 'custom' ? 'inline-block' : 'none';
                });
                this._loadHistoricalData();
            });
        }

        if (customStartDate) {
            customStartDate.addEventListener('change', () => this._loadHistoricalData());
        }

        if (customEndDate) {
            customEndDate.addEventListener('change', () => this._loadHistoricalData());
        }

        if (deviceSelect) {
            deviceSelect.addEventListener('change', () => this._loadHistoricalData());
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this._exportData());
        }
    }

    _loadDevices() {
        const deviceSelect = document.getElementById('deviceSelect');
        if (!deviceSelect) return;

        const sensors = window.store.getSensors();
        const selectedType = document.getElementById('sensorTypeSelect')?.value || '';
        
        // Filter sensors by selected type if specified
        const filteredSensors = selectedType ? 
            sensors.filter(sensor => sensor.type === selectedType) : 
            sensors;

        // Remember previously selected devices
        const previouslySelected = Array.from(deviceSelect.selectedOptions || [])
            .map(option => option.value);

        deviceSelect.innerHTML = filteredSensors.map(sensor => 
            `<option value="${sensor.id}" ${previouslySelected.includes(sensor.id) ? 'selected' : ''}>
                ${sensor.id} (${sensor.type} - ${sensor.location})
            </option>`
        ).join('');

        // If no devices are available, show a message
        if (filteredSensors.length === 0) {
            deviceSelect.innerHTML = '<option disabled>No sensors available</option>';
        }
    }

    _initializeCharts() {
        this.sensorTypes.forEach(type => {
            const canvasId = `${type}Chart`;
            const chart = window.chartManager.createChart(canvasId, 'line', {
                datasets: []
            }, {
                scales: {
                    x: { type: 'time', time: { unit: 'hour' } },
                    y: { 
                        beginAtZero: true,
                        title: { display: true, text: this._getYAxisLabel(type) }
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

    async _loadHistoricalData() {
        const dateRange = document.getElementById('dateRangeSelect')?.value || 'week';
        const selectedType = document.getElementById('sensorTypeSelect')?.value || '';
        const deviceSelect = document.getElementById('deviceSelect');
        
        // Get selected devices, or all if none selected
        const selectedDevices = deviceSelect ? 
            Array.from(deviceSelect.selectedOptions).map(option => option.value) : [];

        const sensors = window.store.getSensors();
        
        // Filter by sensor type first
        let filteredSensors = selectedType ? 
            sensors.filter(s => s.type === selectedType) : 
            sensors;
        
        // Then filter by selected devices if any
        const devicesToLoad = selectedDevices.length > 0 ? 
            filteredSensors.filter(s => selectedDevices.includes(s.id)) : 
            filteredSensors;

        // Determine which chart types to update
        const chartTypesToUpdate = selectedType ? [selectedType] : this.sensorTypes;

        for (const type of chartTypesToUpdate) {
            const typeSensors = devicesToLoad.filter(s => s.type === type);
            const datasets = [];

            for (const sensor of typeSensors) {
                try {
                    const limit = this._getLimitForDateRange(dateRange);
                    const data = await window.api.getSensorData(sensor.id, limit);
                    
                    if (data && data.length > 0) {
                        // Filter by custom date range if specified
                        let filteredData = data;
                        if (dateRange === 'custom') {
                            const startDate = document.getElementById('customStartDate')?.value;
                            const endDate = document.getElementById('customEndDate')?.value;
                            
                            if (startDate || endDate) {
                                filteredData = data.filter(point => {
                                    const pointDate = new Date(point.timestamp);
                                    if (startDate && pointDate < new Date(startDate)) return false;
                                    if (endDate && pointDate > new Date(endDate + 'T23:59:59')) return false;
                                    return true;
                                });
                            }
                        }

                        if (filteredData.length > 0) {
                            datasets.push({
                                label: `${sensor.id} (${sensor.location})`,
                                data: filteredData.map(point => ({
                                    x: new Date(point.timestamp),
                                    y: point.value
                                })).reverse(),
                                borderColor: this._getColorForDevice(sensor.id),
                                backgroundColor: this._getColorForDevice(sensor.id) + '20',
                                fill: false,
                                tension: 0.1,
                                pointRadius: 2,
                                pointHoverRadius: 4
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Failed to load data for ${sensor.id}:`, error);
                }
            }

            if (this.charts[type]) {
                this.charts[type].data.datasets = datasets;
                this.charts[type].update();
                
                const infoElement = document.getElementById(`${type}Info`);
                if (infoElement) {
                    const totalPoints = datasets.reduce((sum, ds) => sum + ds.data.length, 0);
                    infoElement.textContent = `${datasets.length} sensor(s), ${totalPoints} data points, ${dateRange} range`;
                }
            }
        }

        this._updateChartVisibility();
    }

    _updateChartVisibility() {
        const selectedType = document.getElementById('sensorTypeSelect')?.value || '';
        
        this.sensorTypes.forEach(type => {
            const card = document.getElementById(`${type}ChartCard`);
            if (card) {
                const shouldShow = !selectedType || selectedType === type;
                card.style.display = shouldShow ? 'block' : 'none';
                
                // Update chart info when showing
                if (shouldShow && this.charts[type]) {
                    const datasets = this.charts[type].data.datasets;
                    const infoElement = document.getElementById(`${type}Info`);
                    if (infoElement) {
                        const dateRange = document.getElementById('dateRangeSelect')?.value || 'week';
                        infoElement.textContent = `${datasets.length} sensor(s), ${dateRange} range`;
                    }
                }
            }
        });

        // Update device select to show only relevant sensors
        this._loadDevices();
    }

    _handleSensorUpdate(data) {
        const { sensorId, sensor } = data;
        if (!sensor) return;

        // Check if this sensor type is currently being displayed
        const selectedType = document.getElementById('sensorTypeSelect')?.value || '';
        if (selectedType && sensor.type !== selectedType) return;

        // Check if this sensor is in the selected devices list
        const deviceSelect = document.getElementById('deviceSelect');
        if (deviceSelect) {
            const selectedDevices = Array.from(deviceSelect.selectedOptions).map(option => option.value);
            if (selectedDevices.length > 0 && !selectedDevices.includes(sensorId)) return;
        }

        // Find the appropriate chart
        const chart = this.charts[sensor.type];
        if (!chart) return;

        // Find or create dataset for this sensor
        let dataset = chart.data.datasets.find(d => d.label.startsWith(sensorId));
        if (!dataset) {
            dataset = {
                label: `${sensorId} (${sensor.location})`,
                data: [],
                borderColor: this._getColorForDevice(sensorId),
                backgroundColor: this._getColorForDevice(sensorId) + '20',
                fill: false,
                tension: 0.1,
                pointRadius: 2,
                pointHoverRadius: 4
            };
            chart.data.datasets.push(dataset);
        }

        // Add new data point
        if (sensor.lastValue !== null && sensor.lastUpdate) {
            const newPoint = {
                x: sensor.lastUpdate,
                y: sensor.lastValue
            };
            
            dataset.data.push(newPoint);

            // Keep only recent data points (based on current date range)
            const dateRange = document.getElementById('dateRangeSelect')?.value || 'week';
            const maxPoints = this._getLimitForDateRange(dateRange);
            if (dataset.data.length > maxPoints) {
                dataset.data = dataset.data.slice(-maxPoints);
            }

            // Sort by timestamp to maintain order
            dataset.data.sort((a, b) => a.x.getTime() - b.x.getTime());

            chart.update('none');
            
            // Update chart info
            const infoElement = document.getElementById(`${sensor.type}Info`);
            if (infoElement) {
                const datasets = chart.data.datasets;
                const totalPoints = datasets.reduce((sum, ds) => sum + ds.data.length, 0);
                infoElement.textContent = `${datasets.length} sensor(s), ${totalPoints} data points, ${dateRange} range`;
            }
        }
    }

    _getLimitForDateRange(range) {
        switch (range) {
            case 'day': return 288; // 24 hours * 12 (5-minute intervals)
            case 'week': return 2016; // 7 days * 288
            case 'month': return 8640; // 30 days * 288
            case 'custom': return 10000; // Large limit for custom ranges
            default: return 2016;
        }
    }

    _getYAxisLabel(type) {
        const labels = {
            humidity: 'Humidity (%)',
            vibration: 'Vibration (Hz)',
            stress: 'Stress (MPa)'
        };
        return labels[type] || 'Value';
    }

    _getColorForDevice(deviceId) {
        const colors = ['#3498db', '#e74c3c', '#f39c12', '#2ecc71', '#9b59b6', '#1abc9c'];
        const hash = deviceId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }

    _exportData() {
        alert('Export functionality would generate CSV with current chart data');
    }
}

// Alarm History Controller
class AlarmHistoryController {
    constructor() {
        this.alarms = [];
        this.timelineChart = null;
    }

    async init() {
        this._setupEventListeners();
        await this._loadAlarmHistory();
        this._initializeTimelineChart();
        this._updateAlarmStats();
        this._renderAlarmTable();
    }

    _setupEventListeners() {
        // Subscribe to store updates
        window.store.subscribe('alarms', (alarms) => {
            this.alarms = alarms;
            this._updateAlarmStats();
            this._updateTimelineChart();
            this._renderAlarmTable();
        });

        window.store.subscribe('newAlarm', () => {
            this._populateDeviceFilter();
        });

        // Control event listeners
        ['alarmDateRange', 'alarmDeviceFilter', 'alarmLevelFilter'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => this._applyFilters());
            }
        });

        const exportBtn = document.getElementById('exportAlarmsBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this._exportAlarms());
        }
    }

    async _loadAlarmHistory() {
        try {
            const alarms = await window.api.getAlarms(1000);
            window.store.setAlarms(alarms);
        } catch (error) {
            console.error('Failed to load alarm history:', error);
        }
    }

    _populateDeviceFilter() {
        const deviceFilter = document.getElementById('alarmDeviceFilter');
        if (!deviceFilter) return;

        const uniqueDevices = [...new Set(this.alarms.map(alarm => alarm.sensor_id))];
        deviceFilter.innerHTML = '<option value="">All Devices</option>' +
            uniqueDevices.map(deviceId => 
                `<option value="${deviceId}">${deviceId}</option>`
            ).join('');
    }

    _initializeTimelineChart() {
        this.timelineChart = window.chartManager.createChart('alarmTimelineChart', 'bar', {
            datasets: []
        }, {
            scales: {
                x: { type: 'time', time: { unit: 'day' } },
                y: { 
                    beginAtZero: true,
                    title: { display: true, text: 'Number of Alarms' }
                }
            }
        });
    }

    _updateTimelineChart() {
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
                data: dates.map(date => ({ x: new Date(date), y: alarmsByDate[date].critical })),
                backgroundColor: '#ff4757'
            },
            {
                label: 'Warning', 
                data: dates.map(date => ({ x: new Date(date), y: alarmsByDate[date].warning })),
                backgroundColor: '#ffa502'
            }
        ];

        this.timelineChart.data.datasets = datasets;
        this.timelineChart.update();
    }

    _updateAlarmStats() {
        const statsContainer = document.getElementById('alarmStats');
        if (!statsContainer) return;

        const totalAlarms = this.alarms.length;
        const criticalAlarms = this.alarms.filter(a => a.level === 'critical').length;
        const warningAlarms = this.alarms.filter(a => a.level === 'warning').length;
        
        // Find most active device
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

    _renderAlarmTable() {
        const tableBody = document.getElementById('alarmHistoryBody');
        if (!tableBody) return;

        const recentAlarms = this.alarms.slice(0, 50);

        tableBody.innerHTML = recentAlarms.map(alarm => `
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

    _applyFilters() {
        this._renderAlarmTable();
    }

    _exportAlarms() {
        alert('Alarm export functionality would generate CSV with alarm history data');
    }
}
