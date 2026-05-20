(function () {
  'use strict';

  /* ── Utilities ─────────────────────────────────── */
  const $ = (sel) => document.querySelector(sel);
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  $('#year').textContent = new Date().getFullYear();

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
      $('#page-title').textContent = key === 'invoice' ? 'Invoice' : 'Ball Park Estimate';
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
    return y + 56;
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
    const calc = computeTotals();
    loadLogoForPDF(logoImg => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const left = 40, right = 555;
      let y = drawPDFHeader(doc, logoImg, 48);

      // Purple accent line
      doc.setDrawColor(74, 32, 128);
      doc.setLineWidth(1.5);
      doc.line(left, y, right, y);
      y += 18;

      // Invoice title + meta
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(74, 32, 128);
      doc.text('INVOICE', left, y);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const dateStr = data.invoice.date || new Date().toISOString().slice(0, 10);
      doc.text(`Invoice #: ${data.invoice.number || '—'}`, right - 160, y - 10);
      doc.text(`Date: ${dateStr}`, right - 160, y);
      y += 16;
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
        [`Discount (${data.invoice.discountRate || 0}%):`, '−' + currency.format(calc.disc)],
        ['Total Amount Due:', currency.format(calc.total)],
      ];
      rows.forEach((row, i) => {
        const isTotal = row[0].includes('Total Amount');
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

      doc.save(`invoice-${data.invoice.number || dateStr}.pdf`);
      showToast('Invoice PDF downloaded ✓');
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
  // Add one blank row to invoice if empty
  if (itemsBody.children.length === 0) addRow();

})();
