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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (await LMS.Auth.verify(password) || (!LMS.DB.localLoad('owner') && await LMS.Auth.verifyGoogle())) {
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
  props.disabled = props.disabled || LMS.DB.switching;
  if (props.onClick) props.onClick = LMS.safeAction(props.onClick);
  return html`<button class=${cls} ...${props}>${children}</button>`;
};

// Input
LMS.Input = ({ label, error, className = '', onChange, ...props }) => {
  const id = React.useId();
  const handleInput = (e) => {
    if (props.autoCapitalize) {
      e.target.value = e.target.value.toUpperCase();
    }
    if (onChange) onChange(e);
  };

  return html`<div class="space-y-1 ${className}">
    ${label && html`<label class="input-label" htmlFor=${props.id || id}>${label}</label>`}
    <input id=${props.id || id} class="input-field ${error ? 'error' : ''}" ...${props} onInput=${handleInput} />
    ${error && html`<p class="text-red-400 text-xs">${error}</p>`}
  </div>`;
};

// Select
LMS.Select = ({ label, options, className = '', ...props }) => {
  const id = React.useId();
  return html`<div class="space-y-1 ${className}">
    ${label && html`<label class="input-label" htmlFor=${props.id || id}>${label}</label>`}
    <select id=${props.id || id} class="input-field" ...${props}>
      ${options.map(opt => html`<option key=${opt.value} value=${opt.value}>${opt.label}</option>`)}
    </select>
  </div>`;
};

// Card
LMS.Card = ({ children, className = '', ...props }) => {
  return html`<div class="card ${className}" ...${props}>${children}</div>`;
};

