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
