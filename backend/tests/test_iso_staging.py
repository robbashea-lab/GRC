"""Static integrity checks for the ISO/IEC 27001 staging architecture."""
import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[2] / "shared" / "catalogs"
CATALOG = json.loads((ROOT / "iso27001.json").read_text(encoding="utf-8"))
STAGING = json.loads((ROOT / "iso27001Staging.json").read_text(encoding="utf-8"))


class IsoStagingTests(unittest.TestCase):
    def test_catalog_has_current_clause_and_annex_structure(self):
        definitions = CATALOG["requirements"]
        ids = [item["id"] for item in definitions]
        clauses = [item for item in definitions if item["specification"] == "isms_clause"]
        controls = [item for item in definitions if item["specification"] == "annex_control"]

        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(clauses), 30)
        self.assertEqual(len(controls), 93)
        self.assertEqual(
            {item["control_name"] for item in controls},
            {
                "Annex A · Organizational",
                "Annex A · People",
                "Annex A · Physical",
                "Annex A · Technological",
            },
        )
        self.assertEqual(
            {group: sum(item["control"] == group for item in controls) for group in ("A.5", "A.6", "A.7", "A.8")},
            {"A.5": 37, "A.6": 8, "A.7": 14, "A.8": 34},
        )
        self.assertTrue(all(re.fullmatch(r"A\.[5-8]\.\d+", item["id"]) for item in controls))
        self.assertTrue(all(item["title"].strip() for item in controls))

    def test_every_clause_has_complete_operating_profile(self):
        clauses = {item["id"] for item in CATALOG["requirements"] if item["specification"] == "isms_clause"}
        profiles = STAGING["clause_profiles"]
        self.assertEqual({profile["id"] for profile in profiles}, clauses)
        self.assertEqual(len(profiles), len({profile["id"] for profile in profiles}))
        for profile in profiles:
            self.assertTrue(profile["must"].strip())
            self.assertTrue(profile["reviewer_verify"].strip())
            self.assertTrue(profile["records"])
            self.assertIsInstance(profile["recurring"], bool)
            self.assertTrue(profile["workspace"].strip())

    def test_soa_supports_annex_and_non_annex_controls(self):
        model = STAGING["soa_model"]
        self.assertEqual(set(model["source_kinds"]), {"annex_a", "external", "custom"})
        self.assertEqual(
            set(model["status_labels"]),
            {
                "Necessary — Implemented",
                "Necessary — Partially Implemented",
                "Necessary — Not Implemented",
                "Not Necessary",
            },
        )
        required = {
            "annex_a_reference",
            "necessity",
            "necessity_justification",
            "not_necessary_justification",
            "implementation_status",
            "implementation_description",
            "implementation_references",
            "risk_treatment_ids",
            "risk_ids",
            "policy_ids",
            "custom_control_reference",
        }
        self.assertLessEqual(required, set(model["fields"]))
        self.assertEqual(model["trace"], ["Risk", "Risk Treatment", "Necessary Control", "SoA Entry", "Implementation", "Evidence"])

    def test_governance_models_reuse_authoritative_records(self):
        risk = STAGING["risk_treatment_integration"]
        self.assertEqual(risk["authoritative_record"], "Risks")
        self.assertIn("soa_entry_ids", risk["relationship_fields"])

        controls = STAGING["control_implementation_model"]
        self.assertIn("partially_implemented", controls["status_values"])
        self.assertLessEqual(
            {"risk_ids", "policy_ids", "soa_entry_id", "finding_ids", "action_item_ids"},
            set(controls["fields"]),
        )

        audit = STAGING["internal_audit_program"]
        self.assertEqual(audit["authoritative_records"]["schedule"], "Reviews")
        self.assertEqual(audit["authoritative_records"]["exceptions"], "Findings")
        self.assertEqual(audit["authoritative_records"]["remediation"], "Action Items")
        self.assertIn("independence_check", audit["engagement_fields"])
        self.assertIn("coverage_target", audit["programme_fields"])

        review = STAGING["management_review"]
        self.assertEqual(review["review_type"], "ISO 27001 Management Review")
        self.assertIn("risk assessment results and risk treatment status", review["required_input_topics"])
        self.assertIn("needed ISMS changes", review["required_output_topics"])

    def test_cadence_provenance_and_references_are_explicit(self):
        definitions = {item["id"] for item in CATALOG["requirements"]}
        allowed = {
            "ISO explicitly required",
            "ISO requires periodic/repeated activity but does not specify interval",
            "Omnisciente recommended cadence",
            "iVenture operating cadence",
            "client-selected cadence",
        }
        rows = STAGING["recurring_obligations"]
        self.assertGreaterEqual(len(rows), 13)
        for row in rows:
            self.assertIsInstance(row["recurrence_required"], bool)
            self.assertIsInstance(row["frequency_specified"], bool)
            self.assertIn(row["cadence_provenance"], allowed)
            self.assertLessEqual(set(row["source"]), definitions)
            self.assertTrue(row["calendar"].strip())

    def test_policy_and_review_mappings_reference_real_definitions(self):
        definitions = {item["id"] for item in CATALOG["requirements"]}
        self.assertTrue(CATALOG["policy_mappings"])
        self.assertTrue(CATALOG["review_plans"])
        for mapping in CATALOG["policy_mappings"]:
            self.assertEqual(mapping["classification"], "recommended")
            self.assertLessEqual(set(mapping["safeguards"]), definitions)
        for plan in CATALOG["review_plans"]:
            self.assertEqual(plan["classification"], "recommended")
            self.assertEqual(plan["cadence_class"], "D")
            self.assertLessEqual(set(plan["safeguards"]), definitions)


if __name__ == "__main__":
    unittest.main()
