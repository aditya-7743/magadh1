// ==================== ALERTS.JS - Attendance follow-ups ====================
window.LMS = window.LMS || {};

LMS.Alerts = () => {
  const { students, setStudents, settings, halls, shifts, addLog, showToast, openStudent, openAttendanceAlertSettings, pendingWork, setPendingWork } = useContext(LMS.AppContext);
  const { Button, Input, Modal, Icons } = LMS;
  const { rows, config, today } = LMS.useAttendanceAlerts();
  const [tab, setTab] = LMS.useRouteParam('tab', 'needs', ['needs', 'snooze', 'leave']);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);
  useEffect(() => { setVisibleCount(40); }, [tab, search]);
  const dayType = config.excludeClosedDays ? 'open days' : 'days';
  const tabs = [['needs', 'Needs action'], ['snooze', 'Remind later'], ['leave', 'On leave']];
  const counts = Object.fromEntries(tabs.map(([key]) => [key, rows.filter(row => row.status === key).length]));
  const query = search.trim().toLowerCase();
  const filtered = rows.filter(row => row.status === tab && [row.student.name, row.student.rollNo, row.student.mobile, LMS.formatSeatLabel(row.student.assignedSeat, halls)].some(value => String(value || '').toLowerCase().includes(query)));
  const selectedStudent = students.find(student => student.id === dialog?.studentId);
  const openAction = (student, mode) => {
    setDialog({ studentId: student.id, mode }); setError(''); setPassword('');
    setNote(''); setUntil(LMS.attendanceAddDays(today, mode === 'leave' ? 30 : config.snoozeDays));
  };
  const saveAction = event => {
    event.preventDefault();
    if (!selectedStudent || selectedStudent.isActive === false) { setError('This student is no longer active. Close this window to refresh the list.'); return; }
    if (dialog.mode === 'deactivate') {
      if (password !== '123') { setError('Incorrect password.'); return; }
      setStudents(previous => previous.map(student => student.id === selectedStudent.id ? LMS.setStudentActive(student, false) : student));
      addLog('Deactivated student from attendance alerts: ' + selectedStudent.name + ' (#' + selectedStudent.rollNo + ')');
      showToast('Student deactivated. Seat released; new fees paused.', 'success');
    } else {
      if (!LMS.validDate(until) || until <= LMS.today()) { setError('Choose a date after today.'); return; }
      setStudents(previous => previous.map(student => student.id === selectedStudent.id ? { ...student, attendanceAlert: {
        ...student.attendanceAlert, mode: dialog.mode, startedOn: LMS.today(), until, note: note.trim()
      } } : student));
      addLog((dialog.mode === 'leave' ? 'Planned leave' : 'Attendance reminder postponed') + ': ' + selectedStudent.name + ' until ' + LMS.formatDate(until) + (note.trim() ? ' — ' + note.trim() : ''));
      showToast(dialog.mode === 'leave' ? 'Planned leave saved.' : 'Reminder postponed.', 'success');
    }
    setDialog(null);
  };
  const restore = student => {
    setStudents(previous => previous.map(value => value.id === student.id ? { ...value, attendanceAlert: {
      ...value.attendanceAlert, mode: 'review', startedOn: LMS.today(), until: null
    } } : value));
    addLog('Restored attendance alert: ' + student.name);
    showToast('Moved to Needs action.', 'success');
  };
  const reminderLink = row => {
    let phone = String(row.student.mobile || row.student.parentMobile || '').replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    if (phone.length < 11 || phone.length > 15) return null;
    const values = { name: row.student.name, roll: row.student.rollNo, days: row.days, dayType, library: settings.libraryName, lastPresent: row.lastPresent ? LMS.formatDate(row.lastPresent) : 'No Present record found' };
    const message = config.reminderTemplate.replace(/\{(name|roll|days|dayType|library|lastPresent)\}/g, (_, key) => String(values[key] ?? ''));
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
  };
  const trackReminder = student => {
    setStudents(previous => previous.map(value => value.id === student.id ? { ...value, attendanceAlert: { ...value.attendanceAlert, lastReminderOpenedAt: new Date().toISOString() } } : value));
    addLog('Opened WhatsApp attendance reminder: ' + student.name + ' (#' + student.rollNo + ')');
  };
  return html`<div class="attendance-alerts-workspace">
    ${(pendingWork || []).some(work => !work.completed && work.unregisteredRoll) && html`<section class="card space-y-3"><h3 class="font-bold">Pending work · Unregistered attendance</h3><p>Add these students to the student register, then mark the task complete.</p>${pendingWork.filter(work => !work.completed && work.unregisteredRoll).map(work => html`<div key=${work.id} class="flex items-center justify-between gap-3"><span>${work.text}</span><${Button} size="sm" onClick=${() => setPendingWork(previous => previous.map(item => item.id === work.id ? { ...item, completed: true } : item))}>Done</${Button}></div>`)}</section>`}
    <div class="attendance-alert-heading"><div><h2>Attendance follow-ups</h2><p>No Present record for ${config.days} ${dayType} · Active students only</p></div><${Button} variant="secondary" onClick=${openAttendanceAlertSettings}><${Icons.Settings} />Alert settings</${Button}></div>
    ${!config.enabled ? html`<div class="card quiet-empty"><h3>Attendance alerts are turned off</h3><p>Enable them in Alert settings to see follow-ups.</p></div>` : html`
      <div class="attendance-alert-toolbar"><div class="attendance-alert-tabs" role="tablist" aria-label="Attendance follow-up status">${tabs.map(([key, label]) => html`<button key=${key} role="tab" aria-selected=${tab === key} class=${tab === key ? 'selected' : ''} onClick=${() => setTab(key)}>${label}<span>${counts[key]}</span></button>`)}</div><input class="input-field" aria-label="Search attendance alerts" placeholder="Search roll, name, phone or seat" value=${search} onChange=${event => setSearch(event.target.value)} /></div>
      <p class="attendance-alert-help">Present attendance clears the follow-up automatically. Remind later and planned leave only pause alerts.</p>
      <div class="attendance-alert-grid">${filtered.slice(0, visibleCount).map(row => {
        const student = row.student, shift = shifts.find(value => value.id === student.shift), url = reminderLink(row);
        return html`<article class=${'attendance-alert-card student-open-target alert-' + row.status} key=${student.id} tabIndex="0" aria-label=${'Student details: ' + student.name} onClick=${event => LMS.studentCardClick(event, student, openStudent)} onKeyDown=${event => LMS.studentCardKeyDown(event, student, openStudent)}>
          <div class="attendance-alert-person"><${LMS.StudentPhoto} student=${student} size="md" /><div><span class="payments-roll">${student.rollNo}</span><h3>${student.name}</h3><small>${student.assignedSeat ? LMS.formatSeatLabel(student.assignedSeat, halls) : 'No seat'} · ${shift?.name || 'No shift'}</small></div><span class="attendance-day-count"><strong>${row.days}</strong>${dayType}</span></div>
          <div class="attendance-alert-facts"><span>${row.lastPresent ? 'Last present' : 'No Present record found'}</span><strong>${LMS.formatDate(row.lastPresent || row.baseline)}</strong>${!row.lastPresent && html`<small>Tracking from this date; attendance may not have been recorded.</small>`}</div>
          ${row.status !== 'needs' && html`<p class="attendance-alert-state">${row.status === 'leave' ? 'Expected return: ' : 'Remind again: '}${LMS.formatDate(row.action.until)}</p>`}
          ${row.expired && html`<p class="attendance-alert-state">${row.action.mode === 'leave' ? 'Expected return date passed' : 'Reminder is due again'} · ${LMS.formatDate(row.action.until)}</p>`}
          ${row.action.note && html`<p class="attendance-alert-note">${row.action.note}</p>`}
          ${row.action.lastReminderOpenedAt && html`<small class="attendance-reminder-info">Reminder opened ${LMS.formatDate(row.action.lastReminderOpenedAt)} · ${new Date(row.action.lastReminderOpenedAt).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}</small>`}
          <div class="attendance-alert-actions">
            ${url ? html`<a class="btn attendance-reminder" href=${url} target="_blank" rel="noopener noreferrer" onClick=${event => { if (LMS.DB.switching) { event.preventDefault(); return; } trackReminder(student); }}><${Icons.WhatsApp} />Reminder</a>` : html`<${Button} variant="secondary" disabled=${true} title="Add a valid mobile number in student details">No mobile number</${Button}>`}
            <${Button} variant="secondary" size="sm" onClick=${() => openAction(student, 'snooze')}><${Icons.Bell} />Remind later</${Button}>
            <${Button} variant="secondary" size="sm" onClick=${() => openAction(student, 'leave')}><${Icons.Log} />Planned leave</${Button}>
            <${Button} variant="secondary" size="sm" className="attendance-deactivate" onClick=${() => openAction(student, 'deactivate')}>Deactivate</${Button}>
            ${row.status !== 'needs' && html`<${Button} variant="ghost" size="sm" onClick=${() => restore(student)}>Move to Needs action</${Button}>`}
          </div>
        </article>`;
      })}</div>
      ${filtered.length === 0 && html`<div class="card attendance-alert-empty"><${Icons.Check} /><h3>${query ? 'No matching students' : tab === 'needs' ? 'No attendance follow-ups due' : tab === 'leave' ? 'No students on planned leave' : 'No postponed reminders'}</h3><p>${query ? 'Try another roll number or name.' : 'Students appear here when they meet your attendance alert settings.'}</p></div>`}
      ${filtered.length > visibleCount && html`<${Button} variant="secondary" onClick=${() => setVisibleCount(value => value + 40)}>Show more (${filtered.length - visibleCount} remaining)</${Button}>`}
    `}
    <${Modal} isOpen=${!!dialog} onClose=${() => setDialog(null)} title=${dialog?.mode === 'deactivate' ? 'Deactivate student' : dialog?.mode === 'leave' ? 'Plan a leave' : 'Remind later / Ignore temporarily'} size="sm">
      ${dialog && html`<form class="attendance-alert-form" onSubmit=${LMS.safeAction(saveAction)}>
        <div class="dues-deactivate-summary"><strong>${selectedStudent?.name || 'Student unavailable'}</strong><span>Roll ${selectedStudent?.rollNo}</span></div>
        ${dialog.mode === 'deactivate' ? html`<p class="profile-help">Deactivation releases the seat and pauses new fees. Previous dues and payment history remain saved.</p><${Input} label="Deactivation password" type="password" autoComplete="off" autoFocus=${true} value=${password} onChange=${event => { setPassword(event.target.value); setError(''); }} />` : html`
          ${dialog.mode === 'snooze' && html`<div class="attendance-presets">${[7, 15, 30].map(days => html`<button type="button" key=${days} class=${until === LMS.attendanceAddDays(today, days) ? 'selected' : ''} onClick=${() => setUntil(LMS.attendanceAddDays(today, days))}>${days} days</button>`)}</div>`}
          <${Input} label=${dialog.mode === 'leave' ? 'Expected return date' : 'Show alert again on'} type="date" min=${LMS.attendanceAddDays(today, 1)} value=${until} onChange=${event => setUntil(event.target.value)} />
          <label>Note (optional)<textarea class="input-field" rows="3" maxLength="500" placeholder="For example: returning after exams" value=${note} onChange=${event => setNote(event.target.value)}></textarea></label>
          <p class="profile-help">${dialog.mode === 'leave' ? 'The alert returns after the expected return date if no Present attendance is recorded.' : 'The alert returns on this date if no Present attendance is recorded.'} Fees and seat reservation stay unchanged.</p>
        `}
        ${error && html`<p role="alert" class="attendance-form-error">${error}</p>`}
        <div class="dues-deactivate-footer"><${Button} variant="secondary" type="button" onClick=${() => setDialog(null)}>Cancel</${Button}><${Button} type="submit" variant=${dialog.mode === 'deactivate' ? 'danger' : 'primary'}>${dialog.mode === 'deactivate' ? 'Deactivate student' : 'Save'}</${Button}></div>
      </form>`}
    </${Modal}>
  </div>`;
};
