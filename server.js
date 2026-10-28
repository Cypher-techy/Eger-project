require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Helper: Get OAuth Token
async function getOAuthToken() {
    const auth = Buffer.from(`${process.env.DARAJA_CONSUMER_KEY}:${process.env.DARAJA_CONSUMER_SECRET}`).toString('base64');
    try {
        const res = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?consumer_key=' + process.env.DARAJA_CONSUMER_KEY, {
            headers: { Authorization: `Basic ${auth}` }
        });
        return res.data.access_token;
    } catch (err) {
        console.error("OAuth Error:", err.response?.data || err.message);
        throw new Error("Failed to authenticate with Safaricom");
    }
}

// Endpoint: Submit Application & Trigger STK Push
app.post('/api/apply', async (req, res) => {
    const { fullName, regNumber, email, phone } = req.body;

    try {
        // 1. Save to Supabase
        const { data, error } = await supabase
            .from('applications')
            .insert([{ full_name: fullName, reg_number: regNumber, email, phone }])
            .select();

        if (error) throw new Error("Database error");

        // 2. Initiate STK Push
        const token = await getOAuthToken();
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '');
        const password = Buffer.from(`${process.env.DARAJA_SHORTCODE}${process.env.DARAJA_PASSKEY}${timestamp}`).toString('base64');

        const stkPayload = {
            BusinessShortCode: process.env.DARAJA_SHORTCODE,
            Password: password,
            Timestamp: timestamp.replace(/\s/g, '').replace(':', ''), 
            TransactionType: "CustomerBuyGoodsOnline",
            Amount: 10, // Small fee
            PartyA: phone,
            PartyB: process.env.DARAJA_SHORTCODE,
            PhoneNumber: phone,
            CallBackURL: `${process.env.BASE_URL || 'http://localhost:3000'}/api/callback`,
            AccountReference: "Relief Grant",
            TransactionDesc: "Processing Fee"
        };

        const stkRes = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', stkPayload, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if(stkRes.data.ResponseCode !== "0") {
            throw new Error("STK Push failed");
        }

        res.json({ status: 'success', transactionId: stkRes.data.CheckoutRequestID });

    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Endpoint: Callback from Safaricom
app.post('/api/callback', async (req, res) => {
    const callback = req.body.Body.stkCallback;
    const checkoutReqId = callback.CheckoutRequestID;
    const result = callback.Result;
    
    // Update Supabase based on result
    if(result && result.ResultCode === 0) {
        // Payment Successful
        // You can find the record by CheckoutRequestID if you stored it, 
        // or just mark as paid. For simplicity, we assume success.
        console.log("Payment Success for", checkoutReqId);
        // Here you would update the DB record status to 'paid'
    } else {
        console.log("Payment Failed", result);
    }

    res.send("OK");
});

// Endpoint: Check Status (for frontend polling)
app.get('/api/status/:checkoutId', async (req, res) => {
    // In a real app, query Supabase here using the checkoutId
    // For now, simulate success after a few polls
    res.json({ paid: Math.random() > 0.5 }); // Mock logic
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));