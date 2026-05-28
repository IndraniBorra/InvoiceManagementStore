# Invoice Management System — Project Analysis

**Date:** 2026-05-27
**Scope:** Architecture review, gap analysis, performance assessment, and AWS production-readiness evaluation.
**Verdict:** ~65% AWS-ready. Infrastructure scaffolding exists, but **no authentication**, **plaintext bank tokens**, **publicly-exposed RDS**, and **ephemeral SQLite fallback** are blockers for production.

---

## 1. Executive Summary

The Invoice Management System (IMS) is a FastAPI + React application targeting AWS Lambda + RDS + S3/CloudFront. Functionally it has grown well beyond basic invoicing (AP, double-entry accounting, ML-based PDF extraction, Plaid bank integration, SARIMA/XGBoost forecasting, Anthropic-powered assistant). Operationally, however, it carries production-blocking gaps in **security**, **persistence**, **observability**, and **cold-start performance**.

| Area | Status | Production-blocking? |
|---|---|---|
| Functional surface area | Rich | No |
| Authentication / authorization | **Missing** | **Yes** |
| Database persistence on Lambda | **Fragile (SQLite fallback)** | **Yes** |
| Secrets handling | Env vars only | Yes |
| Observability | Logs only, no metrics/alarms | Yes |
| Cold-start performance | 20–30s with ML deps | High-impact |
| CI/CD | Builds, no tests | Medium |

---

## 2. Architecture Snapshot

- **Backend:** FastAPI 0.115 + SQLModel + Mangum on AWS Lambda (container image after `dff9b2c`).
- **Frontend:** Create-React-App + Axios + React Router, hosted on S3 + CloudFront.
- **DB:** SQLite locally; RDS PostgreSQL 15 (`db.t3.micro`) provisioned in `serverless.yaml`.
- **Integrations:** Plaid (bank), Anthropic (assistant), in-repo `ml-extractor` (PDF → invoice).
- **Infra:** `serverless.yaml` for backend; Terraform under `infra/frontend` for S3/CloudFront; GitHub Actions in `.github/workflows`.

---

## 3. Gap Analysis

### 3.1 Security (Critical)

| # | Gap | Severity | Notes |
|---|---|---|---|
| S1 | **No auth on any endpoint** | Critical | Frontend `api.js` sends `Bearer` tokens but backend ignores them. All CRUD is unauthenticated. |
| S2 | **Plaid access tokens stored plaintext** in `BankAccount.plaid_access_token` (`models.py:50`) | Critical | Bank linkages compromised on any DB read. |
| S3 | RDS publicly accessible (`0.0.0.0/0` ingress, `PubliclyAccessible: true`) | High | DB exposed to internet; brute-force surface. |
| S4 | Rate limiting is per-Lambda-instance in-memory | High | Doesn't compose across concurrent Lambdas; effectively bypassed under load. |
| S5 | CORS origins partly hardcoded (`localhost:3000`, `localhost:3002`) | Medium | Env override exists but defaults leak into prod if `ALLOWED_ORIGINS` unset. |
| S6 | No CSRF guard, no Content-Security-Policy on CloudFront | Medium | XSS-injected scripts could call API freely. |
| S7 | Secrets (Plaid, Anthropic, DB password) in Lambda env vars | Medium | Visible in console; no rotation. Use Secrets Manager. |

### 3.2 Data & Persistence

- **SQLite fallback in `database.py:4–13`**: if `DATABASE_URL` unset, app writes to local SQLite. On Lambda this lands in the ephemeral filesystem and is **lost on every cold start**. First deploys silently lose data until RDS endpoint is wired up.
- **No migrations.** `SQLModel.metadata.create_all()` runs at startup — fine for greenfield, but schema evolution will break in place. **Add Alembic.**
- **No connection pooling parameters** on the SQLModel engine (no `pool_size`, `pool_pre_ping`, `max_overflow`). Lambda concurrency × per-handler connections can saturate `db.t3.micro`'s ~85 connection limit quickly.
- **Auto-seeding in `main.py` startup** (Chart of Accounts, default company, category rules) is appropriate for dev but should be guarded behind an env flag in prod to avoid race conditions across cold-starting Lambdas.

### 3.3 Observability

