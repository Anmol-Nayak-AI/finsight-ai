import concurrent.futures
import datetime
import uuid

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import engine
from app.main import app


@pytest.fixture(autouse=True)
def cleanup_test_account_holders():
    yield
    with engine.begin() as connection:
        connection.execute(text("""
            DELETE FROM account_holders
            WHERE customer_id LIKE 'CUST-VALIDATION-%'
               OR customer_id LIKE 'CUST-FALLBACK-%'
               OR customer_id LIKE 'CUST-PYTEST-%'
               OR customer_id LIKE 'CUST-REGULATOR-%'
               OR customer_id LIKE 'CUST-IDEMPOTENCY-%'
               OR customer_id LIKE 'CUST-APPROVE-%'
               OR customer_id LIKE 'CUST-LOOKUP-%';
        """))


def _login(client: TestClient, username: str, password: str, seed: str) -> str:
    challenge = client.post(
        "/api/v1/auth/login-step1",
        json={"username": username, "password": password},
    )
    assert challenge.status_code == 200
    authenticated = client.post(
        "/api/v1/auth/verify-mfa",
        json={
            "mfa_challenge_token": challenge.json()["mfa_challenge_token"],
            "totp_code": pyotp.TOTP(seed).now(),
        },
    )
    assert authenticated.status_code == 200
    return authenticated.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_mfa_challenges_are_stage_bound_and_single_use():
    with TestClient(app) as client:
        challenge = client.post(
            "/api/v1/auth/login-step1",
            json={"username": "analyst.verma", "password": "Analyst@2026"},
        )
        assert challenge.status_code == 200
        challenge_token = challenge.json()["mfa_challenge_token"]
        code = pyotp.TOTP("HXDMVJECJJWSRB3H").now()

        first = client.post(
            "/api/v1/auth/verify-mfa",
            json={"mfa_challenge_token": challenge_token, "totp_code": code},
        )
        assert first.status_code == 200

        replay = client.post(
            "/api/v1/auth/verify-mfa",
            json={"mfa_challenge_token": challenge_token, "totp_code": code},
        )
        assert replay.status_code == 401
        assert "already used" in replay.json()["detail"]

        wrong_stage = client.post(
            "/api/v1/auth/verify-mfa",
            json={
                "mfa_challenge_token": first.json()["access_token"],
                "totp_code": code,
            },
        )
        assert wrong_stage.status_code == 401


def test_transaction_payload_rejects_invalid_financial_values():
    with TestClient(app) as client:
        token = _login(client, "analyst.verma", "Analyst@2026", "HXDMVJECJJWSRB3H")
        valid_payload = {
            "transaction_id": f"TXN-VALIDATION-{uuid.uuid4().hex[:8].upper()}",
            "customer_id": f"CUST-VALIDATION-{uuid.uuid4().hex[:8].upper()}",
            "customer_name": "Validation Test Customer",
            "amount": 900000,
            "currency": "INR",
            "channel": "RTGS",
            "beneficiary_name": "Validation Test Beneficiary",
            "beneficiary_is_new": True,
            "narration": "Financial payload boundary validation",
            "historical_avg": 25000,
        }

        invalid_variants = [
            {"amount": 0},
            {"amount": -1},
            {"historical_avg": 0},
            {"channel": "UNSUPPORTED_WIRE"},
            {"currency": "USD"},
            {"customer_id": "   "},
            {"beneficiary_name": "   "},
        ]
        for variant in invalid_variants:
            response = client.post(
                "/api/v1/investigations/simulate",
                headers=_headers(token),
                json={**valid_payload, **variant},
            )
            assert response.status_code == 422, variant


