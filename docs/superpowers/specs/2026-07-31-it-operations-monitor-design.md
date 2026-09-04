# IT Operations Monitor — Design (2026-07-31)

Config-driven "system activity" page for the IT team on kaitet-group, plus an in-dashboard admin to choose which doctypes to watch. All artifacts live on kaitet-group (DocType + Server Scripts + Web Pages), deployed via REST.

## Decisions
- **Transaction** = a new record created, bucketed by a timestamp field (default `creation`).
- **Baseline** = average daily count over the last 7 days.
- **Admin** = custom in-dashboard page (not raw Frappe desk).
- **Health** = per-doctype freshness (last activity) + category grouping.

## Data model — DocType `Monitored Doctype` (module Upande Kaitet)
- `document_type` Link→DocType (reqd, unique)
- `label` Data (defaults to document_type)
- `category` Select: Sensors, Harvesting, Shelving, Grading, Packing, Dispatch, Sales, Inventory, Other
- `date_field` Data (default `creation`)
- `filters_json` Small Text (optional Frappe filter list JSON)
- `enabled` Check (default 1)
- `sort_order` Int

## Server methods (Server Script, API)
- `getItOperationsData` — for each enabled config: counts for today / yesterday / 7-day daily avg via `date_field`, `last_activity` (MAX date_field), 7-day sparkline, today's per-hour totals; category rollups; total KPIs; `top_users` today by `owner`. Dynamic table `tab{document_type}` (doctype validated to exist); filters parsed from `filters_json` with `json.loads` and appended to the WHERE.
- `itMonitorList` / `itMonitorSave` / `itMonitorDelete` — CRUD (validate doctype exists, date_field is a real column, filters_json parses).
- `itMonitorDoctypeFields` — date/datetime fields (for date_field dropdown) + filterable fields (for filter builder).

## Pages (Web Page, IT dashboard shell — fetch LIVE it-dashboard first; mirror is stale)
- `it-operations` — KPI strip (today · vs yesterday Δ% · vs 7d-avg Δ% · active users · #monitored); hourly activity bars; category sections of per-doctype cards (today big, yesterday + 7d-avg, trend, last-activity freshness color, 7-day sparkline); top-users leaderboard; refresh.
- `it-operations-admin` — config table (label/doctype/category/filters/enabled/edit/delete) + add/edit form (doctype search-picker → loads date_field options + filter fields; label, category, enabled). Saves via itMonitorSave.

## Integration
- Add **Operations** + **Monitor Config** nav items to the live it-dashboard sidebar; match the IT shell on both new pages.
- Seed: Sensor Reading→Sensors, Harvest Log→Harvesting, Shelf Item→Shelving, Sales Order→Sales, Order Pick List→Packing. Verify counts.

## Out of scope (YAGNI)
Alert thresholds/emails, a historical retention table, modification/version counting.
