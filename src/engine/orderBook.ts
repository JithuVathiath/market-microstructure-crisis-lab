import type {
  AgentKind,
  BookLevel,
  BookView,
  CoreExchangeEvent,
  Order,
  OrderRequest,
  PolicyConfig,
  Side,
  Trade,
} from "./types";

export interface SubmissionResult {
  accepted: boolean;
  order: Order | null;
  trades: Trade[];
  rejectedReason: string | null;
}

export interface CancellationResult {
  cancelled: boolean;
  reason: string | null;
  order: Order | null;
}

export interface ExchangeBook {
  setTick(tick: number): void;
  setPolicies(policies: PolicyConfig): void;
  submit(request: OrderRequest): SubmissionResult;
  cancel(orderId: string, agentId: string): CancellationResult;
  replace(
    orderId: string,
    agentId: string,
    price: number,
    quantity: number,
  ): SubmissionResult;
  getOrders(agentId?: string): Order[];
  view(levelCount?: number): BookView;
  halt(reason: string): void;
  resume(reason: string): void;
  drainCoreEvents(): CoreExchangeEvent[];
}

const round = (value: number, digits = 8): number =>
  Number(value.toFixed(digits));

export class LimitOrderBook implements ExchangeBook {
  private bids: Order[] = [];
  private asks: Order[] = [];
  private sequence = 0;
  private orderCounter = 0;
  private tradeCounter = 0;
  private eventCounter = 0;
  private tick = 0;
  private halted = false;
  private events: CoreExchangeEvent[] = [];
  private policies: PolicyConfig;

  constructor(policies: PolicyConfig) {
    this.policies = { ...policies };
  }

  setTick(tick: number): void {
    this.tick = tick;
  }

  setPolicies(policies: PolicyConfig): void {
    this.policies = { ...policies };
  }

  submit(request: OrderRequest): SubmissionResult {
    if (this.halted) {
      return {
        accepted: false,
        order: null,
        trades: [],
        rejectedReason: "trading halted",
      };
    }
    const validationError = this.validateRequest(request);
    if (validationError) {
      return {
        accepted: false,
        order: null,
        trades: [],
        rejectedReason: validationError,
      };
    }

    const price =
      request.type === "market"
        ? request.side === "buy"
          ? Number.POSITIVE_INFINITY
          : 0
        : this.normalizePrice(request.price!);
    const order: Order = {
      ...request,
      id: `O${++this.orderCounter}`,
      price,
      remaining: request.quantity,
      sequence: ++this.sequence,
      createdTick: this.tick,
    };
    this.emit({
      eventType: "NewOrder",
      agentId: order.agentId,
      orderId: order.id,
      parentOrderId: null,
      side: order.side,
      price: order.type === "limit" ? order.price : null,
      quantity: order.quantity,
      remainingQuantity: order.remaining,
      reasonCode: "accepted",
      metadata: { agentKind: order.agentKind, orderType: order.type },
    });
    const trades = this.match(order);

    if (order.remaining > 0 && order.type === "limit") {
      this.sideOrders(order.side).push(order);
      this.sortSide(order.side);
      this.emit({
        eventType: "QuoteUpdated",
        agentId: order.agentId,
        orderId: order.id,
        parentOrderId: null,
        side: order.side,
        price: order.price,
        quantity: order.quantity,
        remainingQuantity: order.remaining,
        reasonCode: "resting",
        metadata: {},
      });
    } else {
      this.emit({
        eventType: "OrderExpired",
        agentId: order.agentId,
        orderId: order.id,
        parentOrderId: null,
        side: order.side,
        price: order.type === "limit" ? order.price : null,
        quantity: order.quantity,
        remainingQuantity: order.remaining,
        reasonCode:
          order.remaining === 0 ? "fully_filled" : "market_remainder_cancelled",
        metadata: {},
      });
    }
    return {
      accepted: true,
      order: { ...order },
      trades,
      rejectedReason: null,
    };
  }

