"""Serve the normal built frontend after the existing API routes, on one origin."""
import os
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.routing import Match, Mount
from starlette.staticfiles import StaticFiles


class FrontendMount(Mount):
    def matches(self, scope):
        if scope['path'] == '/api' or scope['path'].startswith('/api/'):
            return Match.NONE, {}
        return super().matches(scope)


class FrontendFiles(StaticFiles):
    async def get_response(self, path, scope):
        path = path.replace(os.sep, '/')
        # Unknown API paths must never become a successful-looking SPA response.
        if path.split('/', 1)[0] == 'api':
            raise HTTPException(404)
        try:
            return await super().get_response(path, scope)
        except HTTPException as error:
            if error.status_code != 404 or scope['method'] not in {'GET', 'HEAD'}:
                raise
            accept = dict(scope['headers']).get(b'accept', b'')
            if b'text/html' not in accept or '.' in path or path.startswith('static/'):
                raise
            return await super().get_response('index.html', scope)


# Import the unchanged application's routes, authorization and startup checks.
from server import app

app.router.routes.append(FrontendMount('/', app=FrontendFiles(
    directory=os.environ.get('FRONTEND_BUILD_DIR',
        Path(__file__).resolve().parent.parent / 'frontend' / 'build'),
    html=True,
), name='staging-frontend'))
