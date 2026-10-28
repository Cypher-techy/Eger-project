const { createClient } = require('@supabase/supabase-js');

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }
  const callback = req.body?.Body?.stkCallback;
  if (!callback || typeof callback.CheckoutRequestID !== 'string' ||
      !callback.CheckoutRequestID || callback.ResultCode == null ||
      !Number.isInteger(Number(callback.ResultCode))) {
    return res.status(400).json({ status: 'error', message: 'Invalid STK callback' });
  }
  const metadata = Object.fromEntries((Array.isArray(callback.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : [])
    .filter(item => item && typeof item.Name === 'string').map(item => [item.Name, item.Value ?? null]));
  const record = {
    checkout_request_id: callback.CheckoutRequestID,
    merchant_request_id: callback.MerchantRequestID || null,
    result_code: Number(callback.ResultCode),
    result_description: callback.ResultDesc || null,
    amount: metadata.Amount ?? null,
    mpesa_receipt_number: metadata.MpesaReceiptNumber ?? null,
    phone_number: metadata.PhoneNumber != null ? String(metadata.PhoneNumber) : null,
    transaction_date: metadata.TransactionDate != null ? String(metadata.TransactionDate) : null
  };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Callback persistence is not configured');
    return res.status(503).json({ status: 'error', message: 'Callback persistence is not configured' });
  }
  try {
    const supabase = createClient(url, key);
    const { error } = await supabase.from('mpesa_stk_callbacks').upsert(record, { onConflict: 'checkout_request_id' });
    if (error) throw error;
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('Failed to save STK callback:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to save callback' });
  }
}

module.exports = handler;
