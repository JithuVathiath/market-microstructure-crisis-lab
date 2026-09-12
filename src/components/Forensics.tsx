import { useMemo, useState } from "react";

import type { MarketEvent } from "../engine/types";

interface ForensicsProps {
  events: MarketEvent[];
  selectedSequence: number | null;
  onSelect: (sequence: number | null) => void;
}

const describe = (event: MarketEvent): string => {
  const subject = event.agentId ? `${event.agentId} · ` : "";
  const quantity = event.quantity === null ? "" : `${event.quantity} units `;
  const price = event.price === null ? "" : `at $${event.price.toFixed(2)} `;
  return `${subject}${quantity}${price}${event.reasonCode.replaceAll("_", " ")}`.trim();
};

export const Forensics = ({
  events,
  selectedSequence,
  onSelect,
}: ForensicsProps) => {
  const [jumpType, setJumpType] = useState("Trade");
  const currentSequence =
    selectedSequence ?? events.at(-1)?.sequenceNumber ?? 0;
  const index = Math.max(
    0,
    events.findIndex((event) => event.sequenceNumber === currentSequence),
  );
  const current = events[index];
  const before = events[index - 1];
  const after = events[index + 1];
  const window = useMemo(
    () => events.slice(Math.max(0, index - 3), index + 4),
    [events, index],
  );

  const jump = () => {
    const target = [...events]
      .reverse()
      .find((event) => event.eventType === jumpType);
    if (target) onSelect(target.sequenceNumber);
  };

  return (
    <section
      id="forensics"
      className="panel forensics-panel"
      aria-labelledby="forensics-title"
    >
      <div className="panel__header">
        <div>
          <span className="eyebrow">Deterministic event-sourced replay</span>
          <h2 id="forensics-title">Market Time Travel</h2>
        </div>
        <span className="seed-chip">
          {events.length.toLocaleString()} events
        </span>
      </div>

      <div className="forensics-controls" aria-label="Event replay controls">
        <button
          className="icon-button"
          disabled={!before}
          onClick={() => before && onSelect(before.sequenceNumber)}
        >
          ← Previous event
        </button>
        <button
          className="icon-button"
          disabled={!after}
          onClick={() => after && onSelect(after.sequenceNumber)}
        >
          Next event →
        </button>
        <label>
          <span>Sequence</span>
          <input
            aria-label="Event sequence number"
            type="number"
            min={1}
            max={Math.max(events.length, 1)}
            value={currentSequence || ""}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (
                Number.isInteger(value) &&
                value >= 1 &&
                value <= events.length
              )
                onSelect(value);
            }}
          />
        </label>
        <label>
          <span>Jump to latest</span>
          <select
            aria-label="Event jump type"
            value={jumpType}
            onChange={(event) => setJumpType(event.target.value)}
          >
            <option>Trade</option>
            <option>ShockTriggered</option>
            <option>RegulatoryTrigger</option>
            <option>SurveillanceAlert</option>
            <option>TradingHalt</option>
          </select>
        </label>
        <button className="button button--ghost" onClick={jump}>
          Jump
        </button>
        {selectedSequence !== null && (
          <button className="text-button" onClick={() => onSelect(null)}>
            Return to live
          </button>
        )}
      </div>

      {current ? (
        <div className="event-inspector">
          <article className="event-context">
            <span>Immediately before</span>
            <strong>
              {before
                ? `#${before.sequenceNumber} ${before.eventType}`
                : "Opening state"}
            </strong>
            <p>{before ? describe(before) : "No preceding event."}</p>
          </article>
          <article className="event-focus">
            <span>Selected · T{current.simulationTimestamp}</span>
            <strong>
              #{current.sequenceNumber} {current.eventType}
            </strong>
            <p>{describe(current)}</p>
          </article>
          <article className="event-context">
            <span>Immediately after</span>
            <strong>
              {after
                ? `#${after.sequenceNumber} ${after.eventType}`
                : "Live edge"}
            </strong>
            <p>{after ? describe(after) : "No subsequent event yet."}</p>
          </article>
        </div>
      ) : (
        <p className="empty-state">Run the market to create an event stream.</p>
      )}

      <div className="event-tape" role="list" aria-label="Event stream">
        {window.map((event) => (
          <button
            key={event.sequenceNumber}
            className={event.sequenceNumber === currentSequence ? "active" : ""}
            onClick={() => onSelect(event.sequenceNumber)}
            role="listitem"
          >
            <span>
              #{event.sequenceNumber} · T{event.simulationTimestamp}
            </span>
            <strong>{event.eventType}</strong>
          </button>
        ))}
      </div>
      <p className="panel-note">
        The visible queue is reconstructed from canonical exchange events; the
        matcher is not called during replay.
      </p>
    </section>
  );
};
