# FGN Bond Yield Curve Modeller

An interactive yield curve tool that fits the Nelson-Siegel model to FGN (Federal Government of Nigeria) bond and T-bill market data. Plots the live yield curve, detects segment inversions, and ranks carry trade opportunities across the maturity spectrum.

## What It Does

- Loads observed FGN and T-bill yields across 12 maturity points (1M to 30Y) as at December 2024 / January 2025
- Fits the **Nelson-Siegel (1987) model** via gradient descent (5,000 iterations): **y(m) = β₀ + β₁·[(1−e^(−m/τ))/(m/τ)] + β₂·[(1−e^(−m/τ))/(m/τ) − e^(−m/τ)]**
- Displays fitted NS parameters: β₀ (long-run level), β₁ (slope), β₂ (curvature), τ (decay rate)
- Detects and flags yield curve inversions by segment
- Computes key spreads: 10Y-2Y, 30Y-1Y, 5Y-1Y, 1M-1Y
- Ranks carry trade opportunities by yield pickup per unit of maturity extension
- Shows bond-by-bond model fit error (market yield vs NS fitted)
- Overlays historical curves (Dec 2022, Dec 2023) for comparison

## Key Insights Surfaced

- Nigeria's curve is currently **inverted at the short end** — T-bills yield ~27% vs 10Y FGN at ~19%
- Driven by the CBN's 1,600bps rate hike cycle (MPR from 11.5% to 27.5% between 2022–2024)
- Best carry opportunity sits in the 3–7Y belly once the CBN pivots
- Long end (15–30Y) anchored by pension and insurance fund demand

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Recharts** — ComposedChart with Line series
- **Tailwind CSS**
- Nelson-Siegel fitted via pure JavaScript gradient descent — no backend

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Data Sources

- DMO Debt Management Office — FGN bond yields
- CBN Central Bank of Nigeria — T-bill auction rates
- Market data as at December 2024 / January 2025

---

Built by [Muhammed Adediran](https://adediran.xyz/contact)
