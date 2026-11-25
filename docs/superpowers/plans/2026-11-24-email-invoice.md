# Email Invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the signed-in user email the invoice currently on screen, as a PDF attachment, straight to a client via Resend.

**Architecture:** invoice-2-0 is a static site (no package.json, no build) on Vercel. A new Vercel Node serverless function `api/send-invoice.js` holds the Resend key (env var `RESEND_API_KEY`), verifies the caller's Supabase session, and calls the Resend REST API. The browser builds the same jsPDF document it already downloads, base64-encodes it, and POSTs it to the function from a small "Email Invoice" modal.

**Tech Stack:** Vanilla JS, jsPDF 2.5.1 + autotable (CDN), supabase-js v2 (CDN), Vercel Node functions (CommonJS, Node 18+ global `fetch`), Resend REST API, `node --test` for the function's tests.

## Global Constraints

- Never put `RESEND_API_KEY` (or any secret) in the browser, in git, or in test fixtures. The function reads `process.env.RESEND_API_KEY` only. Tests use the literal fake value `test-key`.
- From address: `Rose Legacy Home Solutions <no-reply@roselegacyhs.com>` (domain already verified in Resend). Reply-To: `roselegacyhs@icloud.com`.
- Email content is the PDF attachment only — no view link, no pay button.
- The function rejects callers without a valid Supabase session (verified by calling `GET {SUPABASE_URL}/auth/v1/user`).
- Supabase URL `https://wrlwhnjqnsfkpyihumqd.supabase.co` and the publishable key already public in `app.js:10-11` may be reused in the function (they are not secrets).
- No npm dependencies; no package.json. CommonJS in `api/`.
- Match the existing UI: reuse `.consolidate-modal-backdrop` / `.consolidate-modal` / `.consolidate-actions` / `.btn` / `.field` / `.field-input` / `.field-label` classes and `showToast()`.
- Do not change the downloaded PDF's appearance.

---

### Task 1: `api/send-invoice.js` serverless function

**Files:**
- Create: `api/send-invoice.js`
- Test: `api/send-invoice.test.js`

**Interfaces:**
- Produces: `POST /api/send-invoice`
  - Headers: `Authorization: Bearer <supabase access_token>`, `Content-Type: application/json`
  - Body: `{ to: string, pdfBase64: string, invoiceNumber: string, clientName: string, total: string }` (`total` is already formatted, e.g. `"$1,250.00"`)
  - Responses (JSON): `200 {ok:true,id}` · `400 {error}` bad input · `401 {error}` no/invalid session · `405 {error}` non-POST · `500 {error}` missing key · `502 {error}` Resend failure
- Module exports the handler `(req, res) => Promise<void>` as `module.exports`.

