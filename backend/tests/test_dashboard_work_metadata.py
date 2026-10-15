"""Read-only native work associations retain kind-specific identities and ancestry."""
import unittest
import dashboard_contract


class DashboardWorkMetadataTests(unittest.TestCase):
    def test_assessment_control_review_and_parent_associations(self):
        records = {
            'reviews': [{'review_id': 'r', 'framework_key': 'cis-ig1', 'framework_safeguards': ['1.1', '1.2']}],
            'findings': [{'finding_id': 'f', 'framework_assessment_id': 'cis'}],
            'tasks': [{'task_id': 'child', 'source_type': 'finding', 'source_id': 'f'},
                      {'task_id': 'review-child', 'review_id': 'r'}, {'task_id': 'control-child'},
                      {'task_id': 'title', 'title': 'CIS Controls v8.1 1.1'},
                      {'task_id': 'foreign', 'framework_assessment_id': 'not-authorized'}],
        }
        assessments = [
            {'framework_assessment_id': 'cis', 'framework_key': 'cis-ig1', 'definition_id': '1.1'},
            {'framework_assessment_id': 'iso', 'framework_key': 'iso-27001', 'definition_id': 'A.5.1',
             'related_links': [{'kind': 'tasks', 'id': 'control-child'}]},
        ]
        controls = [{'assessment_ids': ['cis'], 'related_links': [{'kind': 'tasks', 'id': 'control-child'}]}]
        membership, metadata = dashboard_contract.framework_membership(records, assessments, controls, include_metadata=True)
        self.assertEqual(metadata['tasks', 'child']['safeguard_ids'], ['cis-ig1|1.1'])
        self.assertEqual(metadata['tasks', 'review-child']['safeguard_ids'], ['cis-ig1|1.1', 'cis-ig1|1.2'])
        self.assertEqual(metadata['tasks', 'control-child']['safeguard_ids'], ['cis-ig1|1.1', 'iso-27001|A.5.1'])
        self.assertEqual(metadata['tasks', 'child']['safeguard_labels'], ['CIS Controls v8.1 1.1'])
        for ident in ['title', 'foreign']:
            self.assertEqual(metadata['tasks', ident]['safeguard_ids'], [])
        self.assertEqual(membership['tasks', 'control-child'], {'cis-ig1', 'iso-27001'})
        self.assertEqual(membership, dashboard_contract.framework_membership(records, assessments, controls))

    def test_unresolved_associations_propagate_uncertainty_without_invented_scope(self):
        records = {'reviews':[{'review_id':'r','related_links':[{'kind':'framework_assessments','id':'missing'}]}],
                   'tasks':[{'task_id':'parent','review_id':'r'},{'task_id':'control'},
                            {'task_id':'general'},{'task_id':'direct','framework_assessment_id':'missing'}]}
        controls = [{'assessment_ids':['missing'],'related_links':[{'kind':'tasks','id':'control'}]}]
        _, metadata = dashboard_contract.framework_membership(records, [], controls, include_metadata=True)
        for ident in ['parent','control','direct']:
            self.assertFalse(metadata['tasks',ident]['framework_membership_known'])
        self.assertTrue(metadata['tasks','general']['framework_membership_known'])

    def test_missing_supported_parent_and_source_records_propagate_uncertainty(self):
        records = {'findings':[{'finding_id':'f','review_id':'missing'}], 'tasks':[
            {'task_id':'source','source_type':'finding','source_id':'missing'},
            {'task_id':'parent','review_id':'missing'}, {'task_id':'descendant','finding_id':'f'},
            {'task_id':'general'}]}
        _, metadata = dashboard_contract.framework_membership(records, [], [], include_metadata=True)
        for ident in ['source','parent','descendant']:
            self.assertFalse(metadata['tasks',ident]['framework_membership_known'])
        self.assertTrue(metadata['tasks','general']['framework_membership_known'])
