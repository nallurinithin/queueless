# QueueLess Production Deployment & Operations Runbook

## 1. Production Architecture Overview

QueueLess runs as a resilient, single-tenant modular monolith for clinic pilot deployments (e.g., Aarogyam Community Clinic).

The production stack consists of:
- **Client Container (`queueless_prod_client`)**: Nginx 1.27 Alpine serving pre-compiled Vite React 19 static assets, gzip compression, and reverse proxying `/api` and `/socket.io` to the server.
- **Server Container (`queueless_prod_server`)**: Node.js 22 Alpine Express 5 API running as a non-privileged `node` user with healthcheck probes on `GET /api/health`.
- **Database Container (`queueless_prod_mongodb`)**: MongoDB 8.0 on Alpine/Noble with persistent storage volumes and ping healthcheck.

---

## 2. Quickstart Production Deployment

### Prerequisites
- Docker Engine 24+ & Docker Compose v2.20+
- Port 80 available (or reverse proxy e.g. Cloudflare / Caddy / AWS ALB)

### Commands
```bash
# 1. Clone repository & navigate to application directory
cd queueless-app

# 2. Configure production secrets
cp server/.env.production.example server/.env
cp client/.env.production.example client/.env

# 3. Build & start all containers in detached mode
docker compose -f docker-compose.prod.yml up -d --build

# 4. Bootstrap initial Clinic Owner (one-time initialization)
docker compose -f docker-compose.prod.yml exec server npm run bootstrap:owner

# 5. Check container status & healthchecks
docker compose -f docker-compose.prod.yml ps
```

---

## 3. Healthcheck Probes & Monitoring

| Endpoint | Probe Type | Target Status | Description |
| :--- | :--- | :--- | :--- |
| `http://localhost/health` | Client Liveness | 200 OK | Nginx static server health |
| `http://localhost:3000/api/health` | Server Liveness & DB | 200 OK | MongoDB ping & Express uptime |
| `mongosh --eval "db.adminCommand('ping')"` | DB Health | `{ ok: 1 }` | MongoDB daemon readiness |

---

## 4. Automated Backup & Disaster Recovery

### Creating a Database Backup
```bash
# PowerShell
.\scripts\backup.ps1 -DbUri "mongodb://localhost:27017/queueless_prod"

# Bash / Linux
./scripts/backup.sh
```
Backups are archived with timestamped filenames in `queueless-app/backups/queueless_backup_YYYYMMDD_HHMMSS.archive`.

### Restoring from Backup
```bash
# PowerShell
.\scripts\restore.ps1 -ArchiveFile "backups/queueless_backup_20261101_120000.archive"

# Bash / Linux
./scripts/restore.sh "backups/queueless_backup_20261101_120000.archive"
```

---

## 5. Zero-Downtime Rollback Runbook

If a critical failure occurs during production release:

1. **Revert Container Images**:
   ```bash
   docker compose -f docker-compose.prod.yml down
   git checkout <last-stable-commit-sha>
   docker compose -f docker-compose.prod.yml up -d --build
   ```
2. **Database State Verification**:
   If data schema was impacted, restore from the pre-deployment backup archive using `./scripts/restore.sh <pre-release-archive>`.
3. **Verify System Integrity**:
   Verify `GET /api/health` returns `{ status: "ok" }`.

