import type { RingCareEvent } from "@/types/events";
import { parseIncomingEvent } from "@/lib/validation/schemas";

/**
 * Ring integration boundary.
 *
 * The current release ships only a simulated adapter. A future authorized Ring
 * integration must implement this interface and normalize events into the same
 * validated domain model before business rules or AI analysis run.
 *
 * No undocumented/private Ring API, credential collection, scraping, or
 * authentication bypass is supported by this project.
 */

export type RingAdapterKind = "simulated" | "live";

export interface NormalizeResult {
  success: boolean;
  event?: RingCareEvent;
  error?: string;
}

export interface RingEventAdapter {
  readonly id: string;
  readonly kind: RingAdapterKind;
  readonly displayName: string;
  isAvailable(): Promise<boolean>;
  /** Convert one raw source record into a validated RingCare event. */
  normalize(raw: unknown): NormalizeResult;
}

/**
 * Simulated adapter: accepts only records that explicitly declare themselves
 * simulated. It reuses the same validation path a future adapter must use.
 */
export class SimulatedRingAdapter implements RingEventAdapter {
  readonly id = "simulated-ring-v1";
  readonly kind = "simulated" as const;
  readonly displayName = "Simulated Ring-compatible source";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  normalize(raw: unknown): NormalizeResult {
    const result = parseIncomingEvent(raw);
    if (!result.success) {
      return { success: false, error: result.error.message };
    }
    if (result.data.source !== "simulated_ring" || !result.data.simulated) {
      return {
        success: false,
        error: "The simulated adapter only accepts explicitly simulated events.",
      };
    }
    return { success: true, event: result.data };
  }
}

export const simulatedRingAdapter = new SimulatedRingAdapter();

/** Live integration is intentionally unavailable until an authorized API exists. */
export const LIVE_RING_INTEGRATION = {
  available: false,
  reason:
    "No authorized, documented Ring event API is integrated. RingCare AI does not use private endpoints, scraping, or account credentials.",
  requirements: [
    "Official, documented API access with permission to read doorbell/camera events",
    "A supported authorization flow with user consent and revocable tokens",
    "Documented event payloads and rate limits",
    "Verification that the integration complies with Ring's terms and the project's rules",
    "A server-side token store and webhook/queue architecture appropriate for Vercel",
  ],
} as const;
