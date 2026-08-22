# Bucket Logistics Coordinator Screen — Design (2026-08-22)

Replace the read-only, driver-facing `bucket-logistics.tsx` screen with a coordinator-facing
one: today's trips (schedule + trips visibility), with Dispatch/Receive actions. No new data
model — this consumes the `Bucket Request Trip` system already live on kaitet-group (built by
you, Aug 2026: `transfer-control` desktop page, `getTransferScheduleData`, `saveBucketTrip`,
`Bucket Logistics Route`). Two small backend additions close the one real gap (no terminal
"received" state).

## Decisions
- **Persona**: coordinator replaces driver as this screen's user. One screen, not two.
- **Trip shape**: matches `Bucket Request Trip` — one truck can visit multiple farms per trip
  (`collection_order` + per-row `farm` on `Bucket Request Trip Order`).
- **Dispatch trigger**: driven by the packhouse schedule (`Packhouse Schedule` /
  `Packhouse Schedule Order`) via the existing `team`/`schedule` fields on each order — shown
  as context, not recomputed here.
- **Scope**: operate today's plan, not build it. Route/vehicle assignment and
  "⚡ Distribute across teams" stay desktop-only (`transfer-control`). Mobile does not create,
  edit, or delete trip contents — only advances a trip's status.
- **Receive semantics**: status + timestamp only. Does **not** touch `Pick List Item` bucket
  flags (`custom_awaiting_transfer` / `custom_loaded_in_trolley` / `custom_in_transit` /
  `custom_shelved`) — matches the existing "trips should not interfere with the build"
  constraint from `transfer-control`'s own code (2026-08-07). Physical bucket state keeps
  being set however it's set today, independent of trip status.

## Existing system this builds on (no changes)
- `Bucket Request Trip` (module Upande Kaitet): `trip_date`, `vehicle`, `farm`, `status`
  (`Draft`/`Scheduled`/`Dispatched`), `total_buckets`, `total_stems`, `capacity_buckets`,
  `collection_order`, `notes`, child table `orders` → `Bucket Request Trip Order`
  (`order_pick_list`, `order_name`, `customer`, `farm`, `varieties`, `buckets`, `stems`,
  `full_farm_buckets`, `is_partial`).