  cancel(orderId: string, agentId: string): CancellationResult {
    for (const orders of [this.bids, this.asks]) {
      const index = orders.findIndex((order) => order.id === orderId);
      if (index < 0) continue;
      const order = orders[index]!;
      if (order.agentId !== agentId) {
        return { cancelled: false, reason: "owner mismatch", order: null };
      }
      if (this.tick - order.createdTick < this.policies.minimumRestingTicks) {
        return {
          cancelled: false,
          reason: "minimum resting time active",
          order: null,
        };
      }
      orders.splice(index, 1);
      this.emit({
        eventType: "CancelOrder",
        agentId: order.agentId,
        orderId: order.id,
        parentOrderId: null,
        side: order.side,
        price: order.price,
        quantity: order.quantity,
        remainingQuantity: order.remaining,
        reasonCode: "participant_cancel",
        metadata: {},
      });
      return { cancelled: true, reason: null, order: { ...order } };
    }
    return { cancelled: false, reason: "order not found", order: null };
  }

  replace(
    orderId: string,
    agentId: string,
    price: number,
    quantity: number,
  ): SubmissionResult {
    const cancellation = this.cancel(orderId, agentId);
    if (!cancellation.cancelled || !cancellation.order) {
      return {
        accepted: false,
        order: null,
        trades: [],
        rejectedReason: cancellation.reason,
      };
    }
    this.emit({
      eventType: "ReplaceOrder",
      agentId,
      orderId,
      parentOrderId: orderId,
      side: cancellation.order.side,
      price,
      quantity,
      remainingQuantity: null,
      reasonCode: "participant_replace",
      metadata: {},
    });
    return this.submit({
      agentId,
      agentKind: cancellation.order.agentKind,
      side: cancellation.order.side,
      type: "limit",
      price,
      quantity,
    });
  }

  getOrders(agentId?: string): Order[] {
    const orders = [...this.bids, ...this.asks];
    return orders
      .filter((order) => agentId === undefined || order.agentId === agentId)
      .map((order) => ({ ...order }));
  }

  view(levelCount = 8): BookView {
    const bids = this.levels(this.bids, levelCount);
    const asks = this.levels(this.asks, levelCount);
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    return {
      bids,
      asks,
      bestBid,
      bestAsk,
      spread:
        bestBid === null || bestAsk === null ? null : round(bestAsk - bestBid),
      midPrice:
        bestBid === null || bestAsk === null
          ? null
          : round((bestBid + bestAsk) / 2),
      bidQueue: this.queue(this.bids),
      askQueue: this.queue(this.asks),
    };
  }

  halt(reason: string): void {
    this.halted = true;
    this.emit({
      eventType: "TradingHalt",
      agentId: null,
      orderId: null,
      parentOrderId: null,
      side: null,
      price: null,
      quantity: null,
      remainingQuantity: null,
      reasonCode: reason,
      metadata: {},
    });
  }

  resume(reason: string): void {
    this.halted = false;
    this.emit({
      eventType: "TradingResume",
      agentId: null,
      orderId: null,
      parentOrderId: null,
      side: null,
      price: null,
      quantity: null,
      remainingQuantity: null,
      reasonCode: reason,
      metadata: {},
    });
  }

  drainCoreEvents(): CoreExchangeEvent[] {
    const events = this.events;
    this.events = [];
    return events.map((event) => ({
      ...event,
      metadata: { ...event.metadata },
    }));
  }

  private validateRequest(request: OrderRequest): string | null {
    if (!Number.isFinite(request.quantity) || request.quantity <= 0) {
      return "quantity must be positive and finite";
    }
    if (!Number.isInteger(request.quantity)) {
      return "quantity must be an integer";
    }
    if (
      request.type === "limit" &&
      (request.price === undefined ||
        !Number.isFinite(request.price) ||
        request.price <= 0)
    ) {
      return "limit price must be positive and finite";
    }
    return null;
  }

  private normalizePrice(price: number): number {
    const ticks = Math.round(price / this.policies.tickSize);
    return round(ticks * this.policies.tickSize);
  }

