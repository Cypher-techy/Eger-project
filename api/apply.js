const { createClient } = require('@supabase/supabase-js');

module.exports = async function apply(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }
  const { fullName, regNumber, phone } = req.body || {};
  if (typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 200 ||
      typeof regNumber !== 'string' || !/^[A-Za-z]\d{2}\/\d+\/\d{2}$/.test(regNumber.trim()) || regNumber.length > 100 ||
      typeof phone !== 'string' || !/^(?:\+254|254|0)[17]\d{8}$/.test(phone.trim().replace(/[\s()-]/g, ''))) {
    return res.status(400).json({ status: 'error', message: 'Enter a valid name, registration number and Kenyan phone number.' });
  }
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!url || !key) return res.status(503).json({ status: 'error', message: 'Application storage is not configured.' });
  try {
    const { error } = await createClient(url, key).from('applications').insert({
      full_name: fullName.trim(), reg_number: regNumber.trim(), phone: phone.trim()
    });
    if (error) throw error;
    return res.status(201).json({ status: 'success', message: 'Application submitted for review.' });
  } catch (error) {
    console.error('Failed to save application:', error.message);
    return res.status(500).json({ status: 'error', message: 'Unable to save your application. Please try again.' });
  }
};
