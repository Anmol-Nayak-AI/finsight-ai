from typing import Dict, Any
from langgraph.types import interrupt
from app.graph.state import ComplianceState

def compliance_evaluator(state: ComplianceState) -> Dict[str, Any]:
    """Synthesizes risk scores across findings and routes to HITL if >= 0.70 threshold."""
    total_score = sum(f.score_delta for f in state["findings"])
    clamped_score = min(round(total_score, 2), 1.0)
    requires_hitl = clamped_score >= 0.70
    
    decision = "PENDING_HUMAN_APPROVAL" if requires_hitl else "AUTO_APPROVED"
    if not requires_hitl and clamped_score < 0.30:
        decision = "AUTO_CLEARED"
        
    return {
        "cumulative_risk_score": clamped_score,
        "requires_human_review": requires_hitl,
        "review_status": "PENDING" if requires_hitl else "CLEARED",
        "final_verdict": decision,
        "execution_trace": [
            f"ComplianceEvaluator: Synthesized score: {clamped_score:.2f}. Requires Human Review: {requires_hitl}."
        ]
    }

from langchain_core.runnables import RunnableConfig
from langgraph.config import var_child_runnable_config

def human_approval_node(state: ComplianceState, config: RunnableConfig = None) -> Dict[str, Any]:
    """Suspends the graph at this breakpoint and yields control back to the checkpointer."""
    if config is not None:
        var_child_runnable_config.set(config)
    analyst_input = interrupt({
        "reason": "Risk threshold exceeded (>= 0.70). Manual adjudication mandatory.",
        "case_id": state["case_id"],
        "calculated_risk": state["cumulative_risk_score"]
    })
    
    return {
        "review_status": analyst_input.get("decision", "REJECTED"),
        "human_notes": analyst_input.get("notes", "No notes recorded."),
        "final_verdict": f"MANUAL_{analyst_input.get('decision')}",
        "execution_trace": [f"Human Reviewer completed audit: {analyst_input.get('decision')}"]
    }