- X-Ray tracing flag is enabled in `serverless.yaml` but the SDK is not wired into the FastAPI app.
- No CloudWatch alarms (error rate, p95 latency, throttles, RDS connections, RDS CPU).
- No structured logging (logs go to stdout via `RequestLoggingMiddleware`); no request-ID propagation to downstream calls (Plaid, Anthropic, ml-extractor).
- No metric for Anthropic token spend or Plaid API quota.

### 3.4 Reliability

- **No retries / circuit breakers** around Plaid or Anthropic calls. A Plaid 5xx surfaces as a 500 to the user.
- **Anthropic client lacks an explicit timeout** in `routes/assistant.py`. Combined with Lambda's 30s ceiling, this can starve the request and bill for the full window.
- **ml-extractor call** (`ap_routes.py:32–83`) is async with a 60s timeout — but Lambda's own timeout is 30s, so the timeout is effectively unreachable.

### 3.5 CI/CD & Environments

- Workflows are **manual-only** (per commit `13456e2`), which is intentional but leaves no automated regression gate.
- **No tests run in CI** (neither `pytest` nor `jest`).
- **Single environment.** No staging vs. prod separation; no per-env config; no blue/green or canary.
- Frontend `api.js` falls back to `http://localhost:8000` if `REACT_APP_API_URL` is missing — easy to ship a broken build.

### 3.6 Frontend

- CRA is in long-term maintenance mode; bundle size grows with no analyzer in CI.
- No global error boundary or toast surface visible from a quick scan.
- No code-splitting per route → first paint pulls all pages including Forecasting/Accounting.

---

## 4. Performance Issues

| # | Issue | Where | Estimated Impact |
|---|---|---|---|
| P1 | **Cold start 20–30s** from `xgboost`, `statsmodels`, `scikit-learn`, `anthropic` imported at module load | `forecasting_routes.py`, `routes/assistant.py` | First request after idle ~30s wait |
| P2 | **N+1 access** over invoices/payments in forecasting and AP aggregation | `forecasting_routes.py:205–215` | 10–100× slower on real data volumes |
| P3 | **No connection pooling** | `database.py` | RDS connection storms under concurrency |
| P4 | **Sync DB I/O in async handlers** (most routes are `def` not `async def` despite FastAPI) | All routes | Lambda single-thread blocks during DB call |
| P5 | **Lambda memory 512MB** with ML libs loaded | `serverless.yaml:78–90` | OOM on large PDFs; underpowered CPU share |
| P6 | **Anthropic / Plaid clients created per request** | `plaid_routes.py` | TCP/TLS handshake on every call |
| P7 | **No caching** for trial balance, forecast, vendor lists | All read-heavy routes | Recomputes on every page load |

**Quick wins:**
- Move `xgboost` / `statsmodels` imports inside the forecast handler (lazy import) → ~10s cold-start reduction.
- Add `selectinload()` on `Invoice.line_items` and `APInvoice.line_items`.
- Bump Lambda to 1024MB / 60s; raises CPU share too.
- Add `pool_pre_ping=True, pool_recycle=1800, pool_size=5, max_overflow=5` to the engine.

---

## 5. AWS Deployment Readiness

### What works today
- Container-image Lambda (post-`dff9b2c`) bypasses the 250MB zip cap — this was the right call for the ML deps.
- `serverless.yaml` provisions RDS, security group, and exports the endpoint.
- Frontend pipeline builds the React app, uploads to S3, and invalidates CloudFront.

### What's missing to stand it up cleanly in AWS

