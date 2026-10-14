import datetime
import random
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine


FIRST_NAMES = ["Aarav", "Priya", "Vikram", "Ananya", "Karan", "Sunita", "Harish", "Pooja", "Rahul", "Manan", "Divya", "Siddharth", "Neha", "Rohan", "Deepak"]
LAST_NAMES = ["Malhotra", "Sharma", "Singhania", "Iyer", "Singhal", "Reddy", "Mehta", "Kulkarni", "Dravid", "Joshi", "Agarwal", "Roy", "Kapoor", "Saxena", "Verma"]
CORP_PREFIX = ["Nexa Cloud", "TechFab", "Apex", "Kiran Global", "Zenon", "BluePeak", "Delta", "Sri Krishna", "BioMatrix", "Nexus Media", "Prime Logistics"]
CORP_SUFFIX = ["LLP", "Solutions Pvt Ltd", "Holdings Ltd", "Technologies", "Enterprises", "Hardware", "BioTech", "Logistics Hub"]

WATCHLIST_ENTITIES = [
    "Panama Horizon Shell Corp", "KoinX BVI Crypto Exchange", "Al-Miraj Holdings Dubai",
    "Cayman Matrix Advisory Ltd", "Belize Meridian Trading", "Seychelles Prime Holdings",
    "Swiss Alps Capital Partners", "Isle of Man Maritime Asset", "Offshore Zenith Trust",
]
STANDARD_ENTITIES = [
    "Zepto Retail Store", "Blinkit Commerce", "Swiggy Food Delivery", "Apollo Pharmacy",
    "Vijay Sales Electronics", "Myntra Fashion Retail", "Uber Rides India", "CultFit Healthcare",
    "Castrol Lubricants Depot", "Microsoft India R&D", "Packaging Solutions Corp",
]
NARRATIONS = [
    "Consulting Retainer Settlement", "Overseas Equipment Commission", "Quick Grocery Order",
    "Server Infrastructure Retainer", "Virtual digital asset settlement", "Annual performance bonus",
    "Consulting charges tranche 1", "Property token advance", "Medical Prescription Supplies",
    "Turbine lease payment monthly", "Advisory Retainer Fee", "Home appliance EMI settlement",
]


def customer_profile(customer_id: str) -> tuple[str, float]:
    """Return one deterministic identity and baseline for a ledger customer."""
    profile_rng = random.Random(f"finsight-customer:{customer_id}")
    if profile_rng.random() >= 0.7:
        name = f"{profile_rng.choice(CORP_PREFIX)} {profile_rng.choice(CORP_SUFFIX)}"
        baseline = round(profile_rng.uniform(150000, 1500000), 2)
    else:
        name = f"{profile_rng.choice(FIRST_NAMES)} {profile_rng.choice(LAST_NAMES)}"
        baseline = round(profile_rng.uniform(15000, 80000), 2)
    return name, baseline


def build_records(total_records: int) -> list[dict[str, Any]]:
    """Build a reproducible synthetic ledger without storing sensitive data."""
    rng = random.Random(20261015)
    now = datetime.datetime.now(datetime.timezone.utc)
    records: list[dict[str, Any]] = []

    for index in range(1, total_records + 1):
        customer_id = f"CUST-{rng.randint(1000, 9999)}"
        customer_name, baseline = customer_profile(customer_id)
        risk_roll = rng.random()

        if risk_roll < 0.05:
            beneficiary_name = rng.choice(WATCHLIST_ENTITIES)
            beneficiary_is_new = True
            amount = round(baseline * rng.uniform(12.0, 35.0), 2)
            channel = rng.choice(["IMPS", "RTGS", "SWIFT"])
        elif risk_roll < 0.20:
            beneficiary_name = f"{rng.choice(CORP_PREFIX)} {rng.choice(CORP_SUFFIX)}"
            beneficiary_is_new = rng.choice([True, False])
            amount = round(baseline * rng.uniform(1.5, 4.0), 2)
            channel = rng.choice(["NEFT", "RTGS"])
        else:
            beneficiary_name = rng.choice(STANDARD_ENTITIES)
            beneficiary_is_new = False
            amount = round(rng.uniform(500, min(baseline * 0.8, 25000)), 2)
            channel = rng.choice(["UPI", "IMPS"])

        records.append({
            "transaction_id": f"TXN-{100000 + index}",
            "customer_id": customer_id,
            "customer_name": customer_name,
            "amount": amount,
            "currency": "INR",
            "channel": channel,
            "beneficiary_id": f"BEN-{rng.randint(1000, 9999)}",
            "beneficiary_name": beneficiary_name,
            "beneficiary_is_new": beneficiary_is_new,
            "narration": rng.choice(NARRATIONS),
            "historical_avg": baseline,
            "created_at": now - datetime.timedelta(minutes=rng.randint(1, 100000)),
        })

    return records


def seed_large_ledger_if_empty(engine: Engine, total_records: int = 10_000) -> bool:
    """Atomically seed the preview ledger once; never truncate existing work."""
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(hashtext('finsight_demo_ledger_v1'));"))
        transaction_count = connection.execute(text("SELECT COUNT(*) FROM transactions;")).scalar_one()
        if transaction_count:
            print(f"[Demo Seed] Existing ledger contains {transaction_count} transactions; seed skipped.")
            return False

        records = build_records(total_records)
        connection.execute(
            text("""
                INSERT INTO transactions (
                    transaction_id, customer_id, customer_name, amount, currency,
                    channel, beneficiary_id, beneficiary_name, beneficiary_is_new,
                    narration, historical_avg, created_at
                ) VALUES (
                    :transaction_id, :customer_id, :customer_name, :amount, :currency,
                    :channel, :beneficiary_id, :beneficiary_name, :beneficiary_is_new,
                    :narration, :historical_avg, :created_at
                )
            """),
            records,
        )
        connection.execute(text("""
            INSERT INTO account_holders (
                customer_id, customer_name, historical_avg, latest_transaction_at
            )
            SELECT DISTINCT ON (customer_id)
                customer_id, customer_name, historical_avg, created_at
            FROM transactions
            ORDER BY customer_id, created_at DESC
            ON CONFLICT (customer_id) DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                historical_avg = EXCLUDED.historical_avg,
                latest_transaction_at = EXCLUDED.latest_transaction_at,
                updated_at = CURRENT_TIMESTAMP;
        """))

    print(f"[Demo Seed] Successfully seeded {total_records} synthetic transactions.")
    return True
