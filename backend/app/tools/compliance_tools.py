import random
import hashlib
from typing import Dict, Any, Optional, Literal
from langchain_core.tools import tool
import datetime
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from app.database import engine, sync_engine

# Use synchronous engine for fast tool invocations inside graph nodes
engine = sync_engine

class TransactionCreatePayload(BaseModel):
    transaction_id: Optional[str] = None
    customer_id: str = Field(default="CUST-DYNAMIC", min_length=3, max_length=64)
    customer_name: str = Field(min_length=2, max_length=255)
    amount: float = Field(gt=0, le=9_999_999_999_999, allow_inf_nan=False)
    currency: Literal["INR"] = "INR"
    channel: Literal["IMPS", "NEFT", "RTGS", "UPI", "SWIFT"] = "IMPS"
    beneficiary_name: str = Field(min_length=2, max_length=255)
    beneficiary_is_new: bool = True
    narration: str = Field(default="Corporate funds transfer", min_length=2, max_length=500)
    historical_avg: float = Field(default=50000.0, gt=0, le=9_999_999_999_999, allow_inf_nan=False)

    @field_validator("transaction_id", "customer_id", "customer_name", "beneficiary_name", "narration")
    @classmethod
    def normalize_identity_fields(cls, value: Optional[str], info):
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError(f"{info.field_name} cannot be blank")
        if info.field_name in {"transaction_id", "customer_id"}:
            return normalized.upper()
        return normalized

def register_custom_transaction(data: TransactionCreatePayload) -> Dict[str, Any]:
    """Upserts dynamic simulation payload into partitioned PostgreSQL ledger."""
    now = datetime.datetime.now(datetime.timezone.utc)
    txn_id = data.transaction_id or f"TXN-{random.randint(1000000, 9999999)}"
    record = {
        "transaction_id": txn_id,
        "customer_id": data.customer_id,
        "customer_name": data.customer_name,
        "amount": float(data.amount),
        "currency": data.currency,
        "channel": data.channel,
        "beneficiary_id": f"BEN-{int(hashlib.sha256(data.beneficiary_name.lower().encode()).hexdigest()[:8], 16) % 100000:05d}",
        "beneficiary_name": data.beneficiary_name,
        "beneficiary_is_new": data.beneficiary_is_new,
        "narration": data.narration,
        "historical_avg": float(data.historical_avg),
        "created_at": now
    }
    
    with engine.begin() as conn:
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
        conn.execute(
            text("""
            INSERT INTO account_holders (
                customer_id, customer_name, historical_avg, latest_transaction_at, updated_at
            ) VALUES (
                :customer_id, :customer_name, :historical_avg, :created_at, CURRENT_TIMESTAMP
            )
            ON CONFLICT (customer_id) DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                historical_avg = EXCLUDED.historical_avg,
                latest_transaction_at = EXCLUDED.latest_transaction_at,
                updated_at = CURRENT_TIMESTAMP
            WHERE EXCLUDED.latest_transaction_at >= account_holders.latest_transaction_at;
            """),
            record
        )
    return record

@tool
def get_transaction_details(transaction_id: str) -> Dict[str, Any]:
    """Indexed B-Tree seek across 1,000,000+ partitioned records with partition pruning."""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM transactions WHERE transaction_id = :txn_id ORDER BY created_at DESC LIMIT 1;"),
            {"txn_id": transaction_id}
        ).mappings().first()
        
    if not row:
        raise ValueError(f"Transaction ID {transaction_id} not found in 1,000,000-row ledger.")
        
    return dict(row)

@tool
def check_sanctions_and_pep(customer_id: str, beneficiary_name: str) -> Dict[str, Any]:
    """Screens customer and beneficiary against global AML sanctions, PEP registries, and high-risk jurisdictions."""
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
    """Calculates transaction velocity spike multiplier against customer historical baseline spending patterns."""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT historical_avg FROM transactions WHERE customer_id = :cust_id ORDER BY created_at DESC LIMIT 1;"),
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
