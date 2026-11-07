import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const testData = JSON.parse(open('./test-data.json'));
const BASE_URL = __ENV.TARGET_URL || testData.baseUrl || 'http://127.0.0.1:5005';

const failureRate = new Rate('custom_failure_rate');
const walkinDuration = new Trend('walkin_duration');
const registeredCount = new Counter('walkin_registered_count');

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
  const doctor = testData.doctors[Math.floor(Math.random() * testData.doctors.length)];
  const dept = testData.departments[Math.floor(Math.random() * testData.departments.length)];

  const payload = JSON.stringify({
    doctorId: doctor.id,
    departmentId: dept.id,
    patientName: `WalkIn_VU_${__VU}_Iter_${__ITER}`,
    gender: 'MALE',
    age: 35,
    phone: `98765${String(Math.floor(Math.random() * 90000) + 10000)}`,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testData.tokens.receptionist}`,
    },
    tags: { name: 'POST_staff_queue_walkin' },
  };

  const res = http.post(`${BASE_URL}/api/v1/staff/queue/walk-in`, payload, params);
  walkinDuration.add(res.timings.duration);

  const ok = check(res, {
    'status is 201': (r) => r.status === 201,
    'token generated': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && typeof body.data.token === 'string';
      } catch {
        return false;
      }
    },
  });

  if (ok) registeredCount.add(1);
  failureRate.add(!ok);
  sleep(0.08);
}
