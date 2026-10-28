export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { phone, fullName } = req.body; // e.g., "254712345678"

    try {
      // 1. Generate Access Token
      const authResponse = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?consumer_key=YOUR_CONSUMER_KEY&consumer_secret=YOUR_CONSUMER_SECRET", {
        method: "GET"
      });
      const authData = await authResponse.json();
      const accessToken = authData.access_token;

      // 2. Prepare STK Push Payload
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      const password = Buffer.from(`${process.env.B2C_LICENSE_KEY || 'your_license_key'}${timestamp}`).toString('base64'); 
      // Note: For Sandbox, use B2C License Key or Business Shortcode + Passkey as per Safaricom docs
      
      // Actually, for STK Push (Lipa Na M-Pesa Online), we use Business Shortcode (e.g., 174379) and Passkey
      // Let's use the standard Sandbox credentials:
      const shortCode = "174379"; 
      const passKey = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c73305c349e35d0cb0cccba9d079ee"; 

      const stkPassword = Buffer.from(`${shortCode}${passKey}${timestamp}`).toString('base64');

      const response = await fetch("https://sandbox.safaricom.co.mp/stkpush/v1/processrequest", {
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
          Amount: 50, // KES 50
          PartyA: phone, // The customer's number
          PartyB: shortCode,
          PhoneNumber: phone,
          CallBackURL: "https://your-vercel-url.com/api/callback", // Must be HTTPS
          AccountReference: "Grant Payment",
          TransactionDesc: "Payment for Grant"
        })
      });

      const data = await response.json();
      
      if (data.ErrorCode === "Success") {
        res.status(200).json({ status: 'success', message: 'STK Push sent' });
      } else {
        res.status(500).json({ status: 'error', message: data.errorMessage || 'Failed' });
      }

    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}