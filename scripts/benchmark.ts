import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { EventStore } from "../src/engine/eventStore";
import { reconstructBook } from "../src/engine/eventReplay";
import { defaultPolicies } from "../src/engine/orderBook";
import { initializeExchangeWasm, WasmOrderBook } from "../src/engine/wasmBook";

const wasmPath = new URL(
  "../src/wasm/pkg/market_exchange_core_bg.wasm",
  import.meta.url,
);
const wasmBytes = await readFile(wasmPath);
await initializeExchangeWasm(wasmBytes);

const book = new WasmOrderBook({
  ...defaultPolicies(),
  minimumRestingTicks: 0,
});
const orderCount = 10_000;
const orderStartedAt = performance.now();
for (let index = 0; index < orderCount / 2; index += 1) {
  book.setTick(index);
  book.submit({
    agentId: `maker-${index % 10}`,
    agentKind: "market-maker",
    side: "sell",
    type: "limit",
    price: 100 + (index % 5) * 0.01,
    quantity: 1,
  });
  book.submit({
    agentId: `taker-${index % 10}`,
    agentKind: "institutional",
    side: "buy",
    type: "market",
    quantity: 1,
  });
}
const orderElapsedMs = performance.now() - orderStartedAt;

const eventStore = new EventStore();
eventStore.ingestCore(book.drainCoreEvents());
const events = eventStore.all();
const replayPasses = 50;
const replayStartedAt = performance.now();
for (let pass = 0; pass < replayPasses; pass += 1) {
  reconstructBook(events);
}
const replayElapsedMs = performance.now() - replayStartedAt;

console.log(
  JSON.stringify(
    {
      engine: "rust-wasm",
      wasmBytes: wasmBytes.byteLength,
      submittedOrders: orderCount,
      coreEvents: events.length,
      orderElapsedMs: Number(orderElapsedMs.toFixed(1)),
      ordersPerSecond: Math.round(orderCount / (orderElapsedMs / 1_000)),
      replayPasses,
      replayElapsedMs: Number(replayElapsedMs.toFixed(1)),
      replayEventsPerSecond: Math.round(
        (events.length * replayPasses) / (replayElapsedMs / 1_000),
      ),
      finalEventHash: eventStore.hash(),
    },
    null,
    2,
  ),
);
