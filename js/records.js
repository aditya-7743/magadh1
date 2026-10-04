// Keep roll matches ahead of phones, even when the phone is an exact match.
LMS.studentSearchRank = (student, search) => {
  const query = String(search || '').trim().toLowerCase();
  if (!query) return 0;
  const match = (value, needle) => {
    const text = String(value ?? '').trim().toLowerCase();
    if (!text || !needle) return Infinity;
    return text === needle ? 0 : text.startsWith(needle) ? 1 : text.includes(needle) ? 2 : Infinity;
  };
  const roll = match(student.rollNo, query);
  if (Number.isFinite(roll)) return roll;
  const phoneQuery = /^[+\d\s()-]+$/.test(query) ? query.replace(/\D/g, '') : '';
  const phone = Math.min(...[student.mobile, student.parentMobile].map(value => match(String(value || '').replace(/\D/g, ''), phoneQuery)));
  if (Number.isFinite(phone)) return 3 + phone;
  const name = match(student.name, query);
  if (Number.isFinite(name)) return 6 + name;
  const other = match(student.fatherName, query);
  return Number.isFinite(other) ? 9 + other : Infinity;
};

// One ordering for payment previews and the full student ledger.
LMS.studentPaymentHistory = (studentId, payments = []) => {
  const time = value => { const parsed = value ? +new Date(value) : 0; return Number.isFinite(parsed) ? parsed : 0; };
  return payments.filter(payment => payment.studentId === studentId)
    .sort((a, b) => time(b.date) - time(a.date) || time(b._activityAt) - time(a._activityAt) || String(b.id || '').localeCompare(String(a.id || '')));
};

// Business activity is distinct from the revision timestamp refreshed by import/sync.
LMS.studentActivityIndex = (students, payments, deletedPayments = {}) => {
  const time = value => {
    const parsed = typeof value === 'number' ? value : value ? Date.parse(value) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const index = new Map(students.map(student => [student.id, {
    changedAt: time(student._activityAt),
    historicalAt: Math.max(time(student.admissionDate), time(student.deactivatedAt),
      ...(student.feeChanges || []).map(change => time(change.date)))
  }]));
  payments.forEach(payment => {
    const activity = index.get(payment.studentId);
    if (!activity) return;
    activity.changedAt = Math.max(activity.changedAt, time(payment._activityAt));
    activity.historicalAt = Math.max(activity.historicalAt, time(payment.date));
  });
  Object.values(deletedPayments).forEach(payment => {
    const activity = index.get(payment?.studentId);
    if (activity) activity.changedAt = Math.max(activity.changedAt, time(payment._activityAt));
  });
  return index;
};

// Merge references together; retain every source record for inspecting historical differences.
LMS.mergeDuplicateStudents = (students, payments, attendance) => {
  const groups = new Map(), replacements = new Map(), merged = new Map();
  students.forEach(student => {
    const roll = String(student.rollNo || '').trim().toUpperCase();
    if (!roll) return;
    const group = groups.get(roll) || []; group.push(student); groups.set(roll, group);
  });
  let count = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => String(b.admissionDate || '').localeCompare(String(a.admissionDate || '')) || a.id.localeCompare(b.id));
    const winner = group[0], losers = group.slice(1);
    losers.forEach(loser => { replacements.set(loser.id, winner.id); count++; });
    const history = group.flatMap(student => student.pastHistory || []);
    merged.set(winner.id, { ...winner, pastHistory: history,
      mergedRecords: [...(winner.mergedRecords || []), ...losers],
      photo: winner.photo || losers.find(s => s.photo)?.photo || '',
      formPhoto: winner.formPhoto || losers.find(s => s.formPhoto)?.formPhoto || '' });
  }
  const days = JSON.parse(JSON.stringify(attendance));
  Object.values(days).forEach(day => replacements.forEach((id, oldId) => {
    if (day[oldId] !== undefined && day[id] === undefined) day[id] = day[oldId];
    // Preserve conflicting historical marks as reference metadata.
    if (day[oldId] !== undefined && day[id] !== day[oldId]) day['merged_' + oldId] = { sourceId: oldId, studentId: id, status: day[oldId], merged: true };
    delete day[oldId];
  }));
  return { count, students: students.filter(s => !replacements.has(s.id)).map(s => merged.get(s.id) || s),
    payments: payments.map(p => replacements.has(p.studentId) ? { ...p, originalStudentId: p.studentId, studentId: replacements.get(p.studentId), billingEpoch: merged.get(replacements.get(p.studentId)).billingEpoch || null } : p), attendance: days };
};
