// Chart management utilities
class ChartManager {
    constructor() {
        this.charts = {};
        this.defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        displayFormats: {
                            minute: 'HH:mm',
                            hour: 'HH:mm',
                            day: 'MM/dd'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Value'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        };
    }

    createChart(canvasId, type = 'line', data = null, options = {}) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`Canvas with id '${canvasId}' not found`);
            return null;
        }

        // Destroy existing chart if it exists
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const ctx = canvas.getContext('2d');
        const chartOptions = this.mergeOptions(this.defaultOptions, options);

        try {
            this.charts[canvasId] = new Chart(ctx, {
                type: type,
                data: data || this.getEmptyData(),
                options: chartOptions
            });

            return this.charts[canvasId];
        } catch (error) {
            console.error(`Failed to create chart '${canvasId}':`, error);
            return null;
        }
    }

    updateChart(canvasId, data) {
        const chart = this.charts[canvasId];
        if (!chart) {
            console.error(`Chart with id '${canvasId}' not found`);
            return;
        }

        chart.data = data;
        chart.update('none'); // No animation for real-time updates
    }

    addDataPoint(canvasId, datasetIndex, point) {
        const chart = this.charts[canvasId];
        if (!chart || !chart.data.datasets[datasetIndex]) {
            return;
        }

        const dataset = chart.data.datasets[datasetIndex];
        dataset.data.push(point);

        // Keep only last 100 points for performance
        if (dataset.data.length > 100) {
            dataset.data.shift();
        }

        chart.update('none');
    }

    mergeOptions(defaultOpts, customOpts) {
        return {
            ...defaultOpts,
            ...customOpts,
            scales: {
                ...defaultOpts.scales,
                ...customOpts.scales
            },
            plugins: {
                ...defaultOpts.plugins,
                ...customOpts.plugins
            }
        };
    }

    getEmptyData() {
        return {
            labels: [],
            datasets: []
        };
    }

    createSensorDataset(sensorId, sensorType, color) {
        return {
            label: `${sensorId} (${sensorType})`,
            data: [],
            borderColor: color,
            backgroundColor: color + '20',
            fill: false,
            tension: 0.1
        };
    }

    getSensorColor(sensorType) {
        const colors = {
            humidity: '#3498db',
            vibration: '#e74c3c',
            stress: '#f39c12',
            temperature: '#2ecc71',
            pressure: '#9b59b6'
        };
        return colors[sensorType] || '#95a5a6';
    }

    prepareSensorData(sensorData, sensorType) {
        return sensorData.map(point => ({
            x: new Date(point.timestamp),
            y: point.value
        })).reverse(); // Reverse to show chronological order
    }

    createLiveChart(canvasId) {
        // Try with time scale first, fallback to linear if date adapter not available
        let chartConfig = {
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        displayFormats: {
                            minute: 'HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Value'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Live Sensor Data'
                }
            }
        };

        let chart = this.createChart(canvasId, 'line', this.getEmptyData(), chartConfig);
        
        // If chart creation failed (likely due to missing date adapter), use linear scale
        if (!chart) {
            console.warn('Time scale failed, falling back to linear scale');
            chartConfig.scales.x = {
                type: 'linear',
                title: {
                    display: true,
                    text: 'Data Points'
                }
            };
            chart = this.createChart(canvasId, 'line', this.getEmptyData(), chartConfig);
        }
        
        return chart;
    }

    createHistoryChart(canvasId) {
        return this.createChart(canvasId, 'line', this.getEmptyData(), {
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: 'MM/DD HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Date/Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Value'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Historical Data'
                },
                zoom: {
                    zoom: {
                        wheel: {
                            enabled: true,
                        },
                        pinch: {
                            enabled: true
                        },
                        mode: 'x',
                    },
                    pan: {
                        enabled: true,
                        mode: 'x',
                    }
                }
            }
        });
    }

    createMultiSensorChart(canvasId, sensors) {
        const datasets = sensors.map((sensor, index) => {
            const color = this.getSensorColor(sensor.type);
            return this.createSensorDataset(sensor.id, sensor.type, color);
        });

        return this.createChart(canvasId, 'line', {
            labels: [],
            datasets: datasets
        }, {
            plugins: {
                title: {
                    display: true,
                    text: 'Multi-Sensor Comparison'
                }
            }
        });
    }

    destroyChart(canvasId) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
            delete this.charts[canvasId];
        }
    }

    destroyAllCharts() {
        Object.keys(this.charts).forEach(canvasId => {
            this.destroyChart(canvasId);
        });
    }
}

// Create global chart manager instance
window.chartManager = new ChartManager();
