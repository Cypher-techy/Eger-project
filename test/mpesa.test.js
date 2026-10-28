const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

const originalFetch = global.fetch;
const server = app.listen(0, '127.0.0.1');
after(() => { global.fetch = originalFetch; server.close(); });
async function request(path, body, method = 'POST') {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  return originalFetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
  });
}
Object.assign(process.env, {
  DARAJA_ENVIRONMENT: 'sandbox', DARAJA_CONSUMER_KEY: 'key', DARAJA_CONSUMER_SECRET: 'secret',
  DARAJA_SHORTCODE: '174379', DARAJA_PASSKEY: 'pass', MPESA_CALLBACK_URL: 'https://example.com/api/callback',
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key'
});

test('STK push authenticates correctly and returns the checkout ID', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(calls.length === 1 ? { access_token: 'token' } : {
      ResponseCode: '0', CheckoutRequestID: 'checkout', MerchantRequestID: 'merchant', CustomerMessage: 'Prompt sent'
    }), { status: 200 });
  };
  const response = await request('/api/stkpush', { phone: '+254 712 345 678' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).checkoutRequestId, 'checkout');
  assert.equal(calls[0].url, 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials');
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from('key:secret').toString('base64')}`);
  const payload = JSON.parse(calls[1].options.body);
  assert.equal(payload.PhoneNumber, '254712345678');
  assert.equal(payload.Amount, 50);
  assert.match(payload.Timestamp, /^\d{14}$/);
  assert.equal(payload.Password, Buffer.from(`174379pass${payload.Timestamp}`).toString('base64'));
});

test('rejects invalid numbers and upstream errors', async () => {
  assert.equal((await request('/api/stkpush', { phone: '123' })).status, 400);
  assert.equal((await request('/api/stkpush', null, 'GET')).status, 405);
  global.fetch = async url => new Response(JSON.stringify(url.includes('oauth') ? { access_token: 'token' } : { ResponseCode: '1', ResponseDescription: 'Rejected' }), { status: 200 });
  const response = await request('/api/stkpush', { phone: '0712345678' });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).message, 'Rejected');
});

test('callback saves parsed success and failure results and handles storage errors', async () => {
  const writes = [];
  global.fetch = async (url, options) => {
    writes.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(null, { status: 201 });
  };
  const callback = { Body: { stkCallback: { MerchantRequestID: 'merchant', CheckoutRequestID: 'checkout', ResultCode: 0, ResultDesc: 'Success', CallbackMetadata: { Item: [
    { Name: 'Amount', Value: 50 }, { Name: 'MpesaReceiptNumber', Value: 'ABC123' }, { Name: 'PhoneNumber', Value: 254712345678 }
  ] } } } };
  assert.equal((await request('/api/callback', callback)).status, 200);
  assert.equal(writes[0].body.mpesa_receipt_number, 'ABC123');
  assert.equal(writes[0].body.phone_number, '254712345678');
  assert.match(writes[0].url, /on_conflict=checkout_request_id/);
  callback.Body.stkCallback.ResultCode = 1032;
  delete callback.Body.stkCallback.CallbackMetadata;
  assert.equal((await request('/api/callback', callback)).status, 200);
  assert.equal(writes[1].body.result_code, 1032);
  assert.equal(writes[1].body.amount, null);
  assert.equal((await request('/api/callback', {})).status, 400);
  global.fetch = async () => new Response(JSON.stringify({ message: 'database error' }), { status: 500 });
  assert.equal((await request('/api/callback', callback)).status, 500);
});
