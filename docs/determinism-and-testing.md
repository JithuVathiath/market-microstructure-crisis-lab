# Determinism and testing

## Guarantee

For one application/engine version, identical seed, scenario, duration, initial
price, participant rules, and policy configuration reproduce the same ordered
event stream and canonical hash in the same supported browser/runtime.

Determinism comes from:

- one seeded pseudo-random generator owned by the worker;
- integer tick coordinates for exchange price ordering;
- monotonic order and event sequence numbers;
- stable array ordering and no wall-clock input to market outcomes;
- synthetic exchange timestamps derived from tick and sequence;
- deterministic agent iteration and pending-order scheduling.

The export generation timestamp is metadata and is excluded from market outcomes.

## Test layers

- **Rust unit tests:** explicit order-priority, queue, replacement, and halt cases.
- **Rust property tests:** quantity conservation and no crossed executable book
  across generated prices and quantities.
- **TypeScript unit tests:** RNG, metrics, policies, simulation, event hashing,
  replay validation, multi-scenario completion, latency arrival, accounting
  conservation, counterfactuals, and Monte Carlo aggregation.
- **Independent replay oracle:** rebuilds a production event stream and compares
  its final book with the original matcher state.
- **Playwright:** loads the production build and exercises execution, pause/step,
  event replay, queue inspection, decision expansion, policy comparison, replay
  export, and a second deterministic run.
- **CI:** repeats frontend and Rust checks and builds WASM from source.

## Hash limits

FNV-1a is used as a compact regression checksum. It is not collision-resistant
and does not authenticate a file. Replay files from untrusted sources should be
treated as untrusted data even if their checksum is internally consistent.
