# Reproducible experiment guide

## Suggested investigation

**Question:** Does a circuit breaker improve post-shock market quality when liquidity providers withdraw?

1. Select **Flash crash and liquidity withdrawal**.
2. Record the displayed random seed.
3. Keep the default circuit breaker and run the experiment.
4. Select **Compare against unregulated market**.
5. Compare spread, volatility, pricing error, and the composite score.
6. Export the replay and incident report.
7. Repeat across at least 30 seeds before describing an average effect.

## Interpretation checklist

- Treat a single seed as an example, not evidence of a general effect.
- Inspect each component metric; a composite score can hide trade-offs.
- Distinguish efficient repricing after an information shock from destabilising price error.
- Report configuration, seed range, scenario, and model version.
- State that results are synthetic and model-dependent.

## Extension ideas

- Batch experiments with bootstrap confidence intervals.
- Add a closing auction and compare continuous versus call-market recovery.
- Estimate agent-specific implementation shortfall.
- Introduce fragmented venues and order routing.
- Calibrate stylised parameters to published empirical ranges.
