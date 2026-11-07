import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const testData = JSON.parse(open('./test-data.json'));

const BASE_URL = __ENV.TARGET_URL || testData.baseUrl || 'http://127.0.0.1:5005';
const failureRate = new Rate('custom_failure_rate');
const availabilityDuration = new Trend('availability_req_duration');

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
  const dept = testData.departments[Math.floor(Math.random() * testData.departments.length)];
  const url = `${BASE_URL}/api/v1/public/requestable-times?date=${testData.todayDate}&departmentId=${dept.id}`;

  const res = http.get(url, {
    tags: { name: 'GET_requestable_times' },
  });

  availabilityDuration.add(res.timings.duration);
  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'has requestableTimes': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.requestableTimes);
      } catch {
        return false;
      }
    },
  });

  failureRate.add(!ok);
  sleep(0.05);
}
