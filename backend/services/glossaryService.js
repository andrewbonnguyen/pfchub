const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { logger } = require('./logger');

const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const GLOSSARY_PATH = path.join(DATA_DIR, 'glossary.json');

// ── Đọc / Ghi ─────────────────────────────────────────────────────────────────
const readGlossary = () => {
  try {
    if (!fs.existsSync(GLOSSARY_PATH))
      return { entries: [], updatedAt: new Date().toISOString(), version: 1 };
    return JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf8'));
  } catch (e) {
    logger.error('Failed to read glossary', { error: e.message });
    return { entries: [], updatedAt: new Date().toISOString(), version: 1 };
  }
};

const writeGlossary = (data) => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  data.updatedAt = new Date().toISOString();
  data.version   = (data.version || 0) + 1;
  fs.writeFileSync(GLOSSARY_PATH, JSON.stringify(data, null, 2), 'utf8');
  logger.info(`Glossary saved: ${data.entries.length} entries, v${data.version}`);
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const hasChinese = (text) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
const hasEnglish = (text) => /[a-zA-Z]/.test(text);

// ── Trích xuất cặp thuật ngữ EN/ZH từ nội dung cell ──────────────────────────
const extractTermsFromCell = (cellValue) => {
  if (!cellValue || typeof cellValue !== 'string') return [];
  const text  = cellValue.trim();
  if (!text) return [];

  const terms = [];
  const seen  = new Set();

  const patterns = [
    // EN / ZH
    [/([A-Za-z][A-Za-z\s\-\/\(\)0-9]{1,60}?)\s*[\/\|]\s*([\u4e00-\u9fff][\u4e00-\u9fff\s\,\、\。]{0,40})/g, 'en-zh'],
    // ZH / EN
    [/([\u4e00-\u9fff][\u4e00-\u9fff\s\,\、\。]{0,40}?)\s*[\/\|]\s*([A-Za-z][A-Za-z\s\-\/\(\)0-9]{1,60})/g, 'zh-en'],
    // EN (ZH)
    [/([A-Za-z][A-Za-z\s\-0-9]{1,60}?)\s*[\(\（]([\u4e00-\u9fff][^\)\）]{0,40})[\)\）]/g, 'en-zh'],
    // ZH（EN）
    [/([\u4e00-\u9fff][^\(\（]{0,40}?)\s*[\(\（]([A-Za-z][A-Za-z\s\-0-9]{1,60})[\)\）]/g, 'zh-en']
  ];

  patterns.forEach(([pattern, order]) => {
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const a  = m[1].trim();
      const b  = m[2].trim();
      if (a.length < 2 || b.length < 1) continue;
      const en  = order === 'en-zh' ? a : b;
      const zh  = order === 'en-zh' ? b : a;
      const key = `${en.toLowerCase()}|${zh}`;
      if (!seen.has(key)) { seen.add(key); terms.push({ en, zh }); }
    }
  });

  return terms;
};

// ── Build glossary từ file đã dịch ────────────────────────────────────────────
const buildFromTranslatedExcel = async (entries) => {
  const glossary = readGlossary();
  let added = 0, updated = 0;

  for (const entry of entries) {
    if (!entry.source || !entry.translated) continue;
    const existing = glossary.entries.find(e =>
      (e.en && e.en.toLowerCase() === entry.source.toLowerCase()) ||
      (e.zh && e.zh === entry.source)
    );
    if (existing) {
      if (existing.vi !== entry.translated) {
        existing.vi        = entry.translated;
        existing.updatedAt = new Date().toISOString();
        updated++;
      }
    } else {
      glossary.entries.push({
        id:        crypto.randomUUID(),
        en:        hasEnglish(entry.source) && !hasChinese(entry.source) ? entry.source : '',
        zh:        hasChinese(entry.source) ? entry.source : '',
        vi:        entry.translated,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source:    'imported'
      });
      added++;
    }
  }

  writeGlossary(glossary);
  logger.info(`Glossary import: +${added} new, ${updated} updated`);
  return { added, updated, total: glossary.entries.length };
};

// ── Tra cứu từ ────────────────────────────────────────────────────────────────
const lookupTerm = (text, targetLang = 'vi') => {
  if (!text) return null;
  const glossary   = readGlossary();
  const normalized = text.trim().toLowerCase();
  return glossary.entries.find(e => {
    const enMatch = e.en && e.en.toLowerCase() === normalized;
    const zhMatch = e.zh && e.zh === text.trim();
    return (enMatch || zhMatch) && e[targetLang];
  }) || null;
};

const getStats = () => {
  const g = readGlossary();
  return {
    total:     g.entries.length,
    withVi:    g.entries.filter(e => e.vi).length,
    bilingual: g.entries.filter(e => e.en && e.zh).length,
    version:   g.version,
    updatedAt: g.updatedAt
  };
};

module.exports = {
  readGlossary, writeGlossary,
  buildFromTranslatedExcel,
  extractTermsFromCell,
  lookupTerm, getStats,
  hasChinese, hasEnglish
};