// Modal
LMS.Modal = ({ isOpen, onClose, title, children, size = 'md', className = '' }) => {
  const ref = useRef(null), titleId = React.useId();
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    const focusable = () => [...ref.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex="0"]')].filter(element => element.getClientRects().length);
    focusable()[0]?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const elements = focusable(), first = elements[0], last = elements.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const element = ref.current;
    element.addEventListener('keydown', handleKey);
    return () => { element.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [isOpen]);

  if (!isOpen) return null;
  const dialog = html`<div class="modal-overlay" onClick=${event => event.stopPropagation()}>
    <div class="modal-backdrop" onClick=${onClose} />
    <div ref=${ref} role="dialog" aria-modal="true" aria-labelledby=${titleId} class="modal-content modal-${size} ${className} animate-scale-in">
      <div class="modal-header">
        <h2 id=${titleId} class="text-xl font-semibold">${title}</h2>
        <button type="button" aria-label="Close dialog" onClick=${onClose} class="btn btn-ghost btn-sm"><${LMS.Icons.Close} /></button>
      </div>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
  // Nested payment/map dialogs must not be clipped by the parent dialog's
  // animated transform or scrolling body.
  return ReactDOM.createPortal(dialog, document.body);
};

// Avatar
LMS.Avatar = ({ src, name = 'User', size = 'md', className = '' }) => {
  const photo = LMS.usePhotoSource(src);
  if (photo.source) {
    return html`<img src=${photo.source} alt=${name} class="rounded-full object-cover border border-gray-200 ${className}" style=${{ width: size === 'lg' ? '3rem' : '2.25rem', height: size === 'lg' ? '3rem' : '2.25rem' }} />`;
  }

  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const colors = ['#7738e5', '#00846e', '#b95c06', '#1c61ed', '#cf2473'];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = colors[hash % colors.length];

  return html`
    <div class="avatar-initials ${className}" 
      style=${{
      backgroundColor: color,
      color: '#ffffff',
      width: size === 'lg' ? '3rem' : '2.25rem',
      height: size === 'lg' ? '3rem' : '2.25rem',
      fontSize: size === 'lg' ? '1rem' : '0.85rem'
    }}>
      ${initials}
    </div>
  `;
};

// Student photos open independently of the containing card or action row.
LMS.StudentPhoto = ({ student, size = 'sm', className = '', style }) => {
  const [preview, setPreview] = useState(false);
  const photo = student?.photo;
  return html`<span class=${'student-photo ' + className} style=${style} onClick=${event => { if (photo) event.stopPropagation(); }} onKeyDown=${event => { if (photo) event.stopPropagation(); }}>
    ${photo ? html`<button type="button" class="student-photo-button" title="View student photo" aria-label=${'View photo of ' + student.name} onClick=${() => setPreview(true)}><${LMS.Avatar} name=${student.name} src=${photo} size=${size} /></button>` : html`<${LMS.Avatar} name=${student?.name || 'Student'} size=${size} />`}
    <${LMS.ImageViewer} src=${preview ? photo : null} onClose=${() => setPreview(false)} />
  </span>`;
};
LMS.studentCardClick = (event, student, onView) => {
  if (event.target.closest('button,a,input,select,textarea,label,summary')) return;
  event.stopPropagation();
  onView?.(student);
};
LMS.studentCardKeyDown = (event, student, onView) => {
  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    event.stopPropagation();
    onView?.(student);
  }
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
  return html`<${LMS.Modal} isOpen=${true} onClose=${onClose} title="Photo / receipt" size="lg">
    <${LMS.SqlImage} src=${src} alt="Full view" style=${{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: '72dvh', objectFit: 'contain', borderRadius: '0.5rem' }} />
  </${LMS.Modal}>`;
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
LMS.useSyncStatus = () => {
  const [, redraw] = useState(0);
  useEffect(() => LMS.DB.subscribe(() => redraw(n => n + 1)), []);
  return LMS.DB.status();
};
LMS.SyncStatus = () => {
  const status = LMS.useSyncStatus();
  const text = status.error ? 'Save / sync needs attention' : status.saving ? 'Saving…' : !status.uid ? 'Local Mode' : status.pending ? `${status.pending} pending sync` : !status.online || !status.connected ? 'Cloud offline' : 'Cloud connected';
  return html`<span role="status" class=${status.error ? 'text-red-500' : 'text-xs'}>${text}</span>`;
};
LMS.SaveStatusPanel = () => {
  const status = LMS.useSyncStatus();
  const [review, setReview] = useState(false);
  if (!status.error) return null;
  const conflict = status.error.startsWith('Cloud changed');
  return html`<div class="card p-4 m-4" role="alert" style=${{ position: 'relative', zIndex: 100, border: '2px solid #ef4444' }}>
    <p>${status.error}</p>
    <button class="btn btn-secondary btn-sm" onClick=${async () => { try { await LMS.DB.flush(); await LMS.DB.processOfflineQueue(); } catch (error) { LMS.DB.fail(error); } }}>Retry save / sync</button>
    ${LMS.DB.paymentSyncIssue && html`<${LMS.PendingPaymentRepair} />`}
    ${conflict && html`<button class="btn btn-secondary btn-sm" onClick=${() => setReview(!review)}>Review conflict</button>`}
    ${review && conflict && html`<div><p>Pending local changes:</p><pre style=${{ maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>${JSON.stringify((LMS.DB.localLoad('offline_queue', [])[0]?.changes || []).map(x => ({ collection: x.key, id: x.id, local: x.key === 'owner' ? '[admin credentials]' : x.value })), null, 2)}</pre>
      <button class="btn btn-secondary btn-sm" onClick=${() => { if (confirm('Discard this pending operation and use the current cloud records?')) LMS.DB.resolveConflict(false).catch(error => LMS.DB.fail(error)); }}>Use cloud records</button>
      <button class="btn btn-primary btn-sm" onClick=${() => { if (confirm('Overwrite the conflicting cloud records with these local changes?')) LMS.DB.resolveConflict(true).catch(error => LMS.DB.fail(error)); }}>Keep these local changes</button>
    </div>`}
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
  const [countdown, setCountdown] = useState(300);
  const [backupStatus, setBackupStatus] = useState('idle'); // 'idle' | 'done' | 'backing'
  const [lastBackup, setLastBackup] = useState(null);
  const [localBackupDir, setLocalBackupDir] = useState(null);
  const backupActionRef = useRef(null);

  // Load directory handle from IndexedDB (can't be stored in localStorage)
  useEffect(() => {
    LMS.IDB.get('backupDirectory').then(handle => {
      if (handle) setLocalBackupDir(handle);
    }).catch(() => {});
  }, []);

  // Get seat stats
  const { reservableSeats: totalSeats, reservedSeats: occupiedSeats, availableSeats } = useMemo(() => LMS.seatReservationStats(halls, students, shifts), [halls, students, shifts]);

  // Auto-backup countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Trigger backup
          backupActionRef.current?.();
          return 300;
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
  backupActionRef.current = performBackup;

  const saveToLocalDirectory = async () => {
    // Use File System Access API if available
    if (localBackupDir && typeof localBackupDir.getFileHandle === 'function') {
      try {
        let data;
        if (LMS.DB.sqlMode) data = await LMS.DB.completeSqlBackup();
        else {
          await LMS.DB.flush();
          data = {};
          for (const key of ['students','payments','halls','shifts','settings','activityLog','attendance','expenses','pendingWork','_paymentDeletions','_inactiveFirstSeen']) {
            const value = LMS.DB.localLoad(key);
            if (value !== null) data[key] = value;
          }
          data.exportDate = new Date().toISOString();
        }
        const fileName = LMS.DB.sqlMode ? 'magadh_SQL_backup_' + LMS.today() + '.json' : 'magadh_data_backup.json';
        const fileHandle = await localBackupDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
      } catch (err) {
        console.error('Local backup failed:', err);
        throw err;
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
        <span>Reservable: <strong class="text-primary">${totalSeats}</strong></span>
        <span class="status-dot">•</span>
        <span>Reserved: <strong class="text-red-500">${occupiedSeats}</strong></span>
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
