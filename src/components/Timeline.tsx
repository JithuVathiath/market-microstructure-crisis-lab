import type { MarketSnapshot } from "../engine/types";

interface TimelineProps {
  history: MarketSnapshot[];
  selectedTick: number | null;
  onSelect: (tick: number | null) => void;
}

export const Timeline = ({
  history,
  selectedTick,
  onSelect,
}: TimelineProps) => {
  const latestTick = history.at(-1)?.tick ?? 0;
  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-title">
      <div className="panel__header timeline-header">
        <div>
          <span className="eyebrow">Deterministic Replay</span>
          <h2 id="timeline-title">Time-Travel Debugger</h2>
        </div>
        {selectedTick !== null && (
          <button className="text-button" onClick={() => onSelect(null)}>
            Return to live
          </button>
        )}
      </div>
      <label className="timeline-slider">
        <span>
          Inspect tick <strong>{selectedTick ?? latestTick}</strong>
        </span>
        <input
          aria-label="Replay tick"
          type="range"
          min={0}
          max={Math.max(latestTick, 1)}
          value={selectedTick ?? latestTick}
          onChange={(event) => onSelect(Number(event.target.value))}
          disabled={history.length < 2}
        />
      </label>
      <div className="timeline-events">
        {(
          history.find((item) => item.tick === (selectedTick ?? latestTick))
            ?.alerts ?? []
        )
          .slice(0, 4)
          .map((alert) => (
            <article
              key={alert.id}
              className={`event event--${alert.severity}`}
            >
              <span>T{alert.tick}</span>
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
              </div>
            </article>
          ))}
        {history.length < 2 && (
          <p className="empty-state">
            Run the market to build an inspectable event history.
          </p>
        )}
      </div>
    </section>
  );
};
