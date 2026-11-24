"""Catalog-declared shared activities; no new scheduling or assessment engine."""
from framework_catalog import CATALOGS, active_plans

INTERVALS = {'monthly': 1, 'quarterly': 3, 'semiannual': 6, 'annual': 12}

# These are saved Review relationships. A catalog recommendation alone is not a link.
MAPPING_FIELDS = ('framework_key', 'framework_safeguards', 'framework_driver_active', 'framework_drivers')


def active_mappings(review):
    drivers = review.get('framework_drivers')
    return [driver for driver in (drivers if drivers is not None else [review])
            if isinstance(driver, dict) and driver.get('framework_key') and driver.get('framework_safeguards')
            and driver.get('framework_driver_active') is not False]


def maps_to(review, framework_key, definition_id):
    return any(driver['framework_key'] == framework_key and definition_id in driver['framework_safeguards']
               for driver in active_mappings(review))


def mapping_query(framework_key, definition_ids):
    # Match the framework and unit on the same driver; an empty driver list retires an old flat mapping.
    match = {'framework_key': framework_key, 'framework_safeguards': {'$in': definition_ids},
             'framework_driver_active': {'$ne': False}}
    return {'$or': [{'framework_drivers': None, **match}, {'framework_drivers': {'$elemMatch': match}}]}


def selected_plans(state):
    return [{**p, 'framework_key': key} for key, catalog in CATALOGS.items()
            if state.get('requirements', {}).get(key) == 'applies'
            for p in active_plans(key, state.get('framework_settings', {}).get(key, {}))]


def shared_config(state, plan):
    drivers = [p for p in selected_plans(state) if p['key'] == plan['key'] or
               plan.get('baseline_key') and p.get('baseline_key') == plan['baseline_key']] or [plan]
    explicit = [p['source_minimum'] for p in drivers if p.get('source_minimum')]
    proposed = min(explicit or [p['default_cadence'] for p in drivers], key=INTERVALS.get)
    configured = [state.get('framework_reviews', {})[p['key']] for p in drivers
                  if p['key'] in state.get('framework_reviews', {})]
    result = {'enabled': plan.get('default_enabled', True), 'recurrence': proposed, 'custom_recurrence_days': plan.get('default_custom_recurrence_days'), 'due_date': '', **(configured[0] if configured else {})}
    def signature(c):
        return (c.get('enabled', plan.get('default_enabled', True)), c.get('recurrence', proposed),
                c.get('custom_recurrence_days', plan.get('default_custom_recurrence_days'))
                if c.get('recurrence', proposed) == 'custom' else None, c.get('due_date') or '')
    if any(signature(c) != signature(result) for c in configured):
        raise ValueError('Choose one cadence and first due date for shared Review: ' + plan['title'])
    return result


def driver(key, plan, active=True):
    return {'framework_key': key, 'framework_version': CATALOGS[key]['version'],
            'framework_plan_key': plan['key'], 'framework_driver_active': active,
            'framework_safeguards': plan['safeguards'], 'framework_basis': plan['basis'],
            'framework_source_cadence': plan['source_cadence'],
            'framework_default_cadence': plan['default_cadence'],
            'framework_source_minimum': plan.get('source_minimum'),
            'framework_cadence_references': plan.get('cadence_references', [])}


def drivers(row):
    if 'framework_drivers' in row:
        return row['framework_drivers']
    plan = next((p for p in CATALOGS.get(row.get('framework_key'), {}).get('review_plans', [])
                 if p['key'] == row.get('framework_plan_key')), None)
    return [driver(row['framework_key'], plan, row.get('framework_driver_active') is not False)] if plan else []
