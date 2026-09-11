import { describe, expect, it } from "vitest";

import { defaultPolicies, LimitOrderBook, participantLabel } from "./orderBook";
import type { AgentKind, OrderRequest } from "./types";

const order = (overrides: Partial<OrderRequest> = {}): OrderRequest => ({
  agentId: "agent-a",
  agentKind: "value",
  side: "buy",
  type: "limit",
  price: 100,
  quantity: 10,
  ...overrides,
});

describe("LimitOrderBook", () => {
  it("normalizes prices and sorts levels by price", () => {
    const book = new LimitOrderBook(defaultPolicies());
    book.submit(order({ price: 99.994 }));
    book.submit(order({ agentId: "agent-b", price: 100.036, quantity: 3 }));
    expect(book.view().bids.map((level) => level.price)).toEqual([
      100.04, 99.99,
    ]);
  });

  it("aggregates orders at the same level", () => {
    const book = new LimitOrderBook(defaultPolicies());
    book.submit(order({ quantity: 3 }));
    book.submit(order({ agentId: "agent-b", quantity: 7 }));
    expect(book.view().bids[0]).toEqual({
      price: 100,
      quantity: 10,
      orderCount: 2,
    });
  });

  it("matches at the resting price using price-time priority", () => {
    const book = new LimitOrderBook(defaultPolicies());
    const first = book.submit(
      order({ agentId: "seller-1", side: "sell", price: 100, quantity: 4 }),
    );
    const second = book.submit(
      order({ agentId: "seller-2", side: "sell", price: 100, quantity: 4 }),
    );
    const result = book.submit(
      order({ agentId: "buyer", type: "market", quantity: 6 }),
    );
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({
      price: 100,
      quantity: 4,
      makerOrderId: first.order?.id,
    });
    expect(result.trades[1]).toMatchObject({
      quantity: 2,
      makerOrderId: second.order?.id,
    });
    expect(book.view().asks[0]?.quantity).toBe(2);
  });

  it("supports partial fills and discards unfilled market quantity", () => {
    const book = new LimitOrderBook(defaultPolicies());
    book.submit(
      order({ side: "sell", agentId: "seller", quantity: 2, price: 101 }),
    );
    const result = book.submit(order({ type: "market", quantity: 8 }));
    expect(result.order?.remaining).toBe(6);
    expect(book.getOrders("agent-a")).toHaveLength(0);
  });

  it("does not cross a passive limit order", () => {
    const book = new LimitOrderBook(defaultPolicies());
    book.submit(order({ side: "sell", agentId: "seller", price: 101 }));
    const result = book.submit(order({ price: 100.99 }));
    expect(result.trades).toHaveLength(0);
    expect(book.view()).toMatchObject({
      bestBid: 100.99,
      bestAsk: 101,
      spread: 0.01,
      midPrice: 100.995,
    });
  });

  it("calculates maker rebates and taker fees by side", () => {
    const policies = { ...defaultPolicies(), makerFeeBps: -1, takerFeeBps: 2 };
    const book = new LimitOrderBook(policies);
    book.submit(
      order({ side: "sell", agentId: "seller", price: 100, quantity: 10 }),
    );
    const trade = book.submit(order({ agentId: "buyer", type: "market" }))
      .trades[0]!;
    expect(trade.buyerFee).toBe(0.2);
    expect(trade.sellerFee).toBe(-0.1);
    expect(trade).toMatchObject({
      buyerId: "buyer",
      sellerId: "seller",
      makerSide: "sell",
    });
  });

  it("enforces ownership and resting-time cancellation rules", () => {
    const book = new LimitOrderBook({
      ...defaultPolicies(),
      minimumRestingTicks: 2,
    });
    const placed = book.submit(order());
    expect(book.cancel(placed.order!.id, "intruder").reason).toBe(
      "owner mismatch",
    );
    expect(book.cancel(placed.order!.id, "agent-a").reason).toBe(
      "minimum resting time active",
    );
    book.setTick(2);
    expect(book.cancel(placed.order!.id, "agent-a").cancelled).toBe(true);
    expect(book.cancel("missing", "agent-a").reason).toBe("order not found");
  });

  it("replaces an owned order and rejects an invalid replacement", () => {
    const book = new LimitOrderBook({
      ...defaultPolicies(),
      minimumRestingTicks: 0,
    });
    const placed = book.submit(order());
    const replacement = book.replace(placed.order!.id, "agent-a", 99, 8);
    expect(replacement.accepted).toBe(true);
    expect(book.view().bestBid).toBe(99);
    expect(book.replace("missing", "agent-a", 98, 4).accepted).toBe(false);
  });

  it.each([
    [order({ quantity: 0 }), "quantity must be positive and finite"],
    [order({ quantity: 1.5 }), "quantity must be an integer"],
    [order({ price: -1 }), "limit price must be positive and finite"],
    [order({ price: Number.NaN }), "limit price must be positive and finite"],
  ])("rejects invalid requests", (request, reason) => {
    const result = new LimitOrderBook(defaultPolicies()).submit(request);
    expect(result).toMatchObject({
      accepted: false,
      rejectedReason: reason,
      order: null,
    });
  });
});

describe("participantLabel", () => {
  it("provides an understandable label for every participant type", () => {
    const kinds: AgentKind[] = [
      "market-maker",
      "noise",
      "momentum",
      "value",
      "institutional",
      "latency",
    ];
    expect(kinds.map(participantLabel)).toEqual([
      "Market maker",
      "Retail flow",
      "Momentum fund",
      "Value fund",
      "Institutional desk",
      "Low-latency trader",
    ]);
  });
});
