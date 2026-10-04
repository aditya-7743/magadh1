window.LMS = window.LMS || {};
LMS.Auth = {
  async hash(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210000 }, key, 256);
    return { algorithm: 'PBKDF2-SHA256', iterations: 210000,
      salt: Array.from(salt), hash: Array.from(new Uint8Array(bits)) };
  },
  async matches(password, credential) {
    if (!credential?.hash || credential.algorithm !== 'PBKDF2-SHA256') return false;
    const result = await this.hash(password, new Uint8Array(credential.salt));
    return result.hash.reduce((difference, value, i) => difference | (value ^ credential.hash[i]), 0) === 0;
  },
  async verify(password) {
    const owner = LMS.DB.localLoad('owner');
    if (!owner || !password) return false;
    if (owner.credential) return this.matches(password, owner.credential);
    // Existing installations keep their password; successful login upgrades it once.
    if (typeof owner.password !== 'string' || password !== owner.password) return false;
    const upgraded = await this.withPassword(owner, password, false);
    await LMS.DB.save('owner', upgraded);
    if (LMS.DB.scope === 'local') localStorage.removeItem('lms_owner');
    return true;
  },
  async withPassword(owner, password, enforce = true) {
    if (enforce && password.length < 8) throw new Error('Use at least 8 characters for your password.');
    const { password: ignored, securityAnswer, ...safe } = owner;
    const result = { ...safe, credential: await this.hash(password) };
    if (securityAnswer && securityAnswer.toLowerCase() !== 'blue') result.recoveryCredential = await this.hash(securityAnswer.trim().toLowerCase());
    return result;
  },
  startSession(method = 'password') {
    if (LMS.DB.sqlMode && (!LMS.DB.sqlAuthorized || method !== 'google')) throw new Error('SQL connection is not ready. Sign in with your authorised Google account and retry.');
    return LMS.DB.localSave('session', { loggedIn: true, scope: LMS.DB.scope, method, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
  },
  hasSession() {
    const session = LMS.DB.localLoad('session');
    if (LMS.DB.sqlMode && (!LMS.DB.sqlAuthorized || !LMS.DB.auth?.currentUser || session?.method !== 'google')) return false;
    return !!(session?.loggedIn && session.scope === LMS.DB.scope && session.expiresAt > Date.now());
  },
  endSession() { LMS.DB.localRemove('session'); },
  async confirmAction(message = 'Enter your admin password:') {
    const owner = LMS.DB.localLoad('owner');
    if (owner?.credential || owner?.password) return this.verify(prompt(message) || '');
    return this.verifyGoogle();
  },
  async verifyGoogle() {
    const current = LMS.DB.auth?.currentUser;
    if (!current || !this.hasSession()) return false;
    try { const provider = new firebase.auth.GoogleAuthProvider(); await current.reauthenticateWithPopup(provider); return true; }
    catch (error) { LMS.DB.fail(error); return false; }
  }
};
