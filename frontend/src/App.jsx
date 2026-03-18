import { useState, useEffect, useRef, useCallback } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const API = (import.meta.env.VITE_API_URL || "http://localhost:3001/api").replace(/\/$/, "");

const LANGS = [
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "en", label: "English",    flag: "🇺🇸" },
  { code: "ja", label: "日本語",      flag: "🇯🇵" },
  { code: "ko", label: "한국어",      flag: "🇰🇷" },
  { code: "fr", label: "Français",   flag: "🇫🇷" },
  { code: "de", label: "Deutsch",    flag: "🇩🇪" },
];

// ─── API helper ───────────────────────────────────────────────────────────────
const api = async (url, opts = {}) => {
  const res = await fetch(`${API}${url}`, opts);
  if (!res.ok) {
    const txt = await res.text();
    let msg = txt;
    try { msg = JSON.parse(txt).error || txt; } catch {}
    throw new Error(msg);
  }
  return res.json();
};

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const PATHS = {
  translate: "M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6",
  book:      "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z",
  history:   "M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8",
  terminal:  "M4 17l6-6-6-6M12 19h8",
  upload:    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download:  "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  plus:      "M12 5v14M5 12h14",
  trash:     "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  edit:      "M11 4H4a2 2 0 0 0-2 2v16 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z",
  check:     "M20 6L9 17l-5-5",
  x:         "M18 6L6 18M6 6l12 12",
  search:    "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
  refresh:   "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  zap:       "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  file:      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  export:    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
};

const Icon = ({ name, size = 16 }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, display: "block" }}
  >
    <path d={PATHS[name] || ""} />
  </svg>
);

// ─── Toast notification ───────────────────────────────────────────────────────
const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-3), { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);
  return { toasts, toast: add };
};

const ToastContainer = ({ toasts }) => (
  <div style={{
    position: "fixed", bottom: 20, right: 20,
    zIndex: 9999, display: "flex", flexDirection: "column", gap: 8,
    pointerEvents: "none",
  }}>
    {toasts.map(t => (
      <div key={t.id} style={{
        padding: "10px 16px", borderRadius: 6, maxWidth: 380,
        fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
        pointerEvents: "all", animation: "toastSlide .2s ease",
        boxShadow: "0 8px 24px rgba(0,0,0,.6)",
        background:
          t.type === "error"   ? "#190810" :
          t.type === "success" ? "#071510" : "#090e1c",
        borderLeft: `3px solid ${
          t.type === "error"   ? "var(--red)"   :
          t.type === "success" ? "var(--green)" : "var(--accent)"
        }`,
        color:
          t.type === "error"   ? "#f08090" :
          t.type === "success" ? "#40e8a0" : "var(--text-2)",
      }}>{t.msg}</div>
    ))}
  </div>
);

// ─── Reusable components ──────────────────────────────────────────────────────

// Label chip / badge
const Badge = ({ label, value, color = "var(--accent)" }) => (
  <div style={{
    display: "inline-flex", gap: 5, alignItems: "center",
    background: `${color}14`, border: `1px solid ${color}30`,
    borderRadius: 5, padding: "3px 9px",
  }}>
    <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{label}</span>
    <span style={{ fontSize: 11, color, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{value}</span>
  </div>
);

// Button
const Btn = ({
  children, onClick, disabled = false,
  variant = "ghost",    // "ghost" | "solid" | "danger"
  color,
  size = "md",          // "sm" | "md"
  full = false,
}) => {
  const c = color || (variant === "danger" ? "var(--red)" : variant === "solid" ? "var(--accent)" : "var(--text-3)");
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: size === "sm" ? 5 : 7,
        padding: size === "sm" ? "5px 11px" : "8px 15px",
        fontSize: size === "sm" ? 12 : 13,
        fontFamily: "var(--font-ui)",
        fontWeight: 600,
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "opacity .15s, background .15s",
        whiteSpace: "nowrap",
        border: variant === "solid" ? "none" : `1px solid ${c}35`,
        background: variant === "solid" ? c : `${c}12`,
        color: variant === "solid" ? (color ? "#fff" : "#000") : c,
        width: full ? "100%" : undefined,
      }}
    >
      {children}
    </button>
  );
};

// Input / Select / Textarea
const inputBase = {
  background: "var(--bg-1)", border: "1px solid var(--border-1)",
  borderRadius: 6, color: "var(--text-1)", fontFamily: "var(--font-ui)",
  fontSize: 13, outline: "none", transition: "border-color .15s",
  width: "100%",
};

const TextInput = ({ value, onChange, placeholder, style = {} }) => (
  <input
    value={value} onChange={onChange} placeholder={placeholder}
    style={{ ...inputBase, padding: "8px 11px", ...style }}
    onFocus={e => (e.target.style.borderColor = "var(--accent)")}
    onBlur={e => (e.target.style.borderColor = "var(--border-1)")}
  />
);

