// ==================== UTILS.JS - Utility Functions & Calculations ====================
window.LMS = window.LMS || {};

LMS.generateId = () => Math.random().toString(36).substr(2, 9);

LMS.formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

LMS.formatCurrency = (amount) => '₹' + Number(amount || 0).toLocaleString('en-IN');

LMS.currentTimeIST = () => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).format(new Date());
LMS.paymentTime = payment => {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(payment?.time || '')) return payment.time;
  // A date-only legacy receipt has no known payment time. Edit/sync timestamps
  // describe a different event and must never be presented as payment time.
  if (/T\d{2}:\d{2}/.test(payment?.date || '') && Number.isFinite(+new Date(payment.date))) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(payment.date));
  }
  return '';
};
LMS.formatPaymentDate = payment => {
  const date = payment?.date ? new Date(payment.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
  const time = LMS.paymentTime(payment);
  if (!time) return date;
  const [hours, minutes] = time.split(':').map(Number);
  return date + ' · ' + (hours % 12 || 12) + ':' + String(minutes).padStart(2, '0') + (hours < 12 ? ' AM' : ' PM');
};

// Record storage/import order is not chronological. Sort a copy before limiting it.
LMS.latestActivity = (logs, limit) => Object.values(logs || {})
  .filter(log => log && typeof log === 'object')
  .map((log, index) => {
    const timestamp = new Date(log.timestamp || 0).getTime();
    return { log, index, timestamp: Number.isFinite(timestamp) ? timestamp : 0 };
  })
  .sort((a, b) => b.timestamp - a.timestamp || a.index - b.index)
  .slice(0, limit)
  .map(item => item.log);

// Convert raw seat ID (e.g. "hallA-1" or "abc123-8") to readable format (e.g. "A1" or "A8")
LMS.hallSeatPrefix = hall => String(hall?.seatPrefix || hall?.name?.replace(/^Hall\s+/i, '').charAt(0) || 'A').toUpperCase();
LMS.orderedHalls = (halls = []) => halls.map((hall, index) => ({ hall, index }))
  .sort((a, b) => (Number.isInteger(a.hall.displayOrder) ? a.hall.displayOrder : a.index) - (Number.isInteger(b.hall.displayOrder) ? b.hall.displayOrder : b.index) || a.index - b.index)
  .map(item => item.hall);
// Display order uses seat numbers, never array positions as seat identities.
LMS.hallSeatNumbers = hall => {
  const count = Math.max(0, Math.min(2000, Math.trunc(Number(hall?.seatCount) || 0)));
  const seen = new Set(), order = [];
  const saved = Array.isArray(hall?.seatOrder) ? hall.seatOrder : [];
  for (const value of [...saved, ...Array.from({ length: count }, (_, i) => i + 1)]) {
    const number = Number(value);
    if (Number.isInteger(number) && number >= 1 && number <= count && !seen.has(number)) { seen.add(number); order.push(number); }
  }
  return order;
};
LMS.formatSeatLabel = (seatId, halls) => {
  if (!seatId) return 'N/A';
  const parts = seatId.split('-');
  if (parts.length < 2) return seatId;
  const hallId = parts.slice(0, -1).join('-');
  const seatNum = parts[parts.length - 1];
  const hall = (halls || []).find(h => h.id === hallId);
  // Extract sensible prefix: "Hall A" -> "A", "Physics" -> "P"
  const prefix = LMS.hallSeatPrefix(hall);
  return prefix + seatNum;
};

LMS.daysBetween = (date1, date2) => {
  const d1 = new Date(date1); d1.setHours(0, 0, 0, 0);
  const d2 = new Date(date2); d2.setHours(0, 0, 0, 0);
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
};

LMS.validateMobile = (m) => /^\d{10}$/.test(m);
LMS.validateAadhaar = (a) => /^\d{12}$/.test(a);

LMS.compressImage = (file, maxWidth = 200) => new Promise((resolve, reject) => {
  if (!file || !file.type?.startsWith('image/')) { reject(new Error('Choose an image file.')); return; }
  if (file.size > 10 * 1024 * 1024) { reject(new Error('Photo must be smaller than 10 MB.')); return; }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Cannot read this photo.'));
  reader.onload = event => {
    const image = new Image();
    image.onerror = () => reject(new Error('This photo cannot be decoded.'));
    image.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.3));
      } catch (error) { reject(error); }
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

LMS.getISTString = () => {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  }).format(new Date());
};

// The shared billing engine is loaded from finance.js.

