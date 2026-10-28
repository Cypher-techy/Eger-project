require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.all('/api/apply', require('./api/apply'));
app.all('/api/stkpush', require('./api/stkpush'));
app.all('/api/callback', require('./api/callback'));
app.use('/api', (req, res) => res.status(404).json({ status: 'error', message: 'API endpoint not found' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, '0.0.0.0', () => console.log(`Server is running on port ${port}`));
}
module.exports = app;
