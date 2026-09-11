import type { MarketSnapshot, ReplayFile, SimulationConfig } from "./types";

export const DISCLAIMER =
  "Synthetic educational simulation only. Not market data, investment advice, or a trading system.";

export const createReplay = (
  config: SimulationConfig,
  finalSnapshot: MarketSnapshot,
  generatedAt = new Date().toISOString(),
): ReplayFile => ({
  schemaVersion: 1,
  generatedAt,
  application: "Market Microstructure Crisis Lab",
  config,
  finalSnapshot,
  disclaimer: DISCLAIMER,
});

export const parseReplay = (value: string): ReplayFile => {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("schemaVersion" in parsed) ||
    parsed.schemaVersion !== 1 ||
    !("application" in parsed) ||
    parsed.application !== "Market Microstructure Crisis Lab" ||
    !("config" in parsed) ||
    !("finalSnapshot" in parsed)
  ) {
    throw new Error("Unsupported or invalid replay file");
  }
  return parsed as ReplayFile;
};

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );

export const createIncidentReport = (
  config: SimulationConfig,
  snapshot: MarketSnapshot,
): string => {
  const metric = (label: string, value: string): string =>
    `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  const alerts = snapshot.alerts
    .map(
      (alert) =>
        `<li><b>T${alert.tick} · ${escapeHtml(alert.title)}</b><span>${escapeHtml(alert.detail)}</span></li>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Market incident report</title><style>body{margin:0;background:#07101d;color:#e7edf7;font:15px/1.6 Inter,system-ui}main{max-width:980px;margin:auto;padding:56px 24px}header{border-bottom:1px solid #25354c;padding-bottom:24px}.tag{color:#50e3c2;text-transform:uppercase;letter-spacing:.12em;font-weight:800}h1{font-size:44px;line-height:1.05;margin:10px 0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.metric{background:#101e31;padding:18px;border-radius:12px}.metric span{display:block;color:#91a2ba;font-size:12px;text-transform:uppercase}.metric strong{font-size:25px}li{background:#101e31;margin:10px 0;padding:14px;border-radius:10px;list-style:none}li span{display:block;color:#aebbd0}footer{color:#91a2ba;margin-top:30px}@media(max-width:700px){.grid{grid-template-columns:repeat(2,1fr)}h1{font-size:34px}}</style></head><body><main><header><div class="tag">Reproducible synthetic experiment</div><h1>Market incident report</h1><p>Scenario: ${escapeHtml(config.scenario)} · Seed: ${config.seed} · Final tick: ${snapshot.tick}</p></header><section class="grid">${metric("Market quality", snapshot.metrics.marketQualityScore.toFixed(1))}${metric("Spread", `${snapshot.metrics.spreadBps.toFixed(1)} bps`)}${metric("Volatility", `${snapshot.metrics.volatilityBps.toFixed(1)} bps`)}${metric("Volume", snapshot.metrics.totalVolume.toLocaleString())}</section><h2>Incident timeline</h2><ul>${alerts || "<li>No critical alerts were generated.</li>"}</ul><footer>${escapeHtml(DISCLAIMER)}</footer></main></body></html>`;
};
