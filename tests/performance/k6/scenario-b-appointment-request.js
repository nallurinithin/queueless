import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const testData = JSON.parse(open('./test-data.json'));
const BASE_URL = __ENV.TARGET_URL || testData.baseUrl || 'http://127.0.0.1:5005';

const failureRate = new Rate('custom_failure_rate');
const apptCreationDuration = new Trend('appointment_creation_duration');

export const options = {
  stages: [
    { duration: '3s', target: parseInt(__ENV.VUS || '10', 10) },
    { duration: '8s', target: parseInt(__ENV.VUS || '10', 10) },
    { duration: '2s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function () {
  const vuIndex = (__VU - 1) % testData.patientTokens.length;
  const token = testData.patientTokens[vuIndex];
  const dept = testData.departments[Math.floor(Math.random() * testData.departments.length)];

  const payload = JSON.stringify({
    patientTarget: 'SELF',
    departmentId: dept.id,
    requestedWindow: {
      preferredDate: testData.todayDate,
      preferredTimeSlot: 'Morning',
      reasonCategory: 'General Consultation',
      notes: 'Load testing request',
    },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { name: 'POST_appointments_request' },
  };

  const res = http.post(`${BASE_URL}/api/v1/appointments/request`, payload, params);

  if (res.status !== 201) {
    console.log(`[SCENARIO B ERROR] Status: ${res.status}, Body: ${res.body}`);
  }

  apptCreationDuration.add(res.timings.duration);
  const ok = check(res, {
    'status is 201': (r) => r.status === 201,
    'has bookingReference': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && typeof body.data.bookingReference === 'string';
      } catch {
        return false;
      }
    },
  });

  failureRate.add(!ok);
  sleep(0.08);
}
