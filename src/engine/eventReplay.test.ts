import { describe, expect, it } from "vitest";

import { reconstructBook } from "./eventReplay";
import { createDefaultConfig, MarketSimulation } from "./simulation";

describe("event-sourced market reconstruction", () => {
  it("reconstructs the final production book from the canonical event stream", () => {
    const simulation = new MarketSimulation({
      ...createDefaultConfig("flash-crash"),
      maxTicks: 30,
    });
    const final = simulation.runToEnd();
    expect(reconstructBook(simulation.eventStream())).toEqual(final.book);
  });

  it("reconstructs earlier sequence numbers without future orders", () => {
    const simulation = new MarketSimulation({
      ...createDefaultConfig("stable"),
      maxTicks: 5,
    });
    simulation.runToEnd();
    const events = simulation.eventStream();
    const firstQuote = events.find(
      (event) => event.eventType === "QuoteUpdated",
    )!;
    const before = reconstructBook(events, firstQuote.sequenceNumber - 1);
    const after = reconstructBook(events, firstQuote.sequenceNumber);
    expect(before.bidQueue.length + before.askQueue.length).toBe(0);
    expect(after.bidQueue.length + after.askQueue.length).toBe(1);
  });
});
