// ==================== APP.JS - Main App, Top Navigation & Router ====================
window.LMS = window.LMS || {};

// ==================== THEME TOGGLE COMPONENT ====================
LMS.ThemeToggle = () => {
  const { Icons } = LMS;
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('lms_theme');
    return saved === 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('lms_theme', isDark ? 'dark' : 'light');
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
LMS.TopNavbar = ({ currentPage, setCurrentPage, onLogout, isMobileOpen, setIsMobileOpen }) => {
  const { settings, showToast } = useContext(LMS.AppContext);
  const { Icons } = LMS;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
    { id: 'students', label: 'Students', icon: Icons.Students },
    { id: 'seats', label: 'Seats & Halls', icon: Icons.Seats },
    { id: 'accounts', label: 'Accounts', icon: Icons.Payments },
    { id: 'attendance', label: 'Attendance', icon: Icons.Log },
    { id: 'activity', label: 'Activity', icon: Icons.Log },
    { id: 'settings', label: 'Settings', icon: Icons.Settings },
  ];

  const handleNavClick = (id) => {
    setCurrentPage(id);
    if (window.innerWidth <= 768) setIsMobileOpen(false);
  };

  return html`
    <nav class="navbar glass">
      <div class="navbar-container">
        <!-- Mobile Menu Button -->
        <button class="mobile-menu-btn md:hidden" onClick=${() => setIsMobileOpen(!isMobileOpen)}>
          <${Icons.Menu} />
        </button>

        <!-- Logo -->
        <div class="nav-logo">
          <div class="logo-icon">📚</div>
          <div class="logo-text hidden md:block">
            <h1>${settings.libraryName}</h1>
            <p>Management System</p>
          </div>
        </div>

        <!-- Navigation Links -->
        <div class="nav-links ${isMobileOpen ? 'open' : ''}">
          ${menuItems.map(item => html`
            <button 
              key=${item.id} 
              onClick=${() => handleNavClick(item.id)}
              class="nav-link ${currentPage === item.id ? 'active' : ''} click-press"
            >
              <${item.icon} />
              <span>${item.label}</span>
            </button>
          `)}
        </div>

        <!-- Right Side Actions -->
        <div class="nav-actions">
           <div class="text-xs text-gray-400 mr-2 hidden md:block"><${LMS.SyncStatus} /></div>
          <${LMS.ThemeToggle} />
          <button class="btn btn-ghost btn-sm text-red-500" onClick=${onLogout} title="Logout">
            <${Icons.Logout} />
          </button>
        </div>
      </div>
    </nav>
  `;
};

// ==================== MOBILE HEADER (Unused with generic navbar but kept for safety if needed) ====================
// ... (omitted)

