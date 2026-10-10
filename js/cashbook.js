window.LMS = window.LMS || {};
LMS.useCashBook = () => {
  const session = LMS.useAccountsSession();
  const identity = LMS.DB.scope + ':' + (session?.token || session?.expiresAt || 'staff');
  const [state,setState] = useState({identity:null,data:null,error:''});
  const [busy,setBusy] = useState(false),[pending,setPending] = useState(null);
  const retryKey = 'cash-command:' + LMS.DB.scope + ':' + (session ? 'personal' : 'staff');
  const mounted = useRef(false), version = useRef(0), locked = useRef(false);
  const refresh = async (append = false) => {
    const n=++version.current;
    try {
      const cursor=append?state.data?.next:null;
      const result=await LMS.SqlApi.request('cash',{query:cursor?{beforeAt:cursor.at,beforeId:cursor.id}:{}});
      if(mounted.current && n===version.current) setState(previous=>({identity,data:{...result,entries:append?[...(previous.data?.entries||[]),...result.entries]:result.entries},error:''}));
    } catch(error) { if(mounted.current && n===version.current) setState({identity,data:null,error:error.message}); }
  };
  useEffect(()=>{
    mounted.current=true; setState({identity,data:null,error:''}); setPending(null);
    let cancelled=false;
    LMS.LoginStorage.read(retryKey).then(raw=>{if(!cancelled)setPending(raw?JSON.parse(raw):null);}).catch(error=>{if(!cancelled)setState({identity,data:null,error:error.message});});
    refresh();
    const reload=()=>refresh();
    window.addEventListener('lms-cash-updated',reload);window.addEventListener('focus',reload);
    const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},60000);
    return()=>{cancelled=true;mounted.current=false;version.current++;clearInterval(timer);window.removeEventListener('lms-cash-updated',reload);window.removeEventListener('focus',reload);};
  },[identity]);
  const submit = async (body,retry=false) => {
    if(locked.current) return false;
    locked.current=true;setBusy(true);
    try {
      const saved=await LMS.LoginStorage.read(retryKey);
      if(saved && !retry) throw new Error('An earlier request needs retry. Use “Retry saved entry” first.');
      const command=retry?JSON.parse(saved||'null'):{...body,id:crypto.randomUUID()};
      if(!command) return false;
      await LMS.DB.flush();
      if(!await LMS.DB.syncLocalToCloud()) throw new Error('Finish pending library sync before recording cash. No cash entry was sent.');
      await LMS.LoginStorage.write(retryKey,JSON.stringify(command));setPending(command);
      try { await LMS.SqlApi.request('cash',{method:'POST',body:command}); }
      catch(error) {
        if(error.status>=400 && error.status<500 && error.status!==401 && error.status!==408 && error.status!==429) {
          await LMS.LoginStorage.write(retryKey,null);setPending(null);
        }
        throw error;
      }
      await LMS.LoginStorage.write(retryKey,null);setPending(null);
      window.dispatchEvent(new Event('lms-cash-updated'));
      LMS.DB.pullSqlChanges().catch(error=>LMS.DB.fail(error));
      return true;
    } finally { locked.current=false; if(mounted.current)setBusy(false); }
  };
  return {data:state.identity===identity?state.data:null,error:state.identity===identity?state.error:'',busy,pending,submit,refresh};
};

LMS.CashBalances = ({balances}) => {
  const [visible,setVisible]=useState({});const {Icons}=LMS;
  return html`<div class="cash-balance-grid">${[['counter','Counter available','Cash at the desk'],['purse','Purse available','Cash kept aside'],['takenHome','Taken home','Owner withdrawals']].map(([key,label,help])=>html`<article class=${'cash-balance cash-'+key} key=${key}><div><span>${label}</span><button type="button" aria-label=${(visible[key]?'Hide ':'Show ')+label} aria-pressed=${!!visible[key]} onClick=${()=>setVisible(old=>({...old,[key]:!old[key]}))}>${visible[key]?html`<${Icons.Eye}/>`:html`<${Icons.EyeOff}/>`}</button></div><strong>${visible[key]?LMS.formatCurrency(balances[key]):'••••'}</strong><small>${help}</small></article>`)}</div>`;
};
LMS.CashDashboard = () => {
  const book=LMS.useCashBook();
  if(!book.data) return book.error?html`<div class="cash-notice">Counter & Purse: ${book.error}</div>`:null;
  return html`<section class="cash-dashboard"><div class="cash-section-heading"><h3>Counter & Purse</h3><span>Recorded cash · amounts hidden by default</span></div><${LMS.CashBalances} balances=${book.data.balances}/></section>`;
};

