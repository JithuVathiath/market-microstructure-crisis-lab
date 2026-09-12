import { useMemo, useState } from "react";

import type { BookLevel, BookView, QueueEntry } from "../engine/types";

interface OrderBookProps {
  book: BookView;
}

const Level = ({
  level,
  side,
  maximum,
  selected,
  onSelect,
}: {
  level: BookLevel;
  side: "bid" | "ask";
  maximum: number;
  selected: boolean;
  onSelect: () => void;
}) => (
  <button
    className={`book-level book-level--${side} ${selected ? "book-level--selected" : ""}`}
    onClick={onSelect}
    aria-expanded={selected}
    aria-label={`Inspect ${side} queue at ${level.price.toFixed(2)}`}
  >
    <span
      className="book-level__bar"
      style={{ width: `${(level.quantity / maximum) * 100}%` }}
    />
    <span>{level.orderCount}</span>
    <strong>{level.price.toFixed(2)}</strong>
    <span>{level.quantity}</span>
  </button>
);

export const OrderBook = ({ book }: OrderBookProps) => {
  const [selection, setSelection] = useState<{
    side: "bid" | "ask";
    price: number;
  } | null>(null);
  const maximum = Math.max(
    1,
    ...book.bids.map((level) => level.quantity),
    ...book.asks.map((level) => level.quantity),
  );
  const queue = useMemo<QueueEntry[]>(() => {
    if (!selection) return [];
    const source = selection.side === "bid" ? book.bidQueue : book.askQueue;
    return source.filter((entry) => entry.price === selection.price);
  }, [book, selection]);
  const select = (side: "bid" | "ask", price: number) =>
    setSelection((current) =>
      current?.side === side && current.price === price
        ? null
        : { side, price },
    );
  return (
    <section className="panel book-panel" aria-labelledby="order-book-title">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Live Liquidity</span>
          <h2 id="order-book-title">Limit Order Book</h2>
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
            selected={
              selection?.side === "ask" && selection.price === level.price
            }
            onSelect={() => select("ask", level.price)}
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
            selected={
              selection?.side === "bid" && selection.price === level.price
            }
            onSelect={() => select("bid", level.price)}
          />
        ))}
      </div>
      <div className="queue-inspector" aria-live="polite">
        <div>
          <span className="eyebrow">FIFO Queue Position</span>
          <strong>
            {selection
              ? `${selection.side.toUpperCase()} · $${selection.price.toFixed(2)}`
              : "Select a price level"}
          </strong>
        </div>
        {selection && queue.length > 0 ? (
          <ol>
            {queue.slice(0, 8).map((entry) => (
              <li key={entry.orderId}>
                <span>#{entry.queuePosition}</span>
                <b>{entry.agentId}</b>
                <small>
                  {entry.remaining} units · age {entry.ageTicks}t
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            {selection
              ? "No resting orders at this reconstructed state."
              : "Click any bid or ask to inspect arrival priority."}
          </p>
        )}
      </div>
    </section>
  );
};
