import http from 'k6/http';
import { check, sleep } from 'k6';

// LLM 端点压测：测 LLM 相关端点在并发下的表现
// - POST /ai/extract_intent  10 并发 60s
// - POST /ai/advise_cloud      5 并发 60s
// 阈值：p95 < 10s，错误率 < 10%

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8787';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'perf_test:testsecret';

export const options = {
  scenarios: {
    extract_intent: {
      executor: 'ramping-vus',
      exec: 'extractIntentScenario',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '60s', target: 10 },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    advise_cloud: {
      executor: 'ramping-vus',
      exec: 'adviseCloudScenario',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 5 },
        { duration: '60s', target: 5 },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_duration{scenario:extract_intent}': ['p(95)<10000'],
    'http_req_duration{scenario:advise_cloud}': ['p(95)<10000'],
    'http_req_failed{scenario:extract_intent}': ['rate<0.10'],
    'http_req_failed{scenario:advise_cloud}': ['rate<0.10'],
  },
};

const params = {
  headers: {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
};

export function extractIntentScenario() {
  const body = JSON.stringify({
    session_token: 'perf_test:testsecret',
    text: '记一下今天和老许聊了项目进展',
  });
  const res = http.post(`${BASE_URL}/ai/extract_intent`, body, params);
  check(res, {
    'extract_intent status is 200': (r) => r.status === 200,
  });
  sleep(0.5);
}

export function adviseCloudScenario() {
  const body = JSON.stringify({
    session_token: 'perf_test:testsecret',
    text: '该联系谁了',
  });
  const res = http.post(`${BASE_URL}/ai/advise_cloud`, body, params);
  check(res, {
    'advise_cloud status is 200': (r) => r.status === 200,
  });
  sleep(0.5);
}
