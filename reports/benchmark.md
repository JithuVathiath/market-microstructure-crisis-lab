# Local performance snapshot

Measured on 2026-09-12 on an Apple Silicon development host using the production
release WebAssembly module. Results are a development snapshot, not a cross-device
performance guarantee.

```text
WASM binary                         139,437 bytes
Orders submitted                    10,000
Canonical core events               25,000
Order-processing throughput         147,504 orders/second
Independent replay passes           50
Replay-reducer throughput            15,895,421 events/second
Final deterministic event hash      5e3f6b3d1a4d19d7
```

Run `pnpm benchmark` to repeat the measurement. The benchmark alternates resting
Rust/WASM limit orders and executable market orders, drains the resulting event
stream, then reconstructs it 50 times using the independent TypeScript replay
reducer. Browser simulation throughput is lower because the full agent, metrics,
chart-snapshot, and JSON-boundary work is intentionally included there.
