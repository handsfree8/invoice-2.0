(function () {
  'use strict';

  /* ── Utilities ─────────────────────────────────── */
  const $ = (sel) => document.querySelector(sel);
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  $('#year').textContent = new Date().getFullYear();

  /* ── Supabase (auth + invoice history) ──────────── */
  const SUPABASE_URL = 'https://mlkzuoxeepoqeygpklgj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sa3p1b3hlZXBvcWV5Z3BrbGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Nzg1ODYsImV4cCI6MjA5NjQ1NDU4Nn0.aNpe29X_doX7brZEOg628JWxOefnwqVSvW3LUOWxFss';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const loginOverlay = $('#login-overlay');
  const loginEmailEl = $('#login-email');
  const loginPasswordEl = $('#login-password');
  const loginErrorEl = $('#login-error');

  function showApp() {
    loginOverlay.classList.add('hidden');
  }
  function showLogin(message) {
    loginOverlay.classList.remove('hidden');
    if (message) loginErrorEl.textContent = message;
  }

  $('#btn-login').addEventListener('click', async () => {
    loginErrorEl.textContent = '';
    const email = loginEmailEl.value.trim();
    const password = loginPasswordEl.value;
    if (!email || !password) {
      loginErrorEl.textContent = 'Enter your email and password.';
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      loginErrorEl.textContent = error.message;
      return;
    }
    loginPasswordEl.value = '';
    showApp();
  });

  loginPasswordEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-login').click();
  });

  $('#btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    showLogin();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showApp();
      loadHistory();
    } else {
      showLogin();
    }
  });

  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      showApp();
      loadHistory();
    } else {
      showLogin();
    }
  });

  /* ── Save invoice to history (Supabase) ──────────── */
  async function saveInvoiceToHistory(data, calc) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData && userData.user;
      if (!user) return;

      const { data: inserted, error: invErr } = await supabase
        .from('invoices')
        .insert({
          user_id: user.id,
          invoice_number: data.invoice.number || null,
          invoice_date: data.invoice.date || null,
          client_name: data.invoice.client || null,
          payment_method: data.invoice.paymentMethod || null,
          terms: data.invoice.terms || null,
          notes: data.invoice.notes || null,
          warranty_disclaimer: data.warrantyDisclaimer || null,
          tax_rate: Number(data.invoice.taxRate || 0),
          discount_rate: Number(data.invoice.discountRate || 0),
          subtotal: calc.sub,
          tax_amount: calc.tax,
          discount_amount: calc.disc,
          total: calc.total,
        })
        .select()
        .single();

      if (invErr) { console.error('Save invoice failed:', invErr); return; }

      const items = data.items
        .filter(it => it.description && it.description.trim())
        .map((it, idx) => ({
          invoice_id: inserted.id,
          description: it.description,
          qty: Number(it.qty || 0),
          unit_price: Number(it.price || 0),
          line_total: (Number(it.qty || 0)) * Number(it.price || 0),
          position: idx,
        }));

      if (items.length) {
        const { error: itemsErr } = await supabase.from('invoice_items').insert(items);
        if (itemsErr) console.error('Save invoice items failed:', itemsErr);
      }

      loadHistory();
    } catch (err) {
      console.error('Unexpected error saving invoice history:', err);
    }
  }

  /* ── History screen ──────────────────────────────── */
  const historyBody = $('#history-body');
  const historyEmpty = $('#history-empty');

  async function loadHistory() {
    if (!historyBody) return;

    const clientFilter = ($('#history-filter-client')?.value || '').trim().toLowerCase();
    const fromFilter   = $('#history-filter-from')?.value || '';
    const toFilter     = $('#history-filter-to')?.value || '';
    const statusFilter = $('#history-filter-status')?.value || '';

    let query = supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(200);
    if (fromFilter) query = query.gte('invoice_date', fromFilter);
    if (toFilter)   query = query.lte('invoice_date', toFilter);
    if (statusFilter) query = query.eq('payment_status', statusFilter);

    const { data: rows, error } = await query;

    if (error) {
      console.error('Load history failed:', error);
      return;
    }

    let filtered = rows || [];
    if (clientFilter) {
      filtered = filtered.filter(inv => (inv.client_name || '').toLowerCase().includes(clientFilter));
    }

    historyBody.innerHTML = '';
    if (filtered.length === 0) {
      historyEmpty.style.display = '';
      return;
    }
    historyEmpty.style.display = 'none';

    filtered.forEach(inv => {
      const tr = document.createElement('tr');
      const status = inv.payment_status || 'pending';
      tr.innerHTML = `
        <td>${escHtml(inv.invoice_number || '—')}</td>
        <td>${escHtml(inv.invoice_date || '—')}</td>
        <td>${escHtml(inv.client_name || '—')}</td>
        <td class="col-num">${currency.format(Number(inv.total || 0))}</td>
        <td>${escHtml(inv.payment_method || '—')}</td>
        <td>
          <select class="status-select status-${status}" data-id="${inv.id}">
            <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="paid" ${status === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="overdue" ${status === 'overdue' ? 'selected' : ''}>Overdue</option>
          </select>
        </td>
        <td class="col-action">
          <div class="history-actions">
            <button class="btn btn-sm btn-load" data-id="${inv.id}" data-mode="load">Load</button>
            <button class="btn btn-sm btn-load" data-id="${inv.id}" data-mode="duplicate">Duplicate</button>
            <button class="btn btn-sm btn-danger btn-delete" data-id="${inv.id}">Delete</button>
          </div>
        </td>
      `;
      historyBody.appendChild(tr);
    });

    historyBody.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', () => updateInvoiceStatus(sel.dataset.id, sel.value, sel));
    });
    historyBody.querySelectorAll('.btn-load').forEach(btn => {
      btn.addEventListener('click', () => loadInvoiceFromHistory(btn.dataset.id, btn.dataset.mode));
    });
    historyBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteInvoiceFromHistory(btn.dataset.id));
    });
  }

  async function updateInvoiceStatus(id, status, selectEl) {
    const patch = { payment_status: status };
    patch.paid_at = status === 'paid' ? new Date().toISOString() : null;
    const { error } = await supabase.from('invoices').update(patch).eq('id', id);
    if (error) {
      showToast('Could not update status.');
      console.error('Update status failed:', error);
      return;
    }
    if (selectEl) {
      selectEl.classList.remove('status-pending', 'status-paid', 'status-overdue');
      selectEl.classList.add('status-' + status);
    }
    showToast('Status updated ✓');
  }

  async function deleteInvoiceFromHistory(id) {
    if (!window.confirm('Delete this invoice from your history? This cannot be undone.')) return;
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) {
      showToast('Could not delete invoice.');
      console.error('Delete invoice failed:', error);
      return;
    }
    showToast('Invoice deleted from history.');
    loadHistory();
  }

  async function loadInvoiceFromHistory(id, mode) {
    const { data: inv, error: invErr } = await supabase.from('invoices').select('*').eq('id', id).single();
    if (invErr || !inv) {
      showToast('Could not load invoice.');
      console.error('Load invoice failed:', invErr);
      return;
    }
    const { data: items, error: itemsErr } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', id)
      .order('position', { ascending: true });
    if (itemsErr) console.error('Load invoice items failed:', itemsErr);

    const isDuplicate = mode === 'duplicate';
    const payload = {
      invoice: {
        number:        isDuplicate ? '' : (inv.invoice_number || ''),
        date:          isDuplicate ? new Date().toISOString().slice(0, 10) : (inv.invoice_date || ''),
        client:        inv.client_name || '',
        taxRate:       Number(inv.tax_rate || 0),
        discountRate:  Number(inv.discount_rate || 0),
        paymentMethod: inv.payment_method || 'Cash',
        terms:         inv.terms || '',
        notes:         inv.notes || '',
      },
      items: (items || []).map(it => ({
        description: it.description || '',
        qty: Number(it.qty || 0),
        price: Number(it.unit_price || 0),
      })),
      warrantyDisclaimer: inv.warranty_disclaimer || '',
    };

    loadData(payload);

    // Switch to the Invoice tab so the user can review/edit/regenerate
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const invoiceTab = document.querySelector('.nav-item[data-section="invoice"]');
    if (invoiceTab) invoiceTab.classList.add('active');
    $('#section-invoice').classList.add('active');
    $('#page-title').textContent = 'Invoice';

    showToast(isDuplicate ? 'Invoice duplicated — review and generate ✓' : 'Invoice loaded — review and regenerate ✓');
  }

  const refreshHistoryBtn = $('#btn-refresh-history');
  if (refreshHistoryBtn) refreshHistoryBtn.addEventListener('click', loadHistory);
  ['history-filter-client', 'history-filter-from', 'history-filter-to', 'history-filter-status'].forEach(id => {
    const el = $('#' + id);
    if (el) el.addEventListener('change', loadHistory);
  });
  const historyClientFilterEl = $('#history-filter-client');
  if (historyClientFilterEl) {
    let debounceTimer;
    historyClientFilterEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadHistory, 350);
    });
  }

  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ── Sidebar Navigation ─────────────────────────── */
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.dataset.section;
      $('#section-' + key).classList.add('active');
      $('#page-title').textContent = key === 'invoice' ? 'Invoice' : key === 'estimate' ? 'Ball Park Estimate' : 'Invoice History';
      if (key === 'history') loadHistory();
    });
  });

  /* ── Invoice Items ───────────────────────────────── */
  const itemsBody    = $('#items-body');
  const taxRateEl    = $('#tax-rate');
  const discountEl   = $('#discount-rate');
  const subtotalEl   = $('#subtotal');
  const taxAmountEl  = $('#tax-amount');
  const discAmountEl = $('#discount-amount');
  const totalEl      = $('#total');

  function addRow(data = { description: '', qty: 1, price: 0 }) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="w" type="text" value="${escHtml(data.description)}" placeholder="Service description"/></td>
      <td><input class="qty" type="number" min="0" value="${data.qty}"/></td>
      <td><input class="price" type="number" min="0" step="0.01" value="${data.price}"/></td>
      <td class="line-total">$0.00</td>
      <td><button class="btn btn-icon" title="Remove row">✕</button></td>
    `;
    itemsBody.appendChild(tr);
    tr.querySelectorAll('input').forEach(i => i.addEventListener('input', computeTotals));
    tr.querySelector('button').addEventListener('click', () => { tr.remove(); computeTotals(); });
    computeTotals();
  }

  function getRows() {
    return [...itemsBody.querySelectorAll('tr')].map(tr => ({
      description: tr.querySelector('.w').value.trim(),
      qty:   Number(tr.querySelector('.qty').value   || 0),
      price: Number(tr.querySelector('.price').value || 0),
    }));
  }

  function computeTotals() {
    let sub = 0;
    itemsBody.querySelectorAll('tr').forEach(tr => {
      const q = Number(tr.querySelector('.qty').value   || 0);
      const p = Number(tr.querySelector('.price').value || 0);
      const t = q * p;
      tr.querySelector('.line-total').textContent = currency.format(t);
      sub += t;
    });
    const taxPct  = Number(taxRateEl.value  || 0) / 100;
    const discPct = Number(discountEl.value || 0) / 100;
    const tax  = sub * taxPct;
    const disc = sub * discPct;
    const total = sub + tax - disc;
    subtotalEl.textContent   = currency.format(sub);
    taxAmountEl.textContent  = currency.format(tax);
    discAmountEl.textContent = currency.format(disc);
    totalEl.textContent      = currency.format(total);
    return { sub, tax, disc, total };
  }

  $('#btn-add').addEventListener('click', () => addRow());
  taxRateEl.addEventListener('input', computeTotals);
  discountEl.addEventListener('input', computeTotals);

  /* ── Estimate Items ──────────────────────────────── */
  const estBody       = $('#estimate-body');
  const estSubtotalEl = $('#estimate-subtotal');
  const estTotalEl    = $('#estimate-total');

  function addEstimateRow(data = { description: '', qty: 1, price: 0 }) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="w" type="text" value="${escHtml(data.description)}" placeholder="Service description"/></td>
      <td><input class="qty" type="number" min="0" value="${data.qty}"/></td>
      <td><input class="price" type="number" min="0" step="0.01" value="${data.price}"/></td>
      <td class="line-total">$0.00</td>
      <td><button class="btn btn-icon" title="Remove row">✕</button></td>
    `;
    estBody.appendChild(tr);
    tr.querySelectorAll('input').forEach(i => i.addEventListener('input', computeEstimateTotals));
    tr.querySelector('button').addEventListener('click', () => { tr.remove(); computeEstimateTotals(); });
    computeEstimateTotals();
  }

  function getEstimateRows() {
    return [...estBody.querySelectorAll('tr')].map(tr => ({
      description: tr.querySelector('.w').value.trim(),
      qty:   Number(tr.querySelector('.qty').value   || 0),
      price: Number(tr.querySelector('.price').value || 0),
    }));
  }

  function computeEstimateTotals() {
    let sub = 0;
    estBody.querySelectorAll('tr').forEach(tr => {
      const q = Number(tr.querySelector('.qty').value   || 0);
      const p = Number(tr.querySelector('.price').value || 0);
      const t = q * p;
      tr.querySelector('.line-total').textContent = currency.format(t);
      sub += t;
    });
    estSubtotalEl.textContent = currency.format(sub);
    estTotalEl.textContent    = currency.format(sub);
    return { sub };
  }

  $('#btn-add-estimate').addEventListener('click', () => addEstimateRow());
  if (estBody.children.length === 0) addEstimateRow();

  /* ── Warranty Disclaimer ─────────────────────────── */
  const disclaimerEl  = $('#warranty-disclaimer');
  const defaultDisclaimer = `This service includes warranty coverage only for the work performed today.\n\nAny future issues unrelated to these components, such as refrigerant leaks, compressor failure, or problems with the evaporator coil, are not covered under this warranty and will be quoted separately as new service requests.`;

  function loadDisclaimer() {
    const saved = localStorage.getItem('warrantyDisclaimer');
    disclaimerEl.value = saved !== null ? saved : defaultDisclaimer;
  }
  $('#btn-save-disclaimer').addEventListener('click', () => {
    localStorage.setItem('warrantyDisclaimer', disclaimerEl.value.trim());
    showToast('Disclaimer saved ✓');
  });
  loadDisclaimer();

  /* ── Notes ───────────────────────────────────────── */
  const notesEl = $('#notes');
  function loadNotes() {
    const saved = localStorage.getItem('invoiceNotes');
    if (saved !== null) notesEl.value = saved;
  }
  $('#btn-save-notes').addEventListener('click', () => {
    localStorage.setItem('invoiceNotes', notesEl.value.trim());
    showToast('Notes saved ✓');
  });
  loadNotes();

  /* ── Validation ──────────────────────────────────── */
  // Returns a list of human-readable problems with the invoice, or an empty
  // array if it's good to go. Keeps PDFs from going out incomplete (no client,
  // no items, zero-value lines, etc).
  function validateInvoice(data) {
    const problems = [];

    if (!data.invoice.number.trim()) problems.push('Add an invoice number.');
    if (!data.invoice.client.trim()) problems.push('Add the client name.');
    if (!data.invoice.date) problems.push('Add the invoice date.');

    const items = data.items;
    const hasUsableItem = items.some(it => it.description.trim() && it.qty > 0 && it.price > 0);
    if (items.length === 0 || !hasUsableItem) {
      problems.push('Add at least one line item with a description, quantity, and price.');
    } else {
      const incomplete = items.some(it =>
        (it.description.trim() || it.qty > 0 || it.price > 0) &&
        !(it.description.trim() && it.qty > 0 && it.price > 0)
      );
      if (incomplete) problems.push('Some line items are missing a description, quantity, or price.');
    }

    return problems;
  }

  /* ── Data Collect / Load ─────────────────────────── */
  function collectData() {
    return {
      company: {
        name: 'Rose Legacy Home Solutions LLC',
        address: 'Overland Park, KS',
        phone: '816 298 4828',
        email: 'appointments@roselegacyhvac.com',
      },
      invoice: {
        number:        $('#inv-number').value || '',
        date:          $('#inv-date').value   || '',
        client:        $('#client-name').value || '',
        taxRate:       Number(taxRateEl.value || 0),
        discountRate:  Number(discountEl.value || 0),
        paymentMethod: $('#payment-method').value || 'Cash',
        terms:         $('#terms').value || '',
        notes:         localStorage.getItem('invoiceNotes') || notesEl.value || '',
      },
      items: getRows(),
      warrantyDisclaimer: localStorage.getItem('warrantyDisclaimer') || disclaimerEl.value.trim(),
      estimate: getEstimateRows(),
    };
  }

  function loadData(d) {
    $('#inv-number').value     = d.invoice?.number        || '';
    $('#inv-date').value       = d.invoice?.date          || '';
    $('#client-name').value    = d.invoice?.client        || '';
    taxRateEl.value            = d.invoice?.taxRate       ?? 0;
    discountEl.value           = d.invoice?.discountRate  ?? 0;
    $('#payment-method').value = d.invoice?.paymentMethod || 'Cash';
    $('#terms').value          = d.invoice?.terms         || '';
    notesEl.value              = d.invoice?.notes         || '';
    itemsBody.innerHTML = '';
    (d.items || []).forEach(addRow);
    if ((d.items || []).length === 0) addRow();
    computeTotals();
    if (d.warrantyDisclaimer) disclaimerEl.value = d.warrantyDisclaimer;
    if (d.estimate) {
      estBody.innerHTML = '';
      d.estimate.forEach(addEstimateRow);
      if (d.estimate.length === 0) addEstimateRow();
    }
    localStorage.setItem('invoiceNotes', notesEl.value.trim());
    localStorage.setItem('warrantyDisclaimer', disclaimerEl.value.trim());
    showToast('Invoice loaded ✓');
  }

  /* ── JSON Save / Load ────────────────────────────── */
  $('#btn-save-json').addEventListener('click', () => {
    const data = collectData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `invoice-${data.invoice.number || stamp}.json`;
    a.click();
    showToast('Saved as JSON ✓');
  });

  $('#file-json').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const txt = await file.text();
      loadData(JSON.parse(txt));
    } catch {
      showToast('Error reading JSON file');
    }
    e.target.value = '';
  });

  /* ── PDF Helper ──────────────────────────────────── */
  function loadLogoForPDF(callback) {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = 'logo.png';
    img.onload = () => callback(img);
    img.onerror = () => callback(null);
  }

  function drawPDFHeader(doc, logoImg, y) {
    const left = 40;
    if (logoImg) {
      doc.addImage(logoImg, 'PNG', left, y - 10, 42, 42);
    }
    const tx = left + 58;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Rose Legacy Home Solutions LLC', tx, y);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('HVAC Services | Overland Park, KS', tx, y + 14);
    doc.text('Phone: 816 298 4828 | Email: appointments@roselegacyhvac.com', tx, y + 26);
    // Small gap below the logo/contact block so the accent line sits close to
    // the header without overlapping the logo or text.
    return y + 46;
  }

  function wrapText(doc, txt, maxWidth) {
    const lines = [];
    (txt || '').split('\n').forEach(para => {
      const words = para.split(' ');
      let line = '';
      words.forEach(w => {
        const test = line ? line + ' ' + w : w;
        if (doc.getTextWidth(test) > maxWidth) { lines.push(line); line = w; }
        else line = test;
      });
      if (line) lines.push(line);
    });
    return lines;
  }

  /* ── Download Invoice PDF ────────────────────────── */
  $('#btn-generate').addEventListener('click', () => {
    const data = collectData();

    const problems = validateInvoice(data);
    if (problems.length) {
      showToast(problems[0]);
      return;
    }

    const calc = computeTotals();
    loadLogoForPDF(logoImg => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const left = 40, right = 555;
      let y = drawPDFHeader(doc, logoImg, 48);

      // Purple accent line — sits right under the logo/header block, separating
      // the company branding from the invoice details below.
      doc.setDrawColor(74, 32, 128);
      doc.setLineWidth(1.5);
      doc.line(left, y, right, y);
      y += 34; // generous breathing room before the INVOICE title

      // Invoice title + meta
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(74, 32, 128);
      doc.text('INVOICE', left, y);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const dateStr = data.invoice.date || new Date().toISOString().slice(0, 10);
      doc.text(`Invoice #: ${data.invoice.number || '—'}`, right - 160, y - 15);
      doc.text(`Date: ${dateStr}`, right - 160, y + 1);
      y += 30; // clear separation between the title block and the client line
      doc.setFont('helvetica', 'bold');
      doc.text(`Client: `, left, y);
      doc.setFont('helvetica', 'normal');
      doc.text(data.invoice.client || '—', left + 40, y);
      y += 14;

      // Items table
      const tableBody = data.items.map(it => [
        it.description,
        String(it.qty || 0),
        currency.format(Number(it.price || 0)),
        currency.format((it.qty || 0) * Number(it.price || 0)),
      ]);
      doc.autoTable({
        startY: y + 8,
        head: [['Description', 'Qty', 'Unit Price', 'Total']],
        body: tableBody,
        styles: { fontSize: 10, font: 'helvetica' },
        headStyles: { fillColor: [74, 32, 128], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 260 },
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        },
        theme: 'grid',
        margin: { left, right: 40 },
      });

      let endY = doc.autoTable.previous.finalY + 20;

      // Totals
      const rows = [
        ['Subtotal:', currency.format(calc.sub)],
        [`Tax (${data.invoice.taxRate || 0}%):`, currency.format(calc.tax)],
        [`Discount (${data.invoice.discountRate || 0}%):`, '-' + currency.format(calc.disc)],
        ['Total Amount Due:', currency.format(calc.total)],
      ];
      rows.forEach((row, i) => {
        const isTotal = row[0].includes('Total Amount');
        if (isTotal) {
          // Separator line above the final total for visual hierarchy
          doc.setDrawColor(225, 225, 230);
          doc.setLineWidth(0.75);
          doc.line(right - 180, endY + i * 16 - 11, right, endY + i * 16 - 11);
        }
        doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
        doc.setFontSize(isTotal ? 12 : 10);
        if (isTotal) doc.setTextColor(74, 32, 128);
        doc.text(row[0], right - 180, endY + i * 16);
        doc.text(row[1], right, endY + i * 16, { align: 'right' });
        if (isTotal) doc.setTextColor(0, 0, 0);
      });
      endY += rows.length * 16 + 18;

      // Payment & Terms
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Method:', left, endY);
      doc.setFont('helvetica', 'normal');
      doc.text(data.invoice.paymentMethod, left + 95, endY);
      endY += 14;
      if (data.invoice.terms) {
        doc.setFont('helvetica', 'bold');
        doc.text('Terms:', left, endY);
        doc.setFont('helvetica', 'normal');
        doc.text(data.invoice.terms, left + 40, endY);
        endY += 14;
      }

      // Warranty
      endY += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Warranty Disclaimer:', left, endY);
      endY += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      wrapText(doc, data.warrantyDisclaimer, 515).forEach(l => { doc.text(l, left, endY); endY += 13; });

      // Notes
      if (data.invoice.notes) {
        endY += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Notes:', left, endY);
        endY += 14;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        wrapText(doc, data.invoice.notes, 515).forEach(l => { doc.text(l, left, endY); endY += 13; });
      }

      // Closing block — anchored near the bottom of the page so short invoices
      // don't end with a large empty gap below the content.
      const pageHeight = doc.internal.pageSize.getHeight();
      const footerY = pageHeight - 70;
      if (endY < footerY) {
        doc.setDrawColor(74, 32, 128);
        doc.setLineWidth(0.75);
        doc.line(left, footerY, right, footerY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(74, 32, 128);
        doc.text('Thank you for choosing Rose Legacy Home Solutions LLC!', left, footerY + 18);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Questions about this invoice? Call 816 298 4828 or email appointments@roselegacyhvac.com', left, footerY + 32);
      }

      doc.save(`invoice-${data.invoice.number || dateStr}.pdf`);
      showToast('Invoice PDF downloaded ✓');
      saveInvoiceToHistory(data, calc);
    });
  });

  /* ── Download Estimate PDF ───────────────────────── */
  $('#btn-estimate-pdf').addEventListener('click', () => {
    loadLogoForPDF(logoImg => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const left = 40, right = 555;
      let y = drawPDFHeader(doc, logoImg, 48);

      doc.setDrawColor(74, 32, 128);
      doc.setLineWidth(1.5);
      doc.line(left, y, right, y);
      y += 18;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(74, 32, 128);
      doc.text('BALL PARK ESTIMATE', left, y);
      doc.setTextColor(0, 0, 0);
      y += 18;

      const estRows = getEstimateRows();
      const body = estRows.map(it => [
        it.description,
        String(it.qty || 0),
        currency.format(Number(it.price || 0)),
        currency.format((it.qty || 0) * Number(it.price || 0)),
      ]);
      doc.autoTable({
        startY: y + 8,
        head: [['Description', 'Qty', 'Unit Price', 'Total']],
        body,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [74, 32, 128], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 260 },
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        },
        theme: 'grid',
        margin: { left, right: 40 },
      });

      let endY = doc.autoTable.previous.finalY + 20;
      const subtotal = estRows.reduce((sum, it) => sum + (it.qty || 0) * Number(it.price || 0), 0);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(74, 32, 128);
      doc.text('Estimated Total:', right - 180, endY);
      doc.text(currency.format(subtotal), right, endY, { align: 'right' });
      doc.setTextColor(0, 0, 0);

      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`estimate-${stamp}.pdf`);
      showToast('Estimate PDF downloaded ✓');
    });
  });

  /* ── HTML escape helper ──────────────────────────── */
  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Init ────────────────────────────────────────── */
  // Default the invoice date to today so it doesn't have to be set manually
  const invDateEl = $('#inv-date');
  if (invDateEl && !invDateEl.value) {
    invDateEl.value = new Date().toISOString().slice(0, 10);
  }

  // Add one blank row to invoice if empty
  if (itemsBody.children.length === 0) addRow();

})();
