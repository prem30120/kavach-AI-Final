# Kavach-AI

**Kavach-AI** is a 100% client-side, zero-server Personally Identifiable Information (PII) sanitization web application built with React, Vite, and Tailwind CSS. All detection, validation, masking, hashing, and document parsing execute strictly inside the user's browser memory with zero outbound network requests.

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          Browser Runtime (0 Bytes Sent)                 │
│                                                                         │
│  ┌──────────────────────────┐      ┌─────────────────────────────────┐  │
│  │  Local Document Parsers  │      │   Sanitization Engine           │  │
│  │  • .txt / .csv (Native)  │─────▶│   • Regex + Boundary Detectors  │  │
│  │  • .pdf (pdfjs-dist)     │      │   • Luhn Checksum Filter        │  │
│  │  • .docx (mammoth)       │      │   • Longest-Span Overlap Solver │  │
│  └──────────────────────────┘      │   • Full / Partial / Consistent │  │
│                                    └───────────────┬─────────────────┘  │
│                                                    │                    │
│  ┌──────────────────────────┐                      ▼                    │
│  │  Web Crypto Audit        │      ┌─────────────────────────────────┐  │
│  │  • SHA-256 Input/Output  │◀─────│   Minimalist 3-Zone Workspace   │  │
│  │  • vault_key.json Export │      │   • Highlighted Input Editor    │  │
│  │  • Restore / De-Anonymize│      │   • Live Sanitized Preview      │  │
│  └──────────────────────────┘      └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Modules
- **`src/utils/sanitizerEngine.js`**: Stateless detection (`detectPII`), Luhn validation (`isValidLuhn`), overlap resolution, masking modes (`sanitizeText`, `formatPartialMask`), and reversible vault restoration (`restoreFromVault`).
- **`src/utils/fileParser.js`**: Client-side extraction for `.txt`, `.csv`, `.pdf` (using a locally bundled Vite static worker `pdfjs-dist/build/pdf.worker.min.mjs?url`), and `.docx` (`mammoth`).
- **`src/utils/csvHelper.js`**: RFC-4180 compliant CSV parser (`parseCSV`) and serializer (`serializeCSV`) supporting per-column sanitization toggles.
- **`src/utils/cryptoAudit.js`**: Local SHA-256 hashing (`sha256Hex`, `buildAuditReceipt`) via browser `crypto.subtle.digest`.
- **`src/components/`**:
  - `HighlightedEditor.jsx`: Synchronized mirror layer + transparent `<textarea>` for pastel highlights, hover tooltips, and click-to-whitelist toggling.
  - `AuditVaultDrawer.jsx`: Slide-over drawer for SHA-256 Audit Receipts and `vault_key.json` export.
  - `CsvColumnsDrawer.jsx`: Slide-over drawer for column-level CSV sanitization toggles.
  - `RestoreView.jsx`: Secondary `Restore` workspace tab for de-anonymizing Consistent IDs with `vault_key.json`.
  - `PromptLogModal.jsx`: In-app engineering log modal synchronized with `PROMPT_LOG.md`.

---

## Requirement-to-Code Mapping

