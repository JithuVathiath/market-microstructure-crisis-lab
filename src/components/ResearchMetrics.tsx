import type { MarketMetrics } from "../engine/types";

interface ResearchMetricsProps {
  metrics: MarketMetrics;
}

export const ResearchMetrics = ({ metrics }: ResearchMetricsProps) => {
  const values = [
    {
      label: "Microprice",
      value: `$${metrics.microprice.toFixed(3)}`,
      definition: "Top-of-book size-weighted price.",
    },
    {
      label: "Book imbalance",
      value: `${(metrics.bookImbalance * 100).toFixed(1)}%`,
      definition: "Signed bid-minus-ask quantity at the touch.",
    },
    {
      label: "20-tick impact",
      value: `${metrics.marketImpactBps.toFixed(1)} bps`,
      definition:
        "Absolute latest-trade displacement from the 20-tick reference.",
    },
    {
      label: "Institutional shortfall",
      value: `${metrics.institutionalShortfallBps.toFixed(1)} bps`,
      definition: "Mean institutional execution cost versus synthetic value.",
    },
    {
      label: "Maker inventory risk",
      value: `${(metrics.marketMakerInventoryRisk * 100).toFixed(1)}%`,
      definition:
        "Mean market-maker inventory deviation as a share of capacity.",
    },
    {
      label: "Cancellation intensity",
      value: `${metrics.cancellationIntensity.toFixed(2)} / tick`,
      definition: "Agent cancellations divided by elapsed logical ticks.",
    },
  ];
  return (
    <section
      className="panel research-metrics"
      aria-labelledby="research-metrics-title"
    >
      <div className="panel__header">
        <div>
          <span className="eyebrow">Microstructure Diagnostics</span>
          <h2 id="research-metrics-title">Advanced Market Measures</h2>
        </div>
      </div>
      <div className="research-metric-grid">
        {values.map((item) => (
          <article key={item.label} title={item.definition}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.definition}</small>
          </article>
        ))}
      </div>
    </section>
  );
};