- `getTransferScheduleData` (Server Script, API) — the one read call this screen needs.
  Returns, for a delivery window: `orders` (per OPL, broken down by farm → variety, with
  `team`/`schedule` priority), `vehicles`, `trips` (today's `Bucket Request Trip` docs + their
  order rows), `truck_status` (per-vehicle live position from `custom_transit_truck`:
  awaiting/loaded/in_transit/shelved counts + `loading_pct` + `location`), `distances`,
  `routes` (today's `Bucket Logistics Route` per vehicle). No new read endpoint needed.
- `saveBucketTrip` / `deleteBucketTrip` — desktop planner's write path. Untouched by this work.

## Backend additions (small, additive)
1. `Bucket Request Trip.status` — add `Received` as a fourth Select option
   (`Draft\nScheduled\nDispatched\nReceived`). Add two Datetime fields: `dispatched_at`,
   `received_at`. **Open item**: do this via the Frappe Desk UI (DocType field editor) rather
   than an automated API edit — safer for a live custom doctype's schema, and it's a 30-second
   change for someone with System Manager access.
2. `dispatchBucketTrip` (Server Script, API, module Upande Kaitet) — args `{name}`. Sets
   `status='Dispatched'`, `dispatched_at=now`. Rejects if current status isn't `Draft`/`Scheduled`.
3. `receiveBucketTrip` (Server Script, API, module Upande Kaitet) — args `{name}`. Sets
   `status='Received'`, `received_at=now`. Rejects if current status isn't `Dispatched`.
   Both mirror `Delete Bucket Trip`'s minimal style — no stock/bucket-flag side effects.

## App changes
- **API** (`karen-bucket-logistics-api.ts`, replacing current single-call version):
  `fetch(deliveryDate?)` → `GET getTransferScheduleData`; `dispatch(name)` → `POST
  dispatchBucketTrip`; `receive(name)` → `POST receiveBucketTrip`.
- **Store** (`karen-bucket-logistics-store.ts`): derives three groups from `trips` +
  `truck_status` + `orders` — **Planned** (Draft/Scheduled), **On the road** (Dispatched),
  **Back** (Received). Per trip: vehicle, capacity fill %, ordered stops (farm → buckets →
  order names, from `orders` child rows), status pills (from `truck_status` matched by
  vehicle, same awaiting/loaded/in_transit/shelved shape as desktop's `statusPillsHtml`),
  and a "why now" line per stop's order using `team`/`schedule` from the matching entry in
  the feed's top-level `orders` array.
- **Screen** (`features/bucket-logistics/`): split into `TripListScreen` (three grouped
  sections) + `TripCard` (capacity bar, stops, status pills, action button) + `StatusPills`
  (shared, extracted — desktop has one already, this is its RN equivalent). Action button is
  contextual: Draft/Scheduled → **Dispatch**; Dispatched → **Receive**; Received → none
  (history only, today's list — no separate archive view in v1).
- **Optimistic UI**: Dispatch/Receive move the trip card to its new group immediately;
  roll back + toast on API failure (existing `mapAxiosError` pattern).
- Route/nav: keep `bucket-logistics` route name; update `navigation.ts` label if needed
  (e.g. "Bucket Logistics" → "Logistics" or keep as-is — cosmetic, decide at implementation).

## Error handling
- `dispatchBucketTrip`/`receiveBucketTrip` invalid-transition errors surface as a toast, trip
  stays in its current group (no optimistic move on a rejected transition).
- Empty/no-trips-today state: explicit empty message per group, not a blank screen.

## Testing
- Store: unit tests against fixture JSON shaped like a real `getTransferScheduleData`
  response — grouping, capacity %, stop ordering, status-pill mapping.
- Dispatch/Receive: mocked API, assert optimistic move + rollback-on-error paths.
- No new backend tests written by this repo (Server Scripts aren't under this repo's test
  harness) — verify manually against kaitet-group after the two scripts are created.

## Revision (2026-08-22, post-implementation)

The v1 build above missed something the coordinator actually needs first thing every
morning: visibility into **today's routes** (what the sales team already planned per truck),
and a clear **sequence** across trips ("which one goes out first"). Both were already in
`getTransferScheduleData`'s response (`routes`) or trivially derivable from data already in
scope (`orders[].schedule`) — this was a scoping miss in the design above, not a missing
backend capability. Corrected in the same implementation pass:

- Screen split into two tabs: **Today's Routes** (default — one card per truck's planned
  route, from `Bucket Logistics Route` via `getTransferScheduleData.routes`, flagging
  vehicles with a trip but no route instead of hiding them) and **Trips**.
- Trips are numbered **Trip 1, Trip 2, ...** globally, ascending by the lowest
  `packhouse-schedule` sequence number among each trip's cargo — independent of status.
- `dispatched_at`/`received_at` added to `Bucket Request Trip` via two `Custom Field`
  records (not a direct DocType field edit — safer, fully additive, no risk to the
  existing field table). `getTransferScheduleData` updated to select both.
- Receive action relabeled **"End Trip"**; once a trip is Received its card shows
  **turnaround time** (`dispatched_at` → `received_at`) instead of an action button.

## Out of scope (v2 / deferred)
- **Per-stop bottleneck detection** ("which farm on this route is holding things up") —
  `getFarmPlannedTrips` already computes this but is farm-scoped; a fleet-wide version needs
  a new endpoint (same computation, drop the farm filter). Real value, not blocking v1.
- **Farm-attendant Requests/Trolley/In-Transit workflow** (scanning buckets onto a trolley,
  setting `custom_transit_truck` + the `custom_*` stage flags on `Pick List Item`) — this is
  the thing referenced in `transfer-control`'s own code comment as "the Karen app['s]
  workflow that actually moves flowers." Confirmed: this app, not built yet. Different
  persona (farm/cold-store attendant, not the logistics coordinator), different device
  context — needs its own brainstorming pass, not folded into this spec.
- Route building / vehicle assignment / "Distribute across teams" on mobile.
- Historical/past-days trip view (today only, matching `getTransferScheduleData`'s own
  today-only `trips` scoping).
