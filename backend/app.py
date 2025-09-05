from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import sqlite3
import json
import paho.mqtt.client as mqtt
import threading
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Database setup
DATABASE = 'shield_dashboard.db'

def init_db():
    """Initialize the database with required tables"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Sensors table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sensors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id TEXT UNIQUE,
            sensor_type TEXT,
            location TEXT,
            status TEXT DEFAULT 'active'
        )
    ''')
    
    # Sensor data table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id TEXT,
            value REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sensor_id) REFERENCES sensors (sensor_id)
        )
    ''')
    
    # Alarms table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS alarms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id TEXT,
            alarm_type TEXT,
            level TEXT,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            acknowledged BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (sensor_id) REFERENCES sensors (sensor_id)
        )
    ''')
    
    conn.commit()
    conn.close()

# MQTT Configuration
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPICS = ["sensors/+/data", "alarms/+"]

# MQTT Callbacks
def on_connect(client, userdata, flags, rc):
    print(f"Connected to MQTT broker with result code {rc}")
    for topic in MQTT_TOPICS:
        client.subscribe(topic)

def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        payload = json.loads(msg.payload.decode())
        print(f"Received MQTT message on topic: {topic}, payload: {payload}")
        
        if topic.startswith("sensors/"):
            # Handle sensor data
            sensor_id = topic.split("/")[1]
            handle_sensor_data(sensor_id, payload)
        elif topic.startswith("alarms/"):
            # Handle alarms
            sensor_id = topic.split("/")[1]
            handle_alarm(sensor_id, payload)
            
    except Exception as e:
        print(f"Error processing MQTT message: {e}")
        print(f"Topic: {msg.topic}, Raw payload: {msg.payload}")

def handle_sensor_data(sensor_id, data):
    """Store sensor data in database and emit to frontend"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Insert or update sensor
    cursor.execute('''
        INSERT OR IGNORE INTO sensors (sensor_id, sensor_type, location)
        VALUES (?, ?, ?)
    ''', (sensor_id, data.get('type', 'unknown'), data.get('location', 'unknown')))
    
    # Insert sensor data
    cursor.execute('''
        INSERT INTO sensor_data (sensor_id, value)
        VALUES (?, ?)
    ''', (sensor_id, data.get('value', 0)))
    
    conn.commit()
    conn.close()
    
    # Emit to frontend via WebSocket
    socketio.emit('sensor_update', {
        'sensor_id': sensor_id,
        'data': data,
        'timestamp': datetime.now().isoformat()
    })

def handle_alarm(sensor_id, alarm_data):
    """Store alarm in database and emit to frontend"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO alarms (sensor_id, alarm_type, level, message)
        VALUES (?, ?, ?, ?)
    ''', (sensor_id, alarm_data.get('type', 'unknown'), 
          alarm_data.get('level', 'info'), alarm_data.get('message', '')))
    
    conn.commit()
    conn.close()
    
    # Emit to frontend via WebSocket
    socketio.emit('alarm_update', {
        'sensor_id': sensor_id,
        'alarm': alarm_data,
        'timestamp': datetime.now().isoformat()
    })

# Initialize MQTT client
mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

def start_mqtt():
    """Start MQTT client in a separate thread"""
    try:
        print(f"Attempting to connect to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        print("MQTT client connect() called, starting loop...")
        mqtt_client.loop_forever()
    except Exception as e:
        print(f"MQTT connection error: {e}")
        print("Note: MQTT broker not available. Dashboard will work without real-time sensor data.")

# API Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for application startup"""
    try:
        # Test database connection
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        cursor.execute('SELECT 1')
        conn.close()
        
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'database': 'connected'
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        }), 500

@app.route('/api/sensors', methods=['GET'])
def get_sensors():
    """Get all sensors"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM sensors')
    sensors = cursor.fetchall()
    conn.close()
    
    return jsonify([{
        'id': sensor[0],
        'sensor_id': sensor[1],
        'sensor_type': sensor[2],
        'location': sensor[3],
        'status': sensor[4]
    } for sensor in sensors])

@app.route('/api/sensors/<sensor_id>/data', methods=['GET'])
def get_sensor_data(sensor_id):
    """Get sensor data with optional time range"""
    limit = request.args.get('limit', 100, type=int)
    
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT value, timestamp FROM sensor_data 
        WHERE sensor_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
    ''', (sensor_id, limit))
    data = cursor.fetchall()
    conn.close()
    
    return jsonify([{
        'value': row[0],
        'timestamp': row[1]
    } for row in data])

@app.route('/api/alarms', methods=['GET'])
def get_alarms():
    """Get all alarms"""
    limit = request.args.get('limit', 50, type=int)
    acknowledged = request.args.get('acknowledged', None)
    
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    query = 'SELECT * FROM alarms'
    params = []
    
    if acknowledged is not None:
        query += ' WHERE acknowledged = ?'
        params.append(acknowledged.lower() == 'true')
    
    query += ' ORDER BY timestamp DESC LIMIT ?'
    params.append(limit)
    
    cursor.execute(query, params)
    alarms = cursor.fetchall()
    conn.close()
    
    return jsonify([{
        'id': alarm[0],
        'sensor_id': alarm[1],
        'alarm_type': alarm[2],
        'level': alarm[3],
        'message': alarm[4],
        'timestamp': alarm[5],
        'acknowledged': alarm[6]
    } for alarm in alarms])

@app.route('/api/alarms/<int:alarm_id>/acknowledge', methods=['POST'])
def acknowledge_alarm(alarm_id):
    """Acknowledge an alarm"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute('UPDATE alarms SET acknowledged = TRUE WHERE id = ?', (alarm_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success', 'message': 'Alarm acknowledged'})

@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    """Get dashboard statistics"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Count active sensors
    cursor.execute('SELECT COUNT(*) FROM sensors WHERE status = "active"')
    active_sensors = cursor.fetchone()[0]
    
    # Count unacknowledged alarms
    cursor.execute('SELECT COUNT(*) FROM alarms WHERE acknowledged = FALSE')
    unack_alarms = cursor.fetchone()[0]
    
    # Count total data points today
    cursor.execute('''
        SELECT COUNT(*) FROM sensor_data 
        WHERE DATE(timestamp) = DATE('now')
    ''')
    today_readings = cursor.fetchone()[0]
    
    conn.close()
    
    return jsonify({
        'active_sensors': active_sensors,
        'unacknowledged_alarms': unack_alarms,
        'today_readings': today_readings
    })

# WebSocket events
@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('status', {'message': 'Connected to SHIELD Dashboard'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

if __name__ == '__main__':
    # Initialize database
    print("Initializing database...")
    init_db()
    
    # Start MQTT client in a separate thread
    print("Starting MQTT client thread...")
    mqtt_thread = threading.Thread(target=start_mqtt, daemon=True)
    mqtt_thread.start()
    print("MQTT thread started")
    
    # Start Flask-SocketIO server (disable debug to avoid reloader issues)
    print("Starting Flask-SocketIO server...")
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