// Convenience wrappers
LMS.getDueAmount = (student, payments) => LMS.calculateStudentFinancials(student, payments).totalDues;
LMS.getPaidUntilDate = (student, payments) => LMS.calculateStudentFinancials(student, payments).paidUntil || student.admissionDate;
LMS.getDaysDue = (student, payments) => LMS.calculateStudentFinancials(student, payments).daysDue;
LMS.getOverpaid = (student, payments) => LMS.calculateStudentFinancials(student, payments).overpaid;
LMS.getDueSince = (student, payments) => LMS.calculateStudentFinancials(student, payments).dueSince;

LMS.isShiftComplete = (student, shifts) => {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const shift = shifts.find(s => s.id === student.shift);
  if (!shift) return false;
  const [startH, startM] = shift.startTime.split(':').map(Number);
  const [endH, endM] = shift.endTime.split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;

  if (startMins < endMins) {
    return nowMins > endMins;
  } else {
    // overnight shift
    return endMins <= nowMins && nowMins < startMins;
  }
};

// Seat policies use explicit number lists. The version keeps an empty list empty
// after Firebase removes empty arrays; old halls remain fully reservable.
LMS.hallReservationPolicy = hall => {
  const numbers = LMS.hallSeatNumbers(hall);
  const open = new Set(Object.values(hall?.reservableSeats || {}).map(Number));
  const shareable = new Set(Object.values(hall?.sharedSeats || {}).map(Number));
  const reservable = hall?.reservationPolicyVersion === 1 ? numbers.filter(n => open.has(n)) : numbers;
  const shared = reservable.filter(n => shareable.has(n));
  return { reservable, shared };
};
LMS.withSeatPolicy = (hall, reservable, shared) => ({ ...hall, reservationPolicyVersion: 1,
  reservableSeats: [...new Set(reservable)].sort((a,b) => a-b),
  sharedSeats: [...new Set(shared)].filter(n => reservable.includes(n)).sort((a,b) => a-b) });
LMS.resolveSeat = (seatId, halls = [], includePolicy = true) => {
  if (!seatId) return null;
  const text = String(seatId);
  const canonical = halls.find(h => text.startsWith(h.id + '-') && /^\d+$/.test(text.slice(h.id.length + 1)));
  const number = canonical ? Number(text.slice(canonical.id.length + 1)) : Number(text.match(/\d+$/)?.[0]);
  const candidates = canonical ? [canonical] : halls.filter(h => text.toUpperCase() === LMS.hallSeatPrefix(h) + number);
  if (candidates.length !== 1 || !Number.isInteger(number) || number < 1 || number > Math.min(2000, Number(candidates[0].seatCount) || 0)) return null;
  const hall = candidates[0];
  if (!includePolicy) return { hall, number, id: hall.id + '-' + number };
  const policy = LMS.hallReservationPolicy(hall);
  return { hall, number, id: hall.id + '-' + number, reservable: policy.reservable.includes(number), shared: policy.shared.includes(number) };
};
LMS.seatOccupants = (seatId, students = [], halls = []) => {
  const seat = LMS.resolveSeat(seatId, halls, false);
  return students.filter(s => !s._deleted && s.isActive !== false && s.assignedSeat &&
    (seat ? LMS.resolveSeat(s.assignedSeat, halls, false)?.id === seat.id : s.assignedSeat === seatId));
};
LMS.shiftRanges = shift => {
  const minutes = value => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return null;
    const [h,m] = value.split(':').map(Number); return h * 60 + m;
  };
  const start = minutes(shift?.startTime), end = shift?.endTime === '24:00' ? 1440 : minutes(shift?.endTime);
  if (start === null || end === null) return null;
  if (start === end) return [[0,1440]];
  return start < end ? [[start,end]] : [[start,1440],[0,end]].filter(([a,b]) => a < b);
};
LMS.shiftsOverlap = (a,b) => {
  const aa = LMS.shiftRanges(a), bb = LMS.shiftRanges(b);
  return !aa || !bb || aa.some(([start,end]) => bb.some(([otherStart,otherEnd]) => start < otherEnd && otherStart < end));
};
LMS.seatAssignmentError = (seatId, candidate, students, halls, shifts) => {
  if (!seatId || candidate?.isActive === false) return '';
  const seat = LMS.resolveSeat(seatId, halls);
  if (!seat) return 'Select a valid seat. Legacy labels shared by multiple halls must be reassigned from the seat map.';
  if (!seat.reservable) return 'This seat is not open for reservation.';
  const others = LMS.seatOccupants(seatId, students, halls).filter(s => !candidate?.id || s.id !== candidate.id);
  if (!seat.shared) return others.length ? 'Seat already occupied by ' + others[0].name + '. Enable sharing in hall settings or choose another seat.' : '';
  const shift = shifts.find(s => s.id === candidate?.shift);
  if (!LMS.shiftRanges(shift)) return 'Select a shift with valid timings to reserve a shared seat.';
  const conflict = others.find(s => LMS.shiftsOverlap(shift, shifts.find(x => x.id === s.shift)));
  return conflict ? 'Seat already occupied during this shift by ' + conflict.name + '. Choose non-overlapping timings or another seat.' : '';
};
LMS.seatOpenShifts = (seatId, students, halls, shifts) => shifts.filter(shift =>
  LMS.shiftRanges(shift) && !LMS.seatAssignmentError(seatId, { shift: shift.id, isActive: true }, students, halls, shifts));
