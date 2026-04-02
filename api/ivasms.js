const express = require('express');
const { fetchToken, getNumbers, getSMS } = require('../utils/ivasms-core');

const router = express.Router();

// Main endpoint
router.get('/', async (req, res) => {
  const { type } = req.query;
  
  if (!type) {
    return res.json({ 
      error: "Use ?type=numbers or ?type=sms",
      example: "/api/ivasms?type=numbers"
    });
  }

  try {
    const token = await fetchToken();
    
    if (!token) {
      return res.status(401).json({
        error: "Session expired",
        fix: "Update XSRF_TOKEN and IVAS_SESSION environment variables"
      });
    }

    if (type === "numbers") {
      const numbers = await getNumbers(token);
      return res.json(numbers);
    }
    
    if (type === "sms") {
      const sms = await getSMS(token);
      return res.json(sms);
    }

    res.json({ error: "Invalid type. Use numbers or sms" });

  } catch (err) {
    if (err.message === "SESSION_EXPIRED") {
      return res.status(401).json({
        error: "Session expired",
        message: "Update your cookies in environment variables"
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// Status check
router.get('/status', async (req, res) => {
  try {
    const token = await fetchToken();
    res.json({
      status: token ? "active" : "expired",
      timestamp: new Date().toISOString(),
      hasToken: !!token
    });
  } catch (e) {
    res.json({ status: "error", error: e.message });
  }
});

module.exports = router;
