# Installing Kourti for a client firm

One firm per VM. The installer sets up Docker, HTTPS, SMTP email, the firm,
its seat licence and its first administrator. Public self-service sign-up is
**disabled**; people get in by invitation (staff), by the client portal
(clients), or through `kourtictl create-user` (operator).

## 1. Prepare the VM

| Item | Requirement |
|---|---|
| OS | Ubuntu 22.04+ or Debian 12+ (64-bit) |
| Size | 2 vCPU, 4 GB RAM (+ swap), 30 GB disk minimum |
| Network | Static IP or DNS name; inbound TCP 80 and 443 from the firm's network |
| Outbound | Internet during install (Docker images, GitHub, npm); SMTP server reachable |
| Access | A sudo user over SSH |

Collect from the firm before you start:

- **Address** users will type: an IP (`10.0.0.20`) or a DNS name (`kourti.dupont.be`).
- **Firm name**, **administrator email**, first/last name, **number of seats**.
- **SMTP account** used to send mail (2FA codes, invitations, client portal):

  | Provider | Host | Port | Notes |
  |---|---|---|---|
  | Microsoft 365 | `smtp.office365.com` | 587 | Mailbox needs *Authenticated SMTP* enabled in the M365 admin centre |
  | Google Workspace | `smtp.gmail.com` | 587 | Use an *app password* (requires 2-Step Verification on the account) |
  | Firm's own relay | e.g. `mail.dupont.be` | 25/587 | No user/password if the relay trusts the VM's IP |

  The `--smtp-from` address must be one the SMTP account may send as.

## 2. Install

```sh
# on the VM
git clone https://github.com/nikmak88/Kourti.git /tmp/kourti-installer
cd /tmp/kourti-installer/deploy

export SMTP_PASSWORD='the-smtp-password'     # kept out of shell history/argv
sudo -E bash install.sh \
  --host 10.0.0.20 \
  --firm-name "Dupont & Associés" \
  --admin-email admin@dupont.be --admin-first Marie --admin-last Dupont \
  --seats 10 \
  --smtp-host smtp.office365.com --smtp-port 587 \
  --smtp-user kourti@dupont.be --smtp-from kourti@dupont.be \
  --language el                                # default language: el (Greek) or en
```

The first build takes 5–10 minutes. At the end the installer prints the URL,
the administrator's **temporary password** and the certificate fingerprint.
`bash install.sh --help` lists every option.

**TLS options**

- `--tls selfsigned` *(default)* — certificate for the IP or name, valid 825 days.
  Browsers warn until the certificate (`/opt/kourti/certs/kourti.crt`) is
  imported as a trusted root on the firm's PCs (Windows: `certlm.msc` →
  *Trusted Root Certification Authorities*, or via Group Policy).
- `--tls acme --acme-email ops@you.be` — free Let's Encrypt certificate; `--host`
  must be a public DNS name with ports 80/443 reachable from the internet.
- `--tls custom --cert firm.crt --key firm.key` — the firm's own certificate (PEM, full chain).

**Offline / pinned source**: `--ref <tag>` installs a specific version;
`--source kourti.tar.gz` installs from a local archive instead of GitHub.

## 3. Verify (acceptance checklist)

```sh
sudo kourtictl status                               # all containers Up, health OK
sudo kourtictl test-email --to you@yourcompany.be   # SMTP works
```

Then in a browser:

1. Open `https://<host>` → login page, **no "Create account" link**.
2. Sign in as the administrator with the temporary password → a 6-digit code
   arrives by email (email 2FA) → enter it.
3. You are asked to choose a new password.
4. **User Management** shows `1 of N seats used` and **Invite** is enabled.
5. Invite a colleague → they receive the email, set a password, sign in with an email code.

Hand-over to the firm: the URL, the administrator's email + temporary
password (separate channel), and the certificate file if self-signed.

## 4. Day-to-day operations — `kourtictl`

| Task | Command |
|---|---|
| Status / health | `sudo kourtictl status` |
| Logs | `sudo kourtictl logs backend` |
| Add a staff user without an invitation | `sudo kourtictl create-user --email ... --role user` — see [ADD-USER.md](ADD-USER.md) |
| User forgot password / locked out | `sudo kourtictl reset-password --email ...` |
| User cannot receive 2FA mail | `sudo kourtictl email-otp --email ... off` (turn back on afterwards) |
| Block / delete a user | `sudo kourtictl disable-user --email ...` (reversible, keeps the seat) · `sudo kourtictl delete-user --email ...` (permanent, frees the seat) |
| Change licensed seats | `sudo kourtictl set-seats 15` |
| Backup | `sudo kourtictl backup` → `/var/backups/kourti/<timestamp>/` |
| Update to a new version | `sudo kourtictl update --ref <tag>` (backs up first) |
| Change the mail account | `sudo -E kourtictl smtp --host … --user … --from …` then `test-email` — see [USER-GUIDE.md §4](../USER-GUIDE.md) |
| Email 2FA for all users | `sudo kourtictl email-2fa-all on` |
| Add / test AI | `sudo kourtictl ai key anthropic`, `ai model …`, `ai test` — see [USER-GUIDE.md §6](../USER-GUIDE.md) |
| Change TLS / host | re-run `install.sh` with the new options (data and secrets are kept) |

Schedule a nightly backup and copy it off the VM:

```sh
echo '30 2 * * * root /usr/local/bin/kourtictl backup >/var/log/kourti-backup.log 2>&1' | sudo tee /etc/cron.d/kourti-backup
```

A backup contains `db.sql.gz` (database), `storage.tar.gz` (uploaded documents)
and `config.tar.gz` (`.env` with all secrets, Caddyfile, certificate). Keep the
`.env`: without its `APP_ENCRYPTION_KEY` and JWT secrets, restored 2FA app
enrolments and sessions are unusable.

**Restore** onto a fresh VM (same `--host`). Put the old configuration in place
*first*, so the installer reuses the original secrets and does not create a new firm:
```sh
sudo install -d /opt/kourti && sudo tar xzf config.tar.gz -C /opt/kourti
sudo bash install.sh -y                      # host/SMTP/secrets come from the restored .env
sudo kourtictl compose stop backend
sudo kourtictl compose exec -T postgres dropdb -U kourti kourti
sudo kourtictl compose exec -T postgres createdb -U kourti kourti
gunzip -c db.sql.gz | sudo kourtictl compose exec -T postgres psql -q -U kourti -d kourti -v ON_ERROR_STOP=1
sudo docker run --rm -i -v kourti_backend-storage:/data alpine tar xzf - -C /data < storage.tar.gz
sudo kourtictl compose start backend && sudo kourtictl status
```

## 5. What runs where

```
browser ──https──▶ proxy (Caddy :443, :80→443)
                     ├── /api/*, /health ──▶ backend  (Node, :4000) ──▶ postgres (16 + pgvector)
                     └── everything else ──▶ app      (nginx + React build)
```

| Path on the VM | Contents |
|---|---|
| `/opt/kourti/src` | Application code (git checkout) |
| `/opt/kourti/.env` | Configuration and secrets (mode 600) |
| `/opt/kourti/Caddyfile`, `/opt/kourti/certs/` | HTTPS proxy config and certificate |
| Docker volumes `kourti_postgres-data`, `kourti_backend-storage` | Database and uploaded files |
| `src/deploy/postgres/Dockerfile` | Postgres image: official `postgres:16-alpine` + pgvector 0.8.0, built at install. Needs GitHub access during install |

Security defaults: `NODE_ENV=production`, `AUTH_MODE=custom` (real logins),
unique random secrets per install, sign-up disabled, email 2FA on for every
new account, only ports 80/443 exposed, Postgres not published.
