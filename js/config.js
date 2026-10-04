// ==================== CONFIG.JS - Constants & Defaults ====================
window.LMS = window.LMS || {};

LMS.DEACTIVATION_THRESHOLD_DAYS = 120;
LMS.HIGHLIGHT_THRESHOLD_DAYS = 90;

LMS.DEFAULT_OWNER = { username: 'admin' };

LMS.DEFAULT_SHIFTS = [
  { id: 'shift1', name: 'Morning', startTime: '06:00', endTime: '12:00' },
  { id: 'shift2', name: 'Evening', startTime: '12:00', endTime: '18:00' },
  { id: 'shift3', name: 'Night', startTime: '18:00', endTime: '00:00' },
];

LMS.DEFAULT_HALLS = [
  { id: 'hallA', name: 'Hall A', seatCount: 30 },
  { id: 'hallB', name: 'Hall B', seatCount: 16 },
  { id: 'hallC', name: 'Hall C', seatCount: 60 },
];

LMS.DEFAULT_ATTENDANCE_ALERTS = {
  enabled: true,
  days: 30,
  snoozeDays: 7,
  trackingStartedOn: '',
  excludeClosedDays: false,
  closedWeekdays: [],
  holidays: [],
  reminderTemplate: 'Hello {name} (Roll {roll}), we have no Present attendance recorded for you in the last {days} {dayType}. Please let us know when you will return to {library}. Last present: {lastPresent}.',
};

LMS.DEFAULT_SETTINGS = {
  libraryName: 'MAGADH LIBRARY',
  qrCode: '',
  attendanceAlerts: LMS.DEFAULT_ATTENDANCE_ALERTS,
  whatsappTemplate: 'Hello {name}, your fee of ₹{due} is pending since {dueDate}. Please pay soon. Roll: {roll}',
};
