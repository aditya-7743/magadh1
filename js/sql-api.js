// SQL credentials remain on the server. This client sends only the current user's ID token.
window.LMS = window.LMS || {};
LMS.SQL_CONFIG = Object.freeze({
  apiUrl: 'https://br-withered-darkness-b3foj3dn-libraryapi.compute.c-4.ap-southeast-1.aws.neon.tech',
  enabled: true,
  mode: 'sql'
});
LMS.SqlApi = {
  async request(path, { query = {}, signal, method = 'GET', body, accountsIdentity } = {}) {
    const user = LMS.DB.auth?.currentUser;
    if (!user) throw new Error('Sign in with the library admin Google account.');
    const url = new URL('/api/' + path, LMS.SQL_CONFIG.apiUrl);
    for (const [key, value] of Object.entries(query)) if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
    const send = async refresh => fetch(url, {
      method, signal, cache: 'no-store', credentials: 'omit',
      headers: { Authorization: 'Bearer ' + await user.getIdToken(refresh),
        ...(LMS.AccountAccess?.headers() || {}),
        ...(accountsIdentity ? { 'X-Accounts-Identity': accountsIdentity } : {}),
        ...(path === 'session' || !LMS.DB.sqlDataset ? {} : { 'X-Library-Dataset': LMS.DB.sqlDataset }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let response = await send(false);
    if (response.status === 401) response = await send(true);
    const result = await response.json();
    if (!response.ok) {
      const messages = {
        SIGN_IN_REQUIRED: 'Sign in with Google.', INVALID_SESSION: 'Please sign in again.',
        ADMIN_ACCESS_REQUIRED: 'This Google account does not have library access.',
        ACCOUNTS_SIGN_IN_REQUIRED: 'Accounts is locked. Verify your Accounts email again.',
        ACCOUNTS_VERIFY_AGAIN: 'Verify your Accounts email again to continue.',
        ACCOUNTS_DEVICE_VERIFY_REQUIRED: 'First verify your Accounts email on this browser/device. Verification lasts 7 days.',
        ACCOUNTS_PASSWORD_INVALID: 'Username/password is incorrect or the temporary password has expired.',
        ACCOUNTS_TOO_MANY_ATTEMPTS: 'Too many attempts. Try again after 15 minutes.',
        ACCOUNTS_PASSWORD_REQUIREMENTS: 'Enter a username and a password with 8–256 characters.',
        ACCOUNTS_INVALID_EXPIRY: 'Choose a password expiry between 1 hour and 7 days.',
        RECORD_CHANGED: 'Cloud changed this record. Review before overwriting.',
        DATASET_CHANGED: 'The library backup has been replaced. Close old tabs, refresh and sign in again. Previous pending edits are retained separately.',
        ROLL_ALREADY_EXISTS: 'This roll number is already assigned to another student.',
        SEAT_CONFLICT: 'This seat or shift is no longer available. Choose another seat or shift.',
        READ_ONLY_PREVIEW: 'SQL migration is still in preview. Editing is not enabled.',
        ORIGIN_NOT_ALLOWED: 'This website has not been enabled for SQL access.'
      };
      const error = new Error(messages[result.error] || ('SQL save could not finish (' + (result.error || response.status) + '). Pending changes remain on this device.'));
      if (result.error === 'DATASET_CHANGED') { LMS.DB.sqlAuthorized = false; LMS.Auth.endSession(); LMS.DB.notify('auth'); }
      if (result.error === 'ACCOUNTS_SIGN_IN_REQUIRED') LMS.AccountAccess?.clear();
      error.code = result.error; error.status = response.status; throw error;
    }
    // Ignore a response if sign-out/account switching happened while it was in flight.
    if (LMS.DB.auth?.currentUser?.uid !== user.uid) throw new Error('Account changed. Please try again.');
    return result;
  },
  students: (query, signal) => LMS.SqlApi.request('students', { query, signal }),
  student: (id, signal) => LMS.SqlApi.request('students/' + encodeURIComponent(id), { signal }),
  receipts: (studentId, cursor, signal) => LMS.SqlApi.request('student-receipts', { query: { studentId, ...cursor }, signal }),
  photo: (studentId, field = 'photo', signal) => LMS.SqlApi.request('student-photo', { query: { studentId, field }, signal }),
  status: () => LMS.SqlApi.request('migration-status'),
  operation: operation => LMS.SqlApi.request('operations', { method: 'POST', body: operation }),
  backup: () => LMS.SqlApi.request('backup'),
  asset: (recordKey, field) => LMS.SqlApi.request('asset', { query: { recordKey, field } })
};

LMS.usePhotoSource = src => {
  const [loaded, setLoaded] = useState({ key: null, source: null, error: '' });
  const remote = typeof src === 'string' && src.startsWith('lms-photo:');
  useEffect(() => {
    if (!remote) return;
    let cancelled = false;
    const match = src.match(/^lms-photo:([^:]+):(photo|formPhoto)(?::[a-zA-Z0-9-]+)?$/);
    if (!match) { setLoaded({ key: src, error: 'Photo unavailable.' }); return; }
    LMS.SqlApi.asset(decodeURIComponent(match[1]), match[2]).then(result => {
      if (!cancelled) setLoaded({ key: src, source: result.source, error: '' });
    }).catch(() => { if (!cancelled) setLoaded({ key: src, source: null, error: 'Could not load photo.' }); });
    return () => { cancelled = true; };
  }, [src, remote]);
  return remote ? loaded.key === src ? loaded : { source: null, error: '' } : { source: src, error: '' };
};
LMS.SqlImage = ({ src, ...props }) => {
  const photo = LMS.usePhotoSource(src);
  return photo.source ? h('img', { ...props, src: photo.source }) : html`<span role="status">${photo.error || 'Loading photo…'}</span>`;
};
