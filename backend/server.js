require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { logger } = require('./services/logger');
const { requestLogger } = require('./middleware/requestLogger');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Tạo thư mục cần thiết (Render ephemeral FS) ───────────────────────────────
const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const LOG_DIR    = path.join(__dirname, 'logs');

[DATA_DIR, UPLOAD_DIR, OUTPUT_DIR, LOG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Khởi tạo file data nếu chưa có ───────────────────────────────────────────
const glossaryPath = path.join(DATA_DIR, 'glossary.json');
if (!fs.existsSync(glossaryPath)) {
  fs.writeFileSync(glossaryPath, JSON.stringify(
    { entries: [], updatedAt: new Date().toISOString(), version: 1 },
    null, 2
  ));
}

const historyPath = path.join(DATA_DIR, 'history.json');
if (!fs.existsSync(historyPath)) {
  fs.writeFileSync(historyPath, JSON.stringify({ records: [] }, null, 2));
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.options('*', cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestLogger);
app.use('/outputs', express.static(OUTPUT_DIR));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/glossary',  require('./routes/glossary'));
app.use('/api/translate', require('./routes/translate'));
app.use('/api/history',   require('./routes/history'));
app.use('/api/logs',      require('./routes/logs'));

app.get('/api/health', (req, res) => {
  res.json({
    status:    'ok',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || 'development',
    hasApiKey: !!process.env.ANTHROPIC_API_KEY
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Khởi động ─────────────────────────────────────────────────────────────────
// Bật garbage collection thủ công (cần flag --expose-gc)
if (global.gc) {
  setInterval(() => {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const after  = process.memoryUsage().heapUsed;
    const freed  = Math.round((before - after) / 1024 / 1024);
    if (freed > 0) logger.info(`GC: freed ${freed}MB RAM`);
  }, 60000); // chạy GC mỗi 60s
}

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`PFCHub backend running on port ${PORT}`);
  console.log(`✅ PFCHub Backend → http://localhost:${PORT}`);
  console.log(`   API Key: ${process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ MISSING – set ANTHROPIC_API_KEY'}`);
});

module.exports = app;