- [ ] **Step 1: Write the failing tests** — `api/send-invoice.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const handler = require('./send-invoice.js');

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const goodBody = {
  to: 'client@example.com',
  pdfBase64: Buffer.from('%PDF-1.4 fake').toString('base64'),
  invoiceNumber: 'INV-1001',
  clientName: 'Jane <Doe>',
  total: '$1,250.00',
};
function req(over = {}) {
  return { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { ...goodBody }, ...over };
}
function mockFetch({ authOk = true, resendOk = true } = {}) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/auth/v1/user')) {
      return { ok: authOk, status: authOk ? 200 : 401, json: async () => ({ id: 'u1' }) };
    }
    return { ok: resendOk, status: resendOk ? 200 : 422, json: async () => (resendOk ? { id: 'em_1' } : { message: 'bad' }) };
  };
  return calls;
}

test.beforeEach(() => { process.env.RESEND_API_KEY = 'test-key'; });

test('rejects non-POST', async () => {
  const res = mockRes(); mockFetch();
  await handler(req({ method: 'GET' }), res);
  assert.strictEqual(res.statusCode, 405);
});

test('rejects missing bearer token', async () => {
  const res = mockRes(); mockFetch();
  await handler(req({ headers: {} }), res);
  assert.strictEqual(res.statusCode, 401);
});

test('rejects invalid session', async () => {
  const res = mockRes(); mockFetch({ authOk: false });
  await handler(req(), res);
  assert.strictEqual(res.statusCode, 401);
});

test('rejects bad email', async () => {
  const res = mockRes(); mockFetch();
  await handler(req({ body: { ...goodBody, to: 'not-an-email' } }), res);
  assert.strictEqual(res.statusCode, 400);
});

test('rejects missing pdf', async () => {
  const res = mockRes(); mockFetch();
  await handler(req({ body: { ...goodBody, pdfBase64: '' } }), res);
  assert.strictEqual(res.statusCode, 400);
});

test('rejects oversized pdf', async () => {
  const res = mockRes(); mockFetch();
  await handler(req({ body: { ...goodBody, pdfBase64: 'A'.repeat(3_500_001) } }), res);
  assert.strictEqual(res.statusCode, 400);
});

test('500 when RESEND_API_KEY missing', async () => {
  delete process.env.RESEND_API_KEY;
  const res = mockRes(); mockFetch();
  await handler(req(), res);
  assert.strictEqual(res.statusCode, 500);
});

test('sends via Resend with attachment, from, reply_to, escaped html', async () => {
  const res = mockRes(); const calls = mockFetch();
  await handler(req(), res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { ok: true, id: 'em_1' });
  const send = calls.find(c => c.url === 'https://api.resend.com/emails');
  assert.ok(send, 'called Resend');
  assert.strictEqual(send.opts.headers.Authorization, 'Bearer test-key');
  const payload = JSON.parse(send.opts.body);
  assert.strictEqual(payload.from, 'Rose Legacy Home Solutions <no-reply@roselegacyhs.com>');
  assert.strictEqual(payload.reply_to, 'roselegacyhs@icloud.com');
  assert.deepStrictEqual(payload.to, ['client@example.com']);
  assert.strictEqual(payload.subject, 'Invoice INV-1001 from Rose Legacy Home Solutions');
  assert.strictEqual(payload.attachments[0].filename, 'invoice-INV-1001.pdf');
  assert.strictEqual(payload.attachments[0].content, goodBody.pdfBase64);
  assert.ok(payload.html.includes('Jane &lt;Doe&gt;'));
  assert.ok(!payload.html.includes('<Doe>'));
  assert.ok(payload.html.includes('$1,250.00'));
});

test('502 when Resend fails', async () => {
  const res = mockRes(); mockFetch({ resendOk: false });
  await handler(req(), res);
  assert.strictEqual(res.statusCode, 502);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test api/`
Expected: FAIL — `Cannot find module './send-invoice.js'`

- [ ] **Step 3: Implement** — `api/send-invoice.js`:

```js
const SUPABASE_URL = 'https://wrlwhnjqnsfkpyihumqd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xmLLVF_W4gQIhIAewv5zRg_YgKAH3wI';
const FROM = 'Rose Legacy Home Solutions <no-reply@roselegacyhs.com>';
const REPLY_TO = 'roselegacyhs@icloud.com';
// Vercel caps request bodies at 4.5 MB; leave headroom for the JSON envelope.
const MAX_PDF_BASE64 = 3_500_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildHtml({ clientName, invoiceNumber, total }) {
  const greeting = clientName ? `Hello ${esc(clientName)},` : 'Hello,';
  return `<div style="font-family:Arial,sans-serif;color:#2b2640;font-size:15px;line-height:1.5;max-width:560px">
  <p>${greeting}</p>
  <p>Please find attached invoice <strong>${esc(invoiceNumber)}</strong> from Rose Legacy Home Solutions LLC${total ? `, for a total of <strong>${esc(total)}</strong>` : ''}.</p>
  <p>If you have any questions, just reply to this email or call 816 298 4828.</p>
  <p>Thank you for your business!<br/>Rose Legacy Home Solutions LLC</p>
