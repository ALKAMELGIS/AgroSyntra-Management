import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.API_URL || 'http://localhost:3001/api/v1';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'admin@almahafarm.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'Admin123!@#';

const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 30 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    errors: ['rate<0.1'],
  },
};

function getToken() {
  const start = Date.now();
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  }), { headers: { 'Content-Type': 'application/json' } });

  loginDuration.add(Date.now() - start);

  if (res.status === 200) {
    const body = JSON.parse(res.body);
    return body.data?.tokens?.accessToken || body.data?.accessToken || '';
  }
  return '';
}

export default function () {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health OK': (r) => r.status === 200 });
  errorRate.add(healthRes.status !== 200);

  // List recipes
  const recipesRes = http.get(`${BASE_URL}/recipes?limit=10`, { headers });
  check(recipesRes, { 'recipes OK': (r) => r.status === 200 });
  errorRate.add(recipesRes.status !== 200);

  // List inventory
  const invRes = http.get(`${BASE_URL}/inventory?limit=10`, { headers });
  check(invRes, { 'inventory OK': (r) => r.status === 200 });
  errorRate.add(invRes.status !== 200);

  // List tasks
  const tasksRes = http.get(`${BASE_URL}/tasks?limit=10`, { headers });
  check(tasksRes, { 'tasks OK': (r) => r.status === 200 });
  errorRate.add(tasksRes.status !== 200);

  // Analytics
  const analyticsRes = http.get(`${BASE_URL}/analytics/dashboard`, { headers });
  check(analyticsRes, { 'analytics OK': (r) => r.status === 200 || r.status === 404 });

  sleep(1);
}
