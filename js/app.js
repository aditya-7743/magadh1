// ==================== APP.JS - Main App, Top Navigation & Router ====================
window.LMS = window.LMS || {};

LMS.AppUpdateNotice = () => {
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let registration, cancelled = false;
    const inspect = () => { if (!cancelled && registration?.waiting) setUpdate(registration.waiting); };
    const found = () => registration?.installing?.addEventListener('statechange', inspect);
    navigator.serviceWorker.ready.then(reg => { if (cancelled) return; registration = reg; inspect(); reg.addEventListener('updatefound', found); });
    return () => { cancelled = true; registration?.removeEventListener('updatefound', found); };
  }, []);
  if (!update) return null;
  return html`<div class="app-update-notice" role="status"><span>A new app update is ready.</span><button onClick=${() => {
    if (!confirm('Save any unfinished form before updating. Reload the app now?')) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    update.postMessage({ type: 'ACTIVATE_UPDATE' });
  }}>Update & reload</button></div>`;
};

// ==================== THEME TOGGLE COMPONENT ====================
LMS.ThemeToggle = () => {
  const { Icons } = LMS;
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('lms_theme');
    return saved === 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    try { localStorage.setItem('lms_theme', isDark ? 'dark' : 'light'); } catch {}
  }, [isDark]);

  return html`
    <button 
      class="theme-toggle-btn" 
      onClick=${() => setIsDark(!isDark)}
      title=${isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      ${isDark ? html`<${Icons.Sun} />` : html`<${Icons.Moon} />`}
    </button>
  `;
};

// ==================== TOP NAVIGATION ====================
LMS.PAGE_META = {
  dashboard: ['Overview', 'A clear view of your library, every day.'],
  students: ['Students', 'People, memberships and payments — all in one place.'],
  seats: ['Seats & halls', 'Find a space. Keep every seat organised.'],
  payments: ['Payments', 'Record collections and stay on top of dues.'],
  accounts: ['Accounts', 'Your income, expenses and financial picture.'],
  dues: ['Dues List', 'Outstanding fees and payment follow-ups.'],
  attendance: ['Attendance', 'Keep track of who is here today.'],
  activity: ['Activity & tasks', 'Your to-dos and a history of library updates.'],
  alerts: ['Alerts', 'Attendance follow-ups that need your attention.'],
  settings: ['Settings', 'Make the workspace work for your library.']
};
LMS.TopNavbar = ({ currentPage, setCurrentPage = () => {}, onLogout, isMobileOpen, setIsMobileOpen = () => {} }) => {
  const { settings, showToast } = useContext(LMS.AppContext);
  const accountsSession = LMS.useAccountsSession();
  const { Icons } = LMS;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
    { id: 'students', label: 'Students', icon: Icons.Students },
    { id: 'seats', label: 'Seats & Halls', icon: Icons.Seats },
    { id: 'payments', label: 'Payments', icon: Icons.Payments },
    { id: 'accounts', label: 'Accounts', icon: Icons.Payments },
    { id: 'dues', label: 'Dues List', icon: Icons.Bell },
    { id: 'attendance', label: 'Attendance', icon: Icons.Log },
    { id: 'activity', label: 'Activity', icon: Icons.Log },
    { id: 'alerts', label: 'Alerts', icon: Icons.Log },
    { id: 'settings', label: 'Settings', icon: Icons.Settings },
  ];

  const handleNavClick = (id) => {
    setCurrentPage(id);
    setIsMobileOpen(false);
  };

  return html`
    ${isMobileOpen && html`<button class="sidebar-backdrop" aria-label="Close navigation" onClick=${() => setIsMobileOpen(false)}></button>`}
    <aside class="workspace-sidebar ${isMobileOpen ? 'is-open' : ''}" aria-label="Main navigation" onKeyDown=${e => { if (e.key === 'Escape') setIsMobileOpen(false); }}>
        <a class="workspace-brand" href=${LMS.pageUrl('dashboard')} onClick=${e => { if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); handleNavClick('dashboard'); }}>
          <span class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 7h8l3 3 3-3h8v19h-8l-3 2-3-2H5V7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 10v18M9 12h4M9 16h4M19 12h4M19 16h4" stroke="currentColor" stroke-width="1.5"/></svg></span>
          <span><strong>${settings.libraryName}</strong><small>Library workspace</small></span>
        </a>
        <div class="sidebar-label">WORKSPACE</div>
        <nav class="workspace-nav">
          ${menuItems.filter(item => item.id !== 'accounts' || accountsSession).map(item => html`
            <a
              key=${item.id} 
              href=${LMS.pageUrl(item.id)}
              onClick=${e => { if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); handleNavClick(item.id); }}
              class="workspace-nav-link ${currentPage === item.id ? 'active' : ''}"
              aria-current=${currentPage === item.id ? 'page' : undefined}
            >
              <${item.icon} />
              <span>${item.label}</span>
              ${currentPage === item.id && html`<span class="nav-active-dot" aria-hidden="true"></span>`}
            </a>
          `)}
        </nav>
        <div class="sidebar-bottom">
          <div class="sidebar-note"><${Icons.Seats} /><span>A place to focus.<br/><strong>Room to grow.</strong></span></div>
          <button class="workspace-profile" onClick=${onLogout} title="Sign out">
            <span class="profile-avatar">A</span><span><strong>Administrator</strong><small>Sign out of workspace</small></span><${Icons.Logout} />
          </button>
        </div>
    </aside>
    <header class="workspace-topbar">
      <div class="topbar-location">
        <button class="mobile-menu-toggle icon-button" aria-label="Open navigation" aria-expanded=${!!isMobileOpen} onClick=${() => setIsMobileOpen(!isMobileOpen)}><${Icons.Menu} /></button>
        <span class="breadcrumb-root">Workspace</span><span class="breadcrumb-slash">/</span><strong>${LMS.PAGE_META[currentPage]?.[0]}</strong>
      </div>
      <div class="topbar-tools"><span class="sync-pill"><${Icons.Cloud} /><${LMS.SyncStatus} /></span><${LMS.ThemeToggle} /><span class="topbar-avatar" title="Administrator">A</span></div>
    </header>
  `;
};

