# Spike Results — WP-0 Aurora DSQL multi-region failover

- **Run:** 2026-06-07T22:04:07.134Z · run_id `4c5585db-6239-47bb-9e5b-4f9238dbbece`
- **Regions:** us-east-1 + us-east-2 (witness us-west-2)
- **Overall:** PASS

| Result | ID | Claim | Detail |
|--------|----|-------|--------|
| PASS | C1 | Strong consistency (write A → read B) | wrote via us-east-1, read back via us-east-2 with no polling |
| PASS | C2 | Active-active (concurrent dual-region writes) | 50 concurrent writes split across us-east-1/us-east-2; both regions return the identical complete set (51 events) |
| PASS | C3 | Region-failure survival | wrote 5 via us-east-2 while us-east-1 down; us-east-1 returned all 5 after restore |

**Cross-region write latency:** median 754.05 ms · p99 994.12 ms · n=50

