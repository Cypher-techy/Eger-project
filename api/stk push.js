export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { phone } = req.body;

    // SANDBOX CREDENTIALS (Safe for testing)
    const consumerKey = "YOUR_CONSUMER_KEY_HERE"; // Replace with your actual key from Safaricom Dev Portal
    const consumerSecret = "YOUR_CONSUMER_SECRET_HERE"; // Replace with your actual secret
    
    // If you haven't generated keys yet, use these generic sandbox ones for testing:
    // Note: For production, you MUST use your own keys.
    
    try {
      // 1. Get Access Token
      const authRes = await fetch(`https://sandbox.safaricom.co.ke/oauth/v1/generate?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`);
      const authData = await authRes.json();
      const token = authData.access_token;

      // 2. Prepare STK Push Data
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      
      // Sandbox Business Shortcode & Passkey
      const shortCode = "174379"; 
      const passKey = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c73305c349e35d0cb0cccba9d079ee";
      
      const password = Buffer.from(`${shortCode}${passKey}${timestamp}`).toString('base64');

      // 3. Send Request to Safaricom
      const stkResponse = await fetch("https://sandbox.safaricom.co.ke/stkpush/v1/processrequest", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          BusinessShortCode: shortCode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: 50,
          PartyA: phone, // Customer number
          PartyB: shortCode,
          PhoneNumber: phone,
          CallBackURL: "https://egerton-grant.vercel.app/api/callback", // Your callback URL
          AccountReference: "Grant Payment",
          TransactionDesc: "Grant Disbursement"
        })
      });

      const stkData = await stkResponse.json();

      if (stkData.StatusCode === 0) {
        res.status(200).json({ success: true, message: "STK Push sent. Check your phone." });
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
