import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const testData = JSON.parse(open('./test-data.json'));
const BASE_URL = __ENV.TARGET_URL || testData.baseUrl || 'http://127.0.0.1:5005';

const failureRate = new Rate('custom_failure_rate');
const staffQueueDuration = new Trend('staff_queue_duration');
const callNextDuration = new Trend('call_next_duration');
const safetyConflictCount = new Counter('clinical_safety_conflict_409');
const successfulCallCount = new Counter('successful_call_count_200');

export const options = {
  stages: [
    { duration: '3s', target: parseInt(__ENV.VUS || '10', 10) },
    { duration: '8s', target: parseInt(__ENV.VUS || '10', 10) },
    { duration: '2s', target: 0 },
  ],
  thresholds: {
    custom_failure_rate: ['rate<0.02'],
    http_req_duration: ['p(95)<600'],
  },
};

export default function () {
  const isDoctor1 = __VU % 2 === 0;
  const doctor = isDoctor1 ? testData.doctors[0] : testData.doctors[1];
  const token = isDoctor1 ? testData.tokens.doctor1 : testData.tokens.doctor2;

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 1. Doctor retrieves active queue
  const resQueue = http.get(`${BASE_URL}/api/v1/staff/queue?doctorId=${doctor.id}`, {
    headers: authHeaders,
    tags: { name: 'GET_staff_queue' },
  });
  staffQueueDuration.add(resQueue.timings.duration);

  const okQueue = check(resQueue, {
    'staff queue status is 200': (r) => r.status === 200,
  });

  // 2. Doctor calls next patient
  const callPayload = JSON.stringify({ doctorId: doctor.id });
  const resCall = http.post(`${BASE_URL}/api/v1/staff/queue/call-next`, callPayload, {
    headers: authHeaders,
    tags: { name: 'POST_staff_queue_call_next' },
  });
  callNextDuration.add(resCall.timings.duration);

  // Invariant check: Status must be 200 (patient called) or 409 (Doctor exclusivity / active consultation lock)
  // NEVER 500 internal server error
  const okCall = check(resCall, {
    'call-next status is 200 or 409': (r) => r.status === 200 || r.status === 409,
    'never 500 server error': (r) => r.status !== 500,
  });

  if (resCall.status === 200) {
    successfulCallCount.add(1);
    try {
      const data = JSON.parse(resCall.body).data;
      const entryId = data?.calledEntry?._id || data?._id;
      if (entryId) {
        // Start serving
        http.post(`${BASE_URL}/api/v1/staff/queue/${entryId}/serve`, JSON.stringify({ doctorId: doctor.id }), {
          headers: authHeaders,
          tags: { name: 'POST_staff_queue_serve' },
        });
        // Complete consultation
        http.post(`${BASE_URL}/api/v1/staff/queue/${entryId}/complete`, JSON.stringify({ doctorId: doctor.id }), {
          headers: authHeaders,
          tags: { name: 'POST_staff_queue_complete' },
        });
      }
    } catch {}
  } else if (resCall.status === 409) {
    safetyConflictCount.add(1);
  }

  failureRate.add(!okQueue || !okCall);
  sleep(0.08);
}