// ==================== MOBILE HEADER (Unused with generic navbar but kept for safety if needed) ====================
// ... (omitted)

// ==================== MAIN APP ====================
LMS.App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const route = LMS.useRoute();
  const currentPage = route.page, setCurrentPage = LMS.navigatePage;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [admissionRequest, setAdmissionRequest] = useState(0);
  const [attendanceSettingsRequest, setAttendanceSettingsRequest] = useState(0);
  const [inspectedStudentId, setInspectedStudentId] = useState(null);
  useEffect(() => { setInspectedStudentId(null); setIsMobileMenuOpen(false); }, [currentPage]);

  const [, redraw] = useState(0);
  const showToast = useCallback((message, type = 'info') => setToast({ message, type }), []);
  const refreshStateFromLocal = useCallback(() => {
    setIsLoggedIn(LMS.Auth.hasSession());
    redraw(n => n + 1);
  }, []);
  useEffect(() => {
    const unsubscribe = LMS.DB.subscribe(key => {
      if (key === 'scope' || key === 'auth') refreshStateFromLocal();
      else redraw(n => n + 1);
    });
    LMS.DB.boot().then(() => { refreshStateFromLocal(); setLoading(false); })
      .catch(error => { LMS.DB.fail(error); setLoading(false); });
    const timer = setInterval(() => { refreshStateFromLocal(); }, 60000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [refreshStateFromLocal]);
  const data = (key, fallback) => LMS.DB.localLoad(key, fallback);
  const setter = useCallback(key => update => {
    if (LMS.DB.switching) throw new Error('Wait for the account change to finish before editing.');
    const old = LMS.DB.localLoad(key, []);
    const next = typeof update === 'function' ? update(old) : update;
    LMS.DB.stage(key, next);
  }, []);
  const setters = useMemo(() => Object.fromEntries(
    ['students', 'payments', 'halls', 'shifts', 'settings', 'pendingWork', 'expenses'].map(key => [key, setter(key)])
  ), [setter]);
  const students = data('students', []);
  const storedPayments = data('payments', []), deletedPayments = data('_paymentDeletions', {});
  const payments = useMemo(() => LMS.allPayments(storedPayments, students), [storedPayments, students, deletedPayments]);
  const halls = data('halls', LMS.DEFAULT_HALLS), shifts = data('shifts', LMS.DEFAULT_SHIFTS);
  const settings = { ...LMS.DEFAULT_SETTINGS, ...data('settings', {}) };
  if (!settings.libraryName || ['Data Loading...', 'My Study Library', 'My Study Library Management System'].includes(settings.libraryName)) settings.libraryName = LMS.DEFAULT_SETTINGS.libraryName;
  useEffect(() => { document.title = LMS.PAGE_META[currentPage][0] + ' · ' + settings.libraryName; }, [currentPage, settings.libraryName]);
  const activityLog = data('activityLog', []), pendingWork = data('pendingWork', []), expenses = data('expenses', []);
  const setStudents = setters.students, setHalls = setters.halls, setShifts = setters.shifts,
    setSettings = setters.settings, setPendingWork = setters.pendingWork, setExpenses = setters.expenses;
  useEffect(() => {
    if (loading || !isLoggedIn || LMS.DB.switching || LMS.validDate(settings.attendanceAlerts?.trackingStartedOn)) return;
    // Persist a baseline once, so missing historical attendance is not treated as absence.
    setSettings(previous => LMS.validDate(previous.attendanceAlerts?.trackingStartedOn) ? previous : ({ ...previous, attendanceAlerts: {
      ...LMS.attendanceAlertConfig(previous), trackingStartedOn: LMS.today()
    } }));
  }, [loading, isLoggedIn, LMS.DB.scope, LMS.DB.switching, settings.attendanceAlerts?.trackingStartedOn, setSettings]);
  // Restore archived receipts to the ledger on the next payment mutation.
  const setPayments = update => setters.payments(typeof update === 'function' ? update(payments) : update);
  const addLog = useCallback((action, details = {}) => {
    LMS.DB.stage('activityLog', [{ id: LMS.generateId(), action, timestamp: new Date().toISOString(), ...details },
      ...LMS.DB.localLoad('activityLog', [])]);
  }, []);
  const handleLogin = () => { refreshStateFromLocal(); addLog('Owner logged in'); };
  const handleLogout = async () => {
    setInspectedStudentId(null);
    addLog('Owner logged out');
    LMS.Auth.endSession(); setIsLoggedIn(false);
    await LMS.DB.signOut();
    LMS.Auth.endSession(); setIsLoggedIn(false);
  };

  const contextValue = {
    students, setStudents,
    payments, setPayments,
    halls, setHalls,
    shifts, setShifts,
    settings, setSettings,
    activityLog, addLog,
    pendingWork, setPendingWork,
    expenses, setExpenses,
    showToast,
    openStudent: student => setInspectedStudentId(student.id),
    admissionRequest,
    dismissAdmissionRequest: () => setAdmissionRequest(0),
    openNewAdmission: () => { setAdmissionRequest(n => n + 1); setCurrentPage('students'); },
    attendanceSettingsRequest,
    dismissAttendanceSettingsRequest: () => setAttendanceSettingsRequest(0),
    openAttendanceAlertSettings: () => { setAttendanceSettingsRequest(n => n + 1); setCurrentPage('settings'); }
  };

  if (loading) {
    return html`<${LMS.AppContext.Provider} value=${contextValue}>
    <div class="app-shell">
      <${LMS.TopNavbar} currentPage=${currentPage} />
      <main class="workspace-main">
        <div class="mb-4 fade-in-up" style=${{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <div class="skeleton w-48 h-8"></div>
        </div>
        <${LMS.SkeletonDashboard} />
      </main>
    </div>
    </${LMS.AppContext.Provider}>`;
  }

  if (!isLoggedIn && LMS.DB.sqlMode && LMS.DB.auth?.currentUser && !LMS.DB.sqlAuthorized &&
      !['INVALID_SESSION', 'ADMIN_ACCESS_REQUIRED', 'SIGN_IN_REQUIRED'].includes(LMS.DB.connectionErrorCode)) {
    return html`<div class="card m-6 space-y-4"><h2>Reconnecting to your library…</h2><p>Your saved login is retained. Check your internet connection and retry.</p><${LMS.SaveStatusPanel} /><button class="btn btn-primary" disabled=${LMS.DB.switching} onClick=${() => LMS.DB.restoreConnection?.()}>Retry connection</button></div>`;
  }
  if (!isLoggedIn) return html`<div><${LMS.SaveStatusPanel} /><${LMS.LoginPage} onLogin=${handleLogin} /></div>`;

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return html`<${LMS.Dashboard} setCurrentPage=${setCurrentPage} />`;
      case 'students': return html`<${LMS.StudentManagement} />`;
      case 'seats': return html`<${LMS.SeatManagement} />`;
      case 'payments': return html`<${LMS.PaymentManagement} />`;
      case 'accounts': return html`<${LMS.Accounts} />`;
      case 'dues': return html`<${LMS.Dues} />`;
      case 'alerts': return html`<${LMS.Alerts} />`;
      case 'attendance': return html`<${LMS.Attendance} />`;
      case 'activity': return html`<${LMS.ActivityLog} />`;
      case 'settings': return html`<${LMS.Settings} onLogout=${handleLogout} />`;
      default: return html`<${LMS.Dashboard} />`;
    }
  };

  return html`<${LMS.AppContext.Provider} value=${contextValue}>
    <div class="app-shell">
      <${LMS.TopNavbar} 
        currentPage=${currentPage} 
        setCurrentPage=${setCurrentPage} 
        onLogout=${handleLogout} 
        isMobileOpen=${isMobileMenuOpen}
        setIsMobileOpen=${setIsMobileMenuOpen}
      />

      <main class="workspace-main" id="main-content" onClick=${() => isMobileMenuOpen && setIsMobileMenuOpen(false)}>
        <h1 class="workspace-page-title">${LMS.PAGE_META[currentPage]?.[0]}</h1>
        <${LMS.SaveStatusPanel} />
        <div class="module-content page-enter" data-page=${currentPage} key=${currentPage}>
          ${renderPage()}
        </div>
      </main>

      <${LMS.Chatbot} />
      ${inspectedStudentId && html`<${LMS.StudentInspector} key=${inspectedStudentId} studentId=${inspectedStudentId} onClose=${() => setInspectedStudentId(null)} />`}
      <${LMS.BottomStatusBar} />
      <${LMS.AppUpdateNotice} />
      ${toast && html`<${LMS.Toast} message=${toast.message} type=${toast.type} onClose=${() => setToast(null)} />`}
      <${LMS.Screensaver} />
    </div>
  </${LMS.AppContext.Provider}>`;
};

// ==================== MOUNT ====================
ReactDOM.createRoot(document.getElementById('root')).render(html`<${LMS.App} />`);

// ==================== SERVICE WORKER REGISTRATION ====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => console.log('Service Worker registered: ', reg.scope))
      .catch(err => console.log('Service Worker registration failed: ', err));
  });
}
