// Separate IndexedDB scopes prevent old Firebase records or outboxes from entering SQL.
(() => {
  if (!LMS.SQL_CONFIG?.enabled) return;
  const db = LMS.DB, lists = ['students', 'payments', 'halls', 'shifts', 'activityLog', 'expenses', 'pendingWork'];
  const originalStage = db.stage.bind(db), originalOpenScope = db.openScope.bind(db), originalSignIn = db.signInWithGoogle.bind(db);
  let poll, pulling = false;
  db.sqlMode = true;
  db.sqlAuthorized = false;
  db.signInWithGoogle = async function() { const user = await originalSignIn(); if (user) await LMS.SqlApi.request('session'); return user; };
  db.recoverReceipts = async () => {}; // Archived receipts are preserved and combined by the billing engine.
  db.stage = function(key, value, cloud = true, options) {
    if (key === 'owner') cloud = false; // Local convenience settings never grant API access.
    if (cloud && (lists.includes(key) || ['settings','attendance'].includes(key)) && !this.sqlAuthorized) throw new Error('Connect with the library Google account before editing.');
    if (key === 'settings' && cloud && value && JSON.stringify(value) !== JSON.stringify(this.localLoad(key))) value = { ...value, _rev: crypto.randomUUID() };
    return originalStage(key, value, cloud, options);
  };
  db.boot = async function() {
    await originalOpenScope('sql:signed-out');
    this.init();
    window.addEventListener('online', () => { this.isOnline = true; this.processOfflineQueue(); });
    window.addEventListener('offline', () => { this.isOnline = false; this.connected = false; this.notify('status'); });
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('lms-sql-records');
    if (this.channel) this.channel.onmessage = async event => {
      if (event.data.scope !== this.scope || this.pending.length || this.switching || this.processing || pulling) return;
      await originalOpenScope(this.scope);
      this.processOfflineQueue();
    };
  };
  db.changeUser = async function(user) {
    clearInterval(poll);
    await this.flush();
    this.switching = true; this.notify('status');
    this.userId = user?.uid || null; this.connected = false; this.authResolved = true; this.sqlAuthorized = false;
    try {
      if (user) {
        const session = await LMS.SqlApi.request('session');
        if (!/^[a-z][a-z0-9_]{0,62}$/.test(session.dataset || '')) throw new Error('SQL update is in progress. Please refresh shortly.');
        this.sqlDataset = session.dataset;
        await originalOpenScope('sql:' + user.uid + ':' + session.dataset);
        if (this.localLoad('_sqlInitialized', false)) await this.pullSqlChanges();
        else await this.syncCloudToLocal();
        this.sqlAuthorized = true;
        this.connected = true;
        poll = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) this.pullSqlChanges().catch(error => this.fail(error)); }, 60000);
      } else { this.sqlDataset = null; await originalOpenScope('sql:signed-out'); }
    } catch (error) { this.fail(error); LMS.Auth?.endSession(); throw error; }
    finally { this.switching = false; this.notify('scope'); this.notify('auth'); }
    if (user) this.processOfflineQueue();
  };
  db.listen = function(key, callback) {
    callback(this.localLoad(key));
    return this.subscribe(changed => { if (changed === key || changed === 'scope') callback(this.localLoad(key)); });
  };
  db.syncCloudToLocal = async function() {
    if (!this.userId || pulling) return false;
    pulling = true;
    const scope = this.scope;
    try {
      const bootstrap = await LMS.SqlApi.request('bootstrap');
      for (const [key, value] of Object.entries(bootstrap.documents)) if (value !== null) await this.acceptRemote(key, value, scope);
      // Bounded requests omit media; photos are fetched only when displayed.
      for (const key of lists) {
        const records = []; let after = null;
        do {
          const page = await LMS.SqlApi.request('records/' + key, { query: { after, limit: 100 } });
          records.push(...page.items); after = page.next;
        } while (after && scope === this.scope);
        if (scope !== this.scope) return false;
        await this.acceptRemote(key, records, scope);
      }
      const attendance = {}; let cursor = null;
      do {
        const page = await LMS.SqlApi.request('attendance-records', { query: cursor || {} });
        for (const cell of page.items) (attendance[cell.day] ||= {})[cell.student] = cell.value;
        cursor = page.next;
      } while (cursor && scope === this.scope);
      await this.acceptRemote('attendance', attendance, scope);
      if (scope === this.scope) { this.stage('_sqlWatermark', bootstrap.watermark, false); this.stage('_sqlInitialized', true, false); await this.flush(); this.connected = true; }
    } finally { pulling = false; }
    await this.pullSqlChanges();
    return true;
  };
  db.pullSqlChanges = async function() {
    if (!this.userId || pulling || this.processing) return;
    pulling = true; const scope = this.scope;
    try {
      let page;
      do {
        page = await LMS.SqlApi.request('changes', { query: { since: this.localLoad('_sqlWatermark', '0') } });
        if (scope !== this.scope) return;
        const grouped = new Map();
        for (const change of page.items) {
          if (!grouped.has(change.key)) grouped.set(change.key, structuredClone(this.localLoad(change.key, change.key === 'attendance' ? {} : [])));
          let current = grouped.get(change.key);
          if (lists.includes(change.key)) {
            const index = current.findIndex(item => item.id === change.id);
            if (index >= 0) current.splice(index, 1);
            current.push(change.value);
          } else if (change.key === 'attendance') {
            const slash = change.id.indexOf('/'), day = change.id.slice(0, slash), id = change.id.slice(slash + 1);
            const cells = current[day] ||= {};
            if (change.value === null) delete cells[id]; else cells[id] = change.value;
          } else grouped.set(change.key, change.value);
        }
        for (const [key, value] of grouped) await this.acceptRemote(key, value, scope);
        this.stage('_sqlWatermark', page.next, false); await this.flush();
      } while (page.hasMore === true || page.hasMore === undefined && page.items.length === 200);
      this.connected = true;
    } finally { pulling = false; this.notify('status'); }
  };
  db.processOfflineQueue = async function() {
    if (!this.userId || !navigator.onLine || this.processing || this.switching) return false;
    this.processing = true;
    const scope = this.scope;
    try {
      while (scope === this.scope) {
        const operation = this.localLoad('offline_queue', [])[0];
        if (!operation) break;
        await LMS.SqlApi.operation({ id: operation.id, changes: operation.changes, force: operation.force === true });
        const remaining = await LMS.Store.commit(scope, [], queue => queue.filter(item => item.id !== operation.id));
        if (scope === this.scope) this.cache.offline_queue = remaining;
      }
      this.error = ''; this.connected = true; return true;
    } catch (error) { this.fail(error); return false; }
    finally { this.processing = false; this.notify('status'); }
  };
  db.syncLocalToCloud = async function() {
    await this.flush();
    const saved = await this.processOfflineQueue();
    if (this.localLoad('offline_queue', []).length) throw new Error(this.error || 'Pending changes have not reached SQL yet.');
    return saved;
  };
  // A full restore must be a single server transaction; never queue a partly applied import.
  db.restoreCollections = async function() {
    throw new Error('SQL restore requires a protected server import. No records were changed. Your JSON backup is still safe.');
  };
  db.completeSqlBackup = async function() {
    await this.syncLocalToCloud();
    return LMS.SqlApi.backup();
  };
  db.exportBackup = async function() {
    try {
      const data = await this.completeSqlBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url;
      link.download = 'library_sql_backup_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) { this.fail(error); }
  };
})();
