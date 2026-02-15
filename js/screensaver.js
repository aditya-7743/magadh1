
// ==================== SCREENSAVER.JS - Royal 3D Text & Password Unlock ====================
window.LMS = window.LMS || {};

LMS.Screensaver = () => {
    const [isActive, setIsActive] = React.useState(false);
    const [showUnlock, setShowUnlock] = React.useState(false);
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState(false);
    const timerRef = React.useRef(null);
    const { Icons } = LMS;

    // Inactivity Timeout (3 Minutes = 180000ms)
    // Decreased to 5s for testing if needed, but keeping 3m as requested
    const SCREENSAVER_TIMEOUT = 180000;

    const resetTimer = React.useCallback(() => {
        if (isActive && !showUnlock) {
            // If already active and user moves, show unlock screen
            setShowUnlock(true);
            return;
        }
        if (isActive) return; // If active and showing unlock, ignore resets (handled by password)

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setIsActive(true);
            setShowUnlock(false); // Start with just screensaver
        }, SCREENSAVER_TIMEOUT);
    }, [isActive, showUnlock]);

    React.useEffect(() => {
        // Listeners for activity
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        events.forEach(e => window.addEventListener(e, resetTimer));

        // Initial timer
        resetTimer();

        return () => {
            events.forEach(e => window.removeEventListener(e, resetTimer));
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [resetTimer]);

    const handleUnlock = (e) => {
        e.preventDefault();
        console.log("Checking password:", password);
        if (password === '123') {
            setIsActive(false);
            setShowUnlock(false);
            setPassword('');
            setError(false);
            resetTimer(); // Restart timer
        } else {
            setError(true);
            setTimeout(() => setError(false), 500); // Shake duration
        }
    };

    if (!isActive) return null;

    return React.createElement(
        'div',
        {
            className: 'fixed inset-0 z-[9999] flex items-center justify-center bg-black overflow-hidden',
            style: {
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                perspective: '1000px'
            }
        },
        // Screensaver Content (3D Text)
        !showUnlock && React.createElement(
            'div',
            {
                className: 'select-none pointer-events-none',
                style: {
                    animation: 'rotate3d 10s linear infinite',
                    transformStyle: 'preserve-3d'
                }
            },
            React.createElement(
                'h1',
                {
                    className: 'text-6xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500',
                    style: {
                        textShadow: '0 0 50px rgba(255, 215, 0, 0.5), 0 10px 20px rgba(0,0,0,0.5)',
                        transform: 'translateZ(50px)',
                        letterSpacing: '0.2em'
                    }
                },
                'MAGADH'
            ),
            React.createElement(
                'h2',
                {
                    className: 'text-4xl md:text-7xl font-bold text-white text-center mt-4',
                    style: {
                        textShadow: '0 0 30px rgba(255, 255, 255, 0.3)',
                        transform: 'translateZ(30px)',
                        letterSpacing: '0.5em'
                    }
                },
                'LIBRARY'
            )
        ),

        // Unlock Popup (Stylish)
        showUnlock && React.createElement(
            'div',
            {
                className: `glass p-8 rounded-2xl shadow-2xl w-full max-w-sm transform transition-all duration-300 ${error ? 'animate-shake border-red-500' : 'scale-100'}`,
                style: {
                    background: 'rgba(30, 41, 59, 0.8)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                }
            },
            React.createElement(
                'div',
                { className: 'text-center mb-6' },
                React.createElement(
                    'div',
                    { className: 'w-16 h-16 mx-auto bg-purple-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-purple-500/30' },
                    React.createElement('span', { className: 'text-3xl' }, '🔒')
                ),
                React.createElement('h3', { className: 'text-2xl font-bold text-white' }, 'Welcome Back'),
                React.createElement('p', { className: 'text-gray-400 text-sm' }, 'Enter password to resume')
            ),
            React.createElement(
                'form',
                { onSubmit: handleUnlock, className: 'space-y-4' },
                React.createElement('input', {
                    type: 'password',
                    value: password,
                    onChange: (e) => setPassword(e.target.value),
                    placeholder: 'Password',
                    className: 'w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-center tracking-widest text-lg',
                    autoFocus: true
                }),
                React.createElement(
                    'button',
                    {
                        type: 'submit',
                        className: 'w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:shadow-purple-500/30 transform hover:-translate-y-1 transition-all'
                    },
                    'UNLOCK'
                )
            )
        )
    );
};