def test_role_boundaries_and_logout_revocation():
    with TestClient(app) as client:
        assert client.get("/api/v1/investigations/queue").status_code == 401
        analyst_token = _login(client, "analyst.verma", "Analyst@2026", "HXDMVJECJJWSRB3H")
        checker_token = _login(client, "officer.sharma", "Compliance@2026", "JBSWY3DPEHPK3PXP")
        regulator_token = _login(client, "regulator.iyer", "Regulator@2026", "JBSWY3DPEHPK3PXP")

        assert client.get("/api/v1/investigations/queue", headers=_headers(analyst_token)).status_code == 403
        assert client.get("/api/v1/regulatory/queue", headers=_headers(analyst_token)).status_code == 403
        assert client.get("/api/v1/investigations/queue", headers=_headers(regulator_token)).status_code == 403
        assert client.get("/api/v1/regulatory/queue", headers=_headers(checker_token)).status_code == 403

        forbidden_simulation = client.post(
            "/api/v1/investigations/simulate",
            headers=_headers(checker_token),
            json={
                "transaction_id": "TXN-ROLE-BOUNDARY",
                "customer_id": "CUST-ROLE-BOUNDARY",
                "customer_name": "Role Boundary",
                "amount": 900000,
                "currency": "INR",
                "channel": "RTGS",
                "beneficiary_name": "Role Boundary Beneficiary",
                "beneficiary_is_new": True,
                "narration": "Role isolation test",
                "historical_avg": 25000,
            },
        )
        assert forbidden_simulation.status_code == 403

        assert client.get("/api/v1/auth/me", headers=_headers(analyst_token)).status_code == 200
        assert client.post("/api/v1/auth/logout", headers=_headers(analyst_token)).status_code == 200
        assert client.get("/api/v1/auth/me", headers=_headers(analyst_token)).status_code == 401


def test_parallel_sessions_have_independent_revocation_ids():
    with TestClient(app) as client:
        first_token = _login(client, "analyst.verma", "Analyst@2026", "HXDMVJECJJWSRB3H")
        second_token = _login(client, "analyst.verma", "Analyst@2026", "HXDMVJECJJWSRB3H")
        assert first_token != second_token
        assert client.post("/api/v1/auth/logout", headers=_headers(first_token)).status_code == 200
        assert client.get("/api/v1/auth/me", headers=_headers(first_token)).status_code == 401
        assert client.get("/api/v1/auth/me", headers=_headers(second_token)).status_code == 200


def test_account_holder_lookup_searches_canonical_ledger_and_samples_without_repeating():
    suffix = uuid.uuid4().hex[:8].upper()
    first_id = f"CUST-LOOKUP-{suffix}-A"
    second_id = f"CUST-LOOKUP-{suffix}-B"
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    with engine.begin() as connection:
        connection.execute(text("""
            INSERT INTO account_holders (
                customer_id, customer_name, historical_avg, latest_transaction_at
            ) VALUES
                (:first_id, :first_name, 42000, :now),
                (:second_id, :second_name, 73500, :now);
        """), {
            "first_id": first_id,
            "first_name": f"Ledger Identity {suffix} Alpha",
            "second_id": second_id,
            "second_name": f"Ledger Identity {suffix} Beta",
            "now": now,
        })

    with TestClient(app) as client:
        analyst_token = _login(client, "analyst.verma", "Analyst@2026", "HXDMVJECJJWSRB3H")
        checker_token = _login(client, "officer.sharma", "Compliance@2026", "JBSWY3DPEHPK3PXP")

        forbidden = client.get(
            "/api/v1/investigations/account-holders",
            headers=_headers(checker_token),
        )
        assert forbidden.status_code == 403

        first_page = client.get(
            "/api/v1/investigations/account-holders",
            headers=_headers(analyst_token),
            params={"search": suffix, "limit": 1},
        )
        assert first_page.status_code == 200
        assert first_page.json()["has_more"] is True
        assert len(first_page.json()["items"]) == 1

        sampled = client.get(
            "/api/v1/investigations/account-holders",
            headers=_headers(analyst_token),
            params={
                "search": suffix,
                "sample": "true",
                "limit": 1,
                "exclude_customer_id": first_id,
            },
        )
        assert sampled.status_code == 200
        assert sampled.json()["items"] == [{
            "customer_id": second_id,
            "customer_name": f"Ledger Identity {suffix} Beta",
            "historical_avg": 73500.0,
            "latest_transaction_at": now.isoformat(),
        }]


