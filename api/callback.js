export default async function handler(req, res) {
  if (req.method === 'POST') {
    const body = req.body;
    
    // Log the response for debugging
    console.log("M-Pesa Callback Received:", JSON.stringify(body));

    // You can now save this result to Supabase here if needed
    
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}