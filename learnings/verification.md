# Verification techniques for this fork

Things that caught real bugs on 2026-11-15 and are worth repeating after upstream merges.

- **Postgres log is the truth.** Many routes swallow query errors and return `[]`.
  After a smoke run of all parameter-free GET endpoints (as a firm admin), run
  `docker logs kourti-postgres-1 | grep ERROR:`; any "does not exist" is a schema gap.
- **Fresh-database test.** The lab DB was repaired incrementally; only an empty DB proves
  new installs work. Start `kourti-postgres:16-pgvector` with `docker/postgres/init`
  mounted, run the `kourti-backend` image against it, expect zero "Bootstrap statement
  warning" lines. (Found `document_versions` columns added before the table existed.)
- **Schema audit.** Compare columns the backend writes (INSERT/UPDATE lists), reads via
  table aliases, and filters with dynamic `clauses.push(...)` against
  `information_schema.columns`.
- **Type-checking without local Node.** `docker run node:20-alpine` on the VM:
  `npm ci --ignore-scripts && npx tsc -p tsconfig.app.json --noEmit` (frontend) and
  `npx tsc --noEmit` in `backend-node`. Vite builds do not type-check.
- **Third-party traffic.** Headless Chrome with `--log-net-log` and grep the request URLs
  (not the CSP header, which also mentions analytics hosts).
- **i18n consistency.** Flatten each `locales/en|el/<ns>.json`, compare key sets and
  `{{placeholder}}` names; check every `t('…')` key exists (watch files with several
  `useTranslation` namespaces).
