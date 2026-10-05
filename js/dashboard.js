// ==================== DASHBOARD.JS - Dashboard with QR & Task Manager ====================
window.LMS = window.LMS || {};

LMS.LiveClock = () => {
  const [clock, setClock] = useState(LMS.getISTString());
  useEffect(() => {
    const t = setInterval(() => setClock(LMS.getISTString()), 1000);
    return () => clearInterval(t);
  }, []);
  return html`<span class="mono text-sm text-gray-500">${clock}</span>`;
};

LMS.Dashboard = ({ setCurrentPage }) => {
  const { students, payments, halls, shifts, settings, activityLog, openNewAdmission, openStudent } = useContext(LMS.AppContext);
  const [showTodayCollection, setShowTodayCollection] = useState(false);
  const [expandedDues, setExpandedDues] = useState({});
  const attendanceAlerts = LMS.useAttendanceAlerts();
  const attendanceNeedsAction = attendanceAlerts.rows.filter(row => row.status === 'needs').length;

  // OPTIMIZATION: Memoize heavy calculations to prevent lag on clock tick
  const stats = useMemo(() => {
    const active = students.filter(s => s.isActive);
    const seatStats = LMS.seatReservationStats(halls, students, shifts);

    // Today's collection
    const today = new Date().toDateString();
    const todayPayments = payments.filter(p => new Date(p.date).toDateString() === today);
    const collection = todayPayments.reduce((a, p) => a + (Number(p.amount) || 0), 0);

    return {
      activeCount: active.length,
      ...seatStats,
      occupiedSeats: seatStats.reservedSeats,
      todayCollection: collection
    };
  }, [students, halls, shifts, payments, LMS.today()]);

  const dueStats = useMemo(() => {
    const dueStudents = students.filter(s => s.isActive !== false && LMS.getDueAmount(s, payments) > 0);

    // Today overdue
    const todaysPending = dueStudents.filter(s => {
      const days = LMS.getDaysDue(s, payments);
      return days >= 0 && days <= 1;
    });

    // 3+ months due
    const threeMonth = dueStudents.filter(s => LMS.getDaysDue(s, payments) >= 90)
      .sort((a, b) => LMS.getDaysDue(b, payments) - LMS.getDaysDue(a, payments));

    // Past dues (last 7 days)
    const past = dueStudents.filter(s => {
      const days = LMS.getDaysDue(s, payments);
      return days >= 0 && days <= 7;
    }).sort((a, b) => LMS.getDaysDue(b, payments) - LMS.getDaysDue(a, payments));

    // Upcoming payments
    const todayDate = LMS.parseDay(LMS.today());

    const upcoming = students.filter(s => s.isActive !== false && LMS.getDueAmount(s, payments) <= 0).map(s => {
      const fin = LMS.calculateStudentFinancials(s, payments);
      const dueDate = fin.paidUntil ? LMS.attendanceAddDays(String(fin.paidUntil).slice(0, 10), 1) : null;
      const diff = dueDate ? Math.round((LMS.parseDay(dueDate) - todayDate) / 86400000) : NaN;
      return { student: s, daysLeft: diff, date: fin.paidUntil, dueDate };
    }).filter(x => x.daysLeft >= 0 && x.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    return { todaysPending, threeMonth, past, upcoming };
  }, [students, payments, LMS.today()]);

  // Destructure for JSX compatibility
  const { activeCount: activeStudents, totalSeats, reservableSeats, occupiedSeats, availableSeats, sharedAvailable, emptySeats, reservations, todayCollection } = stats;
  const { todaysPending: todaysPendingStudents, threeMonth: threeMonthDue, past: pastDues, upcoming: upcomingPayments } = dueStats;

  // Adapter functions to match old JSX usage
  const getPastDues = () => expandedDues.past ? pastDues : pastDues.slice(0, 8);
  const getUpcoming = () => expandedDues.upcoming ? upcomingPayments : upcomingPayments.slice(0, 8);

  const waMessage = (s) => {
    const fin = LMS.calculateStudentFinancials(s, payments);
    return `Dear ${s.name}, your library fee of ₹${fin.totalDues} is due since ${LMS.formatDate(fin.dueSince)}. Please pay at earliest. - ${settings.libraryName}`;
  };

  const { Card, Icons } = LMS;

  const recentLogs = useMemo(() => LMS.latestActivity(activityLog, 7), [activityLog]);

  const occupancy = reservableSeats ? Math.round(occupiedSeats / reservableSeats * 100) : 0;
  return html`<div class="dashboard-workspace">
    <div class="quick-actions-bar" role="group" aria-label="Quick actions"><span class="quick-actions-label">Quick actions</span>
      <button class="btn btn-primary quick-action quick-action-admission" onClick=${() => openNewAdmission ? openNewAdmission() : setCurrentPage('students')}><span class="quick-action-icon" aria-hidden="true"><${Icons.Add} /></span>Add student</button>
      <button class="btn btn-secondary quick-action quick-action-payment" onClick=${() => setCurrentPage('payments')}><span class="quick-action-icon" aria-hidden="true"><${Icons.Payments} /></span>Record payment</button>
      <button class="btn btn-secondary quick-action quick-action-attendance" onClick=${() => setCurrentPage('attendance')}><span class="quick-action-icon" aria-hidden="true"><${Icons.Check} /></span>Take attendance</button>
      <button class="btn btn-secondary quick-action quick-action-work" onClick=${() => setCurrentPage('activity')}><span class="quick-action-icon" aria-hidden="true"><${Icons.Log} /></span>Pending work</button>
    </div>
    <div class="metrics-grid">
      <div class="card metric-card metric-students"><div class="metric-top">Active students<span class="metric-icon"><${Icons.Students} /></span></div><div class="metric-value">${activeStudents}</div><div class="metric-foot">${students.length} students in your directory</div></div>
      <div class="card metric-card metric-occupied"><div class="metric-top">Reserved seats<span class="metric-icon"><${Icons.Seats} /></span></div><div class="metric-value">${occupiedSeats}<span style=${{fontSize:'14px',color:'var(--text-light)',fontWeight:400}}> / ${reservableSeats}</span></div><div class="metric-foot">${reservableSeats} reservable · ${reservations} student reservations</div></div>
      <div class="card metric-card metric-available"><div class="metric-top">Available for reservation<span class="metric-icon"><${Icons.Check} /></span></div><div class="metric-value">${availableSeats}</div><div class="metric-foot">${emptySeats} empty${sharedAvailable ? ' · ' + sharedAvailable + ' shared with a free shift' : ''}</div></div>
      <div class="card metric-card metric-collection"><div class="metric-top">Today's collection<button class="icon-button" style=${{minHeight:'28px',minWidth:'28px',padding:'5px',border:0}} aria-label=${showTodayCollection ? "Hide today's collection" : "Show today's collection"} onClick=${() => setShowTodayCollection(!showTodayCollection)}>${showTodayCollection ? html`<${Icons.Eye} />` : html`<${Icons.EyeOff} />`}</button></div><div class="metric-value">${showTodayCollection ? '₹' + todayCollection.toLocaleString('en-IN') : '••••'}</div><div class="metric-foot">${LMS.formatDate(LMS.today())}</div></div>
    </div>
    ${attendanceNeedsAction > 0 && html`<div class="attention-banner"><${Icons.Bell} /><span><strong>${attendanceNeedsAction} attendance follow-ups.</strong> No recent Present attendance recorded.</span><button onClick=${() => setCurrentPage('alerts')}>Review attendance →</button></div>`}
    <div class="dashboard-columns">
      <div class="dashboard-stack">
        <div class="card"><div class="section-heading"><div><h2>Space for every ambition</h2><p>Physical seats: ${totalSeats} · Shared seats: ${stats.sharedSeats}</p></div><button class="text-link" onClick=${() => setCurrentPage('seats')}>View seat map ↗</button></div>
          <div class="occupancy-summary"><strong>${occupancy}%</strong><span>of reservable seats reserved</span></div>
          <div class="occupancy-bar" role="progressbar" aria-label="Seat occupancy" aria-valuenow=${occupancy} aria-valuemin="0" aria-valuemax="100"><span style=${{width:occupancy + '%'}}></span></div>
          <div class="occupancy-legend"><span>● ${occupiedSeats} reserved</span><span>${availableSeats} open for reservation</span></div>
          <div class="hall-pills">${LMS.orderedHalls(halls).map(hall => html`<span key=${hall.id}>${hall.name}<b>${LMS.hallReservationPolicy(hall).reservable.length} reservable / ${hall.seatCount} physical</b></span>`)}</div>
        </div>
        <div class="dashboard-payment-panels">
          <div class="card"><div class="section-heading"><div><h2>Payment follow-ups <span class="count-badge">${pastDues.length}</span></h2><p>Recently due · last 7 days</p></div><button class="text-link" onClick=${() => setCurrentPage('dues')}>All dues ↗</button></div>
            <div class="dashboard-list">${getPastDues().length ? getPastDues().map(s => html`<div class="dashboard-list-row student-open-target" key=${s.id} tabIndex="0" onClick=${event => LMS.studentCardClick(event, s, openStudent)} onKeyDown=${event => LMS.studentCardKeyDown(event, s, openStudent)}><${LMS.StudentPhoto} student=${s} /><div class="dashboard-row-content"><strong>${s.name}</strong><small># ${s.rollNo} · ${LMS.getDaysDue(s, payments)} days overdue</small></div><span class="amount">₹${LMS.getDueAmount(s, payments).toLocaleString('en-IN')}</span>${(s.mobile || s.parentMobile) && html`<a class="icon-button" aria-label=${'WhatsApp reminder for ' + s.name} href=${'https://wa.me/91' + (s.mobile || s.parentMobile).replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(waMessage(s))} target="_blank" rel="noopener noreferrer"><${Icons.WhatsApp} /></a>`}</div>`) : html`<div class="quiet-empty">No payments due in the last 7 days.</div>`}</div>
          </div>
          <div class="card"><div class="section-heading"><div><h2>Coming up next <span class="count-badge">${upcomingPayments.length}</span></h2><p>Payment due · next 7 days</p></div><${Icons.Payments} /></div>
            <div class="dashboard-list">${getUpcoming().length ? getUpcoming().map(x => html`<div class="dashboard-list-row student-open-target" key=${x.student.id} tabIndex="0" onClick=${event => LMS.studentCardClick(event, x.student, openStudent)} onKeyDown=${event => LMS.studentCardKeyDown(event, x.student, openStudent)}><${LMS.StudentPhoto} student=${x.student} /><div class="dashboard-row-content"><strong>${x.student.name}</strong><small># ${x.student.rollNo} · Valid until ${LMS.formatDate(x.date)}</small></div><span class="status-pill inactive">${x.daysLeft < 0 ? 'Yesterday' : x.daysLeft === 0 ? 'Today' : x.daysLeft + ' days left'}</span></div>`) : html`<div class="quiet-empty">No memberships ending this week.</div>`}</div>
          </div>
        </div>
        ${(pastDues.length > 8 || upcomingPayments.length > 8) && html`<div class="dashboard-dues-more">${pastDues.length > 8 && html`<button class="text-link" onClick=${() => setExpandedDues(value => ({ ...value, past: !value.past }))}>${expandedDues.past ? 'Show fewer recent dues' : 'Show all ' + pastDues.length + ' recent dues'}</button>`}${upcomingPayments.length > 8 && html`<button class="text-link" onClick=${() => setExpandedDues(value => ({ ...value, upcoming: !value.upcoming }))}>${expandedDues.upcoming ? 'Show fewer upcoming dues' : 'Show all ' + upcomingPayments.length + ' upcoming dues'}</button>`}</div>`}
        <div class="card dashboard-long-dues"><div class="section-heading"><div><h2>Long pending payments <span class="count-badge">${threeMonthDue.length}</span></h2><p>90+ days overdue · Active students</p></div><button class="text-link" onClick=${() => setCurrentPage('dues')}>All dues ↗</button></div>
          <div class="dashboard-list">${threeMonthDue.length ? (expandedDues.long ? threeMonthDue : threeMonthDue.slice(0, 8)).map(student => html`<div class="dashboard-list-row student-open-target" key=${student.id} tabIndex="0" onClick=${event => LMS.studentCardClick(event, student, openStudent)} onKeyDown=${event => LMS.studentCardKeyDown(event, student, openStudent)}><${LMS.StudentPhoto} student=${student} /><div class="dashboard-row-content"><strong><span class="payments-roll">${student.rollNo}</span> ${student.name}</strong><small>${LMS.getDaysDue(student, payments)} days overdue${LMS.getDaysDue(student, payments) >= 120 ? ' · 120+ days' : ''}</small></div><span class="amount">${LMS.formatCurrency(LMS.getDueAmount(student, payments))}</span></div>`) : html`<div class="quiet-empty">No payments overdue by 90 days or more.</div>`}</div>
          ${threeMonthDue.length > 8 && html`<button class="text-link dashboard-dues-expand" onClick=${() => setExpandedDues(value => ({ ...value, long: !value.long }))}>${expandedDues.long ? 'Show fewer' : 'Show all ' + threeMonthDue.length + ' students'}</button>`}
        </div>
      </div>
      <div class="dashboard-stack">
        <div class="card"><div class="section-heading"><div><h2>Recent activity</h2><p>The latest updates in your workspace</p></div><button class="text-link" onClick=${() => setCurrentPage('activity')}>View all ↗</button></div>
          <div class="dashboard-list">${recentLogs.length ? recentLogs.map(log => html`<div class="dashboard-list-row" key=${log.id || log.timestamp}><span class="timeline-dot"></span><div class="dashboard-row-content"><strong>${log.action}</strong><small>${LMS.formatDate(log.timestamp)} · ${new Date(log.timestamp).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}</small></div></div>`) : html`<div class="quiet-empty">Your library updates will appear here.</div>`}</div>
        </div>
        <div class="card"><div class="qr-panel">${settings.qrCode ? html`<img src=${settings.qrCode} alt="Library payment QR code" />` : html`<span class="metric-icon" style=${{width:'56px',height:'56px',flexShrink:0}}><${Icons.Payments} /></span>`}<div><h3>Easy payments</h3><p>${settings.qrCode ? 'Scan this QR code to make a library payment.' : 'Add your payment QR code in Settings for quick access here.'}</p><button class="text-link" onClick=${() => setCurrentPage('settings')}>Payment settings ↗</button></div></div></div>
      </div>
    </div>
  </div>`;
};
