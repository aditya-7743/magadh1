// ==================== PAYMENTS.JS - Payment Management ====================
window.LMS = window.LMS || {};

// Standalone Payment Form for adding/editing payments from student cards
LMS.PaymentForm = ({ student, payment, onClose }) => {
  const { payments, setPayments, addLog, showToast, settings } = useContext(LMS.AppContext);
  const { Button, Input, Select } = LMS;

  const isEdit = !!payment;

  // Initialize form state
  const [form, setForm] = useState({
    studentId: student?.id || payment?.studentId || '',
    amount: payment ? Math.round((Number(payment.amount) + (Number(payment.discount) || 0)) / (Number(payment.months) || 1)) : (Number(student?.monthlyFee) || 500),
    months: payment?.months || 1,
    discount: payment?.discount || 0,
    method: payment?.method || 'cash',
    note: payment?.note || '',
    photo: payment?.photo || '',
    date: payment?.date || new Date().toISOString().split('T')[0],
  });

  // Sync form when payment prop changes
  useEffect(() => {
    if (payment) {
      setForm({
        studentId: payment.studentId,
        amount: Math.round((Number(payment.amount) + (Number(payment.discount) || 0)) / (Number(payment.months) || 1)),
        months: payment.months || 1,
        discount: payment.discount || 0,
        method: payment.method || 'cash',
        note: payment.note || '',
        photo: payment.photo || '',
        date: payment.date,
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
  const [customTotal, setCustomTotal] = useState(payment?.amount || (student?.monthlyFee || 500));

  // If not custom, auto-calculate. If custom, use custom value.
  const calculatedTotal = isCustomAmount ? customTotal : (form.amount * form.months) - form.discount;

  useEffect(() => {
    if (!isCustomAmount) {
      setCustomTotal((form.amount * form.months) - form.discount);
    }
  }, [form.amount, form.months, form.discount, isCustomAmount]);

  const handleSave = () => {
    if (!form.studentId || !form.amount) { showToast('Amount required!', 'error'); return; }

    if (isEdit) {
      // Update existing payment
      const updatedPayment = { ...payment, ...form, amount: Number(calculatedTotal) };
      setPayments(prev => prev.map(p => p.id === payment.id ? updatedPayment : p));

      // Cloud Sync
      if (LMS.DB.saveItem) LMS.DB.saveItem('payments', updatedPayment);

      addLog(`Updated payment ₹${form.amount} for ${student?.name}`);
      showToast('Payment updated successfully!', 'success');
    } else {
      // Add new payment
      // Adjust date to match input if needed, but ISO string is fine for ID usually
      const newPayment = { ...form, amount: Number(calculatedTotal), id: LMS.generateId() };
      setPayments(prev => [...prev, newPayment]);

      // Cloud Sync
      if (LMS.DB.saveItem) LMS.DB.saveItem('payments', newPayment);

      addLog(`Added payment ₹${calculatedTotal} for ${student?.name}`);
      showToast('Payment added successfully!', 'success');
    }
    onClose();
  };

  return html`<div class="space-y-4">
    <div class="flex items-center gap-3 mb-4">
      ${student?.photo
      ? html`<img src=${student.photo} class="w-12 h-12 rounded-full object-cover" />`
      : html`<div class="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center font-bold text-xl text-pink-700">${(student?.name || '?').charAt(0).toUpperCase()}</div>`
    }
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
    <${Input} label="Date" type="date" value=${form.date} onChange=${e => setForm(p => ({ ...p, date: e.target.value }))} />
    <${Input} label="Note" value=${form.note} onChange=${e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional note..." />
    
    <div>
      <label class="input-label">Receipt Photo (optional)</label>
      <label class="upload-area" style=${{ height: '5rem' }}>
        ${form.photo ? html`<img src=${form.photo} alt="Receipt" style=${{ height: '100%', objectFit: 'contain', borderRadius: '0.25rem' }} />` : html`<span class="text-gray-400">📷 Upload Receipt</span>`}
        <input type="file" accept="image/*" onChange=${handleImageUpload} />
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
  const { students, payments, setPayments, addLog, showToast, settings } = useContext(LMS.AppContext);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [viewImage, setViewImage] = useState(null);
  const { Button, Card, Modal, Input, Select, SearchBar, Icons, ImageViewer } = LMS;

  const [form, setForm] = useState({
    studentId: '', amount: 0, months: 1, discount: 0, method: 'cash', note: '', photo: '', date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (selectedStudent) {
      const s = students.find(x => x.id === selectedStudent);
      if (s) setForm(prev => ({ ...prev, studentId: selectedStudent, amount: s.monthlyFee }));
    }
  }, [selectedStudent, students]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) { const c = await LMS.compressImage(file); setForm(prev => ({ ...prev, photo: c })); }
  };

  const calculatedTotal = (form.amount * form.months) - form.discount;

  const handleSave = () => {
    if (!form.studentId || !form.amount) return;
    const payment = { ...form, amount: calculatedTotal, id: editPayment?.id || LMS.generateId() };
    if (editPayment) {
      setPayments(prev => prev.map(p => p.id === payment.id ? payment : p));

      // Cloud Sync
      if (LMS.DB.saveItem) LMS.DB.saveItem('payments', payment);

      addLog('Updated payment');
      showToast('Payment updated!', 'success');
    } else {
      setPayments(prev => [...prev, payment]);

      // Cloud Sync
      if (LMS.DB.saveItem) LMS.DB.saveItem('payments', payment);

      addLog('Added payment: ' + LMS.formatCurrency(calculatedTotal));
      showToast('Payment added!', 'success');
    }
    resetForm();
  };

  const handleDelete = (p) => {
    if (confirm('Delete this payment?')) {
      setPayments(prev => prev.filter(x => x.id !== p.id));

      // Cloud Sync
      if (LMS.DB.removeItem) LMS.DB.removeItem('payments', p.id);

      addLog('Deleted payment');
      showToast('Payment deleted!', 'success');
    }
  };

  const resetForm = () => {
    setForm({ studentId: '', amount: 0, months: 1, discount: 0, method: 'cash', note: '', photo: '', date: new Date().toISOString().split('T')[0] });
    setSelectedStudent('');
    setEditPayment(null);
    setShowForm(false);
  };

  const sendWhatsApp = (student, dueAmount) => {
    const msg = settings.whatsappTemplate
      .replace('{name}', student.name).replace('{roll}', student.rollNo)
      .replace('{due}', dueAmount).replace('{dueDate}', LMS.formatDate(LMS.getPaidUntilDate(student, payments)));
    window.open('https://wa.me/91' + student.mobile + '?text=' + encodeURIComponent(msg), '_blank');
  };

  const filtered = payments.filter(p => {
    const s = students.find(x => x.id === p.studentId);
    return s?.name?.toLowerCase().includes(search.toLowerCase()) || s?.rollNo?.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  return html`<div class="space-y-4">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold">Payments</h1>
      <${Button} onClick=${() => setShowForm(true)}><${Icons.Add} /> Add Payment</${Button}>
    </div>

    <${SearchBar} value=${search} onChange=${e => setSearch(e.target.value)} placeholder="Search payments..." />

    <div class="space-y-3">
      ${filtered.map(payment => {
    const student = students.find(s => s.id === payment.studentId);
    return html`<${Card} key=${payment.id}>
          <div class="flex gap-3" style=${{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div class="flex-1" style=${{ minWidth: '200px' }}>
              <div class="flex items-center gap-2 mb-1">
                <span class="font-semibold">${student?.name || 'Unknown'}</span>
                <span class="mono text-sm text-slate-400">${student?.rollNo}</span>
                <span class="badge ${payment.method === 'cash' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}">${payment.method}</span>
              </div>
              <div class="text-sm text-slate-400">
                ${LMS.formatDate(payment.date)} • ${payment.months} month(s) ${payment.discount > 0 ? '• Discount: ' + LMS.formatCurrency(payment.discount) : ''}
              </div>
              ${payment.note && html`<p class="text-sm text-slate-500 mt-1">${payment.note}</p>`}
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xl font-bold text-emerald-400">${LMS.formatCurrency(payment.amount)}</span>
              ${payment.photo && html`<button class="btn btn-ghost btn-sm" onClick=${() => setViewImage(payment.photo)}><${Icons.Eye} /></button>`}
              ${student?.mobile && html`<button class="btn btn-ghost btn-sm text-green-400" onClick=${() => sendWhatsApp(student, LMS.getDueAmount(student, payments))}><${Icons.WhatsApp} /></button>`}
              <${Button} size="sm" variant="ghost" onClick=${() => { setEditPayment(payment); setForm(payment); setSelectedStudent(payment.studentId); setShowForm(true); }}><${Icons.Edit} /></${Button}>
              <${Button} size="sm" variant="ghost" className="text-red-400" onClick=${() => handleDelete(payment)}><${Icons.Delete} /></${Button}>
            </div>
          </div>
        </${Card}>`;
  })}
      ${filtered.length === 0 && html`<${Card} className="text-center py-8 text-slate-400">No payments found</${Card}>`}
    </div>

    <${Modal} isOpen=${showForm} onClose=${resetForm} title=${editPayment ? 'Edit Payment' : 'Add Payment'}>
      <div class="space-y-4">
        <${Select} label="Student *" value=${selectedStudent} onChange=${e => setSelectedStudent(e.target.value)}
          options=${[{ value: '', label: 'Select Student' }, ...students.filter(s => s.isActive).map(s => ({ value: s.id, label: s.rollNo + ' - ' + s.name }))]} />
        <div class="grid grid-2 gap-4">
          <${Input} label="Amount per Month (₹)" type="number" value=${form.amount} onChange=${e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
          <${Input} label="Months" type="number" value=${form.months} onChange=${e => setForm(p => ({ ...p, months: Number(e.target.value) }))} min="1" />
        </div>
        <div class="grid grid-2 gap-4">
          <${Input} label="Discount (₹)" type="number" value=${form.discount} onChange=${e => setForm(p => ({ ...p, discount: Number(e.target.value) }))} />
          <${Select} label="Method" value=${form.method} onChange=${e => setForm(p => ({ ...p, method: e.target.value }))} options=${[{ value: 'cash', label: 'Cash' }, { value: 'online', label: 'Online' }]} />
        </div>
        <${Input} label="Date" type="date" value=${form.date} onChange=${e => setForm(p => ({ ...p, date: e.target.value }))} />
        <${Input} label="Note" value=${form.note} onChange=${e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional note..." />
        <div>
          <label class="input-label">Receipt Photo</label>
          <label class="upload-area" style=${{ height: '6rem' }}>
            ${form.photo ? html`<img src=${form.photo} alt="Receipt" style=${{ height: '100%', objectFit: 'contain', borderRadius: '0.25rem' }} />` : html`<span class="text-slate-400">Upload Receipt</span>`}
            <input type="file" accept="image/*" onChange=${handleImageUpload} />
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
