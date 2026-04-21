import React, { useState } from "react";

export default function LoginForm({ onSave }) {
  const [cookie, setCookie] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!cookie.trim()) {
      return;
    }

    setLoading(true);
    try {
      if (window.api?.setSessionCookie) {
        await window.api.setSessionCookie(cookie);
      } else {
        // Browser fallback: save to localStorage
        localStorage.setItem('x_session_cookie', cookie);
      }
      onSave();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try {
      onSave();
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e?.preventDefault();
    setLoginLoading(true);
    try {
      if (window.api?.openLoginWindow) {
        const result = await window.api.openLoginWindow();
        if (result && result.success && result.cookie) {
          setCookie(result.cookie);
          onSave();
        }
      }
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--paper)",
      }}
    >
      <div
        style={{
          width: "360px",
          background: "var(--paper)",
          borderRadius: "12px",
          boxShadow: "0 20px 60px -20px rgba(25,25,25,0.35), 0 6px 20px -8px rgba(25,25,25,0.22), inset 1px 1px 0 rgba(255,255,255,0.8), inset -1px -1px 0 rgba(0,0,0,0.15)",
          border: "1px solid var(--rule)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "16px",
            background: "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0))",
            borderBottom: "1px solid var(--rule)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="6" fill="#db6a46"/>
            <path d="M20 8L28 14V26C28 29.3137 25.3137 32 22 32H18C14.6863 32 12 29.3137 12 26V14L20 8Z" fill="white" opacity="0.3"/>
          </svg>
          <div>
            <h1
              style={{
                fontSize: "14px",
                fontWeight: "600",
                fontFamily: "'Anthropic Mono', monospace",
                margin: "0",
                color: "var(--ink)",
              }}
            >
              x-canvas
            </h1>
            <p style={{ fontSize: "10px", color: "var(--ink-4)", margin: "0", fontFamily: "'Anthropic Mono', monospace" }}>
              infinite canvas
            </p>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "20px", overflow: "auto", maxHeight: "calc(100vh - 120px)" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2
              style={{
                fontSize: "14px",
                fontWeight: "600",
                fontFamily: "'Anthropic Mono', monospace",
                marginBottom: "6px",
                color: "var(--ink)",
              }}
            >
              Welcome to x-canvas
            </h2>
            <p style={{ fontSize: "12px", color: "var(--ink-3)", margin: "0", lineHeight: "1.4" }}>
              An infinite canvas for organizing your web. Optionally add your X.com session to sync bookmarks.
            </p>
          </div>

          <button
            onClick={handleLogin}
            disabled={loginLoading}
            style={{
              width: "100%",
              padding: "11px 14px",
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontWeight: "600",
              fontSize: "12px",
              fontFamily: "'Anthropic Mono', monospace",
              cursor: loginLoading ? "not-allowed" : "pointer",
              opacity: loginLoading ? 0.7 : 1,
              transition: "all 120ms",
              marginBottom: "14px",
              boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(0,0,0,0.2)",
            }}
            onMouseEnter={(e) => {
              if (!loginLoading) e.target.style.background = "var(--accent-soft)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "var(--accent)";
            }}
          >
            {loginLoading ? "Opening X.com..." : "🔓 Login with X.com"}
          </button>

          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                fontSize: "10px",
                fontWeight: "600",
                fontFamily: "'Anthropic Mono', monospace",
                color: "var(--ink-3)",
                display: "block",
                marginBottom: "6px",
              }}
            >
              Or paste cookie manually
            </label>
            <textarea
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="Paste your X.com session cookie here..."
              rows={4}
              style={{
                width: "100%",
                padding: "8px",
                border: `1px solid var(--rule)`,
                borderRadius: "5px",
                fontFamily: "'Anthropic Mono', monospace",
                fontSize: "10px",
                color: "var(--ink)",
                background: "var(--paper-2)",
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 120ms",
                boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.4), inset -1px -1px 0 rgba(0,0,0,0.08)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "var(--accent)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--rule)";
              }}
            />
            <p style={{ fontSize: "9px", color: "var(--ink-4)", margin: "6px 0 0 0", lineHeight: "1.3" }}>
              Paste the complete cookie string from your X.com session (look for auth_token and ct0)
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={handleSave}
              disabled={!cookie.trim() || loading}
              style={{
                flex: 1,
                padding: "11px 14px",
                background: cookie.trim() ? "var(--accent)" : "var(--ink-4)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontWeight: "600",
                fontSize: "12px",
                fontFamily: "'Anthropic Mono', monospace",
                cursor: !cookie.trim() || loading ? "not-allowed" : "pointer",
                opacity: !cookie.trim() || loading ? 0.6 : 1,
                transition: "all 120ms",
                boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(0,0,0,0.2)",
              }}
              onMouseEnter={(e) => {
                if (cookie.trim() && !loading) {
                  e.target.style.background = "var(--accent-soft)";
                }
              }}
              onMouseLeave={(e) => {
                if (cookie.trim() && !loading) {
                  e.target.style.background = "var(--accent)";
                }
              }}
            >
              {loading ? "Saving..." : "✓ Save & Enter"}
            </button>

            <button
              onClick={handleSkip}
              disabled={loading}
              style={{
                flex: 0.7,
                padding: "11px 14px",
                background: "var(--rule-strong)",
                color: "var(--ink)",
                border: "none",
                borderRadius: "6px",
                fontWeight: "600",
                fontSize: "12px",
                fontFamily: "'Anthropic Mono', monospace",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                transition: "all 120ms",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.background = "var(--rule)";
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "var(--rule-strong)";
              }}
            >
              {loading ? "..." : "Skip"}
            </button>
          </div>

          <p
            style={{
              fontSize: "9px",
              color: "var(--ink-4)",
              marginTop: "12px",
              marginBottom: "0",
              textAlign: "center",
              fontFamily: "'Anthropic Mono', monospace",
              letterSpacing: "0.01em"
            }}
          >
            🗺️ Organize your web with infinite space
          </p>
        </div>
      </div>
    </div>
  );
}
