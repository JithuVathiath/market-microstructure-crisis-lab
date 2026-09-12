# Reproducible experiment guide

## Suggested investigation

**Question:** Does a circuit breaker improve post-shock market quality when liquidity providers withdraw?

1. Select **Flash crash and liquidity withdrawal**.
2. Record the displayed random seed.
3. Keep the default circuit breaker and run the experiment.
4. Select **Compare against unregulated market**.
5. Compare spread, volatility, pricing error, and the composite score.
6. Export the replay and incident report.
7. Switch to **Research Mode** and run 25 or 50 paired seeds before describing
   an average model effect.

## Interpretation checklist

- Treat a single seed as an example, not evidence of a general effect.
- Inspect each component metric; a composite score can hide trade-offs.
- Distinguish efficient repricing after an information shock from destabilising price error.
- Report configuration, seed range, scenario, and model version.
- State that results are synthetic and model-dependent.

## Export checklist

- Export replay JSON and verify that re-import succeeds.
- Export the incident report after running the paired comparison so both worlds
  are included.
- Record application version, event hash, seed range, scenario, and all policies.
- Report the 95% simulation interval and improvement frequency, not only the mean.
