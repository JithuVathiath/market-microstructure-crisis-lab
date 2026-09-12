import { useRef, useState } from "react";

import { AgentTable } from "./components/AgentTable";
import { BatchExperiments } from "./components/BatchExperiments";
import { CausalTrace } from "./components/CausalTrace";
import { Comparison } from "./components/Comparison";
import { DecisionCards } from "./components/DecisionCards";
import { Forensics } from "./components/Forensics";
import { MetricCard } from "./components/MetricCard";
import { OrderBook } from "./components/OrderBook";
import { OrderTicket } from "./components/OrderTicket";
import { ParticipantImpact } from "./components/ParticipantImpact";
import { PolicyLab } from "./components/PolicyLab";
import { PriceChart } from "./components/PriceChart";
import { ResearchMetrics } from "./components/ResearchMetrics";
import { Timeline } from "./components/Timeline";
import {
  createIncidentReport,
  createReplay,
  DISCLAIMER,
  parseReplay,
} from "./engine/replay";
import { scenarioById, scenarios } from "./engine/scenarios";
import { useMarketLab } from "./hooks/useMarketLab";

const download = (filename: string, content: string, type: string): void => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const App = () => {
  const lab = useMarketLab();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [mode, setMode] = useState<"demo" | "research">("demo");
  const [replayError, setReplayError] = useState<string | null>(null);
  const replayInput = useRef<HTMLInputElement>(null);
  const view = lab.displayedSnapshot;
  const live = lab.snapshot;
  const scenario = scenarioById(lab.config.scenario);

  if (!view || !live) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">ML</div>
        <p>Building the synthetic market…</p>
      </main>
    );
  }

  const exportReplay = () =>
    download(
      `market-replay-${lab.config.scenario}-seed-${lab.config.seed}.json`,
      JSON.stringify(
        createReplay(lab.config, live, lab.events, lab.decisions),
        null,
        2,
      ),
      "application/json",
    );
  const exportReport = () =>
    download(
      `incident-report-${lab.config.scenario}.html`,
      createIncidentReport(lab.config, live, lab.events, lab.comparison),
      "text/html",
    );

  const importReplay = async (file: File) => {
    try {
      lab.loadReplay(parseReplay(await file.text()));
      setReplayError(null);
    } catch (error) {
      setReplayError(
        error instanceof Error ? error.message : "Invalid replay file",
      );
    }
  };

  return (
    <div className={`app-shell app-shell--${mode}`}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Market Lab home">
          <span className="brand__mark">ML</span>
          <span>
            <strong>Market Microstructure Lab</strong>
            <small>Microstructure · Simulation · Governance</small>
          </span>
        </a>
        <nav className="primary-nav" aria-label="Primary navigation">
          <a href="#market">
            <span>01</span> Market
          </a>
          <a href="#crisis">
            <span>02</span> Crisis
          </a>
          <a href="#forensics">
            <span>03</span> Forensics
          </a>
          <a href="#policy">
            <span>04</span> Policy
          </a>
          <a href="#research">
            <span>05</span> Research
          </a>
        </nav>
        <div className="topbar__actions">
          <span className="synthetic-badge">
            <i /> Synthetic data
          </span>
          <button className="text-button" onClick={() => setAboutOpen(true)}>
            Methodology
          </button>
          <a
            className="github-link"
            href="https://github.com/JithuVathiath/market-microstructure-crisis-lab"
            target="_blank"
            rel="noreferrer"
            aria-label="View source on GitHub"
          >
            Source ↗
          </a>
        </div>
      </header>

      <main id="top" className="workspace">
        <section className="hero">
          <div className="hero__copy">
            <span className="kicker">
              <i /> Interactive research instrument
            </span>
            <small className="hero__overline">
              Market Microstructure Crisis &amp; Governance Lab
            </small>
            <h1>
              Build the market. <span>Break the market.</span> Rewind the
              market. Change the rules. Run it again.
            </h1>
            <p>
              A deterministic Rust/WebAssembly market simulator for
              investigating liquidity crises, algorithmic interactions and
              market regulation through event-level replay and counterfactual
              experiments.
            </p>
            <div className="hero__actions">
              <button
                className="button button--primary"
                onClick={() => lab.launchScenario("flash-crash")}
              >
                Launch Flash Crash
              </button>
              <a className="button button--ghost" href="#market">
                Open Exchange Lab
              </a>
            </div>
            <div
              className="technology-strip"
              aria-label="Technical capabilities"
            >
              <span>Rust</span>
              <span>WebAssembly</span>
              <span>React</span>
              <span>Deterministic simulation</span>
              <span>Event-sourced replay</span>
            </div>
          </div>
          <div className="hero__scenario-card">
            <span>Active scenario</span>
            <strong>{scenario.name}</strong>
            <p>{scenario.description}</p>
            <small>Research question: {scenario.learningGoal}</small>
            <small>Model limit: {scenario.limitations}</small>
          </div>
        </section>

        <div className="mode-switch" aria-label="Interface mode">
          <div>
            <span className="eyebrow">Workspace</span>
            <strong>{mode === "demo" ? "Demo mode" : "Research mode"}</strong>
            <small>
              {mode === "demo"
                ? "A guided two-minute view"
                : "Full parameters, raw events and exports"}
            </small>
          </div>
          <div className="segmented mode-switch__buttons">
            <button
              className={mode === "demo" ? "active" : ""}
              onClick={() => setMode("demo")}
            >
              Demo
            </button>
            <button
              className={mode === "research" ? "active" : ""}
              onClick={() => setMode("research")}
            >
              Research
            </button>
          </div>
        </div>

        <section
          id="market"
          className="command-bar"
          aria-label="Simulation controls"
        >
          <label className="scenario-select">
            <span>Scenario</span>
            <select
              aria-label="Scenario"
              value={lab.config.scenario}
              onChange={(event) =>
                lab.selectScenario(
                  event.target.value as typeof lab.config.scenario,
                )
              }
            >
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="seed-field">
            <span>Seed</span>
            <input
              aria-label="Random seed"
              type="number"
              min="1"
              value={lab.config.seed}
              onChange={(event) => lab.setSeed(Number(event.target.value))}
            />
          </label>
          <div className="command-bar__playback">
            <button
              className="button button--primary"
              onClick={lab.toggle}
              disabled={live.status === "complete"}
            >
              {lab.playing
                ? "Pause market"
                : live.tick === 0
                  ? "Run experiment"
                  : "Resume market"}
            </button>
            <button
              className="icon-button"
              onClick={lab.stop}
              disabled={!lab.playing}
              aria-label="Stop experiment"
            >
              Stop
            </button>
            <button
              className="icon-button research-only"
              onClick={lab.step}
              disabled={lab.playing || live.status === "complete"}
              aria-label="Advance one tick"
            >
              Step
            </button>
            <button className="icon-button" onClick={lab.reset}>
              Reset
            </button>
          </div>
          <label className="speed-select">
            <span>Speed</span>
            <select
              aria-label="Playback speed"
              value={lab.speed}
              onChange={(event) =>
                lab.setSpeed(Number(event.target.value) as typeof lab.speed)
              }
            >
              {lab.speedOptions.map((option) => (
                <option key={option} value={option}>
                  {option}×
                </option>
              ))}
            </select>
          </label>
          <div className={`market-state market-state--${live.status}`}>
            <i />
            <span>
              <small>
                Tick {live.tick} / {lab.config.maxTicks}
              </small>
              <strong>{live.eventLabel}</strong>
            </span>
          </div>
        </section>

        {(lab.selectedTick !== null || lab.selectedSequence !== null) && (
          <div className="time-travel-banner">
            {lab.selectedSequence !== null
              ? `Reconstructed exchange state at event #${lab.selectedSequence}, tick ${view.tick}.`
              : `Viewing historical tick ${lab.selectedTick}.`}{" "}
            <button onClick={() => lab.selectSequence(null)}>
              Return to live
            </button>
          </div>
        )}

        <section className="metric-grid" aria-label="Market quality metrics">
          <MetricCard
            label="Market price"
            value={`$${view.metrics.midPrice.toFixed(2)}`}
            detail={`Fundamental $${view.fundamentalPrice.toFixed(2)}`}
            definition="Midpoint of the best displayed bid and ask; falls back to the latest trade when one side is empty."
            tone="green"
          />
          <MetricCard
            label="Quoted spread"
            value={`${view.metrics.spreadBps.toFixed(1)} bps`}
            detail="Lower supports execution quality"
            definition="Best ask minus best bid, divided by mid-price, in basis points."
            tone="cyan"
          />
          <MetricCard
            label="Volatility"
            value={`${view.metrics.volatilityBps.toFixed(1)} bps`}
            detail="Rolling realized volatility"
            definition="Root mean square of the most recent 30 logical-tick log returns."
            tone="pink"
          />
          <MetricCard
            label="Visible depth"
            value={view.metrics.depth.toLocaleString()}
            detail="Units across displayed levels"
            definition="Aggregate quantity at the best five visible price levels on each side."
            tone="cyan"
          />
          <MetricCard
            label="Quality score"
            value={view.metrics.marketQualityScore.toFixed(1)}
            detail="Composite, 0–100"
            definition="Transparent teaching index penalising spread, volatility and price-discovery error."
            tone="amber"
          />
        </section>

        <div className="dashboard-grid">
          <PriceChart snapshot={view} />
          <OrderBook book={view.book} />
          <PolicyLab
            policies={lab.config.policies}
            onChange={lab.updatePolicies}
            onCompare={lab.compare}
            comparing={lab.comparing}
          />
          <OrderTicket
            referencePrice={view.lastPrice}
            onSubmit={lab.submitOrder}
          />
        </div>

        {lab.comparison && <Comparison result={lab.comparison} />}
        <CausalTrace steps={view.causalChain} onSelect={lab.selectSequence} />
        <Forensics
          events={lab.events}
          selectedSequence={lab.selectedSequence}
          onSelect={lab.selectSequence}
        />
        <DecisionCards
          decisions={lab.decisions}
          selectedSequence={lab.selectedSequence}
          onSelect={lab.selectSequence}
        />
        <ParticipantImpact agents={view.agents} />
        <div className="research-only">
          <ResearchMetrics metrics={view.metrics} />
          <AgentTable agents={view.agents} />
          <Timeline
            history={lab.history}
            selectedTick={lab.selectedTick}
            onSelect={lab.setSelectedTick}
          />
          <BatchExperiments
            result={lab.batchResult}
            running={lab.batchRunning}
            onRun={lab.runBatch}
          />
        </div>

        <section className="panel export-panel">
          <div>
            <span className="eyebrow">Reproducible evidence</span>
            <h2>Export the experiment</h2>
            <p>
              Save the exact seed, market rules, final state, and incident event
              stream for audit, deterministic reconstruction, or peer review.
            </p>
            <small className="integrity-hash">
              Event hash · {live.eventStreamHash}
            </small>
          </div>
          <div>
            <button className="button button--ghost" onClick={exportReplay}>
              Download replay JSON
            </button>
            <button className="button button--ghost" onClick={exportReport}>
              Download incident report
            </button>
            <button
              className="button button--ghost"
              onClick={() => replayInput.current?.click()}
            >
              Import replay JSON
            </button>
            <input
              ref={replayInput}
              className="visually-hidden"
              aria-label="Import replay JSON"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importReplay(file);
              }}
            />
          </div>
        </section>
        {replayError && (
          <p className="replay-error" role="alert">
            {replayError}
          </p>
        )}

        <footer>
          <p>{DISCLAIMER}</p>
          <span>
            Rust/WASM engine · Price-time priority · Reproducible experiments
          </span>
        </footer>
      </main>

      {aboutOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setAboutOpen(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="methodology-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal__close"
              aria-label="Close methodology"
              onClick={() => setAboutOpen(false)}
            >
              ×
            </button>
            <span className="eyebrow">Transparent by design</span>
            <h2 id="methodology-title">What this model does</h2>
            <p>
              A discrete-time exchange matches limit and market orders using
              price-time priority. Six participant archetypes respond to price,
              value, momentum, inventory, and latency with seeded randomness.
            </p>
            <h3>What you can test</h3>
            <ul>
              <li>Whether a circuit breaker limits disorderly repricing.</li>
              <li>How speed bumps change latency advantages.</li>
              <li>
                Whether resting-time and cancellation limits preserve displayed
                liquidity.
              </li>
              <li>How identical shocks behave under different rules.</li>
            </ul>
            <h3>What it is not</h3>
            <p>
              It is not a forecast, broker, execution venue, or calibrated
              representation of a specific security. Results are synthetic and
              intended for education and governance research.
            </p>
          </section>
        </div>
      )}
    </div>
  );
};
