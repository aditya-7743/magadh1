// Firebase project configuration. Apply database.rules.json on the server before production use.
window.LMS = window.LMS || {};

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCnlCjW_YwafFJsj1abHFl5DiwxM1EmLUM",
  authDomain: "magadhlibrary-22d4f.firebaseapp.com",
  databaseURL: "https://magadhlibrary-22d4f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "magadhlibrary-22d4f",
  storageBucket: "magadhlibrary-22d4f.firebasestorage.app",
  messagingSenderId: "361371381370",
  appId: "1:361371381370:web:1f7a06f5b247ee117255c3"
};

LMS.DB = {
  // Export backup as JSON
  async exportBackup(allData) {
    const data = { ...allData, exportDate: new Date().toISOString(), version: '3.0' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `library_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
