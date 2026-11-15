# Kourti — Operator & Administrator Guide

For whoever installs and runs Kourti for a firm (lawyers, architects, engineers…),
and for the firm's own administrator. It covers: what this fork changes, installing
for a client, users and access, connecting a **real mail account**, turning on
**email two-factor authentication**, and onboarding **AI**.

Detailed references: [deploy/README.md](deploy/README.md) (install procedure),
[deploy/ADD-USER.md](deploy/ADD-USER.md) (adding users in the database).

---

## 1. What this fork adds to Kourti

| Area | Change |
|---|---|
| Self-hosting | `deploy/install.sh` installs one firm per VM (Docker, HTTPS, secrets, firm, licence, admin). `kourtictl` operates it. |
| Sign-up | Public self-service sign-up is **off** (`SIGNUP_ENABLED=false`). Accounts come from invitations, the client portal, or the operator. |
| Seats | Each firm gets a permanent licence with N seats (no payment provider needed). Fixes the greyed-out **Invite** button. |
| Email | Sends through **any SMTP server** (Microsoft 365, Google Workspace, your host, a relay) — previously only the Resend cloud service. |
| Users | `kourtictl delete-user` — permanent deletion that frees the seat (the app itself can only disable). |
| Voice → tasks | **Extract tasks & events** on a transcript: the AI proposes tasks (with assignee and due date), calendar events and the matter. The user reviews them before anything is created. |
| AI | One provider can serve everything: chat, agents, document search and voice transcription all work with OpenAI alone (previously search and voice required OpenRouter). `kourtictl ai endpoint` points the OpenAI slot at DeepSeek, Mistral or a local model server. |
| Database | Upstream deleted its full database schema in May 2026, and its own setup only rebuilds part of it. On a fresh install, creating a client, invoices, matter activity and time entries, document search, **Disable User**, changing roles and more failed. `backend-node/src/db/schemaCompletion.ts` adds the missing tables, columns and functions on every start; it only adds and never changes existing data. Postgres now includes **pgvector** (`deploy/postgres/`) for document search. |
| Fixes | Postgres TLS off on the private Docker network (`DB_SSL=false`); missing `invitations` columns on Docker installs; crash when opened over plain HTTP; invitation emails opened the sign-in form instead of the set-password page; forced password change at first sign-in looped forever; password forms said 8 characters while the server requires 12; re-running the installer dropped AI model and `config set` values; the Voice & Transcriptions page was broken end to end (table never created, transcript field name mismatch, playback blocked by the security policy, summary and save calls pointing at missing endpoints). |

## 2. Installing for a client (summary)

```sh
git clone https://github.com/nikmak88/Kourti.git /tmp/kourti-installer
cd /tmp/kourti-installer/deploy
export SMTP_PASSWORD='…'
sudo -E bash install.sh --host 10.0.0.20 \
  --firm-name "Dupont & Associés" --admin-email admin@dupont.be --seats 10 \
  --smtp-host smtp.example.com --smtp-user kourti@dupont.be --smtp-from kourti@dupont.be
```

The installer prints the URL and the administrator's temporary password.
Full procedure, TLS options, acceptance checklist, backups: [deploy/README.md](deploy/README.md).
All operator commands: `sudo kourtictl help`.

Configuration lives in **`/opt/kourti/.env`** on the VM (mode 600). Prefer the
`kourtictl` commands below to editing it by hand — they validate the values and
restart the backend for you.

## 3. Users and access

| Who | How they get an account |
|---|---|
| Staff (lawyers, assistants…) | Firm admin: **Users** (sidebar) → **Invite**. The person gets an email, sets a password, signs in with an email code. |
| Clients | From a client or matter: **Client portal → Invite**. Clients use `https://<host>/portal`. |
| Anyone, by the operator | `sudo kourtictl create-user --email … --role user` — see [deploy/ADD-USER.md](deploy/ADD-USER.md). |
| Public sign-up | Disabled. |

Roles: `admin` (manages users and settings), `user` (regular staff),
`superadmin` (admin who can also create admins), plus custom roles from
**Settings → Roles**. Platform super-admin (`/thanos`) is for the operator only.

