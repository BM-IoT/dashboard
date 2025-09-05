#!/bin/bash
# Backend startup script for production builds

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Starting backend from: $SCRIPT_DIR"
echo "Project root: $PROJECT_ROOT"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required but not installed. Please install Python 3."
    exit 1
fi

# Check if we're running from AppImage (packaged environment)
if [[ -n "$APPIMAGE" ]] || [[ "$SCRIPT_DIR" == /tmp/.mount_* ]]; then
    echo "Running in AppImage environment..."
    
    # Try to find a local virtual environment in the system
    VENV_PATHS=(
        "$HOME/.local/share/shield-dashboard/.venv"
        "$HOME/.shield-dashboard/.venv"
        "/opt/shield-dashboard/.venv"
        "$PROJECT_ROOT/.venv"
    )
    
    VENV_FOUND=""
    for venv_path in "${VENV_PATHS[@]}"; do
        if [[ -f "$venv_path/bin/activate" ]]; then
            VENV_FOUND="$venv_path"
            echo "Found virtual environment at: $VENV_FOUND"
            break
        fi
    done
    
    if [[ -n "$VENV_FOUND" ]]; then
        # Use the found virtual environment
        source "$VENV_FOUND/bin/activate"
        echo "Activated virtual environment"
    else
        # Create a virtual environment in user's home directory
        USER_VENV="$HOME/.local/share/shield-dashboard/.venv"
        echo "Creating virtual environment at: $USER_VENV"
        mkdir -p "$(dirname "$USER_VENV")"
        python3 -m venv "$USER_VENV"
        source "$USER_VENV/bin/activate"
        
        # Install requirements
        echo "Installing Python dependencies..."
        pip install --upgrade pip
        pip install Flask==2.3.3 Flask-CORS==4.0.0 Flask-SocketIO==5.3.6 paho-mqtt==1.6.1 python-socketio==5.8.0 eventlet==0.33.3
    fi
else
    # Running in development environment
    echo "Running in development environment..."
    
    # Check if we have a local .venv
    if [[ -f "$PROJECT_ROOT/.venv/bin/activate" ]]; then
        echo "Using project virtual environment"
        source "$PROJECT_ROOT/.venv/bin/activate"
    elif [[ -f "$SCRIPT_DIR/../.venv/bin/activate" ]]; then
        echo "Using backend virtual environment"
        source "$SCRIPT_DIR/../.venv/bin/activate"
    else
        echo "Warning: No virtual environment found. Installing packages globally..."
        # Install required packages if not present
        python3 -m pip install Flask==2.3.3 Flask-CORS==4.0.0 Flask-SocketIO==5.3.6 paho-mqtt==1.6.1 python-socketio==5.8.0 eventlet==0.33.3 --user --quiet 2>/dev/null || true
    fi
fi

# Verify Flask is available
if ! python3 -c "import flask" 2>/dev/null; then
    echo "Error: Flask is not available. Installation may have failed."
    echo "Please install the required dependencies manually:"
    echo "pip install Flask Flask-CORS Flask-SocketIO paho-mqtt python-socketio eventlet"
    exit 1
fi

echo "All dependencies are available. Starting Flask application..."

# Change to the backend directory
cd "$SCRIPT_DIR"

# Start the Flask application
exec python3 app.py
