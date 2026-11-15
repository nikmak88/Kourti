#!/usr/bin/env bash
# Kourti self-hosted installer — one firm per VM. See deploy/README.md.
#
#   sudo ./install.sh --host 10.0.0.20 --firm-name "Dupont & Associés" \
#        --admin-email admin@dupont.be --smtp-host smtp.office365.com \
#        --smtp-user kourti@dupont.be --smtp-from kourti@dupont.be
#   (SMTP password is read from $SMTP_PASSWORD or prompted, never from argv)
#
# Re-running is safe: existing secrets, data and the firm are kept; code is
# updated to --ref and containers are rebuilt. Settings passed on a re-run
# (SMTP, TLS, seats…) overwrite the stored ones.
set -euo pipefail

# ── defaults ────────────────────────────────────────────────────────────────
KOURTI_HOME="/opt/kourti"
REPO="https://github.com/nikmak88/Kourti.git"
REF="main"
SOURCE=""                 # local directory or .tar.gz instead of git clone
HOST=""
TLS="selfsigned"          # selfsigned | acme | custom
CERT_FILE="" KEY_FILE="" ACME_EMAIL=""
FIRM_NAME="" ADMIN_EMAIL="" ADMIN_FIRST="" ADMIN_LAST="" ADMIN_PASSWORD="" SEATS=10
SMTP_HOST="" SMTP_PORT="" SMTP_USER="" SMTP_FROM="" SMTP_SECURE="" SMTP_TLS_VERIFY="true"
NO_SMTP=false
ALLOW_SIGNUP=false
ASSUME_YES=false
DEFAULT_LANGUAGE=""      # en | el (empty on update = keep current)

die() { echo "install: ERROR: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

usage() {
  cat <<'EOF'
Usage: sudo ./install.sh --host <ip-or-dns> --firm-name <name> --admin-email <email> [options]

Required
  --host <ip|dns>          Address users will type in the browser (no https://)
  --firm-name <name>       Firm (organization) name — first install only
  --admin-email <email>    Firm administrator login — first install only

Administrator
  --admin-first <name> --admin-last <name>
  --admin-password <pw>    Default: generated (printed at the end)
  --seats <n>              Licensed user seats (default 10)

Email (SMTP) — required for email 2FA, invitations and client portal emails
  --smtp-host <host>       e.g. smtp.office365.com, smtp.gmail.com, mail.firm.be
  --smtp-port <port>       Default 587 (STARTTLS); 465 = implicit TLS
  --smtp-user <user>       Leave out for an unauthenticated relay
  --smtp-from <address>    Sender address (must be allowed for --smtp-user)
  --smtp-secure true|false Override TLS mode (default: true only on port 465)
  --smtp-insecure-tls      Accept a self-signed certificate on the mail server
  --no-smtp                Install without email (2FA is then turned off for the admin)
  SMTP password: export SMTP_PASSWORD=... before running, or you will be prompted.

TLS
  --tls selfsigned         Default. Self-signed certificate for --host (IP or name)
  --tls acme --acme-email <e>   Let's Encrypt; --host must be a public DNS name on ports 80/443
  --tls custom --cert <crt> --key <key>   Use your own certificate (PEM)

Source
  --repo <git-url>         Default: https://github.com/nikmak88/Kourti.git
  --ref <branch|tag>       Default: main
  --source <dir|tar.gz>    Install from a local copy instead of git (offline installs)
  --dir <path>             Install directory (default /opt/kourti)

Other
  --allow-signup           Keep public self-service sign-up enabled (default: disabled)
  --language en|el         Default language for users and emails (default: en; users can switch)
  -y, --yes                Do not ask for confirmation
EOF
}

# ── arguments ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2;;
    --firm-name) FIRM_NAME="$2"; shift 2;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2;;
    --admin-first) ADMIN_FIRST="$2"; shift 2;;
    --admin-last) ADMIN_LAST="$2"; shift 2;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2;;
    --seats) SEATS="$2"; shift 2;;
    --smtp-host) SMTP_HOST="$2"; shift 2;;
    --smtp-port) SMTP_PORT="$2"; shift 2;;
    --smtp-user) SMTP_USER="$2"; shift 2;;
    --smtp-from) SMTP_FROM="$2"; shift 2;;
    --smtp-secure) SMTP_SECURE="$2"; shift 2;;
    --smtp-insecure-tls) SMTP_TLS_VERIFY="false"; shift;;
    --no-smtp) NO_SMTP=true; shift;;
    --tls) TLS="$2"; shift 2;;
    --cert) CERT_FILE="$2"; shift 2;;
    --key) KEY_FILE="$2"; shift 2;;
    --acme-email) ACME_EMAIL="$2"; shift 2;;
    --repo) REPO="$2"; shift 2;;
    --ref) REF="$2"; shift 2;;
    --source) SOURCE="$2"; shift 2;;
    --dir) KOURTI_HOME="$2"; shift 2;;
    --allow-signup) ALLOW_SIGNUP=true; shift;;
    --language) DEFAULT_LANGUAGE="$2"; shift 2;;
    -y|--yes) ASSUME_YES=true; shift;;
    -h|--help) usage; exit 0;;
    *) usage; die "unknown option: $1";;
  esac
