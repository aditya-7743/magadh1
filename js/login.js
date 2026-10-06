

// ==================== LOGIN.JS - Royal Theme Login Page ====================
window.LMS = window.LMS || {};

LMS.LoginPage = ({ onLogin }) => {
    const [mode, setMode] = useState('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [securityAnswer, setSecurityAnswer] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [loading, setLoading] = useState(false);

    const savedOwner = LMS.DB.localLoad('owner');
    const owner = savedOwner || LMS.DEFAULT_OWNER;
    const needsSetup = !savedOwner?.credential && !savedOwner?.password;
    const { Button, Input, Card, Icons } = LMS;

    useEffect(() => {
        if (!LMS.DB.auth) return;
        LMS.DB.auth.getRedirectResult().then(async result => {
            if (!result?.user) return;
            await LMS.DB.authReady;
            LMS.Auth.startSession('google'); await LMS.DB.flush(); onLogin();
        }).catch(error => setError(error.message));
    }, []);

    const handleLogin = async e => {
        e.preventDefault(); setLoading(true); setError('');
        try {
            if (needsSetup) {
                if (!username.trim()) throw new Error('Choose an admin username.');
                const updated = await LMS.Auth.withPassword({ username: username.trim() }, password);
                await LMS.DB.save('owner', updated);
            } else if (username.trim() !== owner.username || !await LMS.Auth.verify(password)) {
                throw new Error('Invalid username or password.');
            }
            if (!LMS.Auth.startSession()) throw new Error('Cannot save login session.');
            await LMS.DB.flush();
            onLogin();
        } catch (error) { setError(error.message); setLoading(false); }
    };

    const handleReset = async e => {
        e.preventDefault();
        try {
            const allowed = owner.recoveryCredential && await LMS.Auth.matches(securityAnswer.trim().toLowerCase(), owner.recoveryCredential);
            if (!allowed) throw new Error('Private recovery is not configured or the answer is wrong. Use your Google account to sign in, then set a new admin password in Settings.');
            const updated = await LMS.Auth.withPassword(owner, newPassword);
            await LMS.DB.save('owner', updated); setMode('login'); setError('');
        } catch (error) { setError(error.message); }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true); setError('');
        try {
            const user = await LMS.DB.signInWithGoogle();
            if (!user) return;
            await LMS.DB.authReady;
            if (!LMS.Auth.startSession('google')) throw new Error('Cannot save login session.');
            await LMS.DB.flush();
            onLogin();
        } catch (error) { setError(error.message); setLoading(false); }
    };

    const libraryName = LMS.DB.localLoad('settings', {}).libraryName || LMS.DEFAULT_SETTINGS.libraryName;
    return html`<div class="login-stage">
      <section class="login-story">
        <div class="login-brand"><span class="brand-mark"><${Icons.Seats} /></span>${libraryName}</div>
        <div class="login-story-content"><div class="login-kicker">A LITTLE ORDER. A LOT OF POSSIBILITY.</div><h1>Your library.<br/><em>Beautifully organised.</em></h1><p>One thoughtful workspace for your students, seats and everyday library life.</p><div class="library-illustration" aria-hidden="true">${Array.from({length:24}, (_, i) => html`<i key=${i}></i>`)}</div></div>
        <div class="login-story-footer">Built for the people behind a place to learn.</div>
      </section>
      <section class="login-form-side"><div class="login-form-wrap">
        <div class="page-eyebrow">LIBRARY WORKSPACE</div><h2>${LMS.DB.sqlMode ? 'Welcome back' : mode === 'reset' ? 'Account recovery' : needsSetup ? 'Set up your workspace' : 'Welcome back'}</h2><p class="login-intro">${LMS.DB.sqlMode ? 'Sign in with your authorised library Google account.' : mode === 'reset' ? 'Use your private recovery answer to reset your password.' : needsSetup ? 'Create an admin account to get started.' : 'Sign in to take care of your library.'}</p>
        ${error && html`<div role="alert" class="login-error">${error}</div>`}
        ${LMS.DB.sqlMode ? html`<button class="btn btn-primary w-full" type="button" onClick=${handleGoogleSignIn} disabled=${loading}><${Icons.Google} />${loading ? 'Connecting…' : 'Continue with Google'}</button>` : mode === 'login' ? html`
          ${needsSetup && html`<div class="login-notice">Choose a username and a password with at least 8 characters.</div>`}
          <form onSubmit=${handleLogin}>
            <div><label class="input-label" htmlFor="login-username">Username</label><input id="login-username" class="input-field" autoComplete="username" type="text" value=${username} onInput=${e => setUsername(e.target.value)} placeholder="Username" required /></div>
            <div><div class="flex justify-between items-center"><label class="input-label" htmlFor="login-password">Password</label>${!needsSetup && html`<button type="button" class="text-link" onClick=${() => { setError(''); setMode('reset'); }}>Forgot password?</button>`}</div><div class="password-input"><input id="login-password" class="input-field" autoComplete=${needsSetup ? 'new-password' : 'current-password'} type=${showPassword ? 'text' : 'password'} value=${password} onInput=${e => setPassword(e.target.value)} placeholder="Password" required /><button type="button" aria-label=${showPassword ? 'Hide password' : 'Show password'} onClick=${() => setShowPassword(!showPassword)}>${showPassword ? html`<${Icons.EyeOff} />` : html`<${Icons.Eye} />`}</button></div></div>
            <button class="btn btn-primary w-full" type="submit" disabled=${loading}>${loading ? 'Please wait…' : needsSetup ? 'Create admin account' : 'Sign in'} <span aria-hidden="true">→</span></button>
          </form>
          <div class="login-divider">or continue with</div><button class="btn btn-secondary w-full" type="button" onClick=${handleGoogleSignIn} disabled=${loading}><${Icons.Google} />Google account</button>
        ` : html`
          <div class="login-notice">${owner.securityQuestion || 'Private recovery is not configured. Sign in with Google, then change your password in Settings.'}</div>
          <form onSubmit=${handleReset}><${Input} label="Recovery answer" placeholder="Your Answer" value=${securityAnswer} onChange=${e => setSecurityAnswer(e.target.value)} required /><${Input} label="New password" placeholder="New Password" type="password" autoComplete="new-password" value=${newPassword} onChange=${e => setNewPassword(e.target.value)} required /><button class="btn btn-primary w-full" type="submit">Reset password</button><button class="btn btn-secondary w-full" type="button" onClick=${() => { setMode('login'); setError(''); }}>Back to sign in</button></form>
        `}
        <p class="login-footnote">Administrator access · ${libraryName}</p>
      </div></section>
    </div>`;
};
