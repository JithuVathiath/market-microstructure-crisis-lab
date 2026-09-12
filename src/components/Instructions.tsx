interface InstructionsProps {
  onClose: () => void;
}

const usageSteps = [
  {
    number: "01",
    title: "Choose a Scenario",
    description:
      "Select a market event from the Scenario menu. Each scenario states its research question and modelling limitation.",
  },
  {
    number: "02",
    title: "Set the Experiment",
    description:
      "Keep the default seed for a reproducible run, or enter a positive whole number to generate a different deterministic path. Then choose a playback speed.",
  },
  {
    number: "03",
    title: "Run and Control the Market",
    description:
      "Select Run Experiment to begin. Use Stop to pause, Resume Market to continue, or Reset to return to the opening state.",
  },
  {
    number: "04",
    title: "Investigate the Evidence",
    description:
      "Inspect market-quality metrics, select a price level to view its FIFO queue, and follow the crisis sequence into Market Time Travel and the agent decision records.",
  },
  {
    number: "05",
    title: "Test a Policy",
    description:
      "Adjust the governance controls and compare the policy intervention with the unregulated baseline while holding the scenario and seed constant.",
  },
  {
    number: "06",
    title: "Export a Reproducible Result",
    description:
      "Download the replay JSON or incident report. You can later import a replay JSON file to reconstruct and verify the same experiment.",
  },
];

export const Instructions = ({ onClose }: InstructionsProps) => (
  <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section
      className="modal modal--instructions"
      role="dialog"
      aria-modal="true"
      aria-labelledby="instructions-title"
      aria-describedby="instructions-introduction"
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <button
        className="modal__close"
        type="button"
        aria-label="Close instructions"
        onClick={onClose}
        autoFocus
      >
        ×
      </button>

      <header className="instructions__header">
        <span className="eyebrow">User Guide</span>
        <h2 id="instructions-title">How to Use the Market Lab</h2>
        <p id="instructions-introduction">
          Follow this guide to run a simulation, investigate a market event,
          compare governance choices, and save a reproducible result.
        </p>
      </header>

      <section
        className="instructions__section"
        aria-labelledby="quick-start-title"
      >
        <h3 id="quick-start-title">Quick-Start Workflow</h3>
        <ol className="instructions__steps">
          {usageSteps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="instructions__section instructions__section--split"
        aria-labelledby="workspace-modes-title"
      >
        <div>
          <h3 id="workspace-modes-title">Choose the Right Workspace</h3>
          <dl className="instructions__definitions">
            <div>
              <dt>Demo Mode</dt>
              <dd>
                Use the guided interface for a concise portfolio demonstration
                with the essential controls and evidence panels.
              </dd>
            </div>
            <div>
              <dt>Research Mode</dt>
              <dd>
                Use Step for tick-by-tick control, inspect advanced measures and
                participants, navigate historical ticks, and run paired-seed
                batches.
              </dd>
            </div>
          </dl>
        </div>
        <aside className="instructions__tip">
          <span>Recommended First Run</span>
          <strong>Flash Crash and Liquidity Withdrawal</strong>
          <p>
            Use the default seed, run at 8× speed, stop after the shock, and
            then compare the configured safeguards with the unregulated
            baseline.
          </p>
        </aside>
      </section>

      <section
        className="instructions__section"
        aria-labelledby="local-run-title"
      >
        <h3 id="local-run-title">Run the Project Locally</h3>
        <p>
          You need Node.js 22 or later, pnpm 10 or later, and a modern browser.
          The compiled WebAssembly package is included, so Rust is not required
          for a normal local run.
        </p>
        <ol className="instructions__local-steps">
          <li>
            <strong>Clone the repository and enter its directory.</strong>
            <code>{`git clone https://github.com/JithuVathiath/market-microstructure-crisis-lab.git
cd market-microstructure-crisis-lab`}</code>
          </li>
          <li>
            <strong>Install the locked dependencies.</strong>
            <code>pnpm install --frozen-lockfile</code>
          </li>
          <li>
            <strong>Start the development website.</strong>
            <code>pnpm dev</code>
          </li>
          <li>
            <strong>Open the local address displayed in the terminal.</strong>
            <p>No account, API key, external dataset, or server is required.</p>
          </li>
        </ol>
      </section>

      <section className="instructions__section" aria-labelledby="engine-title">
        <h3 id="engine-title">Optional: Rebuild the Rust/WebAssembly Engine</h3>
        <p>
          Install the stable Rust toolchain, the WebAssembly target, and
          wasm-pack. Then run:
        </p>
        <code className="instructions__single-command">pnpm wasm:build</code>
      </section>
    </section>
  </div>
);
