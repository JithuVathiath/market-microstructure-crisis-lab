import type { CounterfactualResult } from "../engine/types";

interface ComparisonProps {
  result: CounterfactualResult;
}

const signed = (value: number, suffix = "%"): string =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;

export const Comparison = ({ result }: ComparisonProps) => (
  <section
    className="panel comparison-panel"
    aria-labelledby="comparison-title"
  >
    <div className="panel__header">
      <div>
        <span className="eyebrow">Causal comparison</span>
        <h2 id="comparison-title">Same shock, different rules</h2>
      </div>
      <span className="seed-chip">Seed {result.baseline.seed}</span>
    </div>
    <div className="comparison-grid">
      <article>
        <span>Unregulated</span>
        <strong>
          {result.baseline.stressMetrics.resilienceScore.toFixed(1)}
        </strong>
        <small>resilience score</small>
      </article>
      <div className="comparison-arrow">→</div>
      <article className="comparison-grid__intervention">
        <span>Policy lab</span>
        <strong>
          {result.intervention.stressMetrics.resilienceScore.toFixed(1)}
        </strong>
        <small>resilience score</small>
      </article>
    </div>
    <div className="comparison-deltas">
      <span>
        <small>Spread improvement</small>
        <strong>{signed(result.improvements.spreadPct)}</strong>
      </span>
      <span>
        <small>Volatility improvement</small>
        <strong>{signed(result.improvements.volatilityPct)}</strong>
      </span>
      <span>
        <small>Pricing-error improvement</small>
        <strong>{signed(result.improvements.priceErrorPct)}</strong>
      </span>
      <span>
        <small>Quality uplift</small>
        <strong>
          {signed(result.improvements.marketQualityPoints, " pts")}
        </strong>
      </span>
    </div>
    <p className="comparison-note">
      Paired deterministic runs hold the scenario and random seed constant,
      isolating the effect of your market rules.
    </p>
  </section>
);
