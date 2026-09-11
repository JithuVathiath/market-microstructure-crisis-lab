import type { BookLevel, BookView } from "../engine/types";

interface OrderBookProps {
  book: BookView;
}

const Level = ({
  level,
  side,
  maximum,
}: {
  level: BookLevel;
  side: "bid" | "ask";
  maximum: number;
}) => (
  <div className={`book-level book-level--${side}`}>
    <span
      className="book-level__bar"
      style={{ width: `${(level.quantity / maximum) * 100}%` }}
    />
    <span>{level.orderCount}</span>
    <strong>{level.price.toFixed(2)}</strong>
    <span>{level.quantity}</span>
  </div>
);

export const OrderBook = ({ book }: OrderBookProps) => {
  const maximum = Math.max(
    1,
    ...book.bids.map((level) => level.quantity),
    ...book.asks.map((level) => level.quantity),
  );
  return (
    <section className="panel book-panel" aria-labelledby="order-book-title">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Live liquidity</span>
          <h2 id="order-book-title">Limit order book</h2>
        </div>
        <span className="spread-chip">
          {book.spread === null ? "—" : `${book.spread.toFixed(2)} spread`}
        </span>
      </div>
      <div className="book-heading">
        <span>Orders</span>
        <span>Price</span>
        <span>Size</span>
      </div>
      <div className="book-levels book-levels--asks">
        {[...book.asks].reverse().map((level) => (
          <Level
            key={`ask-${level.price}`}
            level={level}
            side="ask"
            maximum={maximum}
          />
        ))}
      </div>
      <div className="mid-price">
        <span>Mid</span>
        <strong>{book.midPrice?.toFixed(2) ?? "No market"}</strong>
      </div>
      <div className="book-levels">
        {book.bids.map((level) => (
          <Level
            key={`bid-${level.price}`}
            level={level}
            side="bid"
            maximum={maximum}
          />
        ))}
      </div>
    </section>
  );
};
