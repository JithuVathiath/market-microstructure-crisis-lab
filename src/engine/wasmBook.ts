import init, { ExchangeCore } from "../wasm/pkg/market_exchange_core.js";
import type { InitInput } from "../wasm/pkg/market_exchange_core.js";
import type {
  CancellationResult,
  ExchangeBook,
  SubmissionResult,
} from "./orderBook";
import type {
  BookView,
  CoreExchangeEvent,
  Order,
  OrderRequest,
  PolicyConfig,
} from "./types";

let initialized = false;

export const initializeExchangeWasm = async (
  module?: InitInput,
): Promise<void> => {
  if (initialized) return;
  await init(module === undefined ? undefined : { module_or_path: module });
  initialized = true;
};

const coreConfig = (policies: PolicyConfig) => ({
  tickSize: policies.tickSize,
  makerFeeBps: policies.makerFeeBps,
  takerFeeBps: policies.takerFeeBps,
  minimumRestingTicks: policies.minimumRestingTicks,
});

export class WasmOrderBook implements ExchangeBook {
  private readonly core: ExchangeCore;

  constructor(policies: PolicyConfig) {
    if (!initialized) {
      throw new Error("Rust exchange core must be initialized before use");
    }
    this.core = new ExchangeCore(JSON.stringify(coreConfig(policies)));
  }

  setTick(tick: number): void {
    this.core.set_tick(BigInt(tick));
  }

  setPolicies(policies: PolicyConfig): void {
    this.core.set_config(JSON.stringify(coreConfig(policies)));
  }

  submit(request: OrderRequest): SubmissionResult {
    return JSON.parse(
      this.core.submit(JSON.stringify(request)),
    ) as SubmissionResult;
  }

  cancel(orderId: string, agentId: string): CancellationResult {
    return JSON.parse(this.core.cancel(orderId, agentId)) as CancellationResult;
  }

  replace(
    orderId: string,
    agentId: string,
    price: number,
    quantity: number,
  ): SubmissionResult {
    return JSON.parse(
      this.core.replace(orderId, agentId, price, BigInt(quantity)),
    ) as SubmissionResult;
  }

  getOrders(agentId?: string): Order[] {
    return JSON.parse(this.core.orders(agentId)) as Order[];
  }

  view(levelCount = 8): BookView {
    return JSON.parse(this.core.view(levelCount)) as BookView;
  }

  halt(reason: string): void {
    this.core.halt(reason);
  }

  resume(reason: string): void {
    this.core.resume(reason);
  }

  drainCoreEvents(): CoreExchangeEvent[] {
    return JSON.parse(this.core.drain_events()) as CoreExchangeEvent[];
  }
}
