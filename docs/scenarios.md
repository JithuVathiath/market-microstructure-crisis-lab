# Scenario library

Scenarios parameterise mechanisms; they do not inject unexplained chart values.
Each shock produces a canonical `ShockTriggered` event and relevant alerts.

| Scenario                  | Mechanism                                       | Suggested measures                 | Main limitation                        |
| ------------------------- | ----------------------------------------------- | ---------------------------------- | -------------------------------------- |
| Flash crash               | Sell programme overlaps market-maker withdrawal | Drawdown, depth, recovery          | Stylised withdrawal rule               |
| Liquidity withdrawal      | Makers cancel and suspend replenishment         | Spread, depth, fill rate           | Simplified dealer risk                 |
| Institutional liquidation | Fixed child-order schedule                      | Impact, slippage, fill rate        | No execution optimiser                 |
| Information shock         | Latent value falls abruptly                     | Price error, volatility, overshoot | Exogenous information                  |
| Latency race              | Fast agent observes and transmits earlier       | Queue position, fills, slippage    | Logical ticks, not milliseconds        |
| Volatility feedback       | Value shock plus stronger momentum sizing       | Volatility, error, quality         | Stylised momentum response             |
| Cancellation surveillance | Sustained quote-cancellation burst              | Cancel/trade, age, depth           | Pattern flag is not a legal conclusion |
| Exchange outage           | Deterministic halt and restart                  | Delay, spread, recovery            | No venue routing or failover           |
| Tick-size regime          | New orders move to a wider price grid           | Spread, queue depth, fills         | Existing orders retain prices          |
| Stable control            | Balanced flow with no discrete shock            | Spread, depth, price error         | Synthetic baseline only                |

## Traceability

The crisis view searches the actual event stream after the first shock and links
observable steps such as maker cancellation, institutional arrival, bid-side
execution, regulatory trigger, and resumption. A step is omitted if the
corresponding event never occurred; the UI does not fill gaps with invented
percentages.

## Surveillance language

The cancellation scenario may produce “Potential layering-like pattern detected.”
It flags an abnormal synthetic event signature. It does not identify a real person,
assert intent, or make a legal finding.
