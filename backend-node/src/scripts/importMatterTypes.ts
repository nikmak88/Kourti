/**
 * Import matter types/issues from a CSV on stdin into a firm, the same way as
 * Settings → Matter types → Import (routes/api/matterTaxonomy.ts importTaxonomy).
 *
 *   kourtictl matter-types import <file.csv> [--replace]
 *   → docker compose exec -T backend node dist/scripts/importMatterTypes.js [--replace] [--org <uuid>] < file.csv
 *
 * CSV format: see src/lib/taxonomyCsv.ts in the web app (matter_type,
 * matter_issue, type_description, issue_description; comma, semicolon or tab;
 * optional header row; UTF-8, BOM ignored).
 *
 * --replace hides the built-in default types and removes the firm's other
 * types, so the firm ends up with exactly the CSV's list (used by install.sh
 * --language el with deploy/seed/matter-types.el.csv).
 * Without --org the single firm of a self-hosted install is used. Changes are
 * recorded as made by the firm's owner.
 */
import { db } from '../db/pool.js';
import { csvToTaxonomyRows } from '../lib/taxonomyCsv.js';
import { importTaxonomy, type TaxonomyImport } from '../routes/api/matterTaxonomy.js';

const SYSTEM_ORG = '00000000-0000-0000-0000-000000000001';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const replace = args.includes('--replace');
  const orgArg = args.includes('--org') ? args[args.indexOf('--org') + 1] : undefined;

  const { rows } = csvToTaxonomyRows(await readStdin());
  if (!rows.length) throw new Error('the CSV has no rows with a matter type');

  const orgs = await db.query<{ id: string; name: string }>(
    orgArg
      ? 'select id, name from public.organizations where id::text = $1'
      : 'select id, name from public.organizations where id <> $1 order by created_at',
    [orgArg ?? SYSTEM_ORG]
  );
  if (orgs.rows.length !== 1) {
    throw new Error(
      orgArg
        ? `no firm with id ${orgArg}`
        : `expected exactly one firm, found ${orgs.rows.length}; pass --org <id>`
    );
  }
  const org = orgs.rows[0];

  const owner = await db.query<{ user_id: string }>(
    `select user_id from public.profiles
      where organization_id = $1
      order by coalesce(is_organization_creator, false) desc, created_at asc
      limit 1`,
    [org.id]
  );
  if (!owner.rows[0]) throw new Error(`firm ${org.name} has no users yet`);

  const stats = await importTaxonomy(org.id, owner.rows[0].user_id, { rows: rows as TaxonomyImport['rows'], replace });
  const types = new Set(rows.map((r) => r.type.toLowerCase())).size;
  console.log(
    `${org.name}: ${types} types / ${rows.filter((r) => r.issue).length} issues in the CSV - ` +
      `types created ${stats.types_created}, restored ${stats.types_restored}, kept ${stats.types_kept}, removed ${stats.types_removed}; ` +
      `issues created ${stats.issues_created}, restored ${stats.issues_restored}, kept ${stats.issues_kept}, removed ${stats.issues_removed}`
  );
}

main()
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('import failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
