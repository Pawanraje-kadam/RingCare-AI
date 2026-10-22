import { z } from "zod";
import { EVENTS_STORAGE_KEY } from "@/lib/constants/settings";
import { isoDateTimeSchema, ringCareEventSchema } from "@/lib/validation/schemas";
import { getBrowserStorage, removeStoredValue, writeStoredValue } from "@/lib/storage/safe-storage";
import type { RingCareEvent } from "@/types/events";

/** A storage seam: browser-local today, a database later, without touching UI logic. */
export interface EventLoadResult {
  events: RingCareEvent[];
  found: boolean;
  storageAvailable: boolean;
  droppedInvalid: number;
  corrupted: boolean;
}

export interface EventStorage {
  load(): EventLoadResult;
  save(events: RingCareEvent[]): { ok: boolean; message?: string };
  clear(): { ok: boolean; message?: string };
}

export const storedEventsEnvelopeSchema = z.object({
  version: z.literal(1),
  updatedAt: isoDateTimeSchema,
  events: z.array(z.unknown()).max(2000),
});

export function sortEventsNewestFirst(events: RingCareEvent[]): RingCareEvent[] {
  return [...events].sort((a, b) => {
    const diff = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    if (diff !== 0) return diff;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

export function applyRetention(
  events: RingCareEvent[],
  retentionLimit: number,
): RingCareEvent[] {
  return sortEventsNewestFirst(events).slice(0, Math.max(1, retentionLimit));
}

export function mergeEvents(
  existing: RingCareEvent[],
  incoming: RingCareEvent[],
  retentionLimit: number,
): RingCareEvent[] {
  const byId = new Map<string, RingCareEvent>();
  for (const event of existing) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);
  return applyRetention([...byId.values()], retentionLimit);
}

export function replaceEvent(
  events: RingCareEvent[],
  id: string,
  updater: (event: RingCareEvent) => RingCareEvent,
): RingCareEvent[] {
  return events.map((event) => (event.id === id ? updater(event) : event));
}

export function removeEventById(events: RingCareEvent[], id: string): RingCareEvent[] {
  return events.filter((event) => event.id !== id);
}

export const browserEventStorage: EventStorage = {
  load() {
    const storage = getBrowserStorage();
    if (!storage) {
      return { events: [], found: false, storageAvailable: false, droppedInvalid: 0, corrupted: false };
    }
    const raw = storage.getItem(EVENTS_STORAGE_KEY);
    if (raw === null) {
      return { events: [], found: false, storageAvailable: true, droppedInvalid: 0, corrupted: false };
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      const envelope = storedEventsEnvelopeSchema.safeParse(parsed);
      if (!envelope.success) {
        return { events: [], found: true, storageAvailable: true, droppedInvalid: 0, corrupted: true };
      }
      const valid: RingCareEvent[] = [];
      let droppedInvalid = 0;
      for (const candidate of envelope.data.events) {
        const result = ringCareEventSchema.safeParse(candidate);
        if (result.success) valid.push(result.data);
        else droppedInvalid += 1;
      }
      return {
        events: sortEventsNewestFirst(valid),
        found: true,
        storageAvailable: true,
        droppedInvalid,
        corrupted: false,
      };
    } catch {
      return { events: [], found: true, storageAvailable: true, droppedInvalid: 0, corrupted: true };
    }
  },

  save(events) {
    const result = writeStoredValue(EVENTS_STORAGE_KEY, {
      version: 1,
      updatedAt: new Date().toISOString(),
      events,
    });
    return result.available
      ? { ok: true }
      : { ok: false, message: result.message ?? "Demo records could not be saved." };
  },

  clear() {
    const result = removeStoredValue(EVENTS_STORAGE_KEY);
    return result.available
      ? { ok: true }
      : { ok: false, message: result.message ?? "Demo records could not be cleared." };
  },
};

/** Used in tests and as a fallback when browser storage is unavailable. */
export class InMemoryEventStorage implements EventStorage {
  private events: RingCareEvent[] = [];
  private found = false;

  constructor(initial: RingCareEvent[] = []) {
    this.events = sortEventsNewestFirst(initial);
    this.found = initial.length > 0;
  }

  load(): EventLoadResult {
    return {
      events: this.events,
      found: this.found,
      storageAvailable: true,
      droppedInvalid: 0,
      corrupted: false,
    };
  }

  save(events: RingCareEvent[]) {
    this.events = sortEventsNewestFirst(events);
    this.found = true;
    return { ok: true };
  }

  clear() {
    this.events = [];
    this.found = true;
    return { ok: true };
  }
}
