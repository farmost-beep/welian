import http from 'k6/http';
import { check, sleep } from 'k6';

// 冒烟压测：验证基本并发能力，不跑重端点
// - GET /ai/config  50 并发 30s（无认证）
// - GET /data/contacts 20 并发 30s（需认证）

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8787';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'perf_test:testsecret';

export const options = {
  scenarios: {
    config: {
      executor: 'ramping-vus',
      exec: 'configScenario',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 50 },
        { duration: '30s', target: 50 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
    contacts: {
      executor: 'ramping-vus',
      exec: 'contactsScenario',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 20 },
        { duration: '30s', target: 20 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

const authParams = {
  headers: {
    Authorization: `Bearer ${AUTH_TOKEN}`,
  },
};

export function configScenario() {
  const res = http.get(`${BASE_URL}/ai/config`);
  check(res, {
    'config status is 200': (r) => r.status === 200,
  });
  sleep(0.2);
}

export function contactsScenario() {
  const res = http.get(`${BASE_URL}/data/contacts`, authParams);
  check(res, {
    'contacts status is 200': (r) => r.status === 200,
  });
  sleep(0.2);
}
