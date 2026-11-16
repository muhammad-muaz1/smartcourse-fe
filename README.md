# SmartCourse — frontend

React client for the SmartCourse backend (`../smartcourse-core`). It talks only to the gateway, at `/api/v1`.

## Run

```bash
cp .env.example .env     # optional: defaults point at the local docker-compose stack
npm install
npm run dev              # http://localhost:3000 — proxies /api, /health and /version to the gateway (:8000)
npm run check            # oxlint + tsc + vitest
npm run build
```

Bring the backend up first (`make up` in `smartcourse-core`).

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite + React 19 + TypeScript (strict) | Fast dev server; each route is a lazy chunk |
| Server state | TanStack Query | Caching, polling while work is in flight, cursor pagination |
| Client state | Zustand (session only) | The only global client state is the token session |
| Routing | React Router (lazy routes) | Charts load only on the analytics and demo pages |
| Forms | react-hook-form + zod | Schemas mirror the backend's Pydantic constraints |
| UI | Tailwind v4, lucide icons, native `<dialog>` | No component library to fight |
| Charts | Recharts | Loaded only on the analytics and demo pages |

There is no axios. `src/lib/api/client.ts` is a small `fetch` wrapper that:

- unwraps the `{data, meta}` envelope and raises `ApiError` with the backend's stable `code`
- refreshes tokens one at a time per tab, and coordinates across tabs with a Web Lock. Identity revokes the whole token family when a rotated-out refresh token is reused, so two tabs racing to refresh would sign the user out everywhere.
- sends `Idempotency-Key` on the ★ endpoints. `useIdempotentMutation` keeps the same key for retries of one action and switches to a new key once the server has given a final answer.

## Layout

```
src/
  app/            router, query client
  components/     layout shell, ui primitives, chart tokens
  lib/api/        client, session, wire types (mirrors the backend schemas)
  features/
    auth/ courses/ learning/ instructor/ notifications/ analytics/ system/
    demo/         /demo — backend proof scenarios
load-tests/       k6 scripts (import their summary on /demo)
```

## `/demo` — backend proof

The demo has four scenarios. Each one drives the real backend and checks the outcome with pass/fail assertions. Together they cover the five problems in the brief.

1. **Publishing saga.** Publishes a course in one click, with a deliberate double-click (one workflow starts). It then publishes a broken course (a module with no lessons) to show the failure is caught, the course is rolled back, and it can be fixed and republished.
2. **Same-second enrollment rush.** N students enroll in a course with S seats in the same event-loop tick. The assertions check:
   - exactly S students enroll and the rest get `COURSE_FULL`
   - duplicate enrollments are rejected
   - a retry with the same key gets the original response back
   - welcome notifications are delivered
   - the learning roster and the analytics projection agree
3. **10,000-request burst.** Shows live throughput and wire latency (Resource Timing excludes time queued inside the browser). For true server-side concurrency, run `k6 run --summary-export=summary.json load-tests/catalogue-burst.js` and import the file on the page.
4. **Observability.** Shows live health for each dependency, the failure ledger (admin only), a request-ID round trip, and links to Jaeger, Grafana, Prometheus, Temporal and RabbitMQ.

The demo registers throwaway `@example.com` accounts. They are reused across runs, and their password is stored in this browser's localStorage. Identity throttles registration to 10 per hour per IP, so raise `SMARTCOURSE_SECURITY__REGISTER_THROTTLE_PER_HOUR` before running larger cohorts. **Run the demo against local or dev environments only.**

## Endpoint coverage

Every route the gateway exposes is used by the UI:

- **identity:** register, login, refresh, logout, me, password forgot and reset
- **course:** CRUD, unpublish, modules (list, add, edit, reorder, delete), lessons (add, get, edit, reorder, delete), publish, publish runs
- **learning:** enroll, my enrollments, enrollment detail, withdraw, roster, enrollment history, progress, complete lesson
- **notification:** inbox, mark read, mark all read
- **analytics:** all eight metric endpoints, scoped per course where the backend allows it
- **gateway:** `/health`, `/version`

`/metrics` is a Prometheus scrape target, so it is linked from the demo rather than called.

## Network behaviour

- Queries are cached for 2 minutes. They don't refetch when you switch tabs; mutations invalidate exactly what they change.
- Only three things poll:
  - the notification inbox, every 60 s (paused while the tab is hidden)
  - the sidebar health dot, every 60 s
  - the demo's health panel, every 5 s, and only while it is on screen
- Scrolling never triggers a request.

## Known backend gaps the UI works around

- `GET /courses` has no `instructor_id` filter, so "My courses" filters the catalogue on the client.
- **Uploads:** asset endpoints (`POST /assets`, presigned URLs) are blocked on the object-storage decision (API design §5). The lesson form already includes video and document drop zones, with type and size validation, and lists the supported formats. Files are only staged in the form until those endpoints exist; videos are linked by URL meanwhile.
- The API has no certificate endpoints or progress heartbeats yet, so the UI does not show them.
