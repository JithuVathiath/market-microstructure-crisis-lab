# Event model and replay

## Canonical event schema

Every event contains:

| Field                                            | Meaning                                                      |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `sequenceNumber`                                 | Strict global order within one run                           |
| `simulationTimestamp`                            | Deterministic logical tick                                   |
| `exchangeTimestamp`                              | Synthetic monotonic timestamp derived from tick and sequence |
| `eventType`                                      | Exchange, agent, scenario, policy, or surveillance action    |
| `agentId`, `orderId`, `parentOrderId`            | Traceability identifiers when applicable                     |
| `side`, `price`, `quantity`, `remainingQuantity` | Economic order data when applicable                          |
| `reasonCode`                                     | Stable machine-readable explanation                          |
| `metadata`                                       | Versioned event-specific detail                              |

Supported event families include new, cancel, replace, trade, partial fill,
expiry, quote update, halt/resume, agent state change, value update, shock,
regulatory trigger, policy change, and surveillance alert.

## Reconstruction

`eventReplay.ts` is an independent reducer. It does not invoke the production
matcher. A quote becomes visible only after `QuoteUpdated`; a trade reduces the
resting maker identified by `parentOrderId`; cancel and expiry remove the order.
At a selected sequence, it derives levels, best bid/ask, spread, mid-price, FIFO
queue positions, and order ages.

This is an event-level book reconstruction. Agent portfolio values use the closest
completed logical-tick checkpoint because a full portfolio snapshot is not copied
into every event.

## Integrity hash

Each canonicalised event is encoded with object keys in sorted order and folded
into a rolling FNV-1a 64-bit hash. This is a fast reproducibility checksum, not a
cryptographic signature. The same ordered stream produces the same hash. Replay
import recalculates it and rejects a mismatch.

## Replay schema v2

The JSON export contains application and engine versions, generation time,
configuration, full event stream, full decision log, event hash, final snapshot,
metrics, conservation audit, and research disclaimer. Files are human-readable
and require no server to create or import.

Compatibility is explicit: the current importer accepts schema version 2 only.
Future schema changes should add a migration rather than silently reinterpret data.
