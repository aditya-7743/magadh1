// Local writes and their cloud outbox are committed in the same IndexedDB transaction.
(() => {
  const exportBackup = LMS.DB.exportBackup;
  const lists = ['students', 'payments', 'halls', 'shifts', 'expenses', 'activityLog', 'pendingWork'];
  const roots = [...lists, 'attendance', 'settings', 'owner'];
  const cleanKey = key => key.replace(/_v2(?=\/|$)/, '');
  const signature = value => value?._rev || JSON.stringify(value ?? null);
  const asMap = value => Object.fromEntries(Object.values(value || {}).filter(x => x?.id).map(x => [x.id, x]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const safeId = id => typeof id === 'string' && id.length > 0 && !/[.#$\[\]\/]/.test(id);
  const paymentDeletion = record => record.studentId && record._activityAt
    ? { studentId: record.studentId, _activityAt: record._activityAt } : true;
  LMS.DB = {
    exportBackup, app: null, db: null, auth: null, userId: null,
    isConfigured: false, isOnline: navigator.onLine, connected: false,
    scope: 'local', cache: {}, listeners: {}, legacyRoots: new Set(), subscribers: new Set(), syncCallbacks: {},
    pending: [], flushScheduled: false, writing: Promise.resolve(), processing: false, error: '',
    subscribe(callback) { this.subscribers.add(callback); return () => this.subscribers.delete(callback); },
    notify(key) { this.subscribers.forEach(fn => fn(key)); },
    fail(error) { this.error = error?.message || String(error); this.notify('status'); },
    status() {
      const count = (this.localLoad('offline_queue') || []).length;
      return { uid: this.userId, connected: this.connected, online: navigator.onLine,
        pending: count + this.pending.length, saving: this.flushScheduled, switching: !!this.switching, error: this.error };
    },
    async openScope(scope) {
      await this.flush();
      const saved = await LMS.Store.readScope(scope);
      this.scope = scope;
      this.legacyRoots = new Set();
      const cache = {};
      Object.entries(saved).forEach(([path, value]) => {
        const [key, id] = path.split('/');
        if (key === 'payments' && value?._deleted) (cache._paymentDeletions ||= {})[id] = paymentDeletion(value);
        if (id) { (cache[key] ||= {})[id] = value; }
        else cache[key] = value;
      });
      lists.forEach(key => { if (cache[key]) cache[key] = Object.values(cache[key]).filter(x => !x._deleted); });
      this.cache = cache;
      // Import the old login once, preserving its original expiry. Never upload it.
      if (cache.session === undefined) {
        const name = 'lms_session_' + scope;
        let session = null;
        try { session = JSON.parse(localStorage.getItem(name) || sessionStorage.getItem(name) || 'null'); } catch {}
        await LMS.Store.write(scope, [{ key: 'session', value: session }]);
        cache.session = session;
      }
      // One-time localStorage migration; the original source is retained for recovery.
      if (!saved._migrated && scope === 'local') {
        roots.concat('offline_queue').forEach(key => {
          try {
            const raw = localStorage.getItem('lms_' + key);
            if (raw) cache[key] = JSON.parse(raw);
          } catch (error) { this.fail(new Error('Cannot read legacy ' + key + ': ' + error.message)); }
        });
        const changes = [{ key: '_migrated', value: true }];
        roots.concat('offline_queue').forEach(key => {
          if (cache[key] === undefined) return;
          if (lists.includes(key)) Object.values(cache[key] || {}).filter(x => x?.id).forEach(x => changes.push({ key: key + '/' + x.id, value: x }));
          else if (key === 'attendance') Object.entries(cache[key] || {}).forEach(([day, value]) => changes.push({ key: key + '/' + day, value }));
          else changes.push({ key, value: cache[key] });
        });
        await LMS.Store.write(scope, changes);
      }
      lists.forEach(key => { if (cache[key] && !Array.isArray(cache[key])) cache[key] = Object.values(cache[key]); });
      this.noteInactiveDates(cache.students || []);
      if (scope === 'local') {
        if (cache.halls === undefined) this.stage('halls', LMS.DEFAULT_HALLS);
        if (cache.shifts === undefined) this.stage('shifts', LMS.DEFAULT_SHIFTS);
      }
      await this.recoverReceipts();
      await this.flush();
      this.notify('scope');
    },
    async boot() {
      await this.openScope('local');
      this.init();
      // Recover committed operations after a browser crash. Unsigned local data stays local.
      window.addEventListener('online', () => { this.isOnline = true; this.processOfflineQueue(); this.notify('status'); });
      window.addEventListener('offline', () => { this.isOnline = false; this.connected = false; this.notify('status'); });
      const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lms-records') : null;
      this.channel = channel;
      if (channel) channel.onmessage = async event => {
        if (event.data.scope !== this.scope || this.pending.length) return;
        await this.openScope(this.scope); this.processOfflineQueue();
      };
    },
    init() {
      if (this.auth) return true;
      try {
        if (typeof firebase === 'undefined') return false;
        this.app = firebase.apps.find(app => app.name === '[DEFAULT]') || firebase.initializeApp(FIREBASE_CONFIG);
        this.db = firebase.database(); this.auth = firebase.auth(); this.isConfigured = true;
        this.setupAuthListener(); return true;
      } catch (error) { this.fail(error); return false; }
    },
    setupAuthListener() {
      this.auth.onAuthStateChanged(user => {
        this.authReady = (this.authReady || Promise.resolve()).then(() => this.changeUser(user)).catch(error => this.fail(error));
      });
    },
    async changeUser(user) {
      const uid = user?.uid || null;
      if (uid === this.userId && this.authResolved) return;
      this.detachAllListeners();
      if (this.connectionRef) this.connectionRef.off();
      await this.flush();
      const previous = { uid: this.userId, scope: this.scope, cache: this.cache, legacyRoots: this.legacyRoots };
      this.switching = true; this.notify('status');
      this.userId = uid; this.connected = false; this.authResolved = true;
      try { await this.openScope(uid ? 'user:' + uid : 'local'); }
      catch (error) {
        this.userId = previous.uid; this.scope = previous.scope; this.cache = previous.cache; this.legacyRoots = previous.legacyRoots;
        this.pending = []; throw error;
      } finally { this.switching = false; this.notify('status'); }
      if (uid) {
        this.connectionRef = this.db.ref('.info/connected');
        this.connectionRef.on('value', snapshot => {
          this.connected = snapshot.val() === true;
          this.notify('status'); if (this.connected) this.processOfflineQueue();
        });
        await this.syncCloudToLocal();
        roots.forEach(key => this.listen(key, () => this.notify(key)));
      }
      this.notify('auth');
      this.syncCallbacks.onAuth?.(user);
    },
    async signInWithGoogle() {
      if (!this.auth) throw new Error('Google sign-in is unavailable offline.');
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        const result = await this.auth.signInWithPopup(provider);
        await this.authReady;
        if (this.userId !== result.user.uid) throw new Error('Cannot open this account’s local data. Sign-in was not completed.');
        return result.user;
      } catch (error) {
        if (error.code === 'auth/popup-blocked') { await this.auth.signInWithRedirect(provider); return null; }
        throw error;
      }
    },
    async signOut() { await this.flush(); if (this.auth) await this.auth.signOut(); await this.authReady; },
    getPath(key) {
      const parts = cleanKey(key).split('/');
      if (lists.includes(parts[0]) || parts[0] === 'attendance') parts[0] += '_v2';
      return 'users/' + this.userId + (key ? '/' + parts.join('/') : '');
    },
    localLoad(key, fallback = null) {
      key = cleanKey(key);
      return this.cache[key] ?? fallback;
    },
    localSave(key, value) {
      key = cleanKey(key);
      if (key === 'session') {
        return this.stage(key, value, false);
      }
      return this.stage(key, value);
    },
    localRemove(key) {
      if (key === 'session') { this.stage(key, null, false); }
      else this.stage(key, null);
    },
    stage(key, value, cloud = true, { trackActivity = true } = {}) {
      key = cleanKey(key);
      const previous = this.cache[key];
      if (previous === value) return true;
      const changes = [];
      if (lists.includes(key)) {
        const before = asMap(previous), after = asMap(value);
        Object.keys({ ...before, ...after }).forEach(id => {
          if (before[id] === after[id] || JSON.stringify(before[id]) === JSON.stringify(after[id])) return;
          if (!safeId(id)) throw new Error('Invalid record ID');
          if (cloud && before[id] && after[id] && before[id]._rev && after[id]._rev !== before[id]._rev) throw new Error('Record changed while the form was open. Reopen it before saving: ' + key + '/' + id);
          const activity = cloud && trackActivity && (key === 'students' || key === 'payments') ? { _activityAt: Date.now() } : {};
          const record = after[id] ? (cloud ? clone({ ...after[id], ...activity, _rev: LMS.generateId(), _updatedAt: Date.now() }) : after[id]) : { id, _deleted: true, ...activity, ...(key === 'payments' && before[id]?.studentId ? { studentId: before[id].studentId } : {}), _rev: LMS.generateId(), _updatedAt: Date.now() };
          changes.push({ key, id, value: record, base: signature(before[id]), cloud });
          if (after[id]) after[id] = record;
        });
        value = Object.values(after);
      } else if (key === 'attendance') {
        Object.keys({ ...previous, ...value }).forEach(day => {
          const before = previous?.[day] || {}, after = value?.[day] || {};
          Object.keys({ ...before, ...after }).forEach(id => {
            if (before[id] === after[id]) return;
            if (!safeId(id) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid attendance entry');
            changes.push({ key, id: day + '/' + id, value: after[id] ?? null, base: signature(before[id]), cloud });
          });
        });
      } else if (JSON.stringify(previous) !== JSON.stringify(value)) {
        changes.push({ key, value, base: signature(previous), cloud });
      }
      this.cache[key] = value;
      if (key === 'students') this.noteInactiveDates(value);
      if (key === 'payments') {
        const deleted = { ...this.localLoad('_paymentDeletions', {}) };
        changes.filter(change => change.value?._deleted).forEach(change => deleted[change.id] = paymentDeletion(change.value));
        if (changes.some(change => change.value?._deleted)) this.stage('_paymentDeletions', deleted, false);
      }
      this.pending.push(...changes);
      if (changes.length && !this.flushScheduled) {
        this.flushScheduled = true;
        queueMicrotask(() => this.flush().catch(error => this.fail(error)));
      }
      this.notify(key); return true;
    },
    noteInactiveDates(students) {
      const known = { ...this.localLoad('_inactiveFirstSeen', {}) };
      let changed = false;
      (students || []).forEach(student => {
        if (student.isActive === false && !student.deactivatedAt && !known[student.id]) { known[student.id] = LMS.today(); changed = true; }
      });
      if (changed) this.stage('_inactiveFirstSeen', known, false);
    },
    async flush() {
      if (!this.pending.length) { await this.writing; return; }
      const changes = this.pending.splice(0), scope = this.scope, uid = this.userId;
      this.flushScheduled = false;
      const perform = async () => {
        let queue;
        try {
          const disk = await LMS.Store.readScope(scope);
          // Persist whole day's local attendance but send individual cells to cloud.
          const writes = changes.filter(x => x.key !== 'attendance').map(x => ({ key: x.key + (x.id ? '/' + x.id : ''), value: x.value }));
          const days = new Set(changes.filter(x => x.key === 'attendance').map(x => x.id.split('/')[0]));
          days.forEach(day => {
            const dayValue = { ...(disk['attendance/' + day] || {}) };
            changes.filter(x => x.key === 'attendance' && x.id.startsWith(day + '/')).forEach(x => { const id = x.id.split('/')[1]; if (x.value == null) delete dayValue[id]; else dayValue[id] = x.value; });
            writes.push({ key: 'attendance/' + day, value: dayValue });
          });
          const cloudChanges = changes.filter(x => x.cloud && roots.includes(x.key));
          const operation = uid && cloudChanges.length ? { id: LMS.generateId(), uid, changes: cloudChanges } : null;
          queue = await LMS.Store.commit(scope, writes, current => operation ? [...current, operation] : current);
        } catch (error) {
          // Retain unsaved work in memory for retry; never report it as durable.
          if (scope === this.scope) this.pending.unshift(...changes);
          throw new Error('Data save failed. Keep this page open and free storage, then Retry: ' + error.message);
        }
        if (scope === this.scope) this.cache.offline_queue = queue;
        if (scope === this.scope && this.error.startsWith('Data save failed')) this.error = '';
        this.channel?.postMessage({ scope }); this.notify('status');
      };
      this.writing = this.writing.catch(() => {}).then(perform);
      await this.writing;
      if (uid && uid === this.userId) this.processOfflineQueue();
    },
    async restoreCollections(data) {
      if (this.switching) throw new Error('Wait for the account change to finish before importing.');
      const scope = this.scope;
      await this.flush();
      if (scope !== this.scope || this.switching) throw new Error('Account changed. Select the backup again.');
      const allowed = [...lists, 'settings', 'attendance'];
      const keys = allowed.filter(key => Object.prototype.hasOwnProperty.call(data, key));
      if (!keys.length) throw new Error('This JSON does not contain any library records.');

      // Plan every collection before publishing anything. Restore deliberately
      // replaces current records; its revisions must be based on current data,
      // while ordinary edit forms retain the strict stale-revision guard.
      const draft = Object.assign(Object.create(this), {
        cache: { ...this.cache }, pending: [], flushScheduled: true, notify() {}
      });
      for (const key of keys) {
        let value = clone(data[key]);
        if (lists.includes(key)) {
          if (!Array.isArray(value)) throw new Error(key + ' must be a list of records.');
          const seen = new Set(), current = asMap(this.localLoad(key, []));
          value = value.map(record => {
            if (!record || typeof record !== 'object' || Array.isArray(record) || !safeId(record.id)) throw new Error(key + ' contains an invalid record ID.');
            if (seen.has(record.id)) throw new Error(key + ' contains duplicate record IDs.');
            seen.add(record.id);
            return { ...record, _rev: current[record.id]?._rev };
          });
        } else if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(key + ' must be an object.');
        }
        draft.stage(key, value, true, { trackActivity: false });
      }
      // An explicit restore may bring back receipts previously deleted locally.
      const deleted = { ...draft.localLoad('_paymentDeletions', {}) };
      (data.payments || []).forEach(payment => delete deleted[payment.id]);
      (data.students || []).forEach(student => (student.pastHistory || []).forEach(history =>
        (history.archivedPayments || []).forEach(payment => delete deleted[payment.id])));
      draft.stage('_paymentDeletions', deleted, false);

      this.cache = draft.cache;
      this.pending.push(...draft.pending);
      this.notify('restore');
      try { await this.flush(); }
      catch (error) { this.fail(error); throw error; }
      return Object.fromEntries(keys.map(key => [key, Array.isArray(data[key]) ? data[key].length : null]));
    },
    async save(key, value) { this.stage(key, value); await this.flush(); return true; },
    async saveItem(key, item) {
      key = cleanKey(key); const list = this.localLoad(key, []);
      const old = list.find(x => x.id === item.id);
      // Legacy explicit calls immediately after a state setter must not create another write.
      if (old && Object.keys(item).every(k => JSON.stringify(old[k]) === JSON.stringify(item[k]))) return true;
      this.stage(key, old ? list.map(x => x.id === item.id ? item : x) : [...list, item]);
      await this.flush(); return true;
    },
    async removeItem(key, id) { key = cleanKey(key); this.stage(key, this.localLoad(key, []).filter(x => x.id !== id)); await this.flush(); return true; },
    async childSave(key, child, data) {
      key = cleanKey(key); const current = this.localLoad(key, {});
      const next = clone(current); const parts = child.split('/');
      let target = next; parts.slice(0, -1).forEach(part => target = target[part] ||= {});
      if (data == null) delete target[parts.at(-1)]; else target[parts.at(-1)] = data;
      this.stage(key, next); await this.flush(); return true;
    },
    mergeRemote(key, raw) {
      const pending = (this.localLoad('offline_queue', [])).flatMap(x => x.changes || []).concat(this.pending).filter(x => x.key === key);
      if (lists.includes(key)) {
        const map = asMap(raw);
        pending.forEach(change => map[change.id] = change.value);
        return Object.values(map).filter(x => !x._deleted);
      }
      if (key === 'attendance') {
        const merged = clone(raw || {});
        pending.forEach(({ id, value }) => { const [day, student] = id.split('/'); const cell = merged[day] ||= {}; if (value == null) delete cell[student]; else cell[student] = value; });
        return merged;
      }
      return pending.length ? pending.at(-1).value : raw;
    },
    async acceptRemote(key, raw, scope = this.scope) {
      if (scope !== this.scope) return;
      if (key === 'payments') {
        const removed = Object.values(raw || {}).filter(record => record?._deleted);
        if (removed.length) this.stage('_paymentDeletions', { ...this.localLoad('_paymentDeletions', {}), ...Object.fromEntries(removed.map(record => [record.id, paymentDeletion(record)])) }, false);
      }
      const value = this.mergeRemote(key, raw);
      this.stage(key, value, false);
      await this.flush(); this.notify(key);
    },
    listen(key, callback) {
      if (!this.userId) return;
      this.detachListener(key);
      const scope = this.scope, ref = this.db.ref(this.getPath(key));
      if (lists.includes(key) || key === 'attendance') {
        let map = {}, ready = false, timer;
        const early = [];
        const schedule = () => {
          clearTimeout(timer);
          timer = setTimeout(() => this.acceptRemote(key, map, scope).then(() => {
            if (scope === this.scope) callback(this.localLoad(key));
          }).catch(error => this.fail(error)), 20);
        };
        const handlers = ['child_added', 'child_changed', 'child_removed'].map(event => {
          const handler = snapshot => {
            const update = { id: snapshot.key, value: event === 'child_removed' ? null : snapshot.val() };
            if (!ready) { early.push(update); return; }
            if (update.value == null) delete map[update.id]; else map[update.id] = update.value;
            schedule();
          };
          ref.on(event, handler, error => this.fail(error)); return { event, handler };
        });
        const entry = { ref, handlers, cancel: () => clearTimeout(timer), cancelled: false };
        this.listeners[key] = entry;
        ref.once('value').then(snapshot => {
          if (entry.cancelled || scope !== this.scope) return;
          if (snapshot.val() == null && this.legacyRoots.has(key)) map = lists.includes(key) ? asMap(this.localLoad(key, [])) : this.localLoad(key, {});
          else map = snapshot.val() || {};
          early.forEach(update => { if (update.value == null) delete map[update.id]; else map[update.id] = update.value; });
          ready = true; schedule();
        }).catch(error => this.fail(error));
        return;
      }
      const handler = ref.on('value', snapshot => {
        if (snapshot.val() == null && this.legacyRoots.has(key)) return;
        this.acceptRemote(key, snapshot.val(), scope).then(() => { if (scope === this.scope) callback(this.localLoad(key)); }).catch(error => this.fail(error));
      }, error => this.fail(error));
      this.listeners[key] = { ref, handler };
    },
    detachListener(key) {
      const entry = this.listeners[key];
      if (entry) {
        entry.cancelled = true; entry.cancel?.();
        if (entry.handlers) entry.handlers.forEach(({ event, handler }) => entry.ref.off(event, handler));
        else entry.ref.off('value', entry.handler);
        delete this.listeners[key];
      }
    },
    detachAllListeners() { Object.keys(this.listeners).forEach(key => this.detachListener(key)); },
    async load(key, fallback) { return this.localLoad(cleanKey(key), fallback); },
    async recoverReceipts(deleted = new Set()) {
      if (this.cache._ledgerRecovered) return;
      if (!this.cache.students) return;
      const before = this.localLoad('payments', []);
      const recovered = LMS.allPayments(before, this.cache.students).filter(payment => !deleted.has(payment.id));
      if (recovered.length !== before.length) this.stage('payments', recovered, true, { trackActivity: false });
      this.cache._ledgerRecovered = true;
      await LMS.Store.write(this.scope, [{ key: '_ledgerRecovered', value: true }]);
      await this.flush();
    },
    async syncCloudToLocal() {
      if (!this.userId) return false;
      const uid = this.userId, scope = this.scope;
      try {
        const snapshot = await this.db.ref('users/' + uid).once('value');
        const data = snapshot.val() || {};
        for (const key of roots) {
          // Read legacy data only when v2 has never been written. Keep legacy source intact.
          const raw = data[key + '_v2'] ?? data[key] ?? (key === 'halls' ? LMS.DEFAULT_HALLS : key === 'shifts' ? LMS.DEFAULT_SHIFTS : lists.includes(key) ? {} : key === 'attendance' ? {} : null);
          if (lists.includes(key) && (data[key + '_v2'] == null && data[key] != null || Object.entries(data[key + '_v2'] || {}).some(([id, value]) => value?.id && value.id !== id))) this.legacyRoots.add(key);
          await this.acceptRemote(key, raw, scope);
        }
        if (scope === this.scope) await this.recoverReceipts(new Set(Object.values(data.payments_v2 || {}).filter(p => p._deleted).map(p => p.id)));
        return true;
      } catch (error) { this.fail(error); return false; }
    },
    async syncLocalToCloud() {
      // Periodic backup callers only drain pending changes; never re-upload stale records.
      await this.flush(); return this.processOfflineQueue();
    },
    async runTransaction(path, update) {
      const ref = this.db.ref(path), retain = () => {};
      // A transaction can initially receive null when this path is not cached.
      // Retain a completed read through the revision check, so an empty cache
      // is never mistaken for a remotely deleted record.
      ref.on('value', retain, error => this.fail(error));
      try {
        await ref.once('value');
        return await ref.transaction(update, undefined, false);
      } finally { ref.off('value', retain); }
    },
    async processOfflineQueue() {
      if (this.processing || !this.userId || !navigator.onLine || this.pending.length) return false;
      this.processing = true;
      const scope = this.scope, uid = this.userId;
      try {
        const queue = this.localLoad('offline_queue', []).slice();
        for (const operation of queue) {
          if (uid !== this.userId || operation.uid !== uid) break;
          let conflict = '';
          const businessChanges = operation.changes.filter(change => change.key !== 'activityLog');
          // A single unrelated record needs only a record transaction. Related student changes
          // still commit together at the user root, where seat/roll constraints can be checked.
          const granular = businessChanges.length === 1 && !['students', 'halls', 'shifts'].includes(businessChanges[0].key) && !this.legacyRoots.has(businessChanges[0].key);
          if (granular) {
            const change = businessChanges[0];
            const result = await this.runTransaction(this.getPath(change.key + (change.id ? '/' + change.id : '')), remote => {
              if (remote?._rev && remote._rev === change.value?._rev || signature(remote) === signature(change.value)) return remote;
              if (!operation.force && signature(remote) !== change.base && !(change.value?._deleted && remote == null)) { conflict = 'Cloud changed ' + change.key + (change.id ? '/' + change.id : '') + '. Review before overwriting.'; return; }
              return change.value;
            });
            if (!result.committed) throw new Error(conflict || 'Cloud transaction was not committed');
            // Logs are independent of the financial/attendance record; retries are idempotent.
            for (const log of operation.changes.filter(x => x.key === 'activityLog')) {
              await this.db.ref(this.getPath('activityLog/' + log.id)).transaction(remote => remote?._rev === log.value._rev ? remote : log.value, undefined, false);
            }
          } else {
          const result = await this.runTransaction('users/' + uid, current => {
            conflict = '';
            const data = clone(current || {});
            for (const change of operation.changes) {
              const root = lists.includes(change.key) || change.key === 'attendance' ? change.key + '_v2' : change.key;
              if (lists.includes(change.key)) data[root] = asMap(data[root] ?? data[change.key]);
              else if (change.key === 'attendance') data[root] ||= clone(data.attendance || {});
              const parts = change.id ? [root, ...change.id.split('/')] : [root];
              let parent = data; parts.slice(0, -1).forEach(part => parent = parent[part] ||= {});
              const name = parts.at(-1), remote = parent[name];
              if (remote?._rev && remote._rev === change.value?._rev) continue;
              if (!operation.force && signature(remote) !== change.base && !(change.value?._deleted && remote == null)) {
                conflict = 'Cloud changed ' + change.key + (change.id ? '/' + change.id : '') + '. Review before overwriting.'; return;
              }
              if (change.value == null) delete parent[name]; else parent[name] = change.value;
            }
            // Seat policy and shift conflicts are checked against the same atomic snapshot.
            const rolls = new Set();
            if (operation.changes.some(change => change.key === 'students')) {
            for (const student of Object.values(data.students_v2 || {})) {
              if (student._deleted) continue;
              const roll = String(student.rollNo || '').trim().toUpperCase();
              if (roll && rolls.has(roll)) { conflict = 'Duplicate roll number: ' + roll; return; } rolls.add(roll);
            }
            }
            if (operation.changes.some(change => ['students', 'halls', 'shifts'].includes(change.key))) {
              const liveStudents = Object.values(data.students_v2 || data.students || {}).filter(s => !s._deleted);
              const liveHalls = Object.values(data.halls_v2 ?? data.halls ?? LMS.DEFAULT_HALLS).filter(h => !h._deleted);
              const liveShifts = Object.values(data.shifts_v2 ?? data.shifts ?? LMS.DEFAULT_SHIFTS).filter(s => !s._deleted);
              const changedStudents = new Set(operation.changes.filter(c => c.key === 'students').map(c => c.id));
              const changedHalls = new Set(operation.changes.filter(c => c.key === 'halls').map(c => c.id));
              const changedShifts = new Set(operation.changes.filter(c => c.key === 'shifts').map(c => c.id));
              const oldHalls = Object.values(current?.halls_v2 ?? current?.halls ?? LMS.DEFAULT_HALLS).filter(h => !h._deleted);
              for (const student of liveStudents) {
                if (!student.assignedSeat || student.isActive === false) continue;
                const hallId = LMS.resolveSeat(student.assignedSeat, liveHalls)?.hall.id || LMS.resolveSeat(student.assignedSeat, oldHalls)?.hall.id;
                if (!changedStudents.has(student.id) && !changedHalls.has(hallId) && !changedShifts.has(student.shift)) continue;
                const error = LMS.seatAssignmentError(student.assignedSeat, student, liveStudents, liveHalls, liveShifts);
                if (error) { conflict = student.name + ': ' + error; return; }
              }
            }
            return data;
          });
          if (!result.committed) throw new Error(conflict || 'Cloud transaction was not committed');
          operation.changes.forEach(change => this.legacyRoots.delete(change.key));
          }
          // Remove only the acknowledged ID from the CURRENT durable queue, including new arrivals.
          const checkpoint = () => LMS.Store.commit(scope, [], current => current.filter(x => x.id !== operation.id));
          this.writing = this.writing.catch(() => {}).then(checkpoint);
          const remaining = await this.writing;
          if (scope === this.scope) this.cache.offline_queue = remaining;
        }
        if (scope === this.scope) this.error = '';
        return true;
      } catch (error) { if (scope === this.scope) this.fail(error); return false; }
      finally {
        this.processing = false; this.notify('status');
        const left = this.localLoad('offline_queue', []);
        if (!this.error && left.length && uid === this.userId) setTimeout(() => this.processOfflineQueue(), 250);
      }
    },
    async resolveConflict(keepLocal) {
      await this.flush();
      const queue = this.localLoad('offline_queue', []);
      if (!queue.length) { this.error = ''; this.notify('status'); return; }
      const next = keepLocal ? queue.map((op, i) => i ? op : { ...op, force: true }) : queue.slice(1);
      this.cache.offline_queue = await LMS.Store.commit(this.scope, [], current => keepLocal ? current.map(op => op.id === queue[0].id ? { ...op, force: true } : op) : current.filter(op => op.id !== queue[0].id)); this.error = '';
      if (!keepLocal) await this.syncCloudToLocal();
      await this.processOfflineQueue(); this.notify('status');
    }
  };
})();
