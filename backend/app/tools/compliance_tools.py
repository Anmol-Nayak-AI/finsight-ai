from typing import Dict, Any, Optional
from langchain_core.tools import tool
import datetime
import os
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+psycopg://postgres:password@localhost:5432/finsight"
)

# Synchronous engine for fast tool invocations inside graph nodes
sync_engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20)

class TransactionCreatePayload(BaseModel):
    transaction_id: str
    customer_id: str = "CUST-DYNAMIC"
    customer_name: str
    amount: float
    currency: str = "INR"
    channel: str = "IMPS"
    beneficiary_name: str
    beneficiary_is_new: bool = True
    narration: str
    historical_avg: float = 50000.0

def register_custom_transaction(data: TransactionCreatePayload) -> Dict[str, Any]:
    """Upserts user-configured transaction dynamically into PostgreSQL."""
    record = {
        "transaction_id": data.transaction_id,
        "customer_id": data.customer_id,
        "customer_name": data.customer_name,
        "amount": float(data.amount),
        "currency": data.currency,
        "channel": data.channel,
        "beneficiary_id": f"BEN-{abs(hash(data.beneficiary_name)) % 10000:04d}",
        "beneficiary_name": data.beneficiary_name,
        "beneficiary_is_new": data.beneficiary_is_new,
        "narration": data.narration,
        "historical_avg": float(data.historical_avg),
        "created_at": datetime.datetime.now(datetime.timezone.utc)
    }
    
    with sync_engine.begin() as conn:
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
            ON CONFLICT (transaction_id, created_at) DO UPDATE SET
                amount = EXCLUDED.amount,
                channel = EXCLUDED.channel,
                beneficiary_name = EXCLUDED.beneficiary_name,
                beneficiary_is_new = EXCLUDED.beneficiary_is_new,
                narration = EXCLUDED.narration,
                historical_avg = EXCLUDED.historical_avg;
            """),
            record
        )
    return record

@tool
def get_transaction_details(transaction_id: str) -> Dict[str, Any]:
    """Retrieves full core-banking details for any record in the 10,000+ indexed transaction table."""
    with sync_engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM transactions WHERE transaction_id = :txn_id LIMIT 1;"),
            {"txn_id": transaction_id}
        ).mappings().first()
        
    if not row:
        raise ValueError(f"Transaction ID {transaction_id} not found in database ledger.")
        
    return dict(row)

@tool
def check_sanctions_and_pep(customer_id: str, beneficiary_name: str) -> Dict[str, Any]:
    """Evaluates dynamic sanctions matching against high-risk keywords/jurisdictions."""
    high_risk_keywords = ["shell", "havala", "sanction", "holding", "offshore", "panama", "crypto", "bvi", "trust", "isle of man", "cayman", "swiss"]
    hit = any(k in beneficiary_name.lower() for k in high_risk_keywords)
    return {
        "customer_sanctions_match": False,
        "beneficiary_sanctions_match": hit,
        "pep_flag": False,
        "high_risk_jurisdiction": hit,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

@tool
def calculate_velocity_profile(customer_id: str, incoming_amount: float) -> Dict[str, Any]:
    """Calculates transaction velocity dynamically relative to the customer baseline."""
    with sync_engine.connect() as conn:
        row = conn.execute(
            text("SELECT historical_avg FROM transactions WHERE customer_id = :cust_id LIMIT 1;"),
            {"cust_id": customer_id}
        ).scalar()
        
    baseline = float(row) if row else 50000.00
    if baseline <= 0:
        baseline = 1000.00
        
    spike_multiplier = round(incoming_amount / baseline, 2)
    return {
        "customer_id": customer_id,
        "historical_monthly_avg": baseline,
        "spike_multiplier": spike_multiplier,
        "velocity_breach": True if spike_multiplier > 10.0 else False
    }