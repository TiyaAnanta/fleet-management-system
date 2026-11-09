# Fleet Management System: Staff Graded Assignment 2 (Part 2)

Third-party integrations (geolocation + SMS), an Express **API Gateway**, **Swagger/OpenAPI** docs and a **Mocha/Chai** test suite.

## Architecture
```
Client ──> API Gateway :3000 ──┬─ /api/users/*          -> User Service        :4001
 (x-api-key, rate limit,       ├─ /api/vehicles/*       -> Vehicle/Fleet Svc   :4002
  forward, 404/400/503/504)    ├─ /api/telemetry/*      -> Telemetry Service   :4003
                               ├─ /api/maps/*           -> Geolocation Service :4004  (OpenStreetMap / mock)
                               └─ /api/notifications/*  -> Notification Svc    :4005  (mock SMS stub)
```
Requires Node >= 22.13 (uses built-in `node:sqlite`, so no native compile step). Services share a SQLite database (in-memory by default; `DB_FILE=fleet.db` to persist). JWT + roles (`admin`, `operator`, `driver`) are enforced inside the services; the gateway enforces API keys and rate limiting.

## Setup & run
```bash
npm install
cp .env.example .env      # optional
npm start
```
- Swagger UI: http://localhost:3000/api-docs  (raw spec: `/openapi.json`, source: `docs/openapi.yaml`)
- Map UI: http://localhost:3000/map  (Leaflet + OpenStreetMap; login, "Show all", "Find nearby")
- Demo API key: `fleet-demo-key-123`; users: `admin/admin123`, `operator/operator123`, `driver/driver123`
- Offline geocoding: `GEOCODER=mock npm start` (known: "Gaya, Bihar", "Patna, Bihar", "Delhi", ...). Default is real Nominatim (needs internet).
- Demo calls for screenshots: `./scripts-demo.sh`

## Run the tests
```bash
npm install
npm test
```
28 tests, no internet needed (geocoder and SMS are mocked). They cover 7 flows: login/JWT, vehicle registration/retrieval, telemetry storage, status update + SMS trigger (incl. failed delivery), RBAC, nearby search, gateway API key + rate limit (+404/400/503).

## Feature mapping
| Requirement | Where |
|---|---|
| Address -> lat/lon (OSM) | `GET /api/maps/geocode`, auto on `POST /api/vehicles` with `address` |
| Store GPS from vehicles | `POST /api/telemetry` updates `telemetry` and `vehicles` tables |
| Vehicles within X km | `GET /api/maps/nearby?lat&lon&radius` (Haversine; or `address=`) |
| Map interface | `/map` |
| SMS on critical events | engine_fault / emergency_stop / low_battery (or battery < 15) -> admins |
| SMS on status change | `PATCH /api/vehicles/:id/status` -> admins + vehicle owner |
| Notification record sent/failed | `notifications` table, `GET /api/notifications?status=` |
| Gateway: routing, API key, rate limit, errors | `src/gateway/` (401/403 key, 429 limit, 404, 400, 503/504) |
| Swagger: models, auth, examples, errors | `docs/openapi.yaml` |

## Deployment (optional)
Single process (`npm start`); deploy to Render/Railway: build `npm install`, start `npm start`, set `JWT_SECRET`, `API_KEYS`, `PORT`.

## Screenshots to capture (Deliverable 5)
1. `/map`: Show all, then Find nearby (radius circle + markers)
2. `./scripts-demo.sh` output: status change / telemetry showing `"sent":1`, and `GET /api/notifications` log
3. Missing API key -> 401, wrong key -> 403, many requests -> 429
4. `/api-docs` Swagger UI (click Authorize, Try it out)
