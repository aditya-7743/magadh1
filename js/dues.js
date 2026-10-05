// Dues filters and collection actions live on their own page.
window.LMS = window.LMS || {};

LMS.Dues = () => {
  const { payments, students, setStudents, halls, settings, showToast, addLog, openStudent } = useContext(LMS.AppContext);
  const [paymentModal, setPaymentModal] = useState({ open: false, student: null });
  const [deactivateStudentId, setDeactivateStudentId] = useState(null);
  const [deactivatePassword, setDeactivatePassword] = useState('');
  const [deactivateError, setDeactivateError] = useState('');
  const [duesFilter, setDuesFilter] = useState({
    includeInactive: false,
    search: '',
    minAmount: '',
    maxAmount: '',
    dueSince: '',
    sortBy: 'dueSince',
    sortOrder: 'asc'
  });

  const { Button, Card, Modal, Input, Icons } = LMS;

  const deactivateStudent = students.find(student => student.id === deactivateStudentId);
  const closeDeactivate = () => {
    setDeactivateStudentId(null);
    setDeactivatePassword('');
    setDeactivateError('');
  };
  const handleDeactivate = (event) => {
    event.preventDefault();
    if (LMS.DB.switching) return;
    if (deactivatePassword !== '123') {
      setDeactivateError('Incorrect password. Please try again.');
      return;
    }
    if (!deactivateStudent || deactivateStudent._deleted || deactivateStudent.isActive === false) {
      closeDeactivate();
      showToast('This student is no longer active.', 'error');
      return;
    }
    // Apply the existing inactivity rule to the saved record, not the dues row's derived fields.
    setStudents(prev => prev.map(student => student.id === deactivateStudentId && student.isActive !== false && !student._deleted ? LMS.setStudentActive(student, false) : student));
    addLog('Deactivated student: ' + deactivateStudent.name + ' (from Dues List)');
    closeDeactivate();
    showToast('Student deactivated & seat released. Previous dues are retained.', 'success');
  };

  // Get all due students with financials
  const dueStudentsList = useMemo(() => {
    return students.filter(s => LMS.getDueAmount(s, payments) > 0)
      .map(s => {
        const fin = LMS.calculateStudentFinancials(s, payments);
        const seatLabel = s.assignedSeat ? LMS.formatSeatLabel(s.assignedSeat, halls) : null;
        return { ...s, totalDues: fin.totalDues, paidUntil: fin.paidUntil, dueSince: fin.dueSince, daysDue: fin.daysDue, seatLabel };
      });
  }, [students, payments, halls, LMS.today()]);

  // Apply filters and sorting
  const filteredDues = useMemo(() => {
    let filtered = dueStudentsList.filter(student => duesFilter.includeInactive || student.isActive !== false);

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
    const msg = LMS.formatMessage(template, student, settings, payments);
    return `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
  };

  return html`<div class="space-y-6">
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
        <div class="flex flex-wrap items-center gap-4 mt-4">
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
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked=${duesFilter.includeInactive} onChange=${event => setDuesFilter(previous => ({ ...previous, includeInactive: event.target.checked }))} />
            Show inactive students
          </label>
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
                <tr key=${s.id} class=${highlightClass + ' student-open-target'} tabIndex="0" onClick=${event => LMS.studentCardClick(event, s, openStudent)} onKeyDown=${event => LMS.studentCardKeyDown(event, s, openStudent)}>
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
                    <div class="dues-row-actions">
                      <button 
                        class="text-pink-600 hover:text-pink-800 font-semibold text-sm"
                        style=${{ background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick=${() => setPaymentModal({ open: true, student: s })}
                      >Collect</button>
                      ${waLink && html`
                        <a href=${waLink} target="_blank" class="text-green-500 hover:text-green-700 text-lg" title="Send WhatsApp reminder">💬</a>
                      `}
                      ${s.isActive === false
                        ? html`<span class="status-pill inactive">Inactive</span>`
                        : html`<${Button} size="sm" variant="secondary" className="dues-deactivate-button" onClick=${() => { setDeactivatePassword(''); setDeactivateError(''); setDeactivateStudentId(s.id); }}>Deactivate</${Button}>`}
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

    <${Modal} isOpen=${!!deactivateStudentId} onClose=${closeDeactivate} title="Deactivate student" size="sm">
      <form class="space-y-4" onSubmit=${LMS.safeAction(handleDeactivate)}>
        <div class="dues-deactivate-summary">
          <strong>${deactivateStudent?.name || 'Student'}</strong>
          <span>Roll: ${deactivateStudent?.rollNo || '—'}</span>
        </div>
        <p class="dues-deactivate-help">Their seat will be released and new fees will pause during inactivity. Previous dues and payment history will remain saved.</p>
        <${Input} label="Deactivation password" type="password" inputMode="numeric" autoComplete="off" autoFocus=${true} required value=${deactivatePassword} error=${deactivateError} onChange=${event => { setDeactivatePassword(event.target.value); setDeactivateError(''); }} />
        <div class="dues-deactivate-footer">
          <${Button} type="button" variant="secondary" onClick=${closeDeactivate}>Cancel</${Button}>
          <${Button} type="submit" variant="danger" disabled=${!deactivatePassword}>Deactivate student</${Button}>
        </div>
      </form>
    </${Modal}>

    <!-- Payment Modal -->
    <${Modal} isOpen=${paymentModal.open} onClose=${() => setPaymentModal({ open: false, student: null })} title="Collect Payment" size="md">
      ${paymentModal.student && html`<${LMS.PaymentForm} student=${paymentModal.student} onClose=${() => setPaymentModal({ open: false, student: null })} />`}
    </${Modal}>
  </div>`;
};

