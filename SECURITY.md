# Security

Wolf handles financial records and client details, so it is built to keep
them on the user's machine and to give the app as little power as possible.

## Threat model in brief

| Concern                                          | What Wolf does                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data leaving the machine                         | No network code, no telemetry, no account. The Content-Security-Policy allows no remote connections, images or fonts. VAT numbers are not checked against online services for the same reason.                                                                                                                                                                                                   |
| A compromised or buggy webview reaching the disk | Tauri capabilities scope file access to `Documents/Wolf` and its `backups/` and `pdf/` folders. There is no shell, dialog or URL-opening permission. Verified by `tests/desktop/smoke.mjs`, which tries to read `/etc/passwd` and open a URL from inside the app and expects both to be refused.                                                                                                 |
| Script injection                                 | React escapes all rendered text. The CSP allows scripts only from the app bundle and forbids `eval`; `wasm-unsafe-eval` is allowed because the PDF layout engine is WebAssembly. A unit test fails if `dangerouslySetInnerHTML`, `eval`, `new Function` or `innerHTML =` appears in `src/`.                                                                                                      |
| A malicious or damaged backup file               | Imports are size-limited, parsed, and validated against the full schema before anything is replaced; one bad field rejects the whole file. Document numbers that could act as file paths are rejected, and logos that are not embedded PNG/JPEG/WebP images are stripped (a remote logo URL could otherwise be used for tracking). The current data is snapshotted before an import replaces it. |
| Losing data                                      | Atomic writes (temp file + rename), the previous save kept as `.bak`, 14 daily copies, and a recovery path that never overwrites an unreadable data file.                                                                                                                                                                                                                                        |
| Tampering with issued invoices                   | The rules that make issued documents immutable and numbering gapless are enforced in `src/lib/actions.ts`, independent of the UI, and covered by tests. The data file itself is plain JSON and is not signed: someone with write access to your Documents folder can edit it.                                                                                                                    |

## Deliberate trade-offs

- `freezePrototype` is off. React-pdf's dependencies patch built-in
  prototypes, and with the flag on, PDF generation fails inside the desktop
  webview. The CSP is the main defence against the injection that prototype
  freezing would mitigate.
- `style-src 'unsafe-inline'` is allowed because React applies inline style
  attributes. Inline scripts remain forbidden.
- Releases are unsigned until code-signing certificates are in place (see
  the README).

## Reporting a problem

Please open a private security advisory on GitHub
(Security > Report a vulnerability) rather than a public issue.
