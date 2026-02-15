// ==================== ATTENDANCE.JS - Attendance System ====================
window.LMS = window.LMS || {};

LMS.Attendance = () => {
  const { students, settings, setPendingWork, showToast, addLog } = useContext(LMS.AppContext);
  const [attendance, setAttendance] = useState(() => LMS.DB.localLoad('attendance') || {});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [attRoll, setAttRoll] = useState('');
  const [attStatus, setAttStatus] = useState(true);
  const { Button, Card, Input, Icons } = LMS;

  // Feature 2: History viewer state
  const [historyRoll, setHistoryRoll] = useState('');
  const [historyMonths, setHistoryMonths] = useState(3);

  // Auto-save attendance (Local only)
  useEffect(() => {
    LMS.DB.localSave('attendance', attendance);
    // ⚠️ CLOUD SYNC REMOVED HERE: We now use granular updates in mark/toggle functions
    // to prevent overwriting the entire attendance database.
  }, [attendance]);

  // Filter active students
  const activeStudents = useMemo(() => students.filter(s => s.isActive !== false), [students]);

  const getLastNDays = (n) => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  };

  const recentDates = getLastNDays(30);

  // Feature 1: Mark attendance — handles both registered & unregistered students
  const markAttendance = (e) => {
    e.preventDefault();
    if (!attRoll.trim()) { showToast('Please enter a roll number', 'error'); return; }

    const student = students.find(s => s.rollNo?.toLowerCase() === attRoll.toLowerCase());

    if (!student) {
      // Unregistered student — ask for name, mark attendance + add to pending work
      const studentName = prompt(`Student "${attRoll}" not found in system.\n\nEnter student name to mark attendance:`);
      if (!studentName || !studentName.trim()) return;

      // Mark attendance with unreg_ prefix
      const unregKey = 'unreg_' + attRoll.trim().toUpperCase();
      const attData = { status: attStatus, rollNo: attRoll.trim(), name: studentName.trim(), unregistered: true };

      setAttendance(prev => {
        const copy = { ...prev };
        if (!copy[selectedDate]) copy[selectedDate] = {};
        copy[selectedDate][unregKey] = attData;
        return copy;
      });

      // GRANULAR CLOUD SYNC
      if (LMS.DB.childSave) {
        LMS.DB.childSave('attendance', `${selectedDate}/${unregKey}`, attData);
      }

      // Also add to pending work
      const newWork = {
        id: LMS.generateId(),
        text: `Record Update: ${studentName.trim()} (Roll: ${attRoll.trim()}) - Attendance marked on ${LMS.formatDate(selectedDate)}`,
        date: new Date().toISOString(),
        completed: false
      };
      setPendingWork(prev => [newWork, ...prev]);
      addLog(`Attendance: ${studentName.trim()} (Unregistered, Roll: ${attRoll.trim()}) marked ${attStatus ? 'Present' : 'Absent'}`);
      showToast(`${studentName.trim()} marked ${attStatus ? 'Present' : 'Absent'} + Added to Pending Work`, 'success');
      setAttRoll('');
      return;
    }

    // Registered student — normal flow
    setAttendance(prev => {
      const copy = { ...prev };
      if (!copy[selectedDate]) copy[selectedDate] = {};
      copy[selectedDate][student.id] = attStatus;
      return copy;
    });

    // GRANULAR CLOUD SYNC
    if (LMS.DB.childSave) {
      LMS.DB.childSave('attendance', `${selectedDate}/${student.id}`, attStatus);
    }

    showToast(`Marked ${student.name} as ${attStatus ? 'Present' : 'Absent'}`, 'success');
    addLog(`Attendance: ${student.name} marked ${attStatus ? 'Present' : 'Absent'}`);
    setAttRoll('');
  };

  const toggleAttendance = (studentId) => {
    let newVal;
    setAttendance(prev => {
      const copy = { ...prev };
      if (!copy[selectedDate]) copy[selectedDate] = {};
      const current = copy[selectedDate][studentId];
      newVal = current === true ? false : current === false ? undefined : true;

      if (newVal === undefined) delete copy[selectedDate][studentId];
      else copy[selectedDate][studentId] = newVal;

      return copy;
    });

    // GRANULAR CLOUD SYNC
    if (LMS.DB.childSave) {
      if (newVal === undefined) {
        // If we could delete a child, we would, but setting to null works too in Firebase
        LMS.DB.childSave('attendance', `${selectedDate}/${studentId}`, null);
      } else {
        LMS.DB.childSave('attendance', `${selectedDate}/${studentId}`, newVal);
      }
    }
  };

  const getPresentCount = (date) => {
    const dayAtt = attendance[date] || {};
    let count = 0;
    Object.values(dayAtt).forEach(v => {
      if (v === true) count++;
      else if (typeof v === 'object' && v && v.status === true) count++;
    });
    return count;
  };

  const isDateComplete = (date) => {
    const dayAtt = attendance[date] || {};
    return Object.keys(dayAtt).length >= activeStudents.length;
  };

  const getStudentStatus = (studentId, date) => {
    const dayAtt = attendance[date] || {};
    if (dayAtt[studentId] === true) return 'Present';
    if (dayAtt[studentId] === false) return 'Absent';
    return 'Not Taken';
  };

  // Get unregistered students for a given date
  const getUnregisteredForDate = (date) => {
    const dayAtt = attendance[date] || {};
    const unregs = [];
    Object.entries(dayAtt).forEach(([key, val]) => {
      if (typeof val === 'object' && val && val.unregistered) {
        unregs.push({ key, ...val });
      }
    });
    return unregs;
  };

  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return activeStudents;
    const lower = searchTerm.toLowerCase();
    return activeStudents.filter(s =>
      s.rollNo?.toLowerCase().includes(lower) ||
      s.name?.toLowerCase().includes(lower) ||
      (s.mobile && s.mobile.includes(lower))
    );
  }, [activeStudents, searchTerm]);

  const attStudentName = attRoll ? students.find(s => s.rollNo?.toLowerCase() === attRoll.toLowerCase())?.name : '';

  // Feature 2: History helpers
  const historyStudent = useMemo(() => {
    if (!historyRoll.trim()) return null;
    return students.find(s => s.rollNo?.toLowerCase() === historyRoll.toLowerCase());
  }, [historyRoll, students]);

  const getMonthsData = useMemo(() => {
    if (!historyStudent) return [];
    const months = [];
    const now = new Date();
    for (let m = 0; m < historyMonths; m++) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthName = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const lastDay = m === 0 ? now.getDate() : daysInMonth;

      let present = 0, absent = 0, notTaken = 0;
      const days = [];
      for (let day = 1; day <= lastDay; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayAtt = attendance[dateStr] || {};
        let status = 'notTaken';
        if (dayAtt[historyStudent.id] === true) { status = 'present'; present++; }
        else if (dayAtt[historyStudent.id] === false) { status = 'absent'; absent++; }
        else { notTaken++; }
        days.push({ day, dateStr, status });
      }
      const total = present + absent;
      const pct = total > 0 ? Math.round((present / total) * 100) : 0;
      months.push({ monthName, days, present, absent, notTaken, total, pct });
    }
    return months;
  }, [historyStudent, historyMonths, attendance]);

  // Overall stats for history
  const overallStats = useMemo(() => {
    if (!getMonthsData.length) return null;
    let present = 0, absent = 0;
    getMonthsData.forEach(m => { present += m.present; absent += m.absent; });
    const total = present + absent;
    return { present, absent, total, pct: total > 0 ? Math.round((present / total) * 100) : 0 };
  }, [getMonthsData]);

  // Unregistered students for selected date
  const unregStudents = getUnregisteredForDate(selectedDate);

  return html`<div class="space-y-6">
    <h1 class="text-2xl font-bold text-primary-gradient">📋 Attendance Management</h1>

    <div class="grid md-grid-2 gap-6">
      <!-- Mark Attendance Card -->
      <${Card} className="card-primary">
        <h3 class="font-bold text-lg mb-4 text-primary-gradient">✍️ Mark Attendance</h3>
        <form onSubmit=${markAttendance} class="space-y-4">
          <${Input} label="Date" type="date" value=${selectedDate} onChange=${e => setSelectedDate(e.target.value)} />
          <${Input} label="Roll No." value=${attRoll} onChange=${e => setAttRoll(e.target.value)} placeholder="Enter roll number" />
          ${attRoll && attStudentName && html`<p class="text-sm font-semibold text-primary">Student: ${attStudentName}</p>`}
          ${attRoll && !attStudentName && attRoll.trim() && html`<p class="text-sm font-semibold text-amber-600">⚠ Not in system — will mark as unregistered</p>`}
          <div>
            <label class="input-label">Status</label>
            <select class="input-field" value=${attStatus} onChange=${e => setAttStatus(e.target.value === 'true')}>
              <option value="true">✓ Present</option>
              <option value="false">✗ Absent</option>
            </select>
          </div>
          <${Button} type="submit" variant="success" className="w-full">✓ Mark Attendance</${Button}>
        </form>
      </${Card}>

      <!-- Daily Summary Card -->
      <${Card} className="card-secondary">
        <h3 class="font-bold text-lg mb-4 text-secondary-gradient">📊 Daily Summary (Last 30 Days)</h3>
        <div class="max-h-96 overflow-y-auto space-y-2">
          ${recentDates.map(date => html`
            <div key=${date} class="flex justify-between items-center bg-gray-100 p-3 rounded-xl border hover:bg-gray-50 transition-colors">
              <span class="font-semibold">${LMS.formatDate(date)}</span>
              <div class="flex items-center gap-2">
                ${isDateComplete(date) ?
      html`<span class="text-green-600 text-lg">✓</span>` :
      html`<span class="text-red-600 text-lg">✗</span>`}
                <span class="text-sm text-gray-600 font-medium">Present: <span class="font-bold text-primary">${getPresentCount(date)}</span> / ${activeStudents.length}</span>
              </div>
            </div>
          `)}
        </div>
      </${Card}>
    </div>

    <!-- Student Grid -->
    <${Card}>
      <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h3 class="font-bold text-lg">👥 Students for ${LMS.formatDate(selectedDate)}</h3>
        <${Input} value=${searchTerm} onChange=${e => setSearchTerm(e.target.value)} placeholder="Search roll, name, mobile..." style=${{ maxWidth: '300px' }} />
      </div>
      
      <!-- Unregistered students (yellow badges) -->
      ${unregStudents.length > 0 && html`
        <div class="mb-4">
          <p class="text-xs font-bold text-amber-700 uppercase mb-2">⚠ Unregistered Students (Record Not Updated)</p>
          <div class="flex flex-wrap gap-2">
            ${unregStudents.map(u => html`
              <div key=${u.key} class="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 ${u.status ? 'bg-amber-50 border-amber-400' : 'bg-red-50 border-red-400'}">
                <div class="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center font-bold text-amber-800 text-xs">${(u.name || '?').charAt(0)}</div>
                <div>
                  <p class="font-bold text-xs">${u.rollNo}</p>
                  <p class="text-xs text-gray-600">${u.name}</p>
                </div>
                <span class="text-xs font-bold ${u.status ? 'text-green-600' : 'text-red-600'}">${u.status ? '✓' : '✗'}</span>
              </div>
            `)}
          </div>
        </div>
      `}

      <div class="grid grid-3 md-grid-4 xl-grid-5 gap-3">
        ${filteredStudents.map(s => {
        const status = getStudentStatus(s.id, selectedDate);
        const bgColor = status === 'Present' ? 'bg-green-100 border-green-500' :
          status === 'Absent' ? 'bg-red-100 border-red-500' :
            'bg-gray-100 border-gray-300';
        return html`
            <div key=${s.id} 
              class="p-3 rounded-xl border-2 cursor-pointer transition-all hover:scale-105 hover:shadow-lg ${bgColor}"
              onClick=${() => toggleAttendance(s.id)}>
              <div class="flex items-center gap-2 mb-1">
                ${s.photo
            ? html`<img src=${s.photo} class="w-8 h-8 rounded-full object-cover" />`
            : html`<div class="w-8 h-8 rounded-full bg-pink-200 flex items-center justify-center font-bold text-pink-700">${(s.name || '?').charAt(0)}</div>`
          }
                <p class="font-bold text-sm truncate">${s.rollNo}</p>
              </div>
              <p class="text-xs truncate text-gray-600">${s.name}</p>
              <p class="text-xs font-semibold mt-1 ${status === 'Present' ? 'text-green-600' : status === 'Absent' ? 'text-red-600' : 'text-gray-500'}">
                ${status === 'Present' ? '✓ Present' : status === 'Absent' ? '✗ Absent' : '○ Not Taken'}
              </p>
            </div>
          `;
      })}
      </div>
      ${filteredStudents.length === 0 && activeStudents.length === 0 && html`<p class="text-center py-8 text-gray-500">No students found. Add students first.</p>`}
      ${filteredStudents.length === 0 && activeStudents.length > 0 && html`<p class="text-center py-8 text-gray-500">No students match your search.</p>`}
    </${Card}>

    <!-- Feature 2: Attendance History Viewer -->
    <${Card} className="border-l-4 border-indigo-500">
      <h3 class="font-bold text-lg mb-4 text-indigo-700">📊 Student Attendance History</h3>
      
      <div class="flex items-end gap-3 flex-wrap mb-4">
        <div class="flex-1" style=${{ minWidth: '200px' }}>
          <${Input} label="Roll No." value=${historyRoll} onChange=${e => setHistoryRoll(e.target.value)} placeholder="Enter roll number to view history" />
        </div>
        ${historyStudent && html`
          <p class="text-sm font-bold text-indigo-600 pb-2">📌 ${historyStudent.name}</p>
        `}
        ${historyRoll.trim() && !historyStudent && html`
          <p class="text-sm font-bold text-red-500 pb-2">❌ Student not found</p>
        `}
      </div>

      ${historyStudent && html`
        <!-- Month filter buttons -->
        <div class="flex gap-2 mb-5">
          ${[3, 6, 12].map(m => html`
            <button key=${m}
              onClick=${() => setHistoryMonths(m)}
              class="px-4 py-2 rounded-lg font-bold text-sm transition-all ${historyMonths === m
          ? 'bg-indigo-600 text-white shadow-md'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
            >${m} Months</button>
          `)}
        </div>

        <!-- Month-wise cards -->
        <div class="space-y-4">
          ${getMonthsData.map(month => html`
            <div key=${month.monthName} class="p-4 bg-gray-50 rounded-xl border">
              <div class="flex justify-between items-center mb-3">
                <h4 class="font-bold text-gray-800">📅 ${month.monthName}</h4>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold ${month.pct >= 75 ? 'text-green-600' : month.pct >= 50 ? 'text-amber-600' : 'text-red-600'}">
                    ${month.pct}%
                  </span>
                  <span class="text-xs text-gray-500">(${month.present}/${month.total} days)</span>
                </div>
              </div>
              
              <!-- Progress bar -->
              <div class="w-full h-2 bg-gray-200 rounded-full mb-3 overflow-hidden">
                <div class="h-full rounded-full transition-all ${month.pct >= 75 ? 'bg-green-500' : month.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}" 
                  style=${{ width: month.pct + '%' }}></div>
              </div>

              <!-- Day grid -->
              <div class="flex flex-wrap gap-1">
                ${month.days.map(d => html`
                  <div key=${d.day} 
                    class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold cursor-default transition-all
                      ${d.status === 'present' ? 'bg-green-200 text-green-800' :
              d.status === 'absent' ? 'bg-red-200 text-red-800' :
                'bg-gray-200 text-gray-400'}"
                    title="${d.dateStr}: ${d.status === 'present' ? 'Present' : d.status === 'absent' ? 'Absent' : 'Not Taken'}"
                  >${d.day}</div>
                `)}
              </div>

              <!-- Legend for this month -->
              <div class="flex gap-4 mt-2 text-xs text-gray-500">
                <span>✅ Present: ${month.present}</span>
                <span>❌ Absent: ${month.absent}</span>
                <span>⚪ Not Taken: ${month.notTaken}</span>
              </div>
            </div>
          `)}
        </div>

        <!-- Overall Summary -->
        ${overallStats && html`
          <div class="mt-4 p-4 rounded-xl border-2 ${overallStats.pct >= 75 ? 'bg-green-50 border-green-400' : overallStats.pct >= 50 ? 'bg-amber-50 border-amber-400' : 'bg-red-50 border-red-400'}">
            <div class="flex justify-between items-center">
              <div>
                <h4 class="font-bold text-lg">Overall Attendance</h4>
                <p class="text-sm text-gray-600">Last ${historyMonths} months</p>
              </div>
              <div class="text-right">
                <p class="text-3xl font-bold ${overallStats.pct >= 75 ? 'text-green-600' : overallStats.pct >= 50 ? 'text-amber-600' : 'text-red-600'}">${overallStats.pct}%</p>
                <p class="text-sm text-gray-500">${overallStats.present}P / ${overallStats.absent}A out of ${overallStats.total} days</p>
              </div>
            </div>
          </div>
        `}
      `}

      ${!historyStudent && !historyRoll.trim() && html`
        <p class="text-center py-6 text-gray-400 text-sm">Enter a roll number above to view attendance history</p>
      `}
    </${Card}>
  </div>`;
};
