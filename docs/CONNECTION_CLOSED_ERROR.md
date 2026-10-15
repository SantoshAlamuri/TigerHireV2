# "Connection closed" runtime error (Next.js 16 + Webpack)

## What you see

- **Error:** `Connection closed.`
- **Context:** Next.js 16.1.6 with Webpack (`next dev --webpack` or `next build --webpack`).

## Common causes

1. **Client disconnects before the response finishes**
   - User navigates away, refreshes, or closes the tab while the page or an RSC payload is still loading.
   - The server sees the connection close and may surface this as "Connection closed".

2. **Server action used as a callback (if you add Server Actions later)**
   - Passing a server function directly to a client component as a callback (e.g. `onClick={serverAction}`) can trigger this when the RSC connection is closed.
   - **Fix:** Wrap in a client handler: `onClick={() => serverAction()}` or `onClick={() => { serverAction(); }}`.

3. **Development Webpack HMR**
   - In dev, the WebSocket for Hot Module Replacement can close (e.g. proxy not forwarding WebSockets, or tab closed). That can sometimes surface as a connection-related error.
   - **Fix:** Ensure `/_next/webpack-hmr` is not blocked; if using a proxy, enable WebSocket upgrade.

4. **Long-running middleware or server work**
   - If middleware or a server component does slow I/O and the client times out or navigates away, the connection may close.
   - **Fix:** Keep middleware fast; move heavy work to API routes or background jobs.

## What we did in the app

- **Global error UI:** The app’s `global-error.tsx` detects "Connection closed" (and similar messages like "aborted" / "ECONNRESET") and shows a short, user-friendly explanation and a "Try again" button instead of the raw error.

## What you can do

- **If it happens on a specific action (e.g. a button):** Ensure you’re not passing a server function directly as a callback; use a wrapper as above.
- **If it happens on navigation or refresh:** Often benign (user left before load finished). The new global error message should make it clear. If it happens often on normal navigation, check for very slow server work or timeouts.
- **If it happens only in development:** Check proxy/WebSocket config for HMR and that you’re running the same dev command consistently (e.g. `npm run dev` which uses `next dev --webpack`).
