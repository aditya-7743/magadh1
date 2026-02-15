// ==================== ALERTS.JS - Smart Alerts ====================
window.LMS = window.LMS || {};

LMS.Alerts = () => {
  const { students, payments, setStudents, addLog, showToast } = useContext(LMS.AppContext);
  const { Button, Card, Icons } = LMS;

  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const upcomingDue = students.filter(s => {
    if (!s.isActive) return false;
    const paidUntil = new Date(LMS.getPaidUntilDate(s, payments));
    return paidUntil > now && paidUntil <= sevenDaysLater;
  });

  const recentlyDue = students.filter(s => {
    if (!s.isActive) return false;
    const paidUntil = new Date(LMS.getPaidUntilDate(s, payments));
    return paidUntil < now && paidUntil >= sevenDaysAgo;
  });

  const longDue = students.filter(s => {
    if (!s.isActive) return false;
    return LMS.getDaysDue(s, payments) >= LMS.HIGHLIGHT_THRESHOLD_DAYS;
  });

  const autoDeactivate = students.filter(s => {
    if (!s.isActive) return false;
    return LMS.getDaysDue(s, payments) >= LMS.DEACTIVATION_THRESHOLD_DAYS;
  });

  const deactivateAll = () => {
    if (confirm('Deactivate ' + autoDeactivate.length + ' students with 4+ months due?')) {
      const ids = autoDeactivate.map(s => s.id);
      setStudents(prev => prev.map(s => ids.includes(s.id) ? { ...s, isActive: false, deactivatedAt: new Date().toISOString() } : s));
      addLog('Auto-deactivated ' + autoDeactivate.length + ' students');
      showToast(autoDeactivate.length + ' students deactivated!', 'success');
    }
  };

  const AlertSection = ({ title, list, color, icon }) => {
    if (list.length === 0) return null;
    return html`<${Card}>
      <h3 class="font-semibold mb-3 flex items-center gap-2 ${color}">${icon} ${title} (${list.length})</h3>
      <div class="space-y-2">
        ${list.map(s => {
          const fin = LMS.calculateStudentFinancials(s, payments);
          return html`<div key=${s.id} class="flex justify-between items-center p-2" style=${{background:'rgba(30,41,59,0.5)',borderRadius:'0.5rem'}}>
            <div class="text-sm"><span class="mono text-primary-400">${s.rollNo}</span> — ${s.name}</div>
            <div class="text-right text-sm">
              <div class="text-slate-400">Due since: ${LMS.formatDate(fin.dueSince)}</div>
              ${fin.totalDues > 0 && html`<div class="text-red-400">${LMS.formatCurrency(fin.totalDues)}</div>`}
            </div>
          </div>`;
        })}
      </div>
    </${Card}>`;
  };

  return html`<div class="space-y-4">
    <h1 class="text-2xl font-bold">Smart Alerts</h1>

    ${autoDeactivate.length > 0 && html`<${Card} style=${{border:'1px solid rgba(239,68,68,0.5)',background:'rgba(239,68,68,0.1)'}}>
      <div class="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h3 class="font-semibold text-red-400">⚠️ 4+ Months Due — Auto Deactivate</h3>
          <p class="text-sm text-slate-400">${autoDeactivate.length} students should be deactivated</p>
        </div>
        <${Button} variant="danger" onClick=${deactivateAll}>Deactivate All</${Button}>
      </div>
    </${Card}>`}

    <${AlertSection} title="Due in Next 7 Days" list=${upcomingDue} color="text-amber-400" icon="⏰" />
    <${AlertSection} title="Recently Due (Last 7 Days)" list=${recentlyDue} color="text-orange-400" icon="📅" />
    <${AlertSection} title="3+ Months Due" list=${longDue} color="text-red-400" icon="🚨" />

    ${upcomingDue.length === 0 && recentlyDue.length === 0 && longDue.length === 0 && autoDeactivate.length === 0 && html`<${Card} className="text-center py-8 text-slate-400">✅ No alerts at the moment!</${Card}>`}
  </div>`;
};
