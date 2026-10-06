// ==================== SEATS.JS - Seat & Hall Management ====================
window.LMS = window.LMS || {};

// Daily seat presence is a display layer; the attendance history is never reset.
LMS.seatPresenceClock = (now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]));
  const seconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, active: seconds < 21 * 3600, nextChangeMs: ((seconds < 21 * 3600 ? 21 * 3600 : 24 * 3600) - seconds) * 1000 - now.getMilliseconds() + 25 };
};
LMS.useSeatPresence = () => {
  const [revision, update] = useState(0);
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer); update(n => n + 1);
      timer = setTimeout(refresh, LMS.seatPresenceClock().nextChangeMs);
    };
    const unsubscribe = LMS.DB.subscribe(key => { if (key === 'attendance' || key === 'scope') refresh(); });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => { clearTimeout(timer); unsubscribe(); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return useMemo(() => {
    const clock = LMS.seatPresenceClock();
    const day = clock.active ? LMS.DB.localLoad('attendance', {})[clock.day] || {} : {};
    return new Set(Object.entries(day).filter(([, value]) => value === true).map(([id]) => id));
  }, [revision, LMS.DB.scope]);
};


// The same capacity editor is used for new and existing halls.
LMS.HallCapacityFields = ({ hall, onChange }) => {
  const { Input } = LMS;
  const numbers = LMS.hallSeatNumbers(hall), policy = LMS.hallReservationPolicy(hall);
  const setCount = (field, value) => {
    const limit = field === 'reservable' ? numbers.length : policy.reservable.length;
    const count = Math.max(0, Math.min(limit, Math.trunc(Number(value) || 0)));
    const pool = field === 'reservable' ? numbers : policy.reservable;
    const chosen = [...new Set([...policy[field], ...pool])].slice(0, count);
    onChange(LMS.withSeatPolicy(hall, field === 'reservable' ? chosen : policy.reservable, field === 'shared' ? chosen : policy.shared));
  };
  const setMode = (number, mode) => {
    const reservable = policy.reservable.filter(n => n !== number), shared = policy.shared.filter(n => n !== number);
    if (mode !== 'closed') reservable.push(number);
    if (mode === 'shared') shared.push(number);
    onChange(LMS.withSeatPolicy(hall, reservable, shared));
  };
  return html`<div class="hall-capacity-fields">
    <div class="hall-capacity-inputs">
      <${Input} label="Total physical seats" type="number" min="1" max="2000" step="1" value=${hall.seatCount} onChange=${e => onChange({ ...hall, seatCount: e.target.value })} required />
      <${Input} label="Open for reservation" type="number" min="0" max=${numbers.length} step="1" value=${policy.reservable.length} onChange=${e => setCount('reservable', e.target.value)} />
      <${Input} label="Shared seats (within reservable)" type="number" min="0" max=${policy.reservable.length} step="1" value=${policy.shared.length} onChange=${e => setCount('shared', e.target.value)} />
    </div>
    <p class="hall-editor-note">Shared seats allow multiple students only when their shift timings do not overlap. Available seats are calculated automatically from active reservations.</p>
    <details class="hall-seat-policy"><summary>Choose which seats can be reserved or shared</summary>
      <p>Counts select seats in number order. Adjust individual seats below; their positions stay the same.</p>
      <div class="hall-policy-grid">${numbers.map(n => html`<label key=${n}><strong>${LMS.hallSeatPrefix(hall)}${n}</strong><select class="input-field" value=${policy.shared.includes(n) ? 'shared' : policy.reservable.includes(n) ? 'single' : 'closed'} onChange=${e => setMode(n,e.target.value)}><option value="closed">Not reservable</option><option value="single">Single student</option><option value="shared">Shared by shift</option></select></label>`)}</div>
    </details>
  </div>`;
};

