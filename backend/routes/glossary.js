const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const router  = express.Router();

const { readGlossary, writeGlossary, buildFromTranslatedExcel, getStats } = require('../services/glossaryService');
const { scanExcelForGlossary } = require('../services/excelService');
const { addHistoryRecord }     = require('../services/historyService');
const { logger }               = require('../services/logger');

const upload = multer({
  dest:   path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// GET /api/glossary
router.get('/', (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const glossary = readGlossary();
    let entries = glossary.entries;

    if (search) {
      const q = search.toLowerCase();
      entries = entries.filter(e =>
        (e.en && e.en.toLowerCase().includes(q)) ||
        (e.zh && e.zh.includes(search)) ||
        (e.vi && e.vi.toLowerCase().includes(q))
      );
    }

    const total    = entries.length;
    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);
    const start    = (pageNum - 1) * limitNum;

    res.json({
      entries: entries.slice(start, start + limitNum),
      total, page: pageNum, limit: limitNum,
      pages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    logger.error('GET /glossary', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/glossary/stats
router.get('/stats', (req, res) => {
  try { res.json(getStats()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/glossary/entry  — thêm mới hoặc cập nhật (nếu có id)
router.post('/entry', (req, res) => {
  try {
    const { en, zh, vi, id } = req.body;
    const glossary = readGlossary();

    if (id) {
      const idx = glossary.entries.findIndex(e => String(e.id) === String(id));
      if (idx !== -1) {
        glossary.entries[idx] = {
          ...glossary.entries[idx], en, zh, vi,
          updatedAt: new Date().toISOString()
        };
        writeGlossary(glossary);
        return res.json({ success: true, entry: glossary.entries[idx] });
      }
    }

    const newEntry = {
      id:        crypto.randomUUID(),
      en:        en || '', zh: zh || '', vi: vi || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source:    'manual'
    };
    glossary.entries.push(newEntry);
    writeGlossary(glossary);
    addHistoryRecord({ action: 'glossary_add', fileName: 'manual', details: `Added: ${en || zh}` });
    res.json({ success: true, entry: newEntry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/glossary/entry/:id
router.delete('/entry/:id', (req, res) => {
  try {
    const glossary = readGlossary();
    const before   = glossary.entries.length;
    glossary.entries = glossary.entries.filter(e => String(e.id) !== String(req.params.id));
    writeGlossary(glossary);
    res.json({ success: true, deleted: before - glossary.entries.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/glossary/scan  — quét file Excel lấy thuật ngữ
router.post('/scan', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    logger.info(`Scanning: ${req.file.originalname}`);

    const terms    = await scanExcelForGlossary(req.file.path);
    const glossary = readGlossary();
    let added = 0;

    terms.forEach(term => {
      if (!term.en && !term.zh) return;
      const exists = glossary.entries.find(e =>
        (term.en && e.en && e.en.toLowerCase() === term.en.toLowerCase()) ||
        (term.zh && e.zh && e.zh === term.zh)
      );
      if (!exists) {
        glossary.entries.push({
          id:        crypto.randomUUID(),
          en:        term.en || '', zh: term.zh || '', vi: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source:    'scanned'
        });
        added++;
      }
    });

    writeGlossary(glossary);
    addHistoryRecord({
      action:   'glossary_scan',
      fileName: req.file.originalname,
      details:  `Found ${terms.length} pairs, added ${added} new`
    });
    try { fs.unlinkSync(req.file.path); } catch {}
    res.json({ success: true, extracted: terms.length, added, total: glossary.entries.length });
  } catch (err) {
    logger.error('Scan error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/glossary/import-translated  — import file đã dịch
router.post('/import-translated', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { sourceCol = 'A', translatedCol = 'B', lang = 'vi', sheetIndex = 0 } = req.body;

    const ExcelJS = require('exceljs');
    const wb      = new ExcelJS.Workbook();
    await wb.xlsx.readFile(req.file.path);
    const sheet   = wb.worksheets[parseInt(sheetIndex)] || wb.worksheets[0];

    const entries = [];
    sheet.eachRow({ includeEmpty: false }, (row, ri) => {
      if (ri === 1) return;
      const src   = row.getCell(sourceCol).text;
      const trans = row.getCell(translatedCol).text;
      if (src && trans) entries.push({ source: src, translated: trans, lang });
    });

    const result = await buildFromTranslatedExcel(entries);
    addHistoryRecord({
      action:   'glossary_import',
      fileName: req.file.originalname,
      details:  `${entries.length} pairs, +${result.added} new, ${result.updated} updated`
    });
    try { fs.unlinkSync(req.file.path); } catch {}
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Import error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/glossary/bulk
router.put('/bulk', (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries must be array' });
    const glossary = readGlossary();
    let updated = 0;
    entries.forEach(upd => {
      const idx = glossary.entries.findIndex(e => String(e.id) === String(upd.id));
      if (idx !== -1) {
        Object.assign(glossary.entries[idx], upd, { updatedAt: new Date().toISOString() });
        updated++;
      }
    });
    writeGlossary(glossary);
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
