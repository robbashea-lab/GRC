"""Fail-closed non-demo environment configuration and bounded HTTP boundary."""
import logging
import os
import time
from collections import OrderedDict
from urllib.parse import urlsplit
from starlette.responses import JSONResponse

MAX_BODY = 12 * 1024 * 1024  # includes JSON/base64 overhead; files limited separately

def csv_cell(value):
    text = str(value) if value is not None else ''
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@')) or text.startswith(('\t','\r','\n')) else text


def environment():
    value = os.environ.get('APP_ENV', 'development')
    if value not in {'development', 'test', 'staging', 'production'}:
        raise ValueError('APP_ENV must explicitly name a non-demo server environment')
    return value


def validate_environment():
    env = environment()
    if env not in {'staging', 'production'}:
        return
    if len(os.environ.get('JWT_SECRET','')) < 32:
        raise ValueError('A dedicated JWT_SECRET of at least 32 characters is required')
    for name in ('APP_BASE_URL', 'CORS_ORIGINS'):
        values = os.environ.get(name, '').split(',')
        if not values or any(urlsplit(v.strip()).scheme != 'https' or not urlsplit(v.strip()).hostname
                             or '*' in v or urlsplit(v.strip()).username for v in values):
            raise ValueError(name + ' must contain explicit HTTPS origins')
    if not os.environ.get('DB_NAME','').startswith(env + '_'):
        raise ValueError('DB_NAME must use the environment-specific namespace')
    if os.environ.get('REACT_APP_PREVIEW') == 'true' or os.environ.get('DEMO_MODE') == 'true':
        raise ValueError('Demo switches are not supported by the standard server')
    if os.environ.get('RUN_LEGACY_MIGRATIONS') == 'true':
        raise ValueError('Run reviewed migrations separately before starting staging/production')


class SecurityBoundary:
    def __init__(self, app):
        self.app = app
        self.attempts = OrderedDict()

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        path, method = scope['path'], scope['method']
        async def secure_send(message):
            if message['type'] == 'http.response.start':
                extra = [(b'x-content-type-options',b'nosniff'),(b'x-frame-options',b'DENY'),
                         (b'referrer-policy',b'no-referrer'),(b'cache-control',b'no-store')]
                if path.startswith('/api'):
                    extra.append((b'content-security-policy',b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"))
                if scope.get('scheme') == 'https':
                    extra.append((b'strict-transport-security',b'max-age=31536000'))
                message['headers'] = list(message.get('headers', [])) + extra
                if message['status'] in (401,403):
                    logging.warning('Authorization rejected actor=%s method=%s route=%s status=%s',
                        scope.get('security_actor','unauthenticated'), method,
                        getattr(scope.get('route'),'path','unmatched'), message['status'])
            await send(message)
        async def reject(status, detail):
            await JSONResponse({'detail':detail},status_code=status)(scope,receive,secure_send)
        if path.startswith('/api/demo'):
            return await reject(404,'Not found')
        if method not in {'GET','HEAD','OPTIONS'}:
            origin = headers.get(b'origin',b'').decode('latin1')
            trusted = {v.strip().rstrip('/') for v in os.environ.get('CORS_ORIGINS','').split(',') if v.strip()}
            trusted.add(os.environ.get('APP_BASE_URL','').rstrip('/'))
            trusted.discard('')
            # Explicit bearer clients are not ambient-cookie authenticated. The
            # auth dependency must never fall back to cookies for a bad bearer.
            cookie_auth = b'access_token=' in headers.get(b'cookie',b'') or b'session_token=' in headers.get(b'cookie',b'')
            if cookie_auth and b'authorization' not in headers and origin not in trusted:
                return await reject(403,'A trusted Origin is required for cookie-authenticated changes')
            if path in {'/api/auth/login','/api/auth/register','/api/auth/forgot-password','/api/auth/reset-password','/api/auth/google/session'}:
                key = ((scope.get('client') or ('unknown',))[0],path)
                now=time.monotonic()
                count,start=self.attempts.pop(key,(0,now))
                if now-start>=60: count,start=0,now
                self.attempts[key]=(count+1,start)
                if len(self.attempts)>10000: self.attempts.popitem(last=False)
                if count>=30:
                    return await reject(429,'Too many authentication requests; try again later')
            body=bytearray()
            while True:
                message=await receive()
                if message['type']=='http.disconnect': return
                body.extend(message.get('body',b''))
                if len(body)>MAX_BODY: return await reject(413,'Request exceeds the 12 MB limit')
                if not message.get('more_body',False): break
            delivered=False
            async def buffered_receive():
                nonlocal delivered
                if not delivered:
                    delivered=True
                    return {'type':'http.request','body':bytes(body),'more_body':False}
                return await receive()
            return await self.app(scope,buffered_receive,secure_send)
        return await self.app(scope,receive,secure_send)
