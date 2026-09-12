import type { CoreExchangeEvent, MarketEvent, MarketEventType } from "./types";

type EventDraft = Omit<
  MarketEvent,
  "sequenceNumber" | "exchangeTimestamp" | "simulationTimestamp"
> & {
  simulationTimestamp: number;
};

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT_64 = 0xffffffffffffffffn;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
};

const updateHash = (hash: bigint, input: string): bigint => {
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * FNV_PRIME) & UINT_64;
  }
  return hash;
};

const canonicalEvent = (event: MarketEvent): string =>
  `${JSON.stringify(canonicalize(event))}\n`;

export const hashEventStream = (events: MarketEvent[]): string => {
  let hash = FNV_OFFSET;
  for (const event of events) hash = updateHash(hash, canonicalEvent(event));
  return hash.toString(16).padStart(16, "0");
};

export class EventStore {
  private readonly stream: MarketEvent[] = [];
  private rollingHash = FNV_OFFSET;

  append(draft: EventDraft): MarketEvent {
    const sequenceNumber = this.stream.length + 1;
    const event: MarketEvent = {
      ...draft,
      sequenceNumber,
      exchangeTimestamp: draft.simulationTimestamp * 1_000_000 + sequenceNumber,
    };
    this.stream.push(event);
    this.rollingHash = updateHash(this.rollingHash, canonicalEvent(event));
    return event;
  }

  ingestCore(events: CoreExchangeEvent[]): MarketEvent[] {
    return events.map((event) =>
      this.append({
        simulationTimestamp: event.simulationTimestamp,
        eventType: event.eventType as MarketEventType,
        agentId: event.agentId,
        orderId: event.orderId,
        parentOrderId: event.parentOrderId,
        side: event.side,
        price: event.price,
        quantity: event.quantity,
        remainingQuantity: event.remainingQuantity,
        reasonCode: event.reasonCode,
        metadata: {
          ...event.metadata,
          coreSequenceNumber: event.sequenceNumber,
        },
      }),
    );
  }

  all(): MarketEvent[] {
    return this.stream.map((event) => ({
      ...event,
      metadata: { ...event.metadata },
    }));
  }

  since(sequenceNumber: number): MarketEvent[] {
    return this.stream
      .filter((event) => event.sequenceNumber > sequenceNumber)
      .map((event) => ({ ...event, metadata: { ...event.metadata } }));
  }

  recent(count: number): MarketEvent[] {
    return this.stream.slice(-count).map((event) => ({
      ...event,
      metadata: { ...event.metadata },
    }));
  }

  latestSequenceNumber(): number {
    return this.stream.at(-1)?.sequenceNumber ?? 0;
  }

  hash(): string {
    return this.rollingHash.toString(16).padStart(16, "0");
  }
}
