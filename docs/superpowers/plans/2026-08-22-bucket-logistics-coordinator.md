# Bucket Logistics Coordinator Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only, driver-facing `bucket-logistics` screen with a coordinator-facing
one showing today's `Bucket Request Trip`s (schedule + trip visibility) with Dispatch/Receive
actions, backed by the `getTransferScheduleData` feed that already powers the desktop
`transfer-control` page on kaitet-group.

**Architecture:** No new data model. Two new thin Server Scripts (`dispatchBucketTrip`,
`receiveBucketTrip`) close the one real gap — `Bucket Request Trip.status` has no terminal
"received" state today. The app layer is a straight rewrite of the existing
`karen-bucket-logistics-*` files: API → Zustand store (pure derivation functions + optimistic
writes) → two new presentational components → the screen.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / TypeScript / Zustand / axios. Backend: Frappe
Server Scripts on kaitet-group, deployed via the `frappe_assistant_core` MCP endpoint (this
team's established practice — see spec).

**Spec:** `docs/superpowers/specs/2026-08-22-bucket-logistics-coordinator-design.md`

## Global Constraints
- Coordinator replaces driver as this screen's sole persona — no separate driver view.
- Mobile **operates** today's plan; it never builds routes, assigns vehicles, or runs
  "Distribute across teams" (desktop-only, unchanged).
- Receive is status + timestamp only — never touches `Pick List Item` bucket flags
  (`custom_awaiting_transfer`/`custom_loaded_in_trolley`/`custom_in_transit`/`custom_shelved`).
- `saveBucketTrip` / `deleteBucketTrip` (the desktop planner's write path) are untouched by
  this work.
- Route name stays `bucket-logistics`; exported screen component stays named
  `KarenBucketLogisticsScreen` (imported by `app/bucket-logistics.tsx:3`).
- Backend endpoint: `https://kaitet-group.upande.com/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp`,
  auth header `Authorization: token $KAITET_API_KEY`. Export `KAITET_API_KEY` in your shell
  before running any backend task's commands (`export KAITET_API_KEY=<key>:<secret>`) — the
  literal key is deliberately not written into this git-tracked file.

---

## File Structure

```
package.json                                              modify (add jest deps + test script)
jest.config.js                                             create
tsconfig.json                                              modify (add "types": ["jest"])
__tests__/karen-bucket-logistics-store-test.ts             create
src/tenants/karen/api/karen-bucket-logistics-api.ts        rewrite
src/tenants/karen/state/karen-bucket-logistics-store.ts    rewrite
src/tenants/karen/features/bucket-logistics/
  StatusPills.tsx                                          create
  TripCard.tsx                                             create
  BucketLogisticsScreen.tsx                                rewrite
```

No changes to `app/bucket-logistics.tsx`, `navigation.ts`, `types.ts`, or `SideMenu.tsx` — the
route/label wiring for `bucket-logistics` already exists and doesn't change.

---

### Task 1: Add Jest test tooling

Nothing in this repo runs a test today (no `test` script, no jest config, no test files). This
sets up the minimum harness the store tests in Task 6 need — pure-logic tests only, no
`@testing-library/react-native`, since nothing here needs to render a component to be tested.

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`
- Modify: `tsconfig.json`

**Interfaces:** none (tooling only).

- [ ] **Step 1: Install jest-expo**

Run:
```bash
npx expo install jest-expo jest @types/jest --dev
```
This adds `jest-expo`, `jest`, and `@types/jest` to `devDependencies` at versions matched to
the installed Expo SDK (54.x) and updates the lockfile. Don't hand-pick versions.

- [ ] **Step 2: Add the test script**

In `package.json`, inside `"scripts"`, add:
```json
    "test": "jest --watchAll"
```
(Keep it alongside the existing `start`/`android`/`ios`/`web`/`lint` scripts — don't reorder
the others.)

- [ ] **Step 3: Create the Jest config**

Create `jest.config.js`. `jest-expo`'s preset doesn't read `tsconfig.json`'s `"paths"` — this
repo has no `babel.config.js` (the `@/*` alias is resolved by Expo's Metro config directly from
`tsconfig.json`, which only applies to Metro, not Jest) — so `moduleNameMapper` must be added
explicitly or every `@/...` import in a test (or in a module a test imports) fails to resolve:
```js
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)"
  ]
};
```

- [ ] **Step 4: Tell TypeScript about Jest globals**

In `tsconfig.json`, add `"types": ["jest"]` inside `compilerOptions`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"],
    "paths": {
      "@/*": [
        "./*"
      ]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}
```

- [ ] **Step 5: Verify the harness loads cleanly**

Run: `npx jest`
Expected: exits cleanly reporting no test files found (something like `No tests found, exiting
with code 1` is fine here — that confirms config/preset load without error; a crash/stack
trace is not fine and must be fixed before continuing).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json jest.config.js tsconfig.json
git commit -m "test: add jest-expo test harness

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2 (MANUAL — human action, not agent-executed): Add trip completion fields on kaitet-group

`frappe.db.set_value()` (used by the two new Server Scripts in Tasks 3-4) writes directly to
SQL columns and skips document validation — so it will hard-fail with an "unknown column"
error unless these two fields actually exist on the doctype first. This step must happen
**before** Tasks 3-4 are verified end-to-end (the scripts can be *written* in either order, but
won't *work* until this is done).

**This is a live production Frappe schema change — do it yourself via the Desk UI, not via an
automated API call.** Log into kaitet-group as a System Manager:

1. Go to `Bucket Request Trip` in the DocType list → open it in the DocType editor (or
   Desk → Customize Form isn't applicable here since this is a fully custom doctype — edit
   the DocType directly).
2. Add two new fields, placed after `capacity_buckets`:
   - Label: `Dispatched At`, Fieldname: `dispatched_at`, Type: `Datetime`
   - Label: `Received At`, Fieldname: `received_at`, Type: `Datetime`
3. (Recommended, not blocking) On the existing `status` Select field, add `Received` as a
   fourth option, so the options string reads: `Draft\nScheduled\nDispatched\nReceived`. This
   only affects the Desk UI dropdown/list-view coloring — the API scripts below work with or
   without it, since `db.set_value` doesn't validate Select options.
4. Save. Confirm no error.

- [ ] Done — confirmed `dispatched_at`, `received_at` exist as Datetime fields on
      `Bucket Request Trip` (checked via Desk or via `get_doctype_info` — see Task 3 Step 1).

---

### Task 3: Create the `dispatchBucketTrip` Server Script

**Files:** none in this repo — this creates a document on the live kaitet-group Frappe
instance via the FAC MCP endpoint.

**Interfaces:**
- Produces: `POST /api/method/dispatchBucketTrip` with body `{ name: string }` (a
  `Bucket Request Trip` name). Response body: `{ message: { status: 'success'|'error',
  message?: string, name?: string, trip_status?: string } }`. This is what Task 5's
  `karenBucketLogisticsApi.dispatch()` calls.

- [ ] **Step 1: Confirm the prerequisite fields exist**

```bash
EP='https://kaitet-group.upande.com/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp'
AUTH="Authorization: token $KAITET_API_KEY"
curl -s -X POST "$EP" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_doctype_info","arguments":{"doctype":"Bucket Request Trip"}}}' \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
inner=json.loads(d['result']['content'][0]['text'])
names=[f['fieldname'] for f in inner['result']['fields']]
print('dispatched_at' in names, 'received_at' in names)
"
```
Expected: `True True`. If either is `False`, stop and complete Task 2 first.

- [ ] **Step 2: Create the Server Script document**

```bash
EP='https://kaitet-group.upande.com/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp'
AUTH="Authorization: token $KAITET_API_KEY"
SCRIPT='name = frappe.form_dict.get("name")\nif not name or not frappe.db.exists("Bucket Request Trip", name):\n    frappe.response["message"] = {"status": "error", "message": "Trip not found."}\nelse:\n    current = frappe.db.get_value("Bucket Request Trip", name, "status")\n    if current not in ("Draft", "Scheduled"):\n        frappe.response["message"] = {\n            "status": "error",\n            "message": "Trip is " + str(current) + "; only Draft/Scheduled trips can be dispatched.",\n        }\n    else:\n        frappe.db.set_value("Bucket Request Trip", name, {\n            "status": "Dispatched",\n            "dispatched_at": frappe.utils.now(),\n        })\n        frappe.db.commit()\n        frappe.response["message"] = {"status": "success", "name": name, "trip_status": "Dispatched"}\n'
python3 -c "
import json, os
payload = {
    'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call',
    'params': {
        'name': 'create_document',
        'arguments': {
            'doctype': 'Server Script',
            'data': {
                'name': 'Dispatch Bucket Trip',
                'script_type': 'API',
                'api_method': 'dispatchBucketTrip',
                'module': 'Upande Kaitet',
                'disabled': 0,
                'allow_guest': 0,
                'script': os.environ['SCRIPT_BODY'],
            },
        },
    },
}
print(json.dumps(payload))
" > /tmp/dispatch_trip_payload.json
SCRIPT_BODY="$SCRIPT" python3 -c "
import json, os
d = json.load(open('/tmp/dispatch_trip_payload.json'))
d['params']['arguments']['data']['script'] = os.environ['SCRIPT_BODY']
print(json.dumps(d))
" > /tmp/dispatch_trip_payload2.json
curl -s -X POST "$EP" -H "$AUTH" -H 'Content-Type: application/json' \
  -d @/tmp/dispatch_trip_payload2.json
```
Expected: a JSON response with no `"error"` key and `isError: false` (or the FAC
`create_document` result showing `"success": true`). If it reports the document already
exists, that means this task already ran — skip to Step 3 to verify content instead of
re-creating.

- [ ] **Step 3: Verify it saved correctly**

```bash
EP='https://kaitet-group.upande.com/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp'
AUTH="Authorization: token $KAITET_API_KEY"
curl -s -X POST "$EP" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_document","arguments":{"doctype":"Server Script","name":"Dispatch Bucket Trip"}}}' \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
inner=json.loads(d['result']['content'][0]['text'])
print(inner['result']['data']['api_method'], inner['result']['data']['disabled'])
"
```
Expected: `dispatchBucketTrip 0`.

- [ ] **Step 4: Manual functional check (no automated harness for this — it's a live backend)**

Find a real `Bucket Request Trip` in `Draft` status on kaitet-group today (built via the
desktop `transfer-control` → Plan trucks → Apply), then:
```bash
curl -s -X POST 'https://kaitet-group.upande.com/api/method/dispatchBucketTrip' \
  -H 'Authorization: token $KAITET_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"name":"<real trip name>"}'
```
Expected: `{"message": {"status": "success", "name": "<trip name>", "trip_status":
"Dispatched"}}`. Re-running the same call should now return `"status": "error"` (already
Dispatched). If no Draft trip exists today, defer this check to Task 9's manual QA pass — don't
block on it.

---

### Task 4: Create the `receiveBucketTrip` Server Script

Mirrors Task 3 exactly, for the reverse transition.

**Interfaces:**
- Produces: `POST /api/method/receiveBucketTrip` with body `{ name: string }`. Response:
  `{ message: { status: 'success'|'error', message?: string, name?: string,
  trip_status?: string } }`. Consumed by Task 5's `karenBucketLogisticsApi.receive()`.

- [ ] **Step 1: Create the Server Script document**

Script body:
```python
name = frappe.form_dict.get("name")
if not name or not frappe.db.exists("Bucket Request Trip", name):
    frappe.response["message"] = {"status": "error", "message": "Trip not found."}
else:
    current = frappe.db.get_value("Bucket Request Trip", name, "status")
    if current != "Dispatched":
        frappe.response["message"] = {
            "status": "error",
            "message": "Trip is " + str(current) + "; only Dispatched trips can be received.",
        }
    else:
        frappe.db.set_value("Bucket Request Trip", name, {
            "status": "Received",
            "received_at": frappe.utils.now(),
        })
        frappe.db.commit()
        frappe.response["message"] = {"status": "success", "name": name, "trip_status": "Received"}
```

```bash
EP='https://kaitet-group.upande.com/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp'
AUTH="Authorization: token $KAITET_API_KEY"
python3 -c "
import json
script = '''name = frappe.form_dict.get(\"name\")
if not name or not frappe.db.exists(\"Bucket Request Trip\", name):
    frappe.response[\"message\"] = {\"status\": \"error\", \"message\": \"Trip not found.\"}
else:
    current = frappe.db.get_value(\"Bucket Request Trip\", name, \"status\")
    if current != \"Dispatched\":
        frappe.response[\"message\"] = {
            \"status\": \"error\",
            \"message\": \"Trip is \" + str(current) + \"; only Dispatched trips can be received.\",
        }
    else:
        frappe.db.set_value(\"Bucket Request Trip\", name, {
            \"status\": \"Received\",
            \"received_at\": frappe.utils.now(),
        })
        frappe.db.commit()
        frappe.response[\"message\"] = {\"status\": \"success\", \"name\": name, \"trip_status\": \"Received\"}
'''
payload = {
    'jsonrpc': '2.0', 'id': 4, 'method': 'tools/call',
    'params': {
        'name': 'create_document',
        'arguments': {
            'doctype': 'Server Script',
            'data': {
                'name': 'Receive Bucket Trip',
                'script_type': 'API',
                'api_method': 'receiveBucketTrip',
                'module': 'Upande Kaitet',
                'disabled': 0,
                'allow_guest': 0,
                'script': script,
            },
        },
    },
}
print(json.dumps(payload))
" > /tmp/receive_trip_payload.json
curl -s -X POST "$EP" -H "$AUTH" -H 'Content-Type: application/json' -d @/tmp/receive_trip_payload.json
```
Expected: same success shape as Task 3 Step 2.

- [ ] **Step 2: Verify it saved correctly**

```bash
EP='https://kaitet-group.upande.com/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp'
AUTH="Authorization: token $KAITET_API_KEY"
curl -s -X POST "$EP" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_document","arguments":{"doctype":"Server Script","name":"Receive Bucket Trip"}}}' \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
inner=json.loads(d['result']['content'][0]['text'])
print(inner['result']['data']['api_method'], inner['result']['data']['disabled'])
"
```
Expected: `receiveBucketTrip 0`.

- [ ] **Step 3: Manual functional check**

Same pattern as Task 3 Step 4, against a trip you just dispatched:
```bash
curl -s -X POST 'https://kaitet-group.upande.com/api/method/receiveBucketTrip' \
  -H 'Authorization: token $KAITET_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"name":"<real trip name>"}'
```
Expected: `{"message": {"status": "success", "name": "<trip name>", "trip_status": "Received"}}`.

---

### Task 5: Rewrite the API layer

**Files:**
- Modify (full rewrite): `src/tenants/karen/api/karen-bucket-logistics-api.ts`

**Interfaces:**
- Consumes: `api<T>(config)` from `@/src/core/api/client` — `(config: AxiosRequestConfig) =>
  Promise<T>`.
- Produces: `karenBucketLogisticsApi.fetch(): Promise<RawTransferScheduleData>`,
  `.dispatch(name: string): Promise<RawTripActionResponse>`,
  `.receive(name: string): Promise<RawTripActionResponse>` — consumed by Task 6's store.
  Exports `RawTransferScheduleData`, `RawTrip`, `RawTripOrder`, `RawScheduleOrder`,
  `RawScheduleOrderFarm`, `RawScheduleOrderVariety`, `RawTruckStatus`, `RawTripActionResponse`.

- [ ] **Step 1: Write the new file**

`getTransferScheduleData` writes response keys directly onto `frappe.response` (not nested
under `message` — confirmed by reading its Server Script source), so `fetch()` returns the flat
shape directly. `dispatchBucketTrip`/`receiveBucketTrip` (Tasks 3-4) follow the same convention
as `saveBucketTrip`/`deleteBucketTrip` and nest their result under `message`.

```typescript
import { api } from '@/src/core/api/client';

// =====================================================================
// Bucket logistics coordinator: today's transfer schedule (orders by
// farm/variety with packhouse-schedule priority, today's Bucket Request
// Trips, live truck status) + trip dispatch/receive actions.
// Server methods: getTransferScheduleData, dispatchBucketTrip,
// receiveBucketTrip. Same backend as the desktop transfer-control page —
// see docs/superpowers/specs/2026-08-22-bucket-logistics-coordinator-design.md.
// =====================================================================

export type RawScheduleOrderVariety = {
  variety: string;
  buckets: number;
  stems: number;
};

export type RawScheduleOrderFarm = {
  farm: string;
  buckets: number;
  stems: number;
  varieties: RawScheduleOrderVariety[];
};

/** One Order Pick List's transfer-plannable buckets, broken down by farm. */
export type RawScheduleOrder = {
  opl: string;
  order_name: string;
  customer: string;
  so: string;
  delivery_date: string;
  truck: string;
  mixed: number;
  /** Packhouse-schedule sequence number — lower = packed sooner. */
  schedule: number;
  team: string;
  total_buckets: number;
  total_stems: number;
  farms: RawScheduleOrderFarm[];
};

/** One (order, farm) row on a Bucket Request Trip. */
export type RawTripOrder = {
  order_pick_list: string;
  order_name: string;
  customer: string;
  farm: string;
  varieties: string;
  buckets: number;
  stems: number;
  full_farm_buckets: number;
  is_partial: number;
};

export type RawTrip = {
  name: string;
  vehicle: string;
  trip_date: string;
  status: string;
  notes: string;
  collection_order: string;
  farm: string;
  total_buckets: number;
  total_stems: number;
  capacity_buckets: number;
  orders: RawTripOrder[];
};

/** Live per-vehicle position, derived server-side from custom_transit_truck flags. */
export type RawTruckStatus = {
  truck: string;
  total: number;
  awaiting: number;
  loaded: number;
  in_transit: number;
  shelved: number;
  location: string;
  farm: string;
  loading_pct: number;
  last: string;
};

// The real getTransferScheduleData response also includes `vehicles`,
// `distances`, and `routes` — omitted here because this screen doesn't
// consume them (route/vehicle planning stays desktop-only).
export type RawTransferScheduleData = {
  orders: RawScheduleOrder[];
  trips: RawTrip[];
  truck_status: RawTruckStatus[];
  packhouse: string;
  window: { from: string; to: string };
  generated_at: string;
};

export type RawTripActionResponse = {
  message?: { status?: string; message?: string; name?: string; trip_status?: string } | string;
};

export const karenBucketLogisticsApi = {
  /** Today's transfer schedule: orders-by-farm, today's trips, live truck status. */
  fetch(): Promise<RawTransferScheduleData> {
    return api<RawTransferScheduleData>({
      method: 'GET',
      url: '/api/method/getTransferScheduleData',
    });
  },

  /** Mark a planned trip as sent out. */
  dispatch(name: string): Promise<RawTripActionResponse> {
    return api<RawTripActionResponse>({
      method: 'POST',
      url: '/api/method/dispatchBucketTrip',
      data: { name },
    });
  },

  /** Mark a dispatched trip as back / received. */
  receive(name: string): Promise<RawTripActionResponse> {
    return api<RawTripActionResponse>({
      method: 'POST',
      url: '/api/method/receiveBucketTrip',
      data: { name },
    });
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `karen-bucket-logistics-api.ts`. (Other pre-existing errors
elsewhere in the repo, if any, are not this task's concern — but there should be none new from
this file.)

- [ ] **Step 3: Commit**

```bash
git add src/tenants/karen/api/karen-bucket-logistics-api.ts
git commit -m "feat: rewrite bucket-logistics API for coordinator screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Rewrite the store (pure derivation + optimistic actions), with tests

**Files:**
- Modify (full rewrite): `src/tenants/karen/state/karen-bucket-logistics-store.ts`
- Create: `__tests__/karen-bucket-logistics-store-test.ts`

**Interfaces:**
- Consumes: `karenBucketLogisticsApi` and all `Raw*` types from Task 5.
  `mapAxiosError(err: unknown): HttpError` (has `.message: string`) from
  `@/src/core/api/client`.
- Produces (consumed by Tasks 7-9):
  - `export type TripStatusPill = { key: 'awaiting'|'loaded'|'in_transit'|'shelved'; label: string; count: number }`
  - `export type TripStop = { farm: string; buckets: number; orders: { orderName: string; customer: string; varieties: string; buckets: number }[] }`
  - `export type Trip = { name: string; vehicle: string; status: 'Draft'|'Scheduled'|'Dispatched'|'Received'; capacityBuckets: number; totalBuckets: number; totalStems: number; fillPct: number; stops: TripStop[]; pills: TripStatusPill[]; scheduleContext: string }`
  - `export type TripGroup = 'planned' | 'on_the_road' | 'back'`
  - `export function groupTrips(data: RawTransferScheduleData): Record<TripGroup, Trip[]>`
    (pure, exported for testing)
  - `export const useKarenBucketLogisticsStore: () => State` where `State` has `loading:
    boolean`, `error: string | null`, `actioning: Record<string, boolean>`, `groups:
    Record<TripGroup, Trip[]>`, `load(): Promise<void>`, `dispatch(name: string):
    Promise<{kind:'success'|'error'; message: string}>`, `receive(name: string):
    Promise<{kind:'success'|'error'; message: string}>`, `reset(): void`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/karen-bucket-logistics-store-test.ts`:
```typescript
import { groupTrips } from '@/src/tenants/karen/state/karen-bucket-logistics-store';
import type { RawTransferScheduleData } from '@/src/tenants/karen/api/karen-bucket-logistics-api';

function fixture(overrides: Partial<RawTransferScheduleData> = {}): RawTransferScheduleData {
  return {
    orders: [],
    trips: [],
    truck_status: [],
    packhouse: 'Kapkolia',
    window: { from: '2026-08-22', to: '2026-08-22' },
    generated_at: '2026-08-22 06:00:00',
    ...overrides,
  };
}

describe('groupTrips', () => {
  it('buckets trips into planned/on_the_road/back by status', () => {
    const data = fixture({
      trips: [
        { name: 'TRIP-1', vehicle: 'KAA 001A', trip_date: '2026-08-22', status: 'Draft', notes: '', collection_order: '', farm: '', total_buckets: 0, total_stems: 0, capacity_buckets: 100, orders: [] },
        { name: 'TRIP-2', vehicle: 'KAA 002B', trip_date: '2026-08-22', status: 'Scheduled', notes: '', collection_order: '', farm: '', total_buckets: 0, total_stems: 0, capacity_buckets: 100, orders: [] },
        { name: 'TRIP-3', vehicle: 'KAA 003C', trip_date: '2026-08-22', status: 'Dispatched', notes: '', collection_order: '', farm: '', total_buckets: 0, total_stems: 0, capacity_buckets: 100, orders: [] },
        { name: 'TRIP-4', vehicle: 'KAA 004D', trip_date: '2026-08-22', status: 'Received', notes: '', collection_order: '', farm: '', total_buckets: 0, total_stems: 0, capacity_buckets: 100, orders: [] },
      ],
    });
    const groups = groupTrips(data);
    expect(groups.planned.map((t) => t.name)).toEqual(['TRIP-1', 'TRIP-2']);
    expect(groups.on_the_road.map((t) => t.name)).toEqual(['TRIP-3']);
    expect(groups.back.map((t) => t.name)).toEqual(['TRIP-4']);
  });

  it('computes fillPct clamped to 100, and 0 with no capacity', () => {
    const data = fixture({
      trips: [
        { name: 'TRIP-OVER', vehicle: 'V1', trip_date: '2026-08-22', status: 'Draft', notes: '', collection_order: '', farm: '', total_buckets: 120, total_stems: 0, capacity_buckets: 100, orders: [] },
        { name: 'TRIP-NOCAP', vehicle: 'V2', trip_date: '2026-08-22', status: 'Draft', notes: '', collection_order: '', farm: '', total_buckets: 10, total_stems: 0, capacity_buckets: 0, orders: [] },
      ],
    });
    const groups = groupTrips(data);
    expect(groups.planned.find((t) => t.name === 'TRIP-OVER')!.fillPct).toBe(100);
    expect(groups.planned.find((t) => t.name === 'TRIP-NOCAP')!.fillPct).toBe(0);
  });

  it('groups a multi-farm trip into stops in collection_order sequence, extra farms appended', () => {
    const data = fixture({
      trips: [
        {
          name: 'TRIP-MULTI', vehicle: 'V1', trip_date: '2026-08-22', status: 'Draft', notes: '',
          collection_order: 'Kaptumbo, Simotwo', farm: '', total_buckets: 30, total_stems: 0, capacity_buckets: 100,
          orders: [
            { order_pick_list: 'OPL-1', order_name: 'ORD-1', customer: 'Acme', farm: 'Simotwo', varieties: 'Freedom', buckets: 10, stems: 200, full_farm_buckets: 10, is_partial: 0 },
            { order_pick_list: 'OPL-2', order_name: 'ORD-2', customer: 'Acme', farm: 'Kaptumbo', varieties: 'Avalanche', buckets: 15, stems: 300, full_farm_buckets: 15, is_partial: 0 },
            { order_pick_list: 'OPL-3', order_name: 'ORD-3', customer: 'Beta', farm: 'Torongo', varieties: 'Explorer', buckets: 5, stems: 100, full_farm_buckets: 5, is_partial: 0 },
          ],
        },
      ],
    });
    const trip = groupTrips(data).planned[0];
    expect(trip.stops.map((s) => s.farm)).toEqual(['Kaptumbo', 'Simotwo', 'Torongo']);
    expect(trip.stops[0].buckets).toBe(15);
    expect(trip.stops[0].orders).toEqual([{ orderName: 'ORD-2', customer: 'Acme', varieties: 'Avalanche', buckets: 15 }]);
  });

  it('builds status pills from truck_status matched by vehicle, dropping zero counts', () => {
    const data = fixture({
      trips: [
        { name: 'TRIP-1', vehicle: 'KAA 001A', trip_date: '2026-08-22', status: 'Dispatched', notes: '', collection_order: '', farm: '', total_buckets: 10, total_stems: 0, capacity_buckets: 100, orders: [] },
      ],
      truck_status: [
        { truck: 'KAA 001A', total: 10, awaiting: 0, loaded: 3, in_transit: 7, shelved: 0, location: 'in_transit', farm: 'Simotwo', loading_pct: 100, last: '2026-08-22 07:00:00' },
      ],
    });
    const trip = groupTrips(data).on_the_road[0];
    expect(trip.pills).toEqual([
      { key: 'loaded', label: 'Loading', count: 3 },
      { key: 'in_transit', label: 'In transit', count: 7 },
    ]);
  });

  it('returns no pills when the vehicle has no truck_status entry', () => {
    const data = fixture({
      trips: [
        { name: 'TRIP-1', vehicle: 'KAA 999Z', trip_date: '2026-08-22', status: 'Draft', notes: '', collection_order: '', farm: '', total_buckets: 0, total_stems: 0, capacity_buckets: 100, orders: [] },
      ],
    });
    expect(groupTrips(data).planned[0].pills).toEqual([]);
  });

  it('builds scheduleContext from the matching schedule order with the lowest sequence number', () => {
    const data = fixture({
      orders: [
        { opl: 'OPL-1', order_name: 'ORD-1', customer: 'Acme', so: 'SO-1', delivery_date: '2026-08-23', truck: '', mixed: 0, schedule: 5, team: 'Team B', total_buckets: 10, total_stems: 200, farms: [] },
        { opl: 'OPL-2', order_name: 'ORD-2', customer: 'Acme', so: 'SO-2', delivery_date: '2026-08-23', truck: '', mixed: 0, schedule: 2, team: 'Team A', total_buckets: 15, total_stems: 300, farms: [] },
      ],
      trips: [
        {
          name: 'TRIP-1', vehicle: 'V1', trip_date: '2026-08-22', status: 'Draft', notes: '',
          collection_order: '', farm: '', total_buckets: 25, total_stems: 0, capacity_buckets: 100,
          orders: [
            { order_pick_list: 'OPL-1', order_name: 'ORD-1', customer: 'Acme', farm: 'Simotwo', varieties: 'Freedom', buckets: 10, stems: 200, full_farm_buckets: 10, is_partial: 0 },
            { order_pick_list: 'OPL-2', order_name: 'ORD-2', customer: 'Acme', farm: 'Kaptumbo', varieties: 'Avalanche', buckets: 15, stems: 300, full_farm_buckets: 15, is_partial: 0 },
          ],
        },
      ],
    });
    expect(groupTrips(data).planned[0].scheduleContext).toBe('Team A · #2 in queue');
  });

  it('returns an empty scheduleContext when no order on the trip matches the schedule feed', () => {
    const data = fixture({
      trips: [
        {
          name: 'TRIP-1', vehicle: 'V1', trip_date: '2026-08-22', status: 'Draft', notes: '',
          collection_order: '', farm: '', total_buckets: 5, total_stems: 0, capacity_buckets: 100,
          orders: [{ order_pick_list: 'OPL-UNKNOWN', order_name: 'ORD-X', customer: '', farm: 'Simotwo', varieties: '', buckets: 5, stems: 100, full_farm_buckets: 5, is_partial: 0 }],
        },
      ],
    });
    expect(groupTrips(data).planned[0].scheduleContext).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest karen-bucket-logistics-store-test`
Expected: FAIL — `groupTrips` is not exported (module doesn't have it yet, or the module
doesn't exist in its new shape).

- [ ] **Step 3: Write the store**

Replace `src/tenants/karen/state/karen-bucket-logistics-store.ts` in full:

```typescript
import { create } from 'zustand';
import { karenBucketLogisticsApi } from '../api/karen-bucket-logistics-api';
import type {
  RawScheduleOrder,
  RawTransferScheduleData,
  RawTrip,
  RawTripActionResponse,
  RawTruckStatus,
} from '../api/karen-bucket-logistics-api';
import { mapAxiosError } from '@/src/core/api/client';

export type TripStatusPill = {
  key: 'awaiting' | 'loaded' | 'in_transit' | 'shelved';
  label: string;
  count: number;
};

export type TripStop = {
  farm: string;
  buckets: number;
  orders: { orderName: string; customer: string; varieties: string; buckets: number }[];
};

export type TripStatus = 'Draft' | 'Scheduled' | 'Dispatched' | 'Received';

export type Trip = {
  name: string;
  vehicle: string;
  status: TripStatus;
  capacityBuckets: number;
  totalBuckets: number;
  totalStems: number;
  /** total/capacity as a whole-number percent, clamped to [0, 100]; 0 when capacity is 0. */
  fillPct: number;
  stops: TripStop[];
  pills: TripStatusPill[];
  /** e.g. "Team A · #2 in queue" — from the matching order's team/schedule; '' if none match. */
  scheduleContext: string;
};

export type TripGroup = 'planned' | 'on_the_road' | 'back';

type ActionOutcome = { kind: 'success' | 'error'; message: string };

type State = {
  loading: boolean;
  error: string | null;
  actioning: Record<string, boolean>;
  groups: Record<TripGroup, Trip[]>;

  load: () => Promise<void>;
  dispatch: (name: string) => Promise<ActionOutcome>;
  receive: (name: string) => Promise<ActionOutcome>;
  reset: () => void;
};

const EMPTY_GROUPS: Record<TripGroup, Trip[]> = { planned: [], on_the_road: [], back: [] };

function groupForStatus(status: string): TripGroup {
  if (status === 'Dispatched') return 'on_the_road';
  if (status === 'Received') return 'back';
  return 'planned'; // Draft, Scheduled
}

function buildStops(trip: RawTrip): TripStop[] {
  const sequence = (trip.collection_order || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const byFarm = new Map<string, TripStop>();
  for (const row of trip.orders) {
    const farm = row.farm || '?';
    if (!byFarm.has(farm)) byFarm.set(farm, { farm, buckets: 0, orders: [] });
    const stop = byFarm.get(farm)!;
    stop.buckets += row.buckets;
    stop.orders.push({
      orderName: row.order_name || row.order_pick_list,
      customer: row.customer,
      varieties: row.varieties,
      buckets: row.buckets,
    });
  }

  const known = Array.from(byFarm.keys());
  const sequenced = sequence.filter((f) => byFarm.has(f));
  const rest = known.filter((f) => !sequenced.includes(f));
  return [...sequenced, ...rest].map((f) => byFarm.get(f)!);
}

const PILL_DEFS: { key: TripStatusPill['key']; label: string }[] = [
  { key: 'awaiting', label: 'Awaiting' },
  { key: 'loaded', label: 'Loading' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'shelved', label: 'Arrived' },
];

function buildPills(vehicle: string, truckStatus: RawTruckStatus[]): TripStatusPill[] {
  const s = truckStatus.find((t) => t.truck === vehicle);
  if (!s || !s.total) return [];
  return PILL_DEFS
    .map((d) => ({ key: d.key, label: d.label, count: Number(s[d.key] ?? 0) }))
    .filter((p) => p.count > 0);
}

function buildScheduleContext(trip: RawTrip, scheduleOrders: RawScheduleOrder[]): string {
  const oplSet = new Set(trip.orders.map((o) => o.order_pick_list));
  const matches = scheduleOrders.filter((o) => oplSet.has(o.opl));
  if (!matches.length) return '';
  const best = matches.reduce((a, b) => (b.schedule < a.schedule ? b : a));
  return best.team ? `${best.team} · #${best.schedule} in queue` : `#${best.schedule} in queue`;
}

function buildTrip(raw: RawTrip, scheduleOrders: RawScheduleOrder[], truckStatus: RawTruckStatus[]): Trip {
  const cap = raw.capacity_buckets || 0;
  const fillPct = cap > 0 ? Math.max(0, Math.min(100, Math.round((raw.total_buckets / cap) * 100))) : 0;
  return {
    name: raw.name,
    vehicle: raw.vehicle || 'Unassigned',
    status: (raw.status || 'Draft') as TripStatus,
    capacityBuckets: cap,
    totalBuckets: raw.total_buckets || 0,
    totalStems: raw.total_stems || 0,
    fillPct,
    stops: buildStops(raw),
    pills: buildPills(raw.vehicle, truckStatus),
    scheduleContext: buildScheduleContext(raw, scheduleOrders),
  };
}

/** Pure: raw feed -> trips grouped by lifecycle stage. Exported for testing. */
export function groupTrips(data: RawTransferScheduleData): Record<TripGroup, Trip[]> {
  const groups: Record<TripGroup, Trip[]> = { planned: [], on_the_road: [], back: [] };
  for (const raw of data.trips) {
    const trip = buildTrip(raw, data.orders, data.truck_status);
    groups[groupForStatus(trip.status)].push(trip);
  }
  return groups;
}

function unwrapAction(raw: RawTripActionResponse | undefined): { status?: string; message?: string } {
  const m = raw?.message;
  if (!m) return {};
  if (typeof m === 'string') {
    try {
      return JSON.parse(m);
    } catch {
      return {};
    }
  }
  return m;
}

async function moveTrip(
  get: () => State,
  set: (partial: Partial<State>) => void,
  name: string,
  from: TripGroup,
  to: TripGroup,
  newStatus: TripStatus,
  action: (name: string) => Promise<RawTripActionResponse>,
  successMessage: string,
): Promise<ActionOutcome> {
  const { groups, actioning } = get();
  const trip = groups[from].find((t) => t.name === name);
  if (!trip) return { kind: 'error', message: 'Trip not found.' };

  set({
    groups: {
      ...groups,
      [from]: groups[from].filter((t) => t.name !== name),
      [to]: [...groups[to], { ...trip, status: newStatus }],
    },
    actioning: { ...actioning, [name]: true },
  });

  try {
    const raw = await action(name);
    const result = unwrapAction(raw);
    if (result.status !== 'success') {
      await get().load();
      set({ actioning: { ...get().actioning, [name]: false } });
      return { kind: 'error', message: result.message || 'Action failed.' };
    }
    set({ actioning: { ...get().actioning, [name]: false } });
    return { kind: 'success', message: successMessage };
  } catch (err) {
    await get().load();
    set({ actioning: { ...get().actioning, [name]: false } });
    return { kind: 'error', message: mapAxiosError(err).message || 'Action failed.' };
  }
}

export const useKarenBucketLogisticsStore = create<State>((set, get) => ({
  loading: false,
  error: null,
  actioning: {},
  groups: EMPTY_GROUPS,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await karenBucketLogisticsApi.fetch();
      set({ loading: false, groups: groupTrips(raw) });
    } catch (err) {
      set({ loading: false, error: mapAxiosError(err).message || 'Could not load trips.' });
    }
  },

  dispatch: (name) =>
    moveTrip(get, set, name, 'planned', 'on_the_road', 'Dispatched', karenBucketLogisticsApi.dispatch, 'Truck dispatched.'),

  receive: (name) =>
    moveTrip(get, set, name, 'on_the_road', 'back', 'Received', karenBucketLogisticsApi.receive, 'Truck received.'),

  reset: () => set({ loading: false, error: null, actioning: {}, groups: EMPTY_GROUPS }),
}));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest karen-bucket-logistics-store-test`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add __tests__/karen-bucket-logistics-store-test.ts src/tenants/karen/state/karen-bucket-logistics-store.ts
git commit -m "feat: rewrite bucket-logistics store around trip groups

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `StatusPills` component

**Files:**
- Create: `src/tenants/karen/features/bucket-logistics/StatusPills.tsx`

**Interfaces:**
- Consumes: `TripStatusPill` from Task 6.
- Produces: `export function StatusPills({ pills }: { pills: TripStatusPill[] }): JSX.Element` —
  consumed by Task 8's `TripCard`.

- [ ] **Step 1: Write the component**

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, COLORS, fontFamily, fontSize } from '@/src/core/theme';
import type { TripStatusPill } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

const PILL_COLOR: Record<TripStatusPill['key'], string> = {
  awaiting: '#D97706',
  loaded: '#7C3AED',
  in_transit: '#2563EB',
  shelved: COLORS.success,
};

export function StatusPills({ pills }: { pills: TripStatusPill[] }) {
  if (!pills.length) {
    return (
      <View style={s.row}>
        <Text style={s.empty}>No transfer activity yet</Text>
      </View>
    );
  }
  return (
    <View style={s.row}>
      {pills.map((p) => (
        <View key={p.key} style={[s.pill, { backgroundColor: PILL_COLOR[p.key] }]}>
          <Text style={s.pillTxt}>{p.label} {p.count}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: { borderRadius: borderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  pillTxt: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: '#fff' },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/tenants/karen/features/bucket-logistics/StatusPills.tsx
git commit -m "feat: add StatusPills component for trip cards

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `TripCard` component

**Files:**
- Create: `src/tenants/karen/features/bucket-logistics/TripCard.tsx`

**Interfaces:**
- Consumes: `Trip` from Task 6, `StatusPills` from Task 7, `Button` from
  `@/src/core/ui/Button` (props: `label: string; onPress?: () => void; loading?: boolean;
  disabled?: boolean; variant?: 'primary'|'outline'|'ghost'; style?: ViewStyle`).
- Produces: `export function TripCard({ trip, actioning, onDispatch, onReceive }: { trip: Trip;
  actioning: boolean; onDispatch: (name: string) => void; onReceive: (name: string) => void
  }): JSX.Element` — consumed by Task 9's screen.

- [ ] **Step 1: Write the component**

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { StatusPills } from './StatusPills';
import type { Trip } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

function fillColor(pct: number): string {
  if (pct >= 100) return COLORS.success;
  if (pct > 0) return '#D97706';
  return COLORS.border;
}

export function TripCard({
  trip,
  actioning,
  onDispatch,
  onReceive,
}: {
  trip: Trip;
  actioning: boolean;
  onDispatch: (name: string) => void;
  onReceive: (name: string) => void;
}) {
  return (
    <View style={s.card}>
      <View style={s.hd}>
        <Text style={s.vehicle} numberOfLines={1}>{trip.vehicle}</Text>
        <Text style={s.count}>
          {trip.totalBuckets}{trip.capacityBuckets ? ` / ${trip.capacityBuckets}` : ''} bkt
        </Text>
      </View>
      {trip.scheduleContext ? <Text style={s.schedule}>{trip.scheduleContext}</Text> : null}

      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.max(trip.fillPct, 3)}%`, backgroundColor: fillColor(trip.fillPct) }]} />
      </View>

      <StatusPills pills={trip.pills} />

      <View style={s.stops}>
        {trip.stops.map((stop, i) => (
          <View key={stop.farm} style={s.stop}>
            <View style={s.stopHd}>
              <Text style={s.stopIdx}>{i + 1}</Text>
              <Text style={s.stopFarm} numberOfLines={1}>{stop.farm}</Text>
              <Text style={s.stopBkt}>{stop.buckets} bkt</Text>
            </View>
            {stop.orders.map((o, oi) => (
              <View key={`${o.orderName}-${oi}`} style={s.orderRow}>
                <Text style={s.orderName} numberOfLines={1}>
                  {o.orderName}{o.customer ? ` · ${o.customer}` : ''}
                </Text>
                <Text style={s.orderBkt}>{o.buckets}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {trip.status === 'Draft' || trip.status === 'Scheduled' ? (
        <Button label="Dispatch" onPress={() => onDispatch(trip.name)} loading={actioning} style={s.action} />
      ) : trip.status === 'Dispatched' ? (
        <Button label="Receive" onPress={() => onReceive(trip.name)} loading={actioning} variant="outline" style={s.action} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  hd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vehicle: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text, flexShrink: 1 },
  count: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary },
  schedule: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  track: { height: 8, borderRadius: 4, backgroundColor: COLORS.bgMuted, overflow: 'hidden', marginTop: spacing.sm },
  fill: { height: '100%', borderRadius: 4 },
  stops: { marginTop: spacing.sm, gap: spacing.xs },
  stop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, paddingTop: spacing.xs },
  stopHd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stopIdx: {
    fontFamily: fontFamily.bold, fontSize: 10, color: COLORS.textOnPrimary, backgroundColor: COLORS.primary,
    width: 16, height: 16, borderRadius: 8, textAlign: 'center', lineHeight: 16, overflow: 'hidden',
  },
  stopFarm: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  stopBkt: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 22, marginTop: 2 },
  orderName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary },
  orderBkt: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  action: { marginTop: spacing.md },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/tenants/karen/features/bucket-logistics/TripCard.tsx
git commit -m "feat: add TripCard component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Rewrite the screen

**Files:**
- Modify (full rewrite): `src/tenants/karen/features/bucket-logistics/BucketLogisticsScreen.tsx`

**Interfaces:**
- Consumes: `useKarenBucketLogisticsStore`, `Trip`, `TripGroup` from Task 6; `TripCard` from
  Task 8; `useToast()` from `@/src/core/ui/Toast` (returns `{ showSuccess: (msg: string) =>
  void; showError: (msg: string) => void; showInfo: (msg: string) => void }`); `Screen` from
  `@/src/core/ui/Screen`.
- Produces: `export function KarenBucketLogisticsScreen(): JSX.Element` — must keep this exact
  name, it's imported by `app/bucket-logistics.tsx:3`.

- [ ] **Step 1: Write the screen**

```tsx
import { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { useToast } from '@/src/core/ui/Toast';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { useKarenBucketLogisticsStore } from '@/src/tenants/karen/state/karen-bucket-logistics-store';
import type { Trip, TripGroup } from '@/src/tenants/karen/state/karen-bucket-logistics-store';
import { TripCard } from './TripCard';

const SECTIONS: { key: TripGroup; label: string; empty: string }[] = [
  { key: 'planned', label: 'Planned', empty: 'No trips planned yet — build them in Transfer Scheduling.' },
  { key: 'on_the_road', label: 'On the road', empty: 'No trucks out right now.' },
  { key: 'back', label: 'Back', empty: 'No trucks received yet today.' },
];

export function KarenBucketLogisticsScreen() {
  const { loading, error, groups, actioning, load, dispatch, receive, reset } = useKarenBucketLogisticsStore();
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    load();
    return () => reset();
  }, [load, reset]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDispatch = useCallback(
    async (name: string) => {
      const outcome = await dispatch(name);
      if (outcome.kind === 'success') showSuccess(outcome.message);
      else showError(outcome.message);
    },
    [dispatch, showSuccess, showError],
  );

  const handleReceive = useCallback(
    async (name: string) => {
      const outcome = await receive(name);
      if (outcome.kind === 'success') showSuccess(outcome.message);
      else showError(outcome.message);
    },
    [receive, showSuccess, showError],
  );

  const totalTrips = groups.planned.length + groups.on_the_road.length + groups.back.length;

  return (
    <Screen title="Bucket Logistics" loading={loading} error={error} onRetry={load} onRefresh={load}>
      {!loading && totalTrips === 0 ? (
        <Text style={s.empty}>No bucket request trips yet today.</Text>
      ) : (
        SECTIONS.map((section) => (
          <View key={section.key} style={s.section}>
            <Text style={s.sectionLbl}>{section.label} ({groups[section.key].length})</Text>
            {groups[section.key].length === 0 ? (
              <Text style={s.empty}>{section.empty}</Text>
            ) : (
              groups[section.key].map((trip: Trip) => (
                <TripCard
                  key={trip.name}
                  trip={trip}
                  actioning={!!actioning[trip.name]}
                  onDispatch={handleDispatch}
                  onReceive={handleReceive}
                />
              ))
            )}
          </View>
        ))
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionLbl: {
    fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.sm,
  },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors/warnings from files touched in this plan.

- [ ] **Step 3: Manual QA on a device/simulator**

Run: `npx expo start`, open the app as the Karen (or Demo) tenant, navigate to Bucket
Logistics. Confirm:
- Today's trips render grouped into Planned / On the road / Back.
- A Draft/Scheduled trip shows a **Dispatch** button; tapping it moves the card to "On the
  road" immediately and shows a success toast (or moves back + error toast if the backend
  rejects it — e.g. if Task 2/3 aren't live yet).
- A Dispatched trip shows a **Receive** button with the same behavior into "Back".
- Empty-state copy shows correctly when a group has zero trips.

- [ ] **Step 4: Commit**

```bash
git add src/tenants/karen/features/bucket-logistics/BucketLogisticsScreen.tsx
git commit -m "feat: rewrite BucketLogisticsScreen as coordinator trip board

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Full verification pass

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npx jest`
Expected: all tests pass, including the 7 from Task 6.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Confirm backend end-to-end** (skip only if already done live in Tasks 3-4)

Using a real Draft trip from `transfer-control` on kaitet-group, dispatch then receive it via
the app (Task 9 Step 3) and confirm via:
```bash
EP='https://kaitet-group.upande.com/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp'
AUTH="Authorization: token $KAITET_API_KEY"
curl -s -X POST "$EP" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"get_document","arguments":{"doctype":"Bucket Request Trip","name":"<trip name>"}}}' \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
inner=json.loads(d['result']['content'][0]['text'])
data=inner['result']['data']
print(data['status'], data.get('dispatched_at'), data.get('received_at'))
"
```
Expected: `Received <a timestamp> <a timestamp>`.

---

## Deferred (not this plan — see spec's Out of Scope)
- Fleet-wide per-stop bottleneck detection (new endpoint, `getFarmPlannedTrips`-shaped).
- Farm-attendant Requests/Trolley/In-Transit workflow (`custom_transit_truck` flagging) — this
  app, not built yet, separate persona, needs its own brainstorming pass.
- Route building / vehicle assignment / "Distribute across teams" on mobile.
