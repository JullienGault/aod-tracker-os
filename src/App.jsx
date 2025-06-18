import React, { useState, useEffect, useCallback } from 'react';

// Importations Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

// Importations des icônes Lucide React
import { LogOut, AlertTriangle, X, Check } from 'lucide-react';

// =================================================================
// CONFIGURATION & CONSTANTES DE L'APPLICATION
// =================================================================
const firebaseConfig = {
    apiKey: "AIzaSyBn-xE-Zf4JvIKKQNZBus8AvNmJLMeKPdg",
    authDomain: "aod-tracker-os.firebaseapp.com",
    projectId: "aod-tracker-os",
    storageBucket: "aod-tracker-os.appspot.com",
    messagingSenderId: "429289937311",
    appId: "1:429289937311:web:1ab993b09899afc2b245aa",
};

const ADMIN_EMAIL = "jullien.gault@orange-store.com";

// =================================================================
// COMPOSANTS DE L'INTERFACE UTILISATEUR (UI) - Simplifiés
// =================================================================
const Toast = ({ message, type, onClose }) => { const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500'; const Icon = type === 'success' ? Check : AlertTriangle; return ( <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 p-4 rounded-lg shadow-lg text-white flex items-center gap-3 z-[999]`}><Icon size={24} /><span>{message}</span><button onClick={onClose} className="ml-2 text-white/80 hover:text-white transition-colors"><X size={20} /></button></div> ); };
const LoginForm = ({ onLogin, error, onClose }) => { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const handleSubmit = (e) => { e.preventDefault(); onLogin(email, password); }; return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 relative" onClick={(e) => e.stopPropagation()}><h2 className="text-2xl font-bold text-white mb-6 text-center">Connexion</h2><form onSubmit={handleSubmit} className="space-y-6"><div><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><div><input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div>{error && <p className="text-red-400 text-sm text-center">{error}</p>}<button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors">Se connecter</button></form></div></div> ); };

// =================================================================
// COMPOSANT PRINCIPAL : App (Mode Diagnostic)
// =================================================================
export default function App() {
    const [auth, setAuth] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [authReady, setAuthReady] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const [showLogin, setShowLogin] = useState(true);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        document.title = "AOD Tracker OS - Diagnostic";
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            setAuth(authInstance);
            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                if (user) {
                    setCurrentUser(user);
                    setShowLogin(false);
                } else {
                    setCurrentUser(null);
                    setShowLogin(true);
                }
                setAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase Init Error:", error);
            setAuthReady(true);
        }
    }, []);

    const showToast = useCallback((message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3000); }, []);

    const handleLogin = useCallback(async (email, password) => {
        setLoginError(null);
        if (!auth) { setLoginError("Service d'authentification non prêt."); return; }
        try {
            await signInWithEmailAndPassword(auth, email, password);
            showToast("Connexion réussie.", "success");
            setShowLogin(false);
        } catch (error) {
            setLoginError("Email ou mot de passe incorrect.");
            showToast("Échec de la connexion.", 'error');
        }
    }, [auth, showToast]);

    const handleLogout = useCallback(() => {
        if (auth) signOut(auth).then(() => showToast("Déconnexion réussie.", "success"));
    }, [auth, showToast]);

    if (!authReady) {
        return <div className="bg-gray-900 min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto" /></div>;
    }

    if (showLogin || !currentUser) {
        return <div className="bg-gray-900 min-h-screen flex items-center justify-center"><LoginForm onLogin={handleLogin} error={loginError} /></div>;
    }

    // Le rendu principal est simplifié pour le diagnostic
    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold">AOD Tracker OS - Mode Diagnostic</h1>
                    <div className="flex items-center gap-4">
                        <span className="text-sm">Connecté : {currentUser.email}</span>
                        <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg transition-colors flex items-center gap-2">
                            <LogOut size={18} /> Déconnexion
                        </button>
                    </div>
                </header>
                <div className="mt-10 p-10 bg-gray-800 rounded-2xl border border-green-500/30">
                    <h2 className="text-2xl font-semibold text-green-400 text-center">Test de Connexion Réussi !</h2>
                    <p className="mt-4 text-center text-gray-300">
                        Si vous voyez ce message, l'initialisation et la connexion fonctionnent.
                        Le problème vient de l'affichage des données des commandes.
                    </p>
                    <p className="mt-4 text-center text-gray-400 text-sm">
                        Merci de me confirmer que vous voyez bien cet écran. Nous allons ensuite réintégrer les éléments un par un.
                    </p>
                </div>
            </div>
        </div>
    );
}
