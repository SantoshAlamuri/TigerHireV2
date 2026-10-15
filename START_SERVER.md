# Starting the Development Server

## Quick Start

Since Node.js is installed at `/usr/local/bin`, you can start the server with:

```bash
cd /Users/santoshalamuri/TigerHire/TigerHire
npm run dev
```

## If `npm` command not found

If you get "command not found", use the full path:

```bash
/usr/local/bin/npm run dev
```

## Make npm available everywhere (Optional)

To use `npm` without the full path, add to your `~/.zshrc`:

```bash
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Then you can use `npm` directly.

## Server URL

Once started, the server will be available at:

- **Local:** http://localhost:3000
- **Network:** http://[your-ip]:3000

## Test Job Board Credentials Feature

1. Open: http://localhost:3000/company/settings
2. Scroll to "Job Board Integrations"
3. Configure Adzuna/Indeed credentials

## Stop the Server

Press `Ctrl + C` in the terminal where the server is running.
