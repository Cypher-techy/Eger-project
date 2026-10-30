const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const realFetch = global.fetch;
const server = app.listen(0, '127.0.0.1');
after(() => { global.fetch = realFetch; server.close(); });
async function request(body, auth = 'Bearer user-token') {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  return realFetch(`http://127.0.0.1:${server.address().port}/api/level-unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body) });
}
Object.assign(process.env, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', MPESA_ENVIRONMENT: 'production', MPESA_ENABLED: 'true', MPESA_CONSUMER_KEY: 'key', MPESA_CONSUMER_SECRET: 'secret', MPESA_SHORTCODE: '8252843', MPESA_PASSKEY: 'pass', MPESA_TRANSACTION_TYPE: 'CustomerBuyGoodsOnline', MPESA_PARTY_B: '6706411', MPESA_CALLBACK_URL: 'https://example.com/api/callback' });

test('level unlock requires a valid user, requests exactly KES 20, and remains pending', async () => {
  const calls = [];
  global.fetch = async (input, options = {}) => {
    const url = String(input); calls.push({ url, options });
    if (url.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-123', email: 'user@example.com' }), { status: 200 });
    if (url.includes('/rest/v1/kazileo_level_two_payments')) return new Response(null, { status: options.method === 'POST' ? 201 : 204 });
    if (url.includes('/oauth/')) return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
    if (url.includes('/processrequest')) return new Response(JSON.stringify({ ResponseCode: '0', CheckoutRequestID: 'checkout-20', MerchantRequestID: 'merchant' }), { status: 200 });
    throw new Error('unexpected URL ' + url);
  };
  assert.equal((await request({ phone: 'bad' })).status, 400);
  assert.equal((await request({ phone: '0712345678' }, '')).status, 401);
  const response = await request({ phone: '0712345678' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'pending');
  const reserve = calls.find(c => c.url.includes('/rest/v1/kazileo_level_two_payments') && c.options.method === 'POST');
  assert.equal(JSON.parse(reserve.options.body).status, 'initiating');
  const stk = calls.find(c => c.url.includes('/processrequest'));
  const payload = JSON.parse(stk.options.body);
  assert.equal(payload.Amount, 20);
  assert.equal(payload.PhoneNumber, '254712345678');
  assert.equal(payload.TransactionType, 'CustomerBuyGoodsOnline');
  assert.equal(payload.PartyB, '6706411');
  const update = calls.find(c => c.options.method === 'PATCH');
  assert.equal(JSON.parse(update.options.body).status, 'pending');
});

test('ambiguous STK failure is not marked failed or retried automatically', async () => {
  const calls = [];
  global.fetch = async (input, options = {}) => {
    const url = String(input); calls.push({ url, options });
    if (url.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-123' }), { status: 200 });
    if (url.includes('/rest/v1/kazileo_level_two_payments')) return new Response(null, { status: 201 });
    if (url.includes('/oauth/')) return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
    if (url.includes('/processrequest')) throw new Error('timeout');
    throw new Error('unexpected URL');
  };
  const response = await request({ phone: '0712345678' });
  assert.equal(response.status, 502);
  assert.match((await response.json()).message, /uncertain/i);
  assert.equal(calls.filter(c => c.options.method === 'PATCH').length, 0);
  assert.equal(calls.filter(c => c.url.includes('/processrequest')).length, 1);
});