// Graphical Seat Selector Component (Reusable)
LMS.SeatSelector = ({ onSelect, onClose, initialSeat, readOnly, selectionStudent }) => {
  const { halls, students, payments, shifts } = useContext(LMS.AppContext);
  const presentStudents = LMS.useSeatPresence();
  const orderedHalls = LMS.orderedHalls(halls);
  const [selectedHall, setSelectedHall] = useState(orderedHalls[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState('');

  // Update selected hall if needed
  useEffect(() => {
    if (initialSeat) {
      const seat = LMS.resolveSeat(initialSeat, halls);
      if (seat) setSelectedHall(seat.hall.id);
    } else if (!halls.some(h => h.id === selectedHall) && halls.length > 0) {
      setSelectedHall(orderedHalls[0].id);
    }
  }, [halls, initialSeat]);

  const currentHall = halls.find(h => h.id === selectedHall);
  const hallPrefix = LMS.hallSeatPrefix(currentHall);
  const seatCount = currentHall ? (Number(currentHall.seatCount) || 0) : 0;

  return html`
    <div class="space-y-4">
      <!-- Header: Tabs & Search -->
      <div class="flex flex-col gap-3">
        <div class="flex gap-2 overflow-x-auto pb-2">
          ${orderedHalls.map(hall => html`
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
        ${currentHall && seatCount > 0 ? LMS.hallSeatNumbers(currentHall).map(number => {
      const seatId = currentHall.id + '-' + number;
      const seatLabel = hallPrefix + number;
      const { status, student } = LMS.getSeatStatus(seatId, students, payments, shifts, halls);

      // Filter
      if (searchTerm && !seatLabel.toLowerCase().includes(searchTerm.toLowerCase())) return null;

      const isOccupied = !!student;
      const error = readOnly ? '' : LMS.seatAssignmentError(seatId, selectionStudent || {}, students, halls, shifts);
      const disabled = !readOnly && !!error;
      const occupants = LMS.seatOccupants(seatId, students, halls);
      const presentCount = occupants.filter(student => student.isActive !== false && presentStudents.has(student.id)).length;
      const seat = LMS.resolveSeat(seatId, halls);
      const isSelected = LMS.resolveSeat(initialSeat, halls)?.id === seatId;
      const hasDues = student && LMS.getDueAmount(student, payments) > 0;

      let style = {};

      if (isSelected) {
        style = { background: '#6653c5', borderColor: '#4935a6', color: '#fff' };
      } else if (isOccupied) {
        style = { background: hasDues ? 'var(--seat-due-bg)' : 'var(--seat-paid-bg)', borderColor: hasDues ? 'var(--seat-due-border)' : 'var(--seat-paid-border)' };
      } else {
        style = { background: 'var(--seat-available-bg)', borderColor: 'var(--seat-available-border)' };
      }

      return html`
            <div 
              key=${seatId}
              role="button" tabIndex=${readOnly || disabled ? -1 : 0} aria-disabled=${disabled} title=${error || (seat?.shared ? 'Shared seat · separate shifts' : 'Single student seat')} aria-label=${seatLabel + (error ? ' · ' + error : ' available')}
              onKeyDown=${e => { if (!readOnly && !disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect?.(seatId); } }}
              onClick=${() => !readOnly && !disabled && onSelect && onSelect(seatId)}
              class="seat-selector-tile border rounded-lg p-2 flex flex-col items-center justify-center gap-1 ${presentCount ? 'seat-has-presence' : ''} ${isSelected ? 'is-selected' : isOccupied ? (hasDues ? 'seat-is-due' : 'seat-is-paid') : 'seat-is-available'}"
              style=${style}
            >
              <span class="text-sm font-bold ${isSelected ? 'text-white' : (isOccupied ? 'text-gray-500' : 'text-blue-700')}">${seatLabel}</span>
              ${presentCount > 0 && html`<span class="seat-present-badge">✓ Present${occupants.length > 1 ? ' · ' + presentCount : ''}</span>`}
              <div class="seat-choice-status">
                <span>${isOccupied ? occupants.length + ' reserved' : seat?.reservable ? 'Free' : 'Not reservable'}</span>
                ${seat?.shared ? html`<strong class="seat-shared-badge">Shared</strong>` : isOccupied ? html`<span>· Single</span>` : null}
              </div>
              ${!readOnly && html`<small class="seat-choice-hint">${error ? error : 'Available for your shift'}</small>`}
            </div>
          `;
    }) : html`<div class="col-span-5 text-center text-gray-400 py-8">No seats in this hall</div>`}
      </div>
    </div>
  `;
};

LMS.SeatManagement = () => {
  const { halls, setHalls, students, setStudents, payments, shifts, addLog, showToast, openStudent } = useContext(LMS.AppContext);
  const presentStudents = LMS.useSeatPresence();
  const orderedHalls = LMS.orderedHalls(halls);

  const [showHallForm, setShowHallForm] = useState(false);
  const [newHall, setNewHall] = useState({ name: '', seatCount: 20 });
  const [viewStudent, setViewStudent] = useState(null);
  const [editStudent, setEditStudent] = useState(null);
  const [selectedHall, setSelectedHall] = LMS.useRouteParam('hall', orderedHalls[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [assignSeatModal, setAssignSeatModal] = useState({ open: false, seatId: null, seatLabel: null });
  const [studentSearch, setStudentSearch] = useState('');
  const [seatSelectorCb, setSeatSelectorCb] = useState(null);
  const { Button, Card, Modal, Input, Icons, SearchBar } = LMS;

  // Update selected hall when halls change
  useEffect(() => {
    if (!halls.some(h => h.id === selectedHall) && halls.length > 0) {
      setSelectedHall(orderedHalls[0].id);
    }
  }, [halls]);

  const [hallDraft, setHallDraft] = useState(null);
  const [hallPosition, setHallPosition] = useState(0);

  const editHall = hall => {
    const policy = LMS.hallReservationPolicy(hall);
    setHallDraft(LMS.withSeatPolicy({ ...hall, seatPrefix: LMS.hallSeatPrefix(hall) }, policy.reservable, policy.shared));
    setHallPosition(orderedHalls.findIndex(h => h.id === hall.id));
  };
  const saveHall = () => {
    const count = Number(hallDraft.seatCount), name = hallDraft.name.trim();
    if (!name || !Number.isInteger(count) || count < 1 || count > 2000) { showToast('Enter a hall name and 1–2000 seats', 'error'); return; }
    if (halls.some(h => h.id !== hallDraft.id && h.name.trim().toLowerCase() === name.toLowerCase())) { showToast('Another hall already uses this name.', 'error'); return; }
    const current = halls.find(h => h.id === hallDraft.id);
    if (!current) { showToast('This hall no longer exists. Close and reopen the editor.', 'error'); return; }
    const removed = new Set(LMS.hallSeatNumbers(current).filter(number => number > count).flatMap(number => [current.id + '-' + number, LMS.formatSeatLabel(current.id + '-' + number, halls)]));
    const assigned = students.filter(student => student.assignedSeat && removed.has(student.assignedSeat));
    if (assigned.length) {
      const seats = [...new Set(assigned.map(student => LMS.formatSeatLabel(student.assignedSeat, halls)))];
      showToast('Move or release students from ' + seats.slice(0, 6).join(', ') + (seats.length > 6 ? ' and other removed seats' : '') + ' before reducing the seat count.', 'error');
      return;
    }
    const policy = LMS.hallReservationPolicy(hallDraft);
    const updated = LMS.withSeatPolicy({ ...hallDraft, name, seatCount: count, seatOrder: LMS.hallSeatNumbers({ ...hallDraft, seatCount: count }) }, policy.reservable, policy.shared);
    const nextHalls = halls.map(h => h.id === updated.id ? updated : h);
    for (const student of students.filter(s => LMS.resolveSeat(s.assignedSeat, halls)?.hall.id === current.id)) {
      const error = LMS.seatAssignmentError(student.assignedSeat, student, students, nextHalls, shifts);
      if (error) { showToast(student.name + ': ' + error + ' Move or release this reservation before changing the hall.', 'error'); return; }
    }
    setHalls(prev => {
      const ordered = LMS.orderedHalls(prev).filter(h => h.id !== updated.id);
      ordered.splice(Math.max(0, Math.min(hallPosition, ordered.length)), 0, updated);
      return ordered.map((h, index) => h.displayOrder === index ? h : { ...h, displayOrder: index });
    });
    addLog('Updated hall: ' + name + ' (' + count + ' seats)');
    setHallDraft(null);
    showToast('Hall updated!', 'success');
  };
  const addHall = () => {
    if (!newHall.name.trim() || !Number.isInteger(Number(newHall.seatCount)) || Number(newHall.seatCount) < 1 || Number(newHall.seatCount) > 2000) { showToast('Enter a hall name and 1–2000 seats', 'error'); return; }
    if (halls.some(h => h.name.trim().toLowerCase() === newHall.name.trim().toLowerCase())) { showToast('Another hall already uses this name.', 'error'); return; }
    const newHallData = { ...newHall, name: newHall.name.trim(), seatCount: Number(newHall.seatCount), id: LMS.generateId(), displayOrder: Math.max(-1, ...halls.map((h, i) => Number.isInteger(h.displayOrder) ? h.displayOrder : i)) + 1 };
    setHalls(prev => [...prev, newHallData]);


    addLog('Added hall: ' + newHall.name);
    showToast('Hall added!', 'success');
    setNewHall({ name: '', seatCount: 20 });
    setShowHallForm(false);
    setSelectedHall(newHallData.id);
  };

  const [deletingHall, setDeletingHall] = useState(false);
  const removeHall = async (hall) => {
    if (deletingHall || !confirm('Delete ' + hall.name + '? Its seats will be released. Student and payment records will remain. Personal email verification is required.')) return;
    setDeletingHall(true);
    try {
      const accountsIdentity = await LMS.AccountAccess.proof();
      await LMS.DB.syncLocalToCloud();
      const result = await LMS.SqlApi.request('accounts/delete-hall', { method: 'POST', body: { hallId: hall.id }, accountsIdentity });
      await LMS.DB.pullSqlChanges();
      if (selectedHall === hall.id) setSelectedHall(halls.find(h => h.id !== hall.id)?.id || null);
      showToast('Hall deleted. ' + result.released + ' seat assignments released.', 'success');
    } catch (error) { showToast(error.message, 'error'); }
    finally { setDeletingHall(false); }
  };

  const releaseSeat = (student) => {
    const updatedStudent = { ...student, assignedSeat: '' };
    setStudents(prev => prev.map(s => s.id === student.id ? updatedStudent : s));


    addLog('Released seat for: ' + student.name);
    showToast('Seat released!', 'success');
    setViewStudent(null);
  };

  // Assign student to seat
  const assignStudentToSeat = (student, seatId) => {
    const error = LMS.seatAssignmentError(seatId, student, students, halls, shifts);
    if (error) { showToast(error, 'error'); return; }

    const updatedStudent = { ...student, assignedSeat: seatId };
    setStudents(prev => prev.map(s => s.id === student.id ? updatedStudent : s));


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
      return s.name?.toLowerCase().includes(term) || String(s.rollNo || '').toLowerCase().includes(term);
    });
  };

  const currentHall = halls.find(h => h.id === selectedHall);
  const hallPrefix = LMS.hallSeatPrefix(currentHall);

  // Count stats for current hall - ensure seatCount is a valid number
  const seatCount = currentHall ? (Number(currentHall.seatCount) || 0) : 0;
  const hallStats = LMS.seatReservationStats(currentHall ? [currentHall] : [], students, shifts, halls);

  return html`<div class="space-y-4">
    <!-- Header: Info + Search + Hall Tabs -->
    <div class="seat-toolbar card">
      <div>
        <p class="text-sm text-gray-600">
          Viewing <strong class="hall-current-name">${currentHall?.name || 'No hall selected'}</strong>. 
          Physical: <strong>${hallStats.totalSeats}</strong> · Reservable: <strong>${hallStats.reservableSeats}</strong> · Reserved: <strong>${hallStats.reservedSeats}</strong> · Available: <strong>${hallStats.availableSeats}</strong> · Shared: <strong>${hallStats.sharedSeats}</strong>
        </p>
      </div>
      ${currentHall && html`<div class="hall-edit-actions">
        <${Button} variant="secondary" size="sm" onClick=${() => editHall(currentHall)}><${Icons.Edit} />Edit hall</${Button}>
        <${Button} variant="danger" size="sm" disabled=${deletingHall} onClick=${() => removeHall(currentHall)}>${deletingHall ? 'Deleting…' : 'Delete hall'}</${Button}>
      </div>`}
      
      <div class="seat-toolbar-controls">
        <input 
          type="text"
          class="input-field"
          placeholder="Search seat, roll, name, or no."
          value=${searchTerm}
          onInput=${e => setSearchTerm(e.target.value)}
          style=${{ width: '240px' }}
        />
        
        <!-- Hall Tabs -->
        <div class="hall-tabs">
          ${orderedHalls.map(hall => html`
            <button 
              key=${hall.id}
              title=${'View ' + hall.name} onClick=${() => setSelectedHall(hall.id)}
              class="px-4 py-2 rounded-lg font-bold text-sm transition-all ${selectedHall === hall.id
      ? 'hall-tab active'
      : 'hall-tab'
    }"
            >
              ${hall.name}
            </button>
          `)}
          <button 
            onClick=${() => setShowHallForm(true)}
            class="btn btn-secondary btn-sm"
            title="Add New Hall"
          >+ Hall</button>
        </div>
      </div>
    </div>

    <div class="seat-colour-legend" aria-label="Seat colour guide">
      <span><i class="legend-available"></i>Available</span><span><i class="legend-paid"></i>Paid</span><span><i class="legend-due"></i>Payment due</span><span><i class="legend-shared"></i>Multiple students</span><span><i class="legend-blocked"></i>Not reservable</span>
    </div>
    <!-- Seat Cards Grid -->
    ${currentHall && seatCount > 0 && html`
      <div class="seat-card-grid">
        ${LMS.hallSeatNumbers(currentHall).map(number => {
          const seatId = currentHall.id + '-' + number, seatLabel = hallPrefix + number;
          const { status, occupants, shared, reservable } = LMS.getSeatStatus(seatId, students, payments, shifts, halls);
          const term = searchTerm.trim().toLowerCase();
          if (term && !seatLabel.toLowerCase().includes(term) && !occupants.some(s => [s.name,s.rollNo,s.mobile].some(v => String(v || '').toLowerCase().includes(term)))) return null;
          const openShifts = reservable && shared ? LMS.seatOpenShifts(seatId, students, halls, shifts) : [];
          const canAssign = reservable && (!occupants.length || (shared && openShifts.length > 0));
          const members = occupants.map(student => ({ student, shift: shifts.find(s => s.id === student.shift), fin: LMS.calculateStudentFinancials(student, payments) }));
          const daysDue = Math.max(0, ...members.map(({ fin }) => fin.daysDue));
          const presentCount = occupants.filter(student => student.isActive !== false && presentStudents.has(student.id)).length;
          return html`<article key=${seatId} class="seat-record reservation-seat ${presentCount ? 'seat-has-presence' : ''} ${members.length > 1 ? 'has-multiple-reservations' : ''} ${occupants.length === 1 ? 'student-open-target' : ''} ${!reservable ? 'seat-is-blocked' : status === 'due' ? 'seat-is-due' : occupants.length ? 'seat-is-paid' : 'seat-is-available'}" tabIndex=${occupants.length === 1 ? 0 : undefined} onClick=${event => occupants.length === 1 && LMS.studentCardClick(event, occupants[0], setViewStudent)} onKeyDown=${event => occupants.length === 1 && LMS.studentCardKeyDown(event, occupants[0], setViewStudent)}>
            <div class="reservation-seat-heading">
              <div class="reservation-seat-title"><strong class="seat-number">${seatLabel}</strong>${shared && reservable && html`<span class="seat-booking-type is-shared">Shared · ${occupants.length} reserved</span>`}</div>
              ${members.length <= 1 && html`<span class="status-pill ${!reservable ? 'inactive' : status === 'due' ? 'due' : occupants.length ? 'paid' : 'inactive'}">${!reservable ? 'Closed' : status === 'due' ? (daysDue ? daysDue + (daysDue === 1 ? ' Day Due' : ' Days Due') : 'Payment due') : occupants.length ? 'Paid' : 'Available'}</span>`}
            </div>
            ${presentCount > 0 && html`<div class="seat-presence-banner"><span class="seat-present-badge">✓ Present${members.length > 1 ? ' · ' + presentCount + '/' + members.length : ''}</span></div>`}
            ${occupants.length ? html`<div class="seat-reservations">${members.map(({ student, shift, fin }) => {
              return html`<div class="seat-reservation student-open-target ${members.length > 1 ? 'seat-member-box ' + (fin.totalDues > 0 ? 'member-has-dues' : 'member-paid') : ''}" key=${student.id} tabIndex=${members.length > 1 ? 0 : undefined} onClick=${event => LMS.studentCardClick(event, student, setViewStudent)} onKeyDown=${event => LMS.studentCardKeyDown(event, student, setViewStudent)}>
                <div class="seat-member-actions"><button class="seat-release-action" onClick=${() => releaseSeat(student)} aria-label=${'Release seat for ' + student.name}>Release</button>${members.length > 1 && html`<span class="seat-member-status ${fin.totalDues > 0 ? 'is-due' : 'is-paid'}">${fin.totalDues > 0 ? (fin.daysDue ? fin.daysDue + (fin.daysDue === 1 ? ' day due' : ' days due') : 'Payment due') : 'Paid'}</span>`}</div>
                <div class="seat-student-link">
                  ${members.length > 1 && presentStudents.has(student.id) && html`<span class="seat-present-badge seat-member-present">✓ Present</span>`}
                  <${LMS.StudentPhoto} student=${student} size="lg" className="seat-portrait" />
                  <span class="seat-member-details"><strong>${student.name}</strong><span class="seat-roll-badge">Roll: ${student.rollNo}</span><small class="seat-validity ${fin.totalDues > 0 ? 'is-due' : ''}">Valid till: ${LMS.formatDate(fin.paidUntil)} (${fin.paidMonths} ${fin.paidMonths === 1 ? 'month' : 'months'})</small><small class="seat-shift-time">${shift ? shift.name + ': ' + shift.startTime + ' – ' + shift.endTime : 'No shift assigned'}</small></span>
                </div>
              </div>`;
            })}</div>` : html`<p class="seat-empty-note">${reservable ? 'No active reservations' : 'Closed for reservations in hall settings'}</p>`}
            ${shared && reservable && html`<p class="seat-open-shifts">${openShifts.length ? 'Available: ' + openShifts.map(s => s.name + ' (' + s.startTime + '–' + s.endTime + ')').join(', ') : 'No configured shift is free'}</p>`}
            ${canAssign && html`<button class="btn btn-secondary seat-assign-action" onClick=${() => setAssignSeatModal({ open:true, seatId, seatLabel })}><${Icons.Add} />${occupants.length ? 'Add another shift' : 'Assign student'}</button>`}
          </article>`;
        })}
      </div>
    `}

    <${Modal} isOpen=${!!hallDraft} onClose=${() => setHallDraft(null)} title="Hall & reservation settings" size="lg">
      ${hallDraft && html`<form class="space-y-4" onSubmit=${LMS.safeAction(e => { e.preventDefault(); saveHall(); })}>
        <${Input} label="Hall name" value=${hallDraft.name} onChange=${e => setHallDraft(d => ({ ...d, name: e.target.value }))} required />
        <${LMS.HallCapacityFields} hall=${hallDraft} onChange=${setHallDraft} />
        <${LMS.Select} label="Hall tab position" value=${hallPosition} onChange=${e => setHallPosition(Number(e.target.value))} options=${orderedHalls.map((hall, index) => ({ value: index, label: (index + 1) + (index === 0 ? ' · First' : index === orderedHalls.length - 1 ? ' · Last' : '') }))} />
        <p class="hall-editor-note">Existing seat numbers (${LMS.hallSeatPrefix(hallDraft)}1, ${LMS.hallSeatPrefix(hallDraft)}2, …) stay the same when you rename this hall. Reducing the count removes the highest numbered seats; move or release their students first.</p>
        <div class="hall-editor-footer"><${Button} type="button" variant="secondary" onClick=${() => setHallDraft(null)}>Cancel</${Button}><${Button} type="submit">Save changes</${Button}></div>
      </form>`}
    </${Modal}>

    <!-- Add Hall Modal -->
    <${Modal} isOpen=${showHallForm} onClose=${() => setShowHallForm(false)} title="Add New Hall" size="lg">
      <div class="space-y-4">
        <${Input} label="Hall Name" value=${newHall.name} onChange=${e => setNewHall(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Hall C" />
        <${LMS.HallCapacityFields} hall=${newHall} onChange=${setNewHall} />
        <div class="flex gap-3" style=${{ justifyContent: 'flex-end' }}>
          <${Button} variant="secondary" onClick=${() => setShowHallForm(false)}>Cancel</${Button}>
          <${Button} onClick=${addHall}>Add Hall</${Button}>
        </div>
      </div>
    </${Modal}>

    <!-- View Student Modal (Detailed) -->
    <${Modal} isOpen=${!!viewStudent} onClose=${() => setViewStudent(null)} title="Student details" size="lg" className="student-detail-modal">
      ${viewStudent && html`<${LMS.StudentDetailView} 
         student=${viewStudent} 
         onReleaseSeat=${() => releaseSeat(viewStudent)} 
         onClose=${() => setViewStudent(null)}
         onEdit=${(s) => setEditStudent(s)}
      />`}
    </${Modal}>

    <!-- Edit Student Modal -->
    <${Modal} isOpen=${!!editStudent} onClose=${() => setEditStudent(null)} title="Edit Student" size="lg">
      ${editStudent && html`
        <div class="p-1">
          <${LMS.InlineStudentForm} 
            student=${editStudent}
            onSave=${(s) => {
               setStudents(prev => prev.map(old => old.id === s.id ? s : old));
               setEditStudent(null);
            }}
            onClear=${() => setEditStudent(null)}
            halls=${halls}
            shifts=${shifts}
            students=${students}
            payments=${payments}
            onOpenSeatSelector=${(callback, student) => setSeatSelectorCb({ select: callback, student })}
            className="" 
          />
        </div>
      `}
    </${Modal}>

    <${Modal} isOpen=${!!seatSelectorCb} onClose=${() => setSeatSelectorCb(null)} title="Select Seat" size="lg">
      <${LMS.SeatSelector} initialSeat=${seatSelectorCb?.student?.assignedSeat} selectionStudent=${seatSelectorCb?.student} onSelect=${seat => { seatSelectorCb?.select(seat); setSeatSelectorCb(null); }} />
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
          ${getUnassignedStudents().length > 0 ? getUnassignedStudents().map(s => { const error = LMS.seatAssignmentError(assignSeatModal.seatId, s, students, halls, shifts); const shift = shifts.find(x => x.id === s.shift); return html`
            <div 
              key=${s.id}
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-purple-50 cursor-pointer border"
              tabIndex="0" title="View student details" onKeyDown=${event => LMS.studentCardKeyDown(event, s, openStudent)} onClick=${event => LMS.studentCardClick(event, s, openStudent)}
            >
              <div class="flex items-center gap-3">
                <${LMS.StudentPhoto} student=${s} />
                <div>
                  <p class="font-bold text-gray-800">${s.name}</p>
                  <p class="text-sm text-purple-600"># ${s.rollNo} · ${shift?.name || 'No shift'} ${shift ? shift.startTime + '–' + shift.endTime : ''}</p><small>${error}</small>
                </div>
              </div>
              <${Button} size="sm" variant="secondary" disabled=${!!error} title=${error || 'Assign student'} onClick=${() => !error && assignStudentToSeat(s, assignSeatModal.seatId)}>${error ? 'Unavailable' : 'Assign →'}</${Button}>
            </div>
          `; }) : html`<p class="text-gray-500 text-center py-4">No unassigned students found</p>`}
        </div>
      </div>
    </${Modal}>
  </div>`;
};


