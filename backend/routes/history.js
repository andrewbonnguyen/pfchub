const express = require('express');
const router  = express.Router();
const { readHistory } = require('../services/historyService');

// GET /api/history
router.get('/', (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const history = readHistory();
  const total   = history.records.length;
  const start   = (parseInt(page) - 1) * parseInt(limit);
  res.json({
    records: history.records.slice(start, start + parseInt(limit)),
    total,
    page: parseInt(page)
  });
});

module.exports = router;