Seats: every member and every pending invitation uses one. When all are used,
**Invite** is greyed out → `sudo kourtictl set-seats <n>`.

Invitation links open `https://<host>/auth/set-password?token=…`, where the
invitee chooses a password (at least 12 characters, upper- and lower-case and a
digit) and then signs in with the emailed code. The link is valid for **24 hours**;
**Users → ⋯ → Resend Invitation** sends a fresh one.

### 3.0 Matter types and issues

**New Matter** asks for a **matter type** (Litigation, Family Law, Tax, …) and
then a **matter issue** within it (Family Law → Divorce, Maintenance, …).

- **Defaults:** every install gets 15 types and 5–7 issues per type, plus
  **Other**, so a matter can always be created.
- **Who manages what:** the platform super-admin (`/thanos` → Case types)
  manages the types. The app has **no screen for issues**.
- **Adding firm-specific issues:** do it on the VM. They appear only for that
  firm:

```sh
sudo kourtictl psql
```
```sql
insert into case_issues (case_type_id, organization_id, name)
select id, (select id from organizations where name = 'Dupont & Associés'), 'Construction defects'
  from case_types where name = 'Real Estate & Property';
```

### 3.1 Removing a user

The application has **no "delete user" button**. Firm admins can only *disable*
an account; deleting it is an operator task on the VM.

| Goal | Who | How | Seat freed? |
|---|---|---|---|
| Block someone immediately (left the firm, lost laptop) | Firm admin | **Users** → ⋯ next to the person → **Disable User**. Signs them out and blocks sign-in. **Enable User** reverses it. | No |
| Withdraw an invitation not yet accepted | Firm admin | **Users** → pending invitation → ⋯ → **Delete Invitation** | Yes |
| Delete an account for good | Operator | `sudo kourtictl delete-user --email jean.martin@dupont.be` | Yes |

Recommended when someone leaves: **disable first** (instant, reversible), have
their cases and tasks reassigned, then **delete** once nothing is outstanding.

What `delete-user` does. It runs the application's own GDPR erasure routine,
the same one behind a user's *Settings → Privacy → Delete my account*.

- **Deleted:** login, profile, roles (including platform admin), AI chats,
  2FA codes, conversation memberships. Any pending invitation to that address
  is cancelled too.
- **Anonymised:** their address in the email log and audit trail.
- **Kept:** firm data — cases, clients, documents, time entries, notes. Items
  they created or were assigned show no author/assignee afterwards.
  Reassign them **before** deleting.
- It asks you to type the email address to confirm (`-y` skips the prompt for
  scripts). It is **irreversible** — restoring means restoring a backup
  (`kourtictl backup` first if in doubt).
- It refuses to delete the **firm owner** (the administrator created by the
  installer). Deleting them would orphan the firm. To replace the owner,
  create the new administrator, then hand the owner flag over in SQL:

  ```sh
  sudo kourtictl psql
  ```
  ```sql
  update profiles set is_organization_creator = (email = 'new.admin@dupont.be')
   where email in ('old.admin@dupont.be', 'new.admin@dupont.be');
  ```

  then run `delete-user` on the old address.

If only an email address is known to have been invited (no account yet),
`delete-user` simply cancels the pending invitation.

