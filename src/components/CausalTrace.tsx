import type { CausalStep } from "../engine/types";

interface CausalTraceProps {
  steps: CausalStep[];
  onSelect: (sequence: number) => void;
}

export const CausalTrace = ({ steps, onSelect }: CausalTraceProps) => (
  <section
    id="crisis"
    className="panel causal-panel"
    aria-labelledby="causal-title"
  >
    <div className="panel__header">
      <div>
        <span className="eyebrow">Why did this happen?</span>
        <h2 id="causal-title">Traceable crisis sequence</h2>
      </div>
      <span className="count-chip">Observed events only</span>
    </div>
    {steps.length > 0 ? (
      <ol className="causal-chain">
        {steps.map((step) => (
          <li key={step.sequenceNumber}>
            <button onClick={() => onSelect(step.sequenceNumber)}>
              <span>
                T{step.tick} · #{step.sequenceNumber}
              </span>
              <strong>{step.label}</strong>
              <small>{step.evidence}</small>
            </button>
          </li>
        ))}
      </ol>
    ) : (
      <p className="empty-state">
        Advance to the scenario shock to reveal its event-backed causal chain.
      </p>
    )}
  </section>
);
