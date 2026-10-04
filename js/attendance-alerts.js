// Attendance follow-ups use Present records only; pauses never change attendance or billing.
window.LMS = window.LMS || {};

LMS.attendanceAlertConfig = settings => {
  const raw = { ...LMS.DEFAULT_ATTENDANCE_ALERTS, ...(settings?.attendanceAlerts || {}) };
  const positive = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 3650 ? Number(value) : fallback;
  return { ...raw, enabled: raw.enabled !== false, days: positive(raw.days, 30), snoozeDays: positive(raw.snoozeDays, 7),
    closedWeekdays: [...new Set((Array.isArray(raw.closedWeekdays) ? raw.closedWeekdays : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))],
    holidays: [...new Set((Array.isArray(raw.holidays) ? raw.holidays : []).filter(LMS.validDate))],
    reminderTemplate: raw.reminderTemplate || LMS.DEFAULT_ATTENDANCE_ALERTS.reminderTemplate };
};
LMS.attendanceDayNumber = day => Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
LMS.attendanceAddDays = (day, days) => new Date((LMS.attendanceDayNumber(day) + Number(days)) * 86400000).toISOString().slice(0, 10);
LMS.attendanceElapsedDays = (start, end, config) => {
  const first = LMS.attendanceDayNumber(start), last = LMS.attendanceDayNumber(end);
  const span = Math.max(0, last - first);
  if (!config.excludeClosedDays || !span) return span;
  const closed = new Set(config.closedWeekdays);
  let count = Math.floor(span / 7) * (7 - closed.size);
  for (let offset = Math.floor(span / 7) * 7 + 1; offset <= span; offset++) {
    if (!closed.has(new Date((first + offset) * 86400000).getUTCDay())) count++;
  }
  for (const day of config.holidays) {
    if (day > start && day <= end && !closed.has(new Date(day + 'T00:00:00Z').getUTCDay())) count--;
  }
  return Math.max(0, count);
};

LMS.buildAttendanceAlerts = (students, attendance, settings, today = LMS.today()) => {
  const config = LMS.attendanceAlertConfig(settings);
  if (!config.enabled) return [];
  const lastPresentById = new Map();
  Object.keys(attendance || {}).filter(day => LMS.validDate(day) && day <= today).sort().reverse().forEach(day => {
    Object.entries(attendance[day] || {}).forEach(([id, value]) => {
      if (!id.startsWith('unreg_') && (value === true || (value?.status === true && !value.unregistered)) && !lastPresentById.has(id)) lastPresentById.set(id, day);
    });
  });
  const trackingStart = LMS.validDate(config.trackingStartedOn) ? config.trackingStartedOn : today;
  return students.filter(student => student.isActive !== false).flatMap(student => {
    const admission = LMS.validDate(student.admissionDate) ? student.admissionDate : trackingStart;
    const reactivated = (student.inactivePeriods || []).map(period => period.end).filter(day => LMS.validDate(day) && day <= today).sort().pop() || admission;
    const membershipStart = admission > reactivated ? admission : reactivated;
    if (membershipStart > today) return [];
    const recordedPresent = lastPresentById.get(String(student.id));
    const lastPresent = recordedPresent && recordedPresent >= membershipStart ? recordedPresent : null;
    const baseline = lastPresent || (membershipStart > trackingStart ? membershipStart : trackingStart);
    const days = LMS.attendanceElapsedDays(baseline, today, config);
    const action = student.attendanceAlert || {};
    const actionApplies = LMS.validDate(action.startedOn) && action.startedOn >= membershipStart && (!lastPresent || lastPresent < action.startedOn);
    const paused = actionApplies && ['snooze', 'leave'].includes(action.mode) && LMS.validDate(action.until);
    const isWaiting = paused && (action.mode === 'leave' ? today <= action.until : today < action.until);
    const needsReview = actionApplies && (action.mode === 'review' || (paused && !isWaiting));
    if (!isWaiting && !needsReview && days < config.days) return [];
    return [{ student, lastPresent, baseline, days, action, status: isWaiting ? action.mode : 'needs', expired: !!(paused && !isWaiting) }];
  }).sort((a, b) => b.days - a.days || String(a.student.rollNo).localeCompare(String(b.student.rollNo), undefined, { numeric: true }));
};

