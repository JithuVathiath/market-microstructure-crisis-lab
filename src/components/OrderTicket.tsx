import { useState } from "react";

import type { OrderRequest, Side } from "../engine/types";

interface OrderTicketProps {
  referencePrice: number;
  onSubmit: (order: Omit<OrderRequest, "agentId" | "agentKind">) => void;
}

export const OrderTicket = ({ referencePrice, onSubmit }: OrderTicketProps) => {
  const [side, setSide] = useState<Side>("buy");
  const [quantity, setQuantity] = useState(10);
  const [price, setPrice] = useState(referencePrice);
  const [market, setMarket] = useState(false);

  const submit = () => {
    onSubmit({
      side,
      quantity: Math.max(1, Math.floor(quantity)),
      type: market ? "market" : "limit",
      price: market ? undefined : price,
    });
  };

  return (
    <section className="panel ticket-panel" aria-labelledby="ticket-title">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Human in the loop</span>
          <h2 id="ticket-title">Order ticket</h2>
        </div>
      </div>
      <div className="segmented" role="group" aria-label="Order side">
        <button
          className={side === "buy" ? "active buy" : ""}
          onClick={() => setSide("buy")}
        >
          Buy
        </button>
        <button
          className={side === "sell" ? "active sell" : ""}
          onClick={() => setSide("sell")}
        >
          Sell
        </button>
      </div>
      <label className="field">
        <span>Quantity</span>
        <input
          aria-label="Order quantity"
          type="number"
          min="1"
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
        />
      </label>
      <label className="switch-row compact">
        <span>
          <strong>Market order</strong>
        </span>
        <input
          aria-label="Market order"
          type="checkbox"
          checked={market}
          onChange={(event) => setMarket(event.target.checked)}
        />
      </label>
      {!market && (
        <label className="field">
          <span>Limit price</span>
          <input
            aria-label="Limit price"
            type="number"
            min="0.01"
            step="0.01"
            value={price.toFixed(2)}
            onChange={(event) => setPrice(Number(event.target.value))}
          />
        </label>
      )}
      <button
        className={`button button--full ${side === "buy" ? "button--buy" : "button--sell"}`}
        onClick={submit}
      >
        Submit {side} order
      </button>
    </section>
  );
};
