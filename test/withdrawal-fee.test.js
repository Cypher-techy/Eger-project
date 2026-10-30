const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const realFetch = global.fetch;
const server = app.listen(0, '127.0.0.1');
after(() => { global.fetch = realFetch; server.close(); });
async function request(body, auth = 'Bearer token') {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  return realFetch(`http://127.0.0.1:${server.address().port}/api/withdrawal-fee`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body) });
}
Object.assign(process.env, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-key', MPESA_ENVIRONMENT: 'sandbox', MPESA_ENABLED: 'true', MPESA_CONSUMER_KEY: 'key', MPESA_CONSUMER_SECRET: 'secret', MPESA_SHORTCODE: '174379', MPESA_PASSKEY: 'pass', MPESA_TRANSACTION_TYPE: 'CustomerPayBillOnline', MPESA_CALLBACK_URL: 'https://example.com/api/callback' });
function stub({ balance = 1500, uncertain = false } = {}) {
  const calls = [];
  global.fetch = async (input, options = {}) => {
    const url = String(input); calls.push({ url, options });
    if (url.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-123' }), { status: 200 });
    if (url.includes('/rest/v1/kazileo_wallets')) return new Response(JSON.stringify({ available_kes: balance }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/rest/v1/kazileo_withdrawals')) return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/rest/v1/kazileo_withdrawal_fees')) return new Response(null, { status: options.method === 'POST' ? 201 : 204 });
    if (url.includes('/oauth/')) return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
    if (url.includes('/processrequest')) {
      if (uncertain) throw new Error('timeout');
      return new Response(JSON.stringify({ ResponseCode: '0', CheckoutRequestID: 'checkout-fee' }), { status: 200 });
    }
    throw new Error('unexpected URL ' + url);
  };
  return calls;
}
test('withdrawal fee is authenticated, disclosed, bound to the requested withdrawal, and pending', async () => {
  const calls = stub();
  assert.equal((await request({ phone: '0712345678', withdrawalAmount: 1199 })).status, 400);
  assert.equal((await request({ phone: '0712345678', withdrawalAmount: 1200 }, '')).status, 401);
  const response = await request({ phone: '0712345678', withdrawalAmount: 1200 });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'pending');
  const insert = calls.find(c => c.url.includes('kazileo_withdrawal_fees') && c.options.method === 'POST');
  const record = JSON.parse(insert.options.body);
  assert.equal(record.amount_kes, 50);
  assert.equal(record.withdrawal_amount_kes, 1200);
  assert.equal(record.phone, '254712345678');
  const payload = JSON.parse(calls.find(c => c.url.includes('/processrequest')).options.body);
  assert.equal(payload.Amount, 50);
  assert.equal(payload.PhoneNumber, '254712345678');
  assert.equal(JSON.parse(calls.find(c => c.options.method === 'PATCH').options.body).status, 'pending');
});
test('insufficient balance stops payment; an uncertain payment is never automatically retried', async () => {
  let calls = stub({ balance: 1199 });
  assert.equal((await request({ phone: '0712345678', withdrawalAmount: 1200 })).status, 400);
  assert.equal(calls.some(c => c.url.includes('/processrequest')), false);
  calls = stub({ uncertain: true });
  const response = await request({ phone: '0712345678', withdrawalAmount: 1200 });
  assert.equal(response.status, 502);
  assert.match((await response.json()).message, /uncertain/i);
  assert.equal(calls.filter(c => c.options.method === 'PATCH').length, 0);
  assert.equal(calls.filter(c => c.url.includes('/processrequest')).length, 1);
});
