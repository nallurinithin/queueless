import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const testData = JSON.parse(open('./test-data.json'));
const BASE_URL = __ENV.TARGET_URL || testData.baseUrl || 'http://127.0.0.1:5005';

const failureRate = new Rate('custom_failure_rate');
const checkinDuration = new Trend('checkin_duration');
const freshCheckinCount = new Counter('fresh_checkin_count');
const idempotentCheckinCount = new Counter('idempotent_checkin_count');

export const options = {
  stages: [
    { duration: '3s', target: parseInt(__ENV.VUS || '10', 10) },
    { duration: '8s', target: parseInt(__ENV.VUS || '10', 10) },
    { duration: '2s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<600'],
  },
};

export default function () {
  // Select from pre-seeded booking references
  const refIndex = ((__VU * 100) + __ITER) % testData.bookingReferences.length;
  const bookingReference = testData.bookingReferences[refIndex];

  const payload = JSON.stringify({ bookingReference });
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST_queue_checkin' },
  };

  const res = http.post(`${BASE_URL}/api/v1/queue/check-in`, payload, params);
  checkinDuration.add(res.timings.duration);

  let isFresh = false;
  let isIdempotent = false;

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'has token and status': (r) => {
      try {
        const body = JSON.parse(r.body);
        if (body.success && body.data && body.data.token) {
          if (body.alreadyCheckedIn) {
            isIdempotent = true;
          } else {
            isFresh = true;
          }
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
  });

  if (isFresh) freshCheckinCount.add(1);
  if (isIdempotent) idempotentCheckinCount.add(1);
  failureRate.add(!ok);
  sleep(0.08);
}