  private match(incoming: Order): Trade[] {
    const opposite = incoming.side === "buy" ? this.asks : this.bids;
    const trades: Trade[] = [];
    while (incoming.remaining > 0 && opposite.length > 0) {
      const maker = opposite[0]!;
      if (!this.crosses(incoming, maker)) break;
      const quantity = Math.min(incoming.remaining, maker.remaining);
      const price = maker.price;
      incoming.remaining -= quantity;
      maker.remaining -= quantity;
      const trade = this.createTrade(incoming, maker, price, quantity);
      trades.push(trade);
      this.emit({
        eventType: incoming.remaining > 0 ? "PartialFill" : "Trade",
        agentId: incoming.agentId,
        orderId: incoming.id,
        parentOrderId: maker.id,
        side: incoming.side,
        price: trade.price,
        quantity: trade.quantity,
        remainingQuantity: incoming.remaining,
        reasonCode: "price_time_match",
        metadata: {
          tradeId: trade.id,
          makerOrderId: trade.makerOrderId,
          takerOrderId: trade.takerOrderId,
        },
      });
      if (maker.remaining === 0) opposite.shift();
    }
    return trades;
  }

  private crosses(incoming: Order, maker: Order): boolean {
    if (incoming.type === "market") return true;
    return incoming.side === "buy"
      ? incoming.price >= maker.price
      : incoming.price <= maker.price;
  }

  private createTrade(
    incoming: Order,
    maker: Order,
    price: number,
    quantity: number,
  ): Trade {
    const buyer = incoming.side === "buy" ? incoming : maker;
    const seller = incoming.side === "sell" ? incoming : maker;
    const makerSide = maker.side;
    const notional = price * quantity;
    const fee = (kind: "maker" | "taker"): number =>
      round(
        (notional *
          (kind === "maker"
            ? this.policies.makerFeeBps
            : this.policies.takerFeeBps)) /
          10_000,
      );
    return {
      id: `T${++this.tradeCounter}`,
      tick: this.tick,
      price,
      quantity,
      makerOrderId: maker.id,
      takerOrderId: incoming.id,
      makerSide,
      buyerId: buyer.agentId,
      sellerId: seller.agentId,
      buyerKind: buyer.agentKind,
      sellerKind: seller.agentKind,
      buyerFee: fee(buyer.id === maker.id ? "maker" : "taker"),
      sellerFee: fee(seller.id === maker.id ? "maker" : "taker"),
    };
  }

  private sideOrders(side: Side): Order[] {
    return side === "buy" ? this.bids : this.asks;
  }

  private sortSide(side: Side): void {
    this.sideOrders(side).sort((left, right) => {
      const priceDifference =
        side === "buy" ? right.price - left.price : left.price - right.price;
      return priceDifference || left.sequence - right.sequence;
    });
  }

  private levels(orders: Order[], levelCount: number): BookLevel[] {
    const values: BookLevel[] = [];
    for (const order of orders) {
      const existing = values.find((level) => level.price === order.price);
      if (existing) {
        existing.quantity += order.remaining;
        existing.orderCount += 1;
      } else if (values.length < levelCount) {
        values.push({
          price: order.price,
          quantity: order.remaining,
          orderCount: 1,
        });
      }
    }
    return values;
  }

  private queue(orders: Order[]) {
    return orders.map((order, index) => ({
      orderId: order.id,
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
      ageTicks: Math.max(0, this.tick - order.createdTick),
    }));
  }

  private emit(
    event: Omit<CoreExchangeEvent, "sequenceNumber" | "simulationTimestamp">,
  ): void {
    this.events.push({
      ...event,
      sequenceNumber: ++this.eventCounter,
      simulationTimestamp: this.tick,
    });
  }
}

export const defaultPolicies = (): PolicyConfig => ({
  circuitBreaker: true,
  circuitBreakerThresholdPct: 4,
  haltTicks: 12,
  speedBumpTicks: 1,
  minimumRestingTicks: 1,
  maxCancelToTradeRatio: 20,
  tickSize: 0.01,
  makerFeeBps: -0.1,
  takerFeeBps: 0.8,
});

export const participantLabel = (kind: AgentKind): string =>
  ({
    "market-maker": "Market maker",
    noise: "Retail flow",
    momentum: "Momentum fund",
    value: "Value fund",
    institutional: "Institutional desk",
    latency: "Low-latency trader",
  })[kind];
