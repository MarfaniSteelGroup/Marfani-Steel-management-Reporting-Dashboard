// Minimal static file server for the Marfani Steels Reporting Deck.
// Works locally (npm start) and on Render as a Web Service.
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// SPA fallback: any unknown route serves the shell so client-side hash routing works
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Marfani Steels Reporting Deck running on port ${PORT}`);
});
