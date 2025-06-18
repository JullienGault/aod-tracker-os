import React, { useState, useEffect, useCallback } from 'react';

// Importations Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
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

const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-aod-app';

// =================================================================
// COMPOSANTS DE L'INTERFACE UTILISATEUR (UI) - Simplifiés
// =================================================================
const AnimationStyles = () => ( <style>{`.custom-scrollbar::-webkit-scrollbar{width:8px}.custom-scrollbar::-webkit-scrollbar-track{background:#374151;border-radius:10px}.custom-scrollbar::-webkit-scrollbar-thumb{background:#60A5FA;border-radius:10px}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:#3B82F6}`}</style> );
const Toast = ({ message, type, onClose }) => { const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500'; const Icon = type === 'success' ? Check : AlertTriangle; return ( <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 p-4 rounded-lg shadow-lg text-white flex items-center gap-3 z-[999]`}><Icon size={24} /><span>{message}</span><button onClick={onClose} className="ml-2 text-white/80 hover:text-white transition-colors"><X size={20} /></button></div> ); };
const LoginForm = ({ onLogin, error }) => { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const handleSubmit = (e) => { e.preventDefault(); onLogin(email, password); }; return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 relative" onClick={(e) => e.stopPropagation()}><h2 className="text-2xl font-bold text-white mb-6 text-center">Connexion</h2><form onSubmit={handleSubmit} className="space-y-6"><div><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><div><input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div>{error && <p className="text-red-400 text-sm text-center">{error}</p>}<button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors">Se connecter</button></form></div></div> ); };

// =================================================================
// COMPOSANT PRINCIPAL : App (Mode Diagnostic - Étape 2)
// =================================================================
export default function App() {
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [authReady, setAuthReady] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const [showLogin, setShowLogin] = useState(true);
    const [toast, setToast] = useState(null);
    
    // State pour les données
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dbError, setDbError] = useState(null);

    useEffect(() => {
        document.title = "AOD Tracker OS - Diagnostic";
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                if (user) {
                    setCurrentUser(user);
                    setShowLogin(false);
                } else {
                    setCurrentUser(null);
                    setShowLogin(true);
                    setOrders([]); // Vider les données à la déconnexion
                }
                setAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase Init Error:", error);
            setDbError("Erreur d'initialisation de Firebase.");
            setAuthReady(true);
        }
    }, []);

    // useEffect pour récupérer les données
    useEffect(() => {
        if (!authReady || !db || !currentUser) {
            if (authReady) setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const ordersCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/orders`);
        const q = query(ordersCollectionRef, orderBy("orderDate", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            try {
                const fetchedOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setOrders(fetchedOrders);
                setDbError(null);
            } catch(e) {
                console.error("Erreur lors du mapping des données:", e);
                setDbError("Une erreur est survenue lors de la lecture des données. Vérifiez la console.");
            }
            setIsLoading(false);
        }, (err) => {
            console.error("Error fetching orders:", err);
            setDbError("Impossible de charger les commandes.");
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [authReady, db, currentUser]);

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

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <AnimationStyles />
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
                
                <div className="mt-10 p-6 bg-gray-800 rounded-2xl border border-blue-500/30">
                    <h2 className="text-2xl font-semibold text-blue-400">Étape 2 : Test de lecture des données</h2>
                    
                    {isLoading && <p className="mt-4 text-yellow-400">Chargement des commandes...</p>}
                    
                    {dbError && <div className="mt-4 p-4 bg-red-500/10 rounded-lg"><p className="text-red-400 font-bold">Erreur:</p><p className="text-red-400">{dbError}</p></div>}
                    
                    {!isLoading && !dbError && (
                        <div className="mt-4">
                            <h3 className="font-semibold text-green-400">
                                Données lues avec succès ! {orders.length} commande(s) trouvée(s).
                            </h3>
                            <div className="mt-4 space-y-2 max-h-96 overflow-y-auto custom-scrollbar bg-gray-900 p-4 rounded-lg">
                                {orders.map(order => (
                                    <pre key={order.id} className="bg-gray-700/50 p-2 rounded text-xs whitespace-pre-wrap break-all">
                                        {JSON.stringify(order, null, 2)}
                                    </pre>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
