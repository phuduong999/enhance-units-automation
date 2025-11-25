#!/bin/bash

echo "🚀 Setting up Enhance Units Automation..."

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install

# Install extension dependencies
echo "📦 Installing extension dependencies..."
cd extension
npm install

# Build extension
echo "🔨 Building extension..."
npm run build

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Start backend: npm run dev:backend"
echo "2. Load Chrome extension:"
echo "   - Open chrome://extensions"
echo "   - Enable 'Developer mode'"
echo "   - Click 'Load unpacked'"
echo "   - Select: $(pwd)/extension/dist"
echo ""
