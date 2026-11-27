import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { sanitizeText, REDACTION_MODES, isValidLuhn } from './utils/sanitizerEngine.js';
import { parseCSV, serializeCSV } from './utils/csvHelper.js';
import { parseUploadedFile, ACCEPTED } from './utils/fileParser.js';
import { SAMPLE_KYC_TEXT } from './data/sampleData.js';
import HighlightedEditor from './components/HighlightedEditor.jsx';
import AuditVaultDrawer from './components/AuditVaultDrawer.jsx';
import CsvColumnsDrawer from './components/CsvColumnsDrawer.jsx';
import PromptLogModal from './components/PromptLogModal.jsx';
import RestoreView from './components/RestoreView.jsx';
import StatsDashboard from './components/StatsDashboard.jsx';
import HistoryDrawer from './components/HistoryDrawer.jsx';
import SearchBar from './components/SearchBar.jsx';
import Toast from './components/Toast.jsx';

const MODES = [
  { id: REDACTION_MODES.FULL,       label: 'Full Mask',   icon: '◼', desc: 'Replace with [REDACTED] tokens' },
  { id: REDACTION_MODES.PARTIAL,    label: 'Partial',     icon: '◧', desc: 'Show first/last chars only'    },
  { id: REDACTION_MODES.CONSISTENT, label: 'Pseudonym',   icon: '⇄', desc: 'Replace with consistent labels'},
];

const RULES = {
  EMAIL:    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
  CREDIT_CARD:'(?:\\d[ -]?){12,18}\\d  +  LUHN MOD-10 GATE',
  REJECTED_NON_LUHN:'(?:\\d[ -]?){12,18}\\d  →  LUHN MOD-10 GATE: FAILED',
  PAN:      '\\b[A-Z]{5}[0-9]{4}[A-Z]\\b  (4th char = holder class)',
  AADHAAR:  '[2-9]\\d{3}[\\s-]\\d{4}[\\s-]\\d{4}  (UIDAI leading-digit rule)',
  PHONE:    '(?:\\+91[\\s-]?|0)?[6-9]\\d{4}[\\s-]?\\d{5}  /  intl (+CC) formats',
  IPV4:     '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b  (each octet ≤ 255)',
  IPV6:     '(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}  /  ::-compressed forms',
  UPI:      '[A-Za-z0-9._-]{2,}@[bank-handle]',
  IFSC:     '\\b[A-Z]{4}0[A-Z0-9]{6}\\b',
  CUSTOM:   'user-supplied literal term (case-insensitive)',
};

function luhnTrace(value) {
  const digits = String(value).replace(/[\s-]/g, '');
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return { digits, sum, mod: sum % 10, valid: sum % 10 === 0 };
}

const SCRAMBLE_CHARS = '#@$%&*01';
function useScrambled(text, duration = 220) {
  const [display, setDisplay] = useState(text);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; setDisplay(text); return; }
    if (!text) { setDisplay(''); return; }
    const start = performance.now();
    const id = setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / duration);
      const reveal = Math.floor(text.length * p);
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        out += (i < reveal || /\s/.test(ch)) ? ch : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
      }
      setDisplay(out);
      if (p >= 1) { clearInterval(id); setDisplay(text); }
    }, 25);
    return () => clearInterval(id);
  }, [text, duration]);
  return display;
}

