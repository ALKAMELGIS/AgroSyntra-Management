# Production Checklist — Al Maha Farm

Best steps to reach **full production**, in order of impact and ease.

---

## Phase 1 — Must-have (do first)

### 1. Production secrets (no defaults)

- [ ] **JWT_SECRET** — At least 32 characters; generate once and store securely:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] **POSTGRES_PASSWORD** — Strong password for the production DB user.
- [ ] **DATABASE_URL** (if not using compose) — Full Postgres URL; never commit it.
- [ ] Remove or override any default secrets in `.env`; production must use its own values.

**Where:** Backend `.env` on the server, or CI/CD / vault secrets for Docker.

---

### 2. Lock down CORS

- [ ] Set **CORS_ORIGIN** to your real frontend URL(s) only, e.g.:
  ```env
  CORS_ORIGIN=https://app.almahafarm.com
  ```
- [ ] Do **not** use `*` in production.

**Where:** Backend config / `backend/.env` or `docker-compose.prod.yml` env.

---

### 3. HTTPS in front of the app

- [ ] Put the app behind HTTPS (Nginx, load balancer, or host’s SSL).
- [ ] For Nginx: add SSL (e.g. Let’s Encrypt), then in `nginx-proxy.conf` uncomment:
  ```nginx
  # return 301 https://$host$request_uri;
  ```
- [ ] Ensure `APP_URL` and any login/callback URLs use `https://`.

**Where:** `nginx-proxy.conf`, `./certs`, or your hosting provider.

---

### 4. Production env file for Docker

- [ ] Copy `env.production.example` to `.env.production` (or whatever your deploy uses).
- [ ] Fill every required variable; leave optional ones empty if not used.
- [ ] Never commit `.env.production`; add it to `.gitignore` if it isn’t already.

**Where:** Repo root; used by `docker-compose -f docker-compose.prod.yml`.

---

## Phase 2 — High impact, low effort

### 5. Error tracking (Sentry)

- [ ] Create a project at [sentry.io](https://sentry.io).
- [ ] Set **SENTRY_DSN** (backend) and, if you have a frontend build, the frontend DSN.
- [ ] Backend already supports `SENTRY_DSN`; errors will be reported there.

**Where:** `backend/.env` → `SENTRY_DSN=https://...@sentry.io/...`

---

### 6. Database backups

- [ ] Run backups on a schedule (cron or your host’s backup feature).
- [ ] Use `scripts/backup-database.sh` or your own `pg_dump`; store backups off-server.
- [ ] Test restore once with `scripts/restore-database.sh` (or equivalent).

**Where:** Server cron or hosting backup; backup storage (S3, etc.).

---

### 7. Health checks in use

- [ ] Your host or load balancer should call:
  - **Liveness:** `GET /api/v1/health/live`
  - **Readiness:** `GET /api/v1/health` (optional)
- [ ] `docker-compose.prod.yml` already defines healthchecks; if you use it, keep them.

**Where:** Nginx upstream checks, Kubernetes/Docker healthchecks, or host’s “ping URL”.

---

## Phase 3 — Recommended

### 8. Logging level

- [ ] Set **LOG_LEVEL=info** (or `warn`) in production; avoid `debug`.

**Where:** Backend env.

---

### 9. Redis for production

- [ ] If you use caching/sessions, set **REDIS_URL** and run Redis (e.g. `docker-compose.prod.yml` already includes Redis).
- [ ] If you don’t need it, leave **REDIS_URL** unset; backend runs without Redis.

**Where:** Backend env; Redis container in prod compose.

---

### 10. Mobile app in “production”

- [ ] Build the mobile app with production API URL (e.g. EAS Build).
- [ ] Set **EXPO_PUBLIC_API_URL** to your production API: `https://api.almahafarm.com/api/v1` (or your real URL).
- [ ] Distribute via TestFlight / Play Store / internal link.

**Where:** `mobile/.env` and build config (e.g. EAS).

---

## Phase 4 — Optional

- [ ] **Microsoft SSO** — See `docs/MICROSOFT_SSO_SETUP.md` if you want Azure AD login.
- [ ] **Email (SMTP)** — Configure for password reset / notifications if needed.
- [ ] **CI/CD** — Use `.github/workflows/deploy-production.yml` (on release) or adapt to your pipeline.
- [ ] **High availability** — See `docs/HIGH_AVAILABILITY.md` if you need multi-instance.

---

## Quick reference — minimal production env

For **docker-compose.prod.yml**, you need at least:

| Variable             | Example / note                          |
|----------------------|-----------------------------------------|
| POSTGRES_PASSWORD    | Strong password                         |
| JWT_SECRET           | 32+ chars (use `crypto.randomBytes`)   |
| CORS_ORIGIN          | `https://your-frontend-domain.com`     |
| (Optional) REDIS_URL | `redis://redis:6379` if using Redis     |

Use `env.production.example` in the repo root as the template; copy to `.env.production` and fill in.

---

## Summary order

1. Production secrets (JWT, DB password, no defaults).  
2. CORS set to real frontend URL.  
3. HTTPS in front (Nginx/host).  
4. Production env file from `env.production.example`.  
5. Sentry (or similar) for errors.  
6. DB backups + one restore test.  
7. Health checks used by your deploy.  
8. LOG_LEVEL=info, Redis if needed, mobile API URL for prod.

After 1–4 and 7 you’re in good shape for “full production”; 5–6 and 8 make it robust and easier to operate.
