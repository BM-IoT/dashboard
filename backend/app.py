from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import json
from collections import deque
import paho.mqtt.client as mqtt
import threading
from datetime import datetime

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# In-memory stores (thread-safe)
# sensors: sensor_id -> {sensor_id, sensor_type, location, status}
sensors = {}
# sensor_data: sensor_id -> deque of {'value', 'timestamp'} (bounded)
sensor_data = {}
# alarms: deque of {'id', 'sensor_id', 'alarm_type', 'level', 'message', 'timestamp', 'acknowledged'} (bounded)
alarms = None
# simple alarm id counter
alarm_id_counter = 1
# lock to protect concurrent access
data_lock = threading.Lock()

# Size limits
SENSOR_DATA_MAXLEN = 10000
ALARMS_MAXLEN = 1000

def init_data():
    """Initialize in-memory data stores."""
    global sensors, sensor_data, alarms, alarm_id_counter
    with data_lock:
        sensors = {}
        sensor_data = {}
        alarms = deque(maxlen=ALARMS_MAXLEN)
        alarm_id_counter = 1

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
    """Store sensor data in memory and emit to frontend"""
    global sensors, sensor_data
    timestamp = datetime.now().isoformat()
    new_sensor_meta = None
    with data_lock:
        # Insert or update sensor
        if sensor_id not in sensors:
            sensors[sensor_id] = {
                'sensor_id': sensor_id,
                'sensor_type': data.get('type', 'unknown'),
                'location': data.get('location', 'unknown'),
                'status': 'active'
            }
            # capture metadata to broadcast after releasing lock
            new_sensor_meta = sensors[sensor_id].copy()

        # Append sensor data into a bounded deque
        if sensor_id not in sensor_data:
            sensor_data[sensor_id] = deque(maxlen=SENSOR_DATA_MAXLEN)
        sensor_data[sensor_id].append({
            'value': data.get('value', 0),
            'timestamp': timestamp
        })

    # Emit to frontend via WebSocket
    socketio.emit('sensor_update', {
        'sensor_id': sensor_id,
        'data': data,
        'timestamp': timestamp
    })
    # If this was a newly observed sensor, emit a dedicated event so frontends
    # can react to a sensor coming online (e.g., add to lists immediately).
    if new_sensor_meta is not None:
        try:
            new_sensor_meta['first_seen'] = timestamp
            socketio.emit('sensor_connected', new_sensor_meta)
            print(f"Emitted sensor_connected for {sensor_id}")
        except Exception as e:
            print(f"Failed to emit sensor_connected event: {e}")

def handle_alarm(sensor_id, alarm_data):
    """Store alarm in memory and emit to frontend"""
    global alarms, alarm_id_counter
    timestamp = datetime.now().isoformat()
    with data_lock:
        alarm = {
            'id': alarm_id_counter,
            'sensor_id': sensor_id,
            'alarm_type': alarm_data.get('type', 'unknown'),
            'level': alarm_data.get('level', 'info'),
            'message': alarm_data.get('message', ''),
            'timestamp': timestamp,
            'acknowledged': False
        }
        # newest first: appendleft
        alarms.appendleft(alarm)
        alarm_id_counter += 1

    # Emit to frontend via WebSocket
    socketio.emit('alarm_update', {
        'sensor_id': sensor_id,
        'alarm': alarm,
        'timestamp': timestamp
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
        # In-memory stores are initialized
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'storage': 'in-memory'
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
    with data_lock:
        result = [
            {
                'sensor_id': s['sensor_id'],
                'sensor_type': s.get('sensor_type'),
                'location': s.get('location'),
                'status': s.get('status', 'active')
            }
            for s in sensors.values()
        ]
    return jsonify(result)

@app.route('/api/sensors/<sensor_id>/data', methods=['GET'])
def get_sensor_data(sensor_id):
    """Get sensor data with optional time range"""
    limit = request.args.get('limit', 100, type=int)
    with data_lock:
        entries = list(sensor_data.get(sensor_id, []))

    # return most recent first
    entries = sorted(entries, key=lambda e: e['timestamp'], reverse=True)
    return jsonify(entries[:limit])

@app.route('/api/alarms', methods=['GET'])
def get_alarms():
    """Get all alarms"""
    limit = request.args.get('limit', 50, type=int)
    acknowledged = request.args.get('acknowledged', None)
    with data_lock:
        filtered = list(alarms)

    if acknowledged is not None:
        want = acknowledged.lower() == 'true'
        filtered = [a for a in filtered if a.get('acknowledged', False) == want]

    # alarms are stored newest-first
    return jsonify(filtered[:limit])

@app.route('/api/alarms/<int:alarm_id>/acknowledge', methods=['POST'])
def acknowledge_alarm(alarm_id):
    """Acknowledge an alarm"""
    with data_lock:
        for a in alarms:
            if a['id'] == alarm_id:
                a['acknowledged'] = True
                return jsonify({'status': 'success', 'message': 'Alarm acknowledged'})

    return jsonify({'status': 'error', 'message': 'Alarm not found'}), 404

@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    """Get dashboard statistics"""
    now = datetime.now()
    today = now.date()
    with data_lock:
        active_sensors = sum(1 for s in sensors.values() if s.get('status', 'active') == 'active')
        unack_alarms = sum(1 for a in alarms if not a.get('acknowledged', False))
        today_readings = 0
        for entries in sensor_data.values():
            for e in list(entries):
                try:
                    ts = datetime.fromisoformat(e['timestamp'])
                    if ts.date() == today:
                        today_readings += 1
                except Exception:
                    # ignore parse errors
                    pass

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
    # Initialize in-memory stores
    print("Initializing in-memory data stores...")
    init_data()

    # Start MQTT client in a separate thread
    print("Starting MQTT client thread...")
    mqtt_thread = threading.Thread(target=start_mqtt, daemon=True)
    mqtt_thread.start()
    print("MQTT thread started")

    # Start Flask-SocketIO server (disable debug to avoid reloader issues)
    print("Starting Flask-SocketIO server...")
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
