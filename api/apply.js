export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { fullName, regNumber, phone } = req.body;
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return success to the frontend
    res.status(200).json({ 
      status: 'success', 
      message: 'OTP sent',
      data: { fullName, regNumber, phone }
    });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}