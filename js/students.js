// ==================== STUDENTS.JS - Student Management with Side-by-Side Layout ====================
window.LMS = window.LMS || {};

// Inline Student Form (matching reference design)
LMS.InlineStudentForm = ({ student, onSave, onClear, halls, shifts, students, payments, onOpenSeatSelector, className }) => {
  const [form, setForm] = useState(student || {
    rollNo: '', name: '', fatherName: '', mobile: '', parentMobile: '', aadhaar: '',
    photo: '', formPhoto: '', shift: shifts[0]?.id || '', monthlyFee: 600,
    admissionDate: new Date().toISOString().split('T')[0], assignedSeat: '', isActive: true,
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
    if (showWebcam && videoRef.current) {
      // Stop any existing tracks first
      if (videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }

      const constraints = {
        video: {
          facingMode: { exact: facingMode } // Try exact first
        }
      };

      // Fallback for desktop or if exact fails
      const fallbackConstraints = { video: { facingMode: facingMode } };

      navigator.mediaDevices.getUserMedia(fallbackConstraints)
        .then(stream => {
          videoRef.current.srcObject = stream;
        }).catch(err => {
          console.warn("Camera constraint error, falling back to basic:", err);
          navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
            videoRef.current.srcObject = stream;
          });
        });
    } else {
      // cleanup if component unmounts
    }
  }, [showWebcam, facingMode]);

  // Reset form when student prop changes
  useEffect(() => {
    if (student) {
      setForm(student);
    } else {
      setForm({
        rollNo: '', name: '', fatherName: '', mobile: '', parentMobile: '', aadhaar: '',
        photo: '', formPhoto: '', shift: shifts[0]?.id || '', monthlyFee: 600,
        admissionDate: new Date().toISOString().split('T')[0], assignedSeat: '', isActive: true,
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
    if (!form.rollNo) e.rollNo = 'Required';

    // NEW: Check for duplicate Roll No across students collection
    // This prevents creating multiple students with the same ID
    if (form.rollNo && students.some(s => s.rollNo === form.rollNo && s.id !== form.id)) {
      e.rollNo = 'Roll No already exists!';
      showToast('Duplicate Roll No found!', 'error');
    }

    if (!form.name) e.name = 'Required';
    if (form.mobile && !LMS.validateMobile(form.mobile)) e.mobile = 'Invalid (10 digits)';
    if (form.parentMobile && !LMS.validateMobile(form.parentMobile)) e.parentMobile = 'Invalid (10 digits)';
    if (form.aadhaar && !LMS.validateAadhaar(form.aadhaar)) e.aadhaar = 'Invalid (12 digits)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const resetForm = () => {
    setForm({
      rollNo: '', name: '', fatherName: '', mobile: '', parentMobile: '', aadhaar: '',
      photo: '', formPhoto: '', shift: shifts[0]?.id || '', monthlyFee: 600,
      admissionDate: new Date().toISOString().split('T')[0], assignedSeat: '', isActive: true,
      feeChanges: [], pastHistory: [], deactivatedAt: null,
    });
    setErrors({});
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    let feeChanges = [...(form.feeChanges || [])];
    if (student && Number(form.monthlyFee) !== Number(student.monthlyFee)) {
      // Existing student — fee changed, record it with current date
      feeChanges.push({ date: new Date().toISOString(), fee: Number(form.monthlyFee) });
    } else if (!student && feeChanges.length === 0) {
      // New student — seed feeChanges with admission fee
      feeChanges.push({ date: (form.admissionDate || new Date().toISOString().split('T')[0]), fee: Number(form.monthlyFee) });
    }
    onSave({ ...form, id: form.id || LMS.generateId(), feeChanges, pastHistory: form.pastHistory || [] });
    // Auto-clear form after adding new student (not on edit)
    if (!student) resetForm();
  };

  const handleSeatSelect = (seatId) => {
    if (students && payments) {
      const { status, student: occupiedBy } = LMS.getSeatStatus(seatId, students, payments, shifts, halls);
      if (status !== 'available' && occupiedBy && occupiedBy.id !== form.id) {
        alert(`Seat ${seatId} is already assigned to ${occupiedBy.name}. Please release the seat first.`);
        return;
      }
    }
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
      ? html`<img src=${form.photo} class="w-full h-full object-cover" onClick=${() => setViewPhoto(form.photo)} />`
      : html`<span class="text-gray-300 text-3xl">👤</span>`
    }
            <label class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <span class="text-white text-xs font-medium">Change</span>
              <input type="file" accept="image/*" class="hidden" onChange=${e => handleImageUpload(e, 'photo')} />
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
      ? html`<img src=${form.formPhoto} class="w-full h-full object-cover" onClick=${() => setViewPhoto(form.formPhoto)} />`
      : html`<span class="text-gray-300 text-3xl">📄</span>`
    }
            <label class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <span class="text-white text-xs font-medium">Change</span>
              <input type="file" accept="image/*" class="hidden" onChange=${e => handleImageUpload(e, 'formPhoto')} />
            </label>
            <button type="button" class="absolute bottom-1 right-1 bg-white rounded-full p-1 shadow hover:bg-gray-100 z-10" onClick=${() => startWebcam('formPhoto')} title="Take Photo">📷</button>
          </div>
          <span class="text-xs text-gray-500 font-medium">Admission Form</span>
        </div>
      </div>
  
      <form onSubmit=${handleSubmit} class="space-y-5">
        <!-- Roll No & Name -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="input-label">Roll No <span class="text-red-500">*</span></label>
            <input 
              type="text" 
              class="input-field font-mono" 
              placeholder="01" 
              value=${form.rollNo} 
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
              value=${form.name} 
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
            value=${form.fatherName || ''} 
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
            value=${form.aadhaar || ''} 
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
              value=${form.mobile || ''} 
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
              value=${form.parentMobile || ''} 
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
              value=${form.admissionDate}
              max="2099-12-31" 
              onChange=${e => handleChange('admissionDate', e.target.value)} 
            />
          </div>
          
          <!-- Shift -->
          <div>
            <label class="input-label">Shift</label>
            <select 
              class="input-field" 
              value=${form.shift} 
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
            value=${form.monthlyFee} 
            onChange=${e => handleChange('monthlyFee', Number(e.target.value))} 
          />
        </div>
                <!-- Assign Seat Button -->
          <div>
            <label class="input-label">Seat Assignment</label>
            <div class="flex gap-2">
              <button 
                type="button" 
                class="btn btn-secondary flex-1 border-dashed justify-between group h-[42px]"
                onClick=${() => onOpenSeatSelector(handleSeatSelect)}
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
          <${Button} type="button" variant="secondary" onClick=${student ? onClear : resetForm}>Clear</${Button}>
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
LMS.StudentCard = ({ student, payments, shifts, halls, settings, onView, onViewPhoto, onEdit, onEditPayment, onPay, onDelete, onActivate, onViewMap }) => {
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
  const studentPayments = payments.filter(p => p.studentId === student.id).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 2);

  // Helper for WhatsApp Link
  const getWhatsAppLink = (customMsg) => {
    const phone = (student.mobile || student.parentMobile || '').replace(/[^0-9]/g, '');
    if (!phone) return null;
    const template = settings.whatsappTemplate || 'Dear {name}, your library fee of ₹{due} is due since {dueDate}. Please pay at your earliest. - {library}';
    let msg = customMsg || template.replace('{name}', student.name).replace('{due}', fin.totalDues).replace('{dueDate}', LMS.formatDate(fin.dueSince)).replace('{library}', settings.libraryName);
    return `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
  };

  const handleDeletePayment = (e, payment) => {
    e.stopPropagation();
    const pwd = prompt('Enter password to delete payment:');
    if (pwd !== '123') {
      showToast('Incorrect password!', 'error');
      return;
    }
    if (confirm(`Delete payment of ₹${payment.amount}?`)) {
      setPayments(prev => prev.filter(p => p.id !== payment.id));

      // Cloud Sync
      if (LMS.DB.removeItem) LMS.DB.removeItem('payments', payment.id);

      addLog(`Deleted payment ₹${payment.amount} for ${student.name}`);
      showToast('Payment deleted!', 'success');
    }
  };

  return html`
    <div class="card bg-card hover:bg-hover transition-all cursor-pointer border hover:border-blue-300 group ${!student.isActive ? 'student-card-inactive' : ''}" onClick=${onView}>
      <!-- Main Content -->
      <div class="p-4">
        <div class="flex gap-4">
          <!-- Photo Circle -->
          <div 
            class="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform" 
            onClick=${(e) => { e.stopPropagation(); onViewPhoto && onViewPhoto(student.photo); }}
            title="Click to view photo"
          >
            <${LMS.Avatar} src=${student.photo} name=${student.name} size="lg" />
          </div>
          
          <!-- Info Section -->
          <div class="flex-1 min-w-0">
            <!-- Row 1: Name & Due Badge -->
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-2 overflow-hidden">
                <span class="font-mono text-xs font-black text-white bg-gradient-to-r from-cyan-500 to-blue-500 px-2 py-1 rounded shadow-sm flex-shrink-0 cursor-copy"
                  onClick=${(e) => { e.stopPropagation(); navigator.clipboard.writeText(student.rollNo); showToast('Roll No copied!'); }}
                  title="Copy Roll No">
                  ${student.rollNo}
                </span>
                <span class="font-bold text-gray-800 text-lg truncate" title=${student.name}>${student.name}</span>
              </div>
              ${isDue
      ? html`<span class="status-pill due">Due: ₹${fin.totalDues}</span>`
      : html`<span class="status-pill paid">Paid</span>`
    }
            </div>
            
            <!-- Row 2: Shift & Admitted -->
            <div class="text-xs text-gray-500 mb-2 flex items-center gap-2">
              <span class="font-medium text-purple-600">
                ${shift ? html`${shift.name} <span class="text-gray-400">(${shift.startTime} - ${shift.endTime})</span>` : (student.shift || 'No Shift')}
              </span>
              <span>•</span>
              <span>Joined ${LMS.formatDate(student.admissionDate)}</span>
            </div>
            
            <!-- Row 3: Valid Till & Due Since Badges -->
            <div class="flex flex-wrap gap-2 text-xs mb-3">
              <span class="status-pill ${isDue ? 'inactive' : 'active'}">
                Valid: ${LMS.formatDate(fin.paidUntil)}
              </span>
              ${isDue && fin.dueSince && html`
                <span class="status-pill pending">
                  Since: ${LMS.formatDate(fin.dueSince)}
                </span>
              `}
            </div>
            
            <!-- Row 4: Mobile & Action Links -->
            <div class="flex items-center justify-between border-t pt-2 mt-2">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-600 font-mono cursor-pointer hover:text-blue-600" 
                      onClick=${(e) => { e.stopPropagation(); navigator.clipboard.writeText(student.mobile || student.parentMobile); showToast('Number copied!'); }}
                      title="Click to copy">
                  📞 ${student.mobile || student.parentMobile || '--'}
                </span>
                <!-- WhatsApp Button if Due -->
                ${isDue && getWhatsAppLink() && html`
                  <a href=${getWhatsAppLink()} target="_blank" onClick=${e => e.stopPropagation()} 
                     class="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600 hover:bg-green-200 hover:scale-110 transition-transform" 
                     title="Send Due Reminder">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                  </a>
                `}
              </div>
              
              <div class="flex gap-3 text-xs" onClick=${e => e.stopPropagation()}>
                <button class="text-blue-600 hover:text-blue-800 font-medium" onClick=${onEdit}>Edit</button>
                <button class="text-green-600 hover:text-green-800 font-medium" onClick=${onPay}>Pay</button>
                <button class="text-red-600 hover:text-red-800 font-medium" onClick=${onDelete}>Delete</button>
                ${!student.isActive && html`<button class="text-emerald-600 hover:text-emerald-800 font-bold" onClick=${(e) => { e.stopPropagation(); onActivate && onActivate(student); }}>ACTIVATE</button>`}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Assigned Seat Section -->
      ${seatLabel && html`
        <div class="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
          <div class="text-sm">
            Assigned Seat: <span class="font-black text-gray-800 text-lg">${seatLabel}</span>
          </div>
          <button 
            type="button" 
            class="text-purple-600 hover:underline text-sm font-medium flex items-center gap-1" 
            onClick=${(e) => { e.stopPropagation(); onViewMap(student.assignedSeat); }}
          >
            <span class="text-lg">🗺️</span> View on map
          </button>
        </div>
      `}
      
      <!-- Recent Payments Section -->
      ${studentPayments.length > 0 && html`
        <div class="px-4 py-3 border-t">
          <div class="text-xs text-gray-500 mb-2">Recent Payments (Last 2):</div>
          <div class="space-y-2">
            ${studentPayments.map(p => html`
              <div key=${p.id} class="flex justify-between items-center text-sm">
                <span>
                  <span class="text-green-600 font-bold">₹${p.amount}</span>
                  <span class="text-gray-500"> on ${LMS.formatDate(p.date)}</span>
                </span>
                <div class="flex gap-2 text-xs" onClick=${e => e.stopPropagation()}>
                  <button class="text-blue-500 hover:underline" onClick=${() => onEditPayment && onEditPayment(p)}>Edit</button>
                  <button class="text-red-500 hover:underline" onClick=${e => handleDeletePayment(e, p)}>Del</button>
                </div>
              </div>
            `)}
          </div>
        </div>
      `}
    </div>
  `;
};


// Enhanced Student Detail View with Payment Edit/Delete
LMS.StudentDetailView = ({ student, onReleaseSeat, onClose, onEdit, onUpdate }) => {
  const { payments, setPayments, shifts, halls, setStudents, showToast, addLog, settings } = useContext(LMS.AppContext);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const [viewPhoto, setViewPhoto] = useState(null);
  const { Button, Modal, ImageViewer } = LMS;

  const fin = LMS.calculateStudentFinancials(student, payments);
  const shift = shifts.find(s => s.id === student.shift);
  const studentPayments = payments.filter(p => p.studentId === student.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const seatLabel = student.assignedSeat ? LMS.formatSeatLabel(student.assignedSeat, halls) : 'N/A';
  const totalPaid = studentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const handleWhatsApp = (type) => {
    const phone = (student.mobile || student.parentMobile || '').replace(/[^0-9]/g, '');
    if (!phone) { showToast('No mobile number found!', 'error'); return; }
    let msg = '';
    if (type === 'welcome') {
      const template = settings.welcomeTemplate || 'Welcome to {library}, {name}! Your Roll No is {roll}.';
      msg = template.replace('{name}', student.name).replace('{roll}', student.rollNo).replace('{library}', settings.libraryName);
    } else if (type === 'due') {
      const template = settings.whatsappTemplate || 'Dear {name}, your library fee of ₹{due} is due since {dueDate}. Please pay at your earliest. - {library}';
      msg = template.replace('{name}', student.name).replace('{due}', fin.totalDues).replace('{dueDate}', LMS.formatDate(fin.dueSince)).replace('{library}', settings.libraryName);
    } else if (type === 'absent') {
      const template = settings.absentTemplate || 'Dear {name}, you were absent today at {library}. Roll: {roll}. Please maintain regularity.';
      msg = template.replace('{name}', student.name).replace('{roll}', student.rollNo).replace('{library}', settings.libraryName);
    }
    window.open('https://wa.me/91' + phone + '?text=' + encodeURIComponent(msg), '_blank');
  };

  const handleDeactivate = () => {
    if (confirm('Deactivate ' + student.name + '?')) {
      const updated = { ...student, isActive: false, deactivatedAt: new Date().toISOString(), assignedSeat: null };
      setStudents(prev => prev.map(s => s.id === student.id ? updated : s)); // Also release seat

      // Cloud Sync
      if (LMS.DB.saveItem) LMS.DB.saveItem('students', updated);

      addLog('Deactivated student: ' + student.name);
      showToast('Student deactivated & seat released!', 'success');
    }
  };

  const handleActivate = () => {
    const updated = { ...student, isActive: true, deactivatedAt: null };
    setStudents(prev => prev.map(s => s.id === student.id ? updated : s));

    // Cloud Sync
    if (LMS.DB.saveItem) LMS.DB.saveItem('students', updated);

    addLog('Re-activated student: ' + student.name);
    showToast('Student reactivated!', 'success');
  };

  const handleReset = () => {
    if (confirm('Reset ' + student.name + '? This will release their seat, archive payments, and open the edit form for re-admission.')) {
      const studentPayments = payments.filter(p => p.studentId === student.id);
      const updatedHistory = [...(student.pastHistory || []), { date: new Date().toISOString(), type: 'Reset', archivedPayments: studentPayments }];
      
      const updated = { 
        ...student, 
        admissionDate: new Date().toISOString().split('T')[0], 
        assignedSeat: '', // Clear seat
        shift: shifts && shifts.length > 0 ? shifts[0].id : '', // Reset shift
        monthlyFee: 600, // Reset fee
        feeChanges: [], // Clear fee history
        pastHistory: updatedHistory,
        isActive: true,
        deactivatedAt: null 
      };
      setStudents(prev => prev.map(s => s.id === student.id ? updated : s));

      // Cloud Sync Student
      if (LMS.DB.saveItem) LMS.DB.saveItem('students', updated);
      
      // Remove all active payments for this student
      setPayments(prev => prev.filter(p => p.studentId !== student.id));
      if (LMS.DB.removeItem) {
        studentPayments.forEach(p => LMS.DB.removeItem('payments', p.id));
      }

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
        amount: 0,
        discount: Number(student.monthlyFee),
        date: new Date().toISOString(),
        method: 'waiver',
        remarks: 'Fee Waived (Skip Month)'
      };
      setPayments(prev => [...prev, waiver]);

      // Cloud Sync
      if (LMS.DB.saveItem) LMS.DB.saveItem('payments', waiver);

      addLog(`Waived fee for ${student.name}`);
      showToast('Fee waived for 1 month!', 'success');
    }
  };

  const handleDeletePayment = (payment) => {
    const pwd = prompt('Enter password to delete payment:');
    if (pwd !== '123') {
      showToast('Incorrect password!', 'error');
      return;
    }
    if (confirm(`Delete payment of ₹${payment.amount}?`)) {
      setPayments(prev => prev.filter(p => p.id !== payment.id));

      // Cloud Sync
      if (LMS.DB.removeItem) LMS.DB.removeItem('payments', payment.id);

      addLog(`Deleted payment ₹${payment.amount} for ${student.name}`);
      showToast('Payment deleted!', 'success');
    }
  };

  const handleEditPayment = (payment) => {
    setEditPayment(payment);
    setShowPaymentForm(true);
  };

  return html`
    <div class="grid student-detail-grid">
      <!-- Left Column -->
      <div class="space-y-4">
        <!-- Photo & Basic Info -->
        <div class="text-center p-4 bg-gradient-to-b from-purple-50 to-transparent rounded-xl border">
          <div class="w-24 h-24 mx-auto rounded-full overflow-hidden border-4 border-primary shadow-xl mb-3 cursor-pointer hover:opacity-90 transition-opacity" onClick=${() => student.photo && setViewPhoto(student.photo)}>
            ${student.photo
      ? html`<img src=${student.photo} class="w-full h-full object-cover" />`
      : html`<div class="w-full h-full bg-primary/20 flex items-center justify-center text-4xl font-black text-primary">${(student.name || '?').charAt(0).toUpperCase()}</div>`}
          </div>
          <h3 class="font-black text-xl text-gray-800">${student.name}</h3>
          <p class="text-primary font-bold cursor-pointer hover:text-blue-600" onClick=${() => { navigator.clipboard.writeText(student.rollNo); showToast('Roll No copied!'); }}>
            Roll No: <span class="text-red-500">${student.rollNo}</span> 📋
          </p>
          <p class="text-xs text-gray-500">Admitted on: ${LMS.formatDate(student.admissionDate)}</p>
        </div>

        <!-- Financial Status -->
        <div class="p-4 bg-card rounded-xl border-l-4 border-pink-500 shadow-sm">
          <h4 class="font-black text-pink-700 mb-3">Financial Status</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span>Monthly Fee:</span><span class="font-bold text-purple-600">₹${student.monthlyFee || 0}</span></div>
            <div class="flex justify-between"><span>Total Paid:</span><span class="font-bold text-green-600">₹${totalPaid.toLocaleString('en-IN')} ⊙</span></div>
            <div class="flex justify-between"><span>Valid Till:</span><span class="font-bold ${fin.totalDues > 0 ? 'text-red-600' : 'text-green-600'}">${LMS.formatDate(fin.paidUntil)} (${fin.paidMonths} months)</span></div>
            <div class="flex justify-between"><span>Due Since:</span><span class="font-bold text-red-600">${fin.dueSince ? LMS.formatDate(fin.dueSince) : 'N/A'}</span></div>
            <div class="flex justify-between"><span>Total Dues:</span><span class="font-bold text-red-600">₹${fin.totalDues}</span></div>
            <div class="flex justify-between"><span>Days Overdue:</span><span class="font-bold text-red-500">${fin.daysDue || 0}</span></div>
          </div>
        </div>

        <!-- Communication -->
        <div class="grid grid-cols-3 gap-2 mb-2">
           <button class="btn text-white text-xs font-bold flex flex-col items-center justify-center p-2 rounded shadow hover:scale-105 transition-transform" 
             style=${{ background: '#25D366' }} onClick=${() => handleWhatsApp('welcome')}>
             <span>👋</span> Welcome
           </button>
           <button class="btn text-white text-xs font-bold flex flex-col items-center justify-center p-2 rounded shadow hover:scale-105 transition-transform" 
             style=${{ background: '#128C7E' }} onClick=${() => handleWhatsApp('due')}>
             <span>💰</span> Due Reminder
           </button>
           <button class="btn text-white text-xs font-bold flex flex-col items-center justify-center p-2 rounded shadow hover:scale-105 transition-transform" 
             style=${{ background: '#075E54' }} onClick=${() => handleWhatsApp('absent')}>
             <span>🚫</span> Absent
           </button>
        </div>

        <!-- Action Buttons -->
        <div class="space-y-2">
          <${Button} className="w-full" style=${{ background: 'linear-gradient(135deg, #48bb78, #38a169)' }} onClick=${() => { setEditPayment(null); setShowPaymentForm(true); }}>ADD PAYMENT</${Button}>
          <${Button} className="w-full" style=${{ background: 'linear-gradient(135deg, #38b2ac, #319795)' }} onClick=${handleWaiveFee}>WAIVE FEE (SKIP MONTH)</${Button}>
          <${Button} className="w-full" style=${{ background: 'linear-gradient(135deg, #667eea, #5a67d8)' }} onClick=${() => { onClose(); onEdit && onEdit(student); }}>EDIT DETAILS</${Button}>
          ${seatLabel && seatLabel !== 'N/A' && html`
            <${Button} className="w-full" style=${{ background: 'linear-gradient(135deg, #f56565, #e53e3e)' }} onClick=${onReleaseSeat}>RELEASE SEAT ${seatLabel}</${Button}>
          `}
          ${student.isActive
      ? html`<${Button} className="w-full" style=${{ background: 'linear-gradient(135deg, #ed8936, #dd6b20)' }} onClick=${handleDeactivate}>DEACTIVATE STUDENT</${Button}>`
      : html`<${Button} className="w-full" style=${{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }} onClick=${handleActivate}>ACTIVATE STUDENT</${Button}>`
    }
          <${Button} className="w-full" style=${{ background: 'linear-gradient(135deg, #9f7aea, #805ad5)' }} onClick=${handleReset}>RESET STUDENT</${Button}>
        </div>
      </div>

      <!-- Right Column -->
      <div class="space-y-4">
        <!-- General Information -->
        <div class="p-4 bg-card rounded-xl shadow-sm border">
          <h4 class="font-black text-purple-700 text-lg mb-4">General Information</h4>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div><span class="text-gray-500">Assigned Seat:</span> <span class="font-bold text-purple-600">${seatLabel}</span></div>
            <div><span class="text-gray-500">Current Shift:</span> <span class="font-bold text-purple-600">${shift?.name || 'N/A'}</span> ${shift ? `(${shift.startTime} - ${shift.endTime})` : ''}</div>
            <div><span class="text-gray-500">Father's Name:</span> <span class="font-bold">${student.fatherName || 'N/A'}</span></div>
            <div><span class="text-gray-500">Aadhaar:</span> <span class="font-bold">${student.aadhaar || 'N/A'}</span></div>
            <div><span class="text-gray-500">Student Mobile:</span> <span class="font-bold cursor-pointer hover:text-blue-600" onClick=${() => { navigator.clipboard.writeText(student.mobile); showToast('Copied!'); }}>${student.mobile || 'N/A'}</span></div>
            <div><span class="text-gray-500">Parent Mobile:</span> <span class="font-bold cursor-pointer hover:text-blue-600" onClick=${() => { navigator.clipboard.writeText(student.parentMobile); showToast('Copied!'); }}>${student.parentMobile || 'N/A'}</span></div>
            <div class="col-span-2"><span class="text-gray-500">Admission Date:</span> <span class="font-bold">${LMS.formatDate(student.admissionDate)}</span></div>
          </div>
        </div>

        <!-- Payment History -->
        <div class="p-4 bg-card rounded-xl shadow-sm border">
          <h4 class="font-black text-pink-700 text-lg mb-4">Payment History</h4>
          ${studentPayments.length > 0 ? html`
            <div class="space-y-2 max-h-64 overflow-y-auto">
              ${studentPayments.map(p => html`
                <div key=${p.id} class="flex justify-between items-center p-3 bg-gray-50 rounded-lg text-sm border">
                  <div>
                    <span class="font-bold text-green-600">₹${p.amount.toLocaleString('en-IN')}</span>
                    <span class="text-gray-500 ml-2">${LMS.formatDate(p.date)}</span>
                    ${p.discount > 0 && html`<span class="text-red-500 ml-1">(Disc: ₹${p.discount})</span>`}
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs bg-purple-100 px-2 py-1 rounded-full font-semibold text-purple-600">${p.method || 'cash'}</span>
                    <button class="text-blue-500 hover:text-blue-700 text-xs" onClick=${() => handleEditPayment(p)}>Edit</button>
                    <button class="text-red-500 hover:text-red-700 text-xs" onClick=${() => handleDeletePayment(p)}>Delete</button>
                  </div>
                </div>
              `)}
            </div>
          ` : html`<p class="text-gray-500 italic">No payment history found.</p>`}
        </div>

        <!-- Archived History -->
        ${student.pastHistory && student.pastHistory.length > 0 && html`
          <div class="p-4 bg-gray-50 rounded-xl shadow-sm border mt-4">
            <h4 class="font-bold text-gray-600 text-sm mb-3 uppercase tracking-wider">Archived History</h4>
            <div class="space-y-3 max-h-48 overflow-y-auto pr-2">
              ${[...student.pastHistory].reverse().map((history, idx) => html`
                <div key=${idx} class="p-3 bg-white rounded border border-gray-200 text-sm">
                  <div class="font-bold text-purple-700 mb-2 border-b pb-1">
                    Cycle Reset on: ${LMS.formatDate(history.date)}
                  </div>
                  ${history.archivedPayments && history.archivedPayments.length > 0 ? html`
                    <div class="space-y-1">
                      ${history.archivedPayments.map(p => html`
                        <div key=${p.id} class="flex justify-between text-xs text-gray-500">
                          <span>Paid ₹${p.amount}</span>
                          <span>${LMS.formatDate(p.date)}</span>
                        </div>
                      `)}
                    </div>
                  ` : html`<p class="text-xs text-gray-400 italic">No payments in this cycle.</p>`}
                </div>
              `)}
            </div>
          </div>
        `}
      </div>
    </div>

    <!-- Payment Form Modal -->
    <${Modal} isOpen=${showPaymentForm} onClose=${() => { setShowPaymentForm(false); setEditPayment(null); }} title=${editPayment ? 'Edit Payment' : 'Add Payment'} size="md">
      <${LMS.PaymentForm} student=${student} payment=${editPayment} onClose=${() => { setShowPaymentForm(false); setEditPayment(null); }} />
    </${Modal}>
    
    <${ImageViewer} src=${viewPhoto} onClose=${() => setViewPhoto(null)} />
  `;
};

// Main Student Management Component
LMS.StudentManagement = () => {
  const { students, setStudents, payments, setPayments, halls, shifts, settings, addLog, showToast } = useContext(LMS.AppContext);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // Default: Newest First
  const [editStudent, setEditStudent] = useState(null);
  const [viewStudent, setViewStudent] = useState(null);
  const [viewSeatMap, setViewSeatMap] = useState(null);
  const [viewImage, setViewImage] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  // Removed duplicate state declarations
  const [paymentModal, setPaymentModal] = useState({ open: false, student: null });
  const [seatSelectorCb, setSeatSelectorCb] = useState(null); // Callback for seat selection
  const { Button, Card, Modal, SearchBar, Icons, ImageViewer } = LMS;

  // Filter AND Sort Logic
  const filtered = students.filter(s => {
    if (!showInactive && !s.isActive) return false;
    return s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.rollNo?.toLowerCase().includes(search.toLowerCase()) ||
      s.mobile?.includes(search);
  }).sort((a, b) => {
    switch (sortBy) {
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

  // Refactored handleSave to work for both Add (Sidebar) and Edit (Modal)
  const handleSave = (student) => {
    const existingIndex = students.findIndex(s => s.id === student.id);

    if (existingIndex >= 0) {
      // Update existing
      setStudents(prev => prev.map(s => s.id === student.id ? student : s));
      // Cloud Sync
      if (LMS.DB.saveItem) LMS.DB.saveItem('students', student);

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
      // Cloud Sync
      if (LMS.DB.saveItem) LMS.DB.saveItem('students', student);

      addLog('Added student: ' + student.name);
      showToast('Student added!', 'success');
      // Open payment modal for new student
      setPaymentModal({ open: true, student: student });
    }
  };

  const handleDelete = (s) => {
    const pwd = prompt('Enter password to delete student:');
    if (pwd !== 'Adit@7858') {
      showToast('Incorrect password!', 'error');
      return;
    }
    if (confirm('Delete ' + s.name + '?')) {
      // Close any open modals/views for this student first
      if (viewStudent && viewStudent.id === s.id) setViewStudent(null);
      if (editStudent && editStudent.id === s.id) setEditStudent(null);

      // Capture payment IDs before state update (since payments state might change)
      const studentPaymentIds = payments.filter(p => p.studentId === s.id).map(p => p.id);

      setStudents(prev => prev.filter(x => x.id !== s.id));
      setPayments(prev => prev.filter(p => p.studentId !== s.id));

      // Cloud Sync: Remove Student and their Payments
      if (LMS.DB.removeItem) {
        LMS.DB.removeItem('students', s.id);
        // Remove all payments for this student from cloud
        studentPaymentIds.forEach(pid => LMS.DB.removeItem('payments', pid));
      }

      addLog('Deleted student: ' + s.name);
      showToast('Student deleted!', 'success');
    }
  };

  const handleActivate = (s) => {
    if (confirm('Activate ' + s.name + '?')) {
      const updated = { ...s, isActive: true, deactivatedAt: null };
      setStudents(prev => prev.map(x => x.id === s.id ? updated : x));

      // Cloud Sync
      if (LMS.DB.saveItem) LMS.DB.saveItem('students', updated);

      addLog('Re-activated: ' + s.name);
      showToast('Student activated!', 'success');
    }
  };

  const handleReleaseSeat = (student) => {
    if (confirm(`Release seat for ${student.name}?`)) {
      const updated = { ...student, assignedSeat: null };
      setStudents(prev => prev.map(s => s.id === student.id ? updated : s));

      // Cloud Sync
      if (LMS.DB.saveItem) LMS.DB.saveItem('students', updated);

      addLog(`Released seat for: ${student.name}`);
      showToast('Seat released!', 'success');
      setViewStudent(null);
    }
  };

  return html`
    <div class="grid student-layout-grid">
      <!-- Left Column: Add/Update Student Form (Scrollable) -->
      <div class="bg-card rounded-2xl shadow-sm sticky-sidebar">
        <${LMS.InlineStudentForm} 
          student=${null} 
          onSave=${handleSave} 
          onClear=${() => { /* Handled internally by resetForm */ }}
          halls=${halls} 
          shifts=${shifts}
          students=${students}
          payments=${payments}
          onOpenSeatSelector=${(cb) => setSeatSelectorCb(() => cb)}
          className="h-full overflow-y-auto"
        />
      </div>
      
      <!-- Right Column: Student Records -->
      <div class="space-y-4">
        <!-- Header Row -->
        <div class="flex items-center gap-4">
          <h2 class="text-xl font-bold text-purple-700">Student Records</h2>
          <label class="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked=${showInactive} onChange=${e => setShowInactive(e.target.checked)} class="w-4 h-4 accent-purple-600" />
            Show Inactive
          </label>
        </div>
        
        <!-- Search Bar & Sort -->
        <div class="flex gap-2">
          <input 
            class="flex-1 px-4 py-3 bg-card border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" 
            placeholder="Search by roll, name, or mobile" 
            value=${search} 
            onChange=${e => setSearch(e.target.value)}
            style=${{ borderColor: '#e5e7eb' }}
          />
          <select 
            class="px-4 py-3 bg-card border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 cursor-pointer"
            value=${sortBy}
            onChange=${e => setSortBy(e.target.value)}
            style=${{ borderColor: '#e5e7eb', minWidth: '140px' }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="name_desc">Name (Z-A)</option>
          </select>
        </div>
        
        <!-- Student Cards - 2 per row -->
        <div class="grid gap-4 student-card-grid">
          ${filtered.map(student => html`
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
            />
          `)}
          ${filtered.length === 0 && html`
            <${Card} className="text-center py-8 text-gray-500 col-span-2">No students found</${Card}>
          `}
        </div>
      </div>
    </div>

    <${Modal} isOpen=${!!viewStudent} onClose=${() => setViewStudent(null)} title=${`Student Detail: ${viewStudent?.name || ''}`} size="lg">
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
            onOpenSeatSelector=${(cb) => setSeatSelectorCb(() => cb)}
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
        <${LMS.SeatSelector} 
          onSelect=${(seatId) => {
        seatSelectorCb(seatId);
        setSeatSelectorCb(null);
      }} 
          onClose=${() => setSeatSelectorCb(null)}
        />
      `}
    </${Modal}>

    <${ImageViewer} src=${viewImage} onClose=${() => setViewImage(null)} />
  `;
};
