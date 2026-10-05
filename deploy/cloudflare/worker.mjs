// Transport only: authentication, permissions and persistence stay in FastAPI.
const unavailable = (status, detail) => Response.json({ detail }, {
  status, headers: { 'Cache-Control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.pathname !== '/api' && !incoming.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    let upstream;
    try {
      upstream = new URL(env.API_ORIGIN);
      if (upstream.protocol !== 'https:' || upstream.username || upstream.password ||
          upstream.pathname !== '/' || upstream.search || upstream.hash ||
          upstream.origin === incoming.origin) throw new Error('Invalid API origin');
    } catch {
      return unavailable(503, 'Staging API is not configured');
    }
    // Assign paths separately: a caller cannot replace the configured upstream host.
    upstream.pathname = incoming.pathname;
    upstream.search = incoming.search;
    const outgoing = new Request(upstream, request);
    for (const name of [...outgoing.headers.keys()]) {
      if (name === 'host' || name === 'forwarded' || name.startsWith('x-forwarded-') ||
          name.startsWith('cf-')) outgoing.headers.delete(name);
    }
    // Cloudflare Access credentials must not be forwarded to another hosting provider.
    const cookies = (request.headers.get('cookie') || '').split(';')
      .map(value => value.trim()).filter(value => /^(access_token|session_token)=/.test(value));
    outgoing.headers.delete('cookie');
    if (cookies.length) outgoing.headers.set('cookie', cookies.join('; '));
    const controller = new AbortController();
    // Free staging hosts can take about a minute to wake after idle.
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(outgoing, {
        redirect: 'manual', signal: controller.signal,
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      const location = headers.get('location');
      if (location) {
        const redirect = new URL(location, upstream);
        if (redirect.host !== upstream.host) return unavailable(502, 'Unexpected API redirect');
        redirect.protocol = incoming.protocol;
        redirect.host = incoming.host;
        headers.set('location', redirect.href);
      }
      return new Response(response.body, { status: response.status,
        statusText: response.statusText, headers });
    } catch {
      return unavailable(controller.signal.aborted ? 504 : 502, 'Staging API is unavailable');
    } finally {
      clearTimeout(timer);
    }
  },
};
