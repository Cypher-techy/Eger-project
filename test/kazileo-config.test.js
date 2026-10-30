const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/kazileo-config');
function invoke(method = 'GET') {
  const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.code=n; return this; }, json(body) { this.body=body; return this; } };
  handler({ method }, res); return res;
}
test('config exposes only a public key and only for a Supabase HTTPS project', () => {
  const prior = { ...process.env };
  try {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
    assert.deepEqual(invoke().body, { url: 'https://example.supabase.co', anonKey: 'sb_publishable_example' });
    assert.equal(invoke('POST').code, 405);
    process.env.SUPABASE_ANON_KEY = 'sb_secret_secret';
    assert.equal(invoke().code, 503);
    process.env.SUPABASE_ANON_KEY = 'x.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.x';
    assert.equal(invoke().code, 503);
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_example';
    process.env.SUPABASE_URL = 'https://example.com';
    assert.equal(invoke().code, 503);
  } finally { process.env = prior; }
});
