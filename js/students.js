// ==================== STUDENTS.JS - Student Management with Side-by-Side Layout ====================
window.LMS = window.LMS || {};

// Inline Student Form (matching reference design)
LMS.InlineStudentForm = ({ student, onSave, onClear, halls, shifts, students, payments, onOpenSeatSelector, className }) => {
  const [form, setForm] = useState(student || {
    rollNo: '', name: '', fatherName: '', mobile: '', parentMobile: '', aadhaar: '',
    photo: '', formPhoto: '', shift: shifts[0]?.id || '', monthlyFee: 600,
    admissionDate: LMS.today(), assignedSeat: '', isActive: true,
    feeChanges: [], pastHistory: [], deactivatedAt: null,
  });
  const [errors, setErrors] = useState({});
  const [viewPhoto, setViewPhoto] = useState(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [webcamField, setWebcamField] = useState(null); // 'photo' or 'formPhoto'
  const [facingMode, setFacingMode] = useState('user'); // 'user' (front) or 'environment' (back)
  const videoRef = useRef(null);

  const { Button, Input, Select, ImageViewer, Modal } = LMS;
  const { showToast } = useContext(LMS.AppContext);

  // WebCam Logic
  const startWebcam = async (field) => {
    setWebcamField(field);
    setShowWebcam(true);
    // Default to front camera initially, or we could remember preference
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const captureWebcam = async () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
      // Compress
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8); // initial high quality
      // Convert to blob/file to run through compressor
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      const compressed = await LMS.compressImage(file, 400); // 0.3 quality inside util

      handleChange(webcamField, compressed);
      stopWebcam();
    }
  };

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    }
    setShowWebcam(false);
  };

  useEffect(() => {
    if (!showWebcam) return;
    let cancelled = false, stream;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is unavailable. Use photo upload.');
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } }); }
        catch { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
        if (cancelled || !videoRef.current) stream.getTracks().forEach(track => track.stop());
        else videoRef.current.srcObject = stream;
      } catch (error) { if (!cancelled) { showToast(error.message, 'error'); setShowWebcam(false); } }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach(track => track.stop()); };
  }, [showWebcam, facingMode]);

  // Reset form when student prop changes
  useEffect(() => {
    if (student) {
      setForm(student);
    } else {
      setForm({
        rollNo: '', name: '', fatherName: '', mobile: '', parentMobile: '', aadhaar: '',
        photo: '', formPhoto: '', shift: shifts[0]?.id || '', monthlyFee: 600,
        admissionDate: LMS.today(), assignedSeat: '', isActive: true,
        feeChanges: [], pastHistory: [], deactivatedAt: null,
      });
    }
  }, [student]);

  const handleChange = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const handleImageUpload = async (e, field) => {
    const file = e.target.files[0];
    if (file) { const c = await LMS.compressImage(file); handleChange(field, c); }
  };

  const validate = () => {
    const e = {};
    if (!String(form.rollNo || '').trim()) e.rollNo = 'Required';

    // NEW: Check for duplicate Roll No across students collection
    // This prevents creating multiple students with the same ID
    if (form.rollNo && students.some(s => String(s.rollNo).trim().toUpperCase() === String(form.rollNo).trim().toUpperCase() && s.id !== form.id)) {
      e.rollNo = 'Roll No already exists!';
      showToast('Duplicate Roll No found!', 'error');
    }

    if (!String(form.name || '').trim()) e.name = 'Required';
    if (form.mobile && !LMS.validateMobile(form.mobile)) e.mobile = 'Invalid (10 digits)';
    if (form.parentMobile && !LMS.validateMobile(form.parentMobile)) e.parentMobile = 'Invalid (10 digits)';
    if (form.aadhaar && !LMS.validateAadhaar(form.aadhaar)) e.aadhaar = 'Invalid (12 digits)';
    if (!Number.isFinite(Number(form.monthlyFee)) || Number(form.monthlyFee) <= 0) e.monthlyFee = 'Fee must be greater than zero';
    if (!LMS.validDate(form.admissionDate)) e.admissionDate = 'Valid date required';
    if (form.inactiveStartDate && (!LMS.validDate(form.inactiveStartDate) || form.inactiveStartDate > LMS.today() || form.inactiveStartDate < form.admissionDate)) e.inactiveStartDate = 'Enter a valid inactive start date';
    if (form.shift && !shifts.some(s => s.id === form.shift)) e.shift = 'Select an existing shift';
    if (form.assignedSeat) {
      const error = LMS.seatAssignmentError(form.assignedSeat, form, students, halls, shifts);
      if (error) e.assignedSeat = error;
    }
    if (Object.keys(e).length) showToast(Object.values(e)[0], 'error');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const resetForm = () => {
    setForm({
      rollNo: '', name: '', fatherName: '', mobile: '', parentMobile: '', aadhaar: '',
      photo: '', formPhoto: '', shift: shifts[0]?.id || '', monthlyFee: 600,
      admissionDate: LMS.today(), assignedSeat: '', isActive: true,
      feeChanges: [], pastHistory: [], deactivatedAt: null,
    });
    setErrors({});
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    let feeChanges = [...(form.feeChanges || [])];
    // Legacy/imported students may have no fee history. Preserve the rate that
    // was already used for their past cycles before appending a new rate.
    if (feeChanges.length === 0) {
      feeChanges.push({
        date: student?.admissionDate || form.admissionDate || LMS.today(),
        fee: Number(student ? student.monthlyFee : form.monthlyFee)
      });
    }
    if (student && Number(form.monthlyFee) !== Number(student.monthlyFee)) {
      // A future admission starts at the new rate. For existing memberships,
      // only cycles starting on/after today pick up this change.
      const effectiveDate = form.admissionDate > LMS.today() ? form.admissionDate : LMS.today();
      feeChanges.push({ date: effectiveDate, fee: Number(form.monthlyFee) });
    }
    const nextStudent = { ...form, rollNo: String(form.rollNo).trim().toUpperCase(), name: form.name.trim(), monthlyFee: Number(form.monthlyFee), id: form.id || LMS.generateId(), feeChanges, pastHistory: form.pastHistory || [] };
    if (form.inactiveStartDate && !form.isActive) {
      nextStudent.deactivatedAt = LMS.parseDay(form.inactiveStartDate).toISOString();
      nextStudent.inactivePeriods = [...LMS.inactivity(form).filter(period => period.end), { start: form.inactiveStartDate, end: null }];
    }
    onSave(nextStudent);
    // Auto-clear form after adding new student (not on edit)
    if (!student) resetForm();
  };

  const handleSeatSelect = (seatId) => {
    const error = LMS.seatAssignmentError(seatId, form, students, halls, shifts);
    if (error) { showToast(error, 'error'); return; }
    handleChange('assignedSeat', seatId);
    // Modal will be closed by parent
  };

  const seatOptions = [{ value: '', label: 'Not Assigned' }];
  halls.forEach(h => { for (let i = 1; i <= h.seatCount; i++) seatOptions.push({ value: `${h.id}-${i}`, label: `${h.name} - Seat ${i}` }); });

  return html`
    <div class=${`card bg-card ${className || 'h-full overflow-y-auto'}`}>
      <div class="flex items-center justify-between mb-6 border-b pb-4">
        <h3 class="font-bold text-lg text-gray-800">${student ? 'Edit Student' : 'New Admission'}</h3>
        ${student && html`<span class="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-500">${student.id}</span>`}
      </div>
      
      <!-- Photo Upload Section -->
      <div class="flex gap-6 mb-6">
        <!-- Student Photo -->
        <div class="flex flex-col items-center gap-2">
          <div 
            class="w-20 h-20 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-200 overflow-hidden relative group"
            onDragOver=${(e) => e.preventDefault()}
            onDrop=${(e) => { e.preventDefault(); handleImageUpload({ target: { files: e.dataTransfer.files } }, 'photo'); }}
          >
            ${form.photo
      ? html`<${LMS.SqlImage} src=${form.photo} className="w-full h-full object-cover" onClick=${() => setViewPhoto(form.photo)} />`
      : html`<span class="text-gray-300 text-3xl">👤</span>`
    }
            <label class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <span class="text-white text-xs font-medium">Change</span>
              <input type="file" accept="image/*" class="hidden" onChange=${LMS.safeAction(e => handleImageUpload(e, 'photo'))} />
            </label>
            <button type="button" class="absolute bottom-1 right-1 bg-white rounded-full p-1 shadow hover:bg-gray-100 z-10" onClick=${() => startWebcam('photo')} title="Take Photo">📷</button>
          </div>
          <span class="text-xs text-gray-500 font-medium">Student Photo</span>
        </div>
        
        <!-- Form Photo -->
        <div class="flex flex-col items-center gap-2">
          <div 
            class="w-20 h-20 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-200 overflow-hidden relative group"
            onDragOver=${(e) => e.preventDefault()}
            onDrop=${(e) => { e.preventDefault(); handleImageUpload({ target: { files: e.dataTransfer.files } }, 'formPhoto'); }}
          >
            ${form.formPhoto
      ? html`<${LMS.SqlImage} src=${form.formPhoto} className="w-full h-full object-cover" onClick=${() => setViewPhoto(form.formPhoto)} />`
      : html`<span class="text-gray-300 text-3xl">📄</span>`
    }
            <label class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <span class="text-white text-xs font-medium">Change</span>
              <input type="file" accept="image/*" class="hidden" onChange=${LMS.safeAction(e => handleImageUpload(e, 'formPhoto'))} />
            </label>
            <button type="button" class="absolute bottom-1 right-1 bg-white rounded-full p-1 shadow hover:bg-gray-100 z-10" onClick=${() => startWebcam('formPhoto')} title="Take Photo">📷</button>
          </div>
          <span class="text-xs text-gray-500 font-medium">Admission Form</span>
        </div>
      </div>
  
      <form onSubmit=${LMS.safeAction(handleSubmit)} class="space-y-5">
        ${form.isActive === false && html`<div class="p-3 bg-amber-50 rounded"><${Input} label="Inactive since (correct missing history)" type="date" max=${LMS.today()} value=${form.inactiveStartDate || (form.deactivatedAt ? LMS.today(new Date(form.deactivatedAt)) : '')} onChange=${e => handleChange('inactiveStartDate', e.target.value)} /><p class="text-xs">Already charged monthly fees are retained. New cycles pause during inactivity.</p></div>`}
        <!-- Roll No & Name -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="input-label">Roll No <span class="text-red-500">*</span></label>
            <input 
              type="text" 
              class="input-field font-mono" 
              placeholder="01" 
              aria-label="Roll No" value=${form.rollNo} 
              onChange=${e => handleChange('rollNo', e.target.value)}
              style=${{ borderColor: errors.rollNo ? '#ef4444' : undefined }}
            />
          </div>
          <div>
            <label class="input-label">Student Name <span class="text-red-500">*</span></label>
            <input 
              type="text" 
              class="input-field" 
              placeholder="Full Name" 
              aria-label="Student Name" value=${form.name} 
              autoCapitalize=${true}
              onChange=${e => handleChange('name', e.target.value)}
              style=${{ borderColor: errors.name ? '#ef4444' : undefined }}
            />
          </div>
        </div>
        
        <!-- Father's Name -->
        <div>
          <label class="input-label">Father's Name</label>
          <input 
            type="text" 
            class="input-field" 
            placeholder="Father's Name" 
            aria-label="Father's Name" value=${form.fatherName || ''} 
            autoCapitalize=${true}
            onChange=${e => handleChange('fatherName', e.target.value)}
          />
        </div>
        
        <!-- Aadhaar -->
        <div>
           <label class="input-label">Aadhaar Number</label>
          <input 
            type="tel" 
            inputMode="numeric"
            class="input-field font-mono" 
            placeholder="12 digit number" 
            maxLength="12"
            aria-label="Aadhaar Number" value=${form.aadhaar || ''} 
            onInput=${e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 12); handleChange('aadhaar', v); }}
            style=${{ borderColor: errors.aadhaar ? '#ef4444' : undefined }}
          />
        </div>
        
        <!-- Mobile Numbers -->
        <div class="grid grid-2 gap-4">
          <div>
            <label class="input-label">Student Mobile</label>
            <input 
              type="tel" 
              inputMode="numeric"
              class="input-field font-mono" 
              placeholder="10 digits" 
              maxLength="10"
              aria-label="Student Mobile" value=${form.mobile || ''} 
              onInput=${e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 10); handleChange('mobile', v); }}
              style=${{ borderColor: errors.mobile ? '#ef4444' : undefined }}
            />
          </div>
          <div>
            <label class="input-label">Parent Mobile</label>
            <input 
              type="tel" 
              inputMode="numeric"
              class="input-field font-mono" 
              placeholder="10 digits" 
              maxLength="10"
              aria-label="Parent Mobile" value=${form.parentMobile || ''} 
              onInput=${e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 10); handleChange('parentMobile', v); }}
              style=${{ borderColor: errors.parentMobile ? '#ef4444' : undefined }}
            />
          </div>
        </div>
        
        <div class="grid grid-2 gap-4">
          <!-- Admission Date -->
          <div>
            <label class="input-label">Admission Date</label>
            <input 
              type="date" 
              class="input-field" 
              aria-label="Admission Date" value=${form.admissionDate}
              max="2099-12-31" 
              onChange=${e => handleChange('admissionDate', e.target.value)} 
            />
          </div>
          
          <!-- Shift -->
          <div>
            <label class="input-label">Shift</label>
            <select 
              class="input-field" 
              aria-label="Shift" value=${form.shift} 
              onChange=${e => handleChange('shift', e.target.value)}
            >
              ${shifts.map(s => html`<option key=${s.id} value=${s.id}>${s.name}</option>`)}
            </select>
          </div>
        </div>
        
        <!-- Admission Fees -->
        <div>
           <label class="input-label">Monthly Fees (₹) <span class="text-red-500">*</span></label>
           <input 
            type="number" 
            class="input-field font-mono" 
            aria-label="Monthly Fees" value=${form.monthlyFee} 
            onChange=${e => handleChange('monthlyFee', Number(e.target.value))} 
          />
          ${student && Number(form.monthlyFee) !== Number(student.monthlyFee) && html`
            <p class="fee-change-notice">Fee changes from ₹${student.monthlyFee} to ₹${form.monthlyFee}. Earlier billing cycles keep their old fee; the new rate applies to cycles starting on or after ${LMS.formatDate(form.admissionDate > LMS.today() ? form.admissionDate : LMS.today())}.</p>
          `}
        </div>
                <!-- Assign Seat Button -->
          <div>
            <label class="input-label">Seat Assignment</label>
            <div class="flex gap-2">
              <button 
                type="button" 
                class="btn btn-secondary flex-1 border-dashed justify-between group h-[42px]"
                onClick=${() => onOpenSeatSelector(handleSeatSelect, form)}
              >
                <span class="text-gray-600 group-hover:text-primary font-medium">
                  ${form.assignedSeat ? `Selected: ${LMS.formatSeatLabel(form.assignedSeat, halls)}` : 'Select a Seat'}
                </span>
                <span class="text-gray-400">▼</span>
              </button>
              ${form.assignedSeat && html`
                <button type="button" class="btn btn-ghost text-red-500 px-3 border border-red-100 bg-red-50 hover:bg-red-100" onClick=${() => handleChange('assignedSeat', '')}>✕</button>
              `}
            </div>
          </div>
        

        
        <!-- Submit Buttons -->
        <div class="flex gap-3 pt-4 border-t mt-6">
          <${Button} type="submit" className="flex-1 btn-primary justify-center">
            ${student ? 'Update Student' : 'Save Record'}
          </${Button}>
          <${Button} type="button" variant="secondary" onClick=${student ? onClear : resetForm}>${student ? 'Cancel' : 'Clear'}</${Button}>
        </div>
      </form>
    </div>
    
    <${Modal} isOpen=${showWebcam} onClose=${stopWebcam} title="Take Photo">
      <div class="flex flex-col items-center gap-4">
        <div class="relative w-full">
            <video ref=${videoRef} autoPlay playsInline class="w-full bg-black rounded-lg" style=${{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none', maxHeight: '60vh' }}></video>
            <button 
                type="button" 
                class="absolute bottom-4 right-4 bg-white/80 p-2 rounded-full shadow hover:bg-white" 
                onClick=${switchCamera}
                title="Switch Camera"
            >
                🔄
            </button>
        </div>
        <div class="flex gap-4 w-full justify-center">
            <${Button} variant="secondary" onClick=${stopWebcam}>Cancel</${Button}>
            <${Button} onClick=${captureWebcam} className="w-1/2 justify-center">Capture</${Button}>
        </div>
      </div>
    </${Modal}>
    <${ImageViewer} src=${viewPhoto} onClose=${() => setViewPhoto(null)} />
  `;
};