LMS.CashWorkspace = ({initialAction='expense'}) => {
  const book=LMS.useCashBook(),{showToast}=useContext(LMS.AppContext),{Icons}=LMS;
  const blank=()=>({amount:'',date:LMS.today(),reason:'',source:'counter',categoryId:'',staffId:'',salaryMonth:LMS.today().slice(0,7),kind:'transfer',destination:'purse'});
  const [form,setForm]=useState(blank),[tab,setTab]=useState(initialAction),[showHistory,setShowHistory]=useState(false),[salaryVisible,setSalaryVisible]=useState(false);
  const [commandError,setCommandError]=useState('');
  const update=(key,value)=>setForm(old=>({...old,[key]:value}));
  const run=async(body,after)=>{setCommandError('');try{if(await book.submit(body)){after?.();showToast('Saved to the cash ledger.','success');}}catch(error){setCommandError(error.message);}};
  const data=book.data;
  if(!data) return html`<section class="cash-empty" role="status"><h3>Counter & Purse</h3><p>${book.error||'Loading cash ledger…'}</p>${book.error&&html`<button class="btn btn-secondary" onClick=${()=>book.refresh()}>Retry</button>`}</section>`;
  const staff=data.staff.find(person=>person.id===form.staffId);
  const staffMonths=data.payroll.filter(row=>row.staffId===form.staffId).sort((a,b)=>b.month.localeCompare(a.month));
  const selectedMonth=staffMonths.find(row=>row.month===form.salaryMonth);
  const olderDue=staffMonths.filter(row=>row.month<form.salaryMonth).reduce((sum,row)=>sum+row.remaining,0);
  const onSubmit=e=>{
    e.preventDefault();
    const body=tab==='expense'?{...form,action:'expense'}:{...form,action:'movement'};
    if(tab==='transfer')Object.assign(body,{kind:'transfer',destination:form.source==='counter'?'purse':'counter'});
    if(tab==='home')Object.assign(body,{kind:'withdrawal',source:'purse',destination:'home'});
    if(tab==='adjust')Object.assign(body,form.kind==='adjustment-out'?{kind:'adjustment-out',source:form.source,destination:'outside'}:{kind:'deposit',source:'outside',destination:form.source});
    run(body,()=>setForm(blank()));
  };
  return html`<div class="cash-workspace">
    <header class="cash-hero"><span class="cash-hero-icon"><${Icons.Payments}/></span><div><span class="cash-eyebrow">DAILY CASH DESK</span><h2>Every rupee, accounted for.</h2><p>Counter → Purse → Home. Transfers stay separate from expenses.</p></div><span class="cash-access-pill">${data.privateAccess?'Personal Accounts':'Library staff'}</span></header>
    <${LMS.CashBalances} balances=${data.balances}/>
    ${(data.balances.counter<0||data.balances.purse<0)&&html`<p class="cash-warning">A recorded cash balance is negative. Check older expense sources and missing cash movements, then reconcile in personal Accounts before paying from that balance.</p>`}
    <details class="cash-basis"><summary>How these balances are calculated</summary><p>All recorded cash receipts minus cash expenses, transfers and withdrawals. Online payments and discounts are not physical cash. ${data.balances.assumedCashExpenses} older expenses have no cash source and are counted against Counter. ${data.balances.unknownPaymentMethods} receipts have an unknown payment method and are excluded from cash.</p><p>Old transfers and cash already taken home cannot be inferred. Reconcile counted cash in private Accounts using an adjustment with a reason.</p></details>
    ${book.pending&&html`<div class="cash-notice" role="status">A saved request needs confirmation. Retry it safely; the same request will not be posted twice.<button class="btn btn-secondary" disabled=${book.busy} onClick=${async()=>{try{await book.submit(null,true);}catch(error){setCommandError(error.message);}}}>Retry saved entry</button></div>`}
    ${commandError&&html`<p class="cash-error" role="alert">${commandError}</p>`}
    <div class="cash-main-grid"><section class="cash-panel">
      <nav class="cash-action-tabs" aria-label="Cash actions">${[['expense','Add expense'],['transfer','Move cash'],...(data.privateAccess?[['home','Take home'],['adjust','Adjustment']]:[])].map(([key,label])=>html`<button type="button" class=${tab===key?'selected':''} onClick=${()=>{setTab(key);setForm(blank());setCommandError('');}}>${label}</button>`)}</nav>
      <form class="cash-form" onSubmit=${onSubmit}><fieldset disabled=${book.busy||!!book.pending}>
        <div class="cash-form-title"><h3>${{expense:'Record an expense',transfer:'Move cash between balances',home:'Take cash home',adjust:'Reconcile historical cash'}[tab]}</h3><p>${data.privateAccess?'Personal entries stay in private Accounts activity.':'Staff expenses appear in Alerts and library Activity.'}</p></div>
        ${tab==='expense'&&html`<label>Expense category<select class="input-field" required value=${form.categoryId} onChange=${e=>update('categoryId',e.target.value)}><option value="">Choose category</option>${data.categories.filter(row=>row.active).map(row=>html`<option value=${row.id}>${row.name}</option>`)}<option value="salary">Salary</option></select></label>`}
        ${tab==='expense'&&form.categoryId==='salary'&&html`<div class="cash-salary-box"><div class="cash-form-pair"><label>Staff member<select class="input-field" required value=${form.staffId} onChange=${e=>{const id=e.target.value;const months=data.payroll.filter(row=>row.staffId===id);setForm(old=>({...old,staffId:id,salaryMonth:months.at(-1)?.month||''}));}}><option value="">Choose staff</option>${data.staff.map(row=>html`<option value=${row.id}>${row.name}${row.active?'':' · Past staff'}</option>`)}</select></label><label>Salary for month<select class="input-field" required value=${form.salaryMonth} onChange=${e=>update('salaryMonth',e.target.value)}>${staffMonths.length?staffMonths.map(row=>html`<option value=${row.month}>${row.month}${row.remaining===0?' · Paid':''}</option>`):html`<option value="">Choose staff first</option>`}</select></label></div><button type="button" class="btn btn-ghost" onClick=${()=>setSalaryVisible(!salaryVisible)}>${salaryVisible?'Hide salary amounts':'Show salary amounts'}</button>${selectedMonth&&html`<p>${staff?.name} · Salary ${salaryVisible?LMS.formatCurrency(selectedMonth.salary):'••••'} · Paid ${salaryVisible?LMS.formatCurrency(selectedMonth.paid):'••••'} · <strong>Remaining ${salaryVisible?LMS.formatCurrency(selectedMonth.remaining):'••••'}</strong></p>`}${olderDue>0&&html`<p class="cash-warning">Earlier months pending: ${salaryVisible?LMS.formatCurrency(olderDue):'••••'}. You can still pay the selected month.</p>`}</div>`}
        ${tab==='adjust'&&html`<label>Adjustment type<select class="input-field" value=${form.kind} onChange=${e=>update('kind',e.target.value)}><option value="transfer">Add cash / opening correction</option><option value="adjustment-out">Remove cash / historical outflow</option></select></label>`}
        ${tab!=='home'&&html`<label>${tab==='adjust'?'Cash location':'Pay / move from'}<select class="input-field" value=${form.source} onChange=${e=>update('source',e.target.value)}><option value="counter">Counter</option><option value="purse">Purse</option>${tab==='expense'&&html`<option value="bank">Bank / online (no cash deduction)</option>`}</select></label>`}
        ${tab==='transfer'&&html`<div class="cash-route">${form.source==='counter'?'Counter → Purse':'Purse → Counter'}<small>This is a transfer, not an expense.</small></div>`}
        ${tab==='home'&&html`<div class="cash-route">Purse → Home<small>Owner withdrawal. This does not increase expenses.</small></div>`}
        <div class="cash-form-pair"><label>Amount (₹)<input class="input-field" required type="number" inputMode="decimal" min="0.01" max="9999999999" step="0.01" value=${form.amount} onChange=${e=>update('amount',e.target.value)} placeholder="0.00"/></label><label>Date<input class="input-field" required type="date" max=${LMS.today()} value=${form.date} onChange=${e=>update('date',e.target.value)}/></label></div>
        <label>Reason / description<input class="input-field" required maxLength="300" value=${form.reason} onChange=${e=>update('reason',e.target.value)} placeholder=${tab==='expense'?'e.g. October salary installment / electricity bill':'e.g. End-of-day cash / cash taken home'}/></label>
        <button class="btn btn-primary cash-save" type="submit">${book.busy?'Saving…':tab==='expense'?'+ Save expense':tab==='home'?'Record home withdrawal':'Record cash movement'}</button>
        ${tab==='expense'&&!data.categories.some(row=>row.active)&&html`<p class="cash-warning">Add expense categories and staff in private Accounts → Counter & Purse.</p>`}
      </fieldset></form>
    </section><section class="cash-panel cash-history"><div class="cash-section-heading"><div><h3>${data.privateAccess?'Cash movement history':'Staff cash activity'}</h3><p>${data.privateAccess?'Includes personal and staff entries.':'Personal entry details are private.'}</p></div><button class="icon-button" aria-label=${showHistory?'Hide amounts':'Show amounts'} onClick=${()=>setShowHistory(!showHistory)}>${showHistory?html`<${Icons.Eye}/>`:html`<${Icons.EyeOff}/>`}</button></div>
      <div class="cash-entry-list">${data.entries.map(entry=>html`<article class=${'cash-entry '+(entry.voided_at?'cash-voided':'')} key=${entry.id}><div class="cash-entry-top"><span class=${'cash-entry-tag kind-'+entry.kind}>${entry.voided_at?'Voided':entry.kind==='expense'?'Expense':entry.kind==='withdrawal'?'Taken home':entry.kind==='transfer'?'Transfer':'Adjustment'}</span><strong>${showHistory?LMS.formatCurrency(entry.amount):'••••'}</strong></div><h4>${entry.reason}</h4><p>${LMS.formatDate(entry.day)} · ${entry.source} → ${entry.destination}${entry.salary_month?' · Salary '+entry.salary_month:''}</p><div class="cash-entry-footer"><span>${entry.private?'Personal':'Library staff'}${entry.reviewed_at?' · Reviewed':''}</span>${data.privateAccess&&!entry.voided_at&&html`<button disabled=${book.busy} onClick=${()=>{const reason=prompt('Reason for cancelling this entry (the original stays in history):');if(reason?.trim())run({action:'void',entryId:entry.id,reason});}}>Void entry</button>`}</div>${entry.void_reason&&html`<small>${entry.void_reason}</small>`}</article>`)}</div>
      ${!data.entries.length&&html`<div class="cash-empty">No new cash entries yet. Historical receipts and expenses are already included in the balances.</div>`}
      ${data.next&&html`<button class="btn btn-secondary" onClick=${()=>book.refresh(true)}>Load older entries</button>`}
    </section></div>
    ${data.privateAccess&&html`<${LMS.CashSetup} data=${data} busy=${book.busy||!!book.pending} run=${run}/>`}
  </div>`;
};