def test_deterministic_fallback_always_produces_explainable_evidence():
    suffix = uuid.uuid4().hex[:8].upper()
    transaction_id = f"TXN-FALLBACK-{suffix}"
    case_id = None

    with TestClient(app) as client:
        token = _login(client, "analyst.verma", "Analyst@2026", "HXDMVJECJJWSRB3H")
        original_workflow = client.app.state.workflow
        client.app.state.workflow = None
        try:
            response = client.post(
                "/api/v1/investigations/simulate",
                headers=_headers(token),
                json={
                    "transaction_id": transaction_id,
                    "customer_id": f"CUST-FALLBACK-{suffix}",
                    "customer_name": "Explainability Fallback Test",
                    "amount": 25000,
                    "currency": "INR",
                    "channel": "UPI",
                    "beneficiary_name": "Established Local Supplier",
                    "beneficiary_is_new": False,
                    "narration": "Routine invoice settlement",
                    "historical_avg": 50000,
                },
            )
            assert response.status_code == 200
            case = response.json()
            case_id = case["case_id"]
            assert case["status"] == "FINALIZED"
            assert case["final_verdict"] == "AUTO_APPROVED"
            assert len(case["findings"]) >= 2
            assert len(case["retrieved_policies"]) >= 1
            assert any(item["agent"] == "TransactionInvestigator" for item in case["findings"])
            assert any(item["agent"] == "RegulatoryResearcher" for item in case["findings"])
        finally:
            client.app.state.workflow = original_workflow
            with engine.begin() as connection:
                if case_id:
                    connection.execute(text("DELETE FROM compliance_cases WHERE case_id = :case_id"), {"case_id": case_id})
                connection.execute(text("DELETE FROM transactions WHERE transaction_id = :transaction_id"), {"transaction_id": transaction_id})


def test_concurrent_approval_transitions_are_atomic():
    suffix = uuid.uuid4().hex[:8].upper()
    transaction_id = f"TXN-PYTEST-{suffix}"
    case_id = None

    with TestClient(app) as client:
        analyst_token = _login(
            client,
            "analyst.verma",
            "Analyst@2026",
            "HXDMVJECJJWSRB3H",
        )
        checker_token = _login(
            client,
            "officer.sharma",
            "Compliance@2026",
            "JBSWY3DPEHPK3PXP",
        )

        try:
            created = client.post(
                "/api/v1/investigations/simulate",
                headers=_headers(analyst_token),
                json={
                    "transaction_id": transaction_id,
                    "customer_id": f"CUST-PYTEST-{suffix}",
                    "customer_name": "Approval Workflow Test",
                    "amount": 950000,
                    "currency": "INR",
                    "channel": "RTGS",
                    "beneficiary_name": "Offshore Shell Test Holdings",
                    "beneficiary_is_new": True,
                    "narration": "Atomic approval workflow regression test",
                    "historical_avg": 25000,
                },
            )
            assert created.status_code == 200
            case_id = created.json()["case_id"]
            assert created.json()["status"] == "PENDING_MAKER"

            maker_payload = {
                "recommendation": "RECOMMEND_ESCALATE",
                "findings_summary": "High-risk corridor and velocity anomaly verified.",
            }

            def submit_maker():
                with TestClient(app) as worker_client:
                    return worker_client.post(
                        f"/api/v1/investigations/{case_id}/maker-recommend",
                        headers=_headers(analyst_token),
                        json=maker_payload,
                    )

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                maker_responses = list(pool.map(lambda _: submit_maker(), range(2)))
            assert sorted(response.status_code for response in maker_responses) == [200, 409]

            checker_payload = {
                "final_decision": "CONFIRMED_ESCALATED",
                "statutory_memo": "Risk exceeds bank authority; FIU review is mandatory.",
            }

            def submit_checker():
                with TestClient(app) as worker_client:
                    return worker_client.post(
                        f"/api/v1/investigations/{case_id}/checker-execute",
                        headers=_headers(checker_token),
                        json=checker_payload,
                    )

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                checker_responses = list(pool.map(lambda _: submit_checker(), range(2)))
            assert sorted(response.status_code for response in checker_responses) == [200, 409]

            sealed = next(response.json()["case"] for response in checker_responses if response.status_code == 200)
            assert sealed["status"] == "ESCALATED_FIU"
            assert sealed["checker_status"]["external_review_status"] == "PENDING_REGULATOR"
            assert sealed["decision_version"] == 2
        finally:
            with engine.begin() as connection:
                if case_id:
                    connection.execute(
                        text("DELETE FROM compliance_cases WHERE case_id = :case_id"),
                        {"case_id": case_id},
                    )
                connection.execute(
                    text("DELETE FROM transactions WHERE transaction_id = :transaction_id"),
                    {"transaction_id": transaction_id},
                )


