export default async function handler(req, res) {
  if (req.method === 'POST') {
    const body = req.body;
    
    // Log the callback to Vercel Logs for debugging
    console.log("M-Pesa Callback Received:", JSON.stringify(body));

    // Save to Supabase (Optional but recommended)
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nixccundbwwfupmprvfp.supabase.co';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_kHzxrbLQOmPAWXzZo6qJ8Q_Px3Swk1g';
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase.from('transactions').insert({
        transaction_type: body.TransactionType,
        trans_id: body.TransID,
        phone_number: body.PhoneNumber,
        amount: body.TransactionAmount,
        business_short_code: body.BusinessShortCode,
        bill_ref_number: body.BillRefNumber,
        invoice_number: body.InvoiceNumber,
        org_account_balance: body.OrgAccountBalance,
        transaction_date: new Date().toISOString(),
        party_A: body.PartyA,
        party_B: body.PartyB,
        last_updated: new Date().toISOString()
      });
    } catch (err) {
      console.error("Supabase Error:", err);
    }

    res.status(200).json({ status: 'success' });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
