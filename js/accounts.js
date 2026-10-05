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
  const { payments, showToast } = useContext(LMS.AppContext);
  const { expenses, logAccount: writeLog, saveExpense } = useContext(LMS.AccountsContext);
  const [tab, setTab] = LMS.useRouteParam('tab', 'overview', ['overview', 'activity', 'security']);
  const logAccount = (action, category) => writeLog(action, category).catch(error => showToast(error.message, 'error'));
  const [expenseBusy, setExpenseBusy] = useState(false);
  const toggleCard = (title, visible, setter, category) => {
    setter(!visible);
    logAccount(`${visible ? 'Hidden' : 'Shown'} ${title}`, category);
  };
  const [showToday, setShowToday] = useState(true);
  const [showMonth, setShowMonth] = useState(true);
  const [showYear, setShowYear] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(true);

  // Expenses & Analytics State
  const [analyticsMode, setAnalyticsMode] = useState('thisMonth'); // 'thisMonth', 'last3', 'last6', 'year', 'month'
  const [analyticsDate, setAnalyticsDate] = useState(LMS.today());
  const changeAnalyticsMode = value => {
    setAnalyticsMode(value);
    const labels = { thisMonth: 'This month', last3: 'Last 3 months', last6: 'Last 6 months', last12: 'Last 12 months', year: 'Specific year', month: 'Specific month' };
    logAccount('Analytics period: ' + labels[value], 'analytics');
  };
  const changeAnalyticsDate = value => {
    setAnalyticsDate(value);
    logAccount('Analytics date: ' + value, 'analytics');
  };

  // Chart data computation (replaces window._tempChartData hack)
  const chartComputed = useMemo(() => {
    let dataPoints = [];
    const refDate = new Date(analyticsDate);
    const now = new Date();

    if (analyticsMode === 'thisMonth') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        dataPoints.push({ d: new Date(now.getFullYear(), now.getMonth(), i), label: i });
      }
    } else if (analyticsMode === 'last3') {
      for (let i = 2; i >= 0; i--) {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
        dataPoints.push({ d, label: d.toLocaleString('default', { month: 'short' }) });
      }
    } else if (analyticsMode === 'last6') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
        dataPoints.push({ d, label: d.toLocaleString('default', { month: 'short' }) });
      }
    } else if (analyticsMode === 'last12') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
        dataPoints.push({ d, label: d.toLocaleString('default', { month: 'short' }) });
      }
    } else if (analyticsMode === 'year') {
      for (let i = 0; i < 12; i++) {
        const d = new Date(refDate.getFullYear(), i, 1);
        dataPoints.push({ d, label: d.toLocaleString('default', { month: 'short' }) });
      }
    } else if (analyticsMode === 'month') {
      const year = refDate.getFullYear();
      const month = refDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        dataPoints.push({ d, label: i });
      }
    }

    const chartData = dataPoints.map(pt => {
      const isSamePeriod = (d1, d2) => {
        if (analyticsMode === 'month' || analyticsMode === 'thisMonth')
          return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
        return d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
      };
      const inc = payments.filter(p => isSamePeriod(new Date(p.date), pt.d)).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const exp = expenses.filter(e => isSamePeriod(new Date(e.date), pt.d)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return { label: pt.label, income: inc, expense: exp, net: inc - exp };
    });

    const maxVal = Math.max(100, ...chartData.map(m => Math.max(m.income, m.expense)));
    return { data: chartData, max: maxVal };
  }, [analyticsMode, analyticsDate, payments, expenses]);

  const [expenseForm, setExpenseForm] = useState({ amount: '', note: '', date: LMS.today() });
  // --- EXPENSE HANDLERS ---
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (expenseBusy) return;
    if (!Number.isFinite(Number(expenseForm.amount)) || Number(expenseForm.amount) <= 0 || !expenseForm.note.trim() || !LMS.validDate(expenseForm.date)) { showToast('Please fill details', 'error'); return; }

    const newExpense = {
      id: LMS.generateId(),
      amount: Number(expenseForm.amount),
      note: expenseForm.note,
      date: expenseForm.date
    };

    setExpenseBusy(true);
    try {
      await saveExpense(newExpense, null, `Added expense: ${LMS.formatCurrency(newExpense.amount)} (${newExpense.note}) · ${LMS.formatDate(newExpense.date)}`);
      setExpenseForm({ amount: '', note: '', date: LMS.today() });
      showToast('Expense added!', 'success');
    } catch (error) { showToast(error.message, 'error'); }
    finally { setExpenseBusy(false); }
  };
  const handleDeleteExpense = async (id) => {
    if (expenseBusy) return;
    if (confirm('Delete this expense entry?')) {
      const exp = expenses.find(e => e.id === id);
      if (!exp) return;
      setExpenseBusy(true);
      try {
        await saveExpense({ ...exp, _deleted: true }, exp, `Deleted expense: ${LMS.formatCurrency(exp.amount)} (${exp.note}) · ${LMS.formatDate(exp.date)}`);
        showToast('Expense deleted', 'success');
      } catch (error) { showToast(error.message, 'error'); }
      finally { setExpenseBusy(false); }
    }
  };

  // --- STATS CALCS ---
  const today = new Date();
  const todayStr = today.toDateString();
  const thisMonth = today.getMonth();
  const thisYear = today.getFullYear();

  const todayPayments = payments.filter(p => new Date(p.date).toDateString() === todayStr);
  const monthPayments = payments.filter(p => { const d = new Date(p.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; });
  const yearPayments = payments.filter(p => new Date(p.date).getFullYear() === thisYear);

  const calc = (list) => ({
    total: list.reduce((a, p) => a + (Number(p.amount) || 0), 0),
    cash: list.filter(p => p.method === 'cash').reduce((a, p) => a + (Number(p.amount) || 0), 0),
    online: list.filter(p => p.method === 'online').reduce((a, p) => a + (Number(p.amount) || 0), 0),
    count: list.length,
    breakdown: list.length > 0 ? (() => {
      const months = {};
      list.forEach(p => {
        const d = new Date(p.date);
        const k = d.toLocaleString('default', { month: 'long' });
        months[k] = (months[k] || 0) + (Number(p.amount) || 0);
      });
      return Object.entries(months).map(([month, total]) => ({ month, total }));
    })() : null
  });

  const todayStats = calc(todayPayments);
  const monthStats = calc(monthPayments);
  const yearStats = calc(yearPayments);

  return html`<div class="space-y-6">
    <nav class="accounts-tabs" aria-label="Accounts sections">
      <button class=${tab === 'overview' ? 'active' : ''} aria-current=${tab === 'overview' ? 'page' : undefined} onClick=${() => setTab('overview')}>Overview</button>
      <button class=${tab === 'activity' ? 'active' : ''} aria-current=${tab === 'activity' ? 'page' : undefined} onClick=${() => setTab('activity')}>Accounts Activity</button>
      <button class=${tab === 'security' ? 'active' : ''} aria-current=${tab === 'security' ? 'page' : undefined} onClick=${() => setTab('security')}>Access & password</button>
      <button onClick=${() => LMS.AccountAccess.logout().catch(error => showToast(error.message, 'error'))}>Lock Accounts</button>
    </nav>
    ${tab === 'security' ? html`<${LMS.AccountsSecurity} />` : tab === 'activity' ? html`<${LMS.AccountsActivity} />` : html`<div class="space-y-6">
    <!-- Top Row: Collection Cards -->
    <div class="grid md-grid-3 gap-4">
      <${LMS.CollectionCard} 
        title="Today's Collection" 
        stats=${todayStats} 
        isVisible=${showToday} 
        onToggle=${() => toggleCard("Today's Collection", showToday, setShowToday, 'collections')}
        borderColor="#8b5cf6"
        showToast=${showToast}
      />
      <${LMS.CollectionCard} 
        title="This Month's Collection" 
        stats=${monthStats} 
        isVisible=${showMonth} 
        onToggle=${() => toggleCard("This Month's Collection", showMonth, setShowMonth, 'collections')}
        borderColor="#f59e0b"
        showToast=${showToast}
      />
      <${LMS.CollectionCard} 
        title="This Year's Collection" 
        stats=${yearStats} 
        isVisible=${showYear} 
        onToggle=${() => toggleCard("This Year's Collection", showYear, setShowYear, 'collections')}
        borderColor="#10b981"
        showToast=${showToast}
      />
    </div>


    <!-- Analytics & Expenses Row -->
    <div class="grid md-grid-2 gap-4">
      <!-- ANALYTICS DASHBOARD -->
      <${LMS.CollectionCard} 
        title="Analytics Dashboard" 
        stats=${{ total: 0, count: 0, cash: 0, online: 0 }} 
        isVisible=${showAnalytics} 
        onToggle=${() => toggleCard('Analytics Dashboard', showAnalytics, setShowAnalytics, 'analytics')}
        borderColor="#3b82f6"
        showToast=${showToast}
        customContent=${html`
          <div class="space-y-4">
             <!-- Filters -->
             <div class="flex flex-wrap gap-2 items-center bg-blue-50 p-2 rounded-lg">
               <select class="input-field text-xs py-1" style=${{ width: 'auto' }} value=${analyticsMode} onChange=${e => changeAnalyticsMode(e.target.value)}>
                 <option value="thisMonth">This Month</option>
                 <option value="last3">Last 3 Months</option>
                 <option value="last6">Last 6 Months</option>
                 <option value="last12">Last 12 Months (Year)</option>
                 <option value="month">Specific Month</option>
                 <option value="year">Specific Year</option>
               </select>
               
               ${analyticsMode === 'year' && html`
                 <input type="number" class="input-field text-xs py-1" style=${{ width: '80px' }} 
                   value=${analyticsDate.split('-')[0]} 
                   onFocus=${e => { e.currentTarget.dataset.previousYear = e.currentTarget.value; }}
                   onChange=${e => setAnalyticsDate(e.target.value + '-01-01')}
                   onBlur=${e => { if (e.target.validity.valid && e.target.value && e.target.value !== e.target.dataset.previousYear) changeAnalyticsDate(e.target.value + '-01-01'); }}
                   placeholder="YYYY" min="2020" max="2030" />
               `}
               
               ${analyticsMode === 'month' && html`
                 <input type="month" class="input-field text-xs py-1" style=${{ width: 'auto' }} 
                   value=${analyticsDate.substring(0, 7)} 
                   onChange=${e => changeAnalyticsDate(e.target.value + '-01')} />
               `}
             </div>

             <!-- Chart Area -->
             <div class="relative pt-6">
               <h4 class="text-xs font-bold text-gray-400 uppercase mb-2 text-center">
                 ${analyticsMode === 'thisMonth' ? `Daily Breakdown (${today.toLocaleString('default', { month: 'long' })})` :
        analyticsMode === 'last3' ? 'Monthly Trend (Last 3 Months)' :
          analyticsMode === 'last6' ? 'Monthly Trend (Last 6 Months)' :
            analyticsMode === 'last12' ? 'Monthly Trend (Last 12 Months)' :
              analyticsMode === 'year' ? `Monthly Breakdown (${analyticsDate.substring(0, 4)})` :
                `Daily Breakdown (${new Date(analyticsDate).toLocaleString('default', { month: 'long', year: 'numeric' })})`}
               </h4>
               
               <div class="flex h-48 border-b border-gray-200 pb-1">
                 <!-- Y-Axis Labels -->
                 <div class="flex flex-col justify-between text-[9px] text-gray-400 pr-2 border-r border-gray-100 h-full py-1 text-right min-w-[30px]">
                    ${(() => {
        const maxVal = chartComputed.max;

        return html`
                        <span>₹${Math.round(maxVal).toLocaleString()}</span>
                        <span>₹${Math.round(maxVal * 0.75).toLocaleString()}</span>
                        <span>₹${Math.round(maxVal * 0.5).toLocaleString()}</span>
                        <span>₹${Math.round(maxVal * 0.25).toLocaleString()}</span>
                        <span>₹0</span>
                      `;
      })()}
                 </div>

                 <!-- Bars Area -->
                 <div class="flex-1 flex items-end gap-1 h-full pl-1 overflow-x-auto custom-scrollbar">
                    ${(() => {
        const { data, max } = chartComputed;
        const totalInc = data.reduce((s, c) => s + c.income, 0);
        const totalExp = data.reduce((s, c) => s + c.expense, 0);

        return html`
                        ${data.map(d => html`
                          <div class="flex-1 min-w-[20px] flex flex-col items-center gap-0 group relative h-full justify-end">
                            <div class="flex gap-0.5 items-end justify-center w-full h-full relative px-[1px]">
                               ${d.income > 0 && html`<div style=${{ height: (d.income / max * 100) + '%', width: '45%' }} class="bg-green-500 rounded-t-sm opacity-90 hover:opacity-100 transition-all"></div>`}
                               ${d.expense > 0 && html`<div style=${{ height: (d.expense / max * 100) + '%', width: '45%' }} class="bg-red-500 rounded-t-sm opacity-90 hover:opacity-100 transition-all"></div>`}
                            </div>
                            <span class="text-[9px] text-gray-500 font-mono mt-1 whitespace-nowrap overflow-hidden">${d.label}</span>
                            
                            <div class="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-gray-900 text-white text-[10px] p-2 rounded shadow-lg whitespace-nowrap z-20 pointer-events-none">
                              <div class="font-bold border-b border-gray-700 mb-1 pb-1">${analyticsMode.includes('Month') || analyticsMode === 'month' ? 'Day ' : ''}${d.label}</div>
                              <div class="text-green-300">Income: ₹${d.income}</div>
                              <div class="text-red-300">Expense: ₹${d.expense}</div>
                              <div class="font-bold pt-1 mt-1 border-t border-gray-700">Net: ₹${d.income - d.expense}</div>
                            </div>
                          </div>
                        `)}

                        <!-- Summary (Absolute) -->
                         <div class="absolute top-0 right-0 p-2 bg-white/90 backdrop-blur rounded border shadow-sm text-xs text-right z-10 pointer-events-none">
                           <div class="font-bold text-gray-600">Period Summary</div>
                           <div class="text-green-600 font-bold">In: ₹${totalInc.toLocaleString('en-IN')}</div>
                           <div class="text-red-600 font-bold">Out: ₹${totalExp.toLocaleString('en-IN')}</div>
                           <div class="text-blue-600 font-black border-t mt-1 pt-1">Net: ₹${(totalInc - totalExp).toLocaleString('en-IN')}</div>
                         </div>
                       `;
      })()}
                 </div>
               </div>
             </div>
          </div>
        `}
      />

      <!-- EXPENSE MANAGEMENT -->
      <${LMS.CollectionCard} 
        title="Manage Expenses" 
        stats=${{ total: 0, count: 0, cash: 0, online: 0 }} 
        isVisible=${showExpenses} 
        onToggle=${() => toggleCard('Manage Expenses', showExpenses, setShowExpenses, 'expenses')}
        borderColor="#ef4444"
        showToast=${showToast}
        customContent=${html`
          <div class="space-y-4">
             <!-- Add Form -->
             <form onSubmit=${handleAddExpense} class="flex gap-2 items-end bg-red-50 p-3 rounded-lg border border-red-100">
               <div class="w-24">
                 <label class="text-[10px] font-bold text-red-400 uppercase">Date</label>
                 <input class="input-field text-sm py-1 h-8" type="date" value=${expenseForm.date} onChange=${e => setExpenseForm({ ...expenseForm, date: e.target.value })} />
               </div>
               <div class="w-24">
                 <label class="text-[10px] font-bold text-red-400 uppercase">Amount</label>
                 <input class="input-field text-sm py-1 h-8" type="number" placeholder="₹" value=${expenseForm.amount} onChange=${e => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
               </div>
               <div class="flex-1">
                 <label class="text-[10px] font-bold text-red-400 uppercase">Description</label>
                 <input class="input-field text-sm py-1 h-8" type="text" placeholder="Expense Note" value=${expenseForm.note} onChange=${e => setExpenseForm({ ...expenseForm, note: e.target.value })} />
               </div>
               <button type="submit" disabled=${expenseBusy} class="btn btn-primary h-8 px-3 flex items-center justify-center bg-red-600 hover:bg-red-700" title="Add Expense">+</button>
             </form>

             <!-- List: This Month -->
             <div>
               <h5 class="text-xs font-bold text-gray-400 uppercase mb-2">Expenses (${today.toLocaleString('default', { month: 'long' })})</h5>
               <div class="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                 ${expenses
        .filter(e => {
          const d = new Date(e.date);
          return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map(e => html`
                   <div class="flex justify-between items-center text-sm p-2 bg-white border rounded shadow-sm hover:bg-gray-50 group transition-colors">
                     <div class="flex items-center gap-3">
                       <span class="font-mono text-xs text-gray-400 bg-gray-100 px-1 rounded">${LMS.formatDate(e.date)}</span>
                       <span class="font-medium text-gray-700">${e.note}</span>
                     </div>
                     <div class="flex items-center gap-3">
                       <span class="font-bold text-red-600">₹${Number(e.amount).toLocaleString('en-IN')}</span>
                       <button class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick=${() => handleDeleteExpense(e.id)} title="Delete">🗑</button>
                     </div>
                   </div>
                 `)}
                 ${expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; }).length === 0 && html`<p class="text-center text-xs text-gray-400 py-4 border-2 border-dashed rounded">No expenses recorded for this month.</p>`}
               </div>
             </div>
             
             <!-- Totals: Last 3 Months -->
             <div class="grid grid-2 gap-2 mt-4 pt-4 border-t">
                <div class="p-2 bg-gray-50 rounded border text-center">
                   <p class="text-xs text-gray-500">Total Expense (This Month)</p>
                   <p class="font-bold text-red-600">₹${expenses.filter(e => {
          const d = new Date(e.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        }).reduce((s, e) => s + Number(e.amount), 0).toLocaleString('en-IN')}</p>
                </div>
                <div class="p-2 bg-red-50 rounded border border-red-100 text-center">
                   <p class="text-xs text-red-600">Total Expense (Last 3 Months)</p>
                   <p class="font-bold text-red-700">₹${expenses.filter(e => {
          const d = new Date(e.date);
          const tm = new Date(); tm.setDate(1); tm.setMonth(tm.getMonth() - 3);
          return d >= tm;
        }).reduce((s, e) => s + Number(e.amount), 0).toLocaleString('en-IN')
      }</p>
                </div>
             </div>

          </div>
        `}
      />
    </div>

    </div>`}
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
