export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { phone } = req.body;

    // Get credentials from environment variables
    const consumerKey = process.env.DARAJA_CONSUMER_KEY;
    const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
    const shortCode = process.env.DARAJA_SHORTCODE;
    const passKey = process.env.DARAJA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    try {
      // 1. Generate Access Token
      const authRes = await fetch(`https://api.safaricom.co.ke/oauth/v1/generate?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`, {
        method: 'GET'
      });
      const authData = await authRes.json();
      const accessToken = authData.access_token;

      // 2. Prepare Timestamp & Password
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      const password = Buffer.from(`${shortCode}${passKey}${timestamp}`).toString('base64');

      // 3. Send STK Push Request
      const stkResponse = await fetch("https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          BusinessShortCode: shortCode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: 50,
          PartyA: phone,
          PartyB: shortCode,
          PhoneNumber: phone,
          CallBackURL: callbackUrl,
          AccountReference: "Grant Payment",
          TransactionDesc: "Grant Disbursement"
        })
      });

      const stkData = await stkResponse.json();

      if (stkData.StatusCode === 0) {
        res.status(200).json({ success: true, message: "STK Push sent successfully" });
      } else {
        res.status(500).json({ success: false, message: stkData.errorMessage || "Failed to send STK" });
      }

    } catch (error) {
      res.status(500).json({ success: false, message: "Server Error: " + error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
