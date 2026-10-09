from typing import Dict, Any
from app.graph.state import ComplianceState, Finding
from app.tools.compliance_tools import calculate_velocity_profile, check_sanctions_and_pep

def customer_risk_analyst(state: ComplianceState) -> Dict[str, Any]:
    txn = state["transaction_data"]
    findings = []
    
    velocity = calculate_velocity_profile.invoke({
        "customer_id": state["customer_id"], 
        "incoming_amount": txn["amount"]
    })
    
    sanctions = check_sanctions_and_pep.invoke({
        "customer_id": state["customer_id"],
        "beneficiary_name": txn.get("beneficiary_name", "")
    })
    
    if velocity["velocity_breach"]:
        findings.append(Finding(
            agent="CustomerRiskAnalyst",
            risk_level="HIGH",
            score_delta=0.35,
            details=f"Velocity breach: {velocity['spike_multiplier']}x baseline deviation (Baseline: ₹{velocity['historical_monthly_avg']:,.2f}).",
            evidence=velocity
        ))
    elif velocity["spike_multiplier"] >= 1.5:
        findings.append(Finding(
            agent="CustomerRiskAnalyst",
            risk_level="MEDIUM",
            score_delta=0.20,
            details=f"Moderate velocity deviation: {velocity['spike_multiplier']}x monthly baseline turnover.",
            evidence=velocity
        ))
        
    if sanctions["beneficiary_sanctions_match"]:
        findings.append(Finding(
            agent="CustomerRiskAnalyst",
            risk_level="HIGH",
            score_delta=0.40,
            details=f"Entity watchlist match: Beneficiary '{txn.get('beneficiary_name')}' matched high-risk offshore watchlist.",
            evidence=sanctions
        ))
        
    return {
        "findings": findings,
        "execution_trace": [f"CustomerRiskAnalyst: Velocity {velocity['spike_multiplier']}x baseline. Watchlist hit: {sanctions['beneficiary_sanctions_match']}."]
    }
