export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { phone, fullName } = req.body;

    // 1. Get Credentials
    const consumerKey = process.env.DARAJA_CONSUMER_KEY;
    const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
    const shortCode = process.env.DARAJA_SHORTCODE;
    const passKey = process.env.DARAJA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    // Check if vars are loaded
    if (!consumerKey || !shortCode) {
      console.error("Missing Env Vars");
      return res.status(500).json({ status: 'error', message: 'Server configuration error' });
    }

    try {
      // 2. Generate Access Token
      const authResponse = await fetch(
        `https://api.safaricom.co.ke/oauth/v1/generate?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`,
        { method: "GET" }
      );
      
      const authData = await authResponse.json();
      if (!authData.access_token) {
        throw new Error("Failed to get access token");
      }
      const accessToken = authData.access_token;

      // 3. Prepare Payload
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      const stkPassword = Buffer.from(`${shortCode}${passKey}${timestamp}`).toString('base64');

      // 4. Send STK Push
      const response = await fetch("https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          BusinessShortCode: shortCode,
          Password: stkPassword,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: 50, 
          PartyA: phone, 
          PartyB: shortCode,
          PhoneNumber: phone,
          CallBackURL: callbackUrl,
          AccountReference: "Grant Payment",
          TransactionDesc: "Payment for Grant"
        })
      });

      const data = await response.json();
      
      // If M-Pesa returns an error (e.g., Invalid Callback URL)
      if (data.StatusCode !== 0) {
        console.error("M-Pesa Error:", data.errorMessage);
        return res.status(500).json({ status: 'error', message: data.errorMessage || 'STK Push failed' });
      }

      // Success
      res.status(200).json({ status: 'success', message: 'STK Push sent', requestId: data.CheckResult?.RequestId });

    } catch (error) {
      console.error("Fetch Error:", error.message);
      res.status(500).json({ status: 'error', message: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
