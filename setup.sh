#!/bin/bash
# LexMap development setup script

set -e

echo "🗺️  LexMap Development Setup"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 22+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo "⚠️  Node.js $NODE_VERSION detected. Recommended: 22+"
fi

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm not found. Installing..."
    npm install -g pnpm
fi

if ! command -v php &> /dev/null; then
    echo "❌ PHP not found. Please install PHP 8.2+"
    exit 1
fi

if ! command -v composer &> /dev/null; then
    echo "❌ Composer not found. Please install Composer"
    exit 1
fi

echo "✅ Prerequisites OK"
echo ""

# Install dependencies
echo "📦 Installing Node.js dependencies..."
pnpm install -r

echo ""
echo "📦 Installing PHP dependencies..."
cd packages/codemap-php
composer install
cd ../..

echo ""
echo "🔨 Building packages..."
pnpm -r build

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start LexBrain: (ensure running on http://localhost:8123)"
echo "  2. Run incremental index: pnpm index"
echo "  3. Run cold index: pnpm index -- --cold --plan-ai"
echo "  4. Query a slice: pnpm slice -- --symbol 'YourClass::method' --radius 2"
echo ""
echo "See QUICKSTART.md for detailed usage."
