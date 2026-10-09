import operator
from typing import Annotated, Any, Dict, List, Optional
from typing_extensions import TypedDict
from pydantic import BaseModel, Field

class Finding(BaseModel):
    agent: str
    risk_level: str  # LOW, MEDIUM, HIGH
    score_delta: float
    details: str
    evidence: Dict[str, Any] = Field(default_factory=dict)

class ComplianceState(TypedDict):
    case_id: str
    transaction_id: str
    customer_id: str
    transaction_data: Dict[str, Any]
    customer_profile: Dict[str, Any]
    findings: Annotated[List[Finding], operator.add]
    retrieved_policies: Annotated[List[Dict[str, Any]], operator.add]
    cumulative_risk_score: float
    requires_human_review: bool
    review_status: str  # PENDING, APPROVED, REJECTED, AUTO_CLOSED
    human_notes: Optional[str]
    final_verdict: Optional[str]
    execution_trace: Annotated[List[str], operator.add]
