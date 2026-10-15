# Load & stress tests (k6)

TigerHire uses [k6](https://grafana.com/docs/k6/latest/) for load and stress testing.

## Install k6

- **Windows (scoop):** `scoop install k6`
- **macOS:** `brew install k6`
- **Linux:** See [Install k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)

## Run tests

Start the app first (e.g. `npm run dev`), then in another terminal:

```bash
# Smoke: 10 VUs for 30s (quick sanity check)
k6 run load/smoke.js

# Stress: ramp 0→50 VUs, hold 1m, spike to 100 VUs
k6 run load/stress.js

# Against a deployed URL
BASE_URL=https://staging.tigerhire.com k6 run load/stress.js

# Custom VUs and duration
k6 run --vus 200 --duration 5m load/stress.js
```

## Scripts

| Script      | Purpose                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| `smoke.js`  | Light load; checks health and homepage.                                      |
| `stress.js` | Ramp + sustain + spike; hits homepage, health, about, pricing, login, apply. |

## Thresholds

- **stress.js:** &lt;5% failed requests; p95 &lt;5s, p99 &lt;10s.
- **smoke.js:** &lt;1% failed; p95 &lt;3s.

Adjust in the `options.thresholds` block of each script.

## npm script (no k6 required)

For a quick stress run without installing k6, use autocannon (hits homepage only):

```bash
npm run test:stress
```

Start the app first (`npm run dev`). To target another URL: `BASE_URL=https://staging.example.com npm run test:stress`.

## 100k users

To simulate higher load (e.g. 100k concurrent users), use more VUs and run against a staging/production environment with appropriate infra. See `docs/SCALABILITY-100K-USERS.md` for capacity planning.
