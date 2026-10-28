const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CRITICAL FIX: Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// ✅ CRITICAL FIX: Send index.html for any other request (catch-all)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