LMS.seatReservationStats = (halls = [], students = [], shifts = [], allHalls = halls) => {
  let totalSeats = 0, reservableSeats = 0, reservedSeats = 0, emptySeats = 0, sharedSeats = 0, sharedAvailable = 0, reservations = 0;
  const assigned = new Map();
  for (const student of students) {
    if (student._deleted || student.isActive === false || !student.assignedSeat) continue;
    const seat = LMS.resolveSeat(student.assignedSeat, allHalls, false);
    if (seat) { if (!assigned.has(seat.id)) assigned.set(seat.id, []); assigned.get(seat.id).push(student); }
  }
  for (const hall of halls) {
    const policy = LMS.hallReservationPolicy(hall); totalSeats += LMS.hallSeatNumbers(hall).length;
    reservableSeats += policy.reservable.length; sharedSeats += policy.shared.length;
    for (const n of policy.reservable) {
      const id = hall.id + '-' + n, occupants = assigned.get(id) || [];
      reservations += occupants.length;
      if (!occupants.length) emptySeats++;
      else { reservedSeats++; if (policy.shared.includes(n) && LMS.seatOpenShifts(id, occupants, allHalls, shifts).length) sharedAvailable++; }
    }
  }
  return { totalSeats, reservableSeats, reservedSeats, emptySeats, sharedSeats, sharedAvailable, reservations, availableSeats: emptySeats + sharedAvailable };
};
LMS.getSeatStatus = (seatId, students, payments, shifts, halls = []) => {
  const seat = LMS.resolveSeat(seatId, halls), occupants = LMS.seatOccupants(seatId, students, halls);
  const student = occupants.find(s => LMS.getDueAmount(s, payments) > 0) || occupants[0] || null;
  const status = !seat?.reservable ? 'blocked' : !student ? 'available' : LMS.getDueAmount(student, payments) > 0 ? 'due' : 'paid';
  return { status, student, occupants, shared: !!seat?.shared, reservable: !!seat?.reservable };
};

LMS.exportCSV = (students, shifts, payments) => {
  const headers = ['Roll No', 'Name', 'Father Name', 'Mobile', 'Parent Mobile', 'Aadhaar', 'Shift', 'Monthly Fee', 'Admission Date', 'Paid Until', 'Due Amount', 'Status'];
  const rows = students.map(s => {
    const shift = shifts.find(sh => sh.id === s.shift);
    const financials = LMS.calculateStudentFinancials(s, payments);
    return [s.rollNo, s.name, s.fatherName, s.mobile, s.parentMobile, s.aadhaar, shift?.name || '', s.monthlyFee, s.admissionDate, LMS.formatDate(financials.paidUntil), financials.totalDues, s.isActive ? 'Active' : 'Inactive'];
  });
  const csv = [headers, ...rows].map(r => r.map(c => '"' + String(c || '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'students_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
};

// ==================== DATA CLEANUP ====================
// Removes photos of students deactivated more than 90 days ago
LMS.cleanupStudentPhotos = (students) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 days ago

  let count = 0;
  const cleanedStudents = students.map(s => {
    // Check if inactive and deactivated more than 90 days ago
    if (!s.isActive && s.deactivatedAt && new Date(s.deactivatedAt) < cutoffDate) {
      // Check if they actually have photos to remove
      if (s.photo || s.formPhoto) {
        count++;
        return { ...s, photo: '', formPhoto: '' }; // Clear photos
      }
    }
    return s;
  });

  return { cleaned: cleanedStudents, count };
};

// ==================== INDEXED DB HELPERS (For Directory Handles) ====================
LMS.IDB = {
  dbName: 'LMS_DB',
  storeName: 'handles',
  version: 1,

  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async set(key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async get(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
};

