from sqlalchemy import Column, String, Float, Boolean, JSON, DateTime, Text
from sqlalchemy.orm import declarative_base
import datetime

Base = declarative_base()

class CaseModel(Base):
    __tablename__ = "compliance_cases"
    
    case_id = Column(String(64), primary_key=True, index=True)
    transaction_id = Column(String(64), nullable=False, index=True)
    customer_id = Column(String(64), nullable=False)
    risk_score = Column(Float, default=0.0)
    status = Column(String(32), default="INITIATED")  # INITIATED, PENDING, APPROVED, REJECTED
    requires_human_review = Column(Boolean, default=False)
    findings = Column(JSON, default=list)
    citations = Column(JSON, default=list)
    audit_trace = Column(JSON, default=list)
    human_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
