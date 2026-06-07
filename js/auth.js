const Auth = (() => {
    const SESSION_KEY = 'rc_sess';
    window.APP_CONFIG = window.APP_CONFIG || {
        API_BASE_URL: 'http://localhost:7070'
    };

    const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;
    const API_URL = `${API_BASE_URL}/api/auth/login`;

    async function login(username, password) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            let data = null;
            try {
                data = await response.json();
            } catch {
                data = null;
            }

            if (!response.ok || !data?.success) {
                return {
                    success: false,
                    message: data?.message || 'Usuario o contraseña incorrectos.'
                };
            }

            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                username,
                name: data.name,
                role: data.role,
                at: Date.now()
            }));

            return {
                success: true,
                name: data.name,
                role: data.role
            };
        } catch {
            return {
                success: false,
                message: `No se pudo conectar con el backend (${API_BASE_URL}).`
            };
        }
    }

    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        const inPages = window.location.pathname.replace(/\\/g, '/').includes('/pages/');
        window.location.href = inPages ? '../index.html' : 'index.html';
    }

    function getSession() {
        try { 
            return JSON.parse(sessionStorage.getItem(SESSION_KEY)); 
        } catch { 
            return null; 
        }
    }

    function isLoggedIn() { 
        return !!getSession(); 
    }

    function requireLogin() {
        if (!isLoggedIn()) {
            const inPages = window.location.pathname.replace(/\\/g, '/').includes('/pages/');
            window.location.href = inPages ? '../index.html' : 'index.html';
        }
    }

    return { login, logout, getSession, isLoggedIn, requireLogin };
})();
