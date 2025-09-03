#!/bin/bash
# Backend startup script for production builds

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not installed. Please install Python 3."
    exit 1
fi

# Check if pip is available
if ! python3 -m pip --version &> /dev/null; then
    echo "pip is required but not available. Please install pip."
    exit 1
fi

# Install required packages if not present
python3 -m pip install flask flask-socketio paho-mqtt flask-cors --user --quiet 2>/dev/null || true

# Start the Flask application
python3 app.py
