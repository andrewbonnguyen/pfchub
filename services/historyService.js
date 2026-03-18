const fs   = require('fs');
const path = require('path');
const { logger } = require('./logger');

const DATA_DIR     = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const MAX_HISTORY  = 200;

const readHistory = () => {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return { records: [] };
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return { records: [] };
  }
};

const addHistoryRecord = (record) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const history = readHistory();
    history.records.unshift({
      ...record,
      id:        Date.now(),
      timestamp: new Date().toISOString()
    });
    if (history.records.length > MAX_HISTORY)
      history.records = history.records.slice(0, MAX_HISTORY);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
    logger.info(`History: ${record.action} — ${record.fileName}`);
  } catch (err) {
    logger.error('Failed to write history', { error: err.message });
  }
};

module.exports = { readHistory, addHistoryRecord };
