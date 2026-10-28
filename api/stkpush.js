const ENVIRONMENTS = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke'
};

function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const phone = value.trim().replace(/[\s()-]/g, '');
  const normalized = phone.replace(/^\+/, '').replace(/^0/, '254');
  return /^254[17]\d{8}$/.test(normalized) ? normalized : null;
}

function timestamp() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ status: 'error', message: 'Enter a valid Kenyan mobile number' });

  const { DARAJA_CONSUMER_KEY: key, DARAJA_CONSUMER_SECRET: secret,
    DARAJA_SHORTCODE: shortCode, DARAJA_PASSKEY: passKey,
    MPESA_CALLBACK_URL: callbackUrl, DARAJA_ENVIRONMENT: environment = 'sandbox' } = process.env;
  let validCallback = false;
  try {
    const url = new URL(callbackUrl);
    validCallback = url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  } catch (_) { /* Invalid or missing URL. */ }
  if (!key || !secret || !shortCode || !passKey || !validCallback || !ENVIRONMENTS[environment]) {
    console.error('Missing or invalid Daraja configuration');
    return res.status(500).json({ status: 'error', message: 'Server configuration error' });
  }

  try {
    const base = ENVIRONMENTS[environment];
    const auth = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` },
      signal: AbortSignal.timeout(15000)
    });
    const authData = await auth.json();
    if (!auth.ok || !authData.access_token) throw new Error('Daraja authentication failed');
    const time = timestamp();
    const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authData.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortCode,
        Password: Buffer.from(`${shortCode}${passKey}${time}`).toString('base64'),
        Timestamp: time, TransactionType: 'CustomerPayBillOnline', Amount: 50,
        PartyA: phone, PartyB: shortCode, PhoneNumber: phone, CallBackURL: callbackUrl,
        AccountReference: 'Grant Payment', TransactionDesc: 'Payment for Grant'
      }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok || String(data.ResponseCode) !== '0' || !data.CheckoutRequestID) {
      console.error('Daraja rejected STK request:', data.errorCode || data.ResponseCode);
      return res.status(502).json({ status: 'error', message: data.errorMessage || data.ResponseDescription || 'STK Push failed' });
    }
    // Acceptance only means a prompt was sent; the callback contains the payment result.
    return res.status(200).json({ status: 'success', message: data.CustomerMessage || 'STK Push sent',
      requestId: data.CheckoutRequestID, checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID });
  } catch (error) {
    console.error('Daraja request failed:', error.message);
    return res.status(502).json({ status: 'error', message: 'Unable to initiate payment' });
  }
}

module.exports = handler;
