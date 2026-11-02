# Load Testing with k6

## Installation

```bash
# macOS
brew install k6

# Windows (winget)
winget install k6

# Docker
docker run --rm -i grafana/k6 run - <k6/load-test.js
```

## Running

```bash
# Against local server
k6 run k6/load-test.js

# Against staging
k6 run -e API_URL=https://your-staging-api.railway.app/api/v1 k6/load-test.js

# Against production (be careful!)
k6 run -e API_URL=https://your-prod-api.railway.app/api/v1 \
       -e TEST_EMAIL=admin@almahafarm.com \
       -e TEST_PASSWORD=YourPassword k6/load-test.js
```

## Stages

The default test ramps up as follows:
1. 30s ramp to 10 virtual users
2. 1m sustain at 30 virtual users
3. 2m sustain at 50 virtual users
4. 1m spike to 100 virtual users
5. 30s ramp down to 0

## Thresholds

- 95th percentile response time < 2 seconds
- Error rate < 10%

## Interpreting Results

- `http_req_duration` - Response time histogram
- `errors` - Percentage of failed requests
- `login_duration` - Time to authenticate
- `http_reqs` - Total requests per second throughput
