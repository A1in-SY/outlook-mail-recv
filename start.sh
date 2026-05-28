#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Starting Outlook Mail Receiver ==="

# Setup backend venv if not exists
echo "[0/2] Checking backend environment..."
cd "$SCRIPT_DIR/backend"
if [ ! -d ".venv" ]; then
    echo "  Creating Python venv..."
    python3 -m venv .venv
    echo "  Installing dependencies..."
    .venv/bin/pip install -r requirements.txt
    echo "  Backend environment ready."
else
    echo "  venv already exists, skipping."
fi

# Setup frontend deps if not exists
cd "$SCRIPT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "  Installing frontend dependencies..."
    npm install
    echo "  Frontend dependencies ready."
else
    echo "  node_modules already exists, skipping."
fi

# Start backend
echo "[1/2] Starting backend..."
cd "$SCRIPT_DIR/backend"
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8080 &
BACKEND_PID=$!

# Start frontend
echo "[2/2] Starting frontend..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8080"
echo "Frontend: http://localhost:5173"
echo "API Docs: http://localhost:8080/docs"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
