import { useState } from "react";

import { AgentTable } from "./components/AgentTable";
import { Comparison } from "./components/Comparison";
import { MetricCard } from "./components/MetricCard";
import { OrderBook } from "./components/OrderBook";
import { OrderTicket } from "./components/OrderTicket";
import { PolicyLab } from "./components/PolicyLab";
import { PriceChart } from "./components/PriceChart";
import { Timeline } from "./components/Timeline";
import {
  createIncidentReport,
  createReplay,
  DISCLAIMER,
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
      JSON.stringify(createReplay(lab.config, live), null, 2),
      "application/json",
    );
  const exportReport = () =>
    download(
      `incident-report-${lab.config.scenario}.html`,
      createIncidentReport(lab.config, live),
      "text/html",
    );

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Market Lab home">
          <span className="brand__mark">ML</span>
          <span>
            <strong>Market Crisis Lab</strong>
            <small>Microstructure · Simulation · Governance</small>
          </span>
        </a>
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
            <h1>
              Build the market.
              <br />
              <span>Stress the market.</span> Govern it.
            </h1>
            <p>
              Explore how heterogeneous traders, liquidity shocks, and market
              rules interact inside a deterministic limit-order-book simulation.
            </p>
          </div>
          <div className="hero__scenario-card">
            <span>Active scenario</span>
            <strong>{scenario.name}</strong>
            <p>{scenario.description}</p>
            <small>Research question: {scenario.learningGoal}</small>
          </div>
        </section>

        <section className="command-bar" aria-label="Simulation controls">
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

        {lab.selectedTick !== null && (
          <div className="time-travel-banner">
            Viewing historical state at tick {lab.selectedTick}. Live simulation
            controls remain available.{" "}
            <button onClick={() => lab.setSelectedTick(null)}>
              Return to live
            </button>
          </div>
        )}

        <section className="metric-grid" aria-label="Market quality metrics">
          <MetricCard
            label="Market price"
            value={`$${view.metrics.midPrice.toFixed(2)}`}
            detail={`Fundamental $${view.fundamentalPrice.toFixed(2)}`}
            tone="green"
          />
          <MetricCard
            label="Quoted spread"
            value={`${view.metrics.spreadBps.toFixed(1)} bps`}
            detail="Lower supports execution quality"
            tone="cyan"
          />
          <MetricCard
            label="Volatility"
            value={`${view.metrics.volatilityBps.toFixed(1)} bps`}
            detail="Rolling realized volatility"
            tone="pink"
          />
          <MetricCard
            label="Visible depth"
            value={view.metrics.depth.toLocaleString()}
            detail="Units across displayed levels"
            tone="cyan"
          />
          <MetricCard
            label="Quality score"
            value={view.metrics.marketQualityScore.toFixed(1)}
            detail="Composite, 0–100"
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
        <AgentTable agents={view.agents} />
        <Timeline
          history={lab.history}
          selectedTick={lab.selectedTick}
          onSelect={lab.setSelectedTick}
        />

        <section className="panel export-panel">
          <div>
            <span className="eyebrow">Reproducible evidence</span>
            <h2>Export the experiment</h2>
            <p>
              Save the exact seed, market rules, final state, and incident
              timeline for audit or peer review.
            </p>
          </div>
          <div>
            <button className="button button--ghost" onClick={exportReplay}>
              Download replay JSON
            </button>
            <button className="button button--ghost" onClick={exportReport}>
              Download incident report
            </button>
          </div>
        </section>

        <footer>
          <p>{DISCLAIMER}</p>
          <span>
            Deterministic engine · Price-time priority · Reproducible
            experiments
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
