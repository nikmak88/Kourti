# 0002 — Self-hosted installs send nothing to third parties by default

**Status:** accepted (2026-11-15) · **Code:** `index.html`, `src/components/CookieConsent.tsx`,
`deploy/docker-compose.yml` (`VITE_ANALYTICS_ENABLED: "false"`)

## Context
Upstream's `index.html` hard-codes its own Microsoft Clarity project and Mixpanel token;
the Mixpanel library loaded on every page and, after "Accept", analytics/session
recordings went to upstream's accounts. Favicon and preloader logo were hot-linked from
upstream's Google Cloud storage. Unacceptable for law firms (confidentiality, GDPR).

## Decision
Analytics are compiled out unless `VITE_ANALYTICS_ENABLED=true` (then a firm must also
swap in its own IDs); the cookie banner is hidden when off; images are served locally.
Verified with a Chrome net-log: a page load contacts only the firm's server.

## Consequences
Any future upstream addition of third-party scripts must be re-checked the same way.
AI providers and SMTP remain deliberate, configured third parties.
