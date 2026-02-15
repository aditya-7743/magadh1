// ==================== COMPONENTS.JS - Shared UI Components ====================
window.LMS = window.LMS || {};

// App Context
LMS.AppContext = createContext();

// Stylish Password Modal
LMS.PasswordModal = ({ isOpen, onClose, onSuccess, title = "Security Check" }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === 'Adit@7858' || password === '123') {
      onSuccess();
      onClose();
      setPassword('');
      setError(false);
    } else {
      setError(true);
      setTimeout(() => setError(false), 500);
    }
  };

  if (!isOpen) return null;

  /* Fixed React Error #31 by moving object out of markup */
  /* Fixed React Error #31: Style must be an object. Ensuring clean parsing. */
  const modalStyle = {
    background: 'rgba(30, 41, 59, 0.95)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  };

  return html`
        <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick=${onClose}></div>
            
            <div class="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 transform transition-all animate-pop" style=${modalStyle}>
                 
                <button onClick=${onClose} class="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>

                <div class="text-center mb-8">
                    <div class="w-20 h-20 mx-auto bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-purple-500/30">
                        <span class="text-4xl">🔐</span>
                    </div>
                    <h3 class="text-2xl font-bold text-white mb-2">${title}</h3>
                    <p class="text-gray-400 text-sm">Restricted Access. Authentication Required.</p>
                </div>

                <form onSubmit=${handleSubmit} class="space-y-6">
                    <div class="relative group">
                        <input 
                            ref=${inputRef}
                            type="password" 
                            class="w-full px-5 py-4 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all text-center text-xl tracking-widest"
                            placeholder="Enter Password"
                            value=${password}
                            onChange=${e => setPassword(e.target.value)}
                            style=${{ borderColor: error ? '#ef4444' : undefined }}
                        />
                        ${error && html`<p class="text-red-500 text-xs mt-2 text-center animate-shake font-bold">Access Denied</p>`}
                    </div>

                    <button 
                        type="submit" 
                        class="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:shadow-purple-500/40 transform hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
                    >
                        <span>UNLOCK SYSTEM</span>
                        <span>➔</span>
                    </button>
                </form>
            </div>
        </div>
    `;
};

// Button
LMS.Button = ({ children, variant = 'primary', size = 'md', className = '', ...props }) => {
  const cls = `btn btn-${variant} ${size !== 'md' ? 'btn-' + size : ''} ${className}`;
  return html`<button class=${cls} ...${props}>${children}</button>`;
};

// Input
LMS.Input = ({ label, error, className = '', ...props }) => {
  const handleInput = (e) => {
    if (props.autoCapitalize) {
      e.target.value = e.target.value.toUpperCase();
    }
    if (props.onChange) props.onChange(e);
  };

  return html`<div class="space-y-1 ${className}">
    ${label && html`<label class="input-label">${label}</label>`}
    <input class="input-field ${error ? 'error' : ''}" ...${props} onInput=${handleInput} />
    ${error && html`<p class="text-red-400 text-xs">${error}</p>`}
  </div>`;
};

// Select
LMS.Select = ({ label, options, className = '', ...props }) => {
  return html`<div class="space-y-1 ${className}">
    ${label && html`<label class="input-label">${label}</label>`}
    <select class="input-field" ...${props}>
      ${options.map(opt => html`<option key=${opt.value} value=${opt.value}>${opt.label}</option>`)}
    </select>
  </div>`;
};

// Card
LMS.Card = ({ children, className = '', ...props }) => {
  return html`<div class="card ${className}" ...${props}>${children}</div>`;
};

