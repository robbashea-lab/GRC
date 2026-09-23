"""Run only reviewed offline suites, retaining the repository's pytest/xdist configuration."""
from pathlib import Path
import sys
import pytest

TESTS = """
action_items ai_governance assignment_eligibility auth_boundaries client_dashboard_sources
client_management client_relationships client_profile core_audit create_requests csf_framework dashboard_contract edit_versions engineering_reliability
evidence_context evidence_library framework_governance framework_program governance_integrity governance_context hipaa_framework
identity_lifecycle iso_framework management_obligations onboarding_baseline onboarding_handoff
operating_model people_visibility phase6_visibility policy_approval policy_provenance
portfolio_overview review_lifecycle review_occurrences risk_ids risk_lifecycle runtime_packaging
seed_account_settings soc_framework standard_initialization vendor_governance
""".split()

if __name__ == "__main__":
    backend = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend.parent))
    sys.path.insert(0, str(backend))
    # No general discovery: legacy generated HTTP suites mutate an external environment.
    raise SystemExit(pytest.main(["-c",str(backend/"pytest.ini"),"-q",
                                *(str(backend/"tests"/f"test_{name}.py") for name in TESTS)]))
