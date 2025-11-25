#!/bin/bash

# EnhanceUnits Development Helper Script
# This script helps manage the development environment

case "$1" in
  start)
    echo "🚀 Starting backend server and extension watch mode..."
    npm run dev:all
    ;;
  
  stop)
    echo "🛑 Stopping all processes..."
    npm run kill:all
    echo "✅ All processes stopped"
    ;;
  
  restart)
    echo "🔄 Restarting..."
    npm run kill:all
    sleep 1
    npm run dev:all
    ;;
  
  backend)
    echo "🖥️  Starting backend server only..."
    npm run dev:backend
    ;;
  
  extension)
    echo "🔧 Building extension in watch mode..."
    npm run dev:extension
    ;;
  
  build)
    echo "📦 Building extension for production..."
    npm run build:extension
    ;;
  
  status)
    echo "📊 Checking running processes..."
    echo ""
    echo "Backend server (nodemon):"
    pgrep -fl nodemon || echo "  ❌ Not running"
    echo ""
    echo "Extension build (vite):"
    pgrep -fl vite || echo "  ❌ Not running"
    ;;
  
  *)
    echo "EnhanceUnits Development Helper"
    echo ""
    echo "Usage: ./dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start      - Start both backend and extension watch mode"
    echo "  stop       - Stop all running processes"
    echo "  restart    - Restart all processes"
    echo "  backend    - Start backend server only"
    echo "  extension  - Start extension watch mode only"
    echo "  build      - Build extension for production"
    echo "  status     - Check running processes"
    echo ""
    echo "Examples:"
    echo "  ./dev.sh start     # Start everything"
    echo "  ./dev.sh stop      # Stop everything"
    echo "  ./dev.sh status    # Check what's running"
    ;;
esac
