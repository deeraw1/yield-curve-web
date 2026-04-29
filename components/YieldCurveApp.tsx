"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
  Scatter,
  ScatterChart,
} from "recharts";

// ── FGN Bond market data (approx as at Dec 2024 / Jan 2025) ───────────────────
// { maturity: years, yield: % }
const OBSERVED_BONDS = [
  { maturity: 0.083, yield: 26.90, label: "1M T-Bill" },
  { maturity: 0.25,  yield: 26.85, label: "3M T-Bill" },
  { maturity: 0.5,   yield: 26.30, label: "6M T-Bill" },
  { maturity: 1,     yield: 25.80, label: "1Y T-Bill" },
  { maturity: 2,     yield: 21.50, label: "2Y FGN" },
  { maturity: 3,     yield: 19.50, label: "3Y FGN" },
  { maturity: 5,     yield: 18.75, label: "5Y FGN" },
  { maturity: 7,     yield: 18.90, label: "7Y FGN" },
  { maturity: 10,    yield: 18.80, label: "10Y FGN" },
  { maturity: 15,    yield: 19.20, label: "15Y FGN" },
  { maturity: 20,    yield: 19.60, label: "20Y FGN" },
  { maturity: 30,    yield: 20.10, label: "30Y FGN" },
];

// Historical periods for comparison
const HISTORICAL_CURVES: { period: string; bonds: { maturity: number; yield: number }[] }[] = [
  {
    period: "Dec 2022",
    bonds: [
      { maturity: 0.25, yield: 9.8 }, { maturity: 1, yield: 10.5 }, { maturity: 3, yield: 12.2 },
      { maturity: 5, yield: 13.0 }, { maturity: 10, yield: 14.1 }, { maturity: 20, yield: 15.2 }, { maturity: 30, yield: 15.8 },
    ],
  },
  {
    period: "Dec 2023",
    bonds: [
      { maturity: 0.25, yield: 18.0 }, { maturity: 1, yield: 18.5 }, { maturity: 3, yield: 16.8 },
      { maturity: 5, yield: 16.2 }, { maturity: 10, yield: 15.9 }, { maturity: 20, yield: 16.5 }, { maturity: 30, yield: 17.0 },
    ],
  },
];

// ── Nelson-Siegel yield curve: y(m) = β0 + β1*(1-e^(-m/τ))/(m/τ) + β2*[(1-e^(-m/τ))/(m/τ) - e^(-m/τ)] ──
function nelsonSiegel(maturity: number, beta0: number, beta1: number, beta2: number, tau: number): number {
  if (maturity <= 0) return beta0 + beta1;
  const x = maturity / tau;
  const factor1 = (1 - Math.exp(-x)) / x;
  const factor2 = factor1 - Math.exp(-x);
  return beta0 + beta1 * factor1 + beta2 * factor2;
}

// Fit Nelson-Siegel via least squares (gradient descent)
function fitNelsonSiegel(bonds: { maturity: number; yield: number }[]) {
  let beta0 = 15, beta1 = 10, beta2 = -5, tau = 2;
  const lr = 0.001;
  const maxIter = 5000;

  for (let iter = 0; iter < maxIter; iter++) {
    let dB0 = 0, dB1 = 0, dB2 = 0, dTau = 0;
    for (const b of bonds) {
      const m = b.maturity;
      const x = m / tau;
      const f1 = (1 - Math.exp(-x)) / x;
      const f2 = f1 - Math.exp(-x);
      const predicted = beta0 + beta1 * f1 + beta2 * f2;
      const err = predicted - b.yield;

      dB0 += err * 2;
      dB1 += err * 2 * f1;
      dB2 += err * 2 * f2;

      // Numerical gradient for tau
      const delta = 0.01;
      const yUp = nelsonSiegel(m, beta0, beta1, beta2, tau + delta);
      const yDn = nelsonSiegel(m, beta0, beta1, beta2, tau - delta);
      dTau += err * 2 * (yUp - yDn) / (2 * delta);
    }
    const n = bonds.length;
    beta0 -= (lr * dB0) / n;
    beta1 -= (lr * dB1) / n;
    beta2 -= (lr * dB2) / n;
    tau = Math.max(0.1, tau - (lr * dTau) / n);
  }
  return { beta0, beta1, beta2, tau };
}

// Generate smooth curve points
function generateCurve(beta0: number, beta1: number, beta2: number, tau: number) {
  const points = [];
  const maturities = [0.083, 0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 25, 30];
  for (const m of maturities) {
    points.push({ maturity: m, yield: parseFloat(nelsonSiegel(m, beta0, beta1, beta2, tau).toFixed(3)) });
  }
  return points;
}

