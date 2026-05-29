"use client";

import { useState } from "react";
import type { CheckResult, ValidationReport } from "../lib/checks";

const DEFAULT_ISSUER = "https://test-issuer.openlearnprotocol.org";

const LEVEL_COLOR: Record<CheckResult["level"], string> = {
  pass: "#22c55e",
  fail: "#ef4444",
  warn: "#f59e0b",
  info: "#60a5fa",
};
const LEVEL_LABEL: Record<CheckResult["level"], string> = {
  pass: "PASS",
  fail: "FAIL",
  warn: "WARN",
  info: "INFO",
};

export default function Home() {
  const [tutorUrl, setTutorUrl] = useState("https://example-tutor.vercel.app");
  const issuerUrl = DEFAULT_ISSUER;
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const r = await fetch("/api/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tutorUrl, issuerUrl }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${r.status}`);
      }
      setReport(await r.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const counts = report
    ? report.checks.reduce(
        (acc, c) => ({ ...acc, [c.level]: (acc[c.level] ?? 0) + 1 }),
        {} as Record<string, number>
      )
    : null;

  return (
    <main style={{ maxWidth: 880, margin: "60px auto", padding: "0 24px" }}>
      <h1 style={{ margin: 0 }}>🔍 EduSSO v1 Validator</h1>
      <p style={{ color: "#94a3b8", marginTop: 6 }}>
        Black-box conformance checks for a tutor / relying party.
        See <a style={{ color: "#60a5fa" }} href="https://github.com/open-learn-org/open-learn-protocol/tree/main/specs/edu-sso">edu-sso specs</a>.
      </p>
      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px solid #1e3a5f",
          borderRadius: 8,
          background: "#0c1a2e",
          fontSize: 13,
          color: "#cbd5e1",
        }}
      >
        The full SSO flow check mints a real JWT signed by{" "}
        <code style={{ color: "#60a5fa" }}>{DEFAULT_ISSUER}</code> and sends it to your tutor.
        For this to pass, configure your tutor to trust this issuer in staging — e.g.
        <pre style={{ margin: "8px 0 0", padding: 8, background: "#020617", borderRadius: 4, overflow: "auto" }}>
{`EDU_SSO_ISSUER=${DEFAULT_ISSUER}
EDU_SSO_AUDIENCE=<your tutor host>`}
        </pre>
        JWKS lives at <code style={{ color: "#60a5fa" }}>{DEFAULT_ISSUER}/.well-known/jwks.json</code>.
      </div>

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: "1px solid #1e293b",
          borderRadius: 10,
          background: "#0f172a",
          display: "grid",
          gap: 12,
        }}
      >
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Tutor URL</span>
          <input
            value={tutorUrl}
            onChange={(e) => setTutorUrl(e.target.value)}
            placeholder="https://your-tutor.example.com"
            style={inputStyle}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>
            Issuer URL <span style={{ color: "#64748b" }}>(fixed — the validator only mints tokens from its own test issuer)</span>
          </span>
          <input value={issuerUrl} readOnly disabled style={{ ...inputStyle, opacity: 0.7, cursor: "not-allowed" }} />
        </label>
        <button onClick={run} disabled={running || !tutorUrl} style={buttonStyle}>
          {running ? "Running checks…" : "Run validation"}
        </button>
      </section>

      {error && (
        <p style={{ color: "#f87171", marginTop: 24 }}>
          {error}
        </p>
      )}

      {report && (
        <section style={{ marginTop: 24 }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 12, color: "#94a3b8", fontSize: 13 }}>
            <span>tutor: <code>{report.tutorUrl}</code></span>
            <span>issuer: <code>{report.issuerUrl}</code></span>
          </div>
          {counts && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["pass", "fail", "warn", "info"] as const).map((lvl) =>
                counts[lvl] ? (
                  <span
                    key={lvl}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: LEVEL_COLOR[lvl] + "22",
                      color: LEVEL_COLOR[lvl],
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {counts[lvl]} {LEVEL_LABEL[lvl]}
                  </span>
                ) : null
              )}
            </div>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {report.checks.map((c) => (
              <li
                key={c.id}
                style={{
                  padding: 12,
                  border: "1px solid #1e293b",
                  borderRadius: 8,
                  background: "#0f172a",
                  display: "grid",
                  gridTemplateColumns: "60px 1fr",
                  gap: 12,
                  alignItems: "start",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: LEVEL_COLOR[c.level],
                    background: LEVEL_COLOR[c.level] + "1a",
                    padding: "3px 6px",
                    borderRadius: 4,
                    textAlign: "center",
                  }}
                >
                  {LEVEL_LABEL[c.level]}
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4, fontFamily: "ui-monospace, monospace", wordBreak: "break-word" }}>
                    {c.detail}
                  </div>
                  {c.ref && (
                    <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
                      {c.id} · {c.ref}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #1e293b",
  background: "#020617",
  color: "#e6edf3",
  fontFamily: "ui-monospace, monospace",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#3b82f6",
  color: "white",
  border: 0,
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
};