| Area | Required Action |
|---|---|
| **Bootstrap order** | Document a two-step deploy: (1) provision RDS via `serverless deploy`, (2) capture the endpoint and set `DATABASE_URL` as a Lambda env var / GitHub Secret, (3) redeploy. Better: pass the RDS endpoint into the Lambda env at deploy time via CloudFormation `!GetAtt`. |
| **Migrations** | Add Alembic; run migrations on deploy (separate CodeBuild step or Lambda-invoked job). Don't rely on `create_all()`. |
| **Secrets** | Move `ANTHROPIC_API_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `DB_PASSWORD` to AWS Secrets Manager; load at cold start. |
| **VPC** | Put Lambda in the same VPC as RDS; flip RDS to `PubliclyAccessible: false`; use VPC endpoints for Secrets Manager and S3 to avoid NAT cost. |
| **Auth** | Add Cognito (or self-managed JWT with refresh tokens). Gate all `/routes/**` with a dependency that resolves the user + tenant. |
| **CDN security** | CloudFront response-headers policy for `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`. |
| **Monitoring** | CloudWatch alarms: Lambda error rate, duration p95, throttles; RDS CPU, connections, free storage; CloudFront 5xx. Wire X-Ray SDK into FastAPI. |
| **Logs** | Structured JSON logging; ship to CloudWatch Logs with a retention policy (default is *Never expire* — costly). |
| **CI/CD** | Add a deploy pipeline with build → test → deploy-to-staging → manual approve → deploy-to-prod. |
| **Backups & DR** | RDS automated backups + a documented restore drill. Snapshot retention currently default. |
| **Cost guardrails** | Lambda concurrency cap; RDS instance right-sizing; CloudWatch Logs retention; Anthropic spend alerting. |

### Standing up in AWS — recommended sequence

1. **Pre-flight (1 day):** create AWS account/OU, set IAM roles for CI, create Secrets Manager entries, register domain in Route 53 if needed.
2. **Network (0.5 day):** VPC with two private subnets + one public; security groups for Lambda → RDS.
3. **Database (0.5 day):** RDS PostgreSQL in private subnet, `PubliclyAccessible: false`, automated backups, parameter group tuned for small workloads.
4. **Backend (1 day):** `serverless deploy --stage dev`; run Alembic migrations; smoke-test `/health`.
5. **Frontend (0.5 day):** S3 + CloudFront via Terraform; set `REACT_APP_API_URL` to the API Gateway custom domain.
6. **Auth (2–3 days):** Cognito user pool + FastAPI dependency; update frontend to use Cognito hosted UI or amplify-auth.
7. **Observability (1 day):** alarms, dashboards, X-Ray, log retention.
8. **Hardening (2 days):** Secrets Manager wiring, Plaid token encryption, CSP headers, rate-limit backend (DynamoDB or ElastiCache).
9. **Staging → Prod cutover:** duplicate stack with `--stage prod`, smoke + load test, DNS swap.

**Realistic stand-up effort to production-grade:** ~2 engineer-weeks; ~3 days to a working dev environment if you skip auth and accept the security gaps.

---

## 6. Prioritized Recommendations

### P0 — Blockers for any external exposure
1. Add authentication (Cognito or JWT) and a per-route auth dependency.
2. Encrypt Plaid access tokens at rest (Fernet key in Secrets Manager).
3. Make RDS private; put Lambda in VPC.
4. Wire `DATABASE_URL` automatically at deploy; remove the SQLite fallback in non-local envs.
5. Add CloudWatch alarms for Lambda errors and RDS health.

### P1 — Quality and performance
6. Lazy-import `xgboost`/`statsmodels` inside forecasting handlers.
7. Configure SQLAlchemy connection pool; convert hot routes to async or use a thread pool.
8. Eager-load relationships in invoice and AP aggregation paths.
9. Adopt Alembic migrations.
10. Add `pytest` and `jest` jobs to CI; gate deploys on green.

### P2 — Operability
11. Distributed rate limiting (DynamoDB or ElastiCache).
12. CSP + HSTS via CloudFront response-headers policy.
13. Structured JSON logs; request-ID propagation to Plaid/Anthropic/ml-extractor.
14. Staging environment with separate RDS, Lambda, and bucket.
15. Anthropic and Plaid spend dashboards + budget alarms.

### P3 — Strategic
16. Multi-tenancy: `company_id` claim in token, row-level filtering, eventual RLS in Postgres.
17. Move ML extraction off Lambda to ECS Fargate or a dedicated SageMaker endpoint.
18. Split CRA → Vite or Next.js for faster builds and code-splitting.
19. Background-job runner (SQS + Lambda or EventBridge Scheduler) for Plaid transaction sync and forecasting precompute.

---

## 7. Open Questions for the Team

- Who are the intended users (single tenant internal? multi-tenant SaaS?) — drives auth model.
- Is this targeting a production workload or a demo? — drives RDS sizing and HA topology.
- Is Plaid in Sandbox, Development, or Production? — drives token-handling and compliance posture.
- Is there an existing identity provider to integrate with (Okta, Azure AD)?
- What is the data-retention / compliance requirement (SOC 2, PCI-adjacent)?

---

*Generated from a static review of the repository at HEAD `3787c85`. No runtime profiling was performed; performance estimates are based on dependency footprint and code patterns.*