// Detect inversions: short end yield > long end yield
function detectInversions(curve: { maturity: number; yield: number }[]) {
  const inversions = [];
  for (let i = 0; i < curve.length - 1; i++) {
    if (curve[i].yield > curve[i + 1].yield) {
      inversions.push({
        from: curve[i].maturity,
        to: curve[i + 1].maturity,
        spread: parseFloat((curve[i].yield - curve[i + 1].yield).toFixed(2)),
      });
    }
  }
  return inversions;
}

// Carry trade opportunities: segments with steepest slope per unit of maturity
function findCarryOpportunities(curve: { maturity: number; yield: number }[]) {
  const opps = [];
  for (let i = 0; i < curve.length - 1; i++) {
    const slope = (curve[i + 1].yield - curve[i].yield) / (curve[i + 1].maturity - curve[i].maturity);
    opps.push({
      segment: `${curve[i].maturity}Y–${curve[i + 1].maturity}Y`,
      slope: parseFloat(slope.toFixed(3)),
      carryPickup: parseFloat((curve[i + 1].yield - curve[i].yield).toFixed(2)),
    });
  }
  return opps.sort((a, b) => b.carryPickup - a.carryPickup).slice(0, 5);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", minWidth: 180 }}>
      <p style={{ color: "var(--accent2)", fontWeight: 700, marginBottom: 8 }}>
        {typeof label === "number" ? `${label}Y maturity` : label}
      </p>
      {payload.map((p: any) => (
        p.value != null && (
          <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 4 }}>
            <span style={{ color: p.color || "var(--muted)", fontSize: 13 }}>{p.name}</span>
            <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>{p.value.toFixed(2)}%</span>
          </div>
        )
      ))}
    </div>
  );
}

function SpreadBadge({ label, spread, inversion = false }: { label: string; spread: number; inversion?: boolean }) {
  const color = inversion ? "#ef4444" : spread > 0 ? "#22c55e" : "#f59e0b";
  return (
    <div style={{ background: "var(--surface2)", border: `1px solid ${inversion ? "rgba(239,68,68,0.3)" : "var(--border)"}`, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 800 }}>{spread > 0 ? "+" : ""}{spread.toFixed(2)}pp</div>
      {inversion && <div style={{ color: "#ef4444", fontSize: 11, marginTop: 4, fontWeight: 600 }}>⚠ INVERTED</div>}
    </div>
  );
}

const MATURITY_LABELS: Record<number, string> = {
  0.083: "1M", 0.25: "3M", 0.5: "6M", 1: "1Y", 2: "2Y", 3: "3Y",
  5: "5Y", 7: "7Y", 10: "10Y", 15: "15Y", 20: "20Y", 25: "25Y", 30: "30Y",
};