function InspectorStrip({ token, result, mode }) {
  const trace = token && (token.type === 'CREDIT_CARD' || token.type === 'REJECTED_NON_LUHN') ? luhnTrace(token.value) : null;
  return (
    <aside data-testid="forensic-inspector"
      className="hud-frame hud-frame-amber flex w-full shrink-0 flex-col p-4 xl:w-[290px] fade-in">
      <div className="micro-label mb-3 flex items-center justify-between text-[#38BDF8]">
        <span>◈ Forensic Inspector</span>
        <span className="blink text-[#00FF94]">● LIVE</span>
      </div>

      {!token ? (
        <div className="font-mono-hud space-y-2.5 text-xs leading-5 text-white/55">
          <p className="text-white/80 text-[11px]">Hover or click any highlighted token to X-Ray it.</p>
          <div className="mt-3 space-y-1.5 border-t border-white/8 pt-3">
            <p><span className="text-white/35">DETECTED  : </span><b className="text-[#38BDF8]">{result.total + result.rejectedNonLuhnCount}</b></p>
            <p><span className="text-white/35">REDACTED  : </span><b className="text-[#00FF94]">{result.total}</b></p>
            <p><span className="text-white/35">NON-LUHN  : </span><b className="text-[#FFB800]">{result.rejectedNonLuhnCount}</b></p>
            <p><span className="text-white/35">MODE      : </span><b className="text-white/80">{String(mode).toUpperCase()}</b></p>
          </div>
          <p className="mt-3 border border-[#FFB800]/20 bg-[#FFB800]/5 p-2 text-[10px] text-[#FFB800]/80 rounded-[3px]">
            ▸ Dashed amber = 16-digit IDs that FAILED Luhn — left untouched.
          </p>
        </div>
      ) : (
        <div className="font-mono-hud space-y-2 text-xs leading-5 fade-in">
          <div className="mb-2 rounded-[3px] border border-[#FFB800]/30 bg-[#FFB800]/8 px-2.5 py-1.5">
            <p className="text-[10px] text-white/35 uppercase tracking-wider">Entity Type</p>
            <p className="text-[#FFB800] font-bold text-sm">{token.type}</p>
          </div>
          <p className="break-all"><span className="text-white/35">VALUE   </span><span className="text-white/85">{token.value}</span></p>
          <p><span className="text-white/35">SPAN    </span><span className="text-[#38BDF8]">[{token.startIndex}..{token.endIndex}] • {token.endIndex - token.startIndex}c</span></p>
          <div className="break-all border-t border-white/8 pt-2">
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Regex Rule</p>
            <p className="text-[#38BDF8] text-[10px]">{RULES[token.type] || token.type}</p>
          </div>
          {token.type === 'PAN' && (
            <div className="border border-[#00FF94]/20 bg-[#00FF94]/5 p-2 rounded-[3px]">
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">PAN Holder Class</p>
              <p className="text-[#00FF94] font-bold">{token.metadata?.holderType || 'Unknown'}</p>
              <p className="text-white/40 text-[10px]">4th char '{token.metadata?.holderCode || token.value?.[3]}' per CBDT table</p>
            </div>
          )}
          {trace && (
            <div className="border border-[#38BDF8]/25 bg-[#38BDF8]/5 p-2.5 rounded-[3px]">
              <p className="micro-label mb-1.5 text-[#38BDF8]">Luhn Modulo-10 Proof</p>
              <p className="break-all text-white/60 text-[10px]">{trace.digits}</p>
              <p className="text-white/55 text-[10px]">Σ = {trace.sum}  •  MOD 10 = {trace.mod}</p>
              <p className={`font-bold text-[11px] mt-1 ${trace.valid ? 'text-[#00FF94]' : 'text-[#FFB800]'}`}>
                {trace.valid ? '✓ VALID — CARD, REDACT' : '✕ FAILED — ORDER ID, SKIP'}
              </p>
            </div>
          )}
          <p className="text-[10px] text-white/35 border-t border-white/8 pt-2">Click token to whitelist / re-arm it.</p>
        </div>
      )}
    </aside>
  );
}

