// ==================== FIREBASE-DB.JS - Cloud Database Layer ====================
// Uses Firebase Realtime Database for cloud storage
// FREE tier: 1GB storage, 10GB/month transfer

window.LMS = window.LMS || {};

// ⚠️ SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com
// 2. Click "Add Project" → name it → Continue
// 3. Go to "Build" → "Realtime Database" → "Create Database"
// 4. Choose region → Start in TEST MODE
// 5. Go to Project Settings (gear icon) → scroll to "Your apps" → click Web (</>)
// 6. Register app → Copy the firebaseConfig object below
// 7. Replace the placeholder config with YOUR config
// 8. IMPORTANT: Go to Realtime Database → Rules → set:
//    { "rules": { ".read": "auth != null", ".write": "auth != null" } }
//    OR for simplest setup (less secure, ok for personal use):
//    { "rules": { ".read": true, ".write": true } }
// 9. Go to "Authentication" → "Sign-in method" → Enable "Google"

// ════════════════════════════════════════════════════
// 🔧 PASTE YOUR FIREBASE CONFIG HERE
// ════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCnlCjW_YwafFJsj1abHFl5DiwxM1EmLUM",
  authDomain: "magadhlibrary-22d4f.firebaseapp.com",
  databaseURL: "https://magadhlibrary-22d4f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "magadhlibrary-22d4f",
  storageBucket: "magadhlibrary-22d4f.firebasestorage.app",
  messagingSenderId: "361371381370",
  appId: "1:361371381370:web:1f7a06f5b247ee117255c3"
};
// ════════════════════════════════════════════════════

