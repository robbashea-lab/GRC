"""Serve the normal built frontend after the existing API routes, on one origin."""
import os
import hashlib
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import FileResponse, HTMLResponse, RedirectResponse
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
            response = await super().get_response('index.html', scope)
            if path == 'login':
                response.delete_cookie('governara_staging_workspace', path='/')
            return response


if os.environ.get('APP_ENV') != 'staging':
    raise ValueError('APP_ENV must be staging for the staging entrypoint')
if any(os.environ.get(name) == 'true' for name in (
        'RUN_LEGACY_MIGRATIONS', 'DEMO_MODE', 'REACT_APP_PREVIEW')):
    raise ValueError('Unsafe switches must be disabled for the staging entrypoint')


# Import the unchanged application's routes, authorization and startup checks.
from server import app, get_current_user
import server as native_server
import approved_v3
from approved_v3_page import native_document

app.include_router(approved_v3.router_for(native_server))


frontend_directory = Path(os.environ.get('FRONTEND_BUILD_DIR',
    Path(__file__).resolve().parent.parent / 'frontend' / 'build'))


async def approved_workspace(request: Request):
    """The approved sample portfolio is the ordinary signed-in staging entry."""
    try:
        user = await get_current_user(request)
    except HTTPException as error:
        if error.status_code == 401:
            return RedirectResponse('/login', status_code=303)
        raise
    if request.cookies.get('governara_staging_workspace') == 'existing':
        return FileResponse(frontend_directory / 'index.html',
            media_type='text/html', headers={'Cache-Control': 'private, no-store'})
    if user.get('role') not in ('super_admin', 'platform_admin'):
        return RedirectResponse('/dashboard', status_code=303)
    source = (frontend_directory / 'visual-preview.html').read_bytes()
    return HTMLResponse(native_document(source),
        headers={'Cache-Control': 'private, no-store',
                 'X-GoverNara-Source-SHA256': hashlib.sha256(source).hexdigest()})


async def existing_workspace(request: Request):
    """Enter the retained native application with its original route paths."""
    response = HTMLResponse(
        '<!doctype html><html><head><meta charset="utf-8"><title>GoverNara</title></head>'
        '<body data-staging-entry="existing"><p>Opening existing workspace…</p>'
        '<script src="/staging-workspace.js"></script></body></html>',
        headers={'Cache-Control': 'private, no-store'})
    response.set_cookie('governara_staging_workspace', 'existing',
        secure=request.url.scheme == 'https', samesite='lax', path='/')
    return response


app.add_api_route('/clients', approved_workspace, methods=['GET', 'HEAD'],
    include_in_schema=False)
app.add_api_route('/existing', existing_workspace, methods=['GET', 'HEAD'],
    include_in_schema=False)
app.add_api_route('/existing/clients', existing_workspace, methods=['GET', 'HEAD'],
    include_in_schema=False)

app.router.routes.append(FrontendMount('/', app=FrontendFiles(
    directory=frontend_directory,
    html=True,
), name='staging-frontend'))
