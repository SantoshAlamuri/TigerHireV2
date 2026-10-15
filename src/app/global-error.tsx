"use client";

/* Inlined to avoid Next.js preloading this CSS on every page (global-error only renders on crash). */
const globalErrorStyles = `
  .global-error-body {
    font-family: system-ui, sans-serif;
    padding: 2rem;
    max-width: 48rem;
    margin: 0 auto;
  }
  .global-error-title {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }
  .global-error-message {
    color: #666;
    margin-bottom: 1rem;
  }
  .global-error-button {
    padding: 0.5rem 1rem;
    background: #000;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  .global-error-button:hover {
    background: #333;
  }
  .global-error-pre {
    margin-top: 1.5rem;
    font-size: 0.75rem;
    overflow: auto;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 6px;
  }
`;

function isConnectionClosedError(error: Error): boolean {
  const msg = error.message ?? "";
  return (
    msg.includes("Connection closed") ||
    msg.includes("connection closed") ||
    msg.includes("aborted") ||
    msg.includes("ECONNRESET")
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isConnectionClosed = isConnectionClosedError(error);
  const title = isConnectionClosed ? "Connection closed" : "Something went wrong";
  const message = isConnectionClosed
    ? "The connection was closed before the page finished loading. This often happens when you navigate away, refresh, or the tab closes. Try again or refresh the page."
    : "We've been notified. Please try again.";

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: globalErrorStyles }} />
      </head>
      <body className="global-error-body">
        <h1 className="global-error-title">{title}</h1>
        <p className="global-error-message">{message}</p>
        <button type="button" onClick={() => reset()} className="global-error-button">
          Try again
        </button>
        {process.env.NODE_ENV === "development" && (
          <pre className="global-error-pre">
            {error.message}
            {"\n\n"}
            {error.stack}
          </pre>
        )}
      </body>
    </html>
  );
}
