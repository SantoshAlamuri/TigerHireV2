#!/bin/bash

# Node.js Installation Script for macOS
# Run this script to install Node.js and npm

set -e

echo "🚀 Installing Node.js and npm..."
echo ""

# Check if Homebrew is installed
if command -v brew &> /dev/null; then
    echo "✅ Homebrew found. Installing Node.js via Homebrew..."
    brew install node
    echo ""
    echo "✅ Node.js installed via Homebrew!"
elif [ -d "$HOME/.nvm" ] || [ -f "$HOME/.nvm/nvm.sh" ]; then
    echo "✅ nvm found. Installing Node.js via nvm..."
    source "$HOME/.nvm/nvm.sh" 2>/dev/null || source "$HOME/.zshrc" 2>/dev/null
    nvm install --lts
    nvm use --lts
    echo ""
    echo "✅ Node.js installed via nvm!"
else
    echo "⚠️  Neither Homebrew nor nvm found."
    echo ""
    echo "Please choose one of these options:"
    echo ""
    echo "Option 1: Install Homebrew first, then run this script again"
    echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo ""
    echo "Option 2: Install nvm first, then run this script again"
    echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo ""
    echo "Option 3: Download Node.js installer from https://nodejs.org/"
    echo ""
    exit 1
fi

echo ""
echo "🔍 Verifying installation..."
node --version
npm --version

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "  1. cd /Users/santoshalamuri/TigerHire/TigerHire"
echo "  2. npm install"
echo "  3. npm run dev"
echo ""
