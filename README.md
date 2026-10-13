# FinSight AI — Enterprise Multi-Agent AML Compliance & Governance Platform

![FinSight Architecture](architecture_diagram.png)

FinSight AI is an institutional-grade Anti-Money Laundering (AML) regulatory intelligence and transaction monitoring engine designed for Tier-1 financial institutions. It enforces the statutory **Four-Eyes Principle (Dual-Control)**, RFC 6238 TOTP two-factor authentication, multi-agent cyclical reasoning via LangGraph, and hybrid Reciprocal Rank Fusion (RRF) search over regulatory circulars.

---

## 🏛️ Core Architecture & Capabilities

### 1. Institutional Four-Eyes Principle (Maker-Checker Governance)
- **Analyst Desk (Maker)**:
  - Profiles incoming transactions against 30-day moving turnover baselines.
  - Computes velocity deviation multipliers and triggers LangGraph multi-agent investigations.
  - Submits formal recommendations (`RECOMMEND_REJECT`, `RECOMMEND_ESCALATE`, `RECOMMEND_APPROVE`).
- **MLRO Executive Desk (Checker)**:
  - Holds exclusive legal authority to issue binding statutory rulings (`ACCOUNT_FREEZE`, `ESCALATE`, `APPROVE`) and file Suspicious Activity Reports (SARs) with regulatory bodies (e.g., FIU-IND).
  - Test sliders and manual creation controls are strictly prohibited and hidden on this desk.
  - Features real-time Stream Anomaly Ingestion from the 1,000,000-row core banking transaction ledger.
- **Strict Duty Segregation**:
  - The API programmatically prevents an officer from adjudicating any case where they served as the Maker (`HTTP 403 Forbidden`).

### 2. Multi-Agent Reasoning Graph (LangGraph)
- **Transaction Investigator**: Analyzes transaction payload, corridor risk, payment channel (SWIFT, RTGS, IMPS, UPI), and counterparty linkages.
- **Customer Risk Analyst**: Evaluates customer profiling, historical averages, turnover velocity spikes, and watchlist hits.
- **Regulatory Researcher**: Performs hybrid dense-sparse RRF retrieval across statutory master directions (RBI, FATF, PMLA) using BM25 and PostgreSQL `pgvector`.
- **Compliance Evaluator**: Synthesizes agent deltas into a cumulative risk score [0.0, 1.0], triggering mandatory human intervention when risk exceeds the 70% institutional threshold.

### 3. Enterprise Database Connection Resilience
- **Sleep/Wake & Severed Socket Auto-Recovery**:
  - Configured with `pool_pre_ping=True` to eliminate broken pipe exceptions caused by machine sleep/wake cycles or firewall timeouts.
  - Connection recycling with `pool_recycle=300` (5 minutes) prevents stale OS socket reuse.
  - Persistent pool sizing (`pool_size=10`, `max_overflow=20`) supports concurrent burst throughput.

### 4. Robust Security & Authentication
- **RFC 6238 Time-Based Rolling One-Time Passwords (TOTP)**:
  - Two-step authentication flow with QR code pairing for Google Authenticator / Microsoft Authenticator.
- **Session Interceptor**:
  - Dual Bearer token and secure HTTP-only cookie support.
  - Centralized frontend client interceptor catches HTTP 401 session expiry and prompts re-authentication cleanly.

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.9+
- Node.js 18+ & npm
- Docker & Docker Compose

### 1. Database Infrastructure
Launch PostgreSQL 16 with `pgvector` enabled:
```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run Uvicorn development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 👥 Pre-Provisioned Personas

| Username | Role | Desk / Responsibility | TOTP Seed (Base32) | Default Password |
|---|---|---|---|---|
| `officer.sharma` | **MLRO_OFFICER** (Checker) | Executive Adjudication & Freezes | `JBSWY3DPEHPK3PXP` | `Compliance@2026` |
| `analyst.verma` | **ANALYST** (Maker) | Transaction Triage & Investigation | `HXDMVJECJJWSRB3H` | `Analyst@2026` |
| `auditor.rao` | **AUDITOR** | Immutable Security Audit Inspection | `MFRGGZDFMY2TOOJX` | `Auditor@2026` |

---

## 🧪 Testing & Verification

Run the hybrid RAG evaluator test suite:
```bash
cd backend
source venv/bin/activate
pytest tests/evaluators/test_hybrid_rag_eval.py
```

Check API Telemetry:
```bash
curl -s http://localhost:8000/health
# Response: {"status":"HEALTHY","system":"FinSight AI Enterprise Engine"}
```

---

## 📄 License
Proprietary institutional banking license. All rights reserved.
