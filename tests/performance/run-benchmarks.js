/**
 * QueueLess Automated Load Testing & Benchmark Orchestrator
 *
 * Runs k6 load testing scenarios across controlled VU stages:
 * 10, 25, 50, 100, 250, 500 VUs.
 * Captures comprehensive performance metrics and exports consolidated results.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const K6_BIN = 'C:\\Users\\snehi\\Nithin\\QueueLess\\bin\\k6.exe';
const K6_DIR = path.resolve(__dirname, 'k6');
const RESULTS_DIR = path.resolve(__dirname, 'results');
const CONSOLIDATED_PATH = path.resolve(RESULTS_DIR, 'consolidated-summary.json');

const SCENARIOS = [
  { id: 'A', name: 'Appointment Availability Requests', script: 'scenario-a-availability.js' },
  { id: 'B', name: 'Appointment Request Creation', script: 'scenario-b-appointment-request.js' },
  { id: 'C', name: 'Queue Status Retrieval', script: 'scenario-c-queue-status.js' },
  { id: 'D', name: 'Patient Check-In', script: 'scenario-d-patient-checkin.js' },
  { id: 'E', name: 'Walk-In Registration', script: 'scenario-e-walkin-registration.js' },
  { id: 'F', name: 'Staff Queue Operations', script: 'scenario-f-staff-queue-ops.js' },
  { id: 'G', name: 'Realistic Mixed Workload', script: 'scenario-g-mixed-workload.js' },
];

const VU_STAGES = [10, 25, 50, 100, 250, 500];

function parseK6Summary(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const m = raw.metrics || {};

  const httpReqs = m.http_reqs ? (m.http_reqs.count ?? m.http_reqs.values?.count ?? 0) : 0;
  const httpRate = m.http_reqs ? (m.http_reqs.rate ?? m.http_reqs.values?.rate ?? 0) : 0;
  const duration = m.http_req_duration ? (m.http_req_duration.values || m.http_req_duration) : {};
  const failedRate = m.http_req_failed ? (m.http_req_failed.value ?? m.http_req_failed.values?.rate ?? 0) * 100 : 0;

  return {
    totalRequests: httpReqs,
    rps: parseFloat(httpRate.toFixed(2)),
    avgMs: parseFloat((duration.avg || 0).toFixed(2)),
    medMs: parseFloat((duration.med || 0).toFixed(2)),
    p90Ms: parseFloat((duration['p(90)'] || 0).toFixed(2)),
    p95Ms: parseFloat((duration['p(95)'] || 0).toFixed(2)),
    p99Ms: parseFloat((duration['p(99)'] || duration['p(95)'] || 0).toFixed(2)),
    maxMs: parseFloat((duration.max || 0).toFixed(2)),
    failureRatePct: parseFloat(failedRate.toFixed(2)),
  };
}

async function run() {
  console.log('================================================================');
  console.log(' QueueLess Phase 4: Performance & Load Testing Suite');
  console.log('================================================================\n');

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const consolidated = {
    testDate: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      database: 'queueless_test (local standalone MongoDB)',
      serverUrl: 'http://127.0.0.1:5005',
    },
    results: [],
  };

  // Re-seed once before starting benchmark suite
  console.log('>>> Seeding deterministic test database fixtures...');
  execSync('node scripts/seed-load-data.js', {
    cwd: 'C:\\Users\\snehi\\Nithin\\QueueLess\\queueless-app\\server',
    stdio: 'inherit',
  });
  console.log('>>> Seed complete.\n');

  for (const scenario of SCENARIOS) {
    console.log(`----------------------------------------------------------------`);
    console.log(`Scenario ${scenario.id}: ${scenario.name}`);
    console.log(`Script: ${scenario.script}`);
    console.log(`----------------------------------------------------------------`);

    for (const vus of VU_STAGES) {
      const summaryFile = path.resolve(RESULTS_DIR, `summary-${scenario.id.toLowerCase()}-${vus}vus.json`);
      console.log(`  -> Running ${vus} VUs stage...`);

      try {
        const cmd = `"${K6_BIN}" run -e VUS=${vus} -e TARGET_URL=http://127.0.0.1:5005 --summary-export="${summaryFile}" "${path.resolve(K6_DIR, scenario.script)}"`;
        execSync(cmd, { stdio: 'pipe' });
      } catch (err) {
        // k6 exits with non-zero when thresholds fail, but summaryFile is still written
      }

      const metrics = parseK6Summary(summaryFile);
      if (metrics) {
        console.log(
          `     ✓ ${vus} VUs: ${metrics.totalRequests} reqs | ${metrics.rps} req/s | Avg: ${metrics.avgMs}ms | p95: ${metrics.p95Ms}ms | Fail: ${metrics.failureRatePct}%`
        );
        consolidated.results.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          vus,
          ...metrics,
        });

        // Abort further ramp-up if failure rate exceeds 20% or p95 exceeds 5000ms
        if (metrics.failureRatePct > 20) {
          console.warn(`     [LOAD GATE] Failure rate exceeded threshold (${metrics.failureRatePct}% > 20%). Halting further ramp-up for ${scenario.name}.`);
          break;
        }
        if (metrics.p95Ms > 5000) {
          console.warn(`     [LOAD GATE] p95 latency exceeded 5,000ms (${metrics.p95Ms}ms). Halting further ramp-up for ${scenario.name}.`);
          break;
        }
      } else {
        console.error(`     ✗ Failed to produce summary at ${vus} VUs.`);
        break;
      }
    }
    console.log('');
  }

  fs.writeFileSync(CONSOLIDATED_PATH, JSON.stringify(consolidated, null, 2), 'utf-8');
  console.log(`\n✓ Consolidated performance results saved to: ${CONSOLIDATED_PATH}`);
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