// Modal
LMS.Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;
  return html`<div class="modal-overlay">
    <div class="modal-backdrop" onClick=${onClose} />
    <div class="modal-content modal-${size} animate-scale-in">
      <div class="modal-header">
        <h2 class="text-xl font-semibold">${title}</h2>
        <button onClick=${onClose} class="btn btn-ghost btn-sm"><${LMS.Icons.Close} /></button>
      </div>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
};

// Avatar
LMS.Avatar = ({ src, name = 'User', size = 'md', className = '' }) => {
  if (src) {
    return html`<img src=${src} alt=${name} class="rounded-full object-cover border border-gray-200 ${className}" style=${{ width: size === 'lg' ? '3rem' : '2.25rem', height: size === 'lg' ? '3rem' : '2.25rem' }} />`;
  }

  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = colors[hash % colors.length];

  return html`
    <div class="avatar-initials ${className}" 
      style=${{
      backgroundColor: color,
      width: size === 'lg' ? '3rem' : '2.25rem',
      height: size === 'lg' ? '3rem' : '2.25rem',
      fontSize: size === 'lg' ? '1rem' : '0.85rem'
    }}>
      ${initials}
    </div>
  `;
};

// Toast
LMS.Toast = ({ message, type = 'info', onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };

  return html`<div class="toast toast-${type} animate-slide-in-right" onClick=${onClose}>
    <div class="flex items-center gap-3">
        <span class="text-xl">${icons[type] || 'ℹ️'}</span>
        <span class="font-medium">${message}</span>
    </div>
    <div class="absolute bottom-0 left-0 h-1 bg-white/30 animate-progress" style=${{ width: '100%' }}></div>
  </div>`;
};

// Image Viewer
LMS.ImageViewer = ({ src, onClose }) => {
  if (!src) return null;
  return html`<div class="fixed inset-0" style=${{ zIndex: 60, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick=${onClose}>
    <button class="absolute" style=${{ top: '1rem', right: '1rem', background: '#1e293b', border: 'none', color: 'white', padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer' }} onClick=${onClose}><${LMS.Icons.Close} /></button>
    <img src=${src} alt="Full view" style=${{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '0.5rem' }} onClick=${e => e.stopPropagation()} />
  </div>`;
};

// Search Bar
LMS.SearchBar = ({ value, onChange, placeholder }) => {
  return html`<div class="card">
    <div style=${{ position: 'relative' }}>
        <div style=${{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}><${LMS.Icons.Search} /></div>
        <input class="input-field" style=${{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }} placeholder=${placeholder || 'Search...'} value=${value} onChange=${onChange} />
        ${value && html`<button onClick=${() => onChange({ target: { value: '' } })} style=${{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} class="hover:text-red-500">✕</button>`}
    </div>
  </div>`;
};

// Sync Status Indicator
// Sync Status Indicator
LMS.SyncStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnline) {
    return html`<div class="offline-badge">
      <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
      OFFLINE
    </div>`;
  }

  if (!LMS.DB.isConfigured) {
    return html`<div class="text-xs text-orange-500 font-medium">Local Mode</div>`;
  }

  return html`<div class="flex items-center gap-2 text-xs text-green-600 font-medium transition-all duration-300">
    <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
    <span>Live Sync</span>
  </div>`;
};

// Skeleton Dashboard (Loading State)
LMS.SkeletonDashboard = () => {
  return html`
    <div class="space-y-6">
      <!-- Stats Row -->
      <div class="grid grid-4 gap-4">
        ${[1, 2, 3, 4].map(i => html`
          <div class="card p-4 space-y-3">
            <div class="flex justify-between">
              <div class="skeleton w-1/3 h-4"></div>
              <div class="skeleton w-8 h-8 rounded-full"></div>
            </div>
            <div class="skeleton w-1/2 h-8"></div>
          </div>
        `)}
      </div>
      <!-- Chart Area -->
      <div class="grid grid-2 gap-4">
        <div class="card p-6 h-64 flex flex-col gap-4">
            <div class="skeleton w-1/4 h-6"></div>
            <div class="flex-1 skeleton w-full rounded-xl"></div>
        </div>
        <div class="card p-6 h-64 flex flex-col gap-4">
            <div class="skeleton w-1/4 h-6"></div>
            <div class="space-y-2">
                ${[1, 2, 3, 4].map(() => html`<div class="skeleton w-full h-8"></div>`)}
            </div>
        </div>
      </div>
    </div>
  `;
};

// Bottom Status Bar with Backup Timer
LMS.BottomStatusBar = () => {
  const { students, payments, halls, shifts, settings, activityLog, showToast } = useContext(LMS.AppContext);
  const [countdown, setCountdown] = useState(30);
  const [backupStatus, setBackupStatus] = useState('idle'); // 'idle' | 'done' | 'backing'
  const [lastBackup, setLastBackup] = useState(null);
  const [localBackupDir, setLocalBackupDir] = useState(LMS.DB.localLoad('backupDirectory') || null);

  // Get seat stats
  const totalSeats = halls.reduce((sum, h) => sum + (h.seatCount || 0), 0);
  const occupiedSeats = students.filter(s => s.assignedSeat && s.isActive !== false).length;
  const availableSeats = totalSeats - occupiedSeats;

  // Auto-backup countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Trigger backup
          performBackup();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const performBackup = async () => {
    setBackupStatus('backing');
    try {
      // Backup to cloud (Exclude large lists, they sync granularly)
      if (LMS.DB.isConfigured && LMS.DB.userId) {
        await LMS.DB.syncLocalToCloud();
      }

      // Backup to local directory if set
      if (localBackupDir) {
        await saveToLocalDirectory();
      }

      setLastBackup(new Date());
      setBackupStatus('done');
      setTimeout(() => setBackupStatus('idle'), 5000);
    } catch (err) {
      console.error('Backup failed:', err);
      setBackupStatus('idle');
    }
  };

  const saveToLocalDirectory = async () => {
    // Use File System Access API if available
    if (localBackupDir && typeof localBackupDir.createWritable === 'function') {
      try {
        const minStudents = (LMS.DB.localLoad('students') || []).map(s => {
          const { photo, formPhoto, ...rest } = s; // Strip photos
          return { ...rest, photo: null, formPhoto: null };
        });

        const data = {
          students: minStudents,
          payments: LMS.DB.localLoad('payments') || [],
          halls: LMS.DB.localLoad('halls') || [],
          shifts: LMS.DB.localLoad('shifts') || [],
          settings: LMS.DB.localLoad('settings') || {},
          activityLog: LMS.DB.localLoad('activityLog') || [],
          timestamp: new Date().toISOString()
        };
        const fileName = 'magadh_data_backup.json';
        const fileHandle = await localBackupDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
      } catch (err) {
        console.error('Local backup failed:', err);
      }
    }
  };

  const chooseDirectory = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        setLocalBackupDir(dirHandle);
        LMS.DB.localSave('backupDirectoryName', dirHandle.name);
        showToast('Backup directory set: ' + dirHandle.name, 'success');
      } catch (err) {
        if (err.name !== 'AbortError') {
          showToast('Could not set directory', 'error');
        }
      }
    } else {
      showToast('Directory picker not supported in this browser', 'warning');
    }
  };

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m + ':' + s.toString().padStart(2, '0');
  };

  const formatLastBackup = () => {
    if (!lastBackup) {
      const stored = LMS.DB.localLoad('lastBackupTime');
      if (stored) return 'Last: ' + new Date(stored).toLocaleTimeString();
      return 'No backup yet';
    }
    return 'Last: ' + lastBackup.toLocaleTimeString();
  };

  // Store last backup time
  useEffect(() => {
    if (lastBackup) {
      LMS.DB.localSave('lastBackupTime', lastBackup.toISOString());
    }
  }, [lastBackup]);

  return html`<div class="bottom-status-bar">
    <div class="status-bar-inner">
      <!-- Progress Bar -->
      <div class="status-progress-container">
        <div class="status-progress-bar" style=${{ width: (occupiedSeats / Math.max(totalSeats, 1) * 100) + '%' }} />
      </div>

      <!-- Stats -->
      <div class="status-stats">
        <span>Total seats: <strong class="text-primary">${totalSeats}</strong></span>
        <span class="status-dot">•</span>
        <span>Occupied: <strong class="text-red-500">${occupiedSeats}</strong></span>
        <span class="status-dot">•</span>
        <span>Available: <strong class="text-green-600">${availableSeats}</strong></span>
      </div>

      <!-- Backup Status -->
      <div class="status-backup">
        ${backupStatus === 'done' ? html`
          <span class="backup-done">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Backup Done
          </span>
        ` : backupStatus === 'backing' ? html`
          <span class="backup-progress">Backing up...</span>
        ` : html`
          <span class="backup-timer">${formatLastBackup()}</span>
        `}
        
        <span class="countdown-timer">
          Next: <strong>${formatCountdown(countdown)}</strong>
        </span>

        <button class="backup-now-btn" onClick=${performBackup} disabled=${backupStatus === 'backing'}>
          Backup Now
        </button>
      </div>
    </div>
  </div>`;
};
