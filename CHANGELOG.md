# Changelog

## 1.0.0 (October 2026)

First complete release, after a full review of the August prototype.

### Fixed

- Due dates were one day early everywhere east of UTC (local midnight printed as UTC).
- Save PDF failed in the desktop app: the Content-Security-Policy blocked the WebAssembly PDF layout engine.
- Closing the window within 0.4 s of an edit lost that edit. Pending saves are now flushed on close, which needs `core:window:allow-destroy` (without it the window can't close at all; the desktop test checks both).
- Typing `7,5` into a quantity produced `75`, because the field re-parsed on every keystroke.
- A damaged `data.json` loaded as "no data" and showed Setup; the next save then deleted the good backup and replaced the history with an empty file.
- Issued invoices could be changed at the data layer; only the UI hid the inputs.
- Importing a backup replaced everything without validation or confirmation.
- Zero amounts on negative documents printed as `-€0.00`.
- PDF file names split accented letters (`Ło-dz`).
- Errors were invisible during Setup; half the interface ignored the Dutch setting; form labels were not connected to their inputs.
- PDFs had no page numbers (react-pdf drops a page counter that inherits `lineHeight`).

### Changed

- Issuing assigns the number and advances the counter in a single state update computed from the latest data, rather than two separate updates from a render-time copy.
- Saves are serialised: one write at a time, always of the newest data.

### Added

- Credit notes (full and partial), duplicate, quote outcome tracking and quote expiry.
- Client editing and search; invoice search, status filters, and outstanding / overdue / paid totals.
- Pre-issue checklist based on Article 226 of the EU VAT Directive.
- Confirmation dialogs for every irreversible action.
- Daily backups, recovery screen, and backup export to `Documents/Wolf/backups`.
- Configurable number prefix and start number (before the first document of the year).
- IBAN checksum, BIC, VAT-number and email format hints.
- Dutch PDF dates, numbers and country names; payment reference and page numbers on PDFs.
- 2026 VAT rates (Finland, Lithuania) and Bulgaria's move to the euro.
- ESLint, Prettier, Vitest, Playwright and desktop WebDriver tests; CI and Dependabot.

### Security

- File access scoped to `Documents/Wolf`; dialog plugin and URL opening removed.
- Stricter CSP (`object-src 'none'`, `base-uri 'none'`, `form-action 'none'`).
- Schema validation for every file Wolf reads.
