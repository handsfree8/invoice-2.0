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
