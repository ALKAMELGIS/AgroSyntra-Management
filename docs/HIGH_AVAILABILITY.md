# High Availability & Scaling Guide

This document outlines the high availability (HA) and scaling setup for the Al Maha Farm application.

## Architecture Overview

```
                    ┌─────────────────┐
                    │   CloudFlare    │
                    │   (CDN + WAF)   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Load Balancer  │
                    │  (nginx/ALB)    │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │   Backend   │   │   Backend   │   │   Backend   │
    │  Instance 1 │   │  Instance 2 │   │  Instance N │
    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │  PostgreSQL │   │    Redis    │   │   Redis     │
    │   Primary   │◄──│   Primary   │   │   Replica   │
    └──────┬──────┘   └─────────────┘   └─────────────┘
           │
    ┌──────▼──────┐
    │  PostgreSQL │
    │   Replica   │
    └─────────────┘
```

## Database High Availability

### PostgreSQL Replication Setup

#### 1. Primary Server Configuration

```bash
# postgresql.conf on primary
wal_level = replica
max_wal_senders = 5
wal_keep_size = 1GB
hot_standby = on
```

```bash
# pg_hba.conf - allow replication connections
host replication replicator replica_ip/32 scram-sha-256
```

#### 2. Create Replication User

```sql
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'secure_password';
```

#### 3. Replica Setup

```bash
# On replica server
pg_basebackup -h primary_host -D /var/lib/postgresql/data -U replicator -P -R
```

#### 4. Replica Configuration

```bash
# postgresql.conf on replica
primary_conninfo = 'host=primary_host port=5432 user=replicator password=secure_password'
hot_standby = on
```

### Automatic Failover with Patroni

For production, use [Patroni](https://github.com/zalando/patroni) for automatic failover:

```yaml
# patroni.yml
scope: almaha-cluster
name: pg-node-1

restapi:
  listen: 0.0.0.0:8008
  connect_address: node1:8008

etcd:
  hosts: etcd1:2379,etcd2:2379,etcd3:2379

bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    retry_timeout: 10
    maximum_lag_on_failover: 1048576
    postgresql:
      use_pg_rewind: true
      parameters:
        max_connections: 200
        shared_buffers: 2GB
        effective_cache_size: 6GB

postgresql:
  listen: 0.0.0.0:5432
  connect_address: node1:5432
  data_dir: /var/lib/postgresql/data
  authentication:
    replication:
      username: replicator
      password: secure_password
    superuser:
      username: postgres
      password: secure_password
```

## Redis High Availability

### Redis Sentinel Configuration

```conf
# sentinel.conf
sentinel monitor almaha-redis master_ip 6379 2
sentinel auth-pass almaha-redis redis_password
sentinel down-after-milliseconds almaha-redis 5000
sentinel failover-timeout almaha-redis 60000
sentinel parallel-syncs almaha-redis 1
```

### Redis Cluster (for larger scale)

```bash
# Create 6-node cluster (3 masters + 3 replicas)
redis-cli --cluster create \
  node1:6379 node2:6379 node3:6379 \
  node4:6379 node5:6379 node6:6379 \
  --cluster-replicas 1
```

## Application Scaling

### Horizontal Scaling

The backend is stateless (JWT-based auth, Redis for sessions), enabling easy horizontal scaling:

1. **Docker Swarm**
```yaml
services:
  backend:
    image: almaha-backend:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
```

2. **Kubernetes**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: almaha-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: almaha-backend
  template:
    spec:
      containers:
      - name: backend
        image: almaha-backend:latest
        resources:
          requests:
            cpu: "250m"
            memory: "512Mi"
          limits:
            cpu: "1000m"
            memory: "1Gi"
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: almaha-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: almaha-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Auto-Scaling Rules

| Metric | Scale Up Threshold | Scale Down Threshold |
|--------|-------------------|---------------------|
| CPU | > 70% for 3 min | < 30% for 10 min |
| Memory | > 80% for 3 min | < 40% for 10 min |
| Request Rate | > 100 req/s per instance | < 20 req/s per instance |

## Backup Strategy

### Automated Backups

```bash
# Crontab entries
# Daily backup at 2 AM
0 2 * * * /app/scripts/backup-database.sh daily >> /var/log/backups.log 2>&1

# Weekly backup on Sunday at 3 AM
0 3 * * 0 /app/scripts/backup-database.sh weekly >> /var/log/backups.log 2>&1
```

### Retention Policy

| Backup Type | Retention Period | Storage Class |
|-------------|-----------------|---------------|
| Daily | 7 days | Standard |
| Weekly | 30 days | Standard-IA |
| Monthly | 1 year | Glacier |

### Point-in-Time Recovery (PITR)

Enable WAL archiving for PITR:

```bash
# postgresql.conf
archive_mode = on
archive_command = 'aws s3 cp %p s3://almaha-wal-archive/%f'
```

Restore to specific point in time:
```bash
# recovery.conf
restore_command = 'aws s3 cp s3://almaha-wal-archive/%f %p'
recovery_target_time = '2026-01-15 10:30:00 UTC'
```

## CDN Configuration

### CloudFlare Setup

1. **Cache Rules**
   - Cache static assets: `/static/*`, `*.js`, `*.css`, `*.png`, `*.jpg`
   - No cache: `/api/*`
   - Cache TTL: 1 year for versioned assets

2. **Page Rules**
   ```
   /api/* - Cache Level: Bypass
   /static/* - Cache Level: Cache Everything, Edge TTL: 1 month
   ```

3. **Security Settings**
   - WAF: Enabled with OWASP rules
   - Rate limiting: 100 requests/minute per IP for API
   - DDoS protection: Enabled

## Monitoring & Alerts

### Health Check Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/api/v1/health` | Full health check | DB + Redis status |
| `/api/v1/health/live` | Liveness probe | 200 OK |
| `/api/v1/health/ready` | Readiness probe | DB connection |

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| API Response Time | > 500ms | > 2000ms |
| Error Rate | > 1% | > 5% |
| Database Connections | > 80% | > 95% |
| Memory Usage | > 80% | > 95% |
| Disk Usage | > 70% | > 90% |

## Disaster Recovery

### RTO/RPO Targets

- **Recovery Time Objective (RTO)**: 1 hour
- **Recovery Point Objective (RPO)**: 15 minutes

### Failover Procedure

1. Detect failure via health checks
2. Patroni promotes replica to primary (automatic)
3. Update DNS/load balancer (automatic with health checks)
4. Verify application connectivity
5. Investigate root cause

### Manual Failover Steps

```bash
# Check cluster status
patronictl -c /etc/patroni.yml list

# Perform switchover (planned)
patronictl -c /etc/patroni.yml switchover

# Perform failover (emergency)
patronictl -c /etc/patroni.yml failover
```

## Capacity Planning

### Current Limits

| Resource | Current | Recommended Max |
|----------|---------|----------------|
| Concurrent Users | 100 | 500 |
| API Requests/sec | 50 | 200 |
| Database Size | 10 GB | 100 GB |
| Redis Memory | 256 MB | 2 GB |

### Scaling Triggers

Scale infrastructure when:
- Average response time > 200ms consistently
- Error rate > 0.5%
- Database CPU > 60%
- Redis memory > 70%
