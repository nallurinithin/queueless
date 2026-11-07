import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const testData = JSON.parse(open('./test-data.json'));
const BASE_URL = __ENV.TARGET_URL || testData.baseUrl || 'http://127.0.0.1:5005';

const failureRate = new Rate('custom_failure_rate');
const displayDuration = new Trend('queue_display_duration');
const trackDuration = new Trend('queue_track_duration');

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
  // 1. Fetch TV Waiting room display
  const resDisplay = http.get(`${BASE_URL}/api/v1/queue/display?date=${testData.todayDate}`, {
    tags: { name: 'GET_queue_display' },
  });
  displayDuration.add(resDisplay.timings.duration);

  const okDisplay = check(resDisplay, {
    'display status is 200': (r) => r.status === 200,
    'display has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.data.nowServing);
      } catch {
        return false;
      }
    },
  });

  // 2. Fetch Personal Token Track status
  const randomSeq = Math.floor(Math.random() * 50) + 1;
  const token = `GEN-${String(randomSeq).padStart(2, '0')}`;
  const resTrack = http.get(`${BASE_URL}/api/v1/queue/track/${token}`, {
    tags: { name: 'GET_queue_track' },
  });
  trackDuration.add(resTrack.timings.duration);

  const okTrack = check(resTrack, {
    'track status is 200': (r) => r.status === 200,
  });

  failureRate.add(!okDisplay || !okTrack);
  sleep(0.05);
}