// ==================== MAIN APP ====================
LMS.App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  // Data states
  // Data states - Initialize from LocalStorage to prevent overwrite
  const [students, setStudents] = useState(() => LMS.DB.localLoad('students') || []);
  const [payments, setPayments] = useState(() => LMS.DB.localLoad('payments') || []);
  const [halls, setHalls] = useState(() => {
    const loaded = LMS.DB.localLoad('halls');
    return loaded && loaded.length > 0 ? loaded : LMS.DEFAULT_HALLS;
  });
  const [shifts, setShifts] = useState(() => LMS.DB.localLoad('shifts') || LMS.DEFAULT_SHIFTS || []);

  const [settings, setSettings] = useState(() => {
    const saved = LMS.DB.localLoad('settings');
    let final = saved ? { ...LMS.DEFAULT_SETTINGS, ...saved } : { ...LMS.DEFAULT_SETTINGS, libraryName: 'MAGADH LIBRARY' };
    if (final.libraryName === 'My Study Library' || final.libraryName === 'My Study Library Management System') {
      final.libraryName = 'MAGADH LIBRARY';
    }
    return final;
  });

  const [activityLog, setActivityLog] = useState(() => LMS.DB.localLoad('activityLog') || []);
  const [pendingWork, setPendingWork] = useState(() => LMS.DB.localLoad('pendingWork') || []);
  const [expenses, setExpenses] = useState(() => LMS.DB.localLoad('expenses') || []);
  const [details, setDetails] = useState(() => LMS.DB.localLoad('details') || []);

  // Remote update flag to prevent loops (per key)
  const isRemoteUpdate = useRef({});

  // Initialize Firebase
  useEffect(() => {
    LMS.DB.init();
  }, []);

  // Load data helper
  const refreshStateFromLocal = useCallback(() => {
    const session = LMS.DB.localLoad('session');
    if (session?.loggedIn) setIsLoggedIn(true);

    if (!LMS.DB.localLoad('owner')) LMS.DB.localSave('owner', { ...LMS.DEFAULT_OWNER, libraryName: 'MAGADH LIBRARY' });

    // Load from local first (instant)
    setStudents(LMS.DB.localLoad('students') || []);
    setPayments(LMS.DB.localLoad('payments') || []);

    const loadedHalls = LMS.DB.localLoad('halls');
    setHalls(loadedHalls && loadedHalls.length > 0 ? loadedHalls : LMS.DEFAULT_HALLS);

    setShifts(LMS.DB.localLoad('shifts') || LMS.DEFAULT_SHIFTS || []);
    const savedSettings = LMS.DB.localLoad('settings');
    let finalSettings = savedSettings ? { ...LMS.DEFAULT_SETTINGS, ...savedSettings } : { ...LMS.DEFAULT_SETTINGS, libraryName: 'Data Loading...' };

    // Force update name if it matches old default
    if (finalSettings.libraryName === 'My Study Library' || finalSettings.libraryName === 'My Study Library Management System') {
      finalSettings.libraryName = 'MAGADH LIBRARY';
    }
    setSettings(finalSettings);
    setActivityLog(LMS.DB.localLoad('activityLog') || []);
    setPendingWork(LMS.DB.localLoad('pendingWork') || []);
    setExpenses(LMS.DB.localLoad('expenses') || []);
    setDetails(LMS.DB.localLoad('details') || []); // Ensure this is loaded if used

    setLoading(false);
  }, []);

  // Initialize Firebase & Data
  useEffect(() => {
    LMS.DB.init();
    refreshStateFromLocal();

    const initialSync = async () => {
      const session = LMS.DB.localLoad('session');
      if (LMS.DB.isConfigured && session?.loggedIn) {
        try {
          await LMS.DB.syncCloudToLocal();
          refreshStateFromLocal(); // Refresh UI immediately after sync
        } catch (e) {
          console.error("Initial sync failed", e);
        }
      }
    };
    initialSync();
  }, [refreshStateFromLocal]);

  // REAL-TIME LISTENERS
  useEffect(() => {
    if (!LMS.DB.isConfigured || !LMS.DB.userId) return;

    // Define listener callbacks
    const setupListeners = () => {
      LMS.DB.listen('students', (val) => {
        if (val) { isRemoteUpdate.current['students'] = true; setStudents(val); }
      });
      LMS.DB.listen('payments', (val) => {
        if (val) { isRemoteUpdate.current['payments'] = true; setPayments(val); }
      });
      LMS.DB.listen('halls', (val) => {
        if (val) { isRemoteUpdate.current['halls'] = true; setHalls(val); }
      });
      LMS.DB.listen('shifts', (val) => {
        if (val) { isRemoteUpdate.current['shifts'] = true; setShifts(val); }
      });
      LMS.DB.listen('settings', (val) => {
        if (val) { isRemoteUpdate.current['settings'] = true; setSettings(val); }
      });
      LMS.DB.listen('activityLog', (val) => {
        if (val) { isRemoteUpdate.current['activityLog'] = true; setActivityLog(val); }
      });
      LMS.DB.listen('pendingWork', (val) => {
        if (val) { isRemoteUpdate.current['pendingWork'] = true; setPendingWork(val); }
      });
      LMS.DB.listen('expenses', (val) => {
        if (val) { isRemoteUpdate.current['expenses'] = true; setExpenses(Array.isArray(val) ? val : Object.values(val)); }
      });
    };

    // Delay listeners slightly to allow initial load
    setTimeout(setupListeners, 1500);

    return () => {
      LMS.DB.detachAllListeners();
    };
  }, [LMS.DB.userId]); // Re-run if user login changes

  // Save data on change (Immediate Local, Debounced Cloud)
  const saveTimeout = useRef({});
  const debouncedSave = useCallback((key, data) => {
    // 1. ALWAYS Save to LocalStorage IMMEDIATELY
    // This ensures no data loss on refresh/close
    LMS.DB.localSave(key, data);

    // 2. Handle Remote Updates (Sync Loop Prevention)
    if (isRemoteUpdate.current[key]) {
      setTimeout(() => {
        if (isRemoteUpdate.current) isRemoteUpdate.current[key] = false;
      }, 500);
      return; // Stop here, don't sync back to cloud
    }

    // 3. Debounce Cloud Sync
    clearTimeout(saveTimeout.current[key]);

    // Only Sync Monolithic Keys automatically
    // Granular keys (students, etc.) are synced via explicit saveItem actions if needed, 
    // but here we just handle the monolithic ones that rely on full array overwrite.
    const monolithicKeys = ['settings', 'owner', 'pendingWork'];

    if (monolithicKeys.includes(key)) {
      saveTimeout.current[key] = setTimeout(() => {
        if (LMS.DB.isConfigured && LMS.DB.userId) {
          LMS.DB.save(key, data);
        }
      }, 1000);
    }
  }, []);

  useEffect(() => { debouncedSave('students', students); }, [students]);
  useEffect(() => { debouncedSave('payments', payments); }, [payments]);
  useEffect(() => { debouncedSave('halls', halls); }, [halls]);
  useEffect(() => { debouncedSave('shifts', shifts); }, [shifts]);
  useEffect(() => { debouncedSave('settings', settings); }, [settings]);
  useEffect(() => { debouncedSave('activityLog', activityLog); }, [activityLog]);
  useEffect(() => { debouncedSave('pendingWork', pendingWork); }, [pendingWork]);
  useEffect(() => { debouncedSave('expenses', expenses); }, [expenses]);

  const addLog = useCallback((action) => {
    setActivityLog(prev => [{ action, timestamp: new Date().toISOString() }, ...prev].slice(0, 100));
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  const handleLogin = () => {
    setIsLoggedIn(true);
    refreshStateFromLocal(); // Ensure data is loaded fresh on login
    addLog('Owner logged in');
  };

  const handleLogout = () => {
    LMS.DB.localRemove('session');
    setIsLoggedIn(false);
    addLog('Owner logged out');
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
    showToast
  };

  if (loading) {
    return html`<${LMS.AppContext.Provider} value=${contextValue}>
    <div class="min-h-screen bg-body text-text-dark pb-20 pt-20">
      <${LMS.TopNavbar} currentPage="dashboard" />
      <main class="container mx-auto px-4">
        <div class="mb-4 fade-in-up" style=${{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <div class="skeleton w-48 h-8"></div>
        </div>
        <${LMS.SkeletonDashboard} />
      </main>
    </div>
    </${LMS.AppContext.Provider}>`;
  }

  if (!isLoggedIn) return html`<${LMS.LoginPage} onLogin=${handleLogin} />`;

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return html`<${LMS.Dashboard} setCurrentPage=${setCurrentPage} />`;
      case 'students': return html`<${LMS.StudentManagement} />`;
      case 'seats': return html`<${LMS.SeatManagement} />`;
      case 'payments': return html`<${LMS.PaymentManagement} />`;
      case 'accounts': return html`<${LMS.Accounts} />`;
      case 'alerts': return html`<${LMS.Alerts} />`;
      case 'attendance': return html`<${LMS.Attendance} />`;
      case 'activity': return html`<${LMS.ActivityLog} />`;
      case 'settings': return html`<${LMS.Settings} onLogout=${handleLogout} />`;
      default: return html`<${LMS.Dashboard} />`;
    }
  };

  return html`<${LMS.AppContext.Provider} value=${contextValue}>
    <div class="min-h-screen bg-body text-text-dark pb-20 pt-20"> <!-- Added padding top/bottom -->
      <${LMS.TopNavbar} 
        currentPage=${currentPage} 
        setCurrentPage=${setCurrentPage} 
        onLogout=${handleLogout} 
        isMobileOpen=${isMobileMenuOpen}
        setIsMobileOpen=${setIsMobileMenuOpen}
      />

      <main class="container mx-auto px-4" onClick=${() => isMobileMenuOpen && setIsMobileMenuOpen(false)}>
        <!-- Page Title -->
        <div class="mb-4 fade-in-up" style=${{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <h2 class="text-2xl font-bold text-primary-gradient" style=${{ textTransform: 'capitalize' }}>
            ${currentPage.replace('-', ' ')}
          </h2>
        </div>
        <div class="page-enter" key=${currentPage}>
          ${renderPage()}
        </div>
      </main>

      <${LMS.Chatbot} />
      <${LMS.BottomStatusBar} />
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
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered: ', reg.scope))
      .catch(err => console.log('Service Worker registration failed: ', err));
  });
}
