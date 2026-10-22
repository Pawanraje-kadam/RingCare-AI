# Ring integration boundary

RingCare AI currently runs entirely on **simulated Ring-compatible events**. No Ring
account, camera, or private API is connected.

## Why there is no live adapter yet

A live integration must use an official, documented, authorized mechanism that
provides access to doorbell and camera events. This repository does not fabricate
endpoints, does not use undocumented private APIs, and does not collect or store
Ring account credentials. Before writing a live adapter, verify:

1. The official Ring developer documentation and terms permit programmatic event
   access for your use case.
2. The OAuth/authorization flow is supported and token storage can be made
   server-side and revocable.
3. Event payloads include the fields needed for this domain model (time, type,
   location, optional duration, optional metadata).
4. Webhook delivery, polling limits, rate limits, and retention rules are documented.
5. Privacy, consent, and household-member expectations are addressed.

If those conditions are not met, keep the simulated adapter. The app remains fully
usable in demo mode.

## Contract

`RingEventAdapter` in `adapter.ts` defines the seam:

- `kind`: `simulated` or `live`
- `isAvailable()`
- `normalize(raw)`: converts raw source data into the validated `RingCareEvent`

Future additions should:

1. Implement a `LiveRingAdapter` that fetches from an authorized service.
2. Normalize raw payloads into the existing event schema.
3. Validate with Zod and boundary limits (timestamp sanity, duration bounds,
   description length, supported event types).
4. Never pass raw credentials or live video/audio to the browser or Gemini.
5. Route normalized events through the same deterministic rule engine and optional
   Gemini explanation layer.
6. Add webhook signature verification, replay protection, and a durable queue/store
   before production use.

The API boundary at `POST /api/events` accepts one validated event and rejects
non-simulated sources. It is a placeholder for a future authorized adapter, not a
claim that Ring connectivity exists.