LMS.DB = {
  app: null,
  db: null,
  auth: null,
  userId: null,
  isConfigured: false,
  isOnline: navigator.onLine,
  listeners: {},
  syncCallbacks: {},

  enqueueOfflineAction(action) {
    let queue = this.localLoad('offline_queue') || [];
    queue.push({ ...action, timestamp: Date.now() });
    this.localSave('offline_queue', queue);
  },

  async processOfflineQueue() {
    let queue = this.localLoad('offline_queue') || [];
    if (queue.length === 0) return;
    
    console.log(`Processing ${queue.length} offline actions...`);
    const newQueue = [];
    for (const action of queue) {
      let success = false;
      try {
        if (action.type === 'saveItem') {
           success = await this.saveItem(action.collection, action.item, true); 
        } else if (action.type === 'removeItem') {
           success = await this.removeItem(action.collection, action.itemId, true);
        }
      } catch(e) {
        success = false;
      }
      if (!success) newQueue.push(action);
    }
    this.localSave('offline_queue', newQueue);
  },

  init() {
    try {
      if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === "YOUR_API_KEY_HERE") {
        console.warn('Firebase not configured. Using localStorage fallback.');
        this.isConfigured = false;
        return false;
      }
      this.app = firebase.initializeApp(FIREBASE_CONFIG);
      this.db = firebase.database();
      this.auth = firebase.auth();
      this.isConfigured = true;
      this.setupAuthListener();
      return true;
    } catch (e) {
      console.error('Firebase init error:', e);
      this.isConfigured = false;
      return false;
    }
  },

  setupAuthListener() {
    if (!this.auth) return;
    // Handle redirect result (if coming back from Google sign-in redirect)
    this.auth.getRedirectResult().then((result) => {
      if (result && result.user) {
        console.log('Redirect sign-in successful:', result.user.email);
      }
    }).catch((err) => {
      console.error('Redirect result error:', err);
    });
    this.auth.onAuthStateChanged((user) => {
      if (user) {
        this.userId = user.uid;
        this.isOnline = navigator.onLine;
        
        window.addEventListener('online', () => {
          this.isOnline = true;
          this.processOfflineQueue();
        });
        window.addEventListener('offline', () => {
          this.isOnline = false;
        });

        if (this.syncCallbacks.onAuth) this.syncCallbacks.onAuth(user);
        // TRIGGER V2 MIGRATION AFTER LOGIN
        this.migrateToV2();
        if (this.isOnline) this.processOfflineQueue();
      } else {
        this.userId = null;
        this.isOnline = false;
        if (this.syncCallbacks.onAuth) this.syncCallbacks.onAuth(null);
      }
    });
  },

  async signInWithGoogle() {
    if (!this.auth) return null;
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      // Try popup first, fallback to redirect
      try {
        const result = await this.auth.signInWithPopup(provider);
        return result.user;
      } catch (popupErr) {
        console.warn('Popup failed, trying redirect:', popupErr.code);
        if (popupErr.code === 'auth/popup-blocked' ||
          popupErr.code === 'auth/popup-closed-by-user' ||
          popupErr.code === 'auth/cancelled-popup-request' ||
          popupErr.code === 'auth/internal-error') {
          await this.auth.signInWithRedirect(provider);
          return null; // Will redirect, result handled by onAuthStateChanged
        }
        throw popupErr;
      }
    } catch (e) {
      console.error('Google sign-in error:', e);
      return null;
    }
  },

  async signOut() {
    if (!this.auth) return;
    try {
      this.detachAllListeners();
      await this.auth.signOut();
      this.userId = null;
      this.isOnline = false;
    } catch (e) {
      console.error('Sign out error:', e);
    }
  },

  getPath(key) {
    // V2 MIGRATION: ISOLATE GRANULAR DATA TO PREVENT LEGACY OVERWRITES
    const v2Keys = ['students', 'payments', 'halls', 'shifts', 'expenses', 'activityLog', 'pendingWork', 'attendance'];

    // Check if key is already suffixed (e.g. from internal calls)
    if (key.endsWith('_v2')) return `users/${this.userId}/${key}`;

    // Check if it's a child path (e.g. 'attendance/2023-10-01')
    const parts = key.split('/');
    const rootKey = parts[0];

    if (v2Keys.includes(rootKey)) {
      parts[0] = rootKey + '_v2';
      return `users/${this.userId}/${parts.join('/')}`;
    }

    return `users/${this.userId}/${key}`;
  },

  // DATA MIGRATION V1 -> V2 (Disabled to prevent split-brain)
  async migrateToV2() {
    // Migration disabled to maintain backwards compatibility with cached clients
    return;
  },

  // Save data to Firebase (WHOLE COLLECTION OVERWRITE)
  // ⚠️ WARNING: Use this ONLY for small, monolithic objects like 'settings'
  // DO NOT use for 'students', 'payments', etc. as it causes race conditions
  async save(key, data) {
    if (!this.isConfigured || !this.userId) {
      return this.localSave(key, data);
    }

    // Safety check: Prevent accidental overwrite of granular collections
    const granularKeys = ['students', 'payments', 'halls', 'shifts', 'expenses', 'activityLog', 'pendingWork', 'attendance'];
    if (granularKeys.includes(key)) {
      console.warn(`⚠️ BLOCKED: Attempted full overwrite of granular key '${key}'. Use saveItem() instead.`);
      return false;
    }

    try {
      await this.db.ref(this.getPath(key)).set(data);
      this.localSave(key, data); // keep local copy
      return true;
    } catch (e) {
      console.error('Firebase save error:', e);
      this.localSave(key, data);
      return false;
    }
  },

  // Save specific child path (e.g., attendance/2023-10-01)
  // This is efficient for daily attendance
  async childSave(parentKey, childKey, data) {
    if (!this.isConfigured || !this.userId) return false;
    try {
      // getPath handles _v2 suffix automatically
      await this.db.ref(this.getPath(`${parentKey}/${childKey}`)).set(data);
      return true;
    } catch (e) {
      console.error(`Error saving child ${parentKey}/${childKey}:`, e);
      return false;
    }
  },

  // Load data from Firebase
  async load(key, defaultValue) {
    if (!this.isConfigured || !this.userId) {
      return this.localLoad(key, defaultValue);
    }
    try {
      const snapshot = await this.db.ref(this.getPath(key)).once('value');
      const val = snapshot.val();
      if (val !== null && val !== undefined) {
        this.localSave(key, val);
        return val;
      }
      // If Firebase has no data, check local and push up (only for settings/owner)
      const localVal = this.localLoad(key, defaultValue);
      if (localVal !== defaultValue && (key === 'settings' || key === 'owner')) {
        await this.db.ref(this.getPath(key)).set(localVal);
      }
      return localVal;
    } catch (e) {
      console.error('Firebase load error:', e);
      return this.localLoad(key, defaultValue);
    }
  },

  // Real-time listener
  listen(key, callback) {
    if (!this.isConfigured || !this.userId) return;
    this.detachListener(key);
    const ref = this.db.ref(this.getPath(key));
    const handler = ref.on('value', (snapshot) => {
      let val = snapshot.val();

      // Optimization: If val is null/undefined, just callback
      if (val === null || val === undefined) {
        callback(val);
        return;
      }

      // Convert Map to Array for lists if necessary
      const arrayKeys = ['students', 'payments', 'halls', 'shifts', 'expenses', 'activityLog', 'pendingWork'];
      if (arrayKeys.includes(key) && !Array.isArray(val)) {
        val = Object.values(val);
      }

      // UNIVERSAL DEDUPLICATION
      // Prevents "ghost" duplicates if network retries happen
      if (Array.isArray(val)) {
        const uniqueMap = new Map();
        val.forEach(item => {
          if (item && item.id) {
            // If duplicate ID exists, keep the one with newer timestamp or merge?
            // For simplicity, last one wins (Firebase order is usually consistent)
            uniqueMap.set(item.id, item);
          } else {
            // Items without ID (shouldn't happen, but fallback)
            uniqueMap.set(JSON.stringify(item), item);
          }
        });
        val = Array.from(uniqueMap.values());
      }

      callback(val);
    });
    this.listeners[key] = { ref, handler };
  },

  detachListener(key) {
    if (this.listeners[key]) {
      this.listeners[key].ref.off('value', this.listeners[key].handler);
      delete this.listeners[key];
    }
  },

  detachAllListeners() {
    Object.keys(this.listeners).forEach(key => this.detachListener(key));
  },

  // Local storage fallback
  localSave(key, data) {
    try {
      localStorage.setItem('lms_' + key, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  },

  localLoad(key, defaultValue) {
    try {
      const item = localStorage.getItem('lms_' + key);
      return item ? JSON.parse(item) : (defaultValue !== undefined ? defaultValue : null);
    } catch (e) { return defaultValue !== undefined ? defaultValue : null; }
  },

  localRemove(key) {
    localStorage.removeItem('lms_' + key);
  },

  // Sync a single item (Granular Update) - FAST & SAFE
  async saveItem(collection, item, skipQueue = false) {
    if (!this.isConfigured || !this.userId || !item.id) return false;
    
    if (!navigator.onLine && !skipQueue) {
      this.enqueueOfflineAction({ type: 'saveItem', collection, item });
      return true; // Pretend it succeeded locally
    }
    try {
      const parentRef = this.db.ref(this.getPath(collection));
      const snapshot = await parentRef.orderByChild('id').equalTo(item.id).once('value');
      const updates = {};
      
      if (snapshot.exists()) {
        snapshot.forEach(child => {
          if (child.key !== item.id) {
            updates[child.key] = null; // Clean up legacy numerical keys
          }
        });
      }
      updates[item.id] = item; // Set the actual item
      
      await parentRef.update(updates);
      return true;
    } catch (e) {
      console.error(`Error saving item to ${collection}:`, e);
      return false;
    }
  },

  // Remove a single item
  async removeItem(collection, itemId, skipQueue = false) {
    if (!this.isConfigured || !this.userId || !itemId) return false;

    if (!navigator.onLine && !skipQueue) {
      this.enqueueOfflineAction({ type: 'removeItem', collection, itemId });
      return true;
    }
    try {
      const parentRef = this.db.ref(this.getPath(collection));
      const snapshot = await parentRef.orderByChild('id').equalTo(itemId).once('value');
      const updates = {};
      
      updates[itemId] = null; // Remove direct path
      
      if (snapshot.exists()) {
        snapshot.forEach(child => {
          updates[child.key] = null; // Remove legacy keys
        });
      }
      
      await parentRef.update(updates);
      return true;
    } catch (e) {
      console.error(`Error removing item from ${collection}:`, e);
      return false;
    }
  },

  // Upload all local data to Firebase
  // MODIFIED: Uses update() for granular items to merge, set() for settings/monolithic
  async syncLocalToCloud() {
    if (!this.isConfigured || !this.userId) return false;

    try {
      // 1. Monolithic Settings (Safe to overwrite if we assume local is master on first sync)
      const settings = this.localLoad('settings');
      if (settings) await this.db.ref(this.getPath('settings')).set(settings);

      const owner = this.localLoad('owner');
      if (owner) await this.db.ref(this.getPath('owner')).set(owner);

      // 2. Granular Data (Merge, don't overwrite entire list)
      const granularKeys = ['students', 'payments', 'halls', 'shifts', 'expenses', 'activityLog', 'pendingWork', 'attendance'];

      for (const key of granularKeys) {
        const localList = this.localLoad(key);
        if (Array.isArray(localList) && localList.length > 0) {
          const updates = {};

          // Determine if this key needs _v2 suffix (match logic in getPath)
          const isV2 = ['students', 'payments', 'halls', 'shifts', 'expenses', 'activityLog', 'pendingWork', 'attendance'].includes(key);
          const targetKey = isV2 ? `${key}_v2` : key;

          localList.forEach(item => {
            if (item.id) {
              updates[`${targetKey}/${item.id}`] = item;
            }
          });
          // Perform a multi-path update
          if (Object.keys(updates).length > 0) {
            await this.db.ref(this.getPath('').replace(/\/$/, '')).update(updates);
          }
        }
      }

      return true;
    } catch (e) {
      console.error('Sync error:', e);
      return false;
    }
  },

  // Download all cloud data to local
  async syncCloudToLocal() {
    if (!this.isConfigured || !this.userId) return false;
    const keys = ['students', 'payments', 'halls', 'shifts', 'settings', 'activityLog', 'pendingWork', 'expenses', 'owner', 'attendance'];
    try {
      for (const key of keys) {
        const snapshot = await this.db.ref(this.getPath(key)).once('value');
        let val = snapshot.val();

        // Convert Map to Array for lists if necessary
        const arrayKeys = ['students', 'payments', 'halls', 'shifts', 'expenses', 'activityLog', 'pendingWork'];
        if (arrayKeys.includes(key) && val && !Array.isArray(val)) {
          val = Object.values(val);
        }

        if (val !== null) {
          this.localSave(key, val);
        }
      }
      return true;
    } catch (e) {
      console.error('Sync error:', e);
      return false;
    }
  },

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