</div>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Session expired — sign in again' });

  const { to, pdfBase64, invoiceNumber, clientName, total } = req.body || {};
  const recipient = String(to || '').trim();
  if (!EMAIL_RE.test(recipient)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!pdfBase64 || typeof pdfBase64 !== 'string') return res.status(400).json({ error: 'Missing invoice PDF' });
  if (pdfBase64.length > MAX_PDF_BASE64) return res.status(400).json({ error: 'Invoice PDF is too large to email' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Email is not configured on the server' });

  const number = String(invoiceNumber || '').trim() || 'invoice';
  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      reply_to: REPLY_TO,
      to: [recipient],
      subject: `Invoice ${number} from Rose Legacy Home Solutions`,
      html: buildHtml({ clientName, invoiceNumber: number, total }),
      attachments: [{ filename: `invoice-${number}.pdf`, content: pdfBase64 }],
    }),
  });
  const result = await sendRes.json().catch(() => ({}));
  if (!sendRes.ok) return res.status(502).json({ error: result.message || 'Email service rejected the message' });

  return res.status(200).json({ ok: true, id: result.id });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test api/`
Expected: 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add api/send-invoice.js api/send-invoice.test.js
git commit -m "feat: add send-invoice serverless function using Resend"
```

---

### Task 2: "Email Invoice" button, modal, and PDF reuse in the browser

**Files:**
- Modify: `app.js` — PDF block at `$('#btn-generate').addEventListener('click', …)` (~line 1873–2028); `linkProperty()` inside `initPropertySelector()` (~line 225); places that reset `linkedPropertyId = null` (~lines 243, 284, 2042)
- Modify: `index.html` — toolbar after `#btn-generate` (~line 112); new modal before `<!-- Overhead settings modal -->` (~line 621)
- Modify: `style.css` — only if the modal needs a width rule (optional)

**Interfaces:**
- Consumes: `POST /api/send-invoice` from Task 1 (exact body/response shape above).
- Produces (inside app.js closure): `buildInvoicePDF(data, calc, logoImg) → jsPDF doc` (pure; no save/toast); `let linkedClientEmail = ''`.

- [ ] **Step 1: Extract the PDF builder.** Move everything inside the `loadLogoForPDF(logoImg => { … })` callback of `#btn-generate`, from `const { jsPDF } = window.jspdf;` through the closing footer block (just before `doc.save(...)`), into a new function placed directly above the `#btn-generate` listener:

```js
  function buildInvoicePDF(data, calc, logoImg) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    // … existing body moved verbatim …
    return doc;
  }
```

The `dateStr` const used by the filename must still be available to the caller, so the listener becomes:

```js
  $('#btn-generate').addEventListener('click', () => {
    const data = collectData();
    const problems = validateInvoice(data);
    if (problems.length) { showToast(problems[0]); return; }
    const calc = computeTotals();
    loadLogoForPDF(logoImg => {
      const doc = buildInvoicePDF(data, calc, logoImg);
      const dateStr = data.invoice.date || new Date().toISOString().slice(0, 10);
      doc.save(`invoice-${data.invoice.number || dateStr}.pdf`);
      showToast('Invoice PDF downloaded ✓');
    });
  });
```

Verify by diff that the moved drawing code is byte-identical apart from indentation.

- [ ] **Step 2: Remember the linked property's client email.** Next to `let linkedPropertyId = null;` (~line 111) add `let linkedClientEmail = '';`. In `linkProperty(prop)` add `linkedClientEmail = prop.client_email || '';`. Wherever `linkedPropertyId = null;` is set, also set `linkedClientEmail = '';`.

- [ ] **Step 3: Add the toolbar button** in `index.html` directly after the `#btn-generate` button:

```html
        <button id="btn-email-invoice" class="btn btn-ghost">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>
          Email Invoice
        </button>
```

- [ ] **Step 4: Add the modal** in `index.html` just before `<!-- Overhead settings modal -->`:

