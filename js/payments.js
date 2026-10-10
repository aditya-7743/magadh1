// ==================== PAYMENTS.JS - Payment Management ====================
window.LMS = window.LMS || {};

// A rejected SQL transaction stays intact until the operator corrects its payment.
// Never discard the queue, infer a date, or change a financial amount automatically.
LMS.PendingPaymentRepair = () => {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const begin = () => {
    const operation = LMS.DB.localLoad('offline_queue', [])[0];
    const candidates = (operation?.changes || []).filter(change => change.key === 'payments' && !change.value?._deleted);
    const paymentId = LMS.DB.paymentSyncIssue?.paymentId;
    const invalid = value => value.amount == null || value.amount === '' || !Number.isFinite(Number(value.amount)) || Number(value.amount) < 0 || !Number.isFinite(Number(value.discount ?? 0)) || Number(value.discount ?? 0) < 0 || !LMS.validDate(value.date);
    const change = paymentId ? candidates.find(change => change.id === paymentId) : candidates.find(change => invalid(change.value));
    if (!change) { setMessage('The server has not identified the rejected payment. Retry sync after the server update; no pending records were changed.'); return; }
    setDraft({ scope: LMS.DB.scope, operationId: operation.id, id: change.id, original: JSON.stringify(change.value), amount: String(change.value.amount ?? ''), discount: String(change.value.discount ?? 0), date: String(change.value.date || ''), name: change.value.studentName || LMS.DB.localLoad('students', []).find(student => student.id === change.value.studentId)?.name || change.id, roll: change.value.rollNo || '' });
    setMessage(''); setOpen(true);
  };
  const save = async () => {
    if (!draft.amount.trim() || !draft.discount.trim() || !Number.isFinite(Number(draft.amount)) || Number(draft.amount) < 0 || !Number.isFinite(Number(draft.discount)) || Number(draft.discount) < 0 || !LMS.validDate(draft.date)) { setMessage('Enter non-negative amounts and a valid YYYY-MM-DD date.'); return; }
    const db = LMS.DB;
    if (db.processing || db.pending.length || db.switching || db.scope !== draft.scope) { setMessage('Wait for saving to finish, then reopen this review.'); return; }
    if (!confirm(`Correct this pending payment for ${draft.name} to ₹${draft.amount}, discount ₹${draft.discount}, dated ${draft.date}? The original queued entry will be retained locally for recovery.`)) return;
    db.processing = true; setBusy(true);
    try {
      await db.writing;
      const operation = db.localLoad('offline_queue', [])[0];
      const change = operation?.changes.find(change => change.key === 'payments' && change.id === draft.id);
      if (operation?.id !== draft.operationId || !change || JSON.stringify(change.value) !== draft.original) throw new Error('Pending data changed. Close and reopen this review.');
      const value = { ...change.value, amount: Number(draft.amount), discount: Number(draft.discount), date: draft.date };
      const replacement = { ...operation, id: crypto.randomUUID(), changes: operation.changes.map(item => item === change ? { ...item, value } : item) };
      const current = db.localLoad('payments', []).find(payment => payment.id === draft.id);
      const replaceLocal = current?._rev === change.value._rev;
      const writes = [{ key: '_paymentRepair/' + operation.id, value: { original: operation, corrected: replacement, repairedAt: new Date().toISOString() } }];
      if (replaceLocal) writes.push({ key: 'payments/' + draft.id, value });
      const queue = await LMS.Store.commit(draft.scope, writes, queue => {
        if (queue[0]?.id !== operation.id || JSON.stringify(queue[0].changes) !== JSON.stringify(operation.changes)) throw new Error('Another tab changed the queue. Reopen the review.');
        return [replacement, ...queue.slice(1)];
      });
      if (db.scope === draft.scope) {
        db.cache.offline_queue = queue;
        if (replaceLocal) db.cache.payments = db.localLoad('payments', []).map(payment => payment.id === draft.id ? value : payment);
        db.notify('payments'); db.channel?.postMessage({ scope: draft.scope });
      }
      setOpen(false); setMessage('Correction saved. Retrying SQL sync…');
    } catch (error) { setMessage(error.message); }
    finally { db.processing = false; setBusy(false); db.notify('status'); }
    if (db.scope === draft.scope) await db.processOfflineQueue();
  };
  return html`<div><button class="btn btn-secondary btn-sm" onClick=${begin}>Review pending payment</button>${message && html`<p role="status">${message}</p>`}
    <${LMS.Modal} isOpen=${open} onClose=${() => !busy && setOpen(false)} title="Correct pending payment" size="sm">
      ${draft && html`<div class="space-y-4"><p><strong>${draft.name}</strong> ${draft.roll && '· Roll ' + draft.roll}</p>${LMS.DB.paymentSyncIssue?.fields?.length && html`<p class="text-sm">Fields needing correction: ${LMS.DB.paymentSyncIssue.fields.join(', ')}</p>`}<p class="text-sm">Original stored date: ${JSON.parse(draft.original).date || '(missing)'}. Correct only after checking the receipt.</p>
      ${[['amount','Received amount (₹)','number'],['discount','Discount (₹)','number'],['date','Payment date','date']].map(([key,label,type]) => html`<label class="block" key=${key}>${label}<input class="input-field" type=${type} min=${type === 'number' ? '0' : undefined} step=${type === 'number' ? '0.01' : undefined} value=${draft[key]} onInput=${event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} /></label>`)}
      <p class="text-sm">All other pending changes stay in their original order.</p>${message && html`<p role="status">${message}</p>`}<button class="btn btn-primary" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save correction & retry'}</button></div>`}
    </${LMS.Modal}></div>`;
};

// Standalone Payment Form for adding/editing payments from student cards
LMS.PaymentForm = ({ student, payment, onClose }) => {
  const { payments, setPayments, addLog, showToast, settings } = useContext(LMS.AppContext);
  const { Button, Input, Select } = LMS;

  const isEdit = !!payment;

  // Initialize form state
  const [form, setForm] = useState({
    studentId: student?.id || payment?.studentId || '',
    amount: payment ? ((Number(payment.amount) + (Number(payment.discount) || 0)) / (Number(payment.months) || 1)) : (Number(student?.monthlyFee) || 600),
    months: payment?.months || 1,
    discount: payment?.discount || 0,
    method: payment?.method || 'cash',
    note: payment?.note || '',
    photo: payment?.photo || '',
    date: payment?.date || LMS.today(),
    time: payment ? LMS.paymentTime(payment) : LMS.currentTimeIST(),
  });

  // Sync form when payment prop changes
  useEffect(() => {
    if (payment) {
      setForm({
        studentId: payment.studentId,
        amount: ((Number(payment.amount) + (Number(payment.discount) || 0)) / (Number(payment.months) || 1)),
        months: payment.months || 1,
        discount: payment.discount || 0,
        method: payment.method || 'cash',
        note: payment.note || '',
        photo: payment.photo || '',
        date: payment.date,
        time: LMS.paymentTime(payment),
      });
      setCustomTotal(payment.amount);
      setIsCustomAmount(true); // Default to custom/exact amount for edits to avoid recalc issues
    }
  }, [payment]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) { const c = await LMS.compressImage(file); setForm(prev => ({ ...prev, photo: c })); }
  };

  const [isCustomAmount, setIsCustomAmount] = useState(!!payment);
  const [customTotal, setCustomTotal] = useState(payment?.amount || (student?.monthlyFee || 600));

  // If not custom, auto-calculate. If custom, use custom value.
  const calculatedTotal = isCustomAmount ? customTotal : (form.amount * form.months) - form.discount;

  useEffect(() => {
    if (!isCustomAmount) {
      setCustomTotal((form.amount * form.months) - form.discount);
    }
  }, [form.amount, form.months, form.discount, isCustomAmount]);

  const handleSave = () => {
    const error = LMS.validatePayment(form, calculatedTotal) || (form.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time) ? 'Enter a valid payment time.' : '');
    if (error) { showToast(error, 'error'); return; }

    if (isEdit) {
      // Update existing payment
      const updatedPayment = { ...payment, ...form, discount: Number(form.discount), months: Number(form.months), amount: Math.round(Number(calculatedTotal) * 100) / 100 };
      setPayments(prev => prev.map(p => p.id === payment.id ? updatedPayment : p));


      addLog(`Updated payment ₹${form.amount} for ${student?.name}`);
      showToast('Payment updated successfully!', 'success');
    } else {
      // Add new payment
      // Adjust date to match input if needed, but ISO string is fine for ID usually
      const newPayment = { ...form, discount: Number(form.discount), months: Number(form.months), amount: Math.round(Number(calculatedTotal) * 100) / 100, ...(student?.billingEpoch ? { billingEpoch: student.billingEpoch } : {}), studentName: student?.name || '', rollNo: student?.rollNo || '', id: LMS.generateId() };
      setPayments(prev => [...prev, newPayment]);


      addLog(`Added payment ₹${calculatedTotal} for ${student?.name}`);
      showToast('Payment added successfully!', 'success');
    }
    onClose();
  };

  return html`<div class="space-y-4">
    <div class="flex items-center gap-3 mb-4">
      <${LMS.StudentPhoto} student=${student} size="lg" />
      <div>
        <p class="font-bold">${student?.name}</p>
        <p class="text-sm text-gray-500">Roll: ${student?.rollNo} • Fee: ₹${student?.monthlyFee}/mo</p>
      </div>
    </div>
    
    <div class="grid grid-2 gap-4">
      <${Input} label="Amount per Month (₹)" type="number" value=${form.amount} onChange=${e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
      <${Input} label="Months" type="number" value=${form.months} onChange=${e => setForm(p => ({ ...p, months: Number(e.target.value) }))} min="1" />
    </div>
    <div class="grid grid-2 gap-4">
      <${Input} label="Discount (₹)" type="number" value=${form.discount} onChange=${e => setForm(p => ({ ...p, discount: Number(e.target.value) }))} />
      <${Select} label="Method" value=${form.method} onChange=${e => setForm(p => ({ ...p, method: e.target.value }))} options=${[{ value: 'cash', label: 'Cash' }, { value: 'online', label: 'Online' }]} />
    </div>
    <${Input} label="Date" type="date" max="2099-12-31" value=${form.date} onChange=${e => setForm(p => ({ ...p, date: e.target.value }))} />
    <${Input} label="Payment time (IST)" type="time" value=${form.time} onChange=${e => setForm(p => ({ ...p, time: e.target.value }))} />
    <${Input} label="Note" value=${form.note} onChange=${e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional note..." />
    
    <div>
      <label class="input-label">Receipt Photo (optional)</label>
      <label class="upload-area" style=${{ height: '5rem' }}>
        ${form.photo ? html`<img src=${form.photo} alt="Receipt" style=${{ height: '100%', objectFit: 'contain', borderRadius: '0.25rem' }} />` : html`<span class="text-gray-400">📷 Upload Receipt</span>`}
        <input type="file" accept="image/*" onChange=${LMS.safeAction(handleImageUpload)} />
      </label>
    </div>
    
    <div class="card p-3 text-center bg-green-50">
      <div class="flex justify-between items-center mb-2">
        <p class="text-sm text-gray-600">Net Payment:</p>
        <label class="flex items-center gap-2 text-xs text-blue-600 cursor-pointer">
          <input type="checkbox" checked=${isCustomAmount} onChange=${e => setIsCustomAmount(e.target.checked)} />
          Custom Amount
        </label>
      </div>
      ${isCustomAmount
      ? html`<input type="number" class="text-2xl font-bold text-green-600 text-center bg-transparent border-b border-green-300 w-full focus:outline-none" 
               value=${customTotal} onChange=${e => setCustomTotal(Number(e.target.value))} />`
      : html`<p class="text-2xl font-bold text-green-600">₹${Number(calculatedTotal).toLocaleString('en-IN')}</p>`
    }
    </div>
    
    ${settings.qrCode && html`<div class="text-center">
      <p class="text-sm text-gray-500 mb-2">Payment QR Code</p>
      <img src=${settings.qrCode} alt="QR" class="mx-auto w-24 h-24 object-contain rounded" />
    </div>`}
    
    <div class="flex gap-3 justify-end">
      <${Button} variant="secondary" onClick=${onClose}>Cancel</${Button}>
      <${Button} onClick=${handleSave}>${isEdit ? '✏️ Update Payment' : '💰 Add Payment'}</${Button}>
    </div>
  </div>`;
};

LMS.PaymentManagement = () => {
  const { students, payments, setPayments, addLog, showToast, settings, openStudent } = useContext(LMS.AppContext);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [viewImage, setViewImage] = useState(null);
  const { Button, Card, Modal, Input, Select, SearchBar, Icons, ImageViewer } = LMS;

  const [form, setForm] = useState({
    studentId: '', amount: 0, months: 1, discount: 0, method: 'cash', note: '', photo: '', date: LMS.today(), time: LMS.currentTimeIST(),
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (selectedStudent && !editPayment) {
      const s = students.find(x => x.id === selectedStudent);
      if (s) setForm(prev => ({ ...prev, studentId: selectedStudent, amount: s.monthlyFee }));
    }
  }, [selectedStudent, editPayment]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) { const c = await LMS.compressImage(file); setForm(prev => ({ ...prev, photo: c })); }
  };

  const calculatedTotal = (form.amount * form.months) - form.discount;

  const handleSave = () => {
    const error = LMS.validatePayment(form, calculatedTotal) || (form.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time) ? 'Enter a valid payment time.' : '');
    if (error) { showToast(error, 'error'); return; }
    const person = students.find(s => s.id === form.studentId);
    const payment = { ...editPayment, ...form, discount: Number(form.discount), months: Number(form.months), amount: Math.round(Number(calculatedTotal) * 100) / 100, studentName: person?.name || editPayment?.studentName || 'Archived student', rollNo: person?.rollNo || editPayment?.rollNo || '', ...(person?.billingEpoch ? { billingEpoch: person.billingEpoch } : {}), id: editPayment?.id || LMS.generateId() };
    if (editPayment) {
      setPayments(prev => prev.map(p => p.id === payment.id ? payment : p));


      addLog('Updated payment');
      showToast('Payment updated!', 'success');
    } else {
      setPayments(prev => [...prev, payment]);


      addLog('Added payment: ' + LMS.formatCurrency(calculatedTotal));
      showToast('Payment added!', 'success');
    }
    resetForm();
  };

  const handleDelete = async (p) => {
    if (!await LMS.Auth.confirmAction()) { showToast('Authentication failed', 'error'); return; }
    if (confirm('Delete this payment?')) {
      setPayments(prev => prev.filter(x => x.id !== p.id));


      addLog('Deleted payment');
      showToast('Payment deleted!', 'success');
    }
  };

  const resetForm = () => {
    setForm({ studentId: '', amount: 0, months: 1, discount: 0, method: 'cash', note: '', photo: '', date: LMS.today(), time: LMS.currentTimeIST() });
    setSelectedStudent('');
    setEditPayment(null);
    setShowForm(false);
  };

  const sendWhatsApp = (student, dueAmount) => {
    const msg = LMS.formatMessage(settings.whatsappTemplate, student, settings, payments);
    window.open('https://wa.me/91' + student.mobile + '?text=' + encodeURIComponent(msg), '_blank');
  };

  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const filtered = useMemo(() => payments.filter(p => {
    const s = studentById.get(p.studentId);
    return !search || String(s?.name || p.studentName || '').toLowerCase().includes(search.toLowerCase()) || String(s?.rollNo || p.rollNo || '').toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => new Date(b.date) - new Date(a.date)), [payments, studentById, search]);
  const lastPage = Math.max(1, Math.ceil(filtered.length / 40));
  const visiblePage = Math.min(page, lastPage);
  useEffect(() => setPage(1), [search]);

  return html`<div class="payments-workspace">
    <div class="payments-page-heading">
      <h1>Payments</h1>
      <${Button} size="sm" onClick=${() => { setForm(p => ({ ...p, date: LMS.today(), time: LMS.currentTimeIST() })); setShowForm(true); }}><${Icons.Add} /> Add Payment</${Button}>
    </div>

    <div class="payments-toolbar">
      <div class="payments-search"><${SearchBar} value=${search} onChange=${e => setSearch(e.target.value)} placeholder="Search by student name or roll..." /></div>

    <div class="payments-pagination">
      <${Button} size="sm" variant="secondary" disabled=${visiblePage <= 1} onClick=${() => setPage(visiblePage - 1)}>Previous</${Button}>
      <span>${filtered.length ? (visiblePage - 1) * 40 + 1 : 0}–${Math.min(visiblePage * 40, filtered.length)} / ${filtered.length}</span>
      <${Button} size="sm" variant="secondary" disabled=${visiblePage >= lastPage} onClick=${() => setPage(visiblePage + 1)}>Next</${Button}>
    </div>
    </div>

    <div class="payments-ledger">
      <table class="payments-table" aria-label="Payments">
        <thead><tr><th scope="col">Student</th><th scope="col" class="payments-date-cell">Date / duration</th><th scope="col" class="payments-method-cell">Method</th><th scope="col" class="payments-amount-cell">Amount</th><th scope="col" class="payments-actions-cell">Actions</th></tr></thead>
        <tbody>
      ${filtered.slice((visiblePage - 1) * 40, visiblePage * 40).map(payment => {
    const student = studentById.get(payment.studentId);
    return html`<tr key=${payment.id} class=${student ? 'student-open-target' : ''} tabIndex=${student ? 0 : undefined} onClick=${event => student && LMS.studentCardClick(event, student, openStudent)} onKeyDown=${event => student && LMS.studentCardKeyDown(event, student, openStudent)}>
            <td class="payments-student-cell">
              <div class="payments-student-name">
                <span class="payments-roll"># ${student?.rollNo || payment.rollNo || '—'}</span>
                <strong>${student?.name || payment.studentName || 'Archived student'}</strong>
              </div>
              ${payment.note && html`<p class="payments-note">${payment.note}</p>`}
            </td>
            <td class="payments-date-cell">
              <span>${LMS.formatPaymentDate(payment)}</span>
              <small>${payment.months} month(s)${payment.discount > 0 ? ' · Discount: ' + LMS.formatCurrency(payment.discount) : ''}</small>
            </td>
            <td class="payments-method-cell"><span class="payments-method-badge ${payment.method === 'cash' ? 'is-cash' : 'is-online'}">${payment.method}</span></td>
            <td class="payments-amount-cell"><strong>${LMS.formatCurrency(payment.amount)}</strong></td>
            <td class="payments-actions-cell"><div class="payments-row-actions">
              ${payment.photo && html`<button class="btn btn-ghost btn-sm" title="View receipt" aria-label="View receipt" onClick=${() => setViewImage(payment.photo)}><${Icons.Eye} /></button>`}
              ${student?.mobile && html`<button class="btn btn-ghost btn-sm payments-whatsapp" title="WhatsApp reminder" aria-label="WhatsApp reminder" onClick=${() => sendWhatsApp(student, LMS.getDueAmount(student, payments))}><${Icons.WhatsApp} /></button>`}
              <${Button} size="sm" variant="ghost" title="Edit payment" aria-label="Edit payment" onClick=${() => { 
                setEditPayment(payment); 
                setForm({
                  studentId: payment.studentId,
                  amount: ((Number(payment.amount) + (Number(payment.discount) || 0)) / (Number(payment.months) || 1)),
                  months: payment.months || 1,
                  discount: payment.discount || 0,
                  method: payment.method || 'cash',
                  note: payment.note || '',
                  photo: payment.photo || '',
                  date: payment.date || LMS.today(),
                  time: LMS.paymentTime(payment),
                }); 
                setSelectedStudent(payment.studentId); 
                setShowForm(true); 
              }}><${Icons.Edit} /></${Button}>
              <${Button} size="sm" variant="ghost" className="payments-delete" title="Delete payment" aria-label="Delete payment" onClick=${() => handleDelete(payment)}><${Icons.Delete} /></${Button}>
            </div></td>
        </tr>`;
  })}
      ${filtered.length === 0 && html`<tr class="payments-empty-row"><td colspan="5">No payments found</td></tr>`}
        </tbody>
      </table>
    </div>

    <${Modal} isOpen=${showForm} onClose=${resetForm} title=${editPayment ? 'Edit Payment' : 'Add Payment'}>
      <div class="space-y-4">
        <${Select} label="Student *" value=${selectedStudent} onChange=${e => setSelectedStudent(e.target.value)}
          options=${[{ value: '', label: 'Select Student' }, ...students.filter(s => s.isActive || s.id === selectedStudent).map(s => ({ value: s.id, label: s.rollNo + ' - ' + s.name }))]} />
        <div class="grid grid-2 gap-4">
          <${Input} label="Amount per Month (₹)" type="number" value=${form.amount} onChange=${e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
          <${Input} label="Months" type="number" value=${form.months} onChange=${e => setForm(p => ({ ...p, months: Number(e.target.value) }))} min="1" />
        </div>
        <div class="grid grid-2 gap-4">
          <${Input} label="Discount (₹)" type="number" value=${form.discount} onChange=${e => setForm(p => ({ ...p, discount: Number(e.target.value) }))} />
          <${Select} label="Method" value=${form.method} onChange=${e => setForm(p => ({ ...p, method: e.target.value }))} options=${[{ value: 'cash', label: 'Cash' }, { value: 'online', label: 'Online' }]} />
        </div>
        <${Input} label="Date" type="date" max="2099-12-31" value=${form.date} onChange=${e => setForm(p => ({ ...p, date: e.target.value }))} />
        <${Input} label="Payment time (IST)" type="time" value=${form.time} onChange=${e => setForm(p => ({ ...p, time: e.target.value }))} />
        <${Input} label="Note" value=${form.note} onChange=${e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional note..." />
        <div>
          <label class="input-label">Receipt Photo</label>
          <label class="upload-area" style=${{ height: '6rem' }}>
            ${form.photo ? html`<img src=${form.photo} alt="Receipt" style=${{ height: '100%', objectFit: 'contain', borderRadius: '0.25rem' }} />` : html`<span class="text-slate-400">Upload Receipt</span>`}
            <input type="file" accept="image/*" onChange=${LMS.safeAction(handleImageUpload)} />
          </label>
        </div>
        <div class="card p-3">
          <p class="text-sm text-slate-400">Total: <span class="text-xl font-bold text-emerald-400">${LMS.formatCurrency(calculatedTotal)}</span></p>
        </div>
        ${settings.qrCode && html`<div class="text-center">
          <p class="text-sm text-slate-400 mb-2">Payment QR Code</p>
          <img src=${settings.qrCode} alt="QR" style=${{ width: '8rem', height: '8rem', margin: '0 auto', objectFit: 'contain' }} />
        </div>`}
        <div class="flex gap-3" style=${{ justifyContent: 'flex-end' }}>
          <${Button} variant="secondary" onClick=${resetForm}>Cancel</${Button}>
          <${Button} onClick=${handleSave}>${editPayment ? 'Update' : 'Add'} Payment</${Button}>
        </div>
      </div>
    </${Modal}>
    <${ImageViewer} src=${viewImage} onClose=${() => setViewImage(null)} />
  </div>`;
};
