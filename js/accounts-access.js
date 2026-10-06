window.LMS = window.LMS || {};
(() => {
  const key = () => 'lms_accounts_access:' + LMS.DB.scope;
  const deviceKey = 'lms_accounts_device_v1';
  const event = 'lms-accounts-access';
  let current = null, currentScope = '', checking = null, timer;
  const secondary = firebase.apps.find(app => app.name === 'accounts-private') || firebase.initializeApp(FIREBASE_CONFIG, 'accounts-private');
  const auth = secondary.auth();
  const ready = auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
  const read = async () => JSON.parse(await LMS.LoginStorage.read(key()) || 'null');
  const device = () => LMS.LoginStorage.read(deviceKey, () =>
    Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''));
  const publish = value => {
    clearTimeout(timer); current = value; currentScope = LMS.DB.scope;
    if (value) timer = setTimeout(() => access.clear(), Math.max(0, new Date(value.expiresAt).getTime() - Date.now()));
    window.dispatchEvent(new Event(event));
  };
  const access = LMS.AccountAccess = {
    emails: ['adityakr.bihar@gmail.com', 'adityavaiosony@gmail.com'],
    session: () => currentScope === LMS.DB.scope && current && new Date(current.expiresAt) > new Date() ? current : null,
    async headers() {
      const saved = await read();
      return { 'X-Accounts-Device': await device(), ...(saved?.token && new Date(saved.expiresAt) > new Date() ? { 'X-Accounts-Session': saved.token } : {}) };
    },
    clear() {
      const name = key(); publish(null); auth.signOut().catch(() => {});
      return LMS.LoginStorage.write(name, null).catch(error => LMS.DB.fail(error));
    },
    async refresh() {
      const scope = LMS.DB.scope;
      if (checking?.scope === scope) return checking.promise;
      const saved = await read();
      if (scope !== LMS.DB.scope) return null;
      if (!saved?.token || new Date(saved.expiresAt) <= new Date()) { await this.clear(); return null; }
      const promise = LMS.SqlApi.request('accounts/session').then(async result => {
        const latest = await read();
        if (scope !== LMS.DB.scope || latest?.token !== saved.token) return null;
        publish(result); return result;
      }).catch(error => { if (scope === LMS.DB.scope) publish(null); throw error; }).finally(() => { if (checking?.scope === scope) checking = null; });
      checking = { scope, promise }; return promise;
    },
    async proof() {
      await ready;
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await auth.signInWithPopup(provider);
      if (!result.user.emailVerified || !this.emails.includes((result.user.email || '').toLowerCase())) {
        await auth.signOut(); throw new Error('Use adityakr.bihar@gmail.com or adityavaiosony@gmail.com.');
      }
      return result.user.getIdToken(true);
    },
    async login() {
      const scope = LMS.DB.scope;
      const accountsIdentity = await this.proof();
      const result = await LMS.SqlApi.request('accounts/login', { method: 'POST', body: {}, accountsIdentity });
      if (scope !== LMS.DB.scope) throw new Error('Library account changed. Sign in again.');
      await LMS.LoginStorage.write(key(), JSON.stringify(result));
      checking = null; await this.refresh();
      await auth.signOut();
    },
    async passwordLogin(username, password) {
      const scope = LMS.DB.scope;
      const result = await LMS.SqlApi.request('accounts/password', { method: 'POST', body: { username, password } });
      if (scope !== LMS.DB.scope) throw new Error('Library account changed. Sign in again.');
      await LMS.LoginStorage.write(key(), JSON.stringify(result)); checking = null; await this.refresh();
    },
    async logout() {
      try { await LMS.SqlApi.request('accounts/logout', { method: 'POST', body: {} }); }
      finally { await this.clear(); }
    },
    async profile(body) {
      const accountsIdentity = await this.proof();
      try { return await LMS.SqlApi.request('accounts/profile', { method: 'POST', body, accountsIdentity }); }
      finally { await auth.signOut(); }
    },
    async list(kind) {
      const records = []; let after = null;
      do { const page = await LMS.SqlApi.request('accounts/' + kind, { query: { after } }); records.push(...page.items); after = page.next; } while (after);
      return records.filter(row => !row._deleted);
    },
    async save(changes) { return LMS.SqlApi.operation({ id: crypto.randomUUID(), changes }); },
    async log(action, category = 'accounts') {
      const value = { id: crypto.randomUUID(), action, section: 'accounts', category, timestamp: new Date().toISOString() };
      const result = await this.save([{ key: 'activityLog', id: value.id, base: 'null', value }]);
      return result.applied[0].value;
    }
  };
  window.addEventListener('storage', e => {
    if (e.key === key() || e.key === deviceKey) { publish(null); access.refresh().catch(() => {}); }
  });
  window.addEventListener('focus', () => { if (LMS.DB.sqlAuthorized) access.refresh().catch(() => {}); });
  setInterval(() => { if (access.session() && document.visibilityState === 'visible') access.refresh().catch(() => {}); }, 60000);
  LMS.useAccountsSession = () => {
    const [session, setSession] = useState(access.session);
    useEffect(() => {
      const sync = () => setSession(access.session());
      window.addEventListener(event, sync); sync();
      if (LMS.DB.sqlAuthorized) access.refresh().catch(() => {});
      return () => window.removeEventListener(event, sync);
    }, [LMS.DB.scope, LMS.DB.sqlAuthorized]);
    return session;
  };
})();

