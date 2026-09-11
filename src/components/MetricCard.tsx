interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  tone?: "cyan" | "green" | "amber" | "pink";
}

export const MetricCard = ({
  label,
  value,
  detail,
  tone = "cyan",
}: MetricCardProps) => (
  <article className={`metric-card metric-card--${tone}`}>
    <span className="metric-card__label">{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </article>
);
