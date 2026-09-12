# Limitations and responsible interpretation

This laboratory is a transparent computational model, not a calibrated digital
twin of a real exchange.

## Deliberate simplifications

- discrete logical ticks rather than continuous exchange time;
- one lit central limit order book with no fragmentation or smart routing;
- visible orders only—no hidden, iceberg, or dark liquidity;
- fixed, inspectable agent rules without learning or strategic optimisation;
- synthetic latency classes rather than measured network distributions;
- an exogenous latent fundamental process;
- simple cash, inventory, and fee accounting without clearing or margin;
- fixed institutional child-order scheduling rather than TWAP/VWAP/POV optimisation;
- no opening/reopening auction in version 2;
- participant categories that do not map to protected groups or real institutions.

## Claims the project does not make

It does not predict assets, recommend policies, demonstrate manipulation, measure
real-world fairness, establish causal effects, or represent the rules of a named
venue. A circuit breaker improving one simulated measure does not prove that the
same rule would improve a real market.

## Reading results responsibly

Inspect component metrics and trade-offs. Record seed ranges and configuration.
Use multiple seeds for model robustness. Describe results as “within this synthetic
simulation.” External validity would require venue-specific data, calibration,
sensitivity analysis, comparison with empirical literature, and independent review.
