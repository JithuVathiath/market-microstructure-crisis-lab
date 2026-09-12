# Market metrics

All displayed metrics are computed from simulation state. None are placeholders.

| Metric                  | Definition                                                                            | Interpretation limit                        |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- |
| Quoted spread           | `(best ask - best bid) / mid × 10,000`                                                | Uses displayed best quotes only             |
| Visible depth           | Quantity at the best five levels on both sides                                        | Excludes hidden liquidity                   |
| Volatility              | Root mean square of the most recent 30 log returns, in bps                            | Logical-tick measure, not annualised        |
| Price-discovery error   | `abs(mid - fundamental) / fundamental × 10,000`                                       | Fundamental value is synthetic              |
| Fill rate               | Executed agent quantity / submitted agent quantity                                    | Does not include unsubmitted parent demand  |
| Cancel/trade ratio      | Agent cancellations / completed trade count                                           | Surveillance indicator, not proof of intent |
| Retail slippage         | Mean signed retail execution difference from contemporaneous fundamental value        | Model-specific participant definition       |
| Institutional shortfall | Mean signed institutional execution cost versus contemporaneous synthetic value       | Not a parent-order arrival benchmark        |
| 20-tick market impact   | Absolute latest-trade displacement from the price 20 ticks earlier                    | Mixes endogenous and exogenous movement     |
| Microprice              | Touch-price average weighted by opposite-side displayed quantity                      | Uses only the best level                    |
| Book imbalance          | `(best bid size - best ask size) / touch size`                                        | Visible top-of-book signal only             |
| Maker inventory risk    | Mean absolute maker inventory deviation divided by available capacity                 | Simplified inventory-risk proxy             |
| Cancellation intensity  | Agent cancellations divided by elapsed logical ticks                                  | Logical-time rate                           |
| Recovery time           | Ticks after the shock until spread and price error return below documented thresholds | May remain unobserved by run end            |
| Maximum drawdown        | Peak-to-subsequent-trough decline in the simulated market path                        | Not a risk forecast                         |
| Quality score           | Bounded teaching index penalising spread, volatility, and price error                 | Inspect components; do not optimise blindly |
| Resilience score        | Bounded paired-run index from peak spread, volatility, and price error                | Comparison aid, not an empirical estimate   |

## Participant impact

Participant-class tables aggregate mean P&L, fill probability, inventory-risk
utilisation, cancellation count, and latency profile. They describe distributional
effects across synthetic classes. The application deliberately avoids calling a
difference “unfair” or claiming real-world discrimination.

## Paired and batch evidence

A paired comparison holds seed, initial state, agent population, and shock fixed.
A batch increments the seed while preserving the same policy contrast. Reported
95% intervals are empirical 2.5th and 97.5th percentiles of simulated improvement
values. They are simulation intervals—not confidence intervals for real venues.
