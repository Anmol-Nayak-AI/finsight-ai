from typing import Dict, Any
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt
from app.graph.state import ComplianceState
from app.graph.nodes import (
    transaction_investigator, 
    customer_risk_analyst, 
    regulatory_researcher, 
    compliance_evaluator
)

from langchain_core.runnables import RunnableConfig
from langgraph.config import var_child_runnable_config

def human_approval_node(state: ComplianceState, config: RunnableConfig = None) -> Dict[str, Any]:
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

def route_after_evaluation(state: ComplianceState) -> str:
    if state["requires_human_review"]:
        return "human_approval_node"
    return END

def create_compliance_graph():
    builder = StateGraph(ComplianceState)
    
    builder.add_node("transaction_investigator", transaction_investigator)
    builder.add_node("customer_risk_analyst", customer_risk_analyst)
    builder.add_node("regulatory_researcher", regulatory_researcher)
    builder.add_node("compliance_evaluator", compliance_evaluator)
    builder.add_node("human_approval_node", human_approval_node)
    
    builder.add_edge(START, "transaction_investigator")
    builder.add_edge("transaction_investigator", "customer_risk_analyst")
    builder.add_edge("transaction_investigator", "regulatory_researcher")
    
    builder.add_edge("customer_risk_analyst", "compliance_evaluator")
    builder.add_edge("regulatory_researcher", "compliance_evaluator")
    
    builder.add_conditional_edges(
        "compliance_evaluator",
        route_after_evaluation,
        {
            "human_approval_node": "human_approval_node",
            END: END
        }
    )
    builder.add_edge("human_approval_node", END)
    
    return builder
