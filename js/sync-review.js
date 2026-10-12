window.LMS = window.LMS || {};
(() => {
  const editable = {
    students: ['name','rollNo','monthlyFee','assignedSeat','shift'],
    payments: ['studentId','amount','discount','date','time','method','months','note'],
    expenses: ['amount','date','category','description','method'],
    pendingWork: ['title','description','completed'],
    halls: ['name','seatCount','seatPrefix'], shifts: ['name','startTime','endTime']
  };
  const numberFields = new Set(['monthlyFee','amount','discount','months','seatCount']);
  const summarize = value => JSON.stringify(value, (key, item) => ['photo','formPhoto','qrCode'].includes(key) ? '[image retained]' : item, 2);
  const privateOperation = operation => operation.changes.some(change => change.key === 'expenses' || change.key === 'activityLog' && !LMS.isVisibleActivity(change.value));
  const label = change => {
    const student = LMS.DB.localLoad('students', []).find(item => item.id === (change.value?.studentId || (change.key === 'attendance' ? change.id?.split('/')[1] : change.id)));
    return `${change.key} · ${change.value?.name || change.value?.studentName || student?.name || change.id || 'Settings'}${change.value?.rollNo || student?.rollNo ? ' · Roll ' + (change.value?.rollNo || student.rollNo) : ''}`;
  };

  // Only a definitively rejected transaction may be corrected. Unknown network
  // outcomes keep their original ID and payload for safe idempotent replay.
  LMS.DB.repairSyncOperation = async function(draft, value, cloudBase) {
    const db = this, scope = draft.scope;
    if (db.processing || db.switching || db.pending.length || db.scope !== scope) throw new Error('Saving is in progress. Reopen the review after it finishes.');
    db.processing = true;
    try {
      await LMS.SyncQueue.withLock(scope, async () => {
        await db.writing;
        if (scope !== db.scope || db.pending.length) throw new Error('The page changed. Reopen this review.');
        const disk = await LMS.Store.readScope(scope), queue = disk.offline_queue || [];
        const operation = queue.find(item => item.id === draft.operation.id);
        if (!operation?.syncIssue || JSON.stringify(operation) !== JSON.stringify(draft.operation)) throw new Error('This pending save changed in another tab. Reopen review.');
        if (privateOperation(operation) && !LMS.AccountAccess?.session()) throw new Error('Verify your Accounts email before correcting this private entry.');
        const change = operation.changes[draft.index];
        if (change.value && typeof change.value === 'object' && (value?.id !== change.value.id || value?._rev !== change.value._rev || value?._deleted !== change.value._deleted)) throw new Error('Record identity, revision and deletion status cannot be changed here.');
        const updated = structuredClone(queue), operationIndex = queue.indexOf(operation), replacement = updated[operationIndex];
        replacement.id = crypto.randomUUID(); delete replacement.syncIssue;
        const corrected = replacement.changes[draft.index]; corrected.value = value;
        if (cloudBase !== undefined) corrected.base = cloudBase;
        // Carry a correction through later copies only where that field is still
        // unchanged; preserve intentional later edits and all revision links.
        const fields = value && typeof value === 'object' ? Object.keys(value).filter(key => JSON.stringify(value[key]) !== JSON.stringify(change.value?.[key])) : [];
        for (let opIndex = operationIndex; opIndex < updated.length; opIndex++) {
          for (let index = 0; index < updated[opIndex].changes.length; index++) {
            if (opIndex === operationIndex && index <= draft.index) continue;
            const later = updated[opIndex].changes[index];
            if (later.key !== change.key || later.id !== change.id) continue;
            // Such entries have not been sent: the scheduler holds dependencies.
            fields.forEach(key => { if (JSON.stringify(later.value?.[key]) === JSON.stringify(change.value?.[key])) later.value[key] = value[key]; });
          }
        }
        const last = updated.flatMap(item => item.changes).filter(item => item.key === change.key && item.id === change.id).at(-1);
        const writes = [{ key: '_syncRepair/' + operation.id, value: { original: queue, corrected: updated, at: new Date().toISOString() } }];
        const path = change.key + (change.id ? '/' + change.id : '');
        if (change.key === 'attendance') {
          const [day, student] = change.id.split('/'), next = { ...(disk['attendance/' + day] || {}) };
          if (last.value === null) delete next[student]; else next[student] = last.value;
          writes.push({ key: 'attendance/' + day, value: next });
        } else writes.push({ key: path, value: last.value });
        const remaining = await LMS.Store.commit(scope, writes, current => {
          if (JSON.stringify(current) !== JSON.stringify(queue)) throw new Error('Another tab changed pending saves. Reopen review.');
          return updated;
        });
        if (scope === db.scope) {
          db.cache.offline_queue = remaining;
          // Do not overwrite a new in-memory edit made during the disk commit.
          if (!db.pending.some(item => item.key === change.key && item.id === change.id)) {
            if (change.key === 'attendance') {
              const [day] = change.id.split('/'); db.cache.attendance = { ...db.localLoad('attendance', {}), [day]: writes.at(-1).value };
            } else if (Array.isArray(db.cache[change.key])) db.cache[change.key] = db.cache[change.key].map(item => item.id === change.id ? last.value : item);
            else db.cache[change.key] = last.value;
          }
          db.error = ''; db.notify(change.key); db.channel?.postMessage({ scope });
        }
      });
    } finally { db.processing = false; db.notify('status'); }
    await db.processOfflineQueue();
  };

  LMS.SyncReview = () => {
    LMS.useSyncStatus();
    const [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    useEffect(() => { if (draft && draft.scope !== LMS.DB.scope) setDraft(null); }, [LMS.DB.scope, draft]);
    const plan = LMS.SyncQueue.plan(LMS.DB.localLoad('offline_queue', []));
    const begin = async (operation, index) => {
      setMessage('');
      if (privateOperation(operation) && !LMS.AccountAccess?.session()) { setMessage('Open Accounts and verify your personal email to review this private entry.'); return; }
      const details = operation.syncIssue.details || {};
      if (index === undefined) index = Number.isInteger(details.changeIndex) ? details.changeIndex : operation.changes.findIndex(item => item.key === details.key && item.id === details.id);
      if (index < 0 || index === undefined) index = 0;
      setDraft({ operation: structuredClone(operation), index, scope: LMS.DB.scope, value: structuredClone(operation.changes[index].value), cloud: null, rebase: false });
    };
    const compare = async () => {
      setBusy(true); setMessage('');
      try {
        const change = draft.operation.changes[draft.index];
        const cloud = await LMS.SqlApi.request('sync-record', { query: { key: change.key, id: change.id } });
        setDraft(old => old && old.operation.id === draft.operation.id && old.index === draft.index ? { ...old, cloud } : old);
      } catch (error) { setMessage(error.message); } finally { setBusy(false); }
    };
    const save = async () => {
      const change = draft.operation.changes[draft.index];
      let value = draft.value;
      if (draft.advanced) { try { value = JSON.parse(draft.raw); } catch { setMessage('The record must be valid JSON. No changes were saved.'); return; } }
      if (change.key !== 'attendance' && (!value || typeof value !== 'object' || Array.isArray(value))) { setMessage('This record must be an object. No changes were saved.'); return; }
      if (change.key === 'students' && (!String(value.rollNo || '').trim() || !String(value.name || '').trim() || !(Number(value.monthlyFee) > 0))) { setMessage('Name, roll number and a positive monthly fee are required.'); return; }
      if (change.key === 'payments' && (!LMS.validDate(value.date) || value.amount === '' || value.amount == null || !Number.isFinite(Number(value.amount)) || Number(value.amount) < 0 || !Number.isFinite(Number(value.discount ?? 0)) || Number(value.discount ?? 0) < 0)) { setMessage('Check the receipt: use a valid date and non-negative amount/discount.'); return; }
      if (draft.operation.syncIssue.code === 'RECORD_CHANGED' && !draft.rebase) { setMessage('Compare the cloud record and confirm your choice before saving a conflicting version.'); return; }
      if (!confirm('Save this correction and retry? If you selected cloud replacement, the reviewed pending version will replace that cloud record. The original pending data is retained locally.')) return;
      setBusy(true); setMessage('');
      try { await LMS.DB.repairSyncOperation(draft, value, draft.rebase ? draft.cloud.base : undefined); setDraft(null); setMessage('Correction saved. Any remaining issue is listed below.'); }
      catch (error) { setMessage(error.message); } finally { setBusy(false); }
    };
    const change = draft?.operation.changes[draft.index];
    return html`<section class="sync-review"><p>Only the listed saves and their dependent edits are pending. Other independent updates continue syncing.</p>
      ${message && html`<p role="status">${message}</p>`}
      ${plan.filter(item => item.operation.syncIssue).map(({ operation }) => html`<article class="sync-issue" key=${operation.id}>
        <strong>${privateOperation(operation) && !LMS.AccountAccess?.session() ? 'Private Accounts entry' : operation.changes.filter(item => item.key !== 'activityLog').map(label).join(' / ') || 'Activity update'}</strong>
        <p>${operation.syncIssue.message}</p><small>Error: ${operation.syncIssue.code} · ${operation.syncIssue.details?.fields?.length ? 'Fields: ' + operation.syncIssue.details.fields.join(', ') : 'Review the pending record'} · ${plan.filter(item => item.waitingFor === operation.id).length} dependent save(s) waiting</small>
        ${operation.syncIssue.details?.conflictingStudent && html`<p>Roll ${operation.syncIssue.details.conflictingStudent.rollNo} already belongs to <strong>${operation.syncIssue.details.conflictingStudent.name}</strong>. No students have been merged.</p>`}
        ${operation.syncIssue.details?.reason && html`<p>${operation.syncIssue.details.reason}</p>`}
        <button class="btn btn-secondary btn-sm" disabled=${busy} onClick=${() => begin(operation)}>Review & correct</button>
      </article>`)}
      <${LMS.Modal} isOpen=${!!draft} onClose=${() => !busy && setDraft(null)} title="Review pending save" size="lg">
        ${draft && html`<div class="space-y-4"><p>${draft.operation.syncIssue.message}</p>
          <label class="block">Record in this save<select class="input-field" disabled=${busy} value=${draft.index} onChange=${event => begin(draft.operation, Number(event.target.value))}>${draft.operation.changes.map((item, index) => html`<option key=${index} value=${index}>${label(item)}</option>`)}</select></label>
          <p class="text-sm">${change.key} · Record ID: ${change.id || 'settings'} · Error: ${draft.operation.syncIssue.code}</p>
          <div class="sync-fields">${(editable[change.key] || []).filter(key => key in (draft.value || {}) || change.key === 'payments' && key === 'discount').map(key => html`<label key=${key}>${key}<input class="input-field" type=${numberFields.has(key) ? 'number' : key === 'date' ? 'date' : 'text'} step=${numberFields.has(key) ? 'any' : undefined} value=${draft.value[key] ?? ''} onInput=${event => { const input = event.target.value; setDraft(old => ({ ...old, value: { ...old.value, [key]: numberFields.has(key) && input !== '' ? Number(input) : input || (['assignedSeat','shift'].includes(key) ? null : '') } })); }} /></label>`)}</div>
          ${change.key === 'attendance' && html`<label>Status<select class="input-field" value=${String(typeof draft.value === 'object' && draft.value ? draft.value.status : draft.value)} onChange=${event => setDraft(old => ({ ...old, value: old.value && typeof old.value === 'object' ? { ...old.value, status: event.target.value === 'true' } : event.target.value === 'true' }))}><option value="true">Present</option><option value="false">Absent</option></select></label>`}
          <details><summary>Pending record details</summary><pre class="sync-record-json">${summarize(draft.value)}</pre></details>
          <details><summary>Advanced correction</summary><p class="text-sm">For fields not shown above. Keep the record ID, revision and history intact. The server validates the correction before accepting it.</p><label><input type="checkbox" checked=${!!draft.advanced} onChange=${event => setDraft(old => ({ ...old, advanced: event.target.checked, raw: JSON.stringify(old.value, null, 2) }))} /> Edit the complete pending record</label>${draft.advanced && html`<textarea class="input-field sync-record-json" rows="12" value=${draft.raw} onChange=${event => setDraft(old => ({ ...old, raw: event.target.value }))} />`}</details>
          <button class="btn btn-secondary" disabled=${busy} onClick=${compare}>Compare current cloud record</button>
          ${draft.cloud && html`<details open><summary>Current cloud record</summary><pre class="sync-record-json">${summarize(draft.cloud.value)}</pre></details>`}
          ${draft.cloud && draft.operation.syncIssue.code === 'RECORD_CHANGED' && html`<label class="block"><input type="checkbox" checked=${draft.rebase} onChange=${event => setDraft(old => ({ ...old, rebase: event.target.checked }))} /> I compared both records. Save this reviewed pending version over the cloud version.</label>`}
          ${message && html`<p role="status">${message}</p>`}<button class="btn btn-primary" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save correction & retry'}</button>
        </div>`}
      </${LMS.Modal}>
    </section>`;
  };
})();
