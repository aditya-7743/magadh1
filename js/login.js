// ==================== LOGIN.JS - Light Theme Login Page ====================
window.LMS = window.LMS || {};

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

  const owner = LMS.DB.localLoad('owner') || LMS.DEFAULT_OWNER;
  const { Button, Input, Card, Icons } = LMS;

  // Background Animation
  useEffect(() => {
    // Add particle effect logic here if needed, or rely on CSS animations
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    // Simulate loading for effect
    setLoading(true);
    setTimeout(() => {
      if (username === owner.username && password === owner.password) {
        LMS.DB.localSave('session', { loggedIn: true, timestamp: Date.now() });
        onLogin();
      } else {
        setError('Invalid credentials! Access denied.');
        setLoading(false);
      }
    }, 800);
  };

  const handleReset = (e) => {
    e.preventDefault();
    if (securityAnswer.toLowerCase() === owner.securityAnswer.toLowerCase()) {
      const updated = { ...owner, password: newPassword };
      LMS.DB.localSave('owner', updated);
      LMS.DB.save('owner', updated);
      setMode('login');
      setError('');
      alert('Password reset successful!');
    } else {
      setError('Wrong security answer!');
    }
  };

  const handleGoogleSignIn = async () => {
    if (!LMS.DB.isConfigured) {
      setError('Firebase not configured. Add your config in js/firebase-db.js');
      return;
    }
    setLoading(true);
    const user = await LMS.DB.signInWithGoogle();
    if (user) {
      setFirebaseUser(user);
      setError('');
      try {
        await LMS.DB.syncCloudToLocal();
        window.location.reload();
      } catch (e) {
        console.error('Sync error:', e);
        setLoading(false);
      }
    } else {
      setError('Google sign-in failed.');
      setLoading(false);
    }
  };

  return html`
    <div class="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-gray-900">
        <!-- Dynamic Background -->
        <div class="absolute inset-0 z-0">
            <div class="absolute inset-0 bg-gradient-to-br from-gray-900 via-[#1a1a2e] to-[#4b0082] opacity-90"></div>
            <div class="absolute inset-0 opacity-30" 
                 style=${{
      backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(79, 70, 229, 0.4) 0%, transparent 50%)',
      animation: 'shimmer 10s infinite linear'
    }}>
            </div>
            <!-- Floating Orbs -->
            <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
            <div class="absolute top-1/3 right-1/4 w-96 h-96 bg-yellow-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
            <div class="absolute bottom-1/4 left-1/3 w-96 h-96 bg-pink-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>

        <!-- Main Card -->
        <div class="relative z-10 w-full max-w-lg p-8 mx-4 transform transition-all hover:scale-[1.01] duration-500">
            <div class="glass rounded-3xl p-8 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-slate-900/60 backdrop-blur-xl relative overflow-hidden group">
                
                <!-- Shine Effect -->
                <div class="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>

                <!-- Logo & Header -->
                <div class="text-center mb-10 relative">
                    <div class="w-24 h-24 mx-auto mb-6 relative group cursor-pointer">
                        <div class="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl rotate-6 group-hover:rotate-12 transition-transform duration-300 blur-lg opacity-70"></div>
                        <div class="relative bg-black rounded-2xl w-full h-full flex items-center justify-center border border-white/10 shadow-2xl">
                            <span class="text-5xl transform group-hover:scale-110 transition-transform duration-300">📚</span>
                        </div>
                    </div>
                    
                    <h1 class="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-100 to-yellow-400 mb-2 drop-shadow-sm tracking-tight"
                        style=${{ fontFamily: "'Inter', sans-serif" }}>
                        MAGADH
                    </h1>
                    <p class="text-indigo-200 tracking-[0.3em] text-sm uppercase font-bold text-shadow-sm">Library System</p>
                </div>

                ${mode === 'login' ? html`
                    <form onSubmit=${handleLogin} class="space-y-6">
                        <div class="space-y-4">
                            <!-- Username -->
                            <div class="relative group">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-purple-400 transition-colors">
                                    <${Icons.User} />
                                </div>
                                <input 
                                    type="text" 
                                    value=${username} 
                                    onInput=${e => setUsername(e.target.value)} 
                                    placeholder="Username" 
                                    required
                                    class="w-full pl-11 pr-4 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-medium"
                                />
                            </div>

                            <!-- Password -->
                            <div class="relative group">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-purple-400 transition-colors">
                                    <${Icons.Lock} />
                                </div>
                                <input 
                                    type=${showPassword ? 'text' : 'password'} 
                                    value=${password} 
                                    onInput=${e => setPassword(e.target.value)} 
                                    placeholder="Password" 
                                    required
                                    class="w-full pl-11 pr-12 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-medium"
                                />
                                <button type="button" 
                                    class="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors"
                                    onClick=${() => setShowPassword(!showPassword)}
                                >
                                    ${showPassword ? html`<${Icons.EyeOff} />` : html`<${Icons.Eye} />`}
                                </button>
                            </div>
                        </div>

                        ${error && html`
                            <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm font-medium flex items-center gap-2 animate-shake">
                                <span>⚠️</span> ${error}
                            </div>
                        `}

                        <button 
                            type="submit" 
                            disabled=${loading}
                            class="w-full py-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 bg-[length:200%_auto] hover:bg-right text-white font-bold rounded-xl shadow-lg hover:shadow-purple-500/30 transform hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 group"
                        >
                            ${loading ? html`<div class="spinner border-white/30 w-5 h-5"></div>` : html`
                                <span>ACCESS PORTAL</span>
                                <span class="group-hover:translate-x-1 transition-transform">➔</span>
                            `}
                        </button>

                        <div class="relative py-4">
                            <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-700"></div></div>
                            <div class="relative flex justify-center text-sm"><span class="px-2 bg-slate-900/60 text-gray-400">Secure Options</span></div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <button type="button" onClick=${handleGoogleSignIn} 
                                class="px-4 py-3 bg-white text-gray-900 rounded-xl font-semibold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 shadow-sm">
                                <${Icons.Google} /> Cloud Sync
                            </button>
                            <button type="button" onClick=${() => setMode('reset')}
                                class="px-4 py-3 bg-gray-800 text-gray-300 rounded-xl font-medium hover:bg-gray-700 transition-colors border border-gray-700">
                                Forgot Password?
                            </button>
                        </div>
                    </form>
                ` : html`
                    <!-- RESET PASSWORD FORM (Kept similar style) -->
                    <form onSubmit=${handleReset} class="space-y-6 animate-fade-in-up">
                        <div class="text-center mb-6">
                            <h3 class="text-xl font-bold text-white mb-1">Account Recovery</h3>
                            <p class="text-sm text-gray-400">Answer your security question</p>
                        </div>
                        
                        <div class="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 mb-4">
                            <p class="text-xs text-purple-300 uppercase font-bold tracking-wider mb-1">Security Question</p>
                            <p class="text-white font-medium">${owner.securityQuestion}</p>
                        </div>

                        <div class="space-y-4">
                             <div>
                                <input 
                                    type="text" 
                                    value=${securityAnswer} 
                                    onInput=${e => setSecurityAnswer(e.target.value)} 
                                    placeholder="Your Answer" 
                                    required
                                    class="w-full px-4 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-all"
                                />
                            </div>
                            <div>
                                <input 
                                    type="password" 
                                    value=${newPassword} 
                                    onInput=${e => setNewPassword(e.target.value)} 
                                    placeholder="New Password" 
                                    required
                                    class="w-full px-4 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-all"
                                />
                            </div>
                        </div>
                        
                        <button type="submit" 
                            class="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl shadow-lg hover:shadow-emerald-500/30 transform hover:-translate-y-1 transition-all">
                            Reset Password
                        </button>
                        
                        <button type="button" 
                            class="w-full text-gray-400 hover:text-white text-sm font-medium transition-colors" 
                            onClick=${() => setMode('login')}>
                            ← Back to Login
                        </button>
                    </form>
                `}
            </div>
            
            <p class="text-center text-gray-500 text-xs mt-8 opacity-60">
                &copy; 2024 Magadh Library. All Rights Reserved. <br/>
                Protected by secure authentication.
            </p>
        </div>
    </div>
  `;
};
