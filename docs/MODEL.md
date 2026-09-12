# Model specification

## Purpose

The lab is a transparent educational model for asking market-design questions. It is deliberately small enough to inspect and deterministic enough to reproduce. It does not estimate or forecast a real security.

## Exchange

- Discrete ticks advance the market clock.
- Limit orders rest in a central book and match with incoming orders using price priority, then submission sequence.
- Market orders consume available liquidity and unfilled quantity expires.
- Trades execute at the resting order's price.
- Maker rebates and taker fees are configurable in basis points.
- Exchange mechanics execute in a Rust core compiled to WebAssembly. Prices are
  ordered using integer tick coordinates.
- Cash, inventory, outstanding-sell, and reserved-cash constraints prevent impossible agent positions.
- A passive, deep liquidity reserve makes severe sweeps observable without inventing trades after the book is empty. It is excluded from the participant monitor but included in market totals.

## Participants

| Archetype          | Population | Simplified behavior                                          |
| ------------------ | ---------: | ------------------------------------------------------------ |
| Market maker       |          2 | Maintains two-sided quotes around value with inventory skew. |
| Retail/noise flow  |          4 | Produces mixed-direction market and limit orders.            |
| Momentum fund      |          2 | Follows recent price changes once a threshold is crossed.    |
| Value fund         |          2 | Trades price deviations from the latent fundamental value.   |
| Institutional desk |          1 | Works patient orders or a crisis sell program.               |
| Low-latency trader |          1 | Reacts frequently to transient price-to-value gaps.          |

These are stylised rules, not estimates of individual or institutional behavior.

Each participant has a synthetic market-data, decision, transmission, and
exchange-processing latency profile. Orders reach the venue only after the latter
two delays; observations can therefore be stale when a decision is made.

## Scenarios

Each scenario changes a small, documented set of mechanisms. The stable scenario
is the control. Ten curated scenarios cover liquidity withdrawal, sell programmes,
information arrival, latency, volatility feedback, cancellation surveillance,
outage/restart, and tick-size changes. See [scenarios.md](scenarios.md).

## Governance controls

- Circuit breaker: pauses trading after a reference-price move breaches a threshold.
- Speed bump: reduces the action frequency of the low-latency archetype.
- Minimum resting time: prevents immediate order cancellation.
- Cancellation cap: limits an agent's cancellation-to-trade ratio.
- Tick size and maker/taker fees: change exchange price granularity and economics.

The counterfactual feature runs the selected policy configuration and an unregulated baseline using the same scenario and random seed. This is a controlled computational comparison, not a causal estimate of real-world regulation.

## Measures

- Quoted spread: best ask minus best bid, divided by mid-price, in basis points.
- Visible depth: aggregate quantity across the best five levels on each side.
- Volatility: root mean square of the last 30 log returns, in basis points.
- Price error: absolute market-to-fundamental difference in basis points.
- Fill rate: executed quantity divided by submitted quantity.
- Retail slippage: average execution difference from contemporaneous fundamental value.
- Quality score: a bounded 0–100 teaching index penalising spread, volatility, and price error.
- Resilience score: a bounded comparison index based on peak spread, peak volatility, and peak pricing error during a complete paired run.

## Limitations

See [limitations.md](limitations.md) for the complete interpretation boundary.
