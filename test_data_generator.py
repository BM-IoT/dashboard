#!/usr/bin/env python3
"""
Simple test script to generate mock sensor data and alarms for testing the SHIELD Dashboard.
This script publishes test data to MQTT topics that the dashboard backend subscribes to.
"""

import json
import time
import random
import threading
from datetime import datetime
import paho.mqtt.client as mqtt

# MQTT Configuration
MQTT_BROKER = "localhost"
MQTT_PORT = 1883

# Test sensors configuration
SENSORS = [
    {"id": "HUMID_001", "type": "humidity", "location": "Building A - Floor 1"},
    {"id": "HUMID_002", "type": "humidity", "location": "Building A - Floor 2"},
    {"id": "VIBR_001", "type": "vibration", "location": "Building B - Foundation"},
    {"id": "VIBR_002", "type": "vibration", "location": "Building B - Bridge"},
    {"id": "STRESS_001", "type": "stress", "location": "Building C - Pillar 1"},
    {"id": "STRESS_002", "type": "stress", "location": "Building C - Pillar 2"},
]

class MockSensorDataGenerator:
    def __init__(self):
        self.client = mqtt.Client()
        self.running = False
        
    def connect(self):
        """Connect to MQTT broker"""
        try:
            self.client.connect(MQTT_BROKER, MQTT_PORT, 60)
            self.client.loop_start()
            print(f"Connected to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
            return True
        except Exception as e:
            print(f"Failed to connect to MQTT broker: {e}")
            print("Make sure you have an MQTT broker running (e.g., mosquitto)")
            return False
    
    def disconnect(self):
        """Disconnect from MQTT broker"""
        self.running = False
        self.client.loop_stop()
        self.client.disconnect()
        
    def generate_sensor_value(self, sensor_type):
        """Generate realistic sensor values based on type"""
        if sensor_type == "humidity":
            # Humidity: 0-100%, normal range 30-70%
            base = random.uniform(35, 65)
            noise = random.uniform(-5, 5)
            return max(0, min(100, base + noise))
            
        elif sensor_type == "vibration":
            # Vibration: 0-100 Hz, normal range 0-20 Hz
            base = random.uniform(0, 15)
            noise = random.uniform(-2, 8)  # Occasional spikes
            return max(0, base + noise)
            
        elif sensor_type == "stress":
            # Stress: 0-100 MPa, normal range 0-50 MPa
            base = random.uniform(10, 45)
            noise = random.uniform(-5, 10)
            return max(0, base + noise)
            
        return random.uniform(0, 100)
    
    def should_generate_alarm(self, value, sensor_type):
        """Determine if an alarm should be generated based on sensor value"""
        thresholds = {
            "humidity": {"warning": (70, 80), "critical": (80, 100)},
            "vibration": {"warning": (20, 50), "critical": (50, 100)},
            "stress": {"warning": (60, 80), "critical": (80, 100)}
        }
        
        if sensor_type not in thresholds:
            return None
            
        thresh = thresholds[sensor_type]
        
        if thresh["critical"][0] <= value <= thresh["critical"][1]:
            return "critical"
        elif thresh["warning"][0] <= value <= thresh["warning"][1]:
            return "warning"
            
        return None
    
    def publish_sensor_data(self, sensor, value=None, manual=False):
        """Publish sensor data to MQTT. If value is provided, use it (manual mode)."""
        if value is None:
            value = self.generate_sensor_value(sensor["type"])
        
        data = {
            "type": sensor["type"],
            "value": round(value, 2),
            "location": sensor["location"],
            "timestamp": datetime.now().isoformat()
        }
        
        topic = f"sensors/{sensor['id']}/data"
        payload = json.dumps(data)
        
        self.client.publish(topic, payload)
        if manual:
            print(f"[MANUAL] Published {sensor['id']}: {value:.2f}")
        else:
            print(f"Published {sensor['id']}: {value:.2f}")
        
        # Always send alarm if value is in warning/critical range
        alarm_level = self.should_generate_alarm(value, sensor["type"])
        if alarm_level:
            self.publish_alarm(sensor, alarm_level, value, manual=manual)
    
    def publish_alarm(self, sensor, level, value, manual=False):
        """Publish alarm to MQTT"""
        messages = {
            "warning": f"{sensor['type'].title()} level elevated: {value:.2f}",
            "critical": f"CRITICAL: {sensor['type'].title()} threshold exceeded: {value:.2f}"
        }
        
        alarm_data = {
            "type": "threshold",
            "level": level,
            "message": messages.get(level, f"Alarm triggered: {value:.2f}"),
            "timestamp": datetime.now().isoformat()
        }
        
        topic = f"alarms/{sensor['id']}"
        payload = json.dumps(alarm_data)
        
        self.client.publish(topic, payload)
        prefix = "[MANUAL] " if manual else ""
        print(f"{prefix}🚨 ALARM {sensor['id']} ({level.upper()}): {alarm_data['message']}")
    
    def run_continuous(self, interval=5):
        """Run continuous data generation"""
        self.running = True
        print(f"Starting continuous sensor data generation (interval: {interval}s)")
        print("Press Ctrl+C to stop")
        
        try:
            while self.running:
                for sensor in SENSORS:
                    if not self.running:
                        break
                    self.publish_sensor_data(sensor)
                
                time.sleep(interval)
                
        except KeyboardInterrupt:
            print("\nStopping data generation...")
        finally:
            self.disconnect()
    
    def run_burst(self, count=10):
        """Generate a burst of test data"""
        print(f"Generating {count} data points for each sensor...")
        
        for i in range(count):
            for sensor in SENSORS:
                self.publish_sensor_data(sensor)
            time.sleep(1)
        
        print("Burst generation complete")

def manual_mode(generator):
    print("\nManual Data/Alarm Sending Mode")
    print("=" * 40)
    # List sensors
    for idx, sensor in enumerate(SENSORS):
        print(f"{idx+1}. {sensor['id']} ({sensor['type']}, {sensor['location']})")
    try:
        sel = int(input("Select sensor by number: ")) - 1
        if not (0 <= sel < len(SENSORS)):
            print("Invalid selection.")
            return
        sensor = SENSORS[sel]
        val = float(input(f"Enter value for {sensor['id']} ({sensor['type']}): "))
        generator.publish_sensor_data(sensor, value=val, manual=True)
        # Optionally send alarm manually
        alarm = input("Send alarm? (y/N): ").strip().lower()
        if alarm == 'y':
            level = input("Alarm level (warning/critical): ").strip().lower()
            if level not in ['warning', 'critical']:
                print("Invalid level.")
                return
            generator.publish_alarm(sensor, level, val, manual=True)
    except Exception as e:
        print(f"Error: {e}")

def main():
    generator = MockSensorDataGenerator()
    
    if not generator.connect():
        return
    
    print("\nMock Sensor Data Generator")
    print("=" * 40)
    print("Available commands:")
    print("1. continuous - Run continuous data generation")
    print("2. burst - Generate burst of test data")
    print("3. manual - Manually send data/alarm")
    print("4. quit - Exit")
    
    while True:
        try:
            choice = input("\nEnter command (continuous/burst/manual/quit): ").strip().lower()
            
            if choice in ['quit', 'q', 'exit', '4']:
                break
            elif choice in ['continuous', 'c', '1']:
                generator.run_continuous()
                break
            elif choice in ['burst', 'b', '2']:
                generator.run_burst()
            elif choice in ['manual', 'm', '3']:
                manual_mode(generator)
            else:
                print("Invalid command. Please try again.")
                
        except KeyboardInterrupt:
            break
    
    generator.disconnect()
    print("Goodbye!")

if __name__ == "__main__":
    main()
