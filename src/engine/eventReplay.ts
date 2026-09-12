import type {
  AgentKind,
  BookLevel,
  BookView,
  MarketEvent,
  QueueEntry,
  Side,
} from "./types";

interface ReplayOrder {
  orderId: string;
  agentId: string;
  agentKind: AgentKind;
  side: Side;
  price: number;
  quantity: number;
  remaining: number;
  sequence: number;
  createdTick: number;
}

const round = (value: number): number => Number(value.toFixed(8));

const levels = (orders: ReplayOrder[], count: number): BookLevel[] => {
  const aggregated = new Map<number, BookLevel>();
  for (const order of orders) {
    const level = aggregated.get(order.price);
    if (level) {
      level.quantity += order.remaining;
      level.orderCount += 1;
    } else {
      aggregated.set(order.price, {
        price: order.price,
        quantity: order.remaining,
        orderCount: 1,
      });
    }
  }
  return [...aggregated.values()].slice(0, count);
};

const queue = (orders: ReplayOrder[], tick: number): QueueEntry[] =>
  orders.map((order, index) => ({
    orderId: order.orderId,
    agentId: order.agentId,
    agentKind: order.agentKind,
    side: order.side,
    price: order.price,
    remaining: order.remaining,
    queuePosition:
      orders
        .slice(0, index)
        .filter((candidate) => candidate.price === order.price).length + 1,
    createdTick: order.createdTick,
    ageTicks: Math.max(0, tick - order.createdTick),
  }));

/**
 * Rebuild the visible book from the canonical exchange event stream. New orders
 * become visible only after QuoteUpdated; trade events decrement the resting
 * maker identified by parentOrderId. This reducer is deliberately independent
 * from the production matcher and therefore also acts as a replay oracle.
 */
export const reconstructBook = (
  events: MarketEvent[],
  sequenceNumber = Number.POSITIVE_INFINITY,
  levelCount = 8,
): BookView => {
  const known = new Map<string, ReplayOrder>();
  const active = new Map<string, ReplayOrder>();
  let tick = 0;

  for (const event of events) {
    if (event.sequenceNumber > sequenceNumber) break;
    tick = event.simulationTimestamp;
    if (
      event.eventType === "NewOrder" &&
      event.orderId &&
      event.agentId &&
      event.side &&
      event.quantity !== null
    ) {
      known.set(event.orderId, {
        orderId: event.orderId,
        agentId: event.agentId,
        agentKind: String(event.metadata.agentKind) as AgentKind,
        side: event.side,
        price: event.price ?? 0,
        quantity: event.quantity,
        remaining: event.remainingQuantity ?? event.quantity,
        sequence: event.sequenceNumber,
        createdTick: event.simulationTimestamp,
      });
      continue;
    }
    if (event.eventType === "QuoteUpdated" && event.orderId) {
      const order = known.get(event.orderId);
      if (order && event.price !== null) {
        order.price = event.price;
        order.remaining = event.remainingQuantity ?? order.remaining;
        active.set(order.orderId, order);
      }
      continue;
    }
    if (
      (event.eventType === "Trade" || event.eventType === "PartialFill") &&
      event.quantity !== null
    ) {
      if (event.parentOrderId) {
        const maker = active.get(event.parentOrderId);
        if (maker) {
          maker.remaining -= event.quantity;
          if (maker.remaining <= 0) active.delete(maker.orderId);
        }
      }
      const incoming = event.orderId ? known.get(event.orderId) : undefined;
      if (incoming && event.remainingQuantity !== null) {
        incoming.remaining = event.remainingQuantity;
      }
      continue;
    }
    if (
      (event.eventType === "CancelOrder" ||
        event.eventType === "OrderExpired") &&
      event.orderId
    ) {
      active.delete(event.orderId);
    }
  }

  const bids = [...active.values()]
    .filter((order) => order.side === "buy" && order.remaining > 0)
    .sort(
      (left, right) =>
        right.price - left.price || left.sequence - right.sequence,
    );
  const asks = [...active.values()]
    .filter((order) => order.side === "sell" && order.remaining > 0)
    .sort(
      (left, right) =>
        left.price - right.price || left.sequence - right.sequence,
    );
  const bidLevels = levels(bids, levelCount);
  const askLevels = levels(asks, levelCount);
  const bestBid = bidLevels[0]?.price ?? null;
  const bestAsk = askLevels[0]?.price ?? null;
  return {
    bids: bidLevels,
    asks: askLevels,
    bestBid,
    bestAsk,
    spread:
      bestBid === null || bestAsk === null ? null : round(bestAsk - bestBid),
    midPrice:
      bestBid === null || bestAsk === null
        ? null
        : round((bestBid + bestAsk) / 2),
    bidQueue: queue(bids, tick),
    askQueue: queue(asks, tick),
  };
};
