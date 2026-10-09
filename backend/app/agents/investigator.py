from typing import Dict, Any
from app.graph.state import ComplianceState, Finding
from app.tools.compliance_tools import get_transaction_details

def transaction_investigator(state: ComplianceState) -> Dict[str, Any]:
    txn = get_transaction_details.invoke({"transaction_id": state["transaction_id"]})
    findings = []
    
    amount = txn.get("amount", 0.0)
    is_new = txn.get("beneficiary_is_new", False)
    
    if amount >= 500000.00 and is_new:
        findings.append(Finding(
            agent="TransactionInvestigator",
            risk_level="HIGH",
            score_delta=0.45,
            details=f"High-risk transfer: {txn['currency']} {amount:,.2f} sent to first-time beneficiary '{txn['beneficiary_name']}'.",
            evidence=txn
        ))
    elif amount >= 250000.00 or is_new:
        findings.append(Finding(
            agent="TransactionInvestigator",
            risk_level="MEDIUM",
            score_delta=0.25,
            details=f"Elevated commercial transfer: {txn['currency']} {amount:,.2f} processed via {txn['channel']}.",
            evidence=txn
        ))
    else:
        findings.append(Finding(
            agent="TransactionInvestigator",
            risk_level="LOW",
            score_delta=0.05,
            details=f"Low nominal transfer amount ({txn['currency']} {amount:,.2f}) within standard consumer limits.",
            evidence=txn
        ))
        
    return {
        "transaction_data": txn,
        "customer_id": txn["customer_id"],
        "findings": findings,
        "execution_trace": [f"TransactionInvestigator: Ingested {txn['transaction_id']} ({txn['currency']} {amount:,.2f} via {txn['channel']})."]
    }
