# Troubleshooting Dev Server Issues

## If `npm run dev` is not starting

### 1. Check for Error Messages

Look at the terminal output. Common errors:

**Missing encryption key:**

```
Error: JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY is required in production
```

**Solution:** Make sure `.env.local` exists with the encryption key.

**Invalid encryption key format:**

```
Error: JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters
```

**Solution:** The key should be exactly 64 characters (32 bytes in hex).

**Module not found:**

```
Cannot find module '@/lib/...'
```

**Solution:** Run `npm install` to ensure dependencies are installed.

### 2. Verify .env.local File

Check that `.env.local` exists and has the encryption key:

```bash
cat .env.local
```

Should show:

```
JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY=4fb6bbafaca42dfea1987bbf0f95f70c3ec61aeaea94da88c1e79916632f38c9
ALLOW_JOB_BOARD_GLOBAL_FALLBACK=false
```

### 3. Clear Next.js Cache

Sometimes Next.js cache causes issues:

```bash
rm -rf .next
npm run dev
```

### 4. Check Node Version

Make sure you're using a compatible Node.js version:

```bash
node --version
```

Should be Node 18+ or 20+.

### 5. Reinstall Dependencies

If modules are missing:

```bash
rm -rf node_modules
npm install
npm run dev
```

### 6. Check for Port Conflicts

If port 3000 is already in use:

```bash
lsof -ti:3000 | xargs kill -9
npm run dev
```

Or use a different port:

```bash
PORT=3001 npm run dev
```

### 7. Check TypeScript Errors

Run type checking:

```bash
npm run typecheck
```

Fix any TypeScript errors shown.

### 8. Common Issues

**Issue:** Server starts but crashes immediately

- Check terminal for stack trace
- Look for import errors or missing files

**Issue:** "Cannot find module" errors

- Run `npm install`
- Check that all files exist in `src/lib/`

**Issue:** Environment variables not loading

- Make sure `.env.local` is in the project root
- Restart the dev server after changing `.env.local`

### 9. Get Detailed Error Output

Run with verbose output:

```bash
NODE_OPTIONS='--trace-warnings' npm run dev
```

This will show more detailed error information.

---

## Quick Fix Checklist

- [ ] `.env.local` exists with encryption key
- [ ] Encryption key is exactly 64 hex characters
- [ ] `node_modules` installed (`npm install`)
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Port 3000 is free
- [ ] Node.js version is 18+ or 20+
- [ ] Cleared `.next` cache

---

## Still Not Working?

Share the exact error message from your terminal, and I can help debug further!