// Student Card Component
LMS.StudentCard = ({ student, payments, shifts, halls, settings, onView, onViewPhoto, onEdit, onEditPayment, onPay, onDelete, onActivate, onViewMap, onViewHistory }) => {
  const { setPayments, addLog, showToast } = useContext(LMS.AppContext);
  const fin = LMS.calculateStudentFinancials(student, payments);
  // Fix: Improved matching logic for shift names vs IDs
  let shift = shifts.find(s => String(s.id) === String(student.shift));
  if (!shift && student.shift) {
    const safeStudentShift = String(student.shift).trim().toLowerCase();
    // 1. Try exact name match (trimmed)
    shift = shifts.find(s => s.name.trim().toLowerCase() === safeStudentShift);

    // 2. Try partial match (if student has 'Morning Batch' and shift is 'Morning')
    if (!shift) {
      shift = shifts.find(s => s.name.trim().toLowerCase().includes(safeStudentShift) || safeStudentShift.includes(s.name.trim().toLowerCase()));
    }
  }
  const isDue = fin.totalDues > 0;
  const seatLabel = student.assignedSeat ? LMS.formatSeatLabel(student.assignedSeat, halls) : null;
  const history = LMS.studentPaymentHistory(student.id, payments);
  const studentPayments = history.slice(0, 2);

  // Helper for WhatsApp Link
  const getWhatsAppLink = (customMsg) => {
    const phone = (student.mobile || student.parentMobile || '').replace(/[^0-9]/g, '');
    if (!phone) return null;
    const template = settings.whatsappTemplate || 'Dear {name}, your library fee of ₹{due} is due since {dueDate}. Please pay at your earliest. - {library}';
    let msg = customMsg || LMS.formatMessage(template, student, settings, payments);
    return `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
  };

  const handleDeletePayment = async (e, payment) => {
    e.stopPropagation();
    if (!await LMS.Auth.confirmAction('Enter password to delete payment:')) {
      showToast('Incorrect password!', 'error');
      return;
    }
    if (confirm(`Delete payment of ₹${payment.amount}?`)) {
      setPayments(prev => prev.filter(p => p.id !== payment.id));


      addLog(`Deleted payment ₹${payment.amount} for ${student.name}`);
      showToast('Payment deleted!', 'success');
    }
  };

  const copyText = async (value, message) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(String(value)); showToast(message); }
    catch { showToast('Could not copy. Please select and copy the text.', 'error'); }
  };
  const avatarColours = ['#2563eb','#de8a08','#7c4bd4','#198568','#cf4975'];
  const avatarColour = avatarColours[Array.from(student.name || '').reduce((sum,c) => sum + c.charCodeAt(0),0) % avatarColours.length];
  const openCard = e => { if (!e.target.closest('button,a,input,select,textarea,summary')) onView(); };
  return html`
    <article class="card student-card directory-card ${isDue ? 'has-dues' : 'is-paid'} ${student.isActive === false ? 'student-card-inactive' : ''}" tabIndex="0" aria-label=${'Student details: ' + student.name} onClick=${openCard} onKeyDown=${e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onView(); } }}>
      <div class="directory-card-top">
        <${LMS.StudentPhoto} student=${student} size="lg" className="directory-avatar" style=${{background:avatarColour}} />
        <div class="directory-person">
          <div class="directory-eyebrow"><button class="directory-roll" title="Copy roll number" onClick=${() => copyText(student.rollNo, 'Roll No copied!')}>ROLL ${student.rollNo}</button><span>${student.isActive === false ? 'Inactive member' : 'Library member'}</span></div><div class="directory-title"><button class="directory-name" onClick=${onView}>${student.name}</button></div>
          <p class="directory-meta"><strong>${shift?.name || 'No shift'}</strong>${shift && html`<span>(${shift.startTime} – ${shift.endTime})</span>`}<span class="directory-joined">Joined ${LMS.formatDate(student.admissionDate)}</span></p>
          <div class="directory-validity"><span class="directory-validity-icon">${isDue ? html`<${LMS.Icons.Bell} />` : html`<${LMS.Icons.Check} />`}</span><span>${isDue ? 'Due since ' + LMS.formatDate(fin.dueSince) : 'Valid until ' + LMS.formatDate(fin.paidUntil)}</span>${student.isActive === false && html`<span class="status-pill inactive">Inactive</span>`}</div>
        </div>
        <span class="directory-balance status-pill ${isDue ? 'due' : 'paid'}">${isDue ? 'Due ₹' + fin.totalDues.toLocaleString('en-IN') : 'Paid'}</span>
      </div>
      <div class="directory-contact-actions">
        <div class="directory-phone"><${LMS.Icons.User} />${student.mobile || student.parentMobile ? html`<button title="Copy phone number" onClick=${() => copyText(student.mobile || student.parentMobile,'Number copied!')}>${student.mobile || student.parentMobile}</button>` : html`<span>No phone number</span>`}</div>
        <div class="directory-actions"><button class="directory-edit" onClick=${onEdit}><${LMS.Icons.Edit} />Edit</button><button class="directory-pay" onClick=${onPay}><${LMS.Icons.Add} />Pay</button><button class="directory-delete" title="Delete student" aria-label=${'Delete ' + student.name} onClick=${LMS.safeAction(onDelete)}><${LMS.Icons.Delete} /></button>${student.isActive === false && html`<button onClick=${() => onActivate?.(student)}>Activate</button>`}${isDue && getWhatsAppLink() && html`<a class="directory-whatsapp" href=${getWhatsAppLink()} target="_blank" rel="noopener noreferrer" title="WhatsApp reminder" aria-label=${'Remind ' + student.name + ' on WhatsApp'}><${LMS.Icons.WhatsApp} /></a>`}</div>
      </div>
      <div class="directory-seat-band"><div class="directory-seat-info"><span class="directory-seat-icon"><${LMS.Icons.Seats} /></span><div><span>Assigned seat</span><strong class=${seatLabel ? 'directory-seat-label' : ''}>${seatLabel || 'Unassigned'}</strong></div>${seatLabel ? html`<button class="directory-map-link" onClick=${() => onViewMap(student.assignedSeat)} title="View seat on map" aria-label=${'View seat ' + seatLabel + ' on map'}>View map ↗</button>` : html`<button class="directory-map-link" onClick=${onEdit}>Assign →</button>`}</div><div class="directory-fee"><span>Monthly fee</span><strong>${LMS.formatCurrency(student.monthlyFee)}</strong></div></div>
      <section class="student-receipts" aria-label=${'Recent payments for ' + student.name}>
        <div class="student-receipts-heading"><h4>Recent payments <span class="recent-count">2 latest</span></h4><button type="button" class="payment-history-link" onClick=${onViewHistory || onView}>View history <span>(${history.length}) ↗</span></button></div>
        ${studentPayments.length ? studentPayments.map(p => html`
          <div class="payment-preview-row" key=${p.id}>
            <span class="receipt-symbol" aria-hidden="true"><${LMS.Icons.Payments} /></span>
            <div class="payment-preview-info"><strong>${LMS.formatCurrency(p.amount)}</strong><small>${LMS.formatPaymentDate(p)}${p.archived ? ' · Archived' : ''}</small></div>
            <span class="payment-method">${p.method || 'Payment'}</span>
            <div class="payment-preview-actions"><button type="button" class="icon-button" onClick=${() => onEditPayment?.(p)} aria-label=${'Edit payment of ' + LMS.formatCurrency(p.amount) + ' on ' + LMS.formatDate(p.date)} title="Edit payment"><${LMS.Icons.Edit} /></button><button type="button" class="icon-button payment-delete" onClick=${LMS.safeAction(e => handleDeletePayment(e, p))} aria-label=${'Delete payment of ' + LMS.formatCurrency(p.amount) + ' on ' + LMS.formatDate(p.date)} title="Delete payment"><${LMS.Icons.Delete} /></button></div>
          </div>`)
          : html`<p class="payment-preview-empty">No payments recorded yet.</p>`}
      </section>
    </article>
  `;
};


// Amount visibility is local to the open student view and resets for every student.
LMS.ReceivedTotal = ({ amount, studentId, className = '' }) => {
  const [revealedFor, setRevealedFor] = useState(null);
  const revealed = revealedFor === studentId;
  return html`<div class=${'received-total ' + className}>
    <div class="received-total-heading"><span>Total received</span><button type="button" class="icon-button received-total-toggle" aria-label=${revealed ? 'Hide total received' : 'Show total received'} aria-pressed=${revealed} onClick=${() => setRevealedFor(revealed ? null : studentId)}>${revealed ? html`<${LMS.Icons.Eye} />` : html`<${LMS.Icons.EyeOff} />`}</button></div>
    <strong class=${'received-total-value ' + (revealed ? '' : 'is-hidden')} aria-label=${revealed ? undefined : 'Total received is hidden'}>${revealed ? LMS.formatCurrency(amount) : '••••'}</strong>
  </div>`;
};

// Full ledger, including archived receipts already recovered by the shared store.
LMS.StudentPaymentHistory = ({ student, onEditPayment, onViewReceipt, compact = false }) => {
  const { payments, setPayments, addLog, showToast } = useContext(LMS.AppContext);
  const history = useMemo(() => LMS.studentPaymentHistory(student.id, payments), [student.id, payments]);
  const totalPaid = history.filter(p => !p.voided).reduce((total, p) => total + (Number(p.amount) || 0), 0);
  const deletePayment = async payment => {
    if (!await LMS.Auth.confirmAction('Enter password to delete payment:')) { showToast('Incorrect password!', 'error'); return; }
    if (!confirm('Delete payment of ' + LMS.formatCurrency(payment.amount) + '?')) return;
    setPayments(prev => prev.filter(p => p.id !== payment.id));
    addLog('Deleted payment ' + LMS.formatCurrency(payment.amount) + ' for ' + student.name);
    showToast('Payment deleted!', 'success');
  };
  return html`<div class="student-payment-ledger">
    ${!compact && html`<div class="payment-history-student"><${LMS.StudentPhoto} student=${student} /><div class="payment-history-person"><strong>${student.name}</strong><small>Roll #${student.rollNo} · ${history.length} payments · newest first</small></div><${LMS.ReceivedTotal} key=${student.id} amount=${totalPaid} studentId=${student.id} className="payment-history-total" /></div>`}
    <div class="payment-history-list">
      ${history.length ? history.map(p => html`<div class="payment-history-entry" key=${p.id}>
        <div class="payment-history-info"><strong>${LMS.formatCurrency(p.amount)}</strong><span class="payment-method">${p.method || 'Payment'}</span>${(p.archived || p.voided) && html`<span class="status-pill inactive">${p.voided ? 'Voided' : 'Archived'}</span>`}</div>
        <div class="payment-history-date"><time>${LMS.formatPaymentDate(p)}</time><small>${[p.months ? p.months + ' month(s)' : '', Number(p.discount) > 0 ? 'Discount ' + LMS.formatCurrency(p.discount) : '', p.note || p.remarks || ''].filter(Boolean).join(' · ')}</small></div>
        <div class="payment-history-actions">${p.photo && html`<${LMS.Button} variant="secondary" size="sm" onClick=${() => onViewReceipt?.(p.photo)} title="View receipt" aria-label=${'View receipt on ' + LMS.formatDate(p.date)}><${LMS.Icons.Log} /></${LMS.Button}>`}<${LMS.Button} variant="secondary" size="sm" onClick=${() => onEditPayment?.(p)} title="Edit payment" aria-label=${'Edit payment on ' + LMS.formatDate(p.date)}><${LMS.Icons.Edit} /></${LMS.Button}><${LMS.Button} variant="ghost" size="sm" className="payment-delete" onClick=${() => deletePayment(p)} title="Delete payment" aria-label=${'Delete payment on ' + LMS.formatDate(p.date)}><${LMS.Icons.Delete} /></${LMS.Button}></div>
      </div>`) : html`<p class="payment-preview-empty">No payment history found.</p>`}
    </div>
  </div>`;
};


// Enhanced Student Detail View with Payment Edit/Delete
LMS.StudentDetailView = ({ student, onReleaseSeat, onClose, onEdit, onUpdate, closeOnEdit = true }) => {
  student = useContext(LMS.AppContext).students.find(s => s.id === student.id) || student;
  const { students, payments, setPayments, shifts, halls, setStudents, showToast, addLog, settings } = useContext(LMS.AppContext);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const [viewPhoto, setViewPhoto] = useState(null);
  const [showSeatMap, setShowSeatMap] = useState(false);
  const { Button, Modal, ImageViewer } = LMS;

  const fin = LMS.calculateStudentFinancials(student, payments);
  const shift = shifts.find(s => s.id === student.shift);
  const studentPayments = LMS.studentPaymentHistory(student.id, payments);
  const seatLabel = student.assignedSeat ? LMS.formatSeatLabel(student.assignedSeat, halls) : 'N/A';
  const totalPaid = studentPayments.filter(p => !p.voided).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const handleWhatsApp = (type) => {
    const phone = (student.mobile || student.parentMobile || '').replace(/[^0-9]/g, '');
    if (!phone) { showToast('No mobile number found!', 'error'); return; }
    let msg = '';
    if (type === 'welcome') {
      const template = settings.welcomeTemplate || 'Welcome to {library}, {name}! Your Roll No is {roll}.';
      msg = LMS.formatMessage(template, student, settings, payments);
    } else if (type === 'due') {
      const template = settings.whatsappTemplate || 'Dear {name}, your library fee of ₹{due} is due since {dueDate}. Please pay at your earliest. - {library}';
      msg = LMS.formatMessage(template, student, settings, payments);
    } else if (type === 'absent') {
      const template = settings.absentTemplate || 'Dear {name}, you were absent today at {library}. Roll: {roll}. Please maintain regularity.';
      msg = LMS.formatMessage(template, student, settings, payments);
    }
    window.open('https://wa.me/91' + phone + '?text=' + encodeURIComponent(msg), '_blank');
  };

  const handleDeactivate = () => {
    if (confirm('Deactivate ' + student.name + '?')) {
      const updated = LMS.setStudentActive(student, false);
      setStudents(prev => prev.map(s => s.id === student.id ? updated : s)); // Also release seat


      addLog('Deactivated student: ' + student.name);
      showToast('Student deactivated & seat released!', 'success');
    }
  };

  const handleActivate = () => {
    const updated = LMS.setStudentActive(student, true);
    const error = LMS.seatAssignmentError(updated.assignedSeat, updated, students, halls, shifts);
    if (error) { showToast(error, 'error'); return; }
    setStudents(prev => prev.map(s => s.id === student.id ? updated : s));


    addLog('Re-activated student: ' + student.name);
    showToast('Student reactivated!', 'success');
  };

  const handleReset = () => {
    if (confirm('Reset ' + student.name + '? This will release their seat, archive payments, and open the edit form for re-admission.')) {
      const studentPayments = payments.filter(p => p.studentId === student.id && !p.archived);
      const updatedHistory = [...(student.pastHistory || []), { date: new Date().toISOString(), type: 'Reset', archivedPayments: studentPayments }];
      
      const updated = { 
        ...student, 
        admissionDate: LMS.today(), 
        assignedSeat: '', // Clear seat
        shift: shifts && shifts.length > 0 ? shifts[0].id : '', // Reset shift
        monthlyFee: student.monthlyFee,
        feeChanges: [], // Clear fee history
        pastHistory: updatedHistory,
        isActive: true,
        deactivatedAt: null, inactivePeriods: [], billingEpoch: LMS.generateId()
      };
      setStudents(prev => prev.map(s => s.id === student.id ? updated : s));

      
      // Preserve cash history, excluding archived receipts from the new billing epoch.
      setPayments(prev => prev.map(p => p.studentId === student.id ? { ...p, archived: true, studentName: student.name, rollNo: student.rollNo } : p));

      addLog('Reset student & archived payments: ' + student.name);
      showToast('Student reset and seat released!', 'success');
      
      // Auto-open edit modal for "re-admission"
      onClose();
      if (onEdit) onEdit(updated);
    }
  };

  const handleWaiveFee = () => {
    if (confirm(`Waive 1 month fee (₹${student.monthlyFee}) for ${student.name}? This will mark it as paid via waiver.`)) {
      const waiver = {
        id: LMS.generateId(),
        studentId: student.id,
        ...(student.billingEpoch ? { billingEpoch: student.billingEpoch } : {}),
        amount: 0,
        discount: Number(student.monthlyFee),
        date: LMS.today(),
        time: LMS.currentTimeIST(),
        method: 'waiver',
        remarks: 'Fee Waived (Skip Month)'
      };
      setPayments(prev => [...prev, waiver]);


      addLog(`Waived fee for ${student.name}`);
      showToast('Fee waived for 1 month!', 'success');
    }
  };

  const handleDeletePayment = async (payment) => {
    if (!await LMS.Auth.confirmAction('Enter password to delete payment:')) {
      showToast('Incorrect password!', 'error');
      return;
    }
    if (confirm(`Delete payment of ₹${payment.amount}?`)) {
      setPayments(prev => prev.filter(p => p.id !== payment.id));


      addLog(`Deleted payment ₹${payment.amount} for ${student.name}`);
      showToast('Payment deleted!', 'success');
    }
  };

  const handleEditPayment = (payment) => {
    setEditPayment(payment);
    setShowPaymentForm(true);
  };

  const copyDetail = async value => {
    if (!value) return;
    try { await navigator.clipboard.writeText(String(value)); showToast('Copied!', 'success'); }
    catch { showToast('Could not copy. Please select and copy the text.', 'error'); }
  };
  const hasPhone = !!(student.mobile || student.parentMobile);
  return html`<div class="student-profile">
    <div class="profile-identity">
      <${LMS.StudentPhoto} student=${student} size="lg" className="profile-photo" />
      <div class="profile-person"><h3>${student.name}</h3><div><button class="directory-roll" title="Copy roll number" onClick=${() => copyDetail(student.rollNo)}># ${student.rollNo}</button><span class="status-pill ${student.isActive === false ? 'inactive' : 'paid'}">${student.isActive === false ? 'Inactive member' : 'Active member'}</span></div><p>Joined ${LMS.formatDate(student.admissionDate)} · ${shift?.name || 'No shift assigned'}</p></div>
      <div class="profile-main-actions"><${Button} variant="secondary" onClick=${() => { if (closeOnEdit) onClose(); onEdit?.(student); }}><${LMS.Icons.Edit} />Edit details</${Button}><${Button} onClick=${() => { setEditPayment(null); setShowPaymentForm(true); }}><${LMS.Icons.Add} />Add payment</${Button}></div>
    </div>
    <div class="profile-financials">
      <div><span>Monthly fee</span><strong>${LMS.formatCurrency(student.monthlyFee)}</strong></div>
      <${LMS.ReceivedTotal} key=${student.id} amount=${totalPaid} studentId=${student.id} />
      <div class=${fin.totalDues > 0 ? 'profile-due' : ''}><span>Outstanding due</span><strong>${LMS.formatCurrency(fin.totalDues)}</strong><small>${fin.totalDues > 0 ? 'Since ' + LMS.formatDate(fin.dueSince) + ' · ' + fin.daysDue + ' days' : 'No pending dues'}</small></div>
      <div><span>Valid until</span><strong class="profile-date">${LMS.formatDate(fin.paidUntil)}</strong><small>${fin.paidMonths || 0} paid months</small></div>
    </div>
    ${student.isActive === false && !student.deactivatedAt && html`<p class="fee-change-notice">Inactive start date is missing. Billing pauses from ${LMS.formatDate(LMS.DB.localLoad('_inactiveFirstSeen', {})[student.id] || LMS.today())}. Edit the date to correct older inactive periods.</p>`}
    <div class="profile-columns">
      <div class="profile-side">
        <section class="profile-panel"><h4>Student information</h4><dl class="profile-information">
          <div><dt>Assigned seat</dt><dd>${student.assignedSeat ? html`<button class="text-link" onClick=${() => setShowSeatMap(true)}>${seatLabel} · View on map ↗</button>` : 'Unassigned'}</dd></div>
          <div><dt>Shift</dt><dd>${shift?.name || 'Not assigned'}${shift && html`<small>${shift.startTime} – ${shift.endTime}</small>`}</dd></div>
          <div><dt>Father's name</dt><dd>${student.fatherName || 'Not provided'}</dd></div>
          <div><dt>Student mobile</dt><dd>${student.mobile ? html`<button title="Copy mobile number" onClick=${() => copyDetail(student.mobile)}>${student.mobile}</button>` : 'Not provided'}</dd></div>
          <div><dt>Parent mobile</dt><dd>${student.parentMobile ? html`<button title="Copy parent mobile" onClick=${() => copyDetail(student.parentMobile)}>${student.parentMobile}</button>` : 'Not provided'}</dd></div>
          <div><dt>Aadhaar</dt><dd>${student.aadhaar || 'Not provided'}</dd></div>
        </dl>${student.formPhoto && html`<${Button} variant="secondary" size="sm" onClick=${() => setViewPhoto(student.formPhoto)}>View admission form</${Button}>`}</section>
        <section class="profile-panel profile-message-panel"><div class="profile-action-heading"><span class="profile-heading-icon"><${LMS.Icons.WhatsApp} /></span><div><h4>WhatsApp messages</h4><p>Choose a message to open in WhatsApp</p></div></div><div class="profile-message-actions">
          <${Button} variant="secondary" className="profile-action-tile message-welcome" disabled=${!hasPhone} onClick=${() => handleWhatsApp('welcome')}><span class="profile-action-icon"><${LMS.Icons.User} /></span><span><strong>Welcome</strong><small>Say hello</small></span></${Button}>
          <${Button} variant="secondary" className="profile-action-tile message-due" disabled=${!hasPhone} onClick=${() => handleWhatsApp('due')}><span class="profile-action-icon"><${LMS.Icons.Payments} /></span><span><strong>Due reminder</strong><small>Payment follow-up</small></span></${Button}>
          <${Button} variant="secondary" className="profile-action-tile message-absent" disabled=${!hasPhone} onClick=${() => handleWhatsApp('absent')}><span class="profile-action-icon"><${LMS.Icons.Bell} /></span><span><strong>Absent</strong><small>Attendance check</small></span></${Button}>
        </div>${!hasPhone && html`<p class="profile-help">Add a mobile number in Edit details to send a message.</p>`}</section>
        <section class="profile-panel profile-membership-panel"><div class="profile-action-heading"><span class="profile-heading-icon"><${LMS.Icons.Students} /></span><div><h4>Manage membership</h4><p>Fees, seat and membership status</p></div></div><div class="profile-manage-actions">
          <${Button} variant="secondary" className="profile-action-tile membership-waive" onClick=${handleWaiveFee}><span class="profile-action-icon"><${LMS.Icons.Payments} /></span><span><strong>Waive a month</strong><small>Apply fee waiver</small></span></${Button}>
          ${student.assignedSeat && html`<${Button} variant="secondary" className="profile-action-tile membership-seat" onClick=${onReleaseSeat}><span class="profile-action-icon"><${LMS.Icons.Seats} /></span><span><strong>Release seat</strong><small>${seatLabel} · Free this seat</small></span></${Button}>`}
          ${student.isActive !== false ? html`<${Button} variant="secondary" className="profile-action-tile membership-deactivate" onClick=${handleDeactivate}><span class="profile-action-icon"><${LMS.Icons.Lock} /></span><span><strong>Deactivate</strong><small>Pause fees & release seat</small></span></${Button}>` : html`<${Button} variant="secondary" className="profile-action-tile message-welcome" onClick=${handleActivate}><span class="profile-action-icon"><${LMS.Icons.Check} /></span><span><strong>Activate</strong><small>Resume membership</small></span></${Button}>`}
          <${Button} variant="secondary" className="profile-action-tile membership-reset" onClick=${handleReset}><span class="profile-action-icon"><${LMS.Icons.Sync} /></span><span><strong>Re-admission</strong><small>Reset admission cycle</small></span></${Button}>
        </div></section>
      </div>
      <div class="profile-ledger"><section class="profile-panel"><div class="profile-section-title"><h4>Payment history</h4><span>${studentPayments.length} payments · newest first</span></div><${LMS.StudentPaymentHistory} student=${student} compact=${true} onEditPayment=${handleEditPayment} onViewReceipt=${setViewPhoto} /></section>
        ${student.pastHistory?.length > 0 && html`<details class="profile-panel profile-archive"><summary>Archived admission history (${student.pastHistory.length})</summary>${[...student.pastHistory].reverse().map((history,index) => html`<div class="profile-archive-entry" key=${index}><strong>${history.type || 'Previous admission'} · ${LMS.formatDate(history.date)}</strong><small>${history.archivedPayments?.length || 0} archived payments · Receipts appear in the payment history above.</small></div>`)}</details>`}
      </div>
    </div>
  </div>
  <${Modal} isOpen=${showPaymentForm} onClose=${() => { setShowPaymentForm(false); setEditPayment(null); }} title=${editPayment ? 'Edit payment' : 'Add payment'} size="md">
    ${showPaymentForm && html`<${LMS.PaymentForm} student=${student} payment=${editPayment} onClose=${() => { setShowPaymentForm(false); setEditPayment(null); }} />`}
  </${Modal}>
  <${Modal} isOpen=${showSeatMap} onClose=${() => setShowSeatMap(false)} title="Seat location" size="lg">${showSeatMap && html`<${LMS.SeatSelector} initialSeat=${student.assignedSeat} readOnly=${true} />`}</${Modal}>
  <${ImageViewer} src=${viewPhoto} onClose=${() => setViewPhoto(null)} />`;
};

// Shared detail popup for student rows on dashboard, payments and attendance.
LMS.StudentInspector = ({ studentId, onClose }) => {
  const { students, setStudents, payments, halls, shifts, addLog, showToast } = useContext(LMS.AppContext);
  const [editing, setEditing] = useState(false);
  const [seatSelector, setSeatSelector] = useState(null);
  const student = students.find(s => s.id === studentId);
  if (!student) return null;
  const saveStudent = updated => {
    setStudents(prev => prev.map(s => s.id === updated.id ? updated : s));
    addLog('Updated student: ' + updated.name);
    showToast('Student updated!', 'success');
    setEditing(false);
  };
  const releaseSeat = () => {
    setStudents(prev => prev.map(s => s.id === student.id ? { ...s, assignedSeat: null } : s));
    addLog('Released seat for: ' + student.name);
    showToast('Seat released!', 'success');
  };
  return html`<${LMS.Modal} isOpen=${true} onClose=${onClose} title="Student details" size="lg" className="student-detail-modal">
    <${LMS.StudentDetailView} student=${student} onClose=${onClose} onEdit=${() => setEditing(true)} closeOnEdit=${false} onReleaseSeat=${releaseSeat} />
    <${LMS.Modal} isOpen=${editing} onClose=${() => setEditing(false)} title="Edit Student" size="lg">
      ${editing && html`<${LMS.InlineStudentForm} student=${student} onSave=${saveStudent} onClear=${() => setEditing(false)} halls=${halls} shifts=${shifts} students=${students} payments=${payments} onOpenSeatSelector=${(select, draft) => setSeatSelector({ select, student: draft })} />`}
    </${LMS.Modal}>
    <${LMS.Modal} isOpen=${!!seatSelector} onClose=${() => setSeatSelector(null)} title="Select Seat" size="lg">
      ${seatSelector && html`<${LMS.SeatSelector} initialSeat=${seatSelector.student?.assignedSeat} selectionStudent=${seatSelector.student} onSelect=${seat => { seatSelector.select(seat); setSeatSelector(null); }} />`}
    </${LMS.Modal}>
  </${LMS.Modal}>`;
};

// Main Student Management Component
LMS.StudentManagement = () => {
  const { students, setStudents, payments, setPayments, halls, shifts, settings, addLog, showToast } = useContext(LMS.AppContext);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('activity');
  const [editStudent, setEditStudent] = useState(null);
  const [viewStudent, setViewStudent] = useState(null);
  const [viewSeatMap, setViewSeatMap] = useState(null);
  const [viewImage, setViewImage] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  // Removed duplicate state declarations
  const [paymentModal, setPaymentModal] = useState({ open: false, student: null });
  const [seatSelectorCb, setSeatSelectorCb] = useState(null); // Callback for seat selection
  const { Button, Card, Modal, SearchBar, Icons, ImageViewer } = LMS;

  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, sortBy, showInactive]);
  const deletedPayments = LMS.DB.localLoad('_paymentDeletions', {});
  const activityIndex = useMemo(() => LMS.studentActivityIndex(students, payments, deletedPayments), [students, payments, deletedPayments]);
  const searchRanks = useMemo(() => new Map(students.map(student => [student.id, LMS.studentSearchRank(student, search)])), [students, search]);
  // Search relevance comes first; the selected sort orders equally relevant matches.
  const filtered = students.filter(s => {
    if (!showInactive && !s.isActive) return false;
    return Number.isFinite(searchRanks.get(s.id));
  }).sort((a, b) => {
    const relevance = searchRanks.get(a.id) - searchRanks.get(b.id);
    if (relevance) return relevance;
    switch (sortBy) {
      case 'activity': {
        const first = activityIndex.get(a.id), second = activityIndex.get(b.id);
        // Actual edits take precedence; older backups only have dated records.
        return second.changedAt - first.changedAt || second.historicalAt - first.historicalAt || String(b.rollNo).localeCompare(String(a.rollNo));
      }
      case 'newest':
        // Sort by Admission Date Descending (Newest first)
        // If dates are equal, sort by ID/Roll descending
        return new Date(b.admissionDate || 0) - new Date(a.admissionDate || 0) || String(b.rollNo).localeCompare(String(a.rollNo));
      case 'oldest':
        return new Date(a.admissionDate || 0) - new Date(b.admissionDate || 0) || String(a.rollNo).localeCompare(String(b.rollNo));
      case 'name_asc':
        return a.name.localeCompare(b.name);
      case 'name_desc':
        return b.name.localeCompare(a.name);
      default:
        return 0;
    }
  });

  const visiblePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 40)));
  const latestActivity = filtered[0] && activityIndex.get(filtered[0].id);
  const latestActivityKey = sortBy === 'activity' && filtered[0]
    ? filtered[0].id + ':' + latestActivity.changedAt + ':' + latestActivity.historicalAt : '';
  useEffect(() => { if (sortBy === 'activity') setPage(1); }, [sortBy, latestActivityKey]);

  const { admissionRequest = 0, dismissAdmissionRequest } = useContext(LMS.AppContext);
  const [showAdmission, setShowAdmission] = useState(false);
  useEffect(() => { if (admissionRequest) { setShowAdmission(true); dismissAdmissionRequest?.(); } }, [admissionRequest]);
  const [historyStudentId, setHistoryStudentId] = useState(null);
  const historyStudent = students.find(student => student.id === historyStudentId);

  // Refactored handleSave to work for both Add (Sidebar) and Edit (Modal)
  const handleSave = (student) => {
    const existingIndex = students.findIndex(s => s.id === student.id);

    if (existingIndex >= 0) {
      // Update existing
      setStudents(prev => prev.map(s => s.id === student.id ? student : s));

      addLog('Updated student: ' + student.name);
      showToast('Student updated!', 'success');
      // Refresh viewStudent if it was the same student being viewed
      if (viewStudent && viewStudent.id === student.id) {
        setViewStudent(student);
      }
      // If it was the edit modal, close it
      setEditStudent(null);
    } else {
      // Add new
      setStudents(prev => [...prev, student]);

      addLog('Added student: ' + student.name);
      showToast('Student added!', 'success');
      setShowAdmission(false);
      // Open payment modal for new student
      setPaymentModal({ open: true, student: student });
    }
  };

  const handleDelete = async (s) => {
    if (!await LMS.Auth.confirmAction('Enter password to delete student:')) {
      showToast('Incorrect password!', 'error');
      return;
    }
    if (confirm('Delete ' + s.name + '?')) {
      // Close any open modals/views for this student first
      if (viewStudent && viewStudent.id === s.id) setViewStudent(null);
      if (editStudent && editStudent.id === s.id) setEditStudent(null);

      // Keep the immutable collection history after a student is removed.
      setPayments(prev => prev.map(p => p.studentId === s.id ? { ...p, archived: true, studentName: s.name, rollNo: s.rollNo } : p));
      setStudents(prev => prev.filter(x => x.id !== s.id));

      addLog('Deleted student: ' + s.name);
      showToast('Student deleted!', 'success');
    }
  };

  const handleActivate = (s) => {
    if (confirm('Activate ' + s.name + '?')) {
      const updated = LMS.setStudentActive(s, true);
      const error = LMS.seatAssignmentError(updated.assignedSeat, updated, students, halls, shifts);
      if (error) { showToast(error, 'error'); return; }
      setStudents(prev => prev.map(x => x.id === s.id ? updated : x));


      addLog('Re-activated: ' + s.name);
      showToast('Student activated!', 'success');
    }
  };

  const handleReleaseSeat = (student) => {
    if (confirm(`Release seat for ${student.name}?`)) {
      const updated = { ...student, assignedSeat: null };
      setStudents(prev => prev.map(s => s.id === student.id ? updated : s));


      addLog(`Released seat for: ${student.name}`);
      showToast('Seat released!', 'success');
      setViewStudent(null);
    }
  };

  return html`
    <div class="student-records">
      <div class="students-toolbar">
        <div><h2>Student directory <span class="count-badge">${students.length}</span></h2><p>${students.filter(s => s.isActive).length} active members · your latest updates first</p></div>
        <button class="btn btn-primary" onClick=${() => setShowAdmission(true)}><${Icons.Add} />Add student</button>
      </div>
      <div class="student-filters">
        <div class="student-search"><${Icons.Search} /><input aria-label="Search students" placeholder="Search roll number, mobile or name…" value=${search} onChange=${e => setSearch(e.target.value)} /></div>
        <label class="inactive-filter"><input type="checkbox" checked=${showInactive} onChange=${e => setShowInactive(e.target.checked)} />Show inactive</label>
        <select class="input-field student-sort" aria-label="Sort students" value=${sortBy} onChange=${e => setSortBy(e.target.value)}>
          <option value="activity">Latest Changes First</option><option value="newest">Newest Admission</option><option value="oldest">Oldest Admission</option><option value="name_asc">Name (A-Z)</option><option value="name_desc">Name (Z-A)</option>
        </select>
      </div>
      <div class="student-pagination"><span>Showing ${filtered.length ? (visiblePage - 1) * 40 + 1 : 0}–${Math.min(visiblePage * 40, filtered.length)} of ${filtered.length} students</span><button class="btn btn-secondary btn-sm" disabled=${visiblePage <= 1} onClick=${() => setPage(visiblePage - 1)}>Previous</button><button class="btn btn-secondary btn-sm" disabled=${visiblePage * 40 >= filtered.length} onClick=${() => setPage(visiblePage + 1)}>Next</button></div>
      <div class="student-card-grid">
          ${filtered.slice((visiblePage - 1) * 40, visiblePage * 40).map(student => html`
            <${LMS.StudentCard}
              key=${student.id}
              student=${student}
              payments=${payments}
              shifts=${shifts}
              halls=${halls}
              settings=${settings}
              onView=${() => setViewStudent(student)}
              onViewPhoto=${(photo) => setViewImage(photo)}
              onEdit=${() => { setEditStudent(student); }}
              onEditPayment=${(p) => { setPaymentModal({ open: true, student: student, payment: p }); }} 
              onPay=${() => setPaymentModal({ open: true, student })}
              onDelete=${() => handleDelete(student)}
              onActivate=${() => handleActivate(student)}
              onViewMap=${(seatId) => setViewSeatMap(seatId)}
              onViewHistory=${() => setHistoryStudentId(student.id)}
            />
          `)}
          ${filtered.length === 0 && html`
            <div class="card student-empty"><${Icons.Students} /><h3>${search ? 'No matching students' : 'Your student directory starts here'}</h3><p>${search ? 'Try a different name, roll number or phone number.' : 'Add a student or include inactive members to see more records.'}</p></div>
          `}
      </div>
    </div>

    <${Modal} isOpen=${showAdmission} onClose=${() => setShowAdmission(false)} title="New admission" size="lg">
      <${LMS.InlineStudentForm} student=${null} onSave=${handleSave} onClear=${() => {}} halls=${halls} shifts=${shifts} students=${students} payments=${payments} onOpenSeatSelector=${(cb, student) => setSeatSelectorCb({ select: cb, student })} className="inline-admission" />
    </${Modal}>

    <${Modal} isOpen=${!!viewStudent} onClose=${() => setViewStudent(null)} title="Student details" size="lg" className="student-detail-modal">
      ${viewStudent && html`<${LMS.StudentDetailView} student=${viewStudent} onReleaseSeat=${() => handleReleaseSeat(viewStudent)} onClose=${() => setViewStudent(null)} onEdit=${(s) => setEditStudent(s)} onUpdate=${(s) => setViewStudent(s)} />`}
    </${Modal}>
    
    <!-- View Seat Map Modal -->
    <${Modal} isOpen=${!!viewSeatMap} onClose=${() => setViewSeatMap(null)} title="Seat Location" size="lg">
        ${viewSeatMap && html`
            <div class="p-4">
                <${LMS.SeatSelector} 
                    initialSeat=${viewSeatMap} 
                    readOnly=${true} 
                    onClose=${() => setViewSeatMap(null)}
                />
            </div>
        `}
    </${Modal}>

    <${Modal} isOpen=${!!historyStudent} onClose=${() => setHistoryStudentId(null)} title="Payment history" size="lg">
      ${historyStudent && html`<${LMS.StudentPaymentHistory} student=${historyStudent} onEditPayment=${p => setPaymentModal({ open: true, student: historyStudent, payment: p })} onViewReceipt=${photo => setViewImage(photo)} />`}
    </${Modal}>

    <!-- Payment Modal -->
    <${Modal} isOpen=${paymentModal.open} onClose=${() => setPaymentModal({ open: false, student: null, payment: null })} title=${paymentModal.payment ? 'Edit Payment' : 'Add Payment'} size="md">
      ${paymentModal.student && html`<${LMS.PaymentForm} student=${paymentModal.student} payment=${paymentModal.payment} onClose=${() => setPaymentModal({ open: false, student: null, payment: null })} />`}
    </${Modal}>

    <${Modal} isOpen=${!!editStudent} onClose=${() => setEditStudent(null)} title="Edit Student" size="lg">
      ${editStudent && html`
        <div class="p-1">
          <${LMS.InlineStudentForm} 
            student=${editStudent}
            onSave=${handleSave}
            onClear=${() => setEditStudent(null)}
            halls=${halls}
            shifts=${shifts}
            students=${students}
            payments=${payments}
            onOpenSeatSelector=${(cb, student) => setSeatSelectorCb({ select: cb, student })}
            className="" 
          />
        </div>
      `}
    </${Modal}>

    <!-- Seat Selector Modal (Lifted Up - Now Last to be on Top) -->
    <${Modal} 
      isOpen=${!!seatSelectorCb} 
      onClose=${() => setSeatSelectorCb(null)} 
      title="Select Seat" 
      size="md"
    >
      ${seatSelectorCb && html`
        <${LMS.SeatSelector} initialSeat=${seatSelectorCb.student?.assignedSeat} selectionStudent=${seatSelectorCb.student}
          onSelect=${(seatId) => {
        seatSelectorCb.select(seatId);
        setSeatSelectorCb(null);
      }} 
          onClose=${() => setSeatSelectorCb(null)}
        />
      `}
    </${Modal}>

    <${ImageViewer} src=${viewImage} onClose=${() => setViewImage(null)} />
  `;
};
