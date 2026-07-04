(function () {
  'use strict';

  /* ── Utilities ─────────────────────────────────── */
  const $ = (sel) => document.querySelector(sel);
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  $('#year').textContent = new Date().getFullYear();

  /* ── Supabase (auth + invoice history) ──────────── */
  const SUPABASE_URL = 'https://wrlwhnjqnsfkpyihumqd.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_xmLLVF_W4gQIhIAewv5zRg_YgKAH3wI';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const loginOverlay = $('#login-overlay');
  const loginEmailEl = $('#login-email');
  const loginPasswordEl = $('#login-password');
  const loginErrorEl = $('#login-error');

  function showApp() {
    loginOverlay.classList.add('hidden');
    prefillFromTicket();
    prefillFromInvoiceParam();
    prefillFromProperty();
    prefillNextInvoiceNumber();
  }

  /* ── Auto-increment invoice number ───────────────── */
  async function fetchNextInvoiceNumber() {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number')
        .not('invoice_number', 'is', null);
      if (error || !data || !data.length) return '000001';
      // Compute the highest numeric value, ignoring prefixes like "INV-".
      // String ordering is unreliable (e.g. "INV-000006" sorts above "000354"),
      // so we parse the digits of each and take the numeric max.
      let max = 0;
      for (const row of data) {
        const m = String(row.invoice_number || '').match(/(\d+)/);
        if (m) max = Math.max(max, Number(m[1]));
      }
      return String(max + 1).padStart(6, '0');
    } catch { return '000001'; }
  }

  async function prefillNextInvoiceNumber() {
    // Don't override when loading an existing invoice (?invoice=) or if user already typed one
    if (new URLSearchParams(location.search).get('invoice')) return;
    const el = $('#inv-number');
    if (!el || el.value.trim()) return;
    const next = await fetchNextInvoiceNumber();
    if (!el.value.trim()) el.value = next;
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
      loadKPIs();
    } else {
      showLogin();
    }
  });

  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      showApp();
      loadHistory();
      loadKPIs();
    } else {
      showLogin();
    }
  });

  /* ── Work-order link (?ticket=<uuid>) ────────────── */
  let linkedTicketId = null;
  let linkedPropertyId = null;
  let ticketPrefilled = false;
  // Tracks an already-saved invoice loaded from history, so re-downloading it
  // doesn't insert a duplicate row. null = this is a brand-new invoice.
  let loadedInvoiceId = null;

  let invoicePrefilled = false;

  async function prefillFromInvoiceParam() {
    if (invoicePrefilled) return;
    const invoiceId = new URLSearchParams(location.search).get('invoice');
    if (!invoiceId) return;
    invoicePrefilled = true;
    try {
      await loadInvoiceFromHistory(invoiceId, 'view');
    } catch (err) {
      console.error('Could not load invoice:', err);
    }
  }

  async function prefillFromTicket() {
    if (ticketPrefilled) return;
    const ticketId = new URLSearchParams(location.search).get('ticket');
    if (!ticketId) return;
    ticketPrefilled = true;
    try {
      const { data: t, error } = await supabase
        .from('tickets')
        .select('id, title, unit_number, property_id, properties(name, address, city, state)')
        .eq('id', ticketId)
        .single();
      if (error) throw error;
      linkedTicketId = t.id;
      linkedPropertyId = t.property_id;
      const prop = t.properties;
      const clientEl = $('#client-name');
      if (prop && clientEl && !clientEl.value) clientEl.value = prop.name;
      if (t.title) {
        const firstDesc = itemsBody.querySelector('tr input.w');
        const desc = t.title + (t.unit_number ? ` (Unit ${t.unit_number})` : '');
        if (itemsBody.children.length === 0) {
          addRow({ description: desc, qty: 1, price: 0 });
        } else if (firstDesc && !firstDesc.value) {
          firstDesc.value = desc;
        }
      }
      if (typeof showToast === 'function') {
        showToast(`Linked to work order: ${t.title}` + (prop ? ` — ${prop.name}` : ''));
      }
    } catch (err) {
      console.error('Could not load linked work order:', err);
    }
  }

  /* ── Property link (?property=<uuid>&mode=estimate) ─ */
  let propertyPrefilled = false;

  async function prefillFromProperty() {
    if (propertyPrefilled) return;
    const params = new URLSearchParams(location.search);
    const propertyId = params.get('property');
    const mode = params.get('mode');
    if (!propertyId) return;
    propertyPrefilled = true;
    try {
      const { data: prop, error } = await supabase
        .from('properties')
        .select('id, name, address, city, state')
        .eq('id', propertyId)
        .single();
      if (error) throw error;
      linkedPropertyId = prop.id;
      const clientEl = $('#client-name');
      if (clientEl && !clientEl.value) {
        clientEl.value = prop.name + (prop.address ? ' — ' + prop.address : '');
      }
      if (mode === 'estimate') {
        const estimateTab = document.querySelector('[data-section="estimate"]');
        if (estimateTab) estimateTab.click();
      }
      if (typeof showToast === 'function') {
        showToast('Linked to property: ' + prop.name);
      }
    } catch (err) {
      console.error('Could not load property:', err);
    }
  }

  /* ── Save invoice to history (Supabase) ──────────── */
  async function saveInvoiceToHistory(data, calc) {
    try {
      // Use getSession() (reads from local storage, no network round-trip) instead
      // of getUser() — on mobile/flaky connections getUser() can return null even
      // with a valid session, which silently skipped the save.
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData && sessionData.session && sessionData.session.user;
      if (!user) {
        showToast('Not signed in — please log in to save.');
        return;
      }

      const payload = {
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
        ticket_id: linkedTicketId,
        property_id: linkedPropertyId,
      };

      const isUpdate = !!loadedInvoiceId;
      let invoiceId = loadedInvoiceId;

      if (isUpdate) {
        // Update the existing invoice in place (edits to an already-saved invoice).
        const { error: updErr } = await supabase.from('invoices').update(payload).eq('id', loadedInvoiceId);
        if (updErr) { console.error('Update invoice failed:', updErr); showToast('Could not update invoice: ' + updErr.message); return; }
        // Replace its line items.
        await supabase.from('invoice_items').delete().eq('invoice_id', loadedInvoiceId);
      } else {
        const { data: inserted, error: invErr } = await supabase
          .from('invoices').insert(payload).select().single();
        if (invErr) { console.error('Save invoice failed:', invErr); showToast('Could not save invoice: ' + invErr.message); return; }
        invoiceId = inserted.id;
      }

      const items = data.items
        .filter(it => it.description && it.description.trim())
        .map((it, idx) => ({
          invoice_id: invoiceId,
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

      // Remember this invoice so further saves update it instead of duplicating.
      loadedInvoiceId = invoiceId;

      showToast(isUpdate
        ? `Invoice ${data.invoice.number || ''} updated ✓`
        : `Invoice ${data.invoice.number || ''} saved to history ✓`);

      loadHistory();
      loadKPIs();
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

    // Which invoice IDs are consolidated parents (referenced by others)
    const consolidatedParentIds = new Set((rows || []).map(r => r.consolidated_into).filter(Boolean));

    filtered.forEach(inv => {
      const tr = document.createElement('tr');
      const status = inv.payment_status || 'pending';
      const isConsolidated = status === 'consolidated';
      const isParent = consolidatedParentIds.has(inv.id);
      const canSelect = !isConsolidated && !isParent;
      tr.dataset.id = inv.id;
      tr.dataset.total = inv.total || 0;
      tr.dataset.client = inv.client_name || '';
      tr.innerHTML = `
        <td class="col-check">
          ${canSelect
            ? `<input type="checkbox" class="row-check" data-id="${inv.id}" data-total="${Number(inv.total||0)}" data-client="${escHtml(inv.client_name||'')}" data-number="${escHtml(inv.invoice_number||'')}" data-date="${escHtml(inv.invoice_date||'')}" data-method="${escHtml(inv.payment_method||'')}"/>`
            : ''}
        </td>
        <td>${escHtml(inv.invoice_number || '—')}${isConsolidated ? '<span class="consolidated-tag">consolidated</span>' : ''}${isParent ? '<span class="consolidated-tag" style="background:#fff7e6;color:#d46b08;border:1px solid #ffd591;">consolidated invoice</span>' : ''}</td>
        <td>${escHtml(inv.invoice_date || '—')}</td>
        <td>${escHtml(inv.client_name || '—')}</td>
        <td class="col-num">${currency.format(Number(inv.total || 0))}</td>
        <td>${escHtml(inv.payment_method || '—')}</td>
        <td>
          <select class="status-select status-${status}" data-id="${inv.id}">
            <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="paid" ${status === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="overdue" ${status === 'overdue' ? 'selected' : ''}>Overdue</option>
            <option value="consolidated" ${status === 'consolidated' ? 'selected' : ''}>Consolidated</option>
          </select>
        </td>
        <td class="col-action">
          <div class="history-actions">
            <button class="btn btn-sm btn-load" data-id="${inv.id}" data-mode="load">Load</button>
            <button class="btn btn-sm btn-load" data-id="${inv.id}" data-mode="duplicate">Duplicate</button>
            <button class="btn btn-sm btn-link" data-id="${inv.id}">Copy Link</button>
            <button class="btn btn-sm btn-paylink" data-id="${inv.id}" data-current="${escHtml(inv.payment_link || '')}">${inv.payment_link ? 'Edit Pay Link' : 'Add Pay Link'}</button>
            <button class="btn btn-sm btn-danger btn-delete" data-id="${inv.id}">Delete</button>
            ${isParent ? `<button class="btn btn-sm btn-unconsolidate" data-id="${inv.id}" data-number="${escHtml(inv.invoice_number||'')}" title="Release all original invoices back to pending">Unconsolidate</button>` : ''}
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
    historyBody.querySelectorAll('.btn-link').forEach(btn => {
      btn.addEventListener('click', () => copyInvoiceLink(btn.dataset.id));
    });
    historyBody.querySelectorAll('.btn-paylink').forEach(btn => {
      btn.addEventListener('click', () => setPaymentLink(btn.dataset.id, btn.dataset.current));
    });

    historyBody.querySelectorAll('.btn-unconsolidate').forEach(btn => {
      btn.addEventListener('click', () => unconsolidateInvoice(btn.dataset.id, btn.dataset.number));
    });

    wireCheckboxes();
  }

  async function unconsolidateInvoice(id, number) {
    const label = number ? `#${number}` : 'this consolidated invoice';
    if (!window.confirm(`Unconsolidate ${label}?\n\nThis will release all original invoices back to "pending" and delete the consolidated invoice. This cannot be undone.`)) return;

    try {
      // Release originals: clear consolidated_into, set back to pending
      const { error: releaseErr } = await supabase
        .from('invoices')
        .update({ consolidated_into: null, payment_status: 'pending' })
        .eq('consolidated_into', id);

      if (releaseErr) throw releaseErr;

      // Delete the consolidated invoice itself
      const { error: deleteErr } = await supabase
        .from('invoices')
        .delete()
        .eq('id', id);

      if (deleteErr) throw deleteErr;

      showToast(`Invoices released back to pending ✓`);
      loadHistory();
      loadKPIs();
    } catch (err) {
      console.error('Unconsolidate failed:', err);
      showToast('Error: ' + (err?.message || 'Could not unconsolidate.'));
    }
  }

  /* ── KPI / Analytics panel ───────────────────────── */
  const STATUS_COLORS = { paid: '#2f9e44', pending: '#c9622a', overdue: '#c0392b', consolidated: '#7c4dff' };

  function monthKey(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async function loadKPIs() {
    const panel = $('.kpi-panel');
    if (!panel) return;

    const { data: rows, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, total, payment_status, invoice_date, client_name')
      .order('invoice_date', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Load KPIs failed:', error);
      return;
    }

    const invoices = rows || [];
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    let outstandingTotal = 0, outstandingCount = 0;
    let paidMonthTotal = 0, paidMonthCount = 0;
    let invoicedMonthTotal = 0, invoicedLastMonthTotal = 0;
    let overdueTotal = 0, overdueCount = 0;
    const statusCounts = { paid: 0, pending: 0, overdue: 0 };
    const clientTotals = new Map();
    const monthTotals = new Map();

    invoices.forEach(inv => {
      const total = Number(inv.total || 0);
      const status = inv.payment_status || 'pending';
      const mKey = monthKey(inv.invoice_date);

      statusCounts[status] = (statusCounts[status] || 0) + 1;

      if (status === 'pending') {
        outstandingTotal += total;
        outstandingCount += 1;
      }
      if (status === 'overdue') {
        overdueTotal += total;
        overdueCount += 1;
      }
      if (status === 'paid' && mKey === thisMonthKey) {
        paidMonthTotal += total;
        paidMonthCount += 1;
      }
      if (status !== 'consolidated') {
        if (mKey === thisMonthKey) invoicedMonthTotal += total;
        if (mKey === lastMonthKey) invoicedLastMonthTotal += total;
        if (mKey) monthTotals.set(mKey, (monthTotals.get(mKey) || 0) + total);

        // Exclude consolidated child invoices so client totals aren't double-counted
        // (the consolidated parent invoice already carries their combined total).
        const clientName = (inv.client_name || 'Unknown').trim() || 'Unknown';
        clientTotals.set(clientName, (clientTotals.get(clientName) || 0) + total);
      }
    });

    // Summary cards
    $('#kpi-outstanding').textContent = currency.format(outstandingTotal);
    $('#kpi-outstanding-count').textContent = `${outstandingCount} invoice${outstandingCount === 1 ? '' : 's'}`;
    $('#kpi-paid-month').textContent = currency.format(paidMonthTotal);
    $('#kpi-paid-month-count').textContent = `${paidMonthCount} invoice${paidMonthCount === 1 ? '' : 's'}`;
    $('#kpi-invoiced-month').textContent = currency.format(invoicedMonthTotal);
    $('#kpi-overdue').textContent = currency.format(overdueTotal);
    $('#kpi-overdue-count').textContent = `${overdueCount} invoice${overdueCount === 1 ? '' : 's'}`;

    const deltaEl = $('#kpi-invoiced-month-delta');
    if (invoicedLastMonthTotal > 0) {
      const pct = ((invoicedMonthTotal - invoicedLastMonthTotal) / invoicedLastMonthTotal) * 100;
      const sign = pct >= 0 ? '+' : '';
      deltaEl.textContent = `${sign}${pct.toFixed(0)}% vs last month`;
      deltaEl.style.color = pct >= 0 ? '#2f9e44' : '#c9622a';
    } else {
      deltaEl.textContent = 'vs last month';
      deltaEl.style.color = '';
    }

    // Last 6 months bar chart
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        total: monthTotals.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) || 0,
      });
    }
    const revenueTotal = months.reduce((sum, m) => sum + m.total, 0);
    $('#kpi-revenue-total').textContent = currency.format(revenueTotal);
    renderBarChart(months);

    // Status donut
    renderDonutChart(statusCounts);

    // Top clients
    renderTopClients(clientTotals);

    // Recent activity
    renderRecentActivity(invoices);
  }

  function renderRecentActivity(invoices) {
    const el = $('#kpi-recent-activity');
    if (!el) return;

    const recent = [...invoices]
      .sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || ''))
      .slice(0, 6);

    if (recent.length === 0) {
      el.innerHTML = `<div class="kpi-empty">No invoices yet.</div>`;
      return;
    }

    el.innerHTML = recent.map((inv, i) => {
      const status = inv.payment_status || 'pending';
      const dateLabel = inv.invoice_date
        ? new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '—';
      return `
        <div class="kpi-activity-row" style="animation-delay:${(i * 0.06).toFixed(2)}s">
          <div class="kpi-activity-main">
            <div class="kpi-activity-client">${escHtml(inv.client_name || 'Unknown')}</div>
            <div class="kpi-activity-meta">${escHtml(inv.invoice_number ? '#' + inv.invoice_number : '')} · ${dateLabel}</div>
          </div>
          <span class="kpi-activity-badge status-${status}">${escHtml(status)}</span>
          <span class="kpi-activity-total">${currency.format(Number(inv.total || 0))}</span>
        </div>
      `;
    }).join('');
  }

  /* ── Consolidation logic ─────────────────────────── */
  let selectedInvoices = new Map(); // id → { total, client, number, date, method }

  const consolidateBar      = $('#consolidate-bar');
  const consolidateCount    = $('#consolidate-count');
  const consolidateSum      = $('#consolidate-sum');
  const consolidateBackdrop = $('#consolidate-modal-backdrop');

  function updateConsolidateBar() {
    const count = selectedInvoices.size;
    if (count < 2) {
      consolidateBar.style.display = 'none';
      return;
    }
    const total = [...selectedInvoices.values()].reduce((s, inv) => s + Number(inv.total), 0);
    consolidateCount.textContent = count;
    consolidateSum.textContent = currency.format(total);
    consolidateBar.style.display = 'flex';
  }

  function wireCheckboxes() {
    const checkAll = $('#check-all');
    if (checkAll) {
      checkAll.checked = false;
      checkAll.addEventListener('change', () => {
        document.querySelectorAll('.row-check').forEach(cb => {
          cb.checked = checkAll.checked;
          const d = cb.dataset;
          if (checkAll.checked) {
            selectedInvoices.set(d.id, { total: d.total, client: d.client, number: d.number, date: d.date, method: d.method });
          } else {
            selectedInvoices.delete(d.id);
          }
        });
        updateConsolidateBar();
      });
    }

    document.querySelectorAll('.row-check').forEach(cb => {
      // restore checked state if already selected
      if (selectedInvoices.has(cb.dataset.id)) cb.checked = true;

      cb.addEventListener('change', () => {
        const d = cb.dataset;
        if (cb.checked) {
          selectedInvoices.set(d.id, { total: d.total, client: d.client, number: d.number, date: d.date, method: d.method });
        } else {
          selectedInvoices.delete(d.id);
        }
        updateConsolidateBar();
      });
    });
  }

  $('#btn-consolidate-cancel').addEventListener('click', () => {
    selectedInvoices.clear();
    document.querySelectorAll('.row-check').forEach(cb => cb.checked = false);
    const checkAll = $('#check-all');
    if (checkAll) checkAll.checked = false;
    updateConsolidateBar();
  });

  $('#btn-consolidate-open').addEventListener('click', () => {
    const entries = [...selectedInvoices.entries()];
    const total   = entries.reduce((s, [, inv]) => s + Number(inv.total), 0);
    const clients = [...new Set(entries.map(([, inv]) => inv.client).filter(Boolean))];

    // Populate modal
    $('#consolidate-modal-sub').textContent =
      `Combining ${entries.length} invoice${entries.length > 1 ? 's' : ''} — ${clients.join(', ')}`;
    $('#consolidate-modal-total').textContent = currency.format(total);
    $('#consolidate-client-name').value = clients.length === 1 ? clients[0] : clients.join(' / ');
    $('#consolidate-payment-method').value = entries[0]?.[1]?.method || 'Cash';

    $('#consolidate-breakdown').innerHTML = entries.map(([id, inv]) => `
      <div class="consolidate-breakdown-row">
        <span class="consolidate-breakdown-num">#${escHtml(inv.number || '—')}</span>
        <span class="consolidate-breakdown-client">${escHtml(inv.client || '—')} · ${escHtml(inv.date || '—')}</span>
        <span class="consolidate-breakdown-amount">${currency.format(Number(inv.total))}</span>
      </div>
    `).join('');

    consolidateBackdrop.style.display = 'flex';
  });

  $('#btn-consolidate-dismiss').addEventListener('click', () => {
    consolidateBackdrop.style.display = 'none';
  });
  consolidateBackdrop.addEventListener('click', (e) => {
    if (e.target === consolidateBackdrop) consolidateBackdrop.style.display = 'none';
  });

  $('#btn-consolidate-confirm').addEventListener('click', async () => {
    const entries   = [...selectedInvoices.entries()];
    const ids       = entries.map(([id]) => id);
    const total     = entries.reduce((s, [, inv]) => s + Number(inv.total), 0);
    const clientName = $('#consolidate-client-name').value.trim();
    const payMethod  = $('#consolidate-payment-method').value;
    const numbers    = entries.map(([, inv]) => inv.number).filter(Boolean).join(', ');

    if (!clientName) {
      showToast('Enter a client name for the consolidated invoice.');
      return;
    }

    const btn = $('#btn-consolidate-confirm');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id || null;

      const { data: inserted, error: insErr } = await supabase
        .from('invoices')
        .insert({
          user_id: userId,
          client_name: clientName,
          invoice_date: new Date().toISOString().split('T')[0],
          payment_method: payMethod,
          terms: 'Paid in full',
          notes: `Consolidated payment covering invoices: ${numbers}`,
          subtotal: total,
          tax_rate: 0,
          discount_rate: 0,
          tax_amount: 0,
          discount_amount: 0,
          total: total,
          payment_status: 'pending',
        })
        .select()
        .single();

      if (insErr) throw insErr;

      // Mark originals as consolidated and link to new invoice
      const { error: updErr } = await supabase
        .from('invoices')
        .update({ payment_status: 'consolidated', consolidated_into: inserted.id })
        .in('id', ids);

      if (updErr) throw updErr;

      consolidateBackdrop.style.display = 'none';
      selectedInvoices.clear();
      updateConsolidateBar();
      showToast(`Consolidated invoice created — total ${currency.format(total)} ✓`);
      loadHistory();
      loadKPIs();
    } catch (err) {
      console.error('Consolidation failed:', err);
      showToast('Error: ' + (err?.message || JSON.stringify(err)));
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Create Consolidated Invoice';
    }
  });

  function renderBarChart(months) {
    const svg = $('#kpi-bar-chart');
    const labelsEl = $('#kpi-bar-labels');
    if (!svg) return;

    const max = Math.max(...months.map(m => m.total), 1);
    const width = 280, height = 140, gap = 10;
    const barWidth = (width - gap * (months.length - 1)) / months.length;

    let svgContent = '';
    months.forEach((m, i) => {
      const barHeight = Math.max((m.total / max) * 110, m.total > 0 ? 4 : 0);
      const x = i * (barWidth + gap);
      const y = 124 - barHeight;
      svgContent += `<rect class="kpi-bar" style="animation-delay:${(i * 0.07).toFixed(2)}s" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="var(--purple-mid)" opacity="${i === months.length - 1 ? '1' : '0.55'}"/>`;
    });
    svgContent += `<line x1="0" y1="124" x2="${width}" y2="124" stroke="var(--border)" stroke-width="1"/>`;
    svg.innerHTML = svgContent;

    labelsEl.innerHTML = months.map(m => `<span>${m.label}</span>`).join('');
  }

  function renderDonutChart(statusCounts) {
    const svg = $('#kpi-donut-chart');
    const legendEl = $('#kpi-legend');
    if (!svg) return;

    const entries = Object.entries(statusCounts).filter(([, count]) => count > 0);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);

    if (total === 0) {
      svg.innerHTML = `<circle cx="60" cy="60" r="48" fill="none" stroke="var(--border)" stroke-width="14"/>`;
      legendEl.innerHTML = `<div class="kpi-empty">No invoices yet.</div>`;
      return;
    }

    const r = 48, cx = 60, cy = 60;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    let segments = '';

    entries.forEach(([status, count], i) => {
      const fraction = count / total;
      const dash = fraction * circumference;
      const color = STATUS_COLORS[status] || 'var(--purple-mid)';
      segments += `<circle class="kpi-seg" style="--kpi-circ:${circumference}; animation-delay:${(i * 0.12).toFixed(2)}s" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += dash;
    });

    svg.innerHTML = segments + `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="20" font-family="DM Serif Display, serif" fill="var(--purple)">${total}</text>`;

    legendEl.innerHTML = entries.map(([status, count], i) => `
      <div class="kpi-legend-item" style="animation-delay:${(0.3 + i * 0.1).toFixed(2)}s">
        <span class="kpi-legend-dot" style="background:${STATUS_COLORS[status] || 'var(--purple-mid)'}"></span>
        <span class="kpi-legend-label">${escHtml(status)}</span>
        <span class="kpi-legend-value">${count} · ${Math.round((count / total) * 100)}%</span>
      </div>
    `).join('');
  }

  function renderTopClients(clientTotals) {
    const el = $('#kpi-top-clients');
    if (!el) return;

    const sorted = [...clientTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sorted.length === 0) {
      el.innerHTML = `<div class="kpi-empty">No invoices yet.</div>`;
      return;
    }

    const max = Math.max(...sorted.map(([, total]) => total), 1);
    el.innerHTML = sorted.map(([name, total], i) => `
      <div class="kpi-toplist-row" style="animation-delay:${(i * 0.08).toFixed(2)}s">
        <span class="kpi-toplist-name">${escHtml(name)}</span>
        <span class="kpi-toplist-bar-track"><span class="kpi-toplist-bar-fill" style="width:${(total / max) * 100}%; animation-delay:${(0.1 + i * 0.08).toFixed(2)}s"></span></span>
        <span class="kpi-toplist-value">${currency.format(total)}</span>
      </div>
    `).join('');
  }

  async function setPaymentLink(id, current) {
    const url = window.prompt(
      'Paste the Stripe / Square / PayPal payment link for this invoice (leave empty to remove it):',
      current || ''
    );
    if (url === null) return; // cancelled
    const trimmed = url.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      showToast('Please enter a valid link starting with http:// or https://');
      return;
    }
    const { error } = await supabase.from('invoices').update({ payment_link: trimmed || null }).eq('id', id);
    if (error) {
      showToast('Could not save the payment link.');
      console.error('Save payment link failed:', error);
      return;
    }
    showToast(trimmed ? 'Payment link saved ✓ — clients will see a "Pay with Card" button.' : 'Payment link removed.');
    loadHistory();
  }

  function copyInvoiceLink(id) {
    const url = `${window.location.origin}/view.html?id=${id}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => showToast('Shareable link copied ✓'))
        .catch(() => showToast(url));
    } else {
      window.prompt('Copy this link to share with your client:', url);
    }
  }

  async function updateInvoiceStatus(id, status, selectEl) {
    const patch = { payment_status: status };
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
    loadKPIs();
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
    loadKPIs();
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
    // A duplicate becomes a brand-new invoice; loading/viewing keeps its identity
    loadedInvoiceId = isDuplicate ? null : inv.id;
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
    document.body.dataset.view = 'invoice';

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
      document.body.dataset.view = key;
      $('#page-title').textContent = key === 'invoice' ? 'Invoice' : key === 'estimate' ? 'Ball Park Estimate' : 'Invoice History';
      if (key === 'history') loadHistory();
      closeMobileSidebar();
    });
  });

  /* ── Mobile Sidebar Toggle ────────────────────────── */
  const sidebarEl = document.querySelector('.sidebar');
  const sidebarBackdrop = $('#sidebar-backdrop');
  const mobileMenuBtn = $('#mobile-menu-btn');

  function openMobileSidebar() {
    sidebarEl.classList.add('open');
    sidebarBackdrop.classList.add('show');
  }
  function closeMobileSidebar() {
    sidebarEl.classList.remove('open');
    sidebarBackdrop.classList.remove('show');
  }
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebarEl.classList.contains('open') ? closeMobileSidebar() : openMobileSidebar();
    });
  }
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  }

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

  async function saveEstimateToSupabase() {
    if (!linkedPropertyId) {
      showToast('No property linked — open this page from a property card.');
      return;
    }
    const rows = getEstimateRows().filter(r => r.description.trim());
    if (rows.length === 0) {
      showToast('Add at least one line item before saving.');
      return;
    }
    const total = rows.reduce((sum, r) => sum + r.qty * r.price, 0);
    const description = rows.map(r => `${r.description} (x${r.qty}) — $${(r.qty * r.price).toFixed(2)}`).join('\n');
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('estimates').insert({
      property_id: linkedPropertyId,
      ticket_id: null,
      description,
      amount: total,
      status: 'pending',
      expires_at: expiresAt,
    });

    if (error) {
      showToast('Could not save estimate: ' + error.message);
      console.error('Save estimate failed:', error);
      return;
    }
    showToast('Estimate saved — expires in 3 days if not approved ✓');
  }

  $('#btn-add-estimate').addEventListener('click', () => addEstimateRow());
  $('#btn-save-estimate').addEventListener('click', saveEstimateToSupabase);
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
        email: 'roselegacyhs@icloud.com',
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
    doc.text('Phone: 816 298 4828 | Email: roselegacyhs@icloud.com', tx, y + 26);
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
        doc.text('Questions about this invoice? Call 816 298 4828 or email roselegacyhs@icloud.com', left, footerY + 32);
      }

      doc.save(`invoice-${data.invoice.number || dateStr}.pdf`);
      showToast('Invoice PDF downloaded ✓');
    });
  });

  /* ── Save to cloud (history) — separate from PDF download ─ */
  $('#btn-save-cloud').addEventListener('click', async () => {
    const data = collectData();
    const calc = computeTotals();
    await saveInvoiceToHistory(data, calc);
  });

  /* ── New invoice — clears the form for a fresh, unsaved invoice ─ */
  $('#btn-new-invoice').addEventListener('click', async () => {
    loadedInvoiceId = null;
    linkedTicketId = null;
    linkedPropertyId = null;
    $('#client-name').value = '';
    $('#terms').value = '';
    notesEl.value = '';
    taxRateEl.value = 0;
    discountEl.value = 0;
    $('#payment-method').value = 'Cash';
    $('#inv-date').value = new Date().toISOString().slice(0, 10);
    itemsBody.innerHTML = '';
    addRow();
    computeTotals();
    $('#inv-number').value = await fetchNextInvoiceNumber();
    showToast('New invoice — number ' + $('#inv-number').value);
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
