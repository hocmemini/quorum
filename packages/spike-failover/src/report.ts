import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type ClaimResult,
  claimActiveActive,
  claimStrongConsistency,
  claimSurvival,
  type LatencyStats,
  latencyStats,
} from './claims';
import { loadConfig } from './config';
import { FailoverClient } from './failover-client';
import { migrate } from './migrate';
import { PgConnector } from './pg-connector';

async function main(): Promise<number> {
  const config = loadConfig();
  const client = new FailoverClient(config.endpoints, new PgConnector(), {
    occ: { maxAttempts: 12 },
  });
  for (const r of config.unreachable) client.markUnreachable(r);

  const runId = randomUUID();
  const results: ClaimResult[] = [];
  let latency: LatencyStats = { samples: 0, medianMs: 0, p99Ms: 0 };

  try {
    const applied = await migrate(client);
    console.log(`migrations: ${applied.length > 0 ? applied.join(', ') : 'up to date'}`);

    results.push(await claimStrongConsistency(client, runId));
    const c2 = await claimActiveActive(client, runId, config.eventCount);
    results.push(c2.result);
    latency = latencyStats(c2.latencies);
    results.push(await claimSurvival(client, runId));
  } finally {
    await client.end();
  }

  const allPass = results.every((r) => r.pass);
  printTable(results, latency);
  await writeReport(results, latency, runId, client.regions(), allPass);
  return allPass ? 0 : 1;
}

function printTable(results: ClaimResult[], latency: LatencyStats): void {
  console.log('\n  RESULT | ID | CLAIM');
  console.log('  -------+----+-------------------------------------------------');
  for (const r of results) {
    console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(4)}   | ${r.id} | ${r.name}`);
    console.log(`         |    |   ${r.detail}`);
  }
  console.log(
    `\n  cross-region write latency: median ${latency.medianMs} ms - p99 ${latency.p99Ms} ms (n=${latency.samples})`,
  );
  console.log(`\n  OVERALL: ${results.every((r) => r.pass) ? 'PASS' : 'FAIL'}\n`);
}

async function writeReport(
  results: ClaimResult[],
  latency: LatencyStats,
  runId: string,
  regions: string[],
  allPass: boolean,
): Promise<void> {
  const lines = [
    '# Spike Results - WP-0 Aurora DSQL multi-region failover',
    '',
    `- **Run:** ${new Date().toISOString()} - run_id \`${runId}\``,
    `- **Regions:** ${regions.join(' + ')} (witness us-west-2)`,
    `- **Overall:** ${allPass ? 'PASS' : 'FAIL'}`,
    '',
    '| Result | ID | Claim | Detail |',
    '|--------|----|-------|--------|',
    ...results.map((r) => `| ${r.pass ? 'PASS' : 'FAIL'} | ${r.id} | ${r.name} | ${r.detail} |`),
    '',
    `**Cross-region write latency:** median ${latency.medianMs} ms - p99 ${latency.p99Ms} ms - n=${latency.samples}`,
    '',
  ];
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'SPIKE_RESULTS.md');
  await writeFile(out, `${lines.join('\n')}\n`, 'utf8');
  console.log(`wrote ${out}`);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
