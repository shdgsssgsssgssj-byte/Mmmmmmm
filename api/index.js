const express = require('express');
const ivasmsRouter = require('./ivasms');

const app = express();
app.use(express.json());
app.use('/api/ivasms', ivasmsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = app;
