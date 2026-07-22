import http from 'k6/http';
import { check, sleep } from 'k6';

// CI 冒烟压测：只测无认证端点，不需要 sync secret。
// 用于 CI pipeline，每次 push 到 main 时跑。
// 验证生产 API 基本并发能力和响应时间。

const BASE_URL = __ENV.BASE_URL || 'https://api.welian.app';

export const options = {
  stages: [
    { duration: '10s', target: 20 },
    { duration: '20s', target: 20 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/ai/config`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has model field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.model !== undefined || body.llm_model !== undefined || body.ok !== undefined;
      } catch {
        return false;
      }
    },
  });
  sleep(0.5);
}