LMS.CashSetup = ({data,busy,run}) => {
  const [category,setCategory]=useState('');
  const blank=()=>({staffId:'',name:'',salary:'',startMonth:LMS.today().slice(0,7),effectiveMonth:LMS.today().slice(0,7),endMonth:LMS.today().slice(0,7),active:true});
  const [staff,setStaff]=useState(blank),[payrollVisible,setPayrollVisible]=useState(false);
  const field=(key,value)=>setStaff(old=>({...old,[key]:value}));
  return html`<section class="cash-panel cash-setup"><div class="cash-section-heading"><div><span class="cash-eyebrow">PERSONAL ACCOUNTS ONLY</span><h3>Categories & staff salaries</h3><p>These lists feed the dashboard expense dropdowns.</p></div></div>
    <div class="cash-main-grid"><div><h4>Expense categories</h4><form class="cash-inline-form" onSubmit=${e=>{e.preventDefault();run({action:'category',name:category},()=>setCategory(''));}}><input class="input-field" required maxLength="80" value=${category} placeholder="e.g. Electricity, Tea, Rent" onChange=${e=>setCategory(e.target.value)}/><button class="btn btn-primary" disabled=${busy}>Add</button></form><div class="cash-category-list">${data.categories.map(row=>html`<div key=${row.id}><span>${row.name}${row.active?'':' · Inactive'}</span><button disabled=${busy} onClick=${()=>run({action:'category',categoryId:row.id,name:row.name,active:!row.active})}>${row.active?'Disable':'Enable'}</button></div>`)}</div></div>
    <div><h4>${staff.staffId?'Update staff / salary':'Add staff member'}</h4><form class="cash-form" onSubmit=${e=>{e.preventDefault();run({action:'staff',...staff},()=>setStaff(blank()));}}><fieldset disabled=${busy}><label>Staff name<input class="input-field" required maxLength="100" value=${staff.name} onChange=${e=>field('name',e.target.value)}/></label><div class="cash-form-pair"><label>Track salary from<input class="input-field" type="month" min="2000-01" required disabled=${!!staff.staffId} value=${staff.startMonth} onChange=${e=>setStaff(old=>({...old,startMonth:e.target.value,effectiveMonth:e.target.value}))}/></label><label>Monthly salary (₹)<input class="input-field" type="number" min="0.01" step="0.01" required value=${staff.salary} onChange=${e=>field('salary',e.target.value)}/></label></div>${staff.staffId&&html`<label>New salary effective month<input class="input-field" type="month" min=${staff.startMonth} required value=${staff.effectiveMonth} onChange=${e=>field('effectiveMonth',e.target.value)}/></label><label><input type="checkbox" checked=${staff.active} onChange=${e=>field('active',e.target.checked)}/> Active staff</label>`}${!staff.active&&html`<label>Last salary month<input class="input-field" type="month" required min=${staff.startMonth} value=${staff.endMonth} onChange=${e=>field('endMonth',e.target.value)}/></label>`}<button class="btn btn-primary">Save staff & salary</button>${staff.staffId&&html`<button class="btn btn-secondary" type="button" onClick=${()=>setStaff(blank())}>Cancel edit</button>`}</fieldset></form></div></div>
    <div class="cash-section-heading"><h4>Salary register</h4><button class="btn btn-secondary" onClick=${()=>setPayrollVisible(!payrollVisible)}>${payrollVisible?'Hide salary amounts':'Show salary amounts'}</button></div><div class="cash-staff-list">${data.staff.map(person=>{
      const rates=data.rates.filter(row=>row.staff_id===person.id),latest=rates.at(-1),months=data.payroll.filter(row=>row.staffId===person.id),due=months.reduce((sum,row)=>sum+row.remaining,0);
      return html`<details key=${person.id}><summary><strong>${person.name}</strong><span>${person.active?'Active':'Inactive'} · Due ${payrollVisible?LMS.formatCurrency(due):'••••'}</span></summary><button class="btn btn-secondary" disabled=${busy} onClick=${()=>setStaff({staffId:person.id,name:person.name,startMonth:person.start_month,effectiveMonth:LMS.today().slice(0,7),salary:latest?.salary||'',endMonth:person.end_month||LMS.today().slice(0,7),active:person.active})}>Edit staff / salary</button><div class="cash-table-wrap"><table><thead><tr><th>Month</th><th>Salary</th><th>Paid</th><th>Remaining</th></tr></thead><tbody>${months.slice().reverse().map(row=>html`<tr key=${row.month}><td>${row.month}</td><td>${payrollVisible?LMS.formatCurrency(row.salary):'••••'}</td><td>${payrollVisible?LMS.formatCurrency(row.paid):'••••'}</td><td>${payrollVisible?LMS.formatCurrency(row.remaining):'••••'}${row.overpaid>0?' · Overpaid':''}</td></tr>`)}</tbody></table></div></details>`;
    })}</div>
  </section>`;
};