export default function YieldCurveApp() {
  const [showHistorical, setShowHistorical] = useState(true);
  const [selectedBonds, setSelectedBonds] = useState<string[]>([]);

  // Fit Nelson-Siegel to observed data
  const fitted = useMemo(() => fitNelsonSiegel(OBSERVED_BONDS), []);
  const nsCurve = useMemo(() => generateCurve(fitted.beta0, fitted.beta1, fitted.beta2, fitted.tau), [fitted]);
  const inversions = useMemo(() => detectInversions(nsCurve), [nsCurve]);
  const carryOpps = useMemo(() => findCarryOpportunities(nsCurve), [nsCurve]);

  // Historical NS fits (simplified — use observed bond yields directly interpolated)
  const hist2022 = HISTORICAL_CURVES[0].bonds;
  const hist2023 = HISTORICAL_CURVES[1].bonds;

  // Chart data: merge NS curve + observed points
  const chartData = nsCurve.map((pt) => {
    const obs = OBSERVED_BONDS.find((b) => Math.abs(b.maturity - pt.maturity) < 0.01);
    const h22 = hist2022.find((b) => Math.abs(b.maturity - pt.maturity) < 0.01);
    const h23 = hist2023.find((b) => Math.abs(b.maturity - pt.maturity) < 0.01);
    return {
      maturity: pt.maturity,
      maturityLabel: MATURITY_LABELS[pt.maturity] ?? `${pt.maturity}Y`,
      nsCurve: pt.yield,
      observed: obs?.yield ?? null,
      dec2022: showHistorical ? (h22?.yield ?? null) : null,
      dec2023: showHistorical ? (h23?.yield ?? null) : null,
    };
  });

  // Key spreads
  const yld = (m: number) => nelsonSiegel(m, fitted.beta0, fitted.beta1, fitted.beta2, fitted.tau);
  const spread10_2 = parseFloat((yld(10) - yld(2)).toFixed(2));
  const spread30_1 = parseFloat((yld(30) - yld(1)).toFixed(2));
  const spread5_1 = parseFloat((yld(5) - yld(1)).toFixed(2));
  const spreadBill = parseFloat((yld(0.083) - yld(1)).toFixed(2));

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, #0b0e18 0%, #0d1220 60%, #111828 100%)", borderBottom: "1px solid var(--border)", padding: "56px 24px 48px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["Nelson-Siegel Model", "FGN Bond Data", "Inversion Detection", "Carry Trade Signals"].map((tag) => (
            <span key={tag} style={{ background: "rgba(200,168,58,0.12)", border: "1px solid rgba(200,168,58,0.3)", color: "var(--accent2)", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 500 }}>
              {tag}
            </span>
          ))}
        </div>
        <h1 style={{ fontSize: "clamp(26px, 5vw, 46px)", fontWeight: 800, color: "var(--text)", marginBottom: 16 }}>
          FGN Bond Yield Curve Modeller
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 16, maxWidth: 620, margin: "0 auto" }}>
          Nelson-Siegel model fitted to FGN bond market data — plots the live yield curve, flags segment inversions,
          and identifies carry trade opportunities across the maturity spectrum.
        </p>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        {/* NS Parameters */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
          {[
            { label: "β₀ — Long-run Level", value: fitted.beta0.toFixed(2), unit: "%", desc: "Yield at infinite maturity" },
            { label: "β₁ — Short-term Component", value: fitted.beta1.toFixed(2), unit: "pp", desc: "Drives the slope at the short end" },
            { label: "β₂ — Medium-term Hump", value: fitted.beta2.toFixed(2), unit: "pp", desc: "Creates curve convexity" },
            { label: "τ — Decay Rate", value: fitted.tau.toFixed(3), unit: "yr", desc: "Maturity of maximum curvature" },
          ].map(({ label, value, unit, desc }) => (
            <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ color: "var(--accent2)", fontSize: 26, fontWeight: 800 }}>{value}<span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 4 }}>{unit}</span></div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* Key Spreads */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 32 }}>
          <SpreadBadge label="10Y-2Y Spread" spread={spread10_2} inversion={spread10_2 < 0} />
          <SpreadBadge label="30Y-1Y Spread" spread={spread30_1} inversion={spread30_1 < 0} />
          <SpreadBadge label="5Y-1Y Spread" spread={spread5_1} inversion={spread5_1 < 0} />
          <SpreadBadge label="1M-1Y Spread (Bills)" spread={spreadBill} inversion={true} />
          <div style={{ background: "var(--surface2)", border: inversions.length > 0 ? "1px solid rgba(239,68,68,0.4)" : "1px solid var(--border)", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 6 }}>Inversions Detected</div>
            <div style={{ color: inversions.length > 0 ? "#ef4444" : "#22c55e", fontSize: 22, fontWeight: 800 }}>{inversions.length}</div>
            <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>curve segments</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 32, alignItems: "start" }}>
          {/* Yield Curve Chart */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "28px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ color: "var(--text)", fontWeight: 700, fontSize: 18 }}>FGN Yield Curve (Dec 2024)</h2>
                <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Nelson-Siegel fit · Observed market yields · Historical comparison</p>
              </div>
              <button
                onClick={() => setShowHistorical(!showHistorical)}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid",
                  borderColor: showHistorical ? "var(--accent)" : "var(--border)",
                  background: showHistorical ? "rgba(200,168,58,0.15)" : "transparent",
                  color: showHistorical ? "var(--accent2)" : "var(--muted)",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {showHistorical ? "Hide Historical" : "Show Historical"}
              </button>
            </div>

            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="maturityLabel" stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                <YAxis domain={[8, 32]} stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ color: "var(--muted)", fontSize: 13, paddingTop: 16 }} />

                {showHistorical && (
                  <>
                    <Line dataKey="dec2022" name="Dec 2022" stroke="#6b7280" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
                    <Line dataKey="dec2023" name="Dec 2023" stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
                  </>
                )}
                <Line dataKey="nsCurve" name="NS Fitted (Dec 2024)" stroke="var(--accent)" strokeWidth={2.5} dot={false} connectNulls />
                <Line dataKey="observed" name="Market Observed" stroke="var(--accent2)" strokeWidth={0} dot={{ fill: "var(--accent2)", r: 6, strokeWidth: 0 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Inversion highlight */}
            {inversions.length > 0 && (
              <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8 }}>
                <p style={{ color: "#ef4444", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>⚠ Yield Curve Inversions Detected</p>
                {inversions.map((inv, i) => (
                  <p key={i} style={{ color: "var(--muted)", fontSize: 12 }}>
                    {inv.from}Y → {inv.to}Y: short rate exceeds long rate by <strong style={{ color: "#ef4444" }}>{inv.spread}pp</strong>
                  </p>
                ))}
                <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
                  Nigeria&apos;s curve is currently inverted at the short end due to the CBN&apos;s emergency rate hike cycle (MPR 27.5%). Bills yield more than medium-term bonds — a hawkish monetary policy signal.
                </p>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Bond table */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px 20px" }}>
              <h3 style={{ color: "var(--accent2)", fontWeight: 700, fontSize: 15, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Market Yields vs NS Fit
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Instrument", "Market", "NS Fit", "Error"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", color: "var(--muted)", textAlign: "right", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {OBSERVED_BONDS.map((b) => {
                      const fit = nelsonSiegel(b.maturity, fitted.beta0, fitted.beta1, fitted.beta2, fitted.tau);
                      const err = b.yield - fit;
                      return (
                        <tr key={b.label} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "8px 10px", color: "var(--text)", textAlign: "right" }}>{b.label}</td>
                          <td style={{ padding: "8px 10px", color: "var(--accent2)", fontWeight: 600, textAlign: "right" }}>{b.yield.toFixed(2)}%</td>
                          <td style={{ padding: "8px 10px", color: "var(--accent)", textAlign: "right" }}>{fit.toFixed(2)}%</td>
                          <td style={{ padding: "8px 10px", color: Math.abs(err) < 0.5 ? "#22c55e" : "#f59e0b", textAlign: "right", fontWeight: 600 }}>
                            {err > 0 ? "+" : ""}{err.toFixed(2)}pp
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Carry trade */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px 20px" }}>
              <h3 style={{ color: "var(--accent2)", fontWeight: 700, fontSize: 15, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Top Carry Trade Opportunities
              </h3>
              {carryOpps.map((opp, i) => (
                <div key={opp.segment} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < carryOpps.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>{opp.segment}</span>
                    <span style={{ color: opp.carryPickup > 0 ? "#22c55e" : "#ef4444", fontWeight: 700, fontSize: 13 }}>
                      {opp.carryPickup > 0 ? "+" : ""}{opp.carryPickup.toFixed(2)}pp
                    </span>
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>
                    Slope: {opp.slope.toFixed(3)}pp/yr
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Context note */}
        <div style={{ marginTop: 24, padding: "20px 24px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <h3 style={{ color: "var(--accent2)", fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Nigeria Rate Cycle Context</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.8 }}>
            The CBN raised the MPR from 11.5% (end-2022) to <strong style={{ color: "var(--text)" }}>27.5% by end-2024</strong> — a 1,600bps tightening cycle driven by
            naira depreciation and inflation above 34%. This has produced a <strong style={{ color: "#ef4444" }}>deeply inverted short end</strong>:
            91-day T-bills yield ~27% while 10-year FGN bonds yield ~19%. Duration extension into the belly (3-7Y)
            offers the best risk-adjusted carry once the CBN pivots. The long end (15-30Y) remains relatively
            anchored by insurance and pension fund demand.
          </p>
        </div>

        {/* Methodology */}
        <div style={{ marginTop: 16, padding: "20px 24px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <h3 style={{ color: "var(--accent2)", fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Methodology</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.8 }}>
            The <strong style={{ color: "var(--text)" }}>Nelson-Siegel (1987) model</strong> parameterises the yield curve as:
            <em style={{ color: "var(--text)" }}> y(m) = β₀ + β₁·[(1−e^(−m/τ))/(m/τ)] + β₂·[(1−e^(−m/τ))/(m/τ) − e^(−m/τ)]</em>.
            Parameters are fitted by gradient descent minimising sum of squared errors against observed FGN and T-bill yields.
            β₀ is the long-run level, β₁ the short-term slope loading, β₂ controls medium-term curvature, and τ governs
            where the hump peaks. Data sourced from DMO and CBN market data (December 2024 / January 2025).
          </p>
        </div>
      </div>

      <footer style={{ textAlign: "center", padding: "32px 24px", borderTop: "1px solid var(--border)", marginTop: 48 }}>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Built by{" "}
          <a href="mailto:adediranabiola160@gmail.com" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Abiola Adediran
          </a>{" "}
          · Nelson-Siegel Model · FGN Bond Analytics
        </p>
      </footer>
    </div>
  );
}
