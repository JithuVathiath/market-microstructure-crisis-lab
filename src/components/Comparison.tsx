import type { CounterfactualResult } from "../engine/types";

interface ComparisonProps {
  result: CounterfactualResult;
}

const signed = (value: number, suffix = "%"): string =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;

const delta = (baseline: number, intervention: number): string => {
  const change = intervention - baseline;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}`;
};

export const Comparison = ({ result }: ComparisonProps) => (
  <section
    className="panel comparison-panel"
    aria-labelledby="comparison-title"
  >
    <div className="panel__header">
      <div>
        <span className="eyebrow">Causal Comparison</span>
        <h2 id="comparison-title">Same Shock, Different Rules</h2>
      </div>
      <span className="seed-chip">Seed {result.baseline.seed}</span>
    </div>
    <div className="comparison-grid">
      <article>
        <span>Unregulated</span>
        <strong>
          {result.baseline.stressMetrics.resilienceScore.toFixed(1)}
        </strong>
        <small>Resilience Score</small>
      </article>
      <div className="comparison-arrow">→</div>
      <article className="comparison-grid__intervention">
        <span>Policy Intervention</span>
        <strong>
          {result.intervention.stressMetrics.resilienceScore.toFixed(1)}
        </strong>
        <small>Resilience Score</small>
      </article>
    </div>
    <div className="comparison-deltas">
      <span>
        <small>Spread Improvement</small>
        <strong>{signed(result.improvements.spreadPct)}</strong>
      </span>
      <span>
        <small>Volatility Improvement</small>
        <strong>{signed(result.improvements.volatilityPct)}</strong>
      </span>
      <span>
        <small>Price-Discovery Error Improvement</small>
        <strong>{signed(result.improvements.priceErrorPct)}</strong>
      </span>
      <span>
        <small>Quality Uplift</small>
        <strong>
          {signed(result.improvements.marketQualityPoints, " pts")}
        </strong>
      </span>
    </div>
    <div className="comparison-table table-scroll">
      <table>
        <thead>
          <tr>
            <th>Outcome</th>
            <th>Baseline</th>
            <th>Policy Intervention</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Maximum drawdown</td>
            <td>
              {result.baseline.stressMetrics.maximumDrawdownPct.toFixed(2)}%
            </td>
            <td>
              {result.intervention.stressMetrics.maximumDrawdownPct.toFixed(2)}%
            </td>
            <td>
              {delta(
                result.baseline.stressMetrics.maximumDrawdownPct,
                result.intervention.stressMetrics.maximumDrawdownPct,
              )}{" "}
              pts
            </td>
          </tr>
          <tr>
            <td>Retail slippage</td>
            <td>
              {result.baseline.finalMetrics.retailSlippageBps.toFixed(1)} bps
            </td>
            <td>
              {result.intervention.finalMetrics.retailSlippageBps.toFixed(1)}{" "}
              bps
            </td>
            <td>
              {delta(
                result.baseline.finalMetrics.retailSlippageBps,
                result.intervention.finalMetrics.retailSlippageBps,
              )}{" "}
              bps
            </td>
          </tr>
          <tr>
            <td>Institutional shortfall</td>
            <td>
              {result.baseline.finalMetrics.institutionalShortfallBps.toFixed(
                1,
              )}{" "}
              bps
            </td>
            <td>
              {result.intervention.finalMetrics.institutionalShortfallBps.toFixed(
                1,
              )}{" "}
              bps
            </td>
            <td>
              {delta(
                result.baseline.finalMetrics.institutionalShortfallBps,
                result.intervention.finalMetrics.institutionalShortfallBps,
              )}{" "}
              bps
            </td>
          </tr>
          <tr>
            <td>Market impact</td>
            <td>
              {result.baseline.finalMetrics.marketImpactBps.toFixed(1)} bps
            </td>
            <td>
              {result.intervention.finalMetrics.marketImpactBps.toFixed(1)} bps
            </td>
            <td>
              {delta(
                result.baseline.finalMetrics.marketImpactBps,
                result.intervention.finalMetrics.marketImpactBps,
              )}{" "}
              bps
            </td>
          </tr>
          <tr>
            <td>Visible depth</td>
            <td>{result.baseline.finalMetrics.depth}</td>
            <td>{result.intervention.finalMetrics.depth}</td>
            <td>
              {delta(
                result.baseline.finalMetrics.depth,
                result.intervention.finalMetrics.depth,
              )}{" "}
              units
            </td>
          </tr>
          <tr>
            <td>Fill rate</td>
            <td>{(result.baseline.finalMetrics.fillRate * 100).toFixed(1)}%</td>
            <td>
              {(result.intervention.finalMetrics.fillRate * 100).toFixed(1)}%
            </td>
            <td>
              {delta(
                result.baseline.finalMetrics.fillRate * 100,
                result.intervention.finalMetrics.fillRate * 100,
              )}{" "}
              pts
            </td>
          </tr>
          <tr>
            <td>Cancellation-to-trade ratio</td>
            <td>
              {result.baseline.finalMetrics.cancelToTradeRatio.toFixed(1)}×
            </td>
            <td>
              {result.intervention.finalMetrics.cancelToTradeRatio.toFixed(1)}×
            </td>
            <td>
              {delta(
                result.baseline.finalMetrics.cancelToTradeRatio,
                result.intervention.finalMetrics.cancelToTradeRatio,
              )}
              ×
            </td>
          </tr>
          <tr>
            <td>Recovery time</td>
            <td>
              {result.baseline.finalMetrics.recoveryTicks ?? "Not observed"}
            </td>
            <td>
              {result.intervention.finalMetrics.recoveryTicks ?? "Not observed"}
            </td>
            <td>ticks</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p className="comparison-note">
      Paired deterministic runs hold the scenario and random seed constant,
      isolating the effect of the configured market rules. Improvements in one
      outcome can coincide with costs elsewhere; these synthetic results are not
      evidence of real-world causal effects.
    </p>
  </section>
);