const SelectInput = ({ value, onChange, children }) => (
  <select
    value={value} onChange={onChange}
    style={{
      ...inputBase, padding: "8px 32px 8px 11px", cursor: "pointer",
      appearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23445566'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center",
    }}
  >
    {children}
  </select>
);

const TextArea = ({ value, onChange, placeholder, rows = 3, mono = false }) => (
  <textarea
    value={value} onChange={onChange} placeholder={placeholder} rows={rows}
    style={{
      ...inputBase, padding: "8px 11px", resize: "vertical",
      fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)", fontSize: 12,
    }}
    onFocus={e => (e.target.style.borderColor = "var(--accent)")}
    onBlur={e => (e.target.style.borderColor = "var(--border-1)")}
  />
);

// Tab bar
const Tabs = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
    {tabs.map(([id, label]) => (
      <button key={id} onClick={() => onChange(id)} style={{
        background: active === id ? "rgba(0,200,220,.12)" : "rgba(255,255,255,.04)",
        border: `1px solid ${active === id ? "rgba(0,200,220,.35)" : "rgba(255,255,255,.08)"}`,
        borderRadius: 999, padding: "4px 14px", fontSize: 12.5, cursor: "pointer",
        color: active === id ? "var(--accent)" : "var(--text-3)",
        fontFamily: "var(--font-ui)", fontWeight: active === id ? 600 : 400,
        transition: "all .15s",
      }}>{label}</button>
    ))}
  </div>
);

// Section card
const Card = ({ children, style = {} }) => (
  <div style={{
    background: "var(--bg-2)", border: "1px solid var(--border-1)",
    borderRadius: 10, padding: 18, ...style,
  }}>{children}</div>
);

const CardTitle = ({ children }) => (
  <div style={{
    fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-3)",
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 12,
  }}>{children}</div>
);

// Progress bar
const ProgressBar = ({ pct, accent = "var(--accent)" }) => (
  <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 999, height: 5, overflow: "hidden" }}>
    <div style={{
      width: `${Math.min(100, pct || 0)}%`, height: "100%",
      background: accent, borderRadius: 999,
      transition: "width .5s ease",
      boxShadow: `0 0 8px ${accent}80`,
    }} />
  </div>
);

// Stat row
const StatLine = ({ label, value, color = "var(--text-2)" }) => (
  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 12 }}>
    <span style={{ color: "var(--text-3)" }}>{label}</span>
    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color }}>{value}</span>
  </div>
);

