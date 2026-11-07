import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const testData = JSON.parse(open('./test-data.json'));
const BASE_URL = __ENV.TARGET_URL || testData.baseUrl || 'http://127.0.0.1:5005';

const failureRate = new Rate('custom_failure_rate');
const mixedDuration = new Trend('mixed_workload_duration');

export const options = {
  stages: [
    { duration: '3s', target: parseInt(__ENV.VUS || '10', 10) },
    { duration: '8s', target: parseInt(__ENV.VUS || '10', 10) },
    { duration: '2s', target: 0 },
  ],
  thresholds: {
    custom_failure_rate: ['rate<0.05'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function () {
  const rand = Math.random();

  if (rand < 0.45) {
    // -------------------------------------------------------------------------
    // 45% READ OPERATIONS: Display, Tracker, Availability
    // -------------------------------------------------------------------------
    const subRand = Math.random();
    if (subRand < 0.5) {
      // Waiting room display polling (every 4s in real app)
      const res = http.get(`${BASE_URL}/api/v1/queue/display?date=${testData.todayDate}`, {
        tags: { name: 'GET_queue_display' },
      });
      mixedDuration.add(res.timings.duration);
      check(res, { 'display status 200': (r) => r.status === 200 });
    } else if (subRand < 0.8) {
      // Patient device tracker polling
      const token = `GEN-${String((__ITER % 25) + 1).padStart(2, '0')}`;
      const res = http.get(`${BASE_URL}/api/v1/queue/track/${token}`, {
        tags: { name: 'GET_queue_track' },
      });
      mixedDuration.add(res.timings.duration);
      check(res, { 'track status 200': (r) => r.status === 200 });
    } else {
      // Schedule availability
      const dept = testData.departments[__ITER % testData.departments.length];
      const res = http.get(`${BASE_URL}/api/v1/public/requestable-times?date=${testData.todayDate}&departmentId=${dept.id}`, {
        tags: { name: 'GET_requestable_times' },
      });
      mixedDuration.add(res.timings.duration);
      check(res, { 'schedule status 200': (r) => r.status === 200 });
    }
  } else if (rand < 0.70) {
    // -------------------------------------------------------------------------
    // 25% STAFF OPERATIONS: Doctor Queue, Call-Next, Serve, Complete
    // -------------------------------------------------------------------------
    const isDoc1 = __VU % 2 === 0;
    const doctor = isDoc1 ? testData.doctors[0] : testData.doctors[1];
    const token = isDoc1 ? testData.tokens.doctor1 : testData.tokens.doctor2;
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    if (Math.random() < 0.6) {
      // Doctor queue refresh
      const res = http.get(`${BASE_URL}/api/v1/staff/queue?doctorId=${doctor.id}`, {
        headers: authHeaders,
        tags: { name: 'GET_staff_queue' },
      });
      mixedDuration.add(res.timings.duration);
      check(res, { 'staff queue 200': (r) => r.status === 200 });
    } else {
      // Call-next
      const res = http.post(`${BASE_URL}/api/v1/staff/queue/call-next`, JSON.stringify({ doctorId: doctor.id }), {
        headers: authHeaders,
        tags: { name: 'POST_staff_queue_call_next' },
      });
      mixedDuration.add(res.timings.duration);
      // Clinical safety invariant: 200 or 409
      check(res, { 'call-next 200 or 409': (r) => r.status === 200 || r.status === 409 });
    }
  } else if (rand < 0.85) {
    // -------------------------------------------------------------------------
    // 15% PATIENT CHECK-IN: Self-Service QR / Reference Check-In
    // -------------------------------------------------------------------------
    const refIndex = ((__VU * 20) + __ITER) % testData.bookingReferences.length;
    const ref = testData.bookingReferences[refIndex];
    const res = http.post(
      `${BASE_URL}/api/v1/queue/check-in`,
      JSON.stringify({ bookingReference: ref }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'POST_queue_checkin' },
      }
    );
    mixedDuration.add(res.timings.duration);
    check(res, { 'checkin status 200': (r) => r.status === 200 });
  } else if (rand < 0.95) {
    // -------------------------------------------------------------------------
    // 10% WALK-IN REGISTRATION: Receptionist counter token generation
    // -------------------------------------------------------------------------
    const doctor = testData.doctors[__ITER % testData.doctors.length];
    const dept = testData.departments[__ITER % testData.departments.length];
    const res = http.post(
      `${BASE_URL}/api/v1/staff/queue/walk-in`,
      JSON.stringify({
        doctorId: doctor.id,
        departmentId: dept.id,
        patientName: `Mixed_WalkIn_${__VU}_${__ITER}`,
        gender: 'FEMALE',
        age: 26,
        phone: `98765${String(Math.floor(Math.random() * 90000) + 10000)}`,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testData.tokens.receptionist}`,
        },
        tags: { name: 'POST_staff_queue_walkin' },
      }
    );
    mixedDuration.add(res.timings.duration);
    check(res, { 'walkin status 201': (r) => r.status === 201 });
  } else {
    // -------------------------------------------------------------------------
    // 5% APPOINTMENT REQUESTS: Online booking requests
    // -------------------------------------------------------------------------
    const patientToken = testData.patientTokens[__VU % testData.patientTokens.length];
    const dept = testData.departments[__ITER % testData.departments.length];
    const res = http.post(
      `${BASE_URL}/api/v1/appointments/request`,
      JSON.stringify({
        patientTarget: 'SELF',
        departmentId: dept.id,
        requestedWindow: {
          preferredDate: testData.todayDate,
          preferredTimeSlot: 'Morning',
          reasonCategory: 'General Consultation',
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${patientToken}`,
        },
        tags: { name: 'POST_appointments_request' },
      }
    );
    mixedDuration.add(res.timings.duration);
    check(res, { 'appointment request 201': (r) => r.status === 201 });
  }

  sleep(0.05);
}
