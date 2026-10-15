# How to View .env.local File

## The File Exists!

The `.env.local` file is at:

```
/Users/santoshalamuri/TigerHire/TigerHire/.env.local
```

## Why You Can't See It

Files starting with `.` (dot) are **hidden files** by default in:

- macOS Finder
- Many file explorers
- Some IDE file trees

## How to View It

### Option 1: In Cursor/VS Code

1. **Press `Cmd + Shift + P`** (Mac) or `Ctrl + Shift + P` (Windows/Linux)
2. Type: `File: Reveal in File Explorer` or `File: Open`
3. Type: `.env.local`
4. Press Enter

**OR** use the command palette:

- `Cmd + P` (Mac) or `Ctrl + P` (Windows/Linux)
- Type: `.env.local`
- Press Enter

### Option 2: Show Hidden Files in Finder (macOS)

1. Open Finder
2. Press `Cmd + Shift + .` (period)
3. Hidden files (including `.env.local`) will now be visible
4. Navigate to your project folder

### Option 3: Terminal Command

```bash
cd /Users/santoshalamuri/TigerHire/TigerHire
cat .env.local
```

Or open in your default editor:

```bash
open -a "Cursor" .env.local
# or
code .env.local
```

### Option 4: Direct Path

In Cursor/VS Code:

1. Press `Cmd + O` (Mac) or `Ctrl + O` (Windows/Linux)
2. Paste this path:
   ```
   /Users/santoshalamuri/TigerHire/TigerHire/.env.local
   ```
3. Press Enter

## Current Contents

Your `.env.local` file contains:

- ✅ Supabase credentials (URL, anon key, service role key)
- ✅ Job board encryption key
- ✅ App URL configuration

## Verify It's Gitignored

The file should NOT appear in git status:

```bash
git status
```

If `.env.local` appears, it's not properly ignored. Check `.gitignore` has `.env*` (which it does).
