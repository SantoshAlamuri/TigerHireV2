# Installing Node.js and npm on macOS

## Option 1: Install via Homebrew (Recommended)

If you have Homebrew installed:

```bash
# Install Node.js (includes npm)
brew install node

# Verify installation
node --version
npm --version
```

## Option 2: Install via nvm (Node Version Manager)

nvm allows you to manage multiple Node.js versions:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or run:
source ~/.zshrc

# Install latest LTS Node.js
nvm install --lts

# Use the installed version
nvm use --lts

# Verify installation
node --version
npm --version
```

## Option 3: Download from nodejs.org

1. Go to: https://nodejs.org/
2. Download the LTS version for macOS
3. Run the installer
4. Restart your terminal

## Verify Installation

After installation, verify it works:

```bash
node --version
npm --version
```

You should see version numbers (e.g., `v20.11.0` and `10.2.4`).

## After Installation

Once Node.js is installed:

1. Navigate to your project:

   ```bash
   cd /Users/santoshalamuri/TigerHire/TigerHire
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

## Recommended Version

- **Node.js:** 18.x or 20.x (LTS)
- **npm:** Comes with Node.js (usually 9.x or 10.x)

## Troubleshooting

### If Homebrew is not installed:

Install Homebrew first:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### If commands still not found after installation:

1. Restart your terminal
2. Or reload your shell config:
   ```bash
   source ~/.zshrc
   ```

### Check if Node.js is installed elsewhere:

```bash
# Check common installation paths
ls -la /usr/local/bin/node
ls -la /opt/homebrew/bin/node
```

If found, add to PATH in `~/.zshrc`:

```bash
export PATH="/usr/local/bin:$PATH"
# or
export PATH="/opt/homebrew/bin:$PATH"
```

Then reload:

```bash
source ~/.zshrc
```
