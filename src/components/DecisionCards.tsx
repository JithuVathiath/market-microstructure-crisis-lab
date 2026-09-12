import { useState } from "react";

import type { DecisionEvent } from "../engine/types";

interface DecisionCardsProps {
  decisions: DecisionEvent[];
  selectedSequence: number | null;
  onSelect: (sequence: number) => void;
}

export const DecisionCards = ({
  decisions,
  selectedSequence,
  onSelect,
}: DecisionCardsProps) => {
  const [expanded, setExpanded] = useState<number | null>(null);
  const visible = decisions
    .filter(
      (decision) =>
        selectedSequence === null ||
        decision.sequenceNumber <= selectedSequence,
    )
    .slice(-6)
    .reverse();

  return (
    <section className="panel decision-panel" aria-labelledby="decision-title">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Inspect Agent Logic</span>
          <h2 id="decision-title">Agent Decision Records</h2>
        </div>
        <span className="count-chip">Engine-derived</span>
      </div>
      <div className="decision-grid">
        {visible.map((decision) => {
          const isOpen = expanded === decision.sequenceNumber;
          return (
            <article
              key={decision.sequenceNumber}
              className={`decision-card ${isOpen ? "decision-card--open" : ""}`}
            >
              <button
                aria-expanded={isOpen}
                aria-controls={`decision-${decision.sequenceNumber}`}
                onClick={() => {
                  setExpanded(isOpen ? null : decision.sequenceNumber);
                  onSelect(decision.sequenceNumber);
                }}
              >
                <span>
                  T{decision.tick} · #{decision.sequenceNumber} ·{" "}
                  {decision.agentKind}
                </span>
                <strong>{decision.agentId}</strong>
                <b>{decision.action}</b>
                <small>{decision.reason}</small>
              </button>
              {isOpen && (
                <div
                  id={`decision-${decision.sequenceNumber}`}
                  className="decision-detail"
                >
                  <dl>
                    <div>
                      <dt>Observed price</dt>
                      <dd>${decision.observedPrice.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Value estimate</dt>
                      <dd>${decision.fundamentalEstimate.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Inventory</dt>
                      <dd>
                        {decision.inventory} / {decision.inventoryLimit}
                      </dd>
                    </div>
                    <div>
                      <dt>Risk utilisation</dt>
                      <dd>{(decision.riskUtilization * 100).toFixed(1)}%</dd>
                    </div>
                  </dl>
                  <p>
                    <b>Objective</b>
                    {decision.objective}
                  </p>
                  <p>
                    <b>Synthetic latency</b>
                    {decision.latency.label}: data{" "}
                    {decision.latency.marketDataTicks}t · decision{" "}
                    {decision.latency.decisionTicks}t · transmission{" "}
                    {decision.latency.transmissionTicks}t · exchange{" "}
                    {decision.latency.exchangeProcessingTicks}t
                  </p>
                  <div className="variable-strip">
                    {Object.entries(decision.variables).map(([key, value]) => (
                      <span key={key}>
                        <small>{key}</small>
                        {String(value)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {visible.length === 0 && (
          <p className="empty-state">
            Agent actions will appear as the market advances.
          </p>
        )}
      </div>
    </section>
  );
};
