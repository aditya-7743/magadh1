// ==================== CONFIG.JS - Constants & Defaults ====================
window.LMS = window.LMS || {};

LMS.DEACTIVATION_THRESHOLD_DAYS = 120;
LMS.HIGHLIGHT_THRESHOLD_DAYS = 90;

LMS.DEFAULT_OWNER = {
  username: 'admin',
  password: 'admin123',
  securityQuestion: 'What is your favorite color?',
  securityAnswer: 'blue',
};

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

LMS.DEFAULT_SETTINGS = {
  libraryName: 'My Study Library',
  qrCode: '',
  whatsappTemplate: 'Hello {name}, your fee of ₹{due} is pending since {dueDate}. Please pay soon. Roll: {roll}',
};