Without `kourtictl` (plain SQL), use the steps in
[deploy/ADD-USER.md → Deleting a user](deploy/ADD-USER.md#deleting-a-user).

---

## 4. Connecting the firm's real mail account (SMTP)

Kourti **sends** mail through the account you configure: sign-in codes,
invitations, client-portal notices, client updates, password resets. It does not
read a mailbox — but because messages are sent *from* that account, **when a
client replies, the reply lands in that mailbox**. Use an address the firm
actually monitors (e.g. `kourti@firm.be` or `office@firm.be`), not a no-reply.

### 4.1 Choose how to send

| Your mail is hosted at | Recommended setting |
|---|---|
| **Microsoft 365 / Exchange Online** | Read the warning below first. Host `smtp.office365.com`, port `587`, user = the mailbox, password = its password. |
| **Google Workspace / Gmail** | Host `smtp.gmail.com`, port `587`, user = the mailbox, password = an **app password**. |
| **A web host** (OVH, Combell, one.com, Infomaniak…) | The host's SMTP server (see its help pages), usually port `587` or `465`, mailbox + password. |
| **Firm's own mail server / relay** | Its hostname, port `25` or `587`, no user if it trusts the VM's IP. |
| **Sending service** (Brevo, Mailjet, SMTP2GO…) | The service's SMTP host/port and SMTP key; verify the firm's domain in the service. |

> **Microsoft 365 warning (December 2026).** Microsoft is retiring password
> ("basic") authentication for SMTP. As announced in Message Center **MC786329**,
> from **December 2026** it is **disabled by default** for existing tenants and
> mail fails with `550 5.7.30 Basic authentication is not supported`. An M365
> admin can still re-enable it temporarily, but it will be removed for good
> later (Microsoft will announce that date in 2027). Check the current status of
> MC786329 in the tenant's Message Center. Options that keep working:
>
> 1. **M365 SMTP relay (connector)** — no password: in the Exchange admin centre
>    create an inbound *connector* from "Your organization's email server",
>    identified by the VM's **public IP**; then use host
>    `<yourdomain>.mail.protection.outlook.com`, port `25`, **no user**, and a
>    `--from` address in the firm's domain. Requires a fixed public IP for the
>    VM's outbound traffic and the domain's SPF record to include that IP.
> 2. **A sending service** (row above) — simplest if there is no fixed IP.
> 3. Basic auth while it lasts: M365 admin centre → **Users → Active users** →
>    the mailbox → **Mail → Manage email apps** → tick **Authenticated SMTP**;
>    and in **Settings → Org settings → Modern authentication** make sure SMTP
>    AUTH is not turned off for the tenant. Plan to move to 1 or 2.

**Google app password:** the Google account needs **2-Step Verification** on;
then **myaccount.google.com → Security → App passwords** → create one named
"Kourti" → use the 16-character code (without spaces) as the SMTP password.
If the Workspace admin has disabled app passwords, use the Workspace SMTP relay
(`smtp-relay.gmail.com`, allowed by IP in the Admin console) instead.

### 4.2 Configure it on the VM

```sh
export SMTP_PASSWORD='the-password-or-app-password'     # not stored in shell history
sudo -E kourtictl smtp --host smtp.office365.com --port 587 \
     --user kourti@dupont.be --from kourti@dupont.be
sudo kourtictl test-email --to you@yourcompany.be
```

- `--from` is the plain address only (the app adds the sender name itself:
  the firm's name on client emails, "Kourti AI" on system emails).
- Port `465` → implicit TLS automatically; `587` → STARTTLS.
- Internal relay with a self-signed certificate → add `--insecure-tls`.
- Without `--user` (relay), no password is asked.
- Show what is configured: `sudo kourtictl smtp --show`.

`test-email` connects, authenticates and sends; it prints the server's reply or
the exact error. Typical errors:

| Error | Meaning / fix |
|---|---|
| `535 5.7.3 Authentication unsuccessful` / `5.7.139` | Wrong password, or Authenticated SMTP off for the M365 mailbox |
| `550 5.7.30 Basic authentication is not supported` | M365 basic auth retired — use the relay or a sending service (4.1) |
| `534-5.7.9 Application-specific password required` | Gmail: use an app password |
| `ETIMEDOUT` / `ECONNREFUSED` | VM cannot reach the SMTP host/port — firewall or wrong port |
| `self-signed certificate` | Internal server: `--insecure-tls` |
| Message sent but lands in spam | The firm's domain needs SPF (and ideally DKIM/DMARC) covering the sender — ask whoever manages the domain's DNS |

### 4.3 Replacing the lab's test mailbox

The lab VM (192.168.2.72) sends into **Mailpit**, a test mailbox at
<http://192.168.2.72:8025> that catches everything. To switch it to the real
account, run 4.2 on the VM, send a test, then remove Mailpit:

```sh
sudo docker rm -f mailpit
```

The lab's test users (`@lab.local`) cannot receive real mail: before signing in
again, either change their email to a real one (Users page) or turn their email
2FA off (`sudo kourtictl email-otp --email admin@lab.local off`).

---

## 5. Turning on two-factor authentication by email

With SMTP working, every sign-in asks for a **6-digit code sent by email**
(valid 10 minutes, single use) after the password.

- **New accounts** (invited, created by `kourtictl`, the installer's admin) have
  email 2FA **on by default**.
- **Turn it on for everyone already there** (e.g. after an install with `--no-smtp`):
  ```sh
  sudo kourtictl email-2fa-all on
  ```
  It refuses to run until SMTP is configured, so nobody gets locked out.
- **A user can switch it themselves:** **Settings → Profile → Two-Factor
  Authentication (Email)** → toggle → confirm with their current password.
- **Check who has it:** `sudo kourtictl users` (column `email_2fa`).

**Locked out** (mailbox unavailable, codes not arriving):
```sh
sudo kourtictl email-otp --email jean.martin@dupont.be off   # let them in
# …fix the mail problem, then
sudo kourtictl email-otp --email jean.martin@dupont.be on
```
If codes stop arriving for everyone, run `sudo kourtictl test-email --to …` —
it is almost always the SMTP account (password changed, M365 basic auth retired).

Recommended per firm: keep email 2FA on for all staff; admins should use a
mailbox only they can read.

---

## 6. Onboarding AI

### 6.1 Where the AI settings are

There is **no AI settings screen** in the app. AI is configured per install in
`/opt/kourti/.env` and managed with `kourtictl ai`. Until a key is added, AI
features return an error; everything else works.

```sh
sudo kourtictl ai status
```

### 6.2 What each provider is used for

| Provider | Setting | Used for |
|---|---|---|
| Provider | Chat, review, drafting, AI agents/tasks | Document search (embeddings) | Voice transcription |
|---|---|---|---|
| **OpenAI** (`ai key openai`) | ✅ | ✅ `text-embedding-3-small` | ✅ `gpt-4o-mini-transcribe` |
| **OpenRouter** (`ai key openrouter`) | ✅ | ✅ `openai/text-embedding-3-small` | ✅ `openai/gpt-audio-mini` |
| **Anthropic** (`ai key anthropic`) | ✅ | ❌ | ❌ |
| DeepSeek (via `ai endpoint`, §6.4) | ✅ | ❌ | ❌ |

- **Chat and agents:** `LLM_PRIMARY_PROVIDER` is tried first. If it fails, the
  other providers that have a key are tried in turn.
- **Search and voice** use one provider each. By default that's OpenRouter if
  it has a key, otherwise the **openai** slot. To choose explicitly:
  `sudo kourtictl ai service search|voice openai|openrouter|auto`.

So **OpenAI or OpenRouter alone covers every feature**. Anthropic or DeepSeek
cover chat only. Add OpenAI or OpenRouter as well if the firm wants document
search and voice notes.

### 6.3 One provider for everything: OpenAI (recommended)

1. **Get a key.** Go to <https://platform.openai.com>:
   - Create a **project** for the firm.
   - Under **Billing**, add credit and set a **monthly budget**.
   - Under **API keys**, create a key in that project. It starts with `sk-proj-`.
2. **Store it on the VM** (prompted, never echoed). If the openai slot was
   pointed at another service (e.g. DeepSeek), reset it first:
   ```sh
   sudo kourtictl ai endpoint default    # only if `ai status` shows a non-OpenAI endpoint
   sudo kourtictl ai key openai
   sudo kourtictl ai primary openai
   ```
3. **Pick the chat model.** The built-in default is `gpt-5.4-2026-03-05`, with
   `gpt-5-mini` as fallback. Change it with
   `sudo kourtictl ai model openai <model-id>`.
4. **Test:**
   ```sh
   sudo kourtictl ai status   # document search: openai (auto)   voice transcription: openai (auto)
   sudo kourtictl ai test     # chat: OK … / search: OK via openai | vector size 1536
   ```
5. **Voice:** open **Voice & Transcriptions** in the app, record a few seconds
   and stop. The text should appear.

Search and voice switch to OpenRouter automatically if an OpenRouter key is
added later. To keep everything on OpenAI anyway, run
`sudo kourtictl ai service search openai` and `… ai service voice openai`.

#### Choosing OpenAI models

```sh
sudo kourtictl ai models                         # what this key can use + current choice
sudo kourtictl ai model openai gpt-5.5           # chat, review, drafting, agents/tasks
sudo kourtictl config set OPENAI_FALLBACK_CHAT_MODEL gpt-5.4-mini   # used if the main model is rejected
sudo kourtictl ai voice-model gpt-4o-transcribe  # voice transcription
sudo kourtictl ai test
```

Chat models must handle Kourti's plain answers **and** tool calls (agents, and
creating tasks or deadlines). Tested on the lab key on 2026-11-15:

| Chat model | Plain chat | Tool calls | Use? |
|---|---|---|---|
| `gpt-5.5`, `gpt-5.4` (default), `gpt-4.1` | ✅ | ✅ | Yes |
| `gpt-5.4-mini`, `gpt-5.4-nano` | ✅ | ✅ | Yes: cheaper and faster. `gpt-5.4-mini` is the fallback |
| `gpt-6-*`, `gpt-6.1-*`, `gpt-5.6-*` | ✅ | ❌ | **Not yet.** They refuse tool calls in the request format Kourti uses, so agents and task creation would fail |
| `gpt-5.5-pro`, `gpt-5.4-pro` | ❌ | ❌ | No: Kourti's request format doesn't support them |
| `gpt-5-mini` (upstream fallback default) | ❌ | ❌ | Only after OpenAI **verifies your organization**. That's why the fallback was changed to `gpt-5.4-mini` |

| Voice model | Result on a test recording | Notes |
|---|---|---|
| `gpt-4o-mini-transcribe` (default) | ✅ exact | Cheapest of the accurate ones |
| `gpt-4o-transcribe` | ✅ exact | Higher accuracy on noisy rooms, accents, legal terms |
| `gpt-transcribe` | ✅ exact | Newest |
| `whisper-1` | ✅ | Oldest; writes numbers differently ("1 December") |
| `gpt-4o-transcribe-diarize` | ✅ text only | Built to label speakers, but the page doesn't show speaker labels |

- **Summaries** of recordings (**Generate Summary**) use the **chat** model,
  not the voice model.
- **Document search** stays on `text-embedding-3-small`. Changing it would
  require re-indexing every document.
- **How strict document search is:** `RAG_MATCH_THRESHOLD` (default `0.3`).
  With this model, relevant passages score about 0.3–0.6 and unrelated text
  about 0.1. Raise it if results are too loose:
  `sudo kourtictl config set RAG_MATCH_THRESHOLD 0.35`.
- Prices differ a lot between models. Check
  <https://platform.openai.com/docs/pricing> and keep a monthly budget on the
  OpenAI project.

#### Voice notes → tasks and calendar events

In **Voice & Transcriptions**, after a recording is transcribed, click
**Extract tasks & events**. The chat model reads the transcript and **proposes**:

- **Tasks:** what someone has to do, with a due date, a priority and an
  assignee. "Marie drafts…" goes to Marie. "I have to…" goes to the person who
  recorded the note.
- **Calendar events:** hearings, meetings and deadlines with a specific day
  and, when given, a time and place.
- **The matter** the note is about, picked from the firm's open matters by
  name, client or subject. The matter's type and issue are shown with it.

Relative dates ("tomorrow", "next Friday", "the 12th of next month") are
resolved from the recording day. Vague timeframes ("sometime next week") never
become calendar events; they become tasks instead.

Nothing is created automatically. Review the list, edit titles, dates,
assignees and the matter, untick what you don't want, then click **Create**.
Tasks need a matter; events can go in the calendar without one. Each item keeps
the quote from the transcript it came from.

This uses the **chat** model through tool calls, so it needs a model that
supports them (see the table above). The transcript, the firm's open matters
(title, client, type) and staff names are sent to the AI provider.

### 6.3b Alternative: Anthropic (Claude) for chat

1. **Get a key.** Go to <https://console.anthropic.com> → create an organization
   for the firm (or one per firm you host) → **Billing**: add credit and set a
   **monthly spend limit** → **API keys → Create key** named after the firm.
2. **Store it on the VM** (prompted, never echoed):
   ```sh
   sudo kourtictl ai key anthropic
   sudo kourtictl ai primary anthropic
   ```
3. **Pick the model.** The built-in default is an older model; set a current one:
   ```sh
   sudo kourtictl ai model anthropic claude-sonnet-5-5   # good quality/cost balance
   # or claude-opus-5-5 for the most demanding review work,
   #    claude-haiku-5-5 for the cheapest/fastest
   ```
4. **Test:**
   ```sh
   sudo kourtictl ai test        # → model: claude-sonnet-5-5 | reply: Kourti AI OK
   ```
5. **Document search and voice:** Anthropic offers neither. Add an OpenAI key
   (`sudo kourtictl ai key openai`) or an OpenRouter key
   (`sudo kourtictl ai key openrouter`). Anthropic stays the primary for chat,
   and the other provider also acts as its fallback.
6. **Try it in the app:** open a matter or document and use the AI actions;
   **AI Agents**, **Intelligence**, **Negotiations** and **Voice &
   Transcriptions** are in the sidebar; contract analysis/compare/generate live
   under **Contracts**.

Other commands: `kourtictl ai key <provider> --remove`,
`kourtictl ai model <provider> default`, `kourtictl ai primary openai`.

**Which key goes where.** Kourti has three slots and each key only works in the
right one — a key in the wrong slot gives *"… API key not configured"* or
*"401 invalid API key"* in the chat:

| Key looks like | It is from | Slot |
|---|---|---|
| `sk-ant-…` | Anthropic | `ai key anthropic` |
| `sk-or-v1-…` | OpenRouter | `ai key openrouter` (the command refuses other keys) |
| `sk-proj-…` / `sk-…` (long) | OpenAI | `ai key openai` |
| `sk-` + 32 characters | DeepSeek | `ai key openai` **after** `ai endpoint` (§6.4) |
| anything else (Mistral, Groq, …) | that service | `ai key openai` **after** `ai endpoint` (§6.4) |

### 6.4 Other providers: DeepSeek, Mistral, local models

The **openai** slot can point at any service that speaks the OpenAI chat API.
Set the service's address and model, then its key:

```sh
sudo kourtictl ai endpoint https://api.deepseek.com/v1 --model deepseek-chat
sudo kourtictl ai key openai          # paste the DeepSeek key
sudo kourtictl ai primary openai
sudo kourtictl ai test                # → model: deepseek-chat | reply: Kourti AI OK
```

| Service | `ai endpoint` | Example `--model` | Notes |
|---|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-v4-pro`, `deepseek-flash` | Data processed in **China** — see §6.5 |
| Mistral (EU) | `https://api.mistral.ai/v1` | `mistral-large-latest` | EU company and hosting |
| Local Ollama | `http://<server>:11434/v1` | `llama3.3`, `qwen3` | Nothing leaves the firm; needs a GPU server. Use any non-empty key, e.g. `ollama` |
| vLLM / LM Studio / LiteLLM | `http://<server>:<port>/v1` | the served model name | Same idea |

To see the models a key can use (on the VM, the key is not stored by this):
`curl -s -H "Authorization: Bearer <key>" https://api.deepseek.com/v1/models`.

- Back to real OpenAI: `sudo kourtictl ai endpoint default`.
- The output-length field is sent as `max_tokens` to these services
  (`max_completion_tokens` to OpenAI itself). If a service rejects it, override
  with `sudo kourtictl config set OPENAI_TOKEN_PARAM max_completion_tokens`.
- Chat, document review, drafting and the AI agents (tool calls) all use this
  slot.
- **Search and voice** follow the same address: Kourti calls `<endpoint>/embeddings`
  and `<endpoint>/audio/transcriptions`.
  - **Mistral** and local servers that offer these endpoints work.
  - **DeepSeek doesn't offer them** (404 Not Found). With DeepSeek, add an
    OpenRouter key and run `ai service search openrouter` and
    `ai service voice openrouter`.
- Models for search and voice on this slot: `OPENAI_EMBEDDING_MODEL` (default
  `text-embedding-3-small`; keep a model that returns 1536-number vectors) and
  `OPENAI_STT_MODEL` (default `gpt-4o-mini-transcribe`). Set them with
  `kourtictl config set`.

### 6.5 Before enabling AI for a firm (professional duties & GDPR)

- AI requests send **document and case content** to the provider (outside the
  EU for most providers). The firm, as data controller, should: sign the
  provider's **data processing agreement**, check the provider does not train on
  API data (Anthropic and OpenAI API terms say they don't by default), record it
  in its processing register, and tell clients where its engagement letters
  require it. Re-check the provider's current terms; they change.
- With OpenRouter, the request goes through OpenRouter to the underlying model
  vendor — two processors instead of one.
- **DeepSeek's own API processes data in China.** There is no EU adequacy
  decision for China, and Italy's data protection authority ordered DeepSeek
  blocked in January 2025. Do not send real client files there without
  the firm's documented legal assessment; for confidential work prefer an EU
  provider (Mistral) or a model running on the firm's own server (Ollama/vLLM),
  which can be DeepSeek's openly published models.
- Lawyers' professional secrecy (and architects'/engineers' confidentiality
  clauses) make this the firm's decision: get it in writing before adding keys.
- AI output can be wrong: the firm should make professional review of every AI
  result before use or sending a written rule.
- Cost control: spend limits in the provider console; one key per firm so usage
  and invoices are separate.

---

## 7. Quick reference

| I want to… | Command (on the VM) |
|---|---|
| See if everything is running | `sudo kourtictl status` |
| Read backend errors | `sudo kourtictl logs backend` |
| Configure / check mail | `sudo -E kourtictl smtp …` · `sudo kourtictl smtp --show` · `sudo kourtictl test-email --to …` |
| Email 2FA for everyone / one user | `sudo kourtictl email-2fa-all on` · `sudo kourtictl email-otp --email … on\|off` |
| Configure AI | `sudo kourtictl ai key anthropic` · `ai model …` · `ai test` |
| Use DeepSeek / Mistral / local models | `sudo kourtictl ai endpoint <url> --model <id>` · `ai key openai` (§6.4) |
| List / choose OpenAI models | `sudo kourtictl ai models` · `ai model openai <id>` · `ai voice-model <id>` (§6.3) |
| Choose who does search / voice | `sudo kourtictl ai service search\|voice openai\|openrouter\|auto` |
| Add a user / reset a password | `sudo kourtictl create-user …` · `sudo kourtictl reset-password --email …` |
| Block / delete a user | `sudo kourtictl disable-user --email …` · `sudo kourtictl delete-user --email …` (§3.1) |
| Change seats | `sudo kourtictl set-seats 15` |
| Back up | `sudo kourtictl backup` |
| Change any setting | `sudo kourtictl config set KEY value` |
| Update the application | `sudo kourtictl update --ref <tag>` |

## 8. Lab environment (192.168.2.72)

| | |
|---|---|
| App | <https://192.168.2.72> (self-signed certificate — import `/opt/kourti/certs/kourti.crt` as a trusted root) |
| Mail | Real SMTP account (configured with `kourtictl smtp`). Mailpit test mailbox still runs on <http://192.168.2.72:8025> but no longer receives |
| AI | OpenAI for everything: chat `gpt-5.4`, fallback `gpt-5.4-mini`, voice `gpt-4o-mini-transcribe`, search `text-embedding-3-small` |
| Firm | Lab Law Firm, 12 seats |
| Accounts | `admin@lab.local` (admin), `bob@lab.local`, `carol@lab.local` (users) — passwords kept outside this repo |
| Old dev-mode data | Docker volumes `kourti-lab_*` (not running) |
