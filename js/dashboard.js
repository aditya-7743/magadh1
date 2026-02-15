// ==================== DASHBOARD.JS - Dashboard with QR & Task Manager ====================
window.LMS = window.LMS || {};

LMS.Dashboard = ({ setCurrentPage }) => {
  const { students, payments, halls, shifts, settings, activityLog } = useContext(LMS.AppContext);
  const [clock, setClock] = useState(LMS.getISTString());
  const [showTodayCollection, setShowTodayCollection] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setClock(LMS.getISTString()), 1000);
    return () => clearInterval(t);
  }, []);

  // OPTIMIZATION: Memoize heavy calculations to prevent lag on clock tick
  const stats = useMemo(() => {
    const active = students.filter(s => s.isActive);
    const totalSeats = halls.reduce((a, h) => a + h.seatCount, 0);
    const occupied = active.filter(s => s.assignedSeat).length;

    // Today's collection
    const today = new Date().toDateString();
    const todayPayments = payments.filter(p => new Date(p.date).toDateString() === today);
    const collection = todayPayments.reduce((a, p) => a + (p.amount || 0), 0);

    return {
      activeCount: active.length,
      totalSeats,
      occupiedSeats: occupied,
      availableSeats: totalSeats - occupied,
      todayCollection: collection
    };
  }, [students, halls, payments]);

  const dueStats = useMemo(() => {
    const dueStudents = students.filter(s => s.isActive && LMS.getDueAmount(s, payments) > 0);

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
    }).slice(0, 8);

    // Upcoming payments
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const upcoming = students.filter(s => s.isActive).map(s => {
      const paidUntil = new Date(LMS.getPaidUntilDate(s, payments));
      paidUntil.setHours(0, 0, 0, 0);
      const diff = Math.floor((paidUntil - todayDate) / (1000 * 60 * 60 * 24));
      return { student: s, daysLeft: diff, date: paidUntil };
    }).filter(x => x.daysLeft >= -1 && x.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 8);

    return { todaysPending, threeMonth, past, upcoming };
  }, [students, payments]);

  // Destructure for JSX compatibility
  const { activeCount: activeStudents, totalSeats, occupiedSeats, availableSeats, todayCollection } = stats;
  const { todaysPending: todaysPendingStudents, threeMonth: threeMonthDue, past: pastDues, upcoming: upcomingPayments } = dueStats;

  // Adapter functions to match old JSX usage
  const getPastDues = () => pastDues;
  const getUpcoming = () => upcomingPayments;

  const waMessage = (s) => {
    const fin = LMS.calculateStudentFinancials(s, payments);
    return `Dear ${s.name}, your library fee of ₹${fin.totalDues} is due since ${LMS.formatDate(fin.dueSince)}. Please pay at earliest. - ${settings.libraryName}`;
  };

  const { Card, Icons } = LMS;

  // Get recent activity logs (last 20)
  const recentLogs = (activityLog || []).slice(0, 20);

  return html`<div class="space-y-6 fade-in-up">
    <!-- Header with Library Name and Clock -->
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div>
        <h1 class="text-3xl font-black text-primary-gradient">${settings.libraryName}</h1>
        <span class="mono text-sm text-gray-500">${clock}</span>
      </div>
    </div>

    <!-- Quick Actions Card -->
    <${Card} className="border-l-4 border-indigo-500 hover:shadow-lg transition-all">
      <div class="flex items-center gap-2 mb-4">
        <span class="text-indigo-500 text-xl">⚡</span>
        <h3 class="font-bold text-indigo-800 text-lg">Quick Actions</h3>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick=${() => setCurrentPage('students')} class="p-4 bg-indigo-50 rounded-xl hover:bg-indigo-100 hover:scale-105 transition-all duration-200 flex flex-col items-center gap-2 group cursor-pointer border border-indigo-100">
          <div class="p-3 bg-card rounded-full text-indigo-600 shadow-sm group-hover:text-indigo-700"><${Icons.Add} /></div>
          <span class="font-semibold text-indigo-900 text-sm">Add Student</span>
        </button>
        <button onClick=${() => setCurrentPage('payments')} class="p-4 bg-green-50 rounded-xl hover:bg-green-100 hover:scale-105 transition-all duration-200 flex flex-col items-center gap-2 group cursor-pointer border border-green-100">
          <div class="p-3 bg-card rounded-full text-green-600 shadow-sm group-hover:text-green-700"><${Icons.Payments} /></div>
          <span class="font-semibold text-green-900 text-sm">Add Payment</span>
        </button>
        <button onClick=${() => setCurrentPage('attendance')} class="p-4 bg-orange-50 rounded-xl hover:bg-orange-100 hover:scale-105 transition-all duration-200 flex flex-col items-center gap-2 group cursor-pointer border border-orange-100">
          <div class="p-3 bg-card rounded-full text-orange-600 shadow-sm group-hover:text-orange-700"><${Icons.Check} /></div>
          <span class="font-semibold text-orange-900 text-sm">Attendance</span>
        </button>
        <button onClick=${() => setCurrentPage('activity')} class="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 hover:scale-105 transition-all duration-200 flex flex-col items-center gap-2 group cursor-pointer border border-gray-100">
          <div class="p-3 bg-card rounded-full text-gray-600 shadow-sm group-hover:text-gray-700"><${LMS.Icons.Log} /></div>
          <span class="font-semibold text-gray-900 text-sm">Pending Work</span>
        </button>
      </div>
    </${Card}>

    <!-- Top Row: Quick Totals, QR Code, Today's Collection -->
    <div class="grid md-grid-3 gap-4">
      <!-- Quick Totals Card -->
      <${Card} className="border-l-4 border-purple-500 hover:shadow-lg transition-all">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-purple-500">⊙</span>
          <h3 class="font-bold text-purple-800">Quick Totals</h3>
        </div>
        <p class="text-xs text-gray-400 mb-3">Overall seat availability and occupancy.</p>
        <div class="space-y-4">
          <div class="space-y-2">
            <div class="flex justify-between">
              <span class="text-gray-600">Total seats:</span>
              <span class="font-black text-purple-700 text-lg">${totalSeats}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Occupied:</span>
              <span class="font-black text-pink-600 text-lg">${occupiedSeats}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Available:</span>
              <span class="font-black text-green-600 text-lg">${availableSeats}</span>
            </div>
          </div>
          
          <!-- Sections / Shifts Breakdown -->
          <div class="pt-2 border-t border-gray-100">
            <h4 class="text-xs font-bold text-gray-400 uppercase mb-2">Sections (Shifts)</h4>
            <div class="grid grid-cols-2 gap-2 text-xs">
              ${shifts.map(shift => {
    const count = students.filter(s => s.isActive && s.shift === shift.id).length;
    return html`
                  <div class="flex justify-between bg-gray-50 px-2 py-1 rounded">
                    <span class="text-gray-600">${shift.name}</span>
                    <span class="font-bold text-indigo-600">${count}</span>
                  </div>
                `;
  })}
            </div>
          </div>
        </div>
      </${Card}>

      <!-- QR Code Card -->
      <${Card} className="hover:shadow-lg transition-all">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-yellow-600">✕</span>
          <h3 class="font-bold text-yellow-700">QR Code for Payment</h3>
        </div>
        ${settings.qrCode ? html`
          <img src=${settings.qrCode} alt="Payment QR" class="w-28 h-28 rounded-lg mx-auto cursor-pointer hover:scale-105 transition-transform" />
        ` : html`
          <p class="text-sm text-gray-400 italic">Upload QR code in <span class="text-yellow-600 underline cursor-pointer" onClick=${() => setCurrentPage('settings')}>Settings</span>.</p>
        `}
      </${Card}>

      <!-- Today's Collection Card -->
      <${Card} className="border-l-4 border-pink-500 hover:shadow-lg transition-all">
        <div class="flex justify-between items-center mb-2">
          <div class="flex items-center gap-2">
            <span class="text-pink-500">⟳</span>
            <h3 class="font-bold text-pink-700">Today's Collection</h3>
          </div>
          <button onClick=${() => setShowTodayCollection(!showTodayCollection)} class="btn btn-ghost btn-sm text-gray-400">
            ${showTodayCollection ? '👁️' : '🔒'}
          </button>
        </div>
        <div class="text-2xl font-black text-green-600 mb-2">
          ${showTodayCollection ? LMS.formatCurrency(todayCollection) : '🔒🔒🔒🔒🔒'}
        </div>
        ${todaysPendingStudents.length > 0 ? html`
          <p class="text-xs text-gray-500 mt-2">Students with Today's Pending Fees: (${todaysPendingStudents.length})</p>
          <ul class="mt-2 text-sm space-y-1 max-h-24 overflow-y-auto">
            ${todaysPendingStudents.slice(0, 5).map(s => html`
              <li key=${s.id} class="flex justify-between text-gray-700 border-b border-gray-100 py-1">
                <span>${s.rollNo} — ${s.name}</span>
                <span class="text-red-500 font-semibold">${LMS.formatCurrency(LMS.getDueAmount(s, payments))}</span>
              </li>
            `)}
          </ul>
        ` : html`<p class="text-xs text-gray-400 italic">No pending fees for today.</p>`}
      </${Card}>
    </div>

    <!-- Yellow Alert Bar: Students with 3+ Months Dues -->
    <div class="bg-gradient-to-r from-yellow-100 to-yellow-50 border border-yellow-400 rounded-xl p-4 hover:shadow-md transition-all">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-yellow-600">⚠</span>
        <h3 class="font-bold text-yellow-700">Students with 3+ Months Dues</h3>
      </div>
      ${threeMonthDue.length > 0 ? html`
        <div class="flex flex-wrap gap-2">
          ${threeMonthDue.slice(0, 10).map(s => html`
            <span key=${s.id} class="bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold animate-pulse">
              ${s.name} (${LMS.getDaysDue(s, payments)} days)
            </span>
          `)}
          ${threeMonthDue.length > 10 ? html`<span class="text-yellow-600 text-sm">+${threeMonthDue.length - 10} more</span>` : null}
        </div>
      ` : html`<p class="text-sm text-yellow-600 italic">No students with 3+ months dues. 🎉</p>`}
    </div>

    <!-- Task Manager Section -->
    <${Card}>
      <div class="flex items-center gap-2 mb-4">
        <span>📋</span>
        <h3 class="font-bold text-xl text-pink-700">Task Manager</h3>
      </div>
      <p class="text-xs text-gray-400 mb-4">Important reminders and pending actions.</p>
      
      <div class="grid md-grid-2 gap-6">
        <!-- Past Dues (Last 7 Days) -->
        <div class="bg-purple-50 p-4 rounded-xl border border-purple-200">
          <h4 class="font-bold text-purple-800 mb-3 flex items-center gap-2">
            <span>☰</span> Past Dues (Last 7 Days)
          </h4>
          ${getPastDues().length > 0 ? html`
            <ul class="space-y-2 text-sm max-h-40 overflow-y-auto">
              ${getPastDues().map(s => html`
                <li key=${s.id} class="flex justify-between items-center border-b border-purple-100 pb-2">
                  <div>
                    <span class="font-semibold text-purple-900">${s.name}</span>
                    <span class="text-purple-600 ml-1">(${LMS.formatCurrency(LMS.getDueAmount(s, payments))})</span>
                  </div>
                  <a href="https://wa.me/91${(s.mobile || s.parentMobile || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waMessage(s))}" 
                     target="_blank" class="text-green-600 hover:text-green-800 text-lg hover:scale-110 transition-transform">💬</a>
                </li>
              `)}
            </ul>
          ` : html`<p class="text-sm text-purple-600 italic">No overdue in last 7 days.</p>`}
        </div>

        <!-- Upcoming Payments (Next 7 Days) -->
        <div class="bg-pink-50 p-4 rounded-xl border border-pink-200">
          <h4 class="font-bold text-pink-800 mb-3 flex items-center gap-2">
            <span>⊙</span> Upcoming Payments (Next 7 Days)
          </h4>
          ${getUpcoming().length > 0 ? html`
            <ul class="space-y-2 text-sm max-h-40 overflow-y-auto">
              ${getUpcoming().map(x => html`
                <li key=${x.student.id} class="flex justify-between items-center border-b border-pink-100 pb-2">
                  <div>
                    <span class="font-semibold text-pink-900">${x.student.name}</span>
                    <span class="text-pink-600 ml-1">(${LMS.formatDate(x.date)})</span>
                  </div>
                  <span class="text-pink-700 font-bold text-xs bg-pink-200 px-2 py-1 rounded-full ${x.daysLeft === 0 ? 'animate-bounce' : ''}">
                    ${x.daysLeft === 0 ? 'Today!' : x.daysLeft + ' days'}
                  </span>
                </li>
              `)}
            </ul>
          ` : html`<p class="text-sm text-pink-600 italic">No upcoming payment reminders for the next 7 days.</p>`}
        </div>
      </div>
    </${Card}>

    <!-- Recent Activity Section -->
    <${Card}>
      <div class="flex items-center gap-2 mb-3">
        <span class="text-purple-500">↑</span>
        <h3 class="font-bold text-pink-700">Recent Activity</h3>
      </div>
      <p class="text-xs text-gray-400 mb-3">Last 20 operational logs.</p>
      ${recentLogs.length > 0 ? html`
        <div class="space-y-1 max-h-48 overflow-y-auto">
          ${recentLogs.map((log, i) => html`
            <div key=${i} class="flex justify-between items-center py-2 px-2 border-b border-gray-100 text-sm rounded hover:bg-gray-50 transition-colors" style=${{ background: i % 2 === 0 ? 'var(--bg-body)' : 'var(--bg-card)' }}>
              <span class="text-gray-700">${log.action || log}</span>
              <span class="text-gray-400 text-xs mono">${log.timestamp ? LMS.formatDate(log.timestamp) : ''}</span>
            </div>
          `)}
        </div>
      ` : html`<p class="text-sm text-gray-400 italic">No recent activity.</p>`}
    </${Card}>
  </div>`;
};
