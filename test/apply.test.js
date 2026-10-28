const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const originalFetch = global.fetch;
const server = app.listen(0, '127.0.0.1');
after(() => { global.fetch = originalFetch; server.close(); });
async function request(path, body, method = 'POST') {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  return originalFetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
  });
}
const application = { fullName: ' Jane Doe ', regNumber: 'A12/56789/20', phone: '0712345678' };
test('application endpoint validates, persists, and reports errors as JSON', async () => {
  assert.equal((await request('/api/apply', {}, 'GET')).status, 405);
  assert.equal((await request('/api/apply', { ...application, phone: '123' })).status, 400);
  delete process.env.SUPABASE_URL;
  assert.equal((await request('/api/apply', application)).status, 503);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  let saved;
  global.fetch = async (url, options) => {
    assert.match(String(url), /\/rest\/v1\/applications/);
    saved = JSON.parse(options.body);
    return new Response(null, { status: 201 });
  };
  const response = await request('/api/apply', application);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).status, 'success');
  assert.deepEqual(saved, { full_name: 'Jane Doe', reg_number: 'A12/56789/20', phone: '0712345678' });
  global.fetch = async () => new Response(JSON.stringify({ message: 'database error' }), { status: 500 });
  assert.equal((await request('/api/apply', application)).status, 500);
  const missing = await request('/api/unknown', {}, 'GET');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).status, 'error');
});