def test_escalated_case_requires_regulator_and_disposition_is_atomic():
    suffix = uuid.uuid4().hex[:8].upper()
    transaction_id = f"TXN-REGULATOR-{suffix}"
    case_id = None

    with TestClient(app) as client:
        analyst_token = _login(client, "analyst.verma", "Analyst@2026", "HXDMVJECJJWSRB3H")
        checker_token = _login(client, "officer.sharma", "Compliance@2026", "JBSWY3DPEHPK3PXP")
        regulator_token = _login(client, "regulator.iyer", "Regulator@2026", "JBSWY3DPEHPK3PXP")

        try:
            created = client.post(
                "/api/v1/investigations/simulate",
                headers=_headers(analyst_token),
                json={
                    "transaction_id": transaction_id,
                    "customer_id": f"CUST-REGULATOR-{suffix}",
                    "customer_name": "Regulator Lifecycle Test",
                    "amount": 1250000,
                    "currency": "INR",
                    "channel": "SWIFT",
                    "beneficiary_name": "External Review Test Holdings",
                    "beneficiary_is_new": True,
                    "narration": "Regulator disposition workflow regression test",
                    "historical_avg": 25000,
                },
            )
            assert created.status_code == 200
            case_id = created.json()["case_id"]

            maker = client.post(
                f"/api/v1/investigations/{case_id}/maker-recommend",
                headers=_headers(analyst_token),
                json={
                    "recommendation": "RECOMMEND_ESCALATE",
                    "findings_summary": "Verified offshore risk requires external statutory review.",
                },
            )
            assert maker.status_code == 200

            escalated = client.post(
                f"/api/v1/investigations/{case_id}/checker-execute",
                headers=_headers(checker_token),
                json={
                    "final_decision": "ESCALATED",
                    "statutory_memo": "Independent review confirms FIU jurisdiction is required.",
                },
            )
            assert escalated.status_code == 200
            assert escalated.json()["case"]["status"] == "ESCALATED_FIU"

            duplicate_during_external_review = client.post(
                "/api/v1/investigations/simulate",
                headers=_headers(analyst_token),
                json={
                    "transaction_id": f"TXN-REGULATOR-SECOND-{suffix}",
                    "customer_id": f"CUST-REGULATOR-{suffix}",
                    "customer_name": "Regulator Lifecycle Test",
                    "amount": 1500000,
                    "currency": "INR",
                    "channel": "RTGS",
                    "beneficiary_name": "Second External Review Beneficiary",
                    "beneficiary_is_new": True,
                    "narration": "Must be blocked while FIU review remains active",
                    "historical_avg": 25000,
                },
            )
            assert duplicate_during_external_review.status_code == 409
            assert "under FIU review" in duplicate_during_external_review.json()["detail"]

            forbidden = client.post(
                f"/api/v1/regulatory/cases/{case_id}/disposition",
                headers=_headers(checker_token),
                json={
                    "disposition": "ENFORCEMENT_REFERRED",
                    "regulator_reference": f"FIU-ACK-{suffix}",
                    "rationale": "MLRO must not be able to self-resolve an escalation.",
                },
            )
            assert forbidden.status_code == 403

            queue = client.get("/api/v1/regulatory/queue", headers=_headers(regulator_token))
            assert queue.status_code == 200
            assert any(item["case_id"] == case_id for item in queue.json())

            disposition_payload = {
                "disposition": "ENFORCEMENT_REFERRED",
                "regulator_reference": f"FIU-ACK-{suffix}",
                "rationale": "External review confirms grounds for formal enforcement referral.",
            }

            def submit_disposition():
                with TestClient(app) as worker_client:
                    return worker_client.post(
                        f"/api/v1/regulatory/cases/{case_id}/disposition",
                        headers=_headers(regulator_token),
                        json=disposition_payload,
                    )

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(pool.map(lambda _: submit_disposition(), range(2)))
            assert sorted(response.status_code for response in responses) == [200, 409]

            decided = next(response.json()["case"] for response in responses if response.status_code == 200)
            assert decided["status"] == "REGULATOR_ENFORCEMENT"
            assert decided["final_verdict"] == "FIU_ENFORCEMENT_REFERRED"
            assert decided["regulator_status"]["reference"] == f"FIU-ACK-{suffix}"
            assert decided["decision_version"] == 3
        finally:
            with engine.begin() as connection:
                if case_id:
                    connection.execute(
                        text("DELETE FROM compliance_cases WHERE case_id = :case_id"),
                        {"case_id": case_id},
                    )
                connection.execute(
                    text("DELETE FROM transactions WHERE transaction_id = :transaction_id"),
                    {"transaction_id": transaction_id},
                )


