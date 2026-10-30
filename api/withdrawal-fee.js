const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
// This endpoint is separate from the existing KES 50 STK request.
function timestamp() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${v.year}${v.month}${v.day}${v.hour}${v.minute}${v.second}`;
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ message: 'Method not allowed' }); }
  const raw = typeof req.body?.phone === 'string' ? req.body.phone.trim().replace(/[\s()-]/g, '').replace(/^\+/, '').replace(/^0/, '254') : '';
  if (!/^254[17]\d{8}$/.test(raw)) return res.status(400).json({ message: 'Enter a valid Kenyan mobile number.' });
  const amount = req.body?.withdrawalAmount;
  if (!Number.isSafeInteger(amount) || amount < 1200) return res.status(400).json({ message: 'Enter a withdrawal amount of at least KES 1,200.' });
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!bearer) return res.status(401).json({ message: 'Please sign in.' });
  const e = process.env, url = e.SUPABASE_URL, serviceKey = e.SUPABASE_SERVICE_ROLE_KEY;
  const key = e.MPESA_CONSUMER_KEY ?? e.DARAJA_CONSUMER_KEY, secret = e.MPESA_CONSUMER_SECRET ?? e.DARAJA_CONSUMER_SECRET;
  const shortCode = e.MPESA_SHORTCODE ?? e.DARAJA_SHORTCODE, passKey = e.MPESA_PASSKEY ?? e.DARAJA_PASSKEY;
  const env = e.MPESA_ENVIRONMENT ?? e.DARAJA_ENVIRONMENT ?? 'sandbox', enabled = e.MPESA_ENABLED ?? 'true';
  const type = e.MPESA_TRANSACTION_TYPE ?? 'CustomerPayBillOnline', partyB = e.MPESA_PARTY_B ?? (type === 'CustomerPayBillOnline' ? shortCode : undefined);
  let validCallback = false;
  try { const u = new URL(e.MPESA_CALLBACK_URL); validCallback = u.protocol === 'https:' && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname); } catch (_) {}
  if (!url || !serviceKey || !key || !secret || !shortCode || !passKey || !partyB || !validCallback || !['sandbox', 'production'].includes(env) || !['CustomerPayBillOnline', 'CustomerBuyGoodsOnline'].includes(type) || enabled !== 'true') return res.status(503).json({ message: 'Payment service is not configured or is disabled.' });
  const base = env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  let db, id;
  try {
    db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await db.auth.getUser(bearer[1]);
    if (authError || !auth.user) return res.status(401).json({ message: 'Please sign in again.' });
    const { data: wallet, error: walletError } = await db.from('kazileo_wallets').select('available_kes').eq('user_id', auth.user.id).maybeSingle();
    if (walletError) return res.status(503).json({ message: 'Could not check the balance.' });
    if (!wallet || Number(wallet.available_kes) < amount) return res.status(400).json({ message: 'Insufficient available balance for this withdrawal.' });
    const { data: open, error: openError } = await db.from('kazileo_withdrawals').select('id').eq('user_id', auth.user.id).in('status', ['pending', 'paying']).limit(1);
    if (openError) return res.status(503).json({ message: 'Could not check existing withdrawals.' });
    if (open.length) return res.status(409).json({ message: 'A withdrawal is already pending.' });
    id = randomUUID();
    const { error } = await db.from('kazileo_withdrawal_fees').insert({ id, user_id: auth.user.id, phone: raw, amount_kes: 50, withdrawal_amount_kes: amount, status: 'initiating' });
    if (error) {
      if (error.code === '23505') return res.status(409).json({ message: 'A withdrawal fee is already pending or verified. Do not pay again; check your status.' });
      console.error('Unable to reserve withdrawal fee:', error.code);
      return res.status(503).json({ message: 'Unable to prepare payment. Please contact support.' });
    }
    let started = false;
    try {
      const oauth = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` }, signal: AbortSignal.timeout(15000) });
      const authData = await oauth.json();
      if (!oauth.ok || !authData.access_token) throw new Error('Daraja authentication failed');
      const time = timestamp();
      started = true;
      const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, { method: 'POST', headers: { Authorization: `Bearer ${authData.access_token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ BusinessShortCode: shortCode, Password: Buffer.from(`${shortCode}${passKey}${time}`).toString('base64'), Timestamp: time, TransactionType: type, Amount: 50, PartyA: raw, PartyB: partyB, PhoneNumber: raw, CallBackURL: e.MPESA_CALLBACK_URL, AccountReference: 'Withdrawal', TransactionDesc: 'Withdrawal fee' }) });
      const data = await response.json();
      if (response.ok && String(data.ResponseCode) === '0' && data.CheckoutRequestID) {
        const { error: saveError } = await db.from('kazileo_withdrawal_fees').update({ status: 'pending', checkout_request_id: data.CheckoutRequestID, merchant_request_id: data.MerchantRequestID || null }).eq('id', id);
        if (saveError) throw new Error('Could not record checkout request');
        return res.status(200).json({ status: 'pending', checkoutRequestId: data.CheckoutRequestID, message: 'Prompt requested. Payment must be verified by an administrator before you can submit the withdrawal request.' });
      }
      // A valid Daraja rejection is definitive; a timeout or malformed response is not.
      if (data.errorCode || (data.ResponseCode != null && String(data.ResponseCode) !== '0')) {
        const { error: updateError } = await db.from('kazileo_withdrawal_fees').update({ status: 'failed' }).eq('id', id);
        if (updateError) throw new Error('Could not record rejection');
        return res.status(502).json({ message: 'M-Pesa declined the request. No withdrawal was created.' });
      }
      throw new Error('Unexpected Daraja response');
    } catch (error) {
      console.error('Withdrawal fee request failed:', error.message);
      if (!started) {
        const { error: updateError } = await db.from('kazileo_withdrawal_fees').update({ status: 'failed' }).eq('id', id);
        if (updateError) return res.status(503).json({ message: 'Payment status needs review. Do not retry; contact support.' });
        return res.status(502).json({ message: 'Could not contact the payment service. No prompt was sent.' });
      }
      return res.status(502).json({ message: 'Payment status is uncertain. Check your phone and contact support; do not retry until reviewed.' });
    }
  } catch (error) {
    console.error('Withdrawal fee service error:', error.message);
    return res.status(503).json({ message: 'Payment service unavailable. If you received a prompt, do not retry; contact support.' });
  }
};
