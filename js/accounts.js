// ==================== ACCOUNTS.JS - Collections, Analytics & Expenses ====================
window.LMS = window.LMS || {};

LMS.AccountsContext = createContext(null);
LMS.Accounts = () => {
  const session = LMS.useAccountsSession();
  return session ? html`<${LMS.PrivateAccounts} key=${LMS.DB.scope + session.expiresAt} />` : html`<${LMS.AccountsLogin} />`;
};
LMS.PrivateAccounts = () => {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    Promise.all([LMS.AccountAccess.list('expenses'), LMS.AccountAccess.list('activityLog')]).then(([expenses, activityLog]) => {
      if (!cancelled) setData({ expenses, activityLog });
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);
  const logAccount = async (action, category) => {
    const row = await LMS.AccountAccess.log(action, category);
    setData(previous => ({ ...previous, activityLog: [row, ...previous.activityLog] }));
  };
  const saveExpense = async (value, before, action) => {
    const log = { id: crypto.randomUUID(), action, section: 'accounts', category: 'expenses', timestamp: new Date().toISOString() };
    const result = await LMS.AccountAccess.save([
      { key: 'expenses', id: value.id, base: before?._rev || JSON.stringify(before || null), value: { ...value, _rev: crypto.randomUUID() } },
      { key: 'activityLog', id: log.id, base: 'null', value: log }
    ]);
    const saved = result.applied.find(change => change.key === 'expenses').value;
    const savedLog = result.applied.find(change => change.key === 'activityLog').value;
    setData(previous => ({ expenses: [saved, ...previous.expenses.filter(row => row.id !== saved.id)].filter(row => !row._deleted), activityLog: [savedLog, ...previous.activityLog] }));
  };
  if (!data) return html`<section class="card p-4" role="status">${error || 'Loading private Accounts…'}</section>`;
  return html`<${LMS.AccountsContext.Provider} value=${{ ...data, logAccount, saveExpense }}><${LMS.AccountsContent} /></${LMS.AccountsContext.Provider}>`;
};

LMS.AccountsContent = () => {
  const { payments, students, showToast } = useContext(LMS.AppContext);
  const { expenses, logAccount: writeLog, saveExpense } = useContext(LMS.AccountsContext);
  const [tab, setTab] = LMS.useRouteParam('tab', 'overview', ['overview', 'activity', 'security']);
  const today = LMS.today();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ from: today.slice(0, 7) + '-01', to: today });
  const [hidden, setHidden] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const blank = () => ({ amount: '', note: '', date: LMS.today(), category: 'Other' });
  const [form, setForm] = useState(blank);
  const noteRef = useRef(null);
  const categories = ['Rent', 'Electricity', 'Internet', 'Staff', 'Maintenance', 'Supplies', 'Other'];
  const log = (action, category = 'analytics') => writeLog(action, category).catch(error => showToast(error.message, 'error'));
  const dateKey = value => String(value || '').slice(0, 10);
  const range = useMemo(() => {
    if (period === 'custom') return custom;
    if (period === 'today') return { from: today, to: today };
    if (period === 'week') {
      const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 6);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    if (period === 'year') return { from: today.slice(0, 4) + '-01-01', to: today };
    return { from: today.slice(0, 7) + '-01', to: today };
  }, [period, custom.from, custom.to, today]);
  const validRange = LMS.validDate(range.from) && LMS.validDate(range.to) && range.from <= range.to;
  const report = useMemo(() => {
    const within = row => validRange && !row._deleted && dateKey(row.date) >= range.from && dateKey(row.date) <= range.to;
    const income = payments.filter(within), costs = expenses.filter(within);
    const sum = rows => rows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
    const collected = sum(income), spent = sum(costs);
    const cash = sum(income.filter(row => String(row.method).toLowerCase() === 'cash'));
    const online = sum(income.filter(row => String(row.method).toLowerCase() === 'online'));
    const buckets = new Map();
    const monthly = (new Date(range.to) - new Date(range.from)) / 86400000 > 62;
    for (const [rows, field] of [[income, 'income'], [costs, 'expense']]) for (const row of rows) {
      const key = dateKey(row.date).slice(0, monthly ? 7 : 10);
      if (!buckets.has(key)) buckets.set(key, { key, income: 0, expense: 0 });
      buckets.get(key)[field] += Number(row.amount) || 0;
    }
    const chart = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
    return { income, costs, collected, spent, net: collected - spent, cash, online, other: collected - cash - online, chart, max: Math.max(1, ...chart.flatMap(row => [row.income, row.expense])) };
  }, [payments, expenses, range.from, range.to, validRange]);
  const visibleExpenses = useMemo(() => report.costs.filter(row => [row.note, row.description, row.category, row.amount].join(' ').toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date))), [report, search]);
  const money = value => hidden ? '••••' : LMS.formatCurrency(value);
  const selectPeriod = value => { setPeriod(value); setLimit(20); log('Accounts report period: ' + value); };
  const startEdit = row => {
    setEditing(row); setForm({ amount: String(row.amount), note: row.note || row.description || '', date: dateKey(row.date), category: row.category || 'Other' });
    noteRef.current?.focus(); noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const save = async e => {
    e.preventDefault(); if (busy) return;
    if (!LMS.validDate(form.date) || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0 || !form.note.trim()) { showToast('Enter a valid date, amount and description.', 'error'); return; }
    const value = { ...(editing || {}), id: editing?.id || LMS.generateId(), amount: Number(form.amount), date: form.date, note: form.note.trim(), category: form.category };
    setBusy(true);
    try {
      await saveExpense(value, editing, `${editing ? 'Updated' : 'Added'} expense: ${LMS.formatCurrency(value.amount)} (${value.note}) · ${LMS.formatDate(value.date)}`);
      setEditing(null); setForm(blank()); showToast('Expense saved.', 'success');
    } catch (error) { showToast(error.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async row => {
    if (busy || !confirm('Delete this expense entry?')) return;
    setBusy(true);
    try {
      await saveExpense({ ...row, _deleted: true }, row, `Deleted expense: ${LMS.formatCurrency(row.amount)} (${row.note || row.description || ''})`);
      if (editing?.id === row.id) { setEditing(null); setForm(blank()); }
      showToast('Expense deleted.', 'success');
    } catch (error) { showToast(error.message, 'error'); } finally { setBusy(false); }
  };
  const exportReport = () => {
    if (!validRange || hidden) return;
    const people = new Map(students.map(student => [student.id, student]));
    const rows = [['Date', 'Type', 'Roll', 'Description', 'Method / Category', 'Income', 'Expense']];
    const entries = [...report.income.map(row => { const student = people.get(row.studentId); return [dateKey(row.date), 'Payment', student?.rollNo || '', student?.name || row.studentId || '', row.method || '', Number(row.amount) || 0, '']; }), ...report.costs.map(row => [dateKey(row.date), 'Expense', '', row.note || row.description || '', row.category || 'Other', '', Number(row.amount) || 0])].sort((a, b) => a[0].localeCompare(b[0]));
    rows.push(...entries);
    const cell = value => { let text = String(value); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `accounts-${range.from}-to-${range.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    log(`Exported Accounts report: ${range.from} to ${range.to}`, 'collections');
  };
  return html`<div class="accounts-workspace">
    <header class="accounts-hero"><div><span class="accounts-eyebrow">PRIVATE WORKSPACE</span><h1>Accounts</h1><p>Know what came in, what went out, and what remains.</p></div><button class="accounts-lock" onClick=${() => LMS.AccountAccess.logout().catch(error => showToast(error.message, 'error'))}>Lock Accounts</button></header>
    <nav class="accounts-tabs" aria-label="Accounts sections">
      ${[['overview','Overview'],['activity','Accounts Activity'],['security','Access & password']].map(([key, label]) => html`<button key=${key} class=${tab === key ? 'active' : ''} aria-current=${tab === key ? 'page' : undefined} onClick=${() => setTab(key)}>${label}</button>`)}
    </nav>
    ${tab === 'activity' ? html`<${LMS.AccountsActivity} />` : tab === 'security' ? html`<${LMS.AccountsSecurity} />` : html`
      <section class="accounts-toolbar"><div class="accounts-periods" aria-label="Report period">${[['today','Today'],['week','Last 7 days'],['month','This month'],['year','This year'],['custom','Custom']].map(([key,label]) => html`<button key=${key} aria-pressed=${period === key} class=${period === key ? 'active' : ''} onClick=${() => selectPeriod(key)}>${label}</button>`)}</div><div class="accounts-tools"><button aria-label=${hidden ? 'Show amounts' : 'Hide amounts'} onClick=${() => { setHidden(!hidden); log(hidden ? 'Shown Accounts amounts' : 'Hidden Accounts amounts', 'collections'); }}>${hidden ? html`<${LMS.Icons.Eye} />` : html`<${LMS.Icons.EyeOff} />`}</button><button disabled=${!validRange || hidden} onClick=${exportReport}>Export CSV ↗</button></div>
        ${period === 'custom' && html`<div class="accounts-dates"><label>From<input type="date" value=${custom.from} onChange=${e => { setCustom(p => ({ ...p, from: e.target.value })); setLimit(20); }} /></label><label>To<input type="date" value=${custom.to} onChange=${e => { setCustom(p => ({ ...p, to: e.target.value })); setLimit(20); }} /></label></div>`}
      </section>
      ${!validRange && html`<p role="alert" class="accounts-access-error">Choose valid dates with From before To.</p>`}
      <p class="accounts-range-caption">${validRange ? `${LMS.formatDate(range.from)} – ${LMS.formatDate(range.to)}` : 'Invalid date range'} · All summaries and lists below use this period.</p>
      <section class="accounts-kpis">
        <article class="accounts-kpi income"><span>COLLECTED</span><strong>${money(report.collected)}</strong><small>${report.income.length} payments received</small></article>
        <article class="accounts-kpi expense"><span>EXPENSES</span><strong>${money(report.spent)}</strong><small>${report.costs.length} expense entries</small></article>
        <article class=${'accounts-kpi net ' + (report.net < 0 ? 'negative' : '')}><span>NET COLLECTION</span><strong>${money(report.net)}</strong><small>Collected minus recorded expenses</small></article>
        <article class="accounts-kpi methods"><span>PAYMENT BREAKDOWN</span><div><small>Cash</small><b>${money(report.cash)}</b></div><div><small>Online</small><b>${money(report.online)}</b></div>${report.other !== 0 && html`<div><small>Other</small><b>${money(report.other)}</b></div>`}</article>
      </section>
      <div class="accounts-main-grid">
        <section class="accounts-panel"><div class="accounts-panel-title"><div><h2>Income & expenses</h2><p>Compare movement during your selected period.</p></div><span class="accounts-legend"><i></i> Income <i></i> Expense</span></div>
          ${hidden ? html`<p class="accounts-empty">Amounts and chart are hidden.</p>` : report.chart.length ? html`<div class="accounts-chart" role="img" aria-label="Income and expense comparison. Each date has labeled amounts.">${report.chart.map(row => html`<div key=${row.key} class="accounts-chart-column" title=${`${row.key}: Income ${LMS.formatCurrency(row.income)}, Expense ${LMS.formatCurrency(row.expense)}`}><div class="accounts-bars"><div class="income" style=${{ height: (row.income / report.max * 100) + '%' }}></div><div class="expense" style=${{ height: (row.expense / report.max * 100) + '%' }}></div></div><small>${row.key.length === 7 ? row.key.slice(5) + '/' + row.key.slice(2,4) : row.key.slice(8) + '/' + row.key.slice(5,7)}</small><span class="accounts-chart-values">${LMS.formatCurrency(row.income)} / ${LMS.formatCurrency(row.expense)}</span></div>`)}</div>` : html`<p class="accounts-empty">No income or expenses in this period.</p>`}
          <div class="accounts-chart-footer"><span>Expense share of collections</span><strong>${hidden ? '••••' : report.collected > 0 ? Math.round(report.spent / report.collected * 100) + '%' : '—'}</strong></div>
        </section>
        <section class="accounts-panel accounts-entry"><div class="accounts-panel-title"><div><h2>${editing ? 'Edit expense' : 'Add an expense'}</h2><p>Keep every outgoing amount accounted for.</p></div><span class="accounts-entry-icon">₹</span></div>
          <form onSubmit=${save} class="accounts-expense-form"><fieldset disabled=${busy}>
            <div class="accounts-form-pair"><label>Amount (₹)<input class="input-field" type="number" min="0.01" step="0.01" required placeholder="0.00" value=${form.amount} onChange=${e => setForm(p => ({ ...p, amount: e.target.value }))} /></label><label>Date<input class="input-field" type="date" required value=${form.date} onChange=${e => setForm(p => ({ ...p, date: e.target.value }))} /></label></div>
            <label>Description<input ref=${noteRef} class="input-field" required maxLength="300" placeholder="e.g. Electricity bill — October" value=${form.note} onChange=${e => setForm(p => ({ ...p, note: e.target.value }))} /></label>
            <label>Category<select class="input-field" value=${form.category} onChange=${e => setForm(p => ({ ...p, category: e.target.value }))}>${[...new Set([...categories, form.category])].map(category => html`<option key=${category}>${category}</option>`)}</select></label>
            <div class="accounts-form-actions"><button class="btn btn-primary" type="submit">${busy ? 'Saving…' : editing ? 'Save changes' : '+ Add expense'}</button>${editing && html`<button type="button" class="btn btn-secondary" onClick=${() => { setEditing(null); setForm(blank()); }}>Cancel</button>`}</div>
          </fieldset></form>
        </section>
      </div>
      <section class="accounts-panel"><div class="accounts-panel-title"><div><h2>Expense ledger <span>${visibleExpenses.length}</span></h2><p>Find, edit and manage expenses for this period.</p></div><input class="input-field accounts-expense-search" type="search" aria-label="Search expenses" placeholder="Search description, category, amount…" value=${search} onChange=${e => { setSearch(e.target.value); setLimit(20); }} /></div>
        <div class="accounts-table-wrap"><table class="accounts-ledger"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${visibleExpenses.slice(0,limit).map(row => html`<tr key=${row.id}><td>${LMS.formatDate(row.date)}</td><td>${row.note || row.description || 'Expense'}</td><td><span class="accounts-category">${row.category || 'Other'}</span></td><td class="accounts-expense-amount">${money(row.amount)}</td><td><div class="accounts-row-actions"><button disabled=${busy} onClick=${() => startEdit(row)} aria-label=${'Edit expense ' + (row.note || '')}>Edit</button><button disabled=${busy} onClick=${() => remove(row)} class="danger" aria-label=${'Delete expense ' + (row.note || '')}>Delete</button></div></td></tr>`)}</tbody></table></div>
        ${!visibleExpenses.length && html`<p class="accounts-empty">${search ? 'No expenses match your search.' : 'No expenses recorded for this period. Add one above or change the dates.'}</p>`}
        ${visibleExpenses.length > limit && html`<button class="btn btn-secondary" onClick=${() => setLimit(n => n + 20)}>Show more expenses</button>`}
      </section>
    `}
  </div>`;
};

LMS.AccountsActivity = () => {
  const { activityLog } = useContext(LMS.AccountsContext);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [limit, setLimit] = useState(50);
  const labels = { collections: 'Collections', expenses: 'Expenses', analytics: 'Analytics', accounts: 'Accounts' };
  const logs = useMemo(() => LMS.latestActivity(activityLog, undefined, log => {
    const group = LMS.accountActivityCategory(log);
    return group && (category === 'all' || category === group) && String(log.action || '').toLowerCase().includes(query.trim().toLowerCase());
  }), [activityLog, category, query]);
  return html`<section class="card accounts-activity">
    <div class="accounts-activity-heading"><div><h2>Accounts Activity</h2><p>Collections, expenses and analytics · newest first</p></div><span>${logs.length} activities</span></div>
    <div class="accounts-activity-filters">
      <input type="search" class="input-field" aria-label="Search accounts activity" placeholder="Search accounts activity…" value=${query} onChange=${e => { setQuery(e.target.value); setLimit(50); }} />
      <select class="input-field" aria-label="Activity category" value=${category} onChange=${e => { setCategory(e.target.value); setLimit(50); }}>
        <option value="all">All activities</option>
        ${Object.entries(labels).map(([value, label]) => html`<option key=${value} value=${value}>${label}</option>`)}
      </select>
    </div>
    ${logs.length ? html`<ol class="accounts-activity-list">${logs.slice(0, limit).map(log => {
      const group = LMS.accountActivityCategory(log);
      const time = new Date(log.timestamp || '');
      return html`<li key=${log.id}><span class=${'accounts-activity-badge ' + group}>${labels[group] || 'Accounts'}</span><p>${log.action}</p><time>${Number.isFinite(time.getTime()) ? time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'Time unavailable'}</time></li>`;
    })}</ol>` : html`<p class="accounts-activity-empty">No matching accounts activity.</p>`}
    ${logs.length > limit && html`<${LMS.Button} onClick=${() => setLimit(previous => previous + 50)}>Show more</${LMS.Button}>`}
  </section>`;
};

// Collection Card Component (Extracted)
LMS.CollectionCard = ({ title, stats, isVisible, onToggle, borderColor, customContent }) => {

  return html`
  <div class="bg-card rounded-xl border-l-4 p-4 shadow-sm" style=${{ borderLeftColor: borderColor }}>
    <div class="flex justify-between items-center mb-2">
      <div class="flex items-center gap-2">
        <span class="text-purple-500" style=${{ color: borderColor }}>${customContent ? '📊' : '⟳'}</span>
        <h3 class="font-bold" style=${{ color: borderColor }}>${title}</h3>
      </div>
      <button onClick=${onToggle} aria-label=${(isVisible ? 'Hide ' : 'Show ') + title} title=${(isVisible ? 'Hide ' : 'Show ') + title} aria-expanded=${isVisible} class="text-gray-400 hover:text-gray-600" style=${{ background: 'none', border: 'none', cursor: 'pointer' }}>
        ${isVisible ? html`<${LMS.Icons.Eye} />` : html`<${LMS.Icons.EyeOff} />`}
      </button>
    </div>
    ${isVisible
      ? (customContent || html`
          <p class="text-2xl font-black text-green-600">₹${stats.total.toLocaleString('en-IN')}</p>
          <p class="text-sm text-gray-500 mt-1">${stats.count} transactions • Cash: ₹${stats.cash.toLocaleString('en-IN')} • Online: ₹${stats.online.toLocaleString('en-IN')}</p>
          ${stats.breakdown && html`
            <div class="mt-3 pt-3 border-t max-h-48 overflow-y-auto">
               <h4 class="text-xs font-bold text-gray-400 uppercase mb-2">Month-wise Breakdown</h4>
               <div class="space-y-1">
                 ${stats.breakdown.map(m => html`
                    <div class="flex justify-between text-xs">
                      <span class="text-gray-600">${m.month}</span>
                      <span class="font-bold text-green-600">₹${m.total.toLocaleString('en-IN')}</span>
                    </div>
                 `)}
               </div>
            </div>
          `}
        `)
      : html`<p class="text-sm text-gray-400">Hidden · use the eye button to show</p>`
    }
  </div>
`;
};
