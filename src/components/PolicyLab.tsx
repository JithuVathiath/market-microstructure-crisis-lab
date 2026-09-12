import type { PolicyConfig } from "../engine/types";

interface PolicyLabProps {
  policies: PolicyConfig;
  onChange: (policies: PolicyConfig) => void;
  onCompare: () => void;
  comparing: boolean;
}

const Range = ({
  label,
  value,
  minimum,
  maximum,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) => (
  <label className="range-control">
    <span>
      <span>{label}</span>
      <strong>
        {value}
        {suffix}
      </strong>
    </span>
    <input
      aria-label={label}
      type="range"
      min={minimum}
      max={maximum}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
);

export const PolicyLab = ({
  policies,
  onChange,
  onCompare,
  comparing,
}: PolicyLabProps) => {
  const update = <Key extends keyof PolicyConfig>(
    key: Key,
    value: PolicyConfig[Key],
  ) => onChange({ ...policies, [key]: value });

  return (
    <section
      id="policy"
      className="panel policy-panel"
      aria-labelledby="policy-lab-title"
    >
      <div className="panel__header">
        <div>
          <span className="eyebrow">Intervention Design</span>
          <h2 id="policy-lab-title">Governance Controls</h2>
        </div>
        <span className="policy-status">Live</span>
      </div>
      <label className="switch-row">
        <span>
          <strong>Circuit breaker</strong>
          <small>Pause after a reference-price breach</small>
        </span>
        <input
          aria-label="Circuit breaker"
          type="checkbox"
          checked={policies.circuitBreaker}
          onChange={(event) => update("circuitBreaker", event.target.checked)}
        />
      </label>
      <Range
        label="Trigger threshold"
        value={policies.circuitBreakerThresholdPct}
        minimum={1}
        maximum={10}
        step={0.5}
        suffix="%"
        onChange={(value) => update("circuitBreakerThresholdPct", value)}
      />
      <Range
        label="Speed bump"
        value={policies.speedBumpTicks}
        minimum={0}
        maximum={6}
        step={1}
        suffix=" ticks"
        onChange={(value) => update("speedBumpTicks", value)}
      />
      <Range
        label="Minimum resting time"
        value={policies.minimumRestingTicks}
        minimum={0}
        maximum={8}
        step={1}
        suffix=" ticks"
        onChange={(value) => update("minimumRestingTicks", value)}
      />
      <Range
        label="Cancellation-to-trade cap"
        value={policies.maxCancelToTradeRatio}
        minimum={2}
        maximum={50}
        step={1}
        suffix="×"
        onChange={(value) => update("maxCancelToTradeRatio", value)}
      />
      <details className="advanced-policies">
        <summary>Exchange Economics</summary>
        <Range
          label="Tick size"
          value={policies.tickSize}
          minimum={0.01}
          maximum={0.1}
          step={0.01}
          suffix=""
          onChange={(value) => update("tickSize", value)}
        />
        <Range
          label="Maker fee / rebate"
          value={policies.makerFeeBps}
          minimum={-1}
          maximum={2}
          step={0.1}
          suffix=" bps"
          onChange={(value) => update("makerFeeBps", value)}
        />
        <Range
          label="Taker fee"
          value={policies.takerFeeBps}
          minimum={0}
          maximum={3}
          step={0.1}
          suffix=" bps"
          onChange={(value) => update("takerFeeBps", value)}
        />
      </details>
      <button
        className="button button--accent button--full"
        onClick={onCompare}
        disabled={comparing}
      >
        {comparing
          ? "Running paired experiments…"
          : "Compare with the unregulated market"}
      </button>
    </section>
  );
};
