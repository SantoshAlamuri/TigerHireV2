# Launch critical-path preflight (auto-generated)

- Generated at (UTC): 2026-07-07T12:27:50.099Z
- Commit SHA: b6b751bc6984e0fc6f9b4b4e6eabeb3f35a2c6ed
- Overall: FAIL

## Automated checks

| Check                               | Status  | Duration | Notes                                             |
| ----------------------------------- | ------- | -------- | ------------------------------------------------- |
| Typecheck                           | FAIL    | 7191ms   | > tigerhire@0.1.0 typecheck                       |
| API route guard audit               | PASS    | 46ms     | exit 0                                            |
| Functional smoke (launch-p1-routes) | PASS    | 1303ms   | exit 0                                            |
| Assessment integration unit tests   | PASS    | 653ms    | exit 0                                            |
| Remote health                       | SKIPPED | —        | Set `LAUNCH_BASE_URL` to probe production/preview |

## Manual steps still required

1. Walk recruiter → apply → score → offer → sign on target environment.
2. Attach recording link in `docs/launch/PUNCH-LIST.md`.
3. Sign `docs/launch/SECURITY-MUTATION-AUDIT-SIGNOFF.md`.
4. Ops: uptime monitor screenshot in `PRE-LAUNCH-INFRA-CHECKLIST.md`.
