const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');

// The shell serves GRC client data in standard mode: no third-party analytics, session
// replay, remote scripts or remote fonts may load from it (docs/security-review.md).
test('the application shell loads no third-party analytics, replay, scripts or fonts', () => {
  expect(html).not.toMatch(/posthog|session_recording|emergent\.sh|googleapis|gstatic/i);
  expect(html).not.toMatch(/<script[^>]+src=["']https?:/i);
  expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
});
