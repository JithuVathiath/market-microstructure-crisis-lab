interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  definition?: string;
  tone?: "cyan" | "green" | "amber" | "pink";
}

export const MetricCard = ({
  label,
  value,
  detail,
  definition,
  tone = "cyan",
}: MetricCardProps) => (
  <article
    className={`metric-card metric-card--${tone}`}
    title={definition}
    aria-label={definition ? `${label}: ${value}. ${definition}` : undefined}
  >
    <span className="metric-card__label">{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
    {definition && (
      <i className="metric-card__info" aria-hidden="true">
        i
      </i>
    )}
  </article>
);
