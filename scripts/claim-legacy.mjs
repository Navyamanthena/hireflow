#!/usr/bin/env node
/**
 * Move roles created before authentication existed into a real team.
 *
 * The auth migration parks pre-existing jobs in an organization called
 * "Legacy data" that has no members (nobody can see them). Run this once,
 * as the admin who should own them:
 *
 *   node scripts/claim-legacy.mjs you@example.com [--dry-run]
 *   docker compose run --rm --no-deps -v ./scripts:/scripts api node /scripts/claim-legacy.mjs you@example.com
 *
 * Only memberless "Legacy data" organizations are touched, the target must
 * be an admin, and everything happens in one transaction.
 */
import { createRequire } from 'node:module';

const email = process.argv[2]?.trim().toLowerCase();
const dryRun = process.argv.includes('--dry-run');
if (!email || email.startsWith('--')) {
  console.error('Usage: node scripts/claim-legacy.mjs <admin email> [--dry-run]');
  process.exit(2);
}

// Resolve `pg` from the project, or from the API image when run in Docker.
let pg;
for (const base of [import.meta.url, '/app/']) {
  try {
    pg = createRequire(base)('pg');
    break;
  } catch {
    /* try the next location */
  }
}
if (!pg) {
  console.error('Could not load the "pg" package. Run this from the project folder after npm install, or inside the api container.');
  process.exit(2);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? 'postgres://hireflow:hireflow@localhost:5432/hireflow',
});

async function main() {
  await client.connect();
  try {
    await client.query('BEGIN');
    const { rows: users } = await client.query(
      `SELECT u.id, u.role, u.org_id, o.name AS org_name FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.email = $1`,
      [email],
    );
    const user = users[0];
    if (!user) throw new Error(`No account with email ${email}. Sign up in the app first.`);
    if (user.role !== 'admin') throw new Error(`${email} is a recruiter; only an admin can take over legacy data.`);

    const { rows: legacy } = await client.query(
      `SELECT o.id FROM organizations o
        WHERE o.name = 'Legacy data'
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.org_id = o.id)
        FOR UPDATE`,
    );
    if (!legacy.length) {
      console.log('Nothing to claim: there is no memberless "Legacy data" organization.');
      await client.query('ROLLBACK');
      return;
    }
    const ids = legacy.map((r) => r.id);
    const { rows: moved } = await client.query(
      `UPDATE jobs SET org_id = $1, updated_at = now() WHERE org_id = ANY($2::uuid[]) RETURNING title`,
      [user.org_id, ids],
    );
    await client.query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [ids]);

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log(`Dry run: would move ${moved.length} role(s) into "${user.org_name}":`);
    } else {
      await client.query('COMMIT');
      console.log(`Moved ${moved.length} role(s) and their candidates into "${user.org_name}":`);
    }
    for (const j of moved) console.log(`  - ${j.title}`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(`Claim failed: ${e.message}`);
  process.exit(1);
});
