# Rust matching engine

The production exchange core lives in `crates/exchange-core` and compiles to a
small browser WebAssembly module.

## Supported mechanics

- market and limit orders;
- configurable tick-size normalisation using integer tick coordinates;
- best-price then FIFO sequence priority;
- partial fills and multiple fills per incoming order;
- cancellation with owner and minimum-resting-time checks;
- replacement as cancel followed by a new order, which loses queue priority;
- market-order remainder expiry;
- maker rebates and taker fees;
- explicit trading halt and resume;
- per-level quantity, order count, and per-order queue position;
- deterministic core event output.

Trades execute at the resting order's price. A market order never rests. A limit
order rests only after all immediately executable quantity is matched. Therefore
a completed call cannot leave an executable crossed book.

## Price representation

Incoming floating-point prices are converted to integer tick indices before they
enter book ordering. Display prices are derived from `ticks × tick_size` and
rounded at the serialisation boundary. This prevents binary floating-point noise
from changing priority comparisons.

## Fee accounting

Buyer and seller cash are updated by notional and their maker/taker fee. The
simulation tracks accumulated exchange fee revenue. A conservation audit checks:

```text
current participant cash + exchange fee revenue = initial participant cash
current aggregate inventory = initial aggregate inventory
```

## Invariants

Rust unit and property tests cover better-price priority, equal-price FIFO,
cancel/replace ownership, halt/resume, level-specific queue positions, submitted
quantity conservation, and absence of a crossed executable book. TypeScript tests
add deterministic hashes, cash/inventory conservation, configured policy logic,
and replay-oracle equality.