// Source color map
const SRC_COLOR = {
  manual:   "var(--purple)",
  scanned:  "var(--yellow)",
  imported: "var(--accent)",
};

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: TRANSLATE
// ═════════════════════════════════════════════════════════════════════════════
const TranslatePage = ({ toast }) => {
  const [file, setFile]       = useState(null);
  const [lang, setLang]       = useState("vi");
  const [jobId, setJobId]     = useState(null);
  const [progress, setProgress] = useState(null);
  const [done, setDone]       = useState(null);
  const [dragging, setDragging] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testBusy, setTestBusy] = useState(false);
  const [cacheStats, setCacheStats] = useState(null);
  const fileInputRef = useRef(null);
  const esRef        = useRef(null);

  useEffect(() => {
    api("/translate/cache-stats").then(setCacheStats).catch(() => {});
  }, []);

  // SSE for real-time progress
  useEffect(() => {
    if (!jobId) return;
    esRef.current?.close();
    const es = new EventSource(`${API}/translate/progress/${jobId}`);
    esRef.current = es;

    es.onmessage = ({ data }) => {
      try {
        const d = JSON.parse(data);
        if (d.type === "progress") setProgress(d);
        if (d.type === "done") {
          setDone(d);
          setProgress({ ...d, percent: 100, phase: "done" });
          es.close();
          toast(`✅ Dịch xong! ${d.translated} cells · ${d.geminiCalls || 0} Gemini calls`, "success");
          api("/translate/cache-stats").then(setCacheStats).catch(() => {});
        }
        if (d.type === "error") {
          toast("❌ " + d.error, "error");
          es.close();
          setJobId(null);
          setProgress(null);
        }
      } catch {}
    };
    es.onerror = () => {};
    return () => es.close();
  }, [jobId]);

  const handleFileDrop = (f) => {
    if (!f) return;
    if (!f.name.match(/\.xlsx?$/i)) { toast("Chỉ hỗ trợ .xlsx / .xls", "error"); return; }
    setFile(f); setDone(null); setProgress(null);
  };

  const startTranslation = async () => {
    if (!file) return toast("Vui lòng chọn file", "error");
    setProgress({ phase: "init", percent: 0, translated: 0, total: 0, geminiCalls: 0 });
    setDone(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("targetLang", lang);
    try {
      const { jobId: id } = await api("/translate/start", { method: "POST", body: fd });
      setJobId(id);
      toast("🚀 Đã bắt đầu dịch...", "info");
    } catch (e) {
      toast(e.message, "error");
      setProgress(null);
    }
  };

  const runTestTranslate = async () => {
    if (!testInput.trim()) return;
    setTestBusy(true); setTestResult(null);
    try {
      const r = await api("/translate/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testInput, targetLang: lang }),
      });
      setTestResult(r);
    } catch (e) { toast(e.message, "error"); }
    setTestBusy(false);
  };

  const busy = progress?.phase === "translating" && !done;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 className="page-title">Dịch File Excel</h1>
        <p className="page-desc">Upload file EN / ZH → dịch sang ngôn ngữ đích, giữ nguyên định dạng ô</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 290px", gap: 18, alignItems: "start" }}>
        {/* ── LEFT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Drop zone */}
          <div
            className={`dropzone${dragging ? " drop-active" : ""}${file ? " drop-has-file" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFileDrop(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current.click()}
          >
            <input
              ref={fileInputRef} type="file" accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={e => handleFileDrop(e.target.files[0])}
            />
            <div style={{ fontSize: 34, marginBottom: 8 }}>{file ? "📊" : "📂"}</div>
            {file ? (
              <>
                <div style={{ color: "var(--green)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 12 }}>{file.name}</div>
                <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 3 }}>{(file.size / 1024).toFixed(1)} KB · sẵn sàng dịch</div>
              </>
            ) : (
              <>
                <div style={{ color: "var(--text-1)", fontWeight: 500 }}>Kéo thả file Excel vào đây</div>
                <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 3 }}>hoặc click để chọn · .xlsx / .xls</div>
              </>
            )}
          </div>

          {/* Language + Start button */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div className="field-label">NGÔN NGỮ ĐÍCH</div>
              <SelectInput value={lang} onChange={e => setLang(e.target.value)}>
                {LANGS.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
              </SelectInput>
            </div>
            <Btn variant="solid" color="var(--accent)" onClick={startTranslation} disabled={!file || busy}>
              {busy
                ? <><span className="spin-icon">⟳</span> Đang dịch…</>
                : <><Icon name="zap" /> Bắt Đầu Dịch</>
              }
            </Btn>
          </div>

          {/* Progress card */}
          {progress && (
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                  {progress.phase === "done"       ? "✅ Hoàn thành" :
                   progress.phase === "reading"    ? "📖 Đọc file…"  :
                   progress.phase === "init"       ? "⏳ Chuẩn bị…"  :
                                                     "⚙️ Đang dịch…"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 700, fontSize: 14 }}>
                  {progress.percent || 0}%
                </span>
              </div>
              <ProgressBar pct={progress.percent} />
              {progress.total > 0 && (
                <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
                  {[
                    ["Đã dịch",     progress.translated || 0, "var(--text-1)"],
                    ["Tổng cells",  progress.total || 0,       "var(--text-3)"],
                    ["Gemini calls", progress.geminiCalls || 0, "var(--accent)"],
                    ...(progress.errors > 0 ? [["Lỗi", progress.errors, "var(--red)"]] : []),
                  ].map(([lb, v, c]) => (
                    <div key={lb}>
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18, color: c, lineHeight: 1 }}>{v}</div>
                      <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3, textTransform: "uppercase", letterSpacing: .5 }}>{lb}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Download link */}
          {done?.outputFile && (
            <a
              href={`${API}/translate/download/${done.outputFile}`}
              download
              className="download-banner"
            >
              <Icon name="download" size={20} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Tải File Đã Dịch</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginTop: 2, opacity: .65 }}>{done.outputFile}</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 18, opacity: .5 }}>→</span>
            </a>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Quick test */}
          <Card>
            <CardTitle>⚡ Kiểm Tra Nhanh</CardTitle>
            <TextArea
              value={testInput}
              onChange={e => setTestInput(e.target.value)}
              placeholder="Nhập EN / ZH để dịch thử..."
              mono
            />
            <div style={{ marginTop: 8 }}>
              <Btn full onClick={runTestTranslate} disabled={testBusy || !testInput.trim()}>
                {testBusy ? "Đang dịch…" : "▶  Dịch thử"}
              </Btn>
            </div>
            {testResult && (
              <div style={{
                marginTop: 10, padding: "10px 12px",
                background: "rgba(0,0,0,.3)", borderRadius: 6,
                borderLeft: "2px solid var(--accent)",
              }}>
                <div style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600, lineHeight: 1.6, wordBreak: "break-word" }}>
                  {testResult.translated}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
                  {testResult.fromGlossary
                    ? `📚 Glossary (${testResult.matchType})`
                    : testResult.fromCache
                      ? "⚡ Cache"
                      : "🤖 Gemini API"}
                </div>
              </div>
            )}
          </Card>

          {/* Cache stats */}
          {cacheStats && (
            <Card>
              <CardTitle>💾 Trạng Thái Cache</CardTitle>
              <StatLine label="Session (RAM)" value={`${cacheStats.session?.keys || 0} / ${cacheStats.session?.maxKeys || 500}`} color="var(--accent)" />
              <StatLine label="File cache"   value={`${cacheStats.file?.keys || 0} entries`}                                    color="var(--green)" />
              <StatLine label="Glossary idx" value={`${cacheStats.glossary?.keys || 0} keys`}                                   color="var(--yellow)" />
            </Card>
          )}

          {/* Efficiency tip */}
          <div style={{
            background: "rgba(255,200,40,.04)", border: "1px solid rgba(255,200,40,.14)",
            borderRadius: 8, padding: 14,
          }}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--yellow)", marginBottom: 5 }}>
              💡 Tối ưu quota
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.65 }}>
              Import file đã dịch mẫu vào <strong style={{ color: "var(--text-2)" }}>Từ Điển</strong> để tăng Glossary hits, giảm lượng Gemini API calls.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: GLOSSARY
// ═════════════════════════════════════════════════════════════════════════════
const GlossaryPage = ({ toast }) => {
  const [entries, setEntries] = useState([]);
  const [stats,   setStats]   = useState(null);
  const [search,  setSearch]  = useState("");
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState("list");
  const [editRow, setEditRow] = useState(null);   // { id, en, zh, vi }
  const [addOpen, setAddOpen] = useState(false);
  const [newRow,  setNewRow]  = useState({ en: "", zh: "", vi: "" });
  // Scan tab
  const [scanFile, setScanFile] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  // Import tab
  const [impFile, setImpFile] = useState(null);
  const [impBusy, setImpBusy] = useState(false);
  const [impCols, setImpCols] = useState({ src: "A", tgt: "B" });

  const scanRef = useRef(null);
  const impRef  = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [g, s] = await Promise.all([
        api(`/glossary?page=${page}&limit=50&search=${encodeURIComponent(search)}`),
        api("/glossary/stats"),
      ]);
      setEntries(g.entries); setPages(g.pages); setTotal(g.total); setStats(s);
    } catch (e) { toast(e.message, "error"); }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [search]);

  const handleSaveEdit = async () => {
    try {
      await api("/glossary/entry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editRow),
      });
      toast("✅ Đã lưu", "success"); setEditRow(null); loadData();
    } catch (e) { toast(e.message, "error"); }
  };

  const handleAddEntry = async () => {
    if (!newRow.en && !newRow.zh) return toast("Nhập EN hoặc ZH", "error");
    try {
      await api("/glossary/entry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRow),
      });
      toast("✅ Đã thêm", "success"); setNewRow({ en: "", zh: "", vi: "" }); setAddOpen(false); loadData();
    } catch (e) { toast(e.message, "error"); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Xóa từ này?")) return;
    try { await api(`/glossary/entry/${id}`, { method: "DELETE" }); toast("Đã xóa", "success"); loadData(); }
    catch (e) { toast(e.message, "error"); }
  };

  const handleScan = async () => {
    if (!scanFile) return;
    setScanBusy(true);
    const fd = new FormData(); fd.append("file", scanFile);
    try {
      const r = await api("/glossary/scan", { method: "POST", body: fd });
      toast(`✅ Quét xong: +${r.added} từ mới (${r.extracted} cặp tìm thấy)`, "success");
      setScanFile(null); loadData();
    } catch (e) { toast(e.message, "error"); }
    setScanBusy(false);
  };

  const handleImport = async () => {
    if (!impFile) return;
    setImpBusy(true);
    const fd = new FormData();
    fd.append("file", impFile); fd.append("sourceCol", impCols.src);
    fd.append("translatedCol", impCols.tgt); fd.append("lang", "vi");
    try {
      const r = await api("/glossary/import-translated", { method: "POST", body: fd });
      toast(`✅ Import: +${r.added} mới, ${r.updated} cập nhật`, "success");
      setImpFile(null); loadData();
    } catch (e) { toast(e.message, "error"); }
    setImpBusy(false);
  };

  const exportCSV = async () => {
    try {
      const g = await api("/glossary?page=1&limit=999999");
      const rows = [
        ["EN", "ZH", "VI", "Nguồn", "Ngày tạo"],
        ...g.entries.map(e => [e.en, e.zh, e.vi, e.source, e.createdAt?.slice(0, 10) || ""]),
      ];
      const csv = rows.map(r => r.map(c => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
      a.download = `pfchub_glossary_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      toast("✅ Đã xuất CSV", "success");
    } catch (e) { toast(e.message, "error"); }
  };

  // Inline cell input
  const CellInput = ({ value, onChange, highlight }) => (
    <input
      value={value} onChange={onChange}
      style={{
        width: "100%", background: "var(--bg-1)",
        border: `1px solid ${highlight ? "rgba(0,214,140,.4)" : "var(--border-2)"}`,
        borderRadius: 5, padding: "5px 8px",
        color: "var(--text-1)", fontFamily: "var(--font-mono)", fontSize: 12,
        outline: "none",
      }}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 className="page-title">Từ Điển Glossary</h1>
          {stats && (
            <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
              <Badge label="Tổng"      value={stats.total}     color="var(--text-3)" />
              <Badge label="Có VI"     value={stats.withVi}    color="var(--green)"  />
              <Badge label="Song ngữ" value={stats.bilingual} color="var(--accent)" />
              <Badge label="v"         value={stats.version}   color="var(--purple)" />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn size="sm" onClick={exportCSV}><Icon name="export" /> Xuất CSV</Btn>
          <Btn size="sm" variant="solid" color="var(--purple)" onClick={() => setAddOpen(o => !o)}>
            <Icon name="plus" /> Thêm từ
          </Btn>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[["list", "📋 Danh Sách"], ["scan", "🔍 Quét File"], ["import", "📥 Import"]]}
        active={tab}
        onChange={setTab}
      />

      {/* Add form */}
      {addOpen && (
        <div style={{
          background: "rgba(140,80,255,.06)", border: "1px solid rgba(140,80,255,.2)",
          borderRadius: 8, padding: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#b080ff", marginBottom: 12 }}>Thêm Từ Mới</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[["English", "en"], ["中文", "zh"], ["Tiếng Việt", "vi"]].map(([label, key]) => (
              <div key={key}>
                <div className="field-label">{label}</div>
                <TextInput
                  value={newRow[key]}
                  onChange={e => setNewRow(p => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn variant="solid" color="var(--green)" onClick={handleAddEntry}><Icon name="check" /> Thêm</Btn>
            <Btn onClick={() => setAddOpen(false)}><Icon name="x" /> Hủy</Btn>
          </div>
        </div>
      )}

      {/* ── LIST TAB ── */}
      {tab === "list" && (
        <>
          {/* Search bar */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
              <span style={{ position: "absolute", left: 11, color: "var(--text-3)", display: "flex" }}>
                <Icon name="search" size={14} />
              </span>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tìm EN · ZH · VI…"
                style={{
                  ...inputBase, padding: "8px 32px 8px 34px",
                }}
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border-1)")}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{
                  position: "absolute", right: 10, background: "none", border: "none",
                  cursor: "pointer", color: "var(--text-3)", display: "flex",
                }}>
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
              {total} từ
            </span>
          </div>

          {/* Table */}
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,.3)" }}>
                  {["English", "中文", "Tiếng Việt", "Nguồn", ""].map((h, i) => (
                    <th key={i} style={{
                      padding: "9px 13px", textAlign: "left",
                      fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-3)",
                      textTransform: "uppercase", letterSpacing: .7, fontWeight: 500,
                      borderBottom: "1px solid var(--border-1)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>⏳ Đang tải…</td></tr>
                  : entries.length === 0
                    ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>Không có dữ liệu</td></tr>
                    : entries.map(e => (
                      <tr key={e.id} style={{ borderBottom: "1px solid rgba(25,30,48,.7)" }}
                        onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(255,255,255,.018)")}
                        onMouseLeave={ev => (ev.currentTarget.style.background = "")}
                      >
                        {editRow?.id === e.id ? (
                          <>
                            {["en", "zh", "vi"].map(k => (
                              <td key={k} style={{ padding: "6px 10px" }}>
                                <CellInput
                                  value={editRow[k]}
                                  onChange={ev => setEditRow(r => ({ ...r, [k]: ev.target.value }))}
                                  highlight={k === "vi"}
                                />
                              </td>
                            ))}
                            <td style={{ padding: "6px 10px" }} />
                            <td style={{ padding: "6px 10px" }}>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={handleSaveEdit} style={actionBtnStyle("var(--green)")}><Icon name="check" size={13} /></button>
                                <button onClick={() => setEditRow(null)} style={actionBtnStyle("var(--red)")}><Icon name="x" size={13} /></button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: "9px 13px", color: "var(--text-1)", fontSize: 13 }}>
                              {e.en || <span style={{ color: "var(--border-2)" }}>—</span>}
                            </td>
                            <td style={{ padding: "9px 13px", color: "var(--yellow)", fontSize: 13 }}>
                              {e.zh || <span style={{ color: "var(--border-2)" }}>—</span>}
                            </td>
                            <td style={{ padding: "9px 13px", fontSize: 13, fontWeight: e.vi ? 500 : 400, color: e.vi ? "var(--green)" : "var(--text-3)" }}>
                              {e.vi || <span style={{ fontStyle: "italic", fontSize: 12 }}>chưa dịch</span>}
                            </td>
                            <td style={{ padding: "9px 13px" }}>
                              <span style={{
                                fontSize: 10, fontFamily: "var(--font-mono)",
                                background: `${SRC_COLOR[e.source] || "var(--text-3)"}18`,
                                border: `1px solid ${SRC_COLOR[e.source] || "var(--text-3)"}30`,
                                color: SRC_COLOR[e.source] || "var(--text-3)",
                                borderRadius: 4, padding: "2px 8px",
                              }}>{e.source}</span>
                            </td>
                            <td style={{ padding: "9px 13px" }}>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  onClick={() => setEditRow({ id: e.id, en: e.en, zh: e.zh, vi: e.vi })}
                                  style={actionBtnStyle("var(--purple)")}
                                ><Icon name="edit" size={13} /></button>
                                <button onClick={() => handleDelete(e.id)} style={actionBtnStyle("var(--red)")}><Icon name="trash" size={13} /></button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
              <Btn size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Trước</Btn>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", padding: "0 6px" }}>
                {page} / {pages}
              </span>
              <Btn size="sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Sau →</Btn>
            </div>
          )}
        </>
      )}

      {/* ── SCAN TAB ── */}
      {tab === "scan" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>🔍 Quét File — Trích Xuất Thuật Ngữ Song Ngữ</div>
          <p style={{ color: "var(--text-3)", fontSize: 12.5, marginBottom: 18, lineHeight: 1.65 }}>
            Upload file Excel có nội dung EN / ZH để tự động tìm các cặp thuật ngữ song ngữ và bổ sung vào từ điển.
          </p>
          <input ref={scanRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => setScanFile(e.target.files[0])} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn onClick={() => scanRef.current.click()}><Icon name="upload" /> Chọn file</Btn>
            {scanFile && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", background: "rgba(255,255,255,.05)", padding: "5px 10px", borderRadius: 5 }}>
                {scanFile.name}
              </span>
            )}
            <Btn variant="solid" color="var(--accent)" disabled={!scanFile || scanBusy} onClick={handleScan}>
              {scanBusy ? "⏳ Đang quét…" : "🔍 Quét ngay"}
            </Btn>
          </div>
        </Card>
      )}

      {/* ── IMPORT TAB ── */}
      {tab === "import" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>📥 Import Từ File Đã Dịch</div>
          <p style={{ color: "var(--text-3)", fontSize: 12.5, marginBottom: 16, lineHeight: 1.65 }}>
            File Excel cần có: cột nguồn (EN/ZH) và cột đã dịch (VI). Hàng đầu tiên là header — tự động bỏ qua.
          </p>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            {[["Cột nguồn (EN/ZH)", "src"], ["Cột đã dịch (VI)", "tgt"]].map(([lb, key]) => (
              <div key={key}>
                <div className="field-label">{lb}</div>
                <TextInput
                  value={impCols[key]}
                  onChange={e => setImpCols(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: 80 }}
                />
              </div>
            ))}
          </div>
          <input ref={impRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => setImpFile(e.target.files[0])} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn onClick={() => impRef.current.click()}><Icon name="upload" /> Chọn file</Btn>
            {impFile && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", background: "rgba(255,255,255,.05)", padding: "5px 10px", borderRadius: 5 }}>
                {impFile.name}
              </span>
            )}
            <Btn variant="solid" color="var(--green)" disabled={!impFile || impBusy} onClick={handleImport}>
              {impBusy ? "⏳ Importing…" : "📥 Import ngay"}
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
};

const actionBtnStyle = (color) => ({
  background: `${color}14`, border: `1px solid ${color}28`,
  borderRadius: 5, padding: "4px 7px", cursor: "pointer", color,
  display: "flex", alignItems: "center", transition: "background .13s",
});

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: HISTORY
// ═════════════════════════════════════════════════════════════════════════════
const HistoryPage = ({ toast }) => {
  const [records, setRecords] = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [filter,  setFilter]  = useState("all");
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api(`/history?page=${page}&limit=40`);
      setRecords(r.records); setTotal(r.total);
    } catch (e) { toast(e.message, "error"); }
    setLoading(false);
  }, [page]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const ACTION_META = {
    translate:       { label: "Dịch File",    color: "var(--accent)",  icon: "translate" },
    glossary_scan:   { label: "Quét Glossary", color: "var(--yellow)", icon: "search"    },
    glossary_add:    { label: "Thêm Từ",       color: "var(--green)",  icon: "plus"      },
    glossary_import: { label: "Import",        color: "var(--purple)", icon: "upload"    },
  };

  const filtered = filter === "all" ? records : records.filter(r => r.action === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 className="page-title">Lịch Sử Hoạt Động</h1>
          <p className="page-desc">{total} bản ghi đã lưu</p>
        </div>
        <Btn size="sm" onClick={loadHistory}><Icon name="refresh" /> Làm mới</Btn>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Tabs
          tabs={[
            ["all", "Tất cả"],
            ...Object.entries(ACTION_META).map(([k, v]) => [k, v.label]),
          ]}
          active={filter}
          onChange={setFilter}
        />
      </div>

      {/* Records */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {loading
          ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>⏳ Đang tải…</div>
          : filtered.length === 0
            ? <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)", fontSize: 13 }}>Không có dữ liệu</div>
            : filtered.map(r => {
              const m = ACTION_META[r.action] || { label: r.action, color: "var(--text-3)", icon: "file" };
              return (
                <div key={r.id} style={{
                  background: "var(--bg-2)", border: "1px solid var(--border-1)",
                  borderRadius: 7, padding: "12px 14px",
                  display: "flex", gap: 12, alignItems: "flex-start",
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 10, fontFamily: "var(--font-mono)",
                        background: `${m.color}18`, border: `1px solid ${m.color}30`,
                        color: m.color, borderRadius: 4, padding: "2px 9px",
                      }}>{m.label}</span>
                      <span style={{ color: "var(--text-1)", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.fileName}
                      </span>
                      {r.targetLang && (
                        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-3)", background: "rgba(255,255,255,.05)", padding: "2px 7px", borderRadius: 4 }}>
                          {r.targetLang.toUpperCase()}
                        </span>
                      )}
                    </div>
                    {r.details && (
                      <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 5 }}>{r.details}</div>
                    )}
                    {r.outputFile && (
                      <a
                        href={`${API}/translate/download/${r.outputFile}`}
                        download
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent)", textDecoration: "none" }}
                      >
                        <Icon name="download" size={12} /> {r.outputFile}
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {new Date(r.timestamp).toLocaleString("vi-VN")}
                  </div>
                </div>
              );
            })
        }
      </div>

      {total > 40 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
          <Btn size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Trước</Btn>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", padding: "0 6px" }}>Trang {page}</span>
          <Btn size="sm" disabled={filtered.length < 40} onClick={() => setPage(p => p + 1)}>Sau →</Btn>
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: LOGS
// ═════════════════════════════════════════════════════════════════════════════
const LogsPage = ({ toast }) => {
  const [logs,  setLogs]  = useState([]);
  const [level, setLevel] = useState("");
  const [live,  setLive]  = useState(false);
  const logRef = useRef(null);
  const tiRef  = useRef(null);

  const loadLogs = useCallback(() => {
    api(`/logs?limit=300${level ? `&level=${level}` : ""}`)
      .then(r => setLogs(r.logs))
      .catch(() => {});
  }, [level]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    if (live) tiRef.current = setInterval(loadLogs, 2000);
    else clearInterval(tiRef.current);
    return () => clearInterval(tiRef.current);
  }, [live, loadLogs]);

  const clearLogs = async () => {
    await api("/logs", { method: "DELETE" });
    setLogs([]); toast("Đã xóa logs", "success");
  };

  const LEVEL_COLOR = { error: "#e8394e", warn: "#ffaa30", info: "#00c4e8", debug: "#3a4a5a" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "calc(100vh - 90px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title">System Logs</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SelectInput value={level} onChange={e => setLevel(e.target.value)}>
            <option value="">Tất cả</option>
            {["error", "warn", "info", "debug"].map(l => <option key={l} value={l}>{l}</option>)}
          </SelectInput>
          <Btn size="sm" color={live ? "var(--green)" : "var(--text-3)"} onClick={() => setLive(l => !l)}>
            <Icon name={live ? "x" : "zap"} size={12} /> {live ? "Stop" : "Live"}
          </Btn>
          <Btn size="sm" onClick={loadLogs}><Icon name="refresh" size={12} /></Btn>
          <Btn size="sm" color="var(--red)" onClick={clearLogs}><Icon name="trash" size={12} /></Btn>
        </div>
      </div>

      <div ref={logRef} style={{
        flex: 1, background: "#04060c", border: "1px solid var(--border-1)",
        borderRadius: 8, overflowY: "auto", fontFamily: "var(--font-mono)", fontSize: 11.5,
        padding: "6px 0",
      }}>
        {logs.length === 0
          ? <div style={{ textAlign: "center", padding: 40, color: "#1e2a38" }}>— no logs —</div>
          : logs.map((log, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, padding: "3px 14px",
              borderBottom: "1px solid rgba(15,20,32,.7)",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.015)")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}
            >
              <span style={{ color: "#1e2a38", flexShrink: 0 }}>
                {new Date(log.timestamp).toLocaleTimeString("vi-VN")}
              </span>
              <span style={{ color: LEVEL_COLOR[log.level] || "#3a4a5a", flexShrink: 0, width: 40, fontWeight: 600 }}>
                {log.level}
              </span>
              <span style={{
                wordBreak: "break-all", lineHeight: 1.5,
                color: log.level === "error" ? "#f07878" : log.level === "warn" ? "#ffbb60" : "#6a8aaa",
              }}>{log.message}</span>
            </div>
          ))
        }
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═════════════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { id: "translate", icon: "translate", label: "Dịch File" },
  { id: "glossary",  icon: "book",      label: "Từ Điển"   },
  { id: "history",   icon: "history",   label: "Lịch Sử"   },
  { id: "logs",      icon: "terminal",  label: "Logs"       },
];

const PAGE_MAP = {
  translate: TranslatePage,
  glossary:  GlossaryPage,
  history:   HistoryPage,
  logs:      LogsPage,
};

export default function App() {
  const [activePage, setActivePage] = useState("translate");
  const [online, setOnline]         = useState(null);
  const { toasts, toast }           = useToast();

  useEffect(() => {
    const check = () => api("/health").then(() => setOnline(true)).catch(() => setOnline(false));
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  const ActivePage = PAGE_MAP[activePage];

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          width: 200, flexShrink: 0,
          background: "var(--bg-2)",
          borderRight: "1px solid var(--border-1)",
          display: "flex", flexDirection: "column",
        }}>
          {/* Brand */}
          <div style={{ padding: "22px 20px 18px", borderBottom: "1px solid var(--border-1)" }}>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1,
              color: "var(--text-1)",
              letterSpacing: 2,
            }}>
              PFC<span style={{ color: "var(--accent)" }}>HUB</span>
            </div>
            <div style={{
              fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-3)",
              marginTop: 3, letterSpacing: 1.5, textTransform: "uppercase",
            }}>
              Dictionary Builder
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "10px 0" }}>
            {NAV_ITEMS.map(({ id, icon, label }) => {
              const active = activePage === id;
              return (
                <button key={id} onClick={() => setActivePage(id)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 18px", background: active ? "rgba(0,200,220,.07)" : "none",
                  border: "none", borderLeft: `2.5px solid ${active ? "var(--accent)" : "transparent"}`,
                  cursor: "pointer", color: active ? "var(--accent)" : "var(--text-3)",
                  fontSize: 13.5, fontFamily: "var(--font-ui)", fontWeight: active ? 600 : 400,
                  transition: "all .13s", textAlign: "left",
                }}>
                  <Icon name={icon} size={17} />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Server indicator */}
          <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background:
                  online === null ? "var(--text-3)" :
                  online         ? "var(--green)" :
                                   "var(--red)",
                boxShadow: online === true ? "0 0 6px var(--green)" : undefined,
              }} />
              <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                {online === null ? "connecting…" : online ? "server online" : "offline"}
              </span>
            </div>
            {online === false && (
              <div style={{ fontSize: 9, color: "var(--border-2)", fontFamily: "var(--font-mono)", marginTop: 5, lineHeight: 1.7 }}>
                node --expose-gc server.js
              </div>
            )}
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main style={{ flex: 1, overflow: "auto", background: "var(--bg-1)" }}>
          {online === false && (
            <div style={{
              background: "rgba(232,57,78,.07)",
              borderBottom: "1px solid rgba(232,57,78,.2)",
              padding: "9px 28px",
              fontSize: 12, fontFamily: "var(--font-mono)", color: "#f07080",
            }}>
              ⚠ Backend offline — chạy:{" "}
              <code style={{ background: "rgba(255,255,255,.06)", padding: "1px 7px", borderRadius: 4 }}>
                cd backend &amp;&amp; node --expose-gc server.js
              </code>
            </div>
          )}
          <div style={{ padding: "26px 30px", maxWidth: 1100 }}>
            <ActivePage toast={toast} />
          </div>
        </main>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// GLOBAL CSS
