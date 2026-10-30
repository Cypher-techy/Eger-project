// Only public Supabase project configuration is exposed to the browser.
module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Method not allowed' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  try {
    const parsed = new URL(url);
    let publicKey = key && key.startsWith('sb_publishable_');
    if (key && key.split('.').length === 3) {
      try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch (_) { publicKey = false; }
    }
    if (!publicKey) throw new Error('A public anon key is required');
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co') || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || !key) throw new Error('Invalid configuration');
  } catch (_) {
    return res.status(503).json({ message: 'KaziLeo authentication is not configured.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ url: url.replace(/\/$/, ''), anonKey: key });
};
