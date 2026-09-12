import { hashEventStream } from "./eventStore";
import type {
  CounterfactualResult,
  DecisionEvent,
  MarketEvent,
  MarketSnapshot,
  ReplayFile,
  SimulationConfig,
} from "./types";

export const DISCLAIMER =
  "This is a synthetic educational simulation. It does not use market data and is not investment advice or a trading system.";

export const createReplay = (
  config: SimulationConfig,
  finalSnapshot: MarketSnapshot,
  eventStream: MarketEvent[] = [],
  decisionLog: DecisionEvent[] = [],
  generatedAt = new Date().toISOString(),
): ReplayFile => ({
  schemaVersion: 2,
  generatedAt,
  applicationVersion: "2.0.0",
  application: "Market Microstructure Crisis Lab",
  engine: "rust-wasm",
  config,
  eventStream,
  decisionLog,
  eventStreamHash: hashEventStream(eventStream),
  finalSnapshot,
  disclaimer: DISCLAIMER,
});

export const parseReplay = (value: string): ReplayFile => {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("schemaVersion" in parsed) ||
    parsed.schemaVersion !== 2 ||
    !("application" in parsed) ||
    parsed.application !== "Market Microstructure Crisis Lab" ||
    !("config" in parsed) ||
    !("finalSnapshot" in parsed) ||
    !("eventStream" in parsed) ||
    !Array.isArray(parsed.eventStream) ||
    !("decisionLog" in parsed) ||
    !Array.isArray(parsed.decisionLog) ||
    !("eventStreamHash" in parsed)
  ) {
    throw new Error("Unsupported or invalid replay file");
  }
  const replay = parsed as ReplayFile;
  if (hashEventStream(replay.eventStream) !== replay.eventStreamHash) {
    throw new Error("Replay integrity check failed");
  }
  return replay;
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
  eventStream: MarketEvent[] = snapshot.recentEvents,
  comparison: CounterfactualResult | null = null,
): string => {
  const metric = (label: string, value: string): string =>
    `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  const alerts = snapshot.alerts
    .map(
      (alert) =>
        `<li><b>T${alert.tick} · ${escapeHtml(alert.title)}</b><span>${escapeHtml(alert.detail)}</span></li>`,
    )
    .join("");
  const prices = snapshot.priceHistory.map((point) => point.price);
  const peak = Math.max(config.initialPrice, ...prices);
  const trough = Math.min(config.initialPrice, ...prices);
  const maximumDrawdown = ((peak - trough) / peak) * 100;
  const maximumSpread = Math.max(
    0,
    ...snapshot.priceHistory.map((point) => point.spreadBps),
  );
  const eventCounts = new Map<string, number>();
  for (const event of eventStream) {
    eventCounts.set(
      event.eventType,
      (eventCounts.get(event.eventType) ?? 0) + 1,
    );
  }
  const eventSummary = [...eventCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(
      ([type, count]) =>
        `<tr><td>${escapeHtml(type)}</td><td>${count}</td></tr>`,
    )
    .join("");
  const causal = snapshot.causalChain
    .map(
      (step) =>
        `<li><b>T${step.tick} · #${step.sequenceNumber} · ${escapeHtml(step.label)}</b><span>${escapeHtml(step.evidence)}</span></li>`,
    )
    .join("");
  const participants = snapshot.agents
    .map(
      (agent) =>
        `<tr><td>${escapeHtml(agent.label)}</td><td>${escapeHtml(agent.latency.label)}</td><td>${agent.pnl.toFixed(2)}</td><td>${(agent.fillRate * 100).toFixed(1)}%</td><td>${agent.inventory}</td></tr>`,
    )
    .join("");
  const policyComparison = comparison
    ? `<h2>Baseline Versus Policy Intervention</h2><table><thead><tr><th>Outcome</th><th>Baseline</th><th>Policy</th></tr></thead><tbody><tr><td>Peak spread</td><td>${comparison.baseline.stressMetrics.peakSpreadBps.toFixed(2)} bps</td><td>${comparison.intervention.stressMetrics.peakSpreadBps.toFixed(2)} bps</td></tr><tr><td>Maximum drawdown</td><td>${comparison.baseline.stressMetrics.maximumDrawdownPct.toFixed(2)}%</td><td>${comparison.intervention.stressMetrics.maximumDrawdownPct.toFixed(2)}%</td></tr><tr><td>Resilience score</td><td>${comparison.baseline.stressMetrics.resilienceScore.toFixed(2)}</td><td>${comparison.intervention.stressMetrics.resilienceScore.toFixed(2)}</td></tr></tbody></table><p>These paired runs hold the seed and scenario constant. Differences are outcomes of the synthetic model, not proof of real-world policy effects.</p>`
    : `<h2>Counterfactual Status</h2><p>No paired policy comparison was attached. Run “Compare with the unregulated market” before exporting to include it.</p>`;
  const chartPoints = snapshot.priceHistory
    .map((point, index, values) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 900;
      const range = Math.max(peak - trough, 0.01);
      const y = 210 - ((point.price - trough) / range) * 190;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Market Incident Report</title><style>body{margin:0;background:#07101d;color:#e7edf7;font:14px/1.6 Inter,system-ui}main{max-width:980px;margin:auto;padding:56px 24px}header{border-bottom:1px solid #25354c;padding-bottom:24px}.tag{color:#50e3c2;text-transform:uppercase;letter-spacing:.12em;font-weight:800}h1{font-size:44px;line-height:1.05;margin:10px 0}h2{margin-top:34px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.metric{background:#101e31;padding:18px}.metric span{display:block;color:#91a2ba;font-size:11px;text-transform:uppercase}.metric strong{font-size:23px}ul{padding:0}li{background:#101e31;margin:8px 0;padding:12px;list-style:none}li span{display:block;color:#aebbd0}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #25354c}th{color:#91a2ba;font-size:10px;text-transform:uppercase}.chart{background:#101e31;border:1px solid #25354c;width:100%;height:auto}.config{columns:2;color:#aebbd0}.warning{border-left:3px solid #ffca65;padding:12px;background:#171b20}footer{color:#91a2ba;margin-top:35px;border-top:1px solid #25354c;padding-top:20px}@media(max-width:700px){.grid{grid-template-columns:repeat(2,1fr)}h1{font-size:34px}.config{columns:1}}</style></head><body><main><header><div class="tag">Reproducible synthetic experiment · #${escapeHtml(snapshot.eventStreamHash.slice(0, 8).toUpperCase())}</div><h1>Market Incident Report</h1><p>Scenario: ${escapeHtml(config.scenario)} · Seed: ${config.seed} · Final tick: ${snapshot.tick} · Engine: Rust/WebAssembly</p></header><section class="grid">${metric("Maximum drawdown", `${maximumDrawdown.toFixed(2)}%`)}${metric("Maximum spread", `${maximumSpread.toFixed(1)} bps`)}${metric("Recovery", snapshot.metrics.recoveryTicks === null ? "Not observed" : `${snapshot.metrics.recoveryTicks} ticks`)}${metric("Event count", eventStream.length.toLocaleString())}${metric("Market quality", snapshot.metrics.marketQualityScore.toFixed(1))}${metric("Price error", `${snapshot.metrics.priceErrorBps.toFixed(1)} bps`)}${metric("Retail slippage", `${snapshot.metrics.retailSlippageBps.toFixed(1)} bps`)}${metric("Volume", snapshot.metrics.totalVolume.toLocaleString())}</section><h2>Market-Price Path</h2><svg class="chart" viewBox="0 0 900 230" role="img" aria-label="Simulated market price path"><polyline points="${chartPoints}" fill="none" stroke="#3be1c2" stroke-width="2"/></svg><h2>Primary Causal Sequence</h2><ul>${causal || "<li>No scenario shock occurred in the exported interval.</li>"}</ul><h2>Incident Timeline</h2><ul>${alerts || "<li>No critical alerts were generated.</li>"}</ul><h2>Exchange Configuration</h2><div class="config"><p>Tick size: $${config.policies.tickSize}<br>Circuit breaker: ${config.policies.circuitBreaker ? "enabled" : "disabled"}<br>Trigger: ${config.policies.circuitBreakerThresholdPct}%<br>Halt: ${config.policies.haltTicks} ticks<br>Speed bump: ${config.policies.speedBumpTicks} ticks<br>Minimum rest: ${config.policies.minimumRestingTicks} ticks<br>Cancellation-to-trade cap: ${config.policies.maxCancelToTradeRatio}×<br>Maker fee: ${config.policies.makerFeeBps} bps<br>Taker fee: ${config.policies.takerFeeBps} bps</p></div>${policyComparison}<h2>Participant-Level Effects</h2><table><thead><tr><th>Participant</th><th>Latency profile</th><th>P&amp;L</th><th>Fill rate</th><th>Inventory</th></tr></thead><tbody>${participants}</tbody></table><h2>Event Summary</h2><table><thead><tr><th>Event type</th><th>Count</th></tr></thead><tbody>${eventSummary}</tbody></table><h2>Reproducibility</h2><p>Schema version 2 · Application version 2.0.0 · Seed ${config.seed} · Canonical event hash ${escapeHtml(snapshot.eventStreamHash)}.</p><p class="warning">Limitations: agent rules, latency, and shocks are synthetic and deliberately simplified. The model is not calibrated to a specific venue and does not establish empirical or causal claims about real markets.</p><footer>${escapeHtml(DISCLAIMER)}</footer></main></body></html>`;
};
