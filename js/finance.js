// All balances use one cycle schedule: fee at cycle start, with no daily proration.
(() => {
  const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  LMS.today = (date = new Date()) => dateFormatter.format(date);
  LMS.parseDay = date => new Date(String(date).slice(0, 10) + 'T00:00:00+05:30');
  LMS.validDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const date = LMS.parseDay(value);
    return Number.isFinite(+date) && LMS.today(date) === value && value >= '1900-01-01' && value <= '2099-12-31';
  };
  LMS.inactivity = student => {
    const history = (student.inactivePeriods || []).map(x => ({ ...x }));
    if (student.isActive === false && student.deactivatedAt && !history.some(x => !x.end)) history.push({ start: LMS.today(new Date(student.deactivatedAt)), end: null });
    if (student.isActive === false && !student.deactivatedAt && !history.some(x => !x.end)) history.push({ start: LMS.DB.localLoad('_inactiveFirstSeen', {})[student.id] || LMS.today(), end: null });
    return history.sort((a, b) => a.start.localeCompare(b.start));
  };
  LMS.setStudentActive = (student, active) => {
    const day = LMS.today(), periods = LMS.inactivity(student);
    if (active) periods.forEach(x => { if (!x.end) x.end = day; });
    else if (!periods.some(x => !x.end)) periods.push({ start: day, end: null });
    return { ...student, isActive: active, inactivePeriods: periods, deactivatedAt: active ? null : new Date().toISOString(), ...(active ? {} : { assignedSeat: null }) };
  };
  LMS.feeCycleOptions = (student, day = LMS.today()) => {
    if (!LMS.validDate(student.admissionDate)) return { current: null, next: null };
    let cursor = student.admissionDate, anchor = Number(cursor.slice(8)), current = null;
    const periods = LMS.inactivity(student);
    for (let i = 0; i < 2400; i++) {
      for (const period of periods) {
        if (period.start <= cursor && (!period.end || cursor < period.end)) {
          if (!period.end) return { current, next: null };
          cursor = period.end; anchor = Number(cursor.slice(8));
        }
      }
      if (cursor > day) return { current, next: cursor };
      current = cursor;
      const [year, month] = cursor.split('-').map(Number);
      const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      cursor = LMS.today(new Date(Date.UTC(year, month, Math.min(anchor, last))));
    }
    return { current, next: null };
  };
  LMS.applyCycleFee = (student, fee, effectiveDate) => {
    if (!LMS.validDate(effectiveDate) || !Number.isFinite(Number(fee)) || Number(fee) <= 0) throw new Error('Choose a valid fee and billing cycle.');
    const history = student.feeChanges?.length ? student.feeChanges : [{ date: student.admissionDate, fee: Number(student.monthlyFee) }];
    // Keep earlier cycles intact; the selected rate replaces later rate instructions.
    return [...history.filter(change => String(change.date).slice(0, 10) < effectiveDate), { date: effectiveDate, fee: Number(fee) }];
  };
  const paymentIndexes = new WeakMap(), calculations = new WeakMap();
  LMS.allPayments = (payments, students) => {
    const map = new Map(payments.map(p => [p.id, p]));
    const deleted = LMS.DB.localLoad('_paymentDeletions', {});
    students.forEach(student => (student.pastHistory || []).forEach(history => (history.archivedPayments || []).forEach(p => {
      if (p.id && !map.has(p.id) && !deleted[p.id]) map.set(p.id, { ...p, archived: true, studentId: p.studentId || student.id, studentName: student.name, rollNo: student.rollNo });
    })));
    if (map.size === payments.length) return payments;
    return [...map.values()];
  };
  LMS.calculateStudentFinancials = (student, payments = []) => {
    const empty = { totalDues: 0, paidUntil: null, amountPaid: 0, overpaid: 0, dueSince: null, daysDue: 0, paidMonths: 0 };
    if (!student || !LMS.validDate(String(student.admissionDate || '').slice(0, 10))) return empty;
    const day = LMS.today();
    let cache = calculations.get(payments);
    if (!cache) { cache = new WeakMap(); calculations.set(payments, cache); }
    const hit = cache.get(student); if (hit?.day === day) return hit.value;
    let index = paymentIndexes.get(payments);
    if (!index) { index = new Map(); payments.forEach(p => { const group = index.get(p.studentId) || []; group.push(p); index.set(p.studentId, group); }); paymentIndexes.set(payments, index); }
    const received = (index.get(student.id) || []).filter(p => !p.archived && !p.voided && (!p.billingEpoch || p.billingEpoch === student.billingEpoch));
    const amountPaid = received.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0) + Math.max(0, Number(p.discount) || 0), 0);
    const periods = LMS.inactivity(student);
    const changes = (student.feeChanges?.length ? student.feeChanges : [{ date: student.admissionDate, fee: student.monthlyFee }])
      .filter(x => Number.isFinite(Number(x.fee)) && Number(x.fee) > 0 && Number.isFinite(+new Date(x.date)))
      .map(x => ({ ...x, day: String(x.date).length === 10 ? x.date : LMS.today(new Date(x.date)) })).sort((a, b) => a.day.localeCompare(b.day));
    if (!changes.length) return { ...empty, amountPaid };
    let cursor = student.admissionDate.slice(0, 10), anchor = Number(cursor.slice(8)), expected = 0, credit = amountPaid;
    let paidUntil = LMS.today(new Date(+LMS.parseDay(cursor) - 86400000)), paidMonths = 0, dueSince = null, allocationOpen = true;
    const advance = start => {
      const [year, month] = start.split('-').map(Number);
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return LMS.today(new Date(Date.UTC(year, month, Math.min(anchor, lastDay))));
    };
    const resume = start => {
      for (const period of periods) {
        if (period.start <= start && (!period.end || start < period.end)) {
          if (!period.end) return null;
          start = period.end; anchor = Number(start.slice(8));
        }
      }
      return start;
    };
    let feeIndex = 0;
    for (let i = 0; i < 2400; i++) {
      cursor = resume(cursor); if (!cursor) break;
      while (feeIndex + 1 < changes.length && changes[feeIndex + 1].day <= cursor) feeIndex++;
      const fee = Number(changes[feeIndex].fee);
      if (cursor <= day) expected += fee;
      const next = resume(advance(cursor));
      if (allocationOpen && credit + 0.000001 >= fee) {
        credit -= fee; paidMonths++;
        // An open inactive period has no known renewal date.
        paidUntil = LMS.today(new Date(+LMS.parseDay(next || advance(cursor)) - 86400000));
      } else { allocationOpen = false; if (cursor <= day && !dueSince) dueSince = cursor; }
      if (cursor > day && credit < fee || !next) break;
      cursor = next;
    }
    const dues = Math.round(Math.max(0, expected - amountPaid) * 100) / 100;
    const value = { totalDues: dues, paidUntil, amountPaid, overpaid: Math.round(Math.max(0, amountPaid - expected) * 100) / 100,
      dueSince: dues ? dueSince : null, daysDue: dues && dueSince ? Math.floor((+LMS.parseDay(day) - +LMS.parseDay(dueSince)) / 86400000) + 1 : 0, paidMonths };
    cache.set(student, { day, value }); return value;
  };
  LMS.validatePayment = (form, net) => {
    if (!form.studentId) return 'Select a student.';
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) return 'Fee must be greater than zero.';
    if (!Number.isInteger(Number(form.months)) || Number(form.months) < 1 || Number(form.months) > 120) return 'Months must be between 1 and 120.';
    if (!Number.isFinite(Number(form.discount)) || Number(form.discount) < 0 || Number(form.discount) > Number(form.amount) * Number(form.months)) return 'Discount cannot exceed the gross fee.';
    if (!Number.isFinite(Number(net)) || Number(net) < 0 || (Number(net) === 0 && Number(form.discount) === 0)) return 'Enter a valid net payment.';
    if (!LMS.validDate(form.date)) return 'Enter a valid payment date.';
    return '';
  };
  LMS.formatMessage = (template, student, settings, payments) => {
    const financials = LMS.calculateStudentFinancials(student, payments);
    const fields = { name: student.name, roll: student.rollNo, library: settings.libraryName, due: financials.totalDues, dueDate: LMS.formatDate(financials.dueSince) };
    return template.replace(/\{(name|roll|library|due|dueDate)\}/g, (_, name) => fields[name] ?? '');
  };
  LMS.safeAction = action => (...args) => {
    try { const result = action(...args); if (result?.catch) result.catch(error => LMS.DB.fail(error)); return result; }
    catch (error) { LMS.DB.fail(error); return false; }
  };
})();