// ═════════════════════════════════════════════════════════════════════════════
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap');

:root {
  --bg-1:          #070a11;
  --bg-2:          #0b0e19;
  --border-1:      #191e2e;
  --border-2:      #252b3d;
  --text-1:        #ccd6f0;
  --text-2:        #8898b8;
  --text-3:        #424e68;
  --accent:        #00c8e0;
  --green:         #00d68a;
  --yellow:        #ffc840;
  --purple:        #9060ff;
  --red:           #e8394e;
  --font-display:  'Barlow Condensed', sans-serif;
  --font-mono:     'JetBrains Mono', monospace;
  --font-ui:       'DM Sans', sans-serif;
}

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--bg-1);
  color: var(--text-1);
  font-family: var(--font-ui);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: var(--bg-2); }
::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #303848; }

input, select, textarea, button { font-family: var(--font-ui); outline: none; }
select option { background: var(--bg-2); }
a { color: inherit; }

/* Page headings */
.page-title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 800;
  color: var(--text-1);
  letter-spacing: .5px;
  line-height: 1;
}
.page-desc {
  color: var(--text-3);
  font-size: 13px;
  margin-top: 5px;
}
.field-label {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: .8px;
  margin-bottom: 5px;
}

/* Drop zone */
.dropzone {
  border: 1.5px dashed var(--border-2);
  border-radius: 10px;
  padding: 38px 24px;
  text-align: center;
  cursor: pointer;
  background: rgba(255,255,255,.012);
  transition: border-color .2s, background .2s;
}
.dropzone:hover { border-color: var(--text-3); }
.drop-active   { border-color: var(--accent) !important; background: rgba(0,200,224,.04) !important; }
.drop-has-file { border-color: var(--green)  !important; background: rgba(0,214,138,.03) !important; }

/* Download banner */
.download-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: rgba(0,214,138,.07);
  border: 1px solid rgba(0,214,138,.22);
  border-radius: 8px;
  text-decoration: none;
  color: var(--green);
  transition: background .2s;
}
.download-banner:hover { background: rgba(0,214,138,.12); }

/* Animations */
@keyframes toastSlide {
  from { opacity: 0; transform: translateX(14px); }
  to   { opacity: 1; transform: translateX(0);    }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spin-icon {
  display: inline-block;
  animation: spin .8s linear infinite;
}
`;
