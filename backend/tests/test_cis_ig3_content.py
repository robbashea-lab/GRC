"""Version-specific content and optional scheduling contracts, without client data."""
import unittest
from framework_catalog import CIS, active_definitions, active_plans
from framework_governance import CIS_CRITERIA
from shared_review_plans import shared_config


class CisIG3ContentTests(unittest.TestCase):
    def test_exact_cumulative_membership_and_stable_criteria(self):
        counts=[5,7,14,12,6,8,7,12,7,7,5,8,11,9,7,14,9,5]
        expected={f'{c}.{n}' for c,count in enumerate(counts,1) for n in range(1,count+1)}
        self.assertEqual({d['id'] for d in CIS['requirements']},expected)
        self.assertEqual(len(CIS['requirements']),153)
        self.assertEqual(set(CIS_CRITERIA),expected)
        self.assertEqual([len(active_definitions('cis-ig1',{'implementation_group':g})) for g in [1,2,3]],[56,130,153])
        criteria=[c['id'] for r in CIS_CRITERIA.values() for c in r['criteria']]
        self.assertEqual(len(criteria),361)
        self.assertEqual(len(set(criteria)),361)

    def test_focused_templates_are_opt_in_with_exact_timing(self):
        state={'requirements':{'cis-ig1':'applies'},'framework_settings':{'cis-ig1':{'implementation_group':3}},'framework_reviews':{}}
        plans=active_plans('cis-ig1',state['framework_settings']['cis-ig1'])
        focused=[p for p in plans if p.get('default_enabled') is False]
        self.assertEqual(len(focused),5)
        self.assertTrue(all(not shared_config(state,p)['enabled'] for p in focused))
        weekly=next(p for p in focused if p['key']=='passive-discovery-reconciliation')
        config=shared_config(state,weekly)
        self.assertEqual((config['recurrence'],config['custom_recurrence_days']),('custom',7))
        state['framework_reviews'][weekly['key']]={'enabled':True}
        self.assertTrue(shared_config(state,weekly)['enabled'])
        self.assertEqual(len([p for p in plans if shared_config({'requirements':state['requirements'],'framework_settings':state['framework_settings']},p)['enabled']]),15)

    def test_new_ig3_penetration_title_does_not_change_ig2_definition(self):
        title=lambda g:next(p['title'] for p in active_plans('cis-ig1',{'implementation_group':g}) if p['key']=='penetration-testing')
        self.assertEqual(title(3),'Penetration Testing Program Review')
        self.assertNotEqual(title(2),title(3))

    def test_content_is_complete_but_release_is_still_closed(self):
        self.assertEqual(CIS['available_implementation_groups'],[1,2])
        mapped={i for p in CIS['review_plans'] if p.get('default_enabled',True) for i in p['safeguards']}
        self.assertEqual(mapped,{d['id'] for d in CIS['requirements']})
