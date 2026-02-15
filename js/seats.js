// ==================== SEATS.JS - Seat & Hall Management ====================
window.LMS = window.LMS || {};


// Graphical Seat Selector Component (Reusable)
LMS.SeatSelector = ({ onSelect, onClose, initialSeat, readOnly }) => {
  const { halls, students, payments, shifts } = useContext(LMS.AppContext);
  const [selectedHall, setSelectedHall] = useState(halls[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState('');

  // Update selected hall if needed
  useEffect(() => {
    if (initialSeat) {
      const parts = initialSeat.split('-');
      if (parts.length > 1) {
        const hallId = parts.slice(0, -1).join('-');
        setSelectedHall(hallId);
      }
    } else if (!selectedHall && halls.length > 0) {
      setSelectedHall(halls[0].id);
    }
  }, [halls, initialSeat]);

  const currentHall = halls.find(h => h.id === selectedHall);
  const hallPrefix = currentHall ? currentHall.name.replace(/^Hall\s+/i, '').charAt(0).toUpperCase() : 'A';
  const seatCount = currentHall ? (Number(currentHall.seatCount) || 0) : 0;

  return html`
    <div class="space-y-4">
      <!-- Header: Tabs & Search -->
      <div class="flex flex-col gap-3">
        <div class="flex gap-2 overflow-x-auto pb-2">
          ${halls.map(hall => html`
            <button 
              key=${hall.id}
              onClick=${() => setSelectedHall(hall.id)}
              class="px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${selectedHall === hall.id
      ? 'bg-purple-600 text-white shadow-md'
      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }"
            >
              ${hall.name}
            </button>
          `)}
        </div>
        
        <input 
          type="text"
          class="input-field text-sm"
          placeholder="Search seat (e.g. A5)..."
          value=${searchTerm}
          onInput=${e => setSearchTerm(e.target.value)}
        />
      </div>

      <!-- Seat Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto p-1">
        ${currentHall && seatCount > 0 ? Array.from({ length: seatCount }, (_, i) => {
      const seatId = currentHall.id + '-' + (i + 1);
      const seatLabel = hallPrefix + (i + 1);
      const { status, student } = LMS.getSeatStatus(seatId, students, payments, shifts);

      // Filter
      if (searchTerm && !seatLabel.toLowerCase().includes(searchTerm.toLowerCase())) return null;

      const isOccupied = status !== 'available';
      const isSelected = initialSeat === seatId;

      let style = {};

      if (isSelected) {
        style = { background: '#a855f7', borderColor: '#7e22ce', color: '#fff' }; // Purple for Selected
      } else if (isOccupied) {
        style = { background: 'var(--bg-gray-50)', borderColor: 'var(--border-color)', opacity: 0.9 };
      } else {
        style = { background: 'var(--seat-available-bg)', borderColor: 'var(--seat-available-border)' };
      }

      return html`
            <div 
              key=${i}
              onClick=${() => !readOnly && onSelect && onSelect(seatId)}
              class="border rounded-lg p-2 flex flex-col items-center justify-center gap-1 transition-all ${!readOnly ? 'hover:scale-105 cursor-pointer' : ''} ${isOccupied ? 'hover:shadow-md' : 'hover:shadow-md'}"
              style=${style}
            >
              <span class="text-sm font-bold ${isSelected ? 'text-white' : (isOccupied ? 'text-gray-500' : 'text-blue-700')}">${seatLabel}</span>
              ${isOccupied
          ? html`<span class="text-[10px] text-gray-400 truncate w-full text-center">${student?.name?.split(' ')[0]}</span>`
          : html`<span class="text-[10px] text-blue-600 font-medium">Free</span>`
        }
            </div>
          `;
    }) : html`<div class="col-span-5 text-center text-gray-400 py-8">No seats in this hall</div>`}
      </div>
    </div>
  `;
};

LMS.SeatManagement = () => {
  const { halls, setHalls, students, setStudents, payments, shifts, addLog, showToast } = useContext(LMS.AppContext);

  const [showHallForm, setShowHallForm] = useState(false);
  const [newHall, setNewHall] = useState({ name: '', seatCount: 20 });
  const [viewStudent, setViewStudent] = useState(null);
  const [selectedHall, setSelectedHall] = useState(halls[0]?.id || null);
  // Removed duplicate selectedHall
  const [searchTerm, setSearchTerm] = useState('');
  const [assignSeatModal, setAssignSeatModal] = useState({ open: false, seatId: null, seatLabel: null });
  const [studentSearch, setStudentSearch] = useState('');
  const { Button, Card, Modal, Input, Icons, SearchBar } = LMS;

  // Update selected hall when halls change
  useEffect(() => {
    if (!selectedHall && halls.length > 0) {
      setSelectedHall(halls[0].id);
    }
  }, [halls]);

  const addHall = () => {
    if (!newHall.name) return;
    const newHallData = { ...newHall, id: LMS.generateId() };
    setHalls(prev => [...prev, newHallData]);

    // Cloud Sync
    if (LMS.DB.saveItem) LMS.DB.saveItem('halls', newHallData);

    addLog('Added hall: ' + newHall.name);
    showToast('Hall added!', 'success');
    setNewHall({ name: '', seatCount: 20 });
    setShowHallForm(false);
    setSelectedHall(newHallData.id);
  };

  const removeHall = (hall) => {
    const pwd = prompt('Enter password to delete hall:');
    if (pwd !== '123') {
      showToast('Incorrect password!', 'error');
      return;
    }
    if (confirm('Delete ' + hall.name + '? All seat assignments will be cleared.')) {
      setStudents(prev => prev.map(s => s.assignedSeat?.startsWith(hall.id) ? { ...s, assignedSeat: '' } : s));
      setHalls(prev => prev.filter(h => h.id !== hall.id));

      // Cloud Sync
      if (LMS.DB.removeItem) LMS.DB.removeItem('halls', hall.id);
      // Note: Students are updated too, but that's handled by debounced or separate sync if we refactor releaseSeat

      if (selectedHall === hall.id) {
        setSelectedHall(halls.find(h => h.id !== hall.id)?.id || null);
      }
      addLog('Deleted hall: ' + hall.name);
      showToast('Hall deleted!', 'success');
    }
  };

  const releaseSeat = (student) => {
    const updatedStudent = { ...student, assignedSeat: '' };
    setStudents(prev => prev.map(s => s.id === student.id ? updatedStudent : s));

    // Cloud Sync
    if (LMS.DB.saveItem) LMS.DB.saveItem('students', updatedStudent);

    addLog('Released seat for: ' + student.name);
    showToast('Seat released!', 'success');
    setViewStudent(null);
  };

  // Assign student to seat
  const assignStudentToSeat = (student, seatId) => {
    // Check if seat is already assigned to another active student
    const occupant = students.find(s => s.assignedSeat === seatId && s.isActive && s.id !== student.id);
    if (occupant) {
      alert(`Seat ${LMS.formatSeatLabel(seatId, halls)} is already assigned to ${occupant.name}. Please release it first.`);
      return;
    }

    const updatedStudent = { ...student, assignedSeat: seatId };
    setStudents(prev => prev.map(s => s.id === student.id ? updatedStudent : s));

    // Cloud Sync
    if (LMS.DB.saveItem) LMS.DB.saveItem('students', updatedStudent);

    addLog('Assigned ' + student.name + ' to seat ' + LMS.formatSeatLabel(seatId, halls));
    showToast('Student assigned to seat!', 'success');
    setAssignSeatModal({ open: false, seatId: null, seatLabel: null });
    setStudentSearch('');
  };

  // Get unassigned active students
  const getUnassignedStudents = () => {
    return students.filter(s => s.isActive && !s.assignedSeat).filter(s => {
      if (!studentSearch) return true;
      const term = studentSearch.toLowerCase();
      return s.name?.toLowerCase().includes(term) || s.rollNo?.toLowerCase().includes(term);
    });
  };

  const currentHall = halls.find(h => h.id === selectedHall);
  const hallPrefix = currentHall ? currentHall.name.replace(/^Hall\s+/i, '').charAt(0).toUpperCase() : 'A';

  // Count stats for current hall - ensure seatCount is a valid number
  const seatCount = currentHall ? (Number(currentHall.seatCount) || 0) : 0;
  const hallSeats = currentHall && seatCount > 0 ? Array.from({ length: seatCount }, (_, i) => {
    const seatId = currentHall.id + '-' + (i + 1);
    return LMS.getSeatStatus(seatId, students, payments, shifts);
  }) : [];
  const occupiedCount = hallSeats.filter(s => s.status !== 'available').length;
  const availableCount = hallSeats.filter(s => s.status === 'available').length;

  return html`<div class="space-y-4">
    <!-- Header: Info + Search + Hall Tabs -->
    <div class="flex flex-wrap items-center justify-between gap-4 bg-card p-3 rounded-xl shadow-sm border">
      <div>
        <p class="text-sm text-gray-600">
          Viewing Hall <span class="font-black text-purple-700">${hallPrefix}</span>. 
          Total seats: <span class="text-red-500 font-bold">${currentHall?.seatCount || 0}</span>, 
          Available: <span class="text-green-600 font-bold">${availableCount}</span>
        </p>
      </div>
      
      <div class="flex items-center gap-3">
        <input 
          type="text"
          class="input-field"
          placeholder="Search seat, roll, name, or no."
          value=${searchTerm}
          onInput=${e => setSearchTerm(e.target.value)}
          style=${{ width: '240px' }}
        />
        
        <!-- Hall Tabs -->
        <div class="flex gap-1">
          ${halls.map(hall => html`
            <button 
              key=${hall.id}
              onClick=${() => setSelectedHall(hall.id)}
              class="px-4 py-2 rounded-lg font-bold text-sm transition-all ${selectedHall === hall.id
      ? 'bg-pink-500 text-white shadow-lg'
      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border'
    }"
            >
              ${hall.name}
            </button>
          `)}
        </div>
      </div>
    </div>

    <!-- Seat Cards Grid -->
    ${currentHall && seatCount > 0 && html`
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        ${Array.from({ length: seatCount }, (_, i) => {
      const seatId = currentHall.id + '-' + (i + 1);
      const seatLabel = hallPrefix + (i + 1);
      const { status, student } = LMS.getSeatStatus(seatId, students, payments, shifts);
      const fin = student ? LMS.calculateStudentFinancials(student, payments) : null;
      const shift = student ? shifts.find(s => s.id === student.shift) : null;

      // Filter by search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSeat = seatLabel.toLowerCase().includes(term);
        const matchesStudent = student && (
          student.name?.toLowerCase().includes(term) ||
          student.rollNo?.toLowerCase().includes(term) ||
          student.mobile?.includes(term)
        );
        if (!matchesSeat && !matchesStudent) return null;
      }

      const isDue = fin?.totalDues > 0;
      const daysText = fin?.daysDue > 0 ? `${fin.daysDue} Days Due` : null;

      // Card background colors based on status (Updated Logic)
      // Due: Red, Overpaid: Blue, Paid: Green
      const isOverpaid = fin?.overpaid > 0;

      let cardStyle = {};

      if (status === 'available') {
        // Light Blue for Available
        cardStyle = { background: 'var(--seat-available-bg)', border: '1px solid var(--seat-available-border)' };
      } else if (isDue) {
        // Red for Due
        cardStyle = { background: 'var(--seat-due-bg)', border: '1px solid var(--seat-due-border)' };
      } else {
        // Green for Paid (and Overpaid/Advance)
        cardStyle = { background: 'var(--seat-paid-bg)', border: '1px solid var(--seat-paid-border)' };
      }

      return html`
            <div 
              key=${i}
              onClick=${() => student ? setViewStudent({ ...student, seatLabel }) : setAssignSeatModal({ open: true, seatId: seatId, seatLabel: seatLabel })}
              class="rounded-2xl cursor-pointer hover:shadow-lg transition-shadow"
              style=${{ ...cardStyle, padding: '1rem', minHeight: '180px', position: 'relative' }}
            >
              <!-- Header: Seat Label + Status Badge -->
              <div class="flex justify-between items-start mb-2">
                <div class="text-3xl font-black text-gray-800">${seatLabel}</div>
                ${status === 'available'
          ? html`<span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">Available</span>`
          : html`<div class="flex flex-col items-end gap-1">
                      ${isDue
              ? html`<span class="px-3 py-1 rounded-full text-xs font-bold bg-red-600 text-white shadow-sm">${daysText || 'Due'}</span>`
              : html`<span class="px-3 py-1 rounded-full text-xs font-bold bg-green-600 text-white shadow-sm">Paid</span>`
            }
                    </div>`
        }
              </div>

              ${student ? html`
                <!-- Release Button -->
                <button 
                  onClick=${(e) => { e.stopPropagation(); releaseSeat(student); }}
                  class="px-3 py-1 bg-pink-500 text-white text-xs rounded-full font-bold hover:bg-pink-600 shadow-md mb-3"
                  style=${{ display: 'inline-block' }}
                >Release</button>
                
                <!-- Student Info (Centered) -->
                <div class="flex flex-col items-center text-center">
                  <!-- Avatar -->
                  <div class="w-14 h-14 rounded-full overflow-hidden border-3 border-purple-300 shadow-lg mb-2" style=${{ background: '#c4b5fd' }}>
                    ${student.photo
            ? html`<img src=${student.photo} alt=${student.name} class="w-full h-full object-cover" />`
            : html`<div class="w-full h-full flex items-center justify-center font-black text-2xl text-purple-700">${(student.name || '?').charAt(0).toUpperCase()}</div>`
          }
                  </div>
                  
                  <!-- Name -->
                  <div class="font-bold text-gray-800 text-sm">${student.name}</div>
                  
                  <!-- Roll Number -->
                  <div class="text-xs font-black text-pink-600 mb-1">Roll: ${student.rollNo}</div>
                  
                  <!-- Valid Till -->
                  <div class="text-xs ${isDue ? 'text-red-700' : 'text-green-700'} font-semibold">
                    Valid till: ${LMS.formatDate(fin?.paidUntil)} (${fin?.paidMonths || 0} months)
                  </div>
                  
                  <!-- Shift Time -->
                  ${shift && html`
                    <div class="text-xs text-purple-600 font-semibold mt-1">
                      ${shift.name}: ${shift.startTime} - ${shift.endTime}
                    </div>
                  `}
                </div>
              ` : html`
                <!-- Available Seat -->
                <div class="text-center mt-8">
                  <p class="text-sm text-gray-600 italic">Available</p>
                  <p class="text-purple-600 underline text-sm font-semibold mt-1">Click to assign student</p>
                </div>
              `}
            </div>
          `;
    })}
      </div>
    `}

    <!-- Add Hall Modal -->
    <${Modal} isOpen=${showHallForm} onClose=${() => setShowHallForm(false)} title="Add New Hall" size="sm">
      <div class="space-y-4">
        <${Input} label="Hall Name" value=${newHall.name} onChange=${e => setNewHall(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Hall C" />
        <${Input} label="Number of Seats" type="number" value=${newHall.seatCount} onChange=${e => setNewHall(p => ({ ...p, seatCount: Number(e.target.value) }))} min="1" />
        <div class="flex gap-3" style=${{ justifyContent: 'flex-end' }}>
          <${Button} variant="secondary" onClick=${() => setShowHallForm(false)}>Cancel</${Button}>
          <${Button} onClick=${addHall}>Add Hall</${Button}>
        </div>
      </div>
    </${Modal}>

    <!-- View Student Modal (Detailed) -->
    <${Modal} isOpen=${!!viewStudent} onClose=${() => setViewStudent(null)} title=${`Student Detail: ${viewStudent?.name || ''}`} size="xl">
      ${viewStudent && html`<${LMS.StudentDetailView} student=${viewStudent} onReleaseSeat=${() => releaseSeat(viewStudent)} />`}
    </${Modal}>

    <!-- Assign Student to Seat Modal -->
    <${Modal} isOpen=${assignSeatModal.open} onClose=${() => { setAssignSeatModal({ open: false, seatId: null, seatLabel: null }); setStudentSearch(''); }} title=${`Assign Student to Seat ${assignSeatModal.seatLabel || ''}`} size="md">
      <div class="space-y-4">
        <input 
          type="text" 
          class="input-field" 
          placeholder="Search student by name or roll..." 
          value=${studentSearch}
          onInput=${e => setStudentSearch(e.target.value)}
        />
        <div class="max-h-64 overflow-y-auto space-y-2">
          ${getUnassignedStudents().length > 0 ? getUnassignedStudents().map(s => html`
            <div 
              key=${s.id}
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-purple-50 cursor-pointer border"
              onClick=${() => assignStudentToSeat(s, assignSeatModal.seatId)}
            >
              <div class="flex items-center gap-3">
                ${s.photo
        ? html`<img src=${s.photo} alt=${s.name} class="w-10 h-10 rounded-full object-cover" />`
        : html`<div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-700">${(s.name || '?').charAt(0).toUpperCase()}</div>`
      }
                <div>
                  <p class="font-bold text-gray-800">${s.name}</p>
                  <p class="text-sm text-purple-600">Roll: ${s.rollNo}</p>
                </div>
              </div>
              <span class="text-purple-500 font-semibold">Assign →</span>
            </div>
          `) : html`<p class="text-gray-500 text-center py-4">No unassigned students found</p>`}
        </div>
      </div>
    </${Modal}>
  </div>`;
};

// Detailed Student View Component (matching pic 3 exactly)
LMS.StudentDetailView = ({ student, onReleaseSeat }) => {
  const { payments, setPayments, shifts, halls, setStudents, showToast, addLog } = useContext(LMS.AppContext);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const { Button, Modal } = LMS;

  const fin = LMS.calculateStudentFinancials(student, payments);
  const shift = shifts.find(s => s.id === student.shift);
  const studentPayments = payments.filter(p => p.studentId === student.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const seatLabel = student.seatLabel || LMS.formatSeatLabel(student.assignedSeat, halls);
  const totalPaid = studentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const handleDeactivate = () => {
    if (confirm('Deactivate ' + student.name + '?')) {
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, isActive: false, deactivatedAt: new Date().toISOString() } : s));
      addLog('Deactivated student: ' + student.name);
      showToast('Student deactivated!', 'success');
    }
  };

  const handleReset = () => {
    if (confirm('Reset ' + student.name + '? This clears admission date and payments.')) {
      setStudents(prev => prev.map(s => s.id === student.id ? {
        ...s,
        admissionDate: new Date().toISOString().split('T')[0],
      } : s));
      addLog('Reset student: ' + student.name);
      showToast('Student reset!', 'success');
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
      addLog(`Deleted payment ₹${payment.amount} for ${student.name}`);
      showToast('Payment deleted!', 'success');
    }
  };

  const handleEditPayment = (payment) => {
    setEditPayment(payment);
    setShowPaymentForm(true);
  };

  return html`
    <div class="grid" style=${{ gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
      <!-- Left Column -->
      <div class="space-y-4">
        <!-- Photo & Basic Info -->
        <div class="text-center p-4 bg-gradient-to-b from-purple-50 to-transparent rounded-xl border">
          <div class="w-28 h-28 mx-auto rounded-full overflow-hidden border-4 shadow-xl mb-3" style=${{ borderColor: '#c4b5fd', background: '#e9d5ff' }}>
            ${student.photo
      ? html`<img src=${student.photo} class="w-full h-full object-cover" />`
      : html`<div class="w-full h-full flex items-center justify-center text-5xl font-black text-purple-600">${(student.name || '?').charAt(0).toUpperCase()}</div>`
    }
          </div>
          <h3 class="font-black text-xl text-gray-800">${student.name}</h3>
          <p class="font-bold text-purple-700">Roll No: <span class="text-red-500">${student.rollNo}</span></p>
          <p class="text-xs text-gray-400">Admitted on: ${LMS.formatDate(student.admissionDate)}</p>
        </div>

        <!-- Financial Status -->
        <div class="p-4 bg-card rounded-xl border-l-4 border-pink-500 shadow-sm">
          <h4 class="font-black text-pink-700 mb-3">Financial Status</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-gray-600">Monthly Fee:</span><span class="font-bold text-purple-600">₹${student.monthlyFee || 0}</span></div>
            <div class="flex justify-between"><span class="text-gray-600">Total Paid:</span><span class="font-bold text-green-600">₹${totalPaid.toLocaleString('en-IN')}</span></div>
            <div class="flex justify-between items-start">
              <span class="text-gray-600">Valid Till:</span>
              <span class="font-bold ${fin.totalDues > 0 ? 'text-red-600' : 'text-green-600'} text-right">${LMS.formatDate(fin.paidUntil)} (${fin.paidMonths} months)</span>
            </div>
            <div class="flex justify-between"><span class="text-gray-600">Due Since:</span><span class="font-bold text-gray-800">${fin.dueSince ? LMS.formatDate(fin.dueSince) : 'N/A'}</span></div>
            <div class="flex justify-between"><span class="text-gray-600">Total Dues:</span><span class="font-bold text-red-600">₹${fin.totalDues}</span></div>
            <div class="flex justify-between"><span class="text-gray-600">Days Overdue:</span><span class="font-bold text-red-500">${fin.daysDue || 0}</span></div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="space-y-2">
          <${Button} className="w-full text-white font-bold" style=${{ background: '#22c55e' }} onClick=${() => { setEditPayment(null); setShowPaymentForm(true); }}>ADD PAYMENT</${Button}>
          <${Button} className="w-full text-white font-bold" style=${{ background: '#6366f1' }}>EDIT DETAILS</${Button}>
          ${seatLabel && seatLabel !== 'N/A' && html`
            <${Button} className="w-full text-white font-bold" style=${{ background: '#ef4444' }} onClick=${onReleaseSeat}>RELEASE SEAT ${seatLabel}</${Button}>
          `}
          <${Button} className="w-full text-white font-bold" style=${{ background: '#f97316' }} onClick=${handleDeactivate}>DEACTIVATE STUDENT</${Button}>
          <${Button} className="w-full text-white font-bold" style=${{ background: '#8b5cf6' }} onClick=${handleReset}>RESET STUDENT</${Button}>
        </div>
      </div>

      <!-- Right Column -->
      <div class="space-y-4">
        <!-- General Information -->
        <div class="p-4 bg-card rounded-xl shadow-sm border">
          <h4 class="font-black text-purple-700 text-lg mb-4">General Information</h4>
          <div class="grid grid-2 gap-4 text-sm">
            <div class="p-2 bg-gray-50 rounded"><span class="text-gray-500">Assigned Seat:</span> <span class="font-bold text-purple-600">${seatLabel}</span></div>
            <div class="p-2 bg-gray-50 rounded"><span class="text-gray-500">Current Shift:</span> <span class="font-bold text-pink-600">${shift?.name || 'N/A'}</span> ${shift ? `(${shift.startTime} - ${shift.endTime})` : ''}</div>
            <div class="p-2 bg-gray-50 rounded"><span class="text-gray-500">Father's Name:</span> <span class="font-bold">${student.fatherName || 'N/A'}</span></div>
            <div class="p-2 bg-gray-50 rounded"><span class="text-gray-500">Aadhar:</span> <span class="font-bold">${student.aadhaar || 'N/A'}</span></div>
            <div class="p-2 bg-gray-50 rounded"><span class="text-gray-500">Student Mobile:</span> <span class="font-bold">${student.mobile || 'N/A'}</span></div>
            <div class="p-2 bg-gray-50 rounded"><span class="text-gray-500">Parent Mobile:</span> <span class="font-bold">${student.parentMobile || 'N/A'}</span></div>
            <div class="p-2 bg-gray-50 rounded col-span-2"><span class="text-gray-500">Admission Date:</span> <span class="font-bold">${LMS.formatDate(student.admissionDate)}</span></div>
          </div>
        </div>

        <!-- Payment History -->
        <div class="p-4 bg-card rounded-xl shadow-sm border">
          <h4 class="font-black text-pink-600 text-lg mb-4">Payment History</h4>
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
          ` : html`<p class="text-gray-400 italic">No payment history found.</p>`}
        </div>
      </div>
    </div>

    <!-- Payment Form Modal -->
    <${Modal} isOpen=${showPaymentForm} onClose=${() => { setShowPaymentForm(false); setEditPayment(null); }} title=${editPayment ? 'Edit Payment' : 'Add Payment'} size="md">
      <${LMS.PaymentForm} student=${student} payment=${editPayment} onClose=${() => { setShowPaymentForm(false); setEditPayment(null); }} />
    </${Modal}>
  `;
};
