# Architecture

## Runtime boundaries

The application has three deliberately separate responsibilities.

1. **React control and visualisation layer.** Sends commands, renders immutable
   snapshots, reconstructs an inspected event state, and creates local exports.
   It never matches an order or selects an agent action.
2. **TypeScript Web Worker.** Owns the seed, agents, latency scheduler, synthetic
   fundamental process, scenarios, policies, event store, metrics, paired policy
   runs, and Monte Carlo batches. Expensive work stays off the rendering thread.
3. **Rust/WebAssembly exchange core.** Owns the central limit order book and all
   mechanically valid exchange outcomes: submit, match, partial fill, cancel,
   replace, queue ordering, halt/resume, price normalisation, and fees.

```text
React ──serialisable command──▶ Worker ──JSON ABI──▶ Rust/WASM
  ▲                                │                   │
  └────snapshot + event delta──────┴────core events────┘
```

## Why a JSON WASM boundary?

The boundary is intentionally narrow and inspectable. It avoids sharing mutable
JavaScript objects with WebAssembly and makes every crossing serialisable. The
trade-off is JSON encoding overhead, which is acceptable at the current model
size. A binary ABI would be justified only after profiling a larger order rate.

## Data flow

- React posts an initialise, play, step, policy, order, paired-comparison, or
  batch command.
- The worker advances deterministic logical time and invokes transparent agents.
- Transmission and processing delays enter a deterministic pending-order queue.
- Due orders enter Rust/WASM. The core produces trades, book state, and core events.
- The worker appends higher-level agent, shock, policy, and surveillance events
  to one globally sequenced event store.
- React receives immutable snapshots plus incremental events and decisions.

## State and failure model

All experiment state is in memory and local to one browser tab. There is no
backend, database, broker, credential, live feed, or cross-user state. Refreshing
clears the run unless the replay JSON was exported. Invalid imported files or hash
mismatches are rejected before state is displayed.

## GitHub Pages

Vite emits static assets under the repository base path. The WASM module is an
imported build asset, so it receives the same hashed, base-aware treatment as the
JavaScript worker. The application uses anchors rather than server-side routes,
so direct refreshes require no rewrite service.