LMS.AccountsLogin = () => {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [username, setUsername] = useState('accounts'), [password, setPassword] = useState('');
  const run = async work => { setBusy(true); setError(''); try { await work(); setPassword(''); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return html`<section class="card accounts-access-gate">
    <span class="accounts-access-icon" aria-hidden="true">🔒</span><h2>Private Accounts</h2>
    <p>Verify your Google email on this browser/device. Access expires automatically after 7 days.</p>
    <p class="text-xs">adityakr.bihar@gmail.com<br/>adityavaiosony@gmail.com</p>
    <${LMS.Button} disabled=${busy} onClick=${() => run(() => LMS.AccountAccess.login())}>${busy ? 'Please wait…' : 'Verify email & unlock Accounts'}</${LMS.Button}>
    <details class="accounts-password-login"><summary>Use temporary password on a verified device</summary>
      <form onSubmit=${e => { e.preventDefault(); run(() => LMS.AccountAccess.passwordLogin(username, password)); }} class="space-y-3">
        <${LMS.Input} label="Username" autoComplete="username" value=${username} onChange=${e => setUsername(e.target.value)} required />
        <${LMS.Input} label="Temporary password" type="password" autoComplete="current-password" value=${password} onChange=${e => setPassword(e.target.value)} required />
        <${LMS.Button} type="submit" disabled=${busy}>Unlock</${LMS.Button}>
      </form>
    </details>
    ${error && html`<p role="alert" class="accounts-access-error">${error}</p>`}
  </section>`;
};

LMS.AccountsSecurity = () => {
  const session = LMS.useAccountsSession();
  const { showToast } = useContext(LMS.AppContext);
  const [form, setForm] = useState({ username: 'accounts', password: '', confirm: '', hours: '720' });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { if (session?.username) setForm(previous => ({ ...previous, username: session.username })); }, [session?.username]);
  const save = async e => {
    e.preventDefault(); setMessage('');
    if (form.password !== form.confirm) { setMessage('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = await LMS.AccountAccess.profile({ username: form.username, password: form.password, hours: form.hours });
      setForm(previous => ({ ...previous, password: '', confirm: '' }));
      setMessage('Saved. Temporary password expires ' + new Date(result.passwordExpiresAt).toLocaleString('en-IN') + '.');
      showToast('Accounts username and temporary password saved.', 'success');
      if (session.method === 'password') LMS.AccountAccess.clear();
      else await LMS.AccountAccess.refresh();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  if (!session) return html`<${LMS.AccountsLogin} />`;
  return html`<section class="card p-4 space-y-3"><h3 class="font-bold">Accounts access & temporary password</h3>
    <p class="text-sm">Verified: ${session.email}<br/>This browser/device stays unlocked until ${new Date(session.expiresAt).toLocaleString('en-IN')}.</p>
    <form onSubmit=${save} class="space-y-3">
      <${LMS.Input} label="Accounts username" value=${form.username} maxLength="80" onChange=${e => setForm(p => ({ ...p, username: e.target.value }))} required />
      <div class="grid grid-2 gap-3">
        <${LMS.Input} type="password" label="New temporary password (3+ characters)" autoComplete="new-password" minLength="3" maxLength="256" value=${form.password} onChange=${e => setForm(p => ({ ...p, password: e.target.value }))} required />
        <${LMS.Input} type="password" label="Confirm password" autoComplete="new-password" value=${form.confirm} onChange=${e => setForm(p => ({ ...p, confirm: e.target.value }))} required />
      </div>
      <label>Password expires after<select class="input-field" value=${form.hours} onChange=${e => setForm(p => ({ ...p, hours: e.target.value }))}><option value="1">1 hour</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">7 days</option><option value="360">15 days</option><option value="720">30 days</option></select></label>
      <p class="text-xs">Saving requires a fresh verification with one of your two approved emails. Changing the password also ends sessions opened with the previous password.</p>
      <${LMS.Button} type="submit" disabled=${busy}>${busy ? 'Saving…' : 'Verify email & save password'}</${LMS.Button}>
    </form>
    ${message && html`<p role="status">${message}</p>`}
  </section>`;
};
