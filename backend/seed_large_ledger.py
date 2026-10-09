import random
import datetime
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:password@localhost:5432/finsight")
engine = create_engine(DB_URL)

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

TOTAL_RECORDS = 10000
print(f"Generating and batch-inserting {TOTAL_RECORDS} realistic banking records into PostgreSQL...")

records = []
now = datetime.datetime.now(datetime.timezone.utc)

for i in range(1, TOTAL_RECORDS + 1):
    txn_id = f"TXN-{100000 + i}"
    cust_id = f"CUST-{random.randint(1000, 9999)}"
    
    # 70% individuals, 30% corporates
    if random.random() < 0.7:
        cust_name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        baseline = round(random.uniform(15000, 80000), 2)
    else:
        cust_name = f"{random.choice(CORP_PREFIX)} {random.choice(CORP_SUFFIX)}"
        baseline = round(random.uniform(150000, 1500000), 2)
        
    # Anomaly distribution: 5% High Risk Shell, 15% Commercial Moderate, 80% Clean Retail
    rand_roll = random.random()
    if rand_roll < 0.05:
        # High Risk AML Breach
        ben_name = random.choice(WATCHLIST_ENTITIES)
        is_new = True
        amount = round(baseline * random.uniform(12.0, 35.0), 2)
        channel = random.choice(["IMPS", "RTGS", "SWIFT"])
    elif rand_roll < 0.20:
        # Moderate Commercial
        ben_name = f"{random.choice(CORP_PREFIX)} {random.choice(CORP_SUFFIX)}"
        is_new = random.choice([True, False])
        amount = round(baseline * random.uniform(1.5, 4.0), 2)
        channel = random.choice(["NEFT", "RTGS"])
    else:
        # Clean Consumer/Retail
        ben_name = random.choice(STANDARD_ENTITIES)
        is_new = False
        amount = round(random.uniform(500, min(baseline * 0.8, 25000)), 2)
        channel = random.choice(["UPI", "IMPS"])

    records.append({
        "transaction_id": txn_id,
        "customer_id": cust_id,
        "customer_name": cust_name,
        "amount": amount,
        "currency": "INR",
        "channel": channel,
        "beneficiary_id": f"BEN-{random.randint(1000, 9999)}",
        "beneficiary_name": ben_name,
        "beneficiary_is_new": is_new,
        "narration": random.choice(NARRATIONS),
        "historical_avg": baseline,
        "created_at": now - datetime.timedelta(minutes=random.randint(1, 100000))
    })

# Batch execute via SQLAlchemy
with engine.begin() as conn:
    conn.execute(text("TRUNCATE TABLE transactions;"))
    conn.execute(
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
        records
    )

print(f"Successfully seeded {TOTAL_RECORDS} transaction records with indexed B-Tree lookups.")
