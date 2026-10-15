# K6 Load & Performance Testing

## Setup

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows
choco install k6

# Docker
docker pull grafana/k6
```

## Test Scripts

| Script                  | Type       | Description                           | Peak VUs | Duration |
| ----------------------- | ---------- | ------------------------------------- | -------- | -------- |
| `load-test.js`          | Load       | Public endpoints under graduated load | 500      | ~10m     |
| `authenticated-flow.js` | Load       | Recruiter browsing simulation         | 500      | ~10m     |
| `stress-test.js`        | Stress     | Push system past normal capacity      | 1000     | ~8m      |
| `spike-test.js`         | Spike      | Sudden traffic surges and recovery    | 1200     | ~5m      |
| `soak-test.js`          | Soak       | Sustained load over extended period   | 200      | 10m+     |
| `breakpoint-test.js`    | Breakpoint | Find maximum throughput capacity      | 2000     | ~10m     |
| `api-benchmark.js`      | Benchmark  | Per-endpoint latency profiling        | 50       | 3m       |

## Quick Start

```bash
# Ensure the app is running first
npm run dev

# Run via npm scripts
npm run k6:load          # Standard load test
npm run k6:stress        # Stress test (1000 VUs)
npm run k6:spike         # Spike test (sudden surges)
npm run k6:soak          # Soak / endurance test (10 min default)
npm run k6:benchmark     # Per-endpoint benchmarks
npm run k6:breakpoint    # Find the breaking point
npm run k6:auth          # Authenticated recruiter flow
```

## Running Against Different Environments

```bash
# Local (default)
k6 run k6/load-test.js

# Staging
k6 run -e BASE_URL=https://staging.tigerhire.io k6/load-test.js

# Production (use with caution!)
k6 run -e BASE_URL=https://tigerhire.io k6/api-benchmark.js --vus 10 --duration 1m
```

## Customizing Soak Tests

```bash
# 30-minute soak with 300 VUs
k6 run -e SOAK_DURATION=30m -e SOAK_VUS=300 k6/soak-test.js

# 1-hour endurance run
k6 run -e SOAK_DURATION=60m -e SOAK_VUS=200 k6/soak-test.js
```

## Output Formats

```bash
# JSON output (for CI/CD integration)
k6 run --out json=k6/results.json k6/load-test.js

# CSV output
k6 run --out csv=k6/results.csv k6/load-test.js

# InfluxDB (for Grafana dashboards)
k6 run --out influxdb=http://localhost:8086/k6 k6/load-test.js
```

## Performance Targets

### API Endpoints

| Metric               | Target   | Measured By                        |
| -------------------- | -------- | ---------------------------------- |
| Health liveness p95  | < 100ms  | `api-benchmark.js`                 |
| Health readiness p95 | < 500ms  | `api-benchmark.js`                 |
| Jobs list p95        | < 500ms  | `api-benchmark.js`, `load-test.js` |
| Homepage p95         | < 1000ms | `api-benchmark.js`                 |
| Overall p95          | < 500ms  | `load-test.js`                     |
| Overall p99          | < 2000ms | `load-test.js`                     |

### Capacity

| Metric                     | Target | Measured By      |
| -------------------------- | ------ | ---------------- |
| Sustained concurrent users | 500    | `load-test.js`   |
| Stress concurrent users    | 1000   | `stress-test.js` |
| Spike tolerance            | 1200   | `spike-test.js`  |
| Error rate (normal load)   | < 1%   | `load-test.js`   |
| Error rate (stress)        | < 10%  | `stress-test.js` |
| Error rate (soak)          | < 2%   | `soak-test.js`   |

### Endurance

| Metric                     | Target          | Measured By    |
| -------------------------- | --------------- | -------------- |
| Degraded responses (>2s)   | < 5%            | `soak-test.js` |
| Memory leak detection      | No upward trend | `soak-test.js` |
| Connection pool exhaustion | None            | `soak-test.js` |

## Test Types Explained

### Load Test (`load-test.js`)

Standard graduated load test. Ramps to 500 VUs and sustains. Validates
the system meets baseline performance targets under expected peak traffic.

### Stress Test (`stress-test.js`)

Pushes the system well beyond normal load (1000 VUs). Identifies breaking
points and validates graceful degradation under extreme conditions.

### Spike Test (`spike-test.js`)

Simulates sudden traffic surges (10 → 800 → 10 → 1200 VUs). Tests
auto-scaling behavior and how quickly the system recovers after spikes.

### Soak Test (`soak-test.js`)

Sustained moderate load over an extended period. Detects:

- Memory leaks
- Connection pool exhaustion
- Database connection limit issues
- Gradual performance degradation
- Resource cleanup failures

### Breakpoint Test (`breakpoint-test.js`)

Continuously ramps up request rate using `ramping-arrival-rate`. Auto-aborts
when error rate > 30% or p99 > 10s. Identifies the exact throughput limit.

### API Benchmark (`api-benchmark.js`)

Per-endpoint latency profiling with dedicated custom metrics per route.
Produces a detailed breakdown for performance regression detection in CI.

## CI Integration

The CI pipeline runs `k6:benchmark` on PRs with reduced parameters (10 VUs, 1m).
Results are uploaded as artifacts for review.

For full load testing, run the scripts manually against a staging environment.
