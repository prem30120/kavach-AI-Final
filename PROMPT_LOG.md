# Kavach-AI — Prompt & Engineering Log

## Overview
**Kavach-AI** is a 100% client-side, zero-server PII Data Sanitization web application built with React, Vite, and Tailwind CSS. Zero user data or network calls ever leave the browser.

---

## 1. Architecture & Privacy Boundary
- **Zero-Network Guarantee:** No backend APIs, no external font CDNs, and no remote worker scripts.
- **Local Document Parsing:**
  - `.txt` and `.csv`: Native browser `File.text()` API + custom RFC-4180 CSV parser (`src/utils/csvHelper.js`).
  - `.pdf`: `pdfjs-dist` with local static worker bundled via Vite `?url` import (`src/utils/fileParser.js`).
  - `.docx`: `mammoth` raw text extraction from local `ArrayBuffer`.
- **Client-Side Audit Cryptography:** SHA-256 hashes of raw input and sanitized output are computed in-browser via `crypto.subtle.digest('SHA-256', ...)` (`src/utils/cryptoAudit.js`).

## 2. Core PII Engine (`src/utils/sanitizerEngine.js`)
- **Supported Entities:** Emails, Indian (`+91` / 10-digit) & international Phone numbers, IPv4 & IPv6 addresses, Indian PAN (`[A-Z]{5}[0-9]{4}[A-Z]` with 4th-character holder classification), 12-digit Indian Aadhaar (`[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}`), UPI IDs (`name@bank`), IFSC codes, Credit Cards (13–19 digits), and user-defined custom words.
- **Overlap Resolution:** Candidates are sorted by longest span first, then entity priority, ensuring longer patterns like Emails (`9876543210@company.in`) are never split by inner digits or shorter phone/UPI patterns.
- **Luhn Checksum Validation:** Payment card candidates are validated via Luhn (`isValidLuhn`). Invalid 13–19 digit sequences (such as 16-digit Order IDs) are preserved untouched and counted separately as `rejectedNonLuhnCount`.

## 3. Redaction Modes & Reversible Vault
- **Full Mask:** Category tokens (`[EMAIL_REDACTED]`, `[PAN_REDACTED]`, `[CARD_REDACTED]`).
- **Partial Mask:** Format-preserving masks (`r***t@domain.com`, `XXXX-XXXX-XXXX-0366`, `ABXXXXXX4F`).
- **Consistent Pseudonymization:** Deterministic `Map` generating stable tokens (`USER_01`, `CARD_01`, `PAN_01`) across documents and CSV tables, with exportable `vault_key.json` and a dedicated **Restore / De-Anonymize** tab (`restoreFromVault`).

## 4. Tactical Cyber-Forensics HUD UI
- **Identity:** Deep matte carbon `#080A0F` with SVG dot-matrix grid, 1px crosshair borders, 4px corner-bracket frames; JetBrains Mono telemetry with lime `#00FF94` (air-gapped/safe), amber `#FFB800` (redaction warnings), cyan `#38BDF8` (Luhn/math inspection). Fonts are name-referenced only — zero webfont downloads.
- **3-Zone Layout:** Top Telemetry Header (geometric shield emblem, `NET_IO: 0.00 KB • AIR-GAPPED` oscilloscope badge, Load Sample, Panic Wipe with red flash, drawer triggers) → Center Command Bar (`[01] FULL MASK / [02] PARTIAL / [03] PSEUDONYM` segmented switch, custom terms, segmented Exposure Meter dropping to `0% LEAK RISK`) → Split Forensic Workspace (`SOURCE_BUFFER // RAW` with line-number gutter + `CLEAN_BUFFER // SAFE_TO_SHARE`, `min-h-[500px]`).
- **Scramble & X-Ray:** Mode switches and sample loads trigger a 250ms character-scramble (`#@$%&*01`) in the clean buffer. Hovering/clicking any token (including dashed-amber rejected non-Luhn IDs) drives the Forensic Inspector Strip between the panes: exact regex rule, PAN holder class, and a live Luhn Mod-10 proof (`CHECKSUM: VALID` vs `MOD-10 FAILED • IGNORED ORDER ID`).