export default function App() {
  const [tab, setTab] = useState('sanitize');
  const [input, setInput] = useState('');
  const [mode, setMode] = useState(REDACTION_MODES.FULL);
  const [disabled, setDisabled] = useState([]);
  const [customWords, setCustomWords] = useState([]);
  const [customDraft, setCustomDraft] = useState('');
  const [whitelisted, setWhitelisted] = useState([]);
  const [fileKind, setFileKind] = useState('txt');
  const [csvEnabled, setCsvEnabled] = useState({});
  const [showAudit, setShowAudit] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');
  const [inspected, setInspected] = useState(null);
  const [panic, setPanic] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState(null);
  const [wordCount, setWordCount] = useState(0);
  const fileRef = useRef(null);

  // Apply light/dark class to body
  useEffect(() => {
    document.body.classList.toggle('light-theme', lightMode);
  }, [lightMode]);

  // Word count
  useEffect(() => {
    setWordCount(input.trim() ? input.trim().split(/\s+/).length : 0);
  }, [input]);

  const csv = useMemo(() =>
    fileKind === 'csv' && input.trim() ? parseCSV(input) : null,
    [fileKind, input]);

  const result = useMemo(() =>
    sanitizeText(input, { mode, disabledCategories: disabled, customWords, whitelisted }),
    [input, mode, disabled, customWords, whitelisted]);

  const rejectedSpans = useMemo(() => {
    const spans = [];
    for (const m of String(input).matchAll(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g)) {
      const digits = m[0].replace(/[\s-]/g, '');
      if (digits.length >= 15 && !isValidLuhn(digits))
        spans.push({ value: m[0], startIndex: m.index, endIndex: m.index + m[0].length, metadata: { luhnValid: false } });
    }
    return spans;
  }, [input]);

  const output = useMemo(() => {
    if (!csv || !csv.headers.length) return result.sanitizedText;
    if (csv.headers.every(h => csvEnabled[h] !== false)) return result.sanitizedText;
    const inverse = Object.fromEntries(Object.entries(result.vaultMappings).map(([t, o]) => [o, t]));
    const rows = csv.rawRows.map(row => csv.headers.map((h, i) => {
      if (csvEnabled[h] === false) return row[i] ?? '';
      if (mode === REDACTION_MODES.CONSISTENT) {
        let cell = row[i] ?? '';
        for (const [orig, token] of Object.entries(inverse)) cell = cell.split(orig).join(token);
        return cell;
      }
      return sanitizeText(row[i] ?? '', { mode, disabledCategories: disabled, customWords }).sanitizedText;
    }));
    return serializeCSV(csv.headers, rows);
  }, [csv, csvEnabled, result, mode, disabled, customWords]);

  const displayOutput = useScrambled(output);

  const exposure = useMemo(() => {
    const totalChars = result.matches.reduce((s, m) => s + (m.endIndex - m.startIndex), 0);
    const activeChars = result.activeMatches.reduce((s, m) => s + (m.endIndex - m.startIndex), 0);
    const leak = totalChars === 0 ? 0 : Math.round(((totalChars - activeChars) / totalChars) * 100);
    return { totalChars, leak };
  }, [result]);

  const toggleCategory = t => setDisabled(d => d.includes(t) ? d.filter(x => x !== t) : [...d, t]);
  const toggleWhitelist = m => setWhitelisted(w =>
    w.some(x => x.startIndex === m.startIndex && x.endIndex === m.endIndex)
      ? w.filter(x => !(x.startIndex === m.startIndex && x.endIndex === m.endIndex))
      : [...w, m]);

  const showToast = (message, type = 'success') => setToast({ message, type, key: Date.now() });

  const onFile = async file => {
    if (!file) return;
    try {
      const { text, kind } = await parseUploadedFile(file);
      setInput(text); setFileKind(kind); setWhitelisted([]); setError(''); setInspected(null);
      if (kind === 'csv') setCsvEnabled({});
      showToast(`Loaded ${file.name}`, 'info');
    } catch (e) { setError(e.message); showToast(e.message, 'error'); }
  };

  const panicWipe = () => {
    setPanic(true); setInput(''); setWhitelisted([]); setInspected(null); setError('');
    setTimeout(() => setPanic(false), 380);
    showToast('Buffer wiped.', 'info');
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([output], { type: 'text/plain' }));
    a.download = fileKind === 'csv' ? 'sanitized.csv' : 'sanitized.txt';
    a.click(); URL.revokeObjectURL(a.href);
    showToast('File downloaded!');
  };

  const copyOutput = () => {
    navigator.clipboard?.writeText(output).then(() => showToast('Copied to clipboard!'));
  };

  // Save to history on significant sanitization
  const saveHistory = useCallback(() => {
    if (!input.trim() || result.total === 0) return;
    const record = {
      ts: Date.now(),
      input, output,
      total: result.total,
      mode,
      chars: input.length,
      preview: input.slice(0, 80).replace(/\n/g, ' ') + (input.length > 80 ? '…' : ''),
      vaultMappings: result.vaultMappings,
      counts: result.counts,
    };
    setHistory(h => [record, ...h].slice(0, 20));
    showToast(`Saved to history (${result.total} entities redacted)`);
  }, [input, output, result, mode]);

  const restoreHistory = item => {
    setInput(item.input);
    showToast('Session restored from history', 'info');
  };

  // Drag & drop onto the whole window
  const onWindowDrop = e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); };
  const onWindowDragOver = e => e.preventDefault();

  const navTab = (id) =>
    `px-4 py-2 font-mono-hud text-[11px] uppercase tracking-wider transition-all border-b-2 ${
      tab === id
        ? 'border-[#00FF94] text-[#00FF94]'
        : 'border-transparent text-white/45 hover:text-white/80'
    }`;

  return (
    <div className="mx-auto min-h-screen max-w-[1540px] px-4 py-4"
      onDrop={onWindowDrop} onDragOver={onWindowDragOver}>
      {panic && <div className="panic-flash pointer-events-none fixed inset-0 z-[70] bg-[#FF3B5C]" />}
      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header className="mb-4 flex flex-wrap items-center gap-3 border-b border-white/8 pb-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <svg width="38" height="38" viewBox="0 0 34 34" aria-hidden="true">
            <path d="M17 1 31 6v11c0 8.5-6 13.5-14 16C9 30.5 3 25.5 3 17V6Z"
              fill="none" stroke="#00FF94" strokeWidth="1.6"/>
            <path d="M17 6.5 26 10v7c0 5.8-3.8 9.4-9 11.4C11.8 26.4 8 22.8 8 17v-7Z"
              fill="none" stroke="#38BDF8" strokeWidth="1"/>
            <path d="m12.5 17 3 3 6-6.5" fill="none" stroke="#00FF94" strokeWidth="2"/>
          </svg>
          <div>
            <h1 className="text-xl font-bold leading-none tracking-[0.08em]">
              KAVACH <span className="text-[#00FF94]">//</span> ZERO-LEAK SANITIZER
            </h1>
            <p className="micro-label mt-1 text-white/35">Tactical PII Redaction • 100% Client-Side • Air-Gapped</p>
          </div>
        </div>

        {/* Air-gap badge */}
        <span data-testid="privacy-badge"
          className="ml-1 flex items-center gap-2 border border-[#00FF94]/30 bg-[#00FF94]/5 px-3 py-1.5 font-mono-hud text-[11px] text-[#00FF94] rounded-[3px]">
          <svg width="46" height="12" viewBox="0 0 46 12" aria-hidden="true">
            <polyline className="scope-line" points="0,6 6,6 9,2 13,10 16,6 24,6 27,3 31,9 34,6 46,6"
              fill="none" stroke="#00FF94" strokeWidth="1.4"/>
          </svg>
          NET_IO: 0.00 KB • AIR-GAPPED
        </span>

        {/* Nav tabs */}
        <nav className="flex gap-0 border-b border-white/8 self-end">
          <button data-testid="tab-sanitize" onClick={() => setTab('sanitize')} className={navTab('sanitize')}>Sanitize</button>
          <button data-testid="tab-restore" onClick={() => setTab('restore')} className={navTab('restore')}>Restore</button>
        </nav>

        {/* Right actions */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Word / char counter */}
          {input && (
            <span className="font-mono-hud text-[10px] text-white/30 tracking-wider hidden sm:block">
              {wordCount} words • {input.length} chars
            </span>
          )}

          {/* Theme toggle */}
          <button onClick={() => setLightMode(l => !l)}
            className="btn-hud flex items-center gap-1.5" title="Toggle light/dark">
            {lightMode ? '☀' : '🌙'} {lightMode ? 'Light' : 'Dark'}
          </button>

          <button data-testid="load-sample-button"
            onClick={() => { setInput(SAMPLE_KYC_TEXT); setFileKind('txt'); setWhitelisted([]); setInspected(null); showToast('Sample KYC data loaded', 'info'); }}
            className="btn-primary">Load Sample</button>

          <button data-testid="clear-button" onClick={panicWipe} className="btn-danger">⚠ Panic Wipe</button>

          <button onClick={saveHistory} className="btn-hud" title="Save current run to history">💾 Save</button>

          <button onClick={() => setShowHistory(true)}
            className="btn-hud flex items-center gap-1.5">
            🕒 History {history.length > 0 && <span className="rounded-full bg-[#A855F7]/30 px-1.5 text-[#A855F7]">{history.length}</span>}
          </button>

          <button data-testid="audit-vault-button" onClick={() => setShowAudit(true)} className="btn-hud">Vault & Audit</button>
          <button data-testid="prompt-log-button" onClick={() => setShowLog(true)} className="btn-hud">Prompt Log</button>
        </div>
      </header>

      {tab === 'restore' ? <RestoreView /> : (
        <>
          {/* ── STATS DASHBOARD ──────────────────────────────────── */}
          <StatsDashboard result={result} whitelisted={whitelisted} exposure={exposure} input={input} />

          {/* ── COMMAND BAR ──────────────────────────────────────── */}
          <section className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border border-white/8 bg-white/[0.015] px-3 py-2.5 rounded-[5px]">
            {/* Mode tabs */}
            <div className="flex overflow-hidden border border-white/12 rounded-[4px]">
              {MODES.map(m => (
                <button key={m.id} data-testid={`mode-${m.id}`}
                  onClick={() => setMode(m.id)} title={m.desc}
                  className={`mode-tab ${mode === m.id ? 'active' : ''}`}>
                  <span className="mr-1 opacity-70">{m.icon}</span>{m.label}
                </button>
              ))}
            </div>

            {/* Entity filter chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(result.counts).map(([type, n]) => (
                <button key={type} data-testid={`entity-count-${type}`} onClick={() => toggleCategory(type)}
                  className={`rounded-full border px-2.5 py-0.5 font-mono-hud text-[10px] uppercase tracking-wider transition-all ${
                    disabled.includes(type)
                      ? 'border-white/8 text-white/25 line-through'
                      : 'border-[#38BDF8]/35 bg-[#38BDF8]/6 text-[#9adcff] hover:border-[#38BDF8]/60'
                  }`}>
                  {type} <span className="text-white/70">×{n}</span>
                </button>
              ))}
            </div>

            {/* Custom word */}
            <div className="flex items-center gap-1.5 ml-auto">
              <input data-testid="custom-word-input" value={customDraft}
                onChange={e => setCustomDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && customDraft.trim()) { setCustomWords(w => [...w, customDraft.trim()]); setCustomDraft(''); } }}
                placeholder="+ Custom term (Enter)" maxLength={60}
                className="font-mono-hud rounded-[3px] border border-white/12 bg-transparent px-3 py-1 text-[11px] placeholder:text-white/25 focus:border-[#00FF94]/50 focus:outline-none w-44 transition-colors" />
              <button data-testid="add-custom-word-button"
                onClick={() => { if (customDraft.trim()) { setCustomWords(w => [...w, customDraft.trim()]); setCustomDraft(''); } }}
                className="btn-hud">Add</button>
              {customWords.map(w => (
                <span key={w} data-testid={`custom-word-chip-${w}`}
                  className="flex items-center gap-1 rounded-full border border-fuchsia-400/35 bg-fuchsia-400/8 pl-2.5 pr-1 py-0.5 font-mono-hud text-[10px] text-fuchsia-200">
                  {w}
                  <button onClick={() => setCustomWords(ws => ws.filter(x => x !== w))}
                    className="ml-0.5 text-fuchsia-400/60 hover:text-fuchsia-200 text-xs leading-none">×</button>
                </span>
              ))}
            </div>

            {csv && (
              <button data-testid="csv-columns-button" onClick={() => setShowCsv(true)}
                className="btn-hud">CSV Columns</button>
            )}
          </section>

          {/* ── SEARCH BAR ───────────────────────────────────────── */}
          {result.matches.length > 0 && (
            <div className="mb-3">
              <SearchBar matches={result.matches} onJumpTo={setInspected} />
            </div>
          )}

          {error && (
            <p className="mb-3 flex items-center gap-2 border border-[#FF3B5C]/40 bg-[#FF3B5C]/8 px-3 py-2 font-mono-hud text-xs text-[#FF8098] rounded-[3px]">
              <span>⚠</span> {error}
              <button onClick={() => setError('')} className="ml-auto text-[#FF3B5C]/60 hover:text-[#FF8098]">✕</button>
            </p>
          )}

          {/* ── WORKSPACE ────────────────────────────────────────── */}
          <main className="flex flex-col gap-3 xl:flex-row">
            {/* Source pane */}
            <section data-testid="original-input-pane" className="hud-frame min-w-0 flex-1">
              <div data-testid="file-dropzone"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
                className="pane-header">
                <span className="micro-label text-[#FFB800]">▚ Source_Buffer // Raw</span>
                <div className="flex items-center gap-2">
                  <button data-testid="browse-file-button"
                    onClick={() => fileRef.current?.click()} className="btn-hud text-[10px]">
                    Browse .txt / .csv / .pdf / .docx
                  </button>
                  <input data-testid="file-upload-input" ref={fileRef} type="file" accept={ACCEPTED}
                    className="hidden" onChange={e => onFile(e.target.files?.[0])} />
                </div>
              </div>
              <HighlightedEditor value={input}
                onChange={v => { setInput(v); setWhitelisted([]); }}
                matches={result.matches} whitelisted={whitelisted}
                onToggleWhitelist={toggleWhitelist} onInspect={setInspected}
                rejected={rejectedSpans} />
              <p className="micro-label border-t border-white/8 px-3 py-1.5 text-white/25">
                Click a token to whitelist • Hover to X-Ray • Drag & drop files anywhere
              </p>
            </section>

            {/* Forensic inspector */}
            <InspectorStrip token={inspected} result={result} mode={mode} />

            {/* Output pane */}
            <section data-testid="sanitized-output-pane" className="hud-frame min-w-0 flex-1">
              <div className="pane-header">
                <span className="micro-label text-[#00FF94]">▚ Clean_Buffer // Safe_To_Share</span>
                <span className="flex gap-2">
                  <button data-testid="copy-output-button" onClick={copyOutput} className="btn-hud text-[10px]">
                    Copy
                  </button>
                  <button data-testid="download-output-button" onClick={download} className="btn-primary text-[10px]">
                    Export File
                  </button>
                </span>
              </div>
              <pre data-testid="sanitized-output-text"
                className="font-mono-hud min-h-[500px] overflow-auto whitespace-pre-wrap break-words p-3 text-sm leading-6 text-slate-100">
                {displayOutput || <span className="text-white/25">▸ NO CLEAN PAYLOAD YET — LOAD SAMPLE OR PASTE RAW DATA.</span>}
              </pre>
              <p className="micro-label border-t border-white/8 px-3 py-1.5 text-white/25">
                Scramble settles in 220ms • Copy-safe redacted text
              </p>
            </section>
          </main>
        </>
      )}

      {/* ── DRAWERS / MODALS ─────────────────────────────────────── */}
      <AuditVaultDrawer open={showAudit} onClose={() => setShowAudit(false)}
        input={input} output={output} counts={result.activeCounts}
        rejectedNonLuhnCount={result.rejectedNonLuhnCount} mode={mode}
        vaultMappings={result.vaultMappings} />
      <CsvColumnsDrawer open={showCsv} onClose={() => setShowCsv(false)}
        headers={csv?.headers || []} enabled={csvEnabled}
        onToggle={h => setCsvEnabled(s => ({ ...s, [h]: s[h] === false }))} />
      <PromptLogModal open={showLog} onClose={() => setShowLog(false)} />
      <HistoryDrawer open={showHistory} onClose={() => setShowHistory(false)}
        history={history} onRestore={restoreHistory}
        onClear={() => { setHistory([]); showToast('History cleared', 'info'); }} />
    </div>
  );
}
