// ==================== SETTINGS.JS - Settings Page ====================
window.LMS = window.LMS || {};

LMS.Settings = ({ onLogout }) => {
  const { settings, setSettings, shifts, setShifts, students, setStudents, payments, setPayments, halls, setHalls, activityLog, addLog, showToast } = useContext(LMS.AppContext);
  const [owner, setOwner] = useState(LMS.DB.localLoad('owner') || LMS.DEFAULT_OWNER);
  const [newShift, setNewShift] = useState({ name: '', startTime: '', endTime: '' });

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    username: (LMS.DB.localLoad('owner') || LMS.DEFAULT_OWNER).username,
    current: '',
    new: '',
    confirm: ''
  });
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const { Button, Card, Modal, Input, Icons } = LMS;

  const qrStyle = { width: '60px', height: '60px', objectFit: 'contain' };
  const addBtnStyle = { height: '42px', marginTop: '2px' };
  const updateBtnStyle = { background: '#3b82f6' };
  const backupBtnStyle = { background: '#ec4899' };
  const importBtnStyle = { background: '#8b5cf6' };
  const dirBtnStyle = { background: '#22c55e' };
  const timeInputStyle = { width: '120px' };
  const shiftStyle = (name) => ({
    background: name.toLowerCase().includes('morning') ? '#8b5cf6' : name.toLowerCase().includes('evening') ? '#6b7280' : '#1e293b'
  });

  const handleSettingChange = (field, value) => setSettings(prev => ({ ...prev, [field]: value }));

  const handleQRUpload = async (e) => {
    const file = e.target.files[0];
    if (file) { const c = await LMS.compressImage(file, 300); handleSettingChange('qrCode', c); }
  };

  // Shift Management
  const addShift = () => {
    if (!newShift.name.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(newShift.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(newShift.endTime) || newShift.startTime === newShift.endTime) {
      showToast('Please fill all shift fields', 'error');
      return;
    }
    const newShiftData = { ...newShift, id: LMS.generateId() };
    setShifts(prev => [...prev, newShiftData]);
    setNewShift({ name: '', startTime: '', endTime: '' });
    addLog('Added shift: ' + newShift.name);
    showToast('Shift added!', 'success');
  };

  const removeShift = async shift => {
    if (students.some(s => s.isActive !== false && s.assignedSeat && s.shift === shift.id && LMS.resolveSeat(s.assignedSeat, halls)?.shared)) { showToast('Move or release shared-seat reservations using this shift before deleting it.', 'error'); return; }
    if (!confirm('Delete shift ' + shift.name + '? Assigned students will become unassigned.')) return;
    if (!await LMS.Auth.confirmAction()) { showToast('Authentication failed', 'error'); return; }
    setStudents(previous => previous.map(s => s.shift === shift.id ? { ...s, shift: '' } : s));
    setShifts(previous => previous.filter(s => s.id !== shift.id));
    addLog('Deleted shift: ' + shift.name); showToast('Shift removed', 'success');
  };

  const updateProfile = async () => {
    try {
      const old = LMS.DB.localLoad('owner') || {};
      const authenticated = passwordForm.current ? await LMS.Auth.verify(passwordForm.current) : await LMS.Auth.verifyGoogle();
      if (!authenticated) throw new Error('Admin authentication failed.');
      if (!passwordForm.username.trim()) throw new Error('Username is required.');
      if (passwordForm.new !== passwordForm.confirm) throw new Error('New passwords do not match.');
      let updated = { ...LMS.DB.localLoad('owner', {}), username: passwordForm.username.trim() };
      if (passwordForm.new) updated = await LMS.Auth.withPassword(updated, passwordForm.new);
      else if (updated.password) updated = await LMS.Auth.withPassword(updated, updated.password, false);
      await LMS.DB.save('owner', updated); setOwner(updated);
      setPasswordForm(p => ({ ...p, current: '', new: '', confirm: '' }));
      addLog('Admin profile updated'); showToast('Profile saved', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  };

  const fixDuplicates = async () => {
    if (!confirm('Merge identical roll numbers into the most recent admission? All source records and fee histories will be retained in merged history.')) return;
    const repaired = LMS.mergeDuplicateStudents(students, payments, LMS.DB.localLoad('attendance', {}));
    if (!repaired.count) { showToast('No duplicate roll numbers found'); return; }
    setStudents(repaired.students); setPayments(repaired.payments);
    LMS.DB.stage('attendance', repaired.attendance);
    addLog('Merged duplicate students: ' + repaired.count);
    try { await LMS.DB.flush(); showToast('Duplicate repair saved; cloud changes queued together', 'success'); }
    catch (error) { showToast(error.message, 'error'); }
  };

  // Backup Functions
  const exportBackup = () => {
    LMS.DB.exportBackup({ students, payments, halls, shifts, settings, activityLog });
    addLog('Manual backup exported');
    showToast('Backup exported!', 'success');
  };

  const importBackup = (e) => {
    const file = e.target.files[0];
    if (!file || importing) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(String(ev.target.result).replace(/^\uFEFF/, ''));
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The backup must contain a JSON object.');
        const collections = {};
        let convertedStudents = [];
        let convertedPayments = [];

        if (data.students && !Array.isArray(data.students)) {
          Object.entries(data.students).forEach(([rollKey, student]) => {
            if (!student || typeof student !== 'object' || Array.isArray(student)) throw new Error('Students contains an invalid record.');
            // Modern keyed records already use the current field names.
            if ('rollNo' in student || 'isActive' in student) {
              convertedStudents.push({ ...student, id: student.id || rollKey });
              return;
            }
            const newStudent = {
              ...student,
              id: student.id || LMS.generateId(),
              rollNo: student.roll || rollKey,
              name: student.name || '',
              fatherName: student.father || '',
              mobile: student.studentMobile || '',
              parentMobile: student.parentMobile || '',
              aadhaar: student.aadhar || '',
              shift: student.shift || 'morning',
              monthlyFee: student.monthlyFee || 500,
              admissionDate: student.admissionDate || new Date().toISOString().split('T')[0],
              photo: student.photo || '',
              formPhoto: student.formPhoto || '',
              isActive: student.active !== false,
              assignedSeat: student.assignedSeat || null,
              feeChanges: student.feeChanges || []
            };
            convertedStudents.push(newStudent);
            if (student.payments && Array.isArray(student.payments)) {
              student.payments.forEach(payment => {
                convertedPayments.push({
                  id: payment.id || LMS.generateId(),
                  studentId: newStudent.id,
                  amount: payment.amount || 0,
                  months: payment.duration || 1,
                  discount: payment.discount || 0,
                  method: payment.method || 'cash',
                  note: payment.note || '',
                  photo: payment.photo || '',
                  date: payment.date ? new Date(payment.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
                });
              });
            }
          });
          collections.students = convertedStudents;
          if (convertedPayments.length) collections.payments = convertedPayments;
        } else {
          if (data.students !== undefined) collections.students = data.students;
        }
        for (const key of ['payments', 'halls', 'shifts', 'settings', 'activityLog', 'expenses', 'attendance', 'pendingWork']) {
          if (data[key] !== undefined) collections[key] = data[key];
        }
        if (convertedPayments.length && data.payments) {
          if (!Array.isArray(data.payments)) throw new Error('Payments must be a list of records.');
          collections.payments = [...new Map([...convertedPayments, ...data.payments].map(payment => [payment.id, payment])).values()];
        }
        await LMS.DB.restoreCollections(collections);
        showToast('Backup imported and saved locally!', 'success');
      } catch (err) {
        console.error('Import error:', err);
        showToast(err instanceof SyntaxError ? 'This file is not valid JSON.' : 'Import failed: ' + err.message, 'error');
      } finally { setImporting(false); }
    };
    reader.onerror = () => { setImporting(false); showToast('Could not read the backup file. Please select it again.', 'error'); };
    reader.readAsText(file);
    e.target.value = '';
  };

  const syncToCloud = async () => {
    if (!LMS.DB.isConfigured) { showToast('Firebase not configured!', 'error'); return; }
    if (!LMS.DB.userId) { showToast('Please sign in with Google first!', 'error'); return; }
    setSyncing(true);
    const ok = await LMS.DB.syncLocalToCloud();
    setSyncing(false);
    showToast(ok ? 'Synced to cloud!' : 'Sync failed!', ok ? 'success' : 'error');
  };

  const syncFromCloud = async () => {
    if (!LMS.DB.isConfigured || !LMS.DB.userId) { showToast('Not connected to cloud!', 'error'); return; }
    setSyncing(true);
    const ok = await LMS.DB.syncCloudToLocal();
    setSyncing(false);
    if (ok) {
      setStudents(LMS.DB.localLoad('students') || []);
      setPayments(LMS.DB.localLoad('payments') || []);
      setHalls(LMS.DB.localLoad('halls') || LMS.DEFAULT_HALLS);
      setShifts(LMS.DB.localLoad('shifts') || LMS.DEFAULT_SHIFTS);
      setSettings(LMS.DB.localLoad('settings') || LMS.DEFAULT_SETTINGS);
      showToast('Downloaded from cloud!', 'success');
    } else { showToast('Sync failed!', 'error'); }
  };

  const handleGoogleConnect = async () => {
    if (!LMS.DB.isConfigured) { showToast('Firebase not configured!', 'error'); return; }
    const user = await LMS.DB.signInWithGoogle();
    if (user) {
      LMS.Auth.startSession('google'); LMS.DB.notify('auth');
      showToast('Connected as ' + (user.displayName || user.email), 'info');
      setSyncing(true);
      const ok = await LMS.DB.syncCloudToLocal();
      setSyncing(false);
      if (ok) {
        setStudents(LMS.DB.localLoad('students') || []);
        setPayments(LMS.DB.localLoad('payments') || []);
        setHalls(LMS.DB.localLoad('halls') || LMS.DEFAULT_HALLS);
        setShifts(LMS.DB.localLoad('shifts') || LMS.DEFAULT_SHIFTS);
        setSettings(LMS.DB.localLoad('settings') || LMS.DEFAULT_SETTINGS);
        showToast('Data synced from cloud!', 'success');
      }
    } else { showToast('Sign-in failed!', 'error'); }
  };

  return html`<div class="space-y-6">
    <${LMS.AttendanceAlertSettings} key=${LMS.DB.scope} />
    <${LMS.SqlMigrationPanel} />
    <!-- 1. Admin Profile Section -->
    <div class="p-4 bg-card rounded-xl border-l-4 border-blue-500 shadow-sm settings-admin">
      <h3 class="font-bold text-blue-700 mb-3">Update Admin Profile</h3>
      <div class="space-y-3">
        <${Input} label="Username" value=${passwordForm.username} onChange=${e => setPasswordForm(p => ({ ...p, username: e.target.value }))} />
        <${Input} type="password" label="Current Password (Required)" value=${passwordForm.current} onChange=${e => setPasswordForm(p => ({ ...p, current: e.target.value }))} />
        <div class="grid grid-2 gap-3">
            <${Input} type="password" label="New Password (Optional)" value=${passwordForm.new} onChange=${e => setPasswordForm(p => ({ ...p, new: e.target.value }))} />
            <${Input} type="password" label="Confirm New" value=${passwordForm.confirm} onChange=${e => setPasswordForm(p => ({ ...p, confirm: e.target.value }))} />
        </div>
        <${Button} onClick=${updateProfile} style=${updateBtnStyle} className="text-white font-bold w-full">
          Update Profile
        </${Button}>
      </div>
    </div>

    <div class="card p-4"><${Input} label="Library Name" value=${settings.libraryName} onChange=${e => handleSettingChange('libraryName', e.target.value)} /></div>
    <!-- 2. Upload QR Code Section -->
    <div class="p-4 bg-card rounded-xl border-l-4 border-yellow-500 shadow-sm">
      <h3 class="font-bold text-yellow-700 mb-3">Upload QR Code for Payments</h3>
      <div class="flex items-center gap-4">
        <label class="cursor-pointer">
          <span class="px-4 py-2 bg-gray-100 border rounded-lg text-sm text-gray-600 hover:bg-gray-200">Choose file</span>
          <span class="ml-2 text-sm text-gray-400">${(settings || {}).qrCode ? 'QR Uploaded' : 'No file chosen'}</span>
          <input type="file" accept="image/*" onChange=${LMS.safeAction(handleQRUpload)} class="hidden" />
        </label>
        ${(settings || {}).qrCode && html`<img src=${settings.qrCode} alt="QR" style=${qrStyle} />`}
      </div>
    </div>



    <!-- 4. Time Shift Management -->
    <div class="p-4 bg-card rounded-xl border-l-4 border-purple-500 shadow-sm settings-shifts">
      <h3 class="font-bold text-purple-700 mb-1">Time Shift Management</h3>
      <p class="text-xs text-gray-400 mb-4">Add or remove library shifts</p>
      
      <!-- Add New Shift -->
      <div class="flex gap-2 items-center mb-4">
        <input 
          type="text" 
          class="input-field flex-1" 
          placeholder="Shift name" 
          value=${newShift.name}
          onInput=${e => setNewShift(p => ({ ...p, name: e.target.value }))}
        />
        <input 
          type="time" 
          class="input-field" 
          style=${timeInputStyle} 
          value=${newShift.startTime}
          onChange=${e => setNewShift(p => ({ ...p, startTime: e.target.value }))}
          placeholder="--:--"
        />
        <input 
          type="time" 
          class="input-field" 
          style=${timeInputStyle} 
          value=${newShift.endTime}
          onChange=${e => setNewShift(p => ({ ...p, endTime: e.target.value }))}
          placeholder="--:--"
        />

        <${Button} onClick=${addShift} style=${addBtnStyle}>Add</${Button}>
      </div>
      
      <!-- Existing Shifts as Tags -->
      <div class="flex flex-wrap gap-2">
        ${(shifts || []).map(shift => html`
          <span key=${shift.id} class="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold text-white" 
            style=${shiftStyle(shift.name)}>
            ${shift.name} <span class="text-xs opacity-80">(${shift.startTime} - ${shift.endTime})</span>
            <button 
              onClick=${() => removeShift(shift)}
              class="ml-1 text-white hover:text-red-200 font-bold bg-transparent border-none cursor-pointer"
            >×</button>
          </span>
        `)}
      </div>
    </div>

    <!-- 5. Cloud Sync -->
    <${Card}>
      <h3 class="font-semibold mb-4 flex items-center gap-2"><${Icons.Cloud} /> Cloud Sync (Firebase)</h3>
      <div class="space-y-3">
        <div class="flex items-center gap-3 flex-wrap">
          <${LMS.SyncStatus} />
          ${LMS.DB.userId ? html`<span class="text-xs text-green-600">✓ Signed in</span>` : html`<span class="text-xs text-gray-500">Not connected</span>`}
        </div>
        <div class="flex gap-2 flex-wrap">
          ${!LMS.DB.userId
      ? html`<${Button} variant="secondary" onClick=${handleGoogleConnect}><${Icons.Google} /> Connect Google</${Button}>`
      : html`<${Button} variant="secondary" onClick=${async () => { await LMS.DB.signOut(); showToast('Disconnected', 'info'); }}>Disconnect</${Button}>`}
          <${Button} onClick=${syncToCloud} disabled=${syncing || !LMS.DB.userId}><${Icons.Sync} /> ${syncing ? 'Syncing...' : 'Upload to Cloud'}</${Button}>
          <${Button} variant="secondary" onClick=${syncFromCloud} disabled=${syncing || !LMS.DB.userId}><${Icons.Download} /> Download from Cloud</${Button}>
        </div>
      </div>
    </${Card}>

    <!-- 6. WhatsApp Templates -->
    <${Card} className="border-l-4 border-green-600">
      <h3 class="font-bold text-green-700 mb-4 flex items-center gap-2"><span>💬</span> WhatsApp Templates</h3>
      <div class="space-y-4">
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase">Payment Due Message</label>
          <textarea class="input-field w-full text-sm" rows="2" value=${(settings || {}).whatsappTemplate || ''} 
            onChange=${e => handleSettingChange('whatsappTemplate', e.target.value)} 
            placeholder="Dear {name}, your fee of ₹{due} is due..." />
          <p class="text-[10px] text-gray-400">Vars: {name}, {due}, {dueDate}, {library}</p>
        </div>
        
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase">Welcome Message</label>
          <textarea class="input-field w-full text-sm" rows="2" value=${(settings || {}).welcomeTemplate || ''} 
            onChange=${e => handleSettingChange('welcomeTemplate', e.target.value)} 
            placeholder="Welcome {name}..." />
           <p class="text-[10px] text-gray-400">Vars: {name}, {roll}, {library}</p>
        </div>

        <div>
          <label class="text-xs font-bold text-gray-500 uppercase">Absent / Warning Message</label>
          <textarea class="input-field w-full text-sm" rows="2" value=${(settings || {}).absentTemplate || ''} 
            onChange=${e => handleSettingChange('absentTemplate', e.target.value)} 
            placeholder="Absent warning..." />
           <p class="text-[10px] text-gray-400">Vars: {roll}, {library}</p>
        </div>
      </div>
    </${Card}>

    <!-- 7. Data Management -->
    <${Card}>
      <h3 class="font-semibold mb-4 text-pink-600">Data Management</h3>
      <div class="flex gap-3 flex-wrap mb-4">
        <${Button} onClick=${exportBackup} style=${backupBtnStyle}><${Icons.Download} /> Backup Now</${Button}>
        <label class="cursor-pointer">
          <span class="btn inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white" style=${importBtnStyle}><${Icons.Upload} /> ${importing ? 'Importing…' : 'Import Backup'}</span>
          <input type="file" accept=".json" disabled=${importing} onChange=${importBackup} class="hidden" />
        </label>
        <${Button} variant="secondary" onClick=${() => LMS.exportCSV?.(students, shifts, payments)}><${Icons.Download} /> Export Students CSV</${Button}>
        <${Button} onClick=${fixDuplicates} className="bg-red-500 hover:bg-red-600 text-white"><${Icons.Trash} /> Repair Duplicates</${Button}>
      </div>
      
      <div class="mt-4 pt-4 border-t">
        <h4 class="font-semibold text-purple-600 mb-2">Set Backup Directory</h4>
        <div class="flex items-center gap-3">
          <${Button} onClick=${async () => {
      if ('showDirectoryPicker' in window) {
        try {
          const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
          await LMS.IDB.set('backupDirectory', dirHandle);
          LMS.DB.localSave('backupDirectoryName', dirHandle.name);
          showToast('Backup directory set: ' + dirHandle.name, 'success');
        } catch (err) {
          if (err.name !== 'AbortError') showToast('Could not set directory', 'error');
        }
      } else {
        showToast('Directory picker not supported', 'warning');
      }
    }} style=${dirBtnStyle}>Choose Directory</${Button}>
          <span class="text-sm text-gray-600">Current: ${String(LMS.DB.localLoad('backupDirectoryName') || 'Not set')}</span>
        </div>
        
        <div class="mt-4 pt-4 border-t">
          <h4 class="font-semibold text-red-600 mb-2">Storage Optimization</h4>
           <div class="flex items-center justify-between">
            <p class="text-xs text-gray-500">Remove photos of students deactivated > 90 days ago.</p>
            <${Button} onClick=${() => {
      if (confirm('Remove photos of students inactive for more than 90 days? Texts will remain.')) {
        const { cleaned, count } = LMS.cleanupStudentPhotos(students);
        if (count > 0) {
          setStudents(cleaned);
          addLog(`Cleaned photos for ${count} old students`);
          showToast(`Removed photos for ${count} students`, 'success');
        } else {
          showToast('No old photos found to clean', 'info');
        }
      }
    }} className="btn-ghost text-red-500 border border-red-200 hover:bg-red-50">
              <${Icons.Trash} /> Clean Old Photos
            </${Button}>
           </div>
        </div>
      </div>
    </${Card}>


  </div>`;
};