```html
  <!-- Email invoice modal -->
  <div id="email-modal-backdrop" class="consolidate-modal-backdrop" style="display:none;">
    <div class="consolidate-modal">
      <h2>Email Invoice</h2>
      <p class="consolidate-modal-sub" id="email-modal-sub">The invoice PDF will be attached.</p>
      <label class="field">
        <span class="field-label">Send to</span>
        <input id="email-to" type="email" class="field-input" placeholder="client@example.com" autocomplete="email"/>
      </label>
      <p id="email-error" style="color:#b91c1c;font-size:13px;margin:8px 0 0;min-height:1em;"></p>
      <div class="consolidate-actions">
        <button class="btn btn-ghost" id="btn-email-cancel" type="button">Cancel</button>
        <button class="btn btn-primary" id="btn-email-send" type="button">Send</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 5: Wire the modal** in `app.js`, directly after the `#btn-generate` listener:

```js
  /* ── Email invoice (Resend via /api/send-invoice) ─── */
  const emailBackdrop = $('#email-modal-backdrop');
  const emailToEl = $('#email-to');
  const emailErrEl = $('#email-error');
  const emailSendBtn = $('#btn-email-send');

  function closeEmailModal() { emailBackdrop.style.display = 'none'; }

  $('#btn-email-invoice').addEventListener('click', () => {
    const data = collectData();
    const problems = validateInvoice(data);
    if (problems.length) { showToast(problems[0]); return; }
    emailToEl.value = linkedClientEmail;
    emailErrEl.textContent = '';
    $('#email-modal-sub').textContent =
      `Invoice ${data.invoice.number || ''} for ${data.invoice.client || 'client'} — the PDF will be attached.`;
    emailBackdrop.style.display = 'flex';
    emailToEl.focus();
  });

  $('#btn-email-cancel').addEventListener('click', closeEmailModal);
  emailBackdrop.addEventListener('click', e => { if (e.target === emailBackdrop) closeEmailModal(); });
  emailToEl.addEventListener('keydown', e => { if (e.key === 'Enter') emailSendBtn.click(); });

  emailSendBtn.addEventListener('click', async () => {
    const to = emailToEl.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { emailErrEl.textContent = 'Enter a valid email address.'; return; }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) { emailErrEl.textContent = 'Your session expired — sign in again.'; return; }

    const data = collectData();
    const calc = computeTotals();
    emailSendBtn.disabled = true;
    emailSendBtn.textContent = 'Sending…';
    emailErrEl.textContent = '';
    loadLogoForPDF(async logoImg => {
      try {
        const doc = buildInvoicePDF(data, calc, logoImg);
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const res = await fetch('/api/send-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            to,
            pdfBase64,
            invoiceNumber: data.invoice.number,
            clientName: data.invoice.client,
            total: currency.format(calc.total),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { emailErrEl.textContent = body.error || 'Could not send the email.'; return; }
        closeEmailModal();
        showToast(`Invoice emailed to ${to} ✓`);
      } catch (err) {
        console.error('Email invoice failed:', err);
        emailErrEl.textContent = 'Could not send the email. Check your connection and try again.';
      } finally {
        emailSendBtn.disabled = false;
        emailSendBtn.textContent = 'Send';
      }
    });
  });
```

(If `currency`'s variable name differs, use the existing formatter used in the PDF totals block.)

- [ ] **Step 6: Verify**
  - `node --check app.js` → no output.
  - `node --test api/` → still 9 PASS.
  - Serve locally (`npx --yes serve -l 4321 .` or `python3 -m http.server 4321`) and confirm in a browser: page loads with no console errors; "Download Invoice PDF" still downloads an identical-looking PDF; "Email Invoice" opens the modal, prefilled with the linked property's `client_email` when one is linked; Cancel / backdrop click closes it; invalid email shows the inline error. (Actual sending needs the deployed function + `RESEND_API_KEY`; a local POST to `/api/send-invoice` will 404 on a static server — that's expected and must surface the inline error, not crash.)

- [ ] **Step 7: Commit**

```bash
git add app.js index.html style.css
git commit -m "feat: email invoice PDF to client from the invoice screen"
```

---

## Post-implementation (user action, not a subagent task)

- In Vercel → invoice-2-0 project → Settings → Environment Variables, add `RESEND_API_KEY` (Production + Preview). The user enters the value; never the assistant.
- Redeploy, then send a test invoice to the user's own address.