LMS.useAttendanceAlerts = () => {
  const { students, settings } = useContext(LMS.AppContext);
  const [, redraw] = useState(0);
  const [today, setToday] = useState(LMS.today());
  useEffect(() => {
    const unsubscribe = LMS.DB.subscribe(key => { if (key === 'attendance' || key === 'scope') redraw(n => n + 1); });
    const timer = setInterval(() => setToday(LMS.today()), 60000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, []);
  const attendance = LMS.DB.localLoad('attendance', {});
  const signature = JSON.stringify(settings.attendanceAlerts);
  const rows = useMemo(() => LMS.buildAttendanceAlerts(students, attendance, settings, today), [students, attendance, signature, today]);
  return { rows, today, config: LMS.attendanceAlertConfig(settings) };
};

LMS.AttendanceAlertSettings = () => {
  const { settings, setSettings, showToast, addLog, attendanceSettingsRequest, dismissAttendanceSettingsRequest } = useContext(LMS.AppContext);
  const [draft, setDraft] = useState(() => {
    const config = LMS.attendanceAlertConfig(settings);
    return { ...config, trackingStartedOn: config.trackingStartedOn || LMS.today() };
  });
  const [holidayText, setHolidayText] = useState(() => LMS.attendanceAlertConfig(settings).holidays.join('\n'));
  const [error, setError] = useState('');
  const panel = useRef(null);
  useEffect(() => {
    if (attendanceSettingsRequest) { panel.current?.scrollIntoView({ block: 'start' }); dismissAttendanceSettingsRequest(); }
  }, [attendanceSettingsRequest]);
  const change = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const save = event => {
    event.preventDefault();
    const holidays = holidayText.split(/[\s,]+/).filter(Boolean);
    if (![draft.days, draft.snoozeDays].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 3650)) { setError('Enter a whole number from 1 to 3650 days.'); return; }
    if (!LMS.validDate(draft.trackingStartedOn) || draft.trackingStartedOn > LMS.today()) { setError('Tracking start must be a valid date, today or earlier.'); return; }
    if (holidays.some(day => !LMS.validDate(day))) { setError('Use YYYY-MM-DD for each closed date.'); return; }
    if (draft.excludeClosedDays && draft.closedWeekdays.length === 7) { setError('Keep at least one open weekday.'); return; }
    if (!draft.reminderTemplate.trim()) { setError('Enter a reminder message.'); return; }
    const config = LMS.attendanceAlertConfig({ attendanceAlerts: { ...draft, holidays } });
    setSettings(previous => ({ ...previous, attendanceAlerts: config }));
    setDraft(config); setError(''); addLog('Updated attendance alert settings: ' + config.days + ' days'); showToast('Attendance alert settings saved.', 'success');
  };
  return html`<section class="card attendance-alert-settings" id="attendance-alert-settings" ref=${panel}>
    <div class="section-heading"><div><h3>Attendance alerts</h3><p>Follow up when an active student has no recent Present record.</p></div><${LMS.Icons.Bell} /></div>
    <form onSubmit=${LMS.safeAction(save)}>
      <label class="attendance-toggle"><input type="checkbox" checked=${draft.enabled} onChange=${event => change('enabled', event.target.checked)} />Enable attendance alerts</label>
      <div class="attendance-settings-grid">
        <div><${LMS.Input} label="Alert after (days)" type="number" min="1" max="3650" value=${draft.days} onChange=${event => change('days', event.target.value)} /><div class="attendance-presets">${[30, 60, 90].map(days => html`<button key=${days} type="button" class=${Number(draft.days) === days ? 'selected' : ''} onClick=${() => change('days', days)}>${days} days</button>`)}</div></div>
        <${LMS.Input} label="Default remind-later period (days)" type="number" min="1" max="3650" value=${draft.snoozeDays} onChange=${event => change('snoozeDays', event.target.value)} />
        <div><${LMS.Input} label="Tracking start for students without attendance" type="date" max=${LMS.today()} value=${draft.trackingStartedOn} onChange=${event => change('trackingStartedOn', event.target.value)} /><p class="profile-help">No Present record? Count from this date or admission/reactivation, whichever is later.</p></div>
        <div><label class="attendance-toggle"><input type="checkbox" checked=${draft.excludeClosedDays} onChange=${event => change('excludeClosedDays', event.target.checked)} />Exclude library closed days</label><p class="profile-help">Off: count calendar days. On: skip the weekdays and closed dates below.</p></div>
      </div>
      ${draft.excludeClosedDays && html`<div class="attendance-closed-days"><span>Weekly closed days</span><div class="attendance-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, index) => html`<label key=${day}><input type="checkbox" checked=${draft.closedWeekdays.includes(index)} onChange=${event => change('closedWeekdays', event.target.checked ? [...draft.closedWeekdays, index] : draft.closedWeekdays.filter(value => value !== index))} />${day}</label>`)}</div><label>Other closed dates (YYYY-MM-DD, one per line)<textarea class="input-field" rows="2" value=${holidayText} onChange=${event => setHolidayText(event.target.value)} placeholder="2026-10-02"></textarea></label></div>`}
      <label class="attendance-template-label">WhatsApp attendance reminder<textarea class="input-field" rows="3" value=${draft.reminderTemplate} onChange=${event => change('reminderTemplate', event.target.value)}></textarea></label>
      <p class="profile-help">Variables: {name}, {roll}, {days}, {dayType}, {lastPresent}, {library}. Reminders open in WhatsApp for you to send.</p>
      ${error && html`<p class="attendance-form-error" role="alert">${error}</p>`}
      <${LMS.Button} type="submit">Save alert settings</${LMS.Button}>
    </form>
  </section>`;
};
