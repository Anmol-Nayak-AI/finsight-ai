import io
import csv
import random
import datetime
import os
import psycopg
from dotenv import load_dotenv

# Search for .env in current and parent directory
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

RAW_DB_URL = os.getenv("DATABASE_CHECKPOINT_URL", "postgresql://postgres:password@localhost:5432/finsight")

FIRST_NAMES = ["Aarav", "Priya", "Vikram", "Ananya", "Karan", "Sunita", "Harish", "Pooja", "Rahul", "Manan", "Divya", "Siddharth", "Neha", "Rohan", "Deepak"]
LAST_NAMES = ["Malhotra", "Sharma", "Singhania", "Iyer", "Singhal", "Reddy", "Mehta", "Kulkarni", "Dravid", "Joshi", "Agarwal", "Roy", "Kapoor", "Saxena", "Verma"]
CORP_PREFIX = ["Nexa Cloud", "TechFab", "Apex", "Kiran Global", "Zenon", "BluePeak", "Delta", "Sri Krishna", "BioMatrix", "Nexus Media", "Prime Logistics"]
CORP_SUFFIX = ["LLP", "Solutions Pvt Ltd", "Holdings Ltd", "Technologies", "Enterprises", "Hardware", "BioTech", "Logistics Hub"]

WATCHLIST_ENTITIES = [
    "Panama Horizon Shell Corp", "KoinX BVI Crypto Exchange", "Al-Miraj Holdings Dubai", 
    "Cayman Matrix Advisory Ltd", "Belize Meridian Trading", "Seychelles Prime Holdings", 
    "Swiss Alps Capital Partners", "Isle of Man Maritime Asset", "Offshore Zenith Trust"
]
STANDARD_ENTITIES = [
    "Zepto Retail Store", "Blinkit Commerce", "Swiggy Food Delivery", "Apollo Pharmacy", 
    "Vijay Sales Electronics", "Myntra Fashion Retail", "Uber Rides India", "CultFit Healthcare", 
    "Castrol Lubricants Depot", "Microsoft India R&D", "Packaging Solutions Corp"
]
CHANNELS = ["IMPS", "NEFT", "RTGS", "UPI", "SWIFT"]
NARRATIONS = [
    "Consulting Retainer Settlement", "Overseas Equipment Commission", "Quick Grocery Order", 
    "Server Infrastructure Retainer", "Virtual digital asset settlement", "Annual performance bonus", 
    "Consulting charges tranche 1", "Property token advance", "Medical Prescription Supplies", 
    "Turbine lease payment monthly", "Advisory Retainer Fee", "Home appliance EMI settlement"
]

TOTAL_TARGET = 1_000_000
BATCH_SIZE = 50_000

def customer_profile(customer_id: str):
    """Return one stable identity/profile for every ledger customer ID."""
    profile_rng = random.Random(f"finsight-customer:{customer_id}")
    is_corp = profile_rng.random() < 0.25
    if is_corp:
        name = f"{profile_rng.choice(CORP_PREFIX)} {profile_rng.choice(CORP_SUFFIX)}"
        baseline = round(profile_rng.uniform(150000, 1500000), 2)
    else:
        name = f"{profile_rng.choice(FIRST_NAMES)} {profile_rng.choice(LAST_NAMES)}"
        baseline = round(profile_rng.uniform(15000, 85000), 2)
    return name, baseline

print(f"===========================================================")
print(f"FINSIGHT SCALE BENCHMARK: Ingesting {TOTAL_TARGET:,} Rows into Partitioned Ledger")
print(f"===========================================================")

start_date = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
end_date = datetime.datetime(2026, 10, 10, tzinfo=datetime.timezone.utc)
delta_seconds = int((end_date - start_date).total_seconds())

conn = psycopg.connect(RAW_DB_URL, autocommit=True)

inserted_so_far = 0
start_time = datetime.datetime.now()

with conn.cursor() as cur:
    while inserted_so_far < TOTAL_TARGET:
        buf = io.StringIO()
        writer = csv.writer(buf, delimiter='\t')
        
        batch_limit = min(BATCH_SIZE, TOTAL_TARGET - inserted_so_far)
        for i in range(1, batch_limit + 1):
            txn_seq = inserted_so_far + i
            txn_id = f"TXN-{1000000 + txn_seq}"
            cust_id = f"CUST-{random.randint(10000, 99999)}"
            cust_name, baseline = customer_profile(cust_id)
            
            roll = random.random()
            if roll < 0.05:  # 5% AML High-Risk Anomaly
                ben_name = random.choice(WATCHLIST_ENTITIES)
                is_new = True
                amount = round(baseline * random.uniform(12.0, 30.0), 2)
                channel = random.choice(["IMPS", "RTGS", "SWIFT"])
            elif roll < 0.25:  # 20% Commercial Moderate
                ben_name = f"{random.choice(CORP_PREFIX)} {random.choice(CORP_SUFFIX)}"
                is_new = random.choice([True, False])
                amount = round(baseline * random.uniform(1.6, 4.0), 2)
                channel = random.choice(["NEFT", "RTGS"])
            else:  # 75% Consumer Clean
                ben_name = random.choice(STANDARD_ENTITIES)
                is_new = False
                amount = round(random.uniform(500, min(baseline * 0.75, 25000)), 2)
                channel = random.choice(["UPI", "IMPS"])

            created_at = start_date + datetime.timedelta(seconds=random.randint(0, delta_seconds))
            
            writer.writerow([
                txn_id, cust_id, cust_name, amount, "INR", channel,
                f"BEN-{random.randint(10000, 99999)}", ben_name, is_new,
                random.choice(NARRATIONS), baseline, created_at.isoformat()
            ])
            
        buf.seek(0)
        with cur.copy("COPY transactions (transaction_id, customer_id, customer_name, amount, currency, channel, beneficiary_id, beneficiary_name, beneficiary_is_new, narration, historical_avg, created_at) FROM STDIN") as copy:
            copy.write(buf.read())
            
        inserted_so_far += batch_limit
        print(f"Progress: {inserted_so_far:,} / {TOTAL_TARGET:,} rows streamed...")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS account_holders (
            customer_id VARCHAR(64) PRIMARY KEY,
            customer_name VARCHAR(255) NOT NULL,
            historical_avg NUMERIC(15, 2) NOT NULL CHECK (historical_avg > 0),
            latest_transaction_at TIMESTAMP WITH TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
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
            updated_at = CURRENT_TIMESTAMP
        WHERE EXCLUDED.latest_transaction_at >= account_holders.latest_transaction_at;
    """)

total_duration = (datetime.datetime.now() - start_time).total_seconds()
print(f"SUCCESS: 1,000,000 Records Ingested in {total_duration:.2f}s ({TOTAL_TARGET/total_duration:,.0f} rows/sec).")
conn.close()
