const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('payment prompt is separate, explicit, and reports pending rather than paid', async () => {
  const html = fs.readFileSync('public/grant.html', 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = {};
  for (const id of ['mainForm', 'verifyBtn', 'formMessage', 'paymentSection', 'paymentForm', 'paymentPhone', 'paymentBtn', 'paymentMessage', 'phoneNumber', 'fullName', 'regNumber']) {
    elements[id] = { value: '', hidden: id === 'paymentSection', disabled: false,
      addEventListener(type, handler) { this[type] = handler; }, reset() {} };
  }
  elements.phoneNumber.value = '0712345678';
  elements.fullName.value = 'Jane Doe';
  elements.regNumber.value = 'A12/12345/20';
  const calls = [];
  const context = { document: { getElementById: id => elements[id] }, fetch: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => url === '/api/apply'
      ? { status: 'success', message: 'Application submitted for review.' }
      : { status: 'success', checkoutRequestId: 'checkout-1' } };
  } };
  vm.runInNewContext(script, context);
  await elements.mainForm.submit({ preventDefault() {} });
  assert.deepEqual(calls.map(call => call.url), ['/api/apply']);
  assert.equal(elements.paymentSection.hidden, false);
  assert.equal(elements.paymentPhone.value, '0712345678');
  await elements.paymentForm.submit({ preventDefault() {} });
  assert.equal(calls[1].url, '/api/stkpush');
  assert.equal(calls[1].body.phone, '0712345678');
  assert.match(elements.paymentMessage.textContent, /not yet confirmed/);
  assert.equal(elements.paymentBtn.disabled, true);
});
