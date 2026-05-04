// ==================== ACCOUNTS.JS - Accounts with Dues Filtering & Actions ====================
window.LMS = window.LMS || {};

LMS.Accounts = () => {
  const { payments, students, halls, settings, showToast, expenses, setExpenses, addLog } = useContext(LMS.AppContext);
  const [showToday, setShowToday] = useState(true);
  const [showMonth, setShowMonth] = useState(false);
  const [showYear, setShowYear] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Expenses & Analytics State
  const [analyticsMode, setAnalyticsMode] = useState('thisMonth'); // 'thisMonth', 'last3', 'last6', 'year', 'month'
  const [analyticsDate, setAnalyticsDate] = useState(new Date().toISOString().split('T')[0]);

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
        const d = new Date(); d.setMonth(d.getMonth() - i);
        dataPoints.push({ d, label: d.toLocaleString('default', { month: 'short' }) });
      }
    } else if (analyticsMode === 'last6') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        dataPoints.push({ d, label: d.toLocaleString('default', { month: 'short' }) });
      }
    } else if (analyticsMode === 'last12') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
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

  const [expenseForm, setExpenseForm] = useState({ amount: '', note: '', date: new Date().toISOString().split('T')[0] });
  const [paymentModal, setPaymentModal] = useState({ open: false, student: null });
  const [duesFilter, setDuesFilter] = useState({
    search: '',
    minAmount: '',
    maxAmount: '',
    dueSince: '',
    sortBy: 'dueSince',
    sortOrder: 'asc'
  });

  const { Button, Card, Modal, Input, Icons, PasswordModal } = LMS;

  // --- EXPENSE HANDLERS ---
  const handleAddExpense = (e) => {
    e.preventDefault();
    if (!expenseForm.amount || !expenseForm.note) { showToast('Please fill details', 'error'); return; }

    const newExpense = {
      id: LMS.generateId(),
      amount: Number(expenseForm.amount),
      note: expenseForm.note,
      date: new Date(expenseForm.date).toISOString()
    };

    setExpenses(prev => [newExpense, ...prev]);

    // Cloud Sync
    if (LMS.DB.saveItem) LMS.DB.saveItem('expenses', newExpense);

    addLog(`Added expense: ₹${expenseForm.amount} (${expenseForm.note})`);
    setExpenseForm({ amount: '', note: '', date: new Date().toISOString().split('T')[0] });
    showToast('Expense added!', 'success');
  };
  const handleDeleteExpense = (id) => {
    if (confirm('Delete this expense entry?')) {
      const exp = expenses.find(e => e.id === id);
      setExpenses(prev => prev.filter(e => e.id !== id));

      // Cloud Sync
      if (LMS.DB.removeItem) LMS.DB.removeItem('expenses', id);

      addLog(`Deleted expense: ₹${exp?.amount || '?'} (${exp?.note || 'unknown'})`);
      showToast('Expense deleted', 'success');
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
    total: list.reduce((a, p) => a + (p.amount || 0), 0),
    cash: list.filter(p => p.method === 'cash').reduce((a, p) => a + (p.amount || 0), 0),
    online: list.filter(p => p.method === 'online').reduce((a, p) => a + (p.amount || 0), 0),
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

  // Get all due students with financials
  const dueStudentsList = useMemo(() => {
    return students.filter(s => s.isActive && LMS.getDueAmount(s, payments) > 0)
      .map(s => {
        const fin = LMS.calculateStudentFinancials(s, payments);
        const seatLabel = s.assignedSeat ? LMS.formatSeatLabel(s.assignedSeat, halls) : null;
        return { ...s, totalDues: fin.totalDues, paidUntil: fin.paidUntil, dueSince: fin.dueSince, daysDue: fin.daysDue, seatLabel };
      });
  }, [students, payments, halls]);

  // Apply filters and sorting
  const filteredDues = useMemo(() => {
    let filtered = dueStudentsList;

    // Search filter
    if (duesFilter.search.trim()) {
      const lower = duesFilter.search.toLowerCase();
      filtered = filtered.filter(s =>
        s.rollNo.toLowerCase().includes(lower) ||
        s.name.toLowerCase().includes(lower)
      );
    }

    // Amount range
    const min = Number(duesFilter.minAmount) || 0;
    const max = Number(duesFilter.maxAmount) || Infinity;
    filtered = filtered.filter(s => s.totalDues >= min && s.totalDues <= max);

    // Due since date
    if (duesFilter.dueSince) {
      const filterDate = new Date(duesFilter.dueSince);
      filterDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(s => {
        if (!s.dueSince) return false;
        const dsDate = new Date(s.dueSince);
        dsDate.setHours(0, 0, 0, 0);
        return dsDate >= filterDate;
      });
    }

    // Sort
    return filtered.sort((a, b) => {
      let aVal, bVal;
      if (duesFilter.sortBy === 'totalDues') {
        aVal = a.totalDues; bVal = b.totalDues;
      } else if (duesFilter.sortBy === 'name') {
        aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      } else { // dueSince
        aVal = a.paidUntil ? new Date(a.paidUntil) : new Date(0);
        bVal = b.paidUntil ? new Date(b.paidUntil) : new Date(0);
      }
      if (aVal < bVal) return duesFilter.sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return duesFilter.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [dueStudentsList, duesFilter]);

  const totalDue = filteredDues.reduce((a, s) => a + s.totalDues, 0);

  const getWhatsAppLink = (student) => {
    const phone = (student.mobile || student.parentMobile || '').replace(/[^0-9]/g, '');
    if (!phone) return null;
    const template = settings.whatsappTemplate || 'Dear {name}, your library fee of ₹{due} is due since {dueDate}. Please pay at your earliest. - {library}';
    const msg = template
      .replace('{name}', student.name)
      .replace('{due}', student.totalDues)
      .replace('{dueDate}', LMS.formatDate(student.dueSince))
      .replace('{library}', settings.libraryName);
    return `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
  };

  return html`<div class="space-y-6">
    <!-- Top Row: Collection Cards -->
    <div class="grid md-grid-3 gap-4">
      <${LMS.CollectionCard} 
        title="Today's Collection" 
        stats=${todayStats} 
        isVisible=${showToday} 
        onToggle=${() => setShowToday(!showToday)}
        borderColor="#8b5cf6"
        requiresPassword=${false}
        showToast=${showToast}
      />
      <${LMS.CollectionCard} 
        title="This Month's Collection" 
        stats=${monthStats} 
        isVisible=${showMonth} 
        onToggle=${() => setShowMonth(!showMonth)}
        borderColor="#f59e0b"
        requiresPassword=${true}
        showToast=${showToast}
      />
      <${LMS.CollectionCard} 
        title="This Year's Collection" 
        stats=${yearStats} 
        isVisible=${showYear} 
        onToggle=${() => setShowYear(!showYear)}
        borderColor="#10b981"
        requiresPassword=${true}
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
        onToggle=${() => setShowAnalytics(!showAnalytics)}
        borderColor="#3b82f6"
        requiresPassword=${true}
        showToast=${showToast}
        customContent=${html`
          <div class="space-y-4">
             <!-- Filters -->
             <div class="flex flex-wrap gap-2 items-center bg-blue-50 p-2 rounded-lg">
               <select class="input-field text-xs py-1" style=${{ width: 'auto' }} value=${analyticsMode} onChange=${e => setAnalyticsMode(e.target.value)}>
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
                   onChange=${e => setAnalyticsDate(e.target.value + '-01-01')}
                   placeholder="YYYY" min="2020" max="2030" />
               `}
               
               ${analyticsMode === 'month' && html`
                 <input type="month" class="input-field text-xs py-1" style=${{ width: 'auto' }} 
                   value=${analyticsDate.substring(0, 7)} 
                   onChange=${e => setAnalyticsDate(e.target.value + '-01')} />
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
        // Need max value first, so we will calculate data first then render scales
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
            const d = new Date(); d.setMonth(d.getMonth() - i);
            dataPoints.push({ d, label: d.toLocaleString('default', { month: 'short' }) });
          }
        } else if (analyticsMode === 'last6') {
          for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            dataPoints.push({ d, label: d.toLocaleString('default', { month: 'short' }) });
          }
        } else if (analyticsMode === 'last12') {
          for (let i = 11; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
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
        window._tempChartData = chartComputed; // Use precomputed useMemo data

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
        onToggle=${() => setShowExpenses(!showExpenses)}
        borderColor="#ef4444"
        requiresPassword=${true}
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
               <button type="submit" class="btn btn-primary h-8 px-3 flex items-center justify-center bg-red-600 hover:bg-red-700" title="Add Expense">+</button>
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
          const tm = new Date(); tm.setMonth(tm.getMonth() - 3);
          return d >= tm;
        }).reduce((s, e) => s + Number(e.amount), 0).toLocaleString('en-IN')
      }</p>
                </div>
             </div>

          </div>
        `}
      />
    </div>

    <!-- Dues List Section -->
    <${Card} className="border-l-4 border-pink-500">
      <div class="flex items-center gap-2 mb-4">
        <span class="text-pink-500">⚠</span>
        <h3 class="font-bold text-pink-700 text-lg">Dues List</h3>
      </div>

      <!-- Filter Section -->
      <div class="mb-6 p-4 border border-gray-200 rounded-xl bg-gray-50">
        <h5 class="font-bold text-sm mb-3 text-purple-700">Filter & Sort Dues</h5>
        <div class="grid grid-2 md-grid-4 gap-4">
          <input class="input-field" placeholder="Search Name/Roll" value=${duesFilter.search} 
            onInput=${e => setDuesFilter({ ...duesFilter, search: e.target.value })} />
          <input class="input-field" type="number" placeholder="Min Due (₹)" value=${duesFilter.minAmount}
            onInput=${e => setDuesFilter({ ...duesFilter, minAmount: e.target.value })} />
          <input class="input-field" type="number" placeholder="Max Due (₹)" value=${duesFilter.maxAmount}
            onInput=${e => setDuesFilter({ ...duesFilter, maxAmount: e.target.value })} />
          <div>
            <label class="text-xs text-gray-600 font-semibold">Due Since Date (Min)</label>
            <input class="input-field" type="date" value=${duesFilter.dueSince}
              onInput=${e => setDuesFilter({ ...duesFilter, dueSince: e.target.value })} />
          </div>
        </div>
        <div class="flex gap-4 mt-4">
          <select class="input-field" style=${{ maxWidth: '200px' }} value=${duesFilter.sortBy}
            onChange=${e => setDuesFilter({ ...duesFilter, sortBy: e.target.value })}>
            <option value="dueSince">Sort by Due Date</option>
            <option value="totalDues">Sort by Amount</option>
            <option value="name">Sort by Name</option>
          </select>
          <select class="input-field" style=${{ maxWidth: '150px' }} value=${duesFilter.sortOrder}
            onChange=${e => setDuesFilter({ ...duesFilter, sortOrder: e.target.value })}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      <!-- Dues Table -->
      <div class="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Roll</th>
              <th>Name (Seat)</th>
              <th>Mobile</th>
              <th>Due Amount</th>
              <th>Valid Till</th>
              <th>Days Due</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${filteredDues.map(s => {
        const highlightClass = s.daysDue >= 90 ? 'bg-yellow-50' : '';
        const waLink = getWhatsAppLink(s);
        return html`
                <tr key=${s.id} class=${highlightClass}>
                  <td class="mono font-bold text-purple-700">${s.rollNo}</td>
                  <td>
                    <span class="font-semibold">${s.name}</span>
                    ${s.seatLabel && html`<span class="text-purple-600 ml-1">(${s.seatLabel})</span>`}
                  </td>
                  <td class="mono text-gray-600">${s.mobile || '-'}</td>
                  <td class="text-red-600 font-black text-lg">₹${s.totalDues}</td>
                  <td class="text-pink-600 font-semibold">${LMS.formatDate(s.paidUntil)} <span class="text-gray-400 text-xs">(${LMS.calculateStudentFinancials(s, payments).paidMonths} months)</span></td>
                  <td class="text-red-500 font-black">${s.daysDue}</td>
                  <td>
                    <div class="flex gap-2 items-center">
                      <button 
                        class="text-pink-600 hover:text-pink-800 font-semibold text-sm"
                        style=${{ background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick=${() => setPaymentModal({ open: true, student: s })}
                      >Collect</button>
                      ${waLink && html`
                        <a href=${waLink} target="_blank" class="text-green-500 hover:text-green-700 text-lg" title="Send WhatsApp reminder">💬</a>
                      `}
                    </div>
                  </td>
                </tr>
              `;
      })}
          </tbody>
        </table>
        ${filteredDues.length === 0 && html`<p class="text-center py-8 text-gray-400">No dues match the filters.</p>`}
      </div>
    </${Card}>

    <!-- Payment Modal -->
    <${Modal} isOpen=${paymentModal.open} onClose=${() => setPaymentModal({ open: false, student: null })} title="Collect Payment" size="md">
      ${paymentModal.student && html`<${LMS.PaymentForm} student=${paymentModal.student} onClose=${() => setPaymentModal({ open: false, student: null })} />`}
    </${Modal}>
  </div>`;
};

// Collection Card Component (Extracted)
LMS.CollectionCard = ({ title, stats, isVisible, onToggle, borderColor, requiresPassword, customContent, showToast }) => {
  const handleToggle = () => {
    if (!isVisible && requiresPassword) {
      const pwd = prompt('Enter password to view ' + title + ':');
      if (pwd !== '3565-78') {
        showToast('Incorrect password!', 'error');
        return;
      }
    }
    onToggle();
  };

  return html`
  <div class="bg-card rounded-xl border-l-4 p-4 shadow-sm" style=${{ borderLeftColor: borderColor }}>
    <div class="flex justify-between items-center mb-2">
      <div class="flex items-center gap-2">
        <span class="text-purple-500" style=${{ color: borderColor }}>${customContent ? '📊' : '⟳'}</span>
        <h3 class="font-bold" style=${{ color: borderColor }}>${title}</h3>
      </div>
      <button onClick=${handleToggle} class="text-gray-400 hover:text-gray-600" style=${{ background: 'none', border: 'none', cursor: 'pointer' }}>
        ${isVisible ? '👁️' : '🔒'}
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
      : html`<p class="text-2xl text-gray-400">🔒🔒🔒🔒🔒</p>`
    }
  </div>
`;
};
