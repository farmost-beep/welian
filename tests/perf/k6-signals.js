import http from 'k6/http';
import { check, sleep } from 'k6';

// 信号端点压测（最重）：测最重的 hn_signals 端点
// - POST /ai/hn_signals  3 并发 120s
// 阈值：p95 < 30s，错误率 < 20%（这个端点可能超时）

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8787';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'perf_test:testsecret';

export const options = {
  scenarios: {
    hn_signals: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 3 },
        { duration: '120s', target: 3 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<30000'],
    http_req_failed: ['rate<0.20'],
  },
};

const params = {
  headers: {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
  // 这个端点耗时 5-15s，给足超时余量
  timeout: '60s',
};

export default function () {
  const body = JSON.stringify({
    session_token: 'perf_test:testsecret',
  });
  const res = http.post(`${BASE_URL}/ai/hn_signals`, body, params);
  check(res, {
    'hn_signals status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
