# Complete Setup Instructions

## Step 1: Install Node.js

I've created an installation script for you. Run this in your terminal:

```bash
cd /Users/santoshalamuri/TigerHire/TigerHire
./install-node.sh
```

**OR** if the script doesn't work, install manually:

### Quick Install (Choose One):

**Option A - Using Homebrew (if you have it):**

```bash
brew install node
```

**Option B - Using nvm (recommended):**

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal, then:
nvm install --lts
nvm use --lts
```

**Option C - Download installer:**

1. Visit: https://nodejs.org/
2. Download LTS version for macOS
3. Run the installer
4. Restart terminal

## Step 2: Verify Installation

```bash
node --version
npm --version
```

Should show version numbers (e.g., `v20.11.0` and `10.2.4`).

## Step 3: Install Project Dependencies

```bash
cd /Users/santoshalamuri/TigerHire/TigerHire
npm install
```

This may take a few minutes.

## Step 4: Start Development Server

```bash
npm run dev
```

The server should start on `http://localhost:3000`

## Step 5: Test Job Board Credentials Feature

1. Open browser: `http://localhost:3000/company/settings`
2. Scroll to "Job Board Integrations" section
3. Configure Adzuna/Indeed credentials

## Troubleshooting

### If `npm install` fails:

- Make sure you have internet connection
- Try: `npm install --legacy-peer-deps`

### If server won't start:

- Check port 3000 is free: `lsof -ti:3000`
- Kill process if needed: `lsof -ti:3000 | xargs kill -9`
- Try different port: `PORT=3001 npm run dev`

### If you see "command not found" after installing:

- Restart your terminal
- Or run: `source ~/.zshrc`

## What's Already Done ✅

- ✅ Database migration applied
- ✅ Encryption key generated and saved
- ✅ All code files created
- ✅ UI components added
- ✅ API routes created

You just need Node.js to run the server!
