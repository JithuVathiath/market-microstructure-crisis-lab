import { useState } from "react";

import type { BatchExperimentResult } from "../engine/types";

interface BatchExperimentsProps {
  result: BatchExperimentResult | null;
  running: boolean;
  onRun: (runs: number) => void;
}

export const BatchExperiments = ({
  result,
  running,
  onRun,
}: BatchExperimentsProps) => {
  const [runs, setRuns] = useState(25);
  return (
    <section className="panel batch-panel" aria-labelledby="batch-title">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Batch experimental result</span>
          <h2 id="batch-title">Paired-seed Monte Carlo</h2>
        </div>
        <span className="count-chip">Worker isolated</span>
      </div>
      <div className="batch-controls">
        <label>
          <span>Repetitions</span>
          <select
            aria-label="Batch repetitions"
            value={runs}
            onChange={(event) => setRuns(Number(event.target.value))}
          >
            <option value={10}>10 paired seeds</option>
            <option value={25}>25 paired seeds</option>
            <option value={50}>50 paired seeds</option>
          </select>
        </label>
        <button
          className="button button--accent"
          onClick={() => onRun(runs)}
          disabled={running}
        >
          {running
            ? "Running batch off the UI thread…"
            : "Run batch experiment"}
        </button>
      </div>
      {result ? (
        <div className="table-scroll batch-results">
          <p>
            {result.runs} paired runs · seeds {result.firstSeed}–
            {result.lastSeed}
          </p>
          <table>
            <thead>
              <tr>
                <th>Measure</th>
                <th>Baseline mean</th>
                <th>Policy mean</th>
                <th>Median improvement</th>
                <th>95% simulation interval</th>
                <th>Improved runs</th>
              </tr>
            </thead>
            <tbody>
              {result.summaries.map((summary) => (
                <tr key={summary.metric}>
                  <td>{summary.metric}</td>
                  <td>
                    {summary.baselineMean.toFixed(2)} {summary.unit}
                  </td>
                  <td>
                    {summary.interventionMean.toFixed(2)} {summary.unit}
                  </td>
                  <td>
                    {summary.medianImprovement.toFixed(2)} {summary.unit}
                  </td>
                  <td>
                    [{summary.intervalLow.toFixed(2)},{" "}
                    {summary.intervalHigh.toFixed(2)}]
                  </td>
                  <td>{(summary.improvementFrequency * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">
          Unlike a single replay, this runs the same policy contrast over a
          sequence of deterministic seeds and reports empirical simulation
          intervals.
        </p>
      )}
      <p className="panel-note">
        Intervals describe variation across this synthetic model only; they are
        not statistical confidence intervals for real markets.
      </p>
    </section>
  );
};