| Requirement | Implementation File(s) | Symbol(s) / Behavior |
|---|---|---|
| **100% Client-Side / Zero Network Calls** | `index.html`, `src/utils/fileParser.js`, `src/utils/cryptoAudit.js` | No external font/API requests; `pdfWorkerUrl` bundled locally via `?url`; hashes computed with `crypto.subtle.digest`. |
| **Minimal Top Bar** | `src/App.jsx` | Brand title (`Kavach-AI`), green badge (`privacy-badge`), `load-sample-button`, `clear-button`, `prompt-log-button`, `audit-vault-button`. |
| **Clean Control Ribbon** | `src/App.jsx` | Mode toggle (`mode-full`, `mode-partial`, `mode-consistent`), custom word input (`custom-word-input`, `add-custom-word-button`), entity counters (`masked-entity-count`, `non-luhn-ignored-count`). |
| **2-Column Split Workspace** | `src/App.jsx`, `src/components/HighlightedEditor.jsx` | `original-input-pane` with `file-dropzone` & interactive highlights (`pii-highlight`, `pii-tooltip`); `sanitized-output-pane` with `copy-output-button` & `download-output-button`. |
| **PII Detection & Overlap Resolution** | `src/utils/sanitizerEngine.js` | `detectPII` detects Emails, Indian/Intl Phones, IPv4/IPv6, PAN, Aadhaar, UPI, IFSC, Cards, and Custom Words; longest-span-first sorting prevents email splitting. |
| **PAN Holder Classification** | `src/utils/sanitizerEngine.js` | `PAN_HOLDER_TYPES` maps 4th PAN character (`P` → `Individual`, `C` → `Company`, `H` → `HUF`, etc.) into tooltip metadata. |
| **Luhn Checksum Validation** | `src/utils/sanitizerEngine.js` | `isValidLuhn` validates 13–19 digit card candidates; non-Luhn IDs remain unmasked and increment `rejectedNonLuhnCount`. |
| **Three Redaction Modes** | `src/utils/sanitizerEngine.js` | `REDACTION_MODES.FULL`, `REDACTION_MODES.PARTIAL` (`formatPartialMask`), and `REDACTION_MODES.CONSISTENT` (`USER_01`, `CARD_01`, `PAN_01`). |
| **Consistent IDs & Restore Tab** | `src/utils/sanitizerEngine.js`, `src/components/AuditVaultDrawer.jsx`, `src/components/RestoreView.jsx` | Deterministic `Map` builds `vaultMappings`, exported as `vault_key.json` and restored via `restoreFromVault`. |
| **Multi-Format Parsing & CSV Toggles** | `src/utils/fileParser.js`, `src/utils/csvHelper.js`, `src/components/CsvColumnsDrawer.jsx` | `parseUploadedFile` handles `.txt`, `.csv`, `.pdf`, `.docx`; CSV mode preserves format on download and exposes `csv-columns-button`. |
| **SHA-256 Audit Receipt** | `src/utils/cryptoAudit.js`, `src/components/AuditVaultDrawer.jsx` | `buildAuditReceipt` computes input/output SHA-256 hashes and entity summary JSON inside the slide-over drawer. |
| **Sample Data & Prompt Log** | `src/data/sampleData.js`, `src/components/PromptLogModal.jsx`, `PROMPT_LOG.md` | `SAMPLE_KYC_TEXT` preloads recurring emails/PANs, valid Luhn cards, and non-Luhn 16-digit Order IDs; `PromptLogModal` mirrors `PROMPT_LOG.md`. |

---

## Automated Accessibility & Test Identifiers (`data-testid`)

- **Navigation & Top Actions:** `privacy-badge`, `tab-sanitize`, `tab-restore`, `load-sample-button`, `clear-button`, `audit-vault-button`, `prompt-log-button`
- **Redaction Modes & Custom Terms:** `mode-full`, `mode-partial`, `mode-consistent`, `custom-word-input`, `add-custom-word-button`, `custom-word-chip-<word>`
- **Entity Counters:** `masked-entity-count`, `whitelisted-entity-count`, `entity-count-<type>`, `non-luhn-ignored-count`
- **Input / Output Panes & File Upload:** `original-input-pane`, `file-dropzone`, `browse-file-button`, `file-upload-input`, `highlighted-editor`, `original-input-textarea`, `pii-highlight`, `pii-tooltip`, `sanitized-output-pane`, `sanitized-output-text`, `copy-output-button`, `download-output-button`
- **Drawers, Modals & Restore View:** `audit-vault-drawer`, `download-vault-button`, `copy-audit-receipt-button`, `download-audit-receipt-button`, `csv-columns-button`, `csv-columns-drawer`, `restore-view`, `restore-vault-upload-input`, `restore-sanitized-input`, `restore-vault-json-input`, `restored-output-text`, `download-restored-button`, `prompt-log-modal`

---

## Scripts

```bash
npm install        # Install dependencies
npm run dev        # Start local Vite development server
npm test           # Run Vitest unit test suite
npm run build      # Build production bundle to dist/
```
