# Deploy FinSight AI on Render

The repository includes a production Render Blueprint at `render.yaml`. It provisions:

- a public Nginx web service for the React application;
- a private FastAPI service reachable only over Render's private network; and
- a private PostgreSQL 16 database with the `pgvector` extension initialized by the application.

All resources are deployed in Singapore. The first successful API deployment seeds 10,000 synthetic ledger transactions so the account-holder search and investigation workflow are ready to demonstrate.

## 1. Generate identity secrets

Use unique passwords and a unique RFC 6238 Base32 seed for every officer. Do not commit these values.

Generate four TOTP seeds locally:

```bash
python3 - <<'PY'
import base64
import secrets

for _ in range(4):
    print(base64.b32encode(secrets.token_bytes(20)).decode().rstrip("="))
PY
```

Store each seed in an authenticator application under its matching username before deploying. Render will prompt for these eight secret values:

| Render variable | Login username |
|---|---|
| `MLRO_SHARMA_PASSWORD` / `MLRO_SHARMA_TOTP_SEED` | `officer.sharma` |
| `MLRO_KAPOOR_PASSWORD` / `MLRO_KAPOOR_TOTP_SEED` | `officer.kapoor` |
| `ANALYST_VERMA_PASSWORD` / `ANALYST_VERMA_TOTP_SEED` | `analyst.verma` |
| `REGULATOR_IYER_PASSWORD` / `REGULATOR_IYER_TOTP_SEED` | `regulator.iyer` |

## 2. Create the Blueprint

1. Sign in to Render and choose **New > Blueprint**.
2. Connect the GitHub repository `Anmol-Nayak-AI/finsight-ai`.
3. Select the `main` branch. Render automatically discovers `render.yaml`.
4. Enter all eight prompted identity secrets.
5. Review the estimated monthly cost and apply the Blueprint.

The first deployment takes longer because Render builds two Docker images, initializes the schema, creates the vector extension, and seeds the synthetic ledger.

## 3. Verify the deployment

Open the public frontend URL and verify these flows:

1. Log in as `analyst.verma` with the matching TOTP code.
2. Search for an account holder, trigger an investigation, and submit a Maker recommendation.
3. Sign out and log in as `officer.sharma` or `officer.kapoor`.
4. Record a Checker decision. For an escalation, sign in as `regulator.iyer` and record the external disposition.
5. Confirm duplicate submissions return a conflict and do not create another pending case.

The frontend health endpoint is `/healthz`. The backend `/health` endpoint is intentionally private and verifies both database connectivity and required schemas.

## Optional OpenAI execution

The platform works without an OpenAI key by using its deterministic compliance-analysis fallback. To enable model-backed analysis, add `OPENAI_API_KEY` to the private API service in Render and redeploy it.

## Security and operations

- Keep `DEMO_MODE=false` and never publish passwords or TOTP seeds.
- Rotate identity secrets after an interview or any shared demonstration.
- Leave the database public IP allowlist empty; application traffic uses Render's private network.
- Use a paid database for durable data and backups. Free Render PostgreSQL expires and is not suitable for this deployment.
- Configure a custom domain only after the generated `onrender.com` deployment is healthy. If the frontend origin changes, update `ALLOWED_ORIGINS` on the API service.