def test_decision_memos_are_required():
    with TestClient(app) as client:
        token = _login(
            client,
            "officer.sharma",
            "Compliance@2026",
            "JBSWY3DPEHPK3PXP",
        )
        response = client.post(
            "/api/v1/investigations/CASE-NOT-REACHED/checker-execute",
            headers=_headers(token),
            json={"final_decision": "CONFIRMED_REJECTED", "statutory_memo": "too short"},
        )
        assert response.status_code == 422

        whitespace_response = client.post(
            "/api/v1/investigations/CASE-NOT-REACHED/checker-execute",
            headers=_headers(token),
            json={"final_decision": "CONFIRMED_REJECTED", "statutory_memo": "                "},
        )
        assert whitespace_response.status_code == 422


def test_pending_case_is_idempotently_restored_after_retry_and_login():
    suffix = uuid.uuid4().hex[:8].upper()
    transaction_id = f"TXN-IDEMPOTENCY-{suffix}"
    case_id = None

    with TestClient(app) as client:
        analyst_token = _login(
            client,
            "analyst.verma",
            "Analyst@2026",
            "HXDMVJECJJWSRB3H",
        )
        payload = {
            "transaction_id": transaction_id,
            "customer_id": f"CUST-IDEMPOTENCY-{suffix}",
            "customer_name": "Queue Idempotency Test",
            "amount": 975000,
            "currency": "INR",
            "channel": "RTGS",
            "beneficiary_name": "Idempotency Offshore Holdings",
            "beneficiary_is_new": True,
            "narration": "Duplicate case prevention regression test",
            "historical_avg": 25000,
        }

        try:
            first = client.post(
                "/api/v1/investigations/simulate",
                headers=_headers(analyst_token),
                json=payload,
            )
            assert first.status_code == 200
            case_id = first.json()["case_id"]

            second = client.post(
                "/api/v1/investigations/simulate",
                headers=_headers(analyst_token),
                json=payload,
            )
            assert second.status_code == 200
            assert second.json()["case_id"] == case_id
            assert second.json()["resumed_existing_case"] is True

            same_account_new_transaction = {
                **payload,
                "transaction_id": f"TXN-SECOND-{suffix}",
                "beneficiary_name": "Second Offshore Beneficiary",
            }
            account_duplicate = client.post(
                "/api/v1/investigations/simulate",
                headers=_headers(analyst_token),
                json=same_account_new_transaction,
            )
            assert account_duplicate.status_code == 200
            assert account_duplicate.json()["case_id"] == case_id
            assert account_duplicate.json()["resumed_existing_case"] is True

            with engine.connect() as connection:
                active_count = connection.execute(
                    text("""
                        SELECT COUNT(*) FROM compliance_cases
                        WHERE transaction_id = :transaction_id
                          AND status <> 'DUPLICATE_SUPERSEDED'
                    """),
                    {"transaction_id": transaction_id},
                ).scalar_one()
            assert active_count == 1

            logout = client.post(
                "/api/v1/auth/logout",
                headers=_headers(analyst_token),
            )
            assert logout.status_code == 200
            restored_token = _login(
                client,
                "analyst.verma",
                "Analyst@2026",
                "HXDMVJECJJWSRB3H",
            )
            restored = client.get(
                "/api/v1/investigations/my-open",
                headers=_headers(restored_token),
            )
            assert restored.status_code == 200
            assert restored.json()["case_id"] == case_id

            transmitted = client.post(
                f"/api/v1/investigations/{case_id}/maker-recommend",
                headers=_headers(restored_token),
                json={
                    "recommendation": "RECOMMEND_REJECT",
                    "findings_summary": "Analyst confirms the high-risk velocity and beneficiary evidence.",
                },
            )
            assert transmitted.status_code == 200
            assert transmitted.json()["case"]["status"] == "PENDING_CHECKER"

            assert client.post("/api/v1/auth/logout", headers=_headers(restored_token)).status_code == 200
            next_shift_token = _login(
                client,
                "analyst.verma",
                "Analyst@2026",
                "HXDMVJECJJWSRB3H",
            )
            no_locked_checker_case = client.get(
                "/api/v1/investigations/my-open",
                headers=_headers(next_shift_token),
            )
            assert no_locked_checker_case.status_code == 200
            assert no_locked_checker_case.json() is None
        finally:
            with engine.begin() as connection:
                connection.execute(
                    text("DELETE FROM compliance_cases WHERE transaction_id = :transaction_id"),
                    {"transaction_id": transaction_id},
                )
                connection.execute(
                    text("DELETE FROM transactions WHERE transaction_id = :transaction_id"),
                    {"transaction_id": transaction_id},
                )


