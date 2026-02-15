// ==================== ACTIVITY.JS - Activity Log & Pending Work ====================
window.LMS = window.LMS || {};

LMS.ActivityLog = () => {
  const { activityLog, pendingWork, setPendingWork, showToast } = useContext(LMS.AppContext);
  const { Card, Input, Button, Modal } = LMS;

  const [newWork, setNewWork] = useState('');
  const [showClearAuth, setShowClearAuth] = useState(false);
  const [clearPass, setClearPass] = useState('');

  // Get last 100 activities (Already sorted newest first in app.js:addLog)
  const recentLogs = (activityLog || []).slice(0, 100);

  const handleAddWork = (e) => {
    e.preventDefault();
    if (!newWork.trim()) return;
    const work = {
      id: LMS.generateId(),
      text: newWork,
      date: new Date().toISOString(),
      completed: false
    };
    setPendingWork(prev => [work, ...prev]);
    setNewWork('');
    showToast('Task added to pending list', 'success');
  };

  const toggleWork = (id) => {
    setPendingWork(prev => prev.map(w => w.id === id ? { ...w, completed: !w.completed } : w));
  };

  const deleteWork = (id) => {
    if (confirm('Delete this task?')) {
      setPendingWork(prev => prev.filter(w => w.id !== id));
    }
  };

  const clearCompleted = () => {
    // Basic clear of completed items
    setPendingWork(prev => prev.filter(w => !w.completed));
    showToast('Completed tasks cleared', 'success');
  };

  const handleClearAll = () => {
    if (clearPass === '123') {
      setPendingWork([]);
      setShowClearAuth(false);
      setClearPass('');
      showToast('All pending work cleared', 'success');
    } else {
      alert('Incorrect Password!');
    }
  };

  return html`<div class="space-y-6">
    <h1 class="text-2xl font-bold">Activity & Pending Work</h1>

    <!-- Pending Work Section -->
    <${Card} className="bg-orange-50 border border-orange-200">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-lg text-orange-800">📝 Pending Work / Tasks</h3>
        <div class="flex gap-2">
            <button class="text-xs text-orange-600 underline" onClick=${clearCompleted}>Clear Completed</button>
            <button class="text-xs text-red-600 underline font-bold" onClick=${() => setShowClearAuth(true)}>Clear All (Auth)</button>
        </div>
      </div>
      
      <form onSubmit=${handleAddWork} class="flex gap-2 mb-4">
        <input type="text" class="input-field flex-1" placeholder="Add new task..." value=${newWork} onChange=${e => setNewWork(e.target.value)} />
        <${Button} type="submit" variant="primary">Add</${Button}>
      </form>

      <div class="space-y-2 max-h-60 overflow-y-auto">
        ${pendingWork && pendingWork.length > 0 ? pendingWork.map(w => html`
          <div key=${w.id} class="flex items-center justify-between p-2 bg-white rounded border ${w.completed ? 'opacity-50' : ''}">
            <div class="flex items-center gap-3">
              <input type="checkbox" checked=${w.completed} onChange=${() => toggleWork(w.id)} class="w-5 h-5 text-orange-600 rounded" />
              <span class="${w.completed ? 'line-through text-gray-400' : 'text-gray-800'}">${w.text}</span>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">${new Date(w.date).toLocaleDateString()}</span>
                <button class="text-red-500 hover:text-red-700 font-bold px-2" onClick=${() => deleteWork(w.id)}>×</button>
            </div>
          </div>
        `) : html`<p class="text-gray-400 text-center italic text-sm">No pending work.</p>`}
      </div>
    </${Card}>

    <!-- Activity Log -->
    <div class="space-y-4">
      <h3 class="font-bold text-lg">System Activity Log</h3>
      <p class="text-sm text-gray-500">Showing last 100 activities</p>
      <${Card}>
        <div class="space-y-1 max-h-96 overflow-y-auto">
          ${recentLogs.length > 0 ? recentLogs.map((log, i) => html`<div key=${i} class="flex justify-between items-center p-3 rounded-lg" style=${{ background: i % 2 === 0 ? '#f3f4f6' : '#ffffff', borderBottom: '1px solid #e5e7eb' }}>
            <span class="text-sm text-gray-800">${log.action}</span>
            <span class="text-sm text-gray-400 mono">${LMS.formatDate(log.timestamp)} ${new Date(log.timestamp).toLocaleTimeString()}</span>
          </div>`)
      : html`<p class="text-center py-8 text-gray-400">No activity yet</p>`}
        </div>
      </${Card}>
    </div>
    
    <!-- Clear All Auth Modal -->
    <${Modal} isOpen=${showClearAuth} onClose=${() => setShowClearAuth(false)} title="Security Check" size="sm">
      <div class="p-4 space-y-4">
        <p class="text-sm text-red-600 font-bold">Enter password to clear ALL pending tasks:</p>
        <input type="password" class="input-field" value=${clearPass} onChange=${e => setClearPass(e.target.value)} placeholder="Password (123)" />
        <div class="flex justify-end gap-2">
            <${Button} variant="secondary" onClick=${() => setShowClearAuth(false)}>Cancel</${Button}>
            <${Button} variant="danger" onClick=${handleClearAll}>CLEAR ALL</${Button}>
        </div>
      </div>
    </${Modal}>

  </div>`;
};