LMS.CashStaffAlerts = () => {
  const book=LMS.useCashBook(),{showToast}=useContext(LMS.AppContext),[visible,setVisible]=useState(false);
  if(!book.data?.alerts.length)return null;
  return html`<section class="cash-panel"><div class="cash-section-heading"><div><h3>Staff expenses to review <span class="cash-count">${book.data.alertCount}</span></h3><p>Only library-staff entries appear here. Personal Accounts entries stay private.</p></div><button class="btn btn-secondary" onClick=${()=>setVisible(!visible)}>${visible?'Hide amounts':'Show amounts'}</button></div><div class="cash-alert-grid">${book.data.alerts.map(entry=>html`<article class="cash-entry" key=${entry.id}><div class="cash-entry-top"><span class="cash-entry-tag">Staff expense</span><strong>${visible?LMS.formatCurrency(entry.amount):'••••'}</strong></div><h4>${entry.reason}</h4><p>${LMS.formatDate(entry.day)} · ${entry.source}${entry.salary_month?' · Salary '+entry.salary_month:''}</p>${book.data.privateAccess?html`<button class="btn btn-secondary" disabled=${book.busy} onClick=${async()=>{try{await book.submit({action:'review',entryId:entry.id});}catch(error){showToast(error.message,'error');}}}>Mark reviewed</button>`:html`<small>Review from personal Accounts login</small>`}</article>`)}</div></section>`;
};
