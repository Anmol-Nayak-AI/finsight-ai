# Permanent Free Portfolio Deployment

The default `render.yaml` provisions a zero-cost portfolio preview using:

- one Render Free Docker web service serving both React and FastAPI; and
- one external Neon Free PostgreSQL database with `pgvector`.

Neither current free plan has a fixed expiration date. Free-tier policies can change, and neither plan provides a production uptime SLA, so this is a durable interview and portfolio preview rather than guaranteed free infrastructure forever.

## Free-tier behavior

- Render sleeps the web service after 15 idle minutes; waking can take about one minute.
- Neon suspends database compute after five idle minutes and resumes it on demand while retaining stored data.
- Neon Free currently provides 1 GB of PostgreSQL storage per project.
- Open the application a few minutes before an interview so both services are warm.

## 1. Create a free Neon database

1. Sign in at [Neon](https://console.neon.tech/) and create a project on the **Free** plan.
2. Choose a region close to Render Singapore when one is available.
3. Open **Connect**, select the pooled connection, and copy its PostgreSQL connection string.
4. Store the URL in a password manager. Do not commit or share it.

It normally resembles:

```text
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

The application enables `pgvector`, creates its schema, and seeds 10,000 synthetic transactions automatically on the first boot. Later cold starts detect the existing ledger and skip seeding.

## 2. Generate fresh identity secrets

Replace every seed previously shared in chat or screenshots. Generate four new RFC 6238 Base32 seeds locally:

```bash
python3 - <<'PY'
import base64
import secrets

for _ in range(4):
    print(base64.b32encode(secrets.token_bytes(20)).decode().rstrip("="))
PY
```

Store them in a password manager and add each seed to Google Authenticator or Microsoft Authenticator as a **time-based** setup key:

| Render variable | Authenticator account |
|---|---|
| `MLRO_SHARMA_TOTP_SEED` | `officer.sharma` |
| `MLRO_KAPOOR_TOTP_SEED` | `officer.kapoor` |
| `ANALYST_VERMA_TOTP_SEED` | `analyst.verma` |
| `REGULATOR_IYER_TOTP_SEED` | `regulator.iyer` |

Create a different strong password for every corresponding `*_PASSWORD` variable.

## 3. Apply the free Render Blueprint

1. In Render, choose **New > Blueprint**.
2. Connect `Anmol-Nayak-AI/finsight-ai` and select `main`.
3. Render discovers `render.yaml` and proposes one web service.
4. Confirm that its instance type is **Free**.
5. For `DATABASE_URL`, paste the pooled Neon connection string.
6. Enter all four passwords and all four fresh TOTP seeds.
7. Apply the Blueprint.

No Render PostgreSQL resource should appear in the plan. If one does, stop and ensure Render is reading the latest `main` branch.

## 4. Verify the workflow

Open `https://finsight-ai-compliance-demo.onrender.com`. If Render assigns another hostname, use the URL on the service page and set `ALLOWED_ORIGINS` to that exact HTTPS origin.

1. Sign in as `analyst.verma` with its password and current authenticator code.
2. Select an account holder, run an investigation, and submit a Maker recommendation.
3. Sign out and sign in as `officer.sharma` or `officer.kapoor` to adjudicate it.
4. For a Checker escalation, sign in as `regulator.iyer` and record the external disposition.

The `/health` endpoint verifies both application and database readiness.

## Optional OpenAI execution

The deterministic compliance fallback works without an API key. Adding `OPENAI_API_KEY` enables model-backed analysis, but provider API usage is separate from free hosting and might incur charges.

## Paid upgrade path

The optional `render.paid.yaml` retains the separated public Nginx frontend, private FastAPI API, and durable paid Render PostgreSQL topology. Select that file explicitly only when paid production-style resources are wanted.
