// Server-side concurrency for the demo's "10,000-request burst" scenario.
//
//   k6 run --summary-export=summary.json load-tests/catalogue-burst.js
//   k6 run -e BASE_URL=http://localhost:8000 -e VUS=10000 --summary-export=summary.json load-tests/catalogue-burst.js
//
// Then import summary.json on /demo#load. Run against local/dev only.
import http from 'k6/http'
import { check } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000'
const VUS = Number(__ENV.VUS || 10000)

export const options = {
  scenarios: {
    burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: VUS }, // ramp to N concurrent users
        { duration: '40s', target: VUS }, // hold
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    http_req_duration: ['p(95)<500'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
}

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/courses?status=published&limit=20`, {
    tags: { name: 'catalogue' },
  })
  check(res, { 'status is 200': (r) => r.status === 200 })
}
