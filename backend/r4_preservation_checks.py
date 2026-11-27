"""BSON rehearsal helpers restricted to newly generated disposable QA databases."""
from copy import deepcopy
import re

from bson import BSON, json_util

DATABASE_NAME = re.compile(r'^test_grc_quality_[0-9a-f]{32}$')
INDEX_OPTIONS = ('unique', 'sparse', 'partialFilterExpression', 'expireAfterSeconds', 'collation',
                 'hidden', 'wildcardProjection', 'weights', 'default_language', 'language_override')


def require_disposable(database):
    if not DATABASE_NAME.fullmatch(database.name):
        raise ValueError('Preservation rehearsal requires an owned generated QA database')


def canonical(value):
    return json_util.dumps(value, sort_keys=True, json_options=json_util.CANONICAL_JSON_OPTIONS)


async def capture(database):
    require_disposable(database)
    result = {}
    for collection in sorted(await database.list_collection_names()):
        if collection.startswith('system.'):
            continue
        rows = await database[collection].find({}).to_list(None)
        # Actual BSON retains ObjectIds, bytes, dates and numeric types. No
        # credentials, tenant values or evidence contents are printed or exported.
        result[collection] = {'documents': [BSON.encode(row) for row in rows],
                              'indexes': deepcopy(await database[collection].index_information())}
    return result


async def restore(database, snapshot, ensure_indexes):
    require_disposable(database)
    if await database.list_collection_names():
        raise ValueError('Restore target must be a newly generated empty QA database')
    for name, collection in snapshot.items():
        await database.create_collection(name)
        documents = [BSON(row).decode() for row in collection['documents']]
        if documents:
            await database[name].insert_many(documents)
    await ensure_indexes(database)
    for name, collection in snapshot.items():
        for ident, definition in collection['indexes'].items():
            if ident != '_id_':
                options = {key: definition[key] for key in INDEX_OPTIONS if key in definition}
                await database[name].create_index(definition['key'], name=ident, **options)


def comparable(snapshot):
    return {name: {'documents': sorted(canonical(BSON(row).decode()) for row in entry['documents']),
                   'indexes': {ident: {key: value for key, value in definition.items() if key not in ('v', 'ns')}
                               for ident, definition in entry['indexes'].items()}}
            for name, entry in snapshot.items()}
