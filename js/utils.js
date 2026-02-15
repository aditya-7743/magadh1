// ==================== UTILS.JS - Utility Functions & Calculations ====================
window.LMS = window.LMS || {};

LMS.generateId = () => Math.random().toString(36).substr(2, 9);

LMS.formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

LMS.formatCurrency = (amount) => '₹' + Number(amount || 0).toLocaleString('en-IN');

// Convert raw seat ID (e.g. "hallA-1" or "abc123-8") to readable format (e.g. "A1" or "A8")
LMS.formatSeatLabel = (seatId, halls) => {
  if (!seatId) return 'N/A';
  const parts = seatId.split('-');
  if (parts.length < 2) return seatId;
  const hallId = parts.slice(0, -1).join('-');
  const seatNum = parts[parts.length - 1];
  const hall = (halls || []).find(h => h.id === hallId);
  // Extract sensible prefix: "Hall A" -> "A", "Physics" -> "P"
  const prefix = hall ? hall.name.replace(/^Hall\s+/i, '').charAt(0).toUpperCase() : 'A';
  return prefix + seatNum;
};

LMS.daysBetween = (date1, date2) => {
  const d1 = new Date(date1); d1.setHours(0, 0, 0, 0);
  const d2 = new Date(date2); d2.setHours(0, 0, 0, 0);
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
};

LMS.validateMobile = (m) => /^\d{10}$/.test(m);
LMS.validateAadhaar = (a) => /^\d{12}$/.test(a);

LMS.compressImage = (file, maxWidth = 400) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = h * (maxWidth / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.4));
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

LMS.getISTString = () => {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  }).format(new Date());
};

// ==================== ADVANCED FINANCIAL CALCULATIONS ====================
// Ported from Library_Old.html - handles fee changes, overpayment, precise date math

LMS.calculateStudentFinancials = (student, payments) => {
  if (!student || !student.admissionDate || !student.monthlyFee || !student.isActive) {
    return { totalDues: 0, paidUntil: null, amountPaid: 0, overpaid: 0, dueSince: null, daysDue: 0, paidMonths: 0 };
  }

  const feeAmount = Number(student.monthlyFee);
  const admissionDate = new Date(student.admissionDate);
  const admissionDay = admissionDate.getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const limitDate = student.deactivatedAt ? new Date(student.deactivatedAt) : today;

  // Total amount paid (amount + discount from each payment)
  const studentPayments = (payments || []).filter(p => p.studentId === student.id);
  const currentPaidAmount = studentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0) + (Number(p.discount) || 0), 0);

  // Fee changes tracking — use original admission fee from history, NOT current monthlyFee
  // This ensures: when fee changes, past months keep old rate, only future uses new rate
  const storedChanges = student.feeChanges || [];
  let feeChanges;
  if (storedChanges.length > 0) {
    // Use stored history as-is — it already has the original admission fee and all changes
    // Add current fee as the latest entry if not already there
    const lastChange = storedChanges[storedChanges.length - 1];
    if (Number(lastChange.fee) !== feeAmount) {
      // Fee was changed but feeChanges wasn't updated yet (edge case)
      feeChanges = [...storedChanges, { date: new Date().toISOString(), fee: feeAmount }];
    } else {
      feeChanges = [...storedChanges];
    }
  } else {
    // No history — first time, use current fee as admission fee
    feeChanges = [{ date: admissionDate.toISOString(), fee: feeAmount }];
  }
  feeChanges.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate paidUntil by projecting payments forward
  let tempPaidAmount = currentPaidAmount;
  let currentCycleStart = new Date(admissionDate);
  currentCycleStart.setHours(0, 0, 0, 0);
  let paidMonths = 0;
  let feeChangeIndex = 0;
  let currentFee = feeChanges[0].fee;
  let paidUpToDate = new Date(admissionDate);
  paidUpToDate.setHours(0, 0, 0, 0);

  while (tempPaidAmount >= currentFee && currentFee > 0) {
    tempPaidAmount -= currentFee;
    let nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, admissionDay);
    let adjusted = false;
    if (nextCycleStart.getMonth() !== (currentCycleStart.getMonth() + 1) % 12) {
      nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 2, 0);
      adjusted = true;
    }

    while (feeChangeIndex < feeChanges.length - 1 && new Date(feeChanges[feeChangeIndex + 1].date) < nextCycleStart) {
      feeChangeIndex++;
      currentFee = feeChanges[feeChangeIndex].fee;
    }

    paidUpToDate = new Date(nextCycleStart);
    if (!adjusted) paidUpToDate.setDate(paidUpToDate.getDate() - 1);
    paidMonths++;
    currentCycleStart = nextCycleStart;

    if (paidMonths > 1200) break; // Safety: max 100 years
  }

  // Calculate totalExpectedDues up to limitDate
  let totalExpectedDues = 0;
  currentCycleStart = new Date(admissionDate);
  currentCycleStart.setHours(0, 0, 0, 0);
  feeChangeIndex = 0;
  currentFee = feeChanges[0].fee;
  let cycles = 0;

  while (currentCycleStart <= limitDate) {
    let nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, admissionDay);
    if (nextCycleStart.getMonth() !== (currentCycleStart.getMonth() + 1) % 12) {
      nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 2, 0);
    }

    while (feeChangeIndex < feeChanges.length - 1 && new Date(feeChanges[feeChangeIndex + 1].date) < nextCycleStart) {
      feeChangeIndex++;
      currentFee = feeChanges[feeChangeIndex].fee;
    }

    totalExpectedDues += currentFee;
    currentCycleStart = nextCycleStart;
    cycles++;
    if (cycles > 1200) break;
  }

  let remainingDues = totalExpectedDues - currentPaidAmount;
  const overpaid = remainingDues < 0 ? Math.abs(remainingDues) : 0;
  remainingDues = remainingDues > 0 ? remainingDues : 0;

  let dueSince = null;
  let daysDue = 0;
  if (remainingDues > 0) {
    let calculatedDueSince = new Date(paidUpToDate);
    calculatedDueSince.setDate(calculatedDueSince.getDate() + 1);
    if (calculatedDueSince <= limitDate) {
      dueSince = calculatedDueSince;
      daysDue = Math.floor((limitDate.getTime() - dueSince.getTime()) / (1000 * 3600 * 24)) + 1;
    } else {
      remainingDues = 0;
    }
  }

  return {
    totalDues: remainingDues,
    paidUntil: paidUpToDate.toISOString(),
    amountPaid: currentPaidAmount,
    overpaid,
    dueSince: dueSince ? dueSince.toISOString() : null,
    daysDue,
    paidMonths
  };
};

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

LMS.getSeatStatus = (seatId, students, payments, shifts) => {
  const student = students.find(s => s.assignedSeat === seatId && s.isActive);
  if (!student) return { status: 'available', student: null };

  const financials = LMS.calculateStudentFinancials(student, payments);

  if (LMS.isShiftComplete(student, shifts)) return { status: 'shift-done', student };
  if (financials.overpaid > 0) return { status: 'overpaid', student };
  if (financials.totalDues > 0) return { status: 'due', student };
  return { status: 'paid', student };
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

