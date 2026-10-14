# Deploy FinSight AI on Render for Free

The default `render.yaml` provisions a zero-cost interview-preview environment:

- one free Docker web service that serves both the compiled React application and the FastAPI API; and
- one free PostgreSQL 16 database with the `pgvector` extension initialized by the application.

Both resources are deployed in Singapore. The first successful application deployment seeds 10,000 synthetic ledger transactions so account-holder search and the complete investigation workflow are ready to demonstrate.

## Free-tier limitations

This topology is intended for evaluation, not production:

- the web service sleeps after 15 minutes without inbound traffic and can take about one minute to wake;
- the workspace receives 750 free instance hours per month;
- the database is limited to 1 GB and expires 30 days after creation;
- the free database has no managed backups; and
- Render can restart free resources during maintenance.

Open the application several minutes before an interview and run one complete workflow to warm the service. Export anything important before the database expiration date.

## 1. Generate new identity secrets

Use unique passwords and a unique RFC 6238 Base32 seed for every officer. Do not commit these values or share them in chat or screenshots.

Generate four TOTP seeds locally:

```bash
python3 - <<'PY'
import base64
import secrets

for _ in range(4):
    print(base64.b32encode(secrets.token_bytes(20)).decode().rstrip("="))
PY
```

Store each seed in a password manager and add it to an authenticator application under its matching username before deploying:

| Render variable | Login username |
|---|---|
| `MLRO_SHARMA_PASSWORD` / `MLRO_SHARMA_TOTP_SEED` | `officer.sharma` |
| `MLRO_KAPOOR_PASSWORD` / `MLRO_KAPOOR_TOTP_SEED` | `officer.kapoor` |
| `ANALYST_VERMA_PASSWORD` / `ANALYST_VERMA_TOTP_SEED` | `analyst.verma` |
| `REGULATOR_IYER_PASSWORD` / `REGULATOR_IYER_TOTP_SEED` | `regulator.iyer` |

In Google Authenticator or Microsoft Authenticator, choose **Enter a setup key**, use the login username as the account name, paste its corresponding seed, and select a time-based key.

## 2. Create the free Blueprint

1. Sign in to Render and choose **New > Blueprint**.
2. Connect the GitHub repository `Anmol-Nayak-AI/finsight-ai`.
3. Select the `main` branch. Render automatically discovers `render.yaml`.
4. Confirm that both displayed plans are **Free** before continuing.
5. Enter all eight prompted identity secrets.
6. Review the plan and apply the Blueprint.

The first deployment takes several minutes because Render builds the combined Docker image, initializes PostgreSQL, creates the vector extension, and seeds the ledger.

## 3. Verify the deployment

Open `https://finsight-ai-compliance-demo.onrender.com`. If Render assigns a different hostname, use the URL shown on the web-service page and update `ALLOWED_ORIGINS` in the service environment to that exact HTTPS origin.

Verify the complete workflow:

1. Log in as `analyst.verma` with the matching password and current TOTP code.
2. Search for an account holder, trigger an investigation, and submit a Maker recommendation.
3. Sign out and log in as `officer.sharma` or `officer.kapoor`.
4. Record a Checker decision. For an escalation, sign in as `regulator.iyer` and record the external disposition.
5. Confirm duplicate submissions return a conflict and do not create another pending case.

The `/health` endpoint verifies both the application and database schema.

## Optional OpenAI execution

The platform works without an OpenAI key by using its deterministic compliance-analysis fallback. To enable model-backed analysis, add `OPENAI_API_KEY` to the web service in Render and redeploy it. External API traffic counts toward Render's free-tier limits.

## Upgrade path

The optional `render.paid.yaml` preserves the separated topology with a public Nginx frontend, private FastAPI API, and durable paid PostgreSQL. To use it, create a separate Blueprint and explicitly select `render.paid.yaml` instead of the default file.
