// Durable per-record storage. The folder-backup handle database is separate.
window.LMS = window.LMS || {};
LMS.Store = {
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('LMS_RECORDS', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    this.db.onversionchange = () => { this.db.close(); this.db = null; };
    return this.db;
  },
  async readScope(scope) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const output = {};
      const tx = db.transaction('records', 'readonly');
      const request = tx.objectStore('records').openCursor(IDBKeyRange.bound(scope + '|', scope + '|\uffff'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { output[cursor.key.slice(scope.length + 1)] = cursor.value; cursor.continue(); }
      };
      tx.oncomplete = () => resolve(output);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage read failed'));
    });
  },
  async write(scope, changes) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      changes.forEach(({ key, value, remove }) => {
        if (remove) store.delete(scope + '|' + key);
        else store.put(value, scope + '|' + key);
      });
      tx.oncomplete = () => resolve(true);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage write failed'));
    });
  },
  async commit(scope, changes, transformQueue) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records');
      let queue;
      const request = store.get(scope + '|offline_queue');
      request.onsuccess = () => {
        queue = transformQueue(request.result || []);
        changes.forEach(({ key, value, remove }) => {
          if (remove) store.delete(scope + '|' + key); else store.put(value, scope + '|' + key);
        });
        store.put(queue, scope + '|offline_queue');
      };
      tx.oncomplete = () => resolve(queue);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage transaction failed'));
    });
  }
};

// Authentication metadata has its own scope and is never part of the sync outbox.
LMS.LoginStorage = {
  async read(key, create) {
    const db = await LMS.Store.open();
    let legacy = null;
    try { legacy = localStorage.getItem(key); } catch {}
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      const request = store.get('device-auth|' + key);
      let value;
      request.onsuccess = () => {
        value = request.result;
        if (value === undefined) {
          value = legacy ?? (create ? create() : null);
          store.put(value, 'device-auth|' + key);
        }
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Cannot read login storage.'));
    });
  },
  async write(key, value) {
    await LMS.Store.write('device-auth', [{ key, value }]);
    // A null tombstone prevents old localStorage credentials from being restored.
    try { localStorage.removeItem(key); } catch {}
  }
};
