const express = require('express');
const router  = express.Router();
const { getLogBuffer, clearLogBuffer } = require('../services/logger');

// GET /api/logs
router.get('/', (req, res) => {
  const { level, limit = 200 } = req.query;
  let logs = getLogBuffer();
  if (level) logs = logs.filter(l => l.level === level);
  res.json({ logs: logs.slice(0, parseInt(limit)), total: logs.length });
});

// DELETE /api/logs
router.delete('/', (req, res) => {
  clearLogBuffer();
  res.json({ success: true });
});

module.exports = router;
