import { useId } from "react";

import { scenarioById } from "../engine/scenarios";
import type { MarketSnapshot } from "../engine/types";

interface PriceChartProps {
  snapshot: MarketSnapshot;
}

const dimensions = {
  width: 880,
  height: 300,
  left: 42,
  right: 18,
  top: 20,
  bottom: 34,
};

const pathFrom = (
  values: number[],
  min: number,
  max: number,
  xFor: (index: number) => number,
): string => {
  const range = Math.max(max - min, 0.01);
  return values
    .map((value, index) => {
      const x = xFor(index);
      const y =
        dimensions.top +
        ((max - value) / range) *
          (dimensions.height - dimensions.top - dimensions.bottom);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

export const PriceChart = ({ snapshot }: PriceChartProps) => {
  const id = useId().replace(/:/g, "");
  const history = snapshot.priceHistory;
  const prices = history.flatMap((point) => [point.price, point.fundamental]);
  const minimum = Math.min(...prices) - 0.15;
  const maximum = Math.max(...prices) + 0.15;
  const plotWidth = dimensions.width - dimensions.left - dimensions.right;
  const xFor = (index: number): number =>
    dimensions.left + (index / Math.max(history.length - 1, 1)) * plotWidth;
  const marketPath = pathFrom(
    history.map((point) => point.price),
    minimum,
    maximum,
    xFor,
  );
  const fundamentalPath = pathFrom(
    history.map((point) => point.fundamental),
    minimum,
    maximum,
    xFor,
  );
  const shockTick = scenarioById(snapshot.scenario).shockTick;
  const shockIndex = history.findIndex(
    (point) => point.tick >= (shockTick ?? Number.POSITIVE_INFINITY),
  );

  return (
    <section className="panel chart-panel" aria-labelledby="price-chart-title">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Price Discovery</span>
          <h2 id="price-chart-title">Market vs. Fundamental Value</h2>
        </div>
        <div className="chart-legend" aria-label="Chart legend">
          <span>
            <i className="legend-line legend-line--market" />
            Market
          </span>
          <span>
            <i className="legend-line legend-line--value" />
            Fundamental
          </span>
        </div>
      </div>
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          role="img"
          aria-label="Market and fundamental price over simulation ticks"
        >
          <defs>
            <linearGradient id={`area-${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#3be1c2" stopOpacity="0.22" />
              <stop offset="1" stopColor="#3be1c2" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y =
              dimensions.top +
              ratio * (dimensions.height - dimensions.top - dimensions.bottom);
            const price = maximum - ratio * (maximum - minimum);
            return (
              <g key={ratio}>
                <line
                  className="chart-grid"
                  x1={dimensions.left}
                  x2={dimensions.width - dimensions.right}
                  y1={y}
                  y2={y}
                />
                <text
                  className="chart-axis"
                  x={dimensions.left - 8}
                  y={y + 4}
                  textAnchor="end"
                >
                  {price.toFixed(1)}
                </text>
              </g>
            );
          })}
          {shockIndex >= 0 && (
            <g>
              <line
                className="shock-marker"
                x1={xFor(shockIndex)}
                x2={xFor(shockIndex)}
                y1={dimensions.top}
                y2={dimensions.height - dimensions.bottom}
              />
              <text
                className="shock-label"
                x={xFor(shockIndex) + 7}
                y={dimensions.top + 12}
              >
                SHOCK
              </text>
            </g>
          )}
          <path className="fundamental-path" d={fundamentalPath} />
          <path
            className="market-area"
            d={`${marketPath} L${xFor(history.length - 1)},${dimensions.height - dimensions.bottom} L${xFor(0)},${dimensions.height - dimensions.bottom} Z`}
            fill={`url(#area-${id})`}
          />
          <path className="market-path" d={marketPath} />
          <text
            className="chart-axis"
            x={dimensions.left}
            y={dimensions.height - 10}
          >
            T{history[0]?.tick ?? 0}
          </text>
          <text
            className="chart-axis"
            x={dimensions.width - dimensions.right}
            y={dimensions.height - 10}
            textAnchor="end"
          >
            T{history.at(-1)?.tick ?? 0}
          </text>
        </svg>
      </div>
    </section>
  );
};