def test_checker_default_action_can_confirm_maker_approval():
    suffix = uuid.uuid4().hex[:8].upper()
    transaction_id = f"TXN-APPROVE-{suffix}"
    customer_id = f"CUST-APPROVE-{suffix}"
    case_id = None

    with TestClient(app) as client:
        analyst_token = _login(
            client,
            "analyst.verma",
            "Analyst@2026",
            "HXDMVJECJJWSRB3H",
        )
        checker_token = _login(
            client,
            "officer.sharma",
            "Compliance@2026",
            "JBSWY3DPEHPK3PXP",
        )

        try:
            created = client.post(
                "/api/v1/investigations/simulate",
                headers=_headers(analyst_token),
                json={
                    "transaction_id": transaction_id,
                    "customer_id": customer_id,
                    "customer_name": "Maker Approval Alignment Test",
                    "amount": 950000,
                    "currency": "INR",
                    "channel": "RTGS",
                    "beneficiary_name": "Reviewable Offshore Test Entity",
                    "beneficiary_is_new": True,
                    "narration": "Maker checker alignment regression test",
                    "historical_avg": 25000,
                },
            )
            assert created.status_code == 200
            case_id = created.json()["case_id"]

            maker = client.post(
                f"/api/v1/investigations/{case_id}/maker-recommend",
                headers=_headers(analyst_token),
                json={
                    "recommendation": "RECOMMEND_APPROVE",
                    "findings_summary": "Maker reviewed the evidence and recommends approval.",
                },
            )
            assert maker.status_code == 200

            checker = client.post(
                f"/api/v1/investigations/{case_id}/checker-execute",
                headers=_headers(checker_token),
                json={
                    "final_decision": "APPROVED",
                    "statutory_memo": "Independent MLRO review confirms the Maker approval recommendation.",
                },
            )
            assert checker.status_code == 200
            decided_case = checker.json()["case"]
            assert decided_case["final_verdict"] == "CONFIRMED_APPROVED"
            assert decided_case["checker_status"]["decision_alignment"] == "CONFIRMED_MAKER"
            assert decided_case["checker_status"]["submitted_action"] == "APPROVED"
        finally:
            with engine.begin() as connection:
                if case_id:
                    connection.execute(
                        text("DELETE FROM compliance_cases WHERE case_id = :case_id"),
                        {"case_id": case_id},
                    )
                connection.execute(
                    text("DELETE FROM transactions WHERE transaction_id = :transaction_id"),
                    {"transaction_id": transaction_id},
                )