done

[[ $EUID -eq 0 ]] || die "run as root (sudo ./install.sh ...)"
ENV_FILE="$KOURTI_HOME/.env"
FIRST_INSTALL=true; [[ -f "$ENV_FILE" ]] && FIRST_INSTALL=false

envget() { # value of KEY in the existing .env, surrounding quotes removed
  local v=""
  [[ -f "$ENV_FILE" ]] && v=$(grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2-) || true
  v="${v#\'}"; v="${v%\'}"; printf '%s' "$v"
}

# On a re-run, fall back to the stored values.
if ! $FIRST_INSTALL; then
  [[ -n "$HOST" ]] || HOST=$(envget KOURTI_HOST)
  [[ -n "$SMTP_HOST" || "$NO_SMTP" == true ]] || SMTP_HOST=$(envget SMTP_HOST)
fi

[[ -n "$HOST" ]] || die "--host is required"
[[ "$HOST" != *"://"* && "$HOST" != */* ]] || die "--host takes a bare IP or DNS name, e.g. 10.0.0.20"
if $FIRST_INSTALL; then
  [[ -n "$FIRM_NAME" ]] || die "--firm-name is required on first install"
  [[ -n "$ADMIN_EMAIL" ]] || die "--admin-email is required on first install"
fi
[[ "$SEATS" =~ ^[0-9]+$ && "$SEATS" -ge 1 ]] || die "--seats must be a positive number"
case "$TLS" in
  selfsigned) ;;
  acme) [[ -n "$ACME_EMAIL" ]] || die "--tls acme needs --acme-email";;
  custom) [[ -f "$CERT_FILE" && -f "$KEY_FILE" ]] || die "--tls custom needs readable --cert and --key";;
  *) die "--tls must be selfsigned, acme or custom";;
esac
if [[ "$NO_SMTP" == false && -z "$SMTP_HOST" ]]; then
  die "SMTP is needed for email 2FA. Pass --smtp-host ... or --no-smtp"
fi
if [[ -n "$SMTP_HOST" && "$NO_SMTP" == false ]]; then
  SMTP_PORT="${SMTP_PORT:-$(envget SMTP_PORT)}"; SMTP_PORT="${SMTP_PORT:-587}"
  SMTP_USER="${SMTP_USER:-$(envget SMTP_USER)}"
  SMTP_FROM="${SMTP_FROM:-$(envget SMTP_FROM_EMAIL)}"; SMTP_FROM="${SMTP_FROM:-$SMTP_USER}"
  [[ -z "$SMTP_FROM" || "$SMTP_FROM" =~ ^[^[:space:]\<\>@]+@[^[:space:]\<\>@]+$ ]] \
    || die "--smtp-from must be a plain address like kourti@firm.be (no display name)"
  [[ -n "$SMTP_FROM" ]] || die "--smtp-from is required when there is no --smtp-user"
  [[ "${SMTP_PASSWORD:-}" != *"'"* ]] || die "the SMTP password cannot contain a single quote (')"
  if [[ -n "$SMTP_USER" && -z "${SMTP_PASSWORD:-}" ]]; then
    SMTP_PASSWORD=$(envget SMTP_PASSWORD)
    if [[ -z "$SMTP_PASSWORD" ]]; then
      [[ -t 0 ]] || die "set SMTP_PASSWORD in the environment for a non-interactive install"
      read -r -s -p "SMTP password for $SMTP_USER: " SMTP_PASSWORD; echo
    fi
  fi
fi

is_ip() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ || "$1" == *:* ]]; }
PUBLIC_URL="https://$HOST"

echo "Kourti install"
echo "  directory:   $KOURTI_HOME ($($FIRST_INSTALL && echo new install || echo update))"
echo "  URL:         $PUBLIC_URL   (TLS: $TLS)"
echo "  source:      ${SOURCE:-$REPO @ $REF}"
[[ -n "$FIRM_NAME" ]] && echo "  firm:        $FIRM_NAME — admin $ADMIN_EMAIL — $SEATS seats"
echo "  email:       $([[ "$NO_SMTP" == true ]] && echo 'disabled (no SMTP)' || echo "SMTP $SMTP_HOST:$SMTP_PORT as $SMTP_FROM")"
echo "  sign-up:     $($ALLOW_SIGNUP && echo enabled || echo disabled)"
echo "  language:    ${DEFAULT_LANGUAGE:-unchanged (en on a new install)}"
if ! $ASSUME_YES && [[ -t 0 ]]; then
  read -r -p "Continue? [y/N] " ok; [[ "$ok" =~ ^[Yy] ]] || exit 1
fi

# ── 1. packages ─────────────────────────────────────────────────────────────
step "Checking Docker"
command -v apt-get >/dev/null || die "this installer supports Debian/Ubuntu (apt) only"
export DEBIAN_FRONTEND=noninteractive
need=()
for c in git openssl curl; do command -v "$c" >/dev/null || need+=("$c"); done
if ((${#need[@]})); then apt-get update -qq; apt-get install -y -qq "${need[@]}" ca-certificates >/dev/null; fi
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "Installing Docker Engine + Compose plugin (get.docker.com)"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null || die "docker compose plugin not available"

# ── 2. source code ──────────────────────────────────────────────────────────
step "Fetching application code"
install -d -m 755 "$KOURTI_HOME"
if [[ -n "$SOURCE" ]]; then
  rm -rf "$KOURTI_HOME/src.new"; install -d "$KOURTI_HOME/src.new"
  if [[ -d "$SOURCE" ]]; then
    cp -a "$SOURCE/." "$KOURTI_HOME/src.new/"
  else
    tar xzf "$SOURCE" -C "$KOURTI_HOME/src.new"
  fi
  rm -rf "$KOURTI_HOME/src"; mv "$KOURTI_HOME/src.new" "$KOURTI_HOME/src"
  REF="local"
elif [[ -d "$KOURTI_HOME/src/.git" ]]; then
  git -C "$KOURTI_HOME/src" remote set-url origin "$REPO"
  git -C "$KOURTI_HOME/src" fetch --quiet origin
  git -C "$KOURTI_HOME/src" checkout --quiet "$REF"
  git -C "$KOURTI_HOME/src" pull --quiet --ff-only origin "$REF" 2>/dev/null || true
else
  rm -rf "$KOURTI_HOME/src"
  git clone --quiet --branch "$REF" "$REPO" "$KOURTI_HOME/src"
fi
[[ -f "$KOURTI_HOME/src/deploy/docker-compose.yml" ]] || die "source has no deploy/docker-compose.yml"

# ── 3. configuration + secrets ──────────────────────────────────────────────
step "Writing configuration ($ENV_FILE)"
secret() { openssl rand -hex 32; }
keep() { local v; v=$(envget "$1"); [[ -n "$v" ]] && printf '%s' "$v" || "$2"; }
# Language: --language wins, else keep the installed value, else English.
DEFAULT_LANGUAGE=${DEFAULT_LANGUAGE:-$(envget DEFAULT_LANGUAGE)}
DEFAULT_LANGUAGE=${DEFAULT_LANGUAGE:-en}
[[ "$DEFAULT_LANGUAGE" == en || "$DEFAULT_LANGUAGE" == el ]] || die "--language must be en or el"
POSTGRES_PASSWORD=$(keep POSTGRES_PASSWORD secret)
JWT_SECRET=$(keep JWT_SECRET secret)
JWT_REFRESH_SECRET=$(keep JWT_REFRESH_SECRET secret)
SSO_SECRET_KEY=$(keep SSO_SECRET_KEY secret)
APP_ENCRYPTION_KEY=$(keep APP_ENCRYPTION_KEY secret)
SIGNED_URL_SECRET=$(keep SIGNED_URL_SECRET secret)
UNSUBSCRIBE_HMAC_SECRET=$(keep UNSUBSCRIBE_HMAC_SECRET secret)
# Optional AI provider keys survive re-runs; add them to .env by hand.
ANTHROPIC_API_KEY=$(envget ANTHROPIC_API_KEY); OPENAI_API_KEY=$(envget OPENAI_API_KEY)
OPENROUTER_API_KEY=$(envget OPENROUTER_API_KEY); LLM_PRIMARY_PROVIDER=$(envget LLM_PRIMARY_PROVIDER)

if [[ "$NO_SMTP" == true ]]; then
  EMAIL_BLOCK="EMAIL_PROVIDER=
SMTP_HOST="
else
  EMAIL_BLOCK="EMAIL_PROVIDER=smtp
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_SECURE=$SMTP_SECURE
SMTP_USER=$SMTP_USER
SMTP_PASSWORD='${SMTP_PASSWORD:-}'
SMTP_FROM_EMAIL=$SMTP_FROM
SMTP_TLS_REJECT_UNAUTHORIZED=$SMTP_TLS_VERIFY"
fi

umask 077
cat >"$ENV_FILE.new" <<EOF
# Kourti configuration — generated by deploy/install.sh on $(date -Is).
# Contains secrets: keep mode 600. Apply changes with: sudo kourtictl compose up -d --build
KOURTI_HOST=$HOST
KOURTI_REF=$REF
PUBLIC_URL=$PUBLIC_URL

NODE_ENV=production
AUTH_MODE=custom
APP_URL=$PUBLIC_URL
PUBLIC_BASE_URL=$PUBLIC_URL
PORTAL_URL=$PUBLIC_URL/portal
CORS_ORIGINS=$PUBLIC_URL
SIGNUP_ENABLED=$ALLOW_SIGNUP
# Default UI/email language for users who have not chosen one (en | el).
DEFAULT_LANGUAGE=$DEFAULT_LANGUAGE

POSTGRES_DB=kourti
POSTGRES_USER=kourti
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
SSO_SECRET_KEY=$SSO_SECRET_KEY
APP_ENCRYPTION_KEY=$APP_ENCRYPTION_KEY
SIGNED_URL_SECRET=$SIGNED_URL_SECRET
UNSUBSCRIBE_HMAC_SECRET=$UNSUBSCRIBE_HMAC_SECRET

# Email (SMTP). Test with: sudo kourtictl test-email --to you@example.com
$EMAIL_BLOCK

# AI providers (optional) — anthropic | openai | openrouter
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
OPENAI_API_KEY=$OPENAI_API_KEY
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
LLM_PRIMARY_PROVIDER=${LLM_PRIMARY_PROVIDER:-anthropic}
EOF
# Carry over every other setting from the previous .env (AI models/endpoint,
# values set with "kourtictl config set", ...) so a re-run never drops them.
if [[ -f "$ENV_FILE" ]]; then
  extra=$(awk -F= 'NR == FNR { if ($0 ~ /^[A-Za-z_][A-Za-z0-9_]*=/) seen[$1] = 1; next }
                   /^[A-Za-z_][A-Za-z0-9_]*=/ && !($1 in seen)' "$ENV_FILE.new" "$ENV_FILE")
  if [[ -n "$extra" ]]; then
    printf '\n# Other settings (kept from the previous configuration)\n%s\n' "$extra" >> "$ENV_FILE.new"
  fi
fi
mv "$ENV_FILE.new" "$ENV_FILE"; chmod 600 "$ENV_FILE"
umask 022

# ── 4. TLS + reverse proxy ──────────────────────────────────────────────────
step "Configuring HTTPS ($TLS)"
install -d -m 755 "$KOURTI_HOME/certs"
SITE_TLS=""
GLOBAL="	auto_https disable_certs"
case "$TLS" in
  selfsigned)
    crt="$KOURTI_HOME/certs/kourti.crt"
    if [[ ! -f "$crt" ]] || ! openssl x509 -in "$crt" -noout -ext subjectAltName 2>/dev/null | grep -qF "$HOST"; then
      if is_ip "$HOST"; then san="IP:$HOST"; else san="DNS:$HOST"; fi
      openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
        -keyout "$KOURTI_HOME/certs/kourti.key" -out "$crt" \
        -subj "/CN=$HOST/O=Kourti" -addext "subjectAltName=$san" \
        -addext "basicConstraints=critical,CA:FALSE" \
        -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
        -addext "extendedKeyUsage=serverAuth" 2>/dev/null
      echo "Generated self-signed certificate for $HOST (valid 825 days)"
    fi
    SITE_TLS="	tls /certs/kourti.crt /certs/kourti.key";;
  custom)
    install -m 644 "$CERT_FILE" "$KOURTI_HOME/certs/kourti.crt"
    install -m 644 "$KEY_FILE" "$KOURTI_HOME/certs/kourti.key"
    SITE_TLS="	tls /certs/kourti.crt /certs/kourti.key";;
  acme)
    GLOBAL="	email $ACME_EMAIL";;
esac
# Caddy runs as root inside its container, so the key can stay root-only.
chmod 644 "$KOURTI_HOME/certs/kourti.crt" 2>/dev/null || true
chmod 600 "$KOURTI_HOME/certs/kourti.key" 2>/dev/null || true
# Browsers send no SNI when connecting to a bare IP; default_sni makes Caddy
# present the right certificate anyway.
is_ip "$HOST" && GLOBAL="$GLOBAL
	default_sni $HOST"

cat >"$KOURTI_HOME/Caddyfile" <<EOF
# Generated by deploy/install.sh — re-run the installer to change it.
{
$GLOBAL
}

https://$HOST {
$SITE_TLS
	encode gzip
	request_body {
		max_size 100MB
	}
	# API straight to the backend (it requires X-Forwarded-Proto=https in production)
	handle /api/* {
		reverse_proxy backend:4000
	}
	handle /health {
		reverse_proxy backend:4000
	}
	handle {
		reverse_proxy app:80
	}
}

http://$HOST {
	redir https://$HOST{uri} permanent
}
EOF

# ── 5. build + start ────────────────────────────────────────────────────────
step "Building and starting containers (first build takes several minutes)"
install -m 755 "$KOURTI_HOME/src/deploy/kourtictl" /usr/local/bin/kourtictl
dc() { docker compose --project-directory "$KOURTI_HOME" -f "$KOURTI_HOME/src/deploy/docker-compose.yml" "$@"; }
dc up -d --build --remove-orphans

step "Waiting for the backend to become healthy"
for i in $(seq 1 60); do
  if curl -fsSk --max-time 5 --resolve "$HOST:443:127.0.0.1" "$PUBLIC_URL/health" >/dev/null 2>&1; then
    echo "healthy"; break
  fi
  [[ $i -eq 60 ]] && { dc logs --tail 50 backend; die "backend did not become healthy (see logs above)"; }
  sleep 5
done
# /health can answer before (or despite) a failed schema bootstrap: confirm the
# tables the firm setup needs actually exist.
for i in $(seq 1 24); do
  ok=$(dc exec -T postgres psql -U kourti -d kourti -tAc \
       "select to_regclass('public.auth_users') is not null and to_regclass('public.subscriptions') is not null" 2>/dev/null || true)
  [[ "$ok" == t ]] && break
  [[ $i -eq 24 ]] && { dc logs --tail 80 backend; die "database schema was not created (see backend logs above)"; }
  sleep 5
done

# ── 6. firm + administrator ─────────────────────────────────────────────────
FIRM_SUMMARY=""
# Decide from the database, not from .env: a first run that failed half-way
# leaves .env behind but no firm.
FIRMS=$(dc exec -T postgres psql -U kourti -d kourti -tAc \
  "select count(*) from public.organizations where id <> '00000000-0000-0000-0000-000000000001'")
if [[ "$FIRMS" == 0 ]]; then
  [[ -n "$FIRM_NAME" && -n "$ADMIN_EMAIL" ]] || die "no firm exists yet: re-run with --firm-name and --admin-email"
  step "Creating firm and administrator"
  args=(--name "$FIRM_NAME" --admin-email "$ADMIN_EMAIL" --seats "$SEATS")
  [[ -n "$ADMIN_FIRST" ]] && args+=(--admin-first "$ADMIN_FIRST")
  [[ -n "$ADMIN_LAST" ]] && args+=(--admin-last "$ADMIN_LAST")
  [[ -n "$ADMIN_PASSWORD" ]] && args+=(--admin-password "$ADMIN_PASSWORD")
  [[ "$NO_SMTP" == true ]] && args+=(--no-email-otp)
  FIRM_SUMMARY=$(KOURTI_HOME="$KOURTI_HOME" kourtictl init-firm "${args[@]}")
  # Greek firms start with the Greek matter types instead of the English defaults
  # (they can still be edited, or the defaults restored, in Settings → Matter types).
  SEED="$KOURTI_HOME/src/deploy/seed/matter-types.$DEFAULT_LANGUAGE.csv"
  if [[ -f "$SEED" ]]; then
    step "Loading the default matter types ($DEFAULT_LANGUAGE)"
    KOURTI_HOME="$KOURTI_HOME" kourtictl matter-types import "$SEED" --replace       || echo "WARNING: matter types not loaded; run: kourtictl matter-types import $SEED --replace" >&2
  fi
fi

echo
echo "================================================================"
echo " Kourti is running at $PUBLIC_URL"
echo "================================================================"
[[ -n "$FIRM_SUMMARY" ]] && echo "$FIRM_SUMMARY"
if [[ "$TLS" == selfsigned ]]; then
  echo
  echo "Self-signed certificate: $KOURTI_HOME/certs/kourti.crt"
  echo "  SHA-256 $(openssl x509 -in "$KOURTI_HOME/certs/kourti.crt" -noout -fingerprint -sha256 | cut -d= -f2)"
  echo "  Import it as a trusted root on the firm's PCs to remove the browser warning."
fi
[[ "$NO_SMTP" == true ]] && echo && echo "WARNING: no SMTP — email 2FA, invitations and client emails will not work."
echo
echo "Manage with: sudo kourtictl help"
