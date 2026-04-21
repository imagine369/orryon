"use client";

/**
 * Catches errors that escape the root layout (very rare).
 * Must provide its own <html> + <body> since the root layout may have crashed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: "#000", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            textAlign: "center",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <p
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.2)",
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Critical error
          </p>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "rgba(255,255,255,0.9)",
              marginBottom: 8,
            }}
          >
            Orryon ran into a problem
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.35)",
              maxWidth: 300,
              lineHeight: 1.6,
              marginBottom: 32,
            }}
          >
            We&apos;re sorry about this. Try refreshing the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 500,
              color: "#000",
              background: "#fff",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  );
}
