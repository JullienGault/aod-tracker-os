import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { initializeApp, deleteApp } from 'firebase/app';
import { 
    getFirestore, collection, query, onSnapshot, doc, setDoc, deleteDoc, 
    orderBy, serverTimestamp, arrayUnion, getDoc
} from 'firebase/firestore';
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, 
    createUserWithEmailAndPassword, updateProfile 
} from 'firebase/auth';
import { 
    Package, PackageCheck, PackageOpen, Plus, Edit, Trash2, LogIn, LogOut, 
    UserCheck, X, AlertTriangle, ChevronDown, History, CheckCircle, Clock, Users, ShieldCheck
} from 'lucide-react';

// =================================================================
// CONFIGURATION ET INITIALISATION FIREBASE (STABLE)
// =================================================================
const firebaseConfig = {
    apiKey: "AIzaSyBuWquEXyrx7EEMLcOsRJ81ThnlUhrnIew", // <-- NOUVELLE CLÉ INSÉRÉE
    authDomain: "aod-tracker-os.firebaseapp.com",
    projectId: "aod-tracker-os",
    storageBucket: "aod-tracker-os.appspot.com",
    messagingSenderId: "429289937311",
    appId: "1:429289937311:web:1ab993b09899afc2b245aa",
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const APP_ID = "aod-tracker-os";
const ADMIN_BOOTSTRAP_EMAIL = "jullien.gault@orange-store.com";

const ORDER_STATUSES = {
    COMMANDÉ: 'Commandé',
    LIVRÉ: 'Livré au magasin',
    RÉCUPÉRÉ: 'Récupéré par le client',
};

// =================================================================
// HOOKS PERSONNALISÉS
// =================================================================
const useAuth = () => {
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDocRef = doc(db, 'users', currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    setUser({ ...currentUser, ...userData });
                    setUserRole(userData.role);
                } else if (currentUser.email === ADMIN_BOOTSTRAP_EMAIL) {
                    console.log("Premier admin détecté, création du profil...");
                    const adminData = {
                        displayName: currentUser.displayName || currentUser.email.split('@')[0],
                        email: currentUser.email,
                        role: 'admin',
                        createdAt: serverTimestamp()
                    };
                    await setDoc(userDocRef, adminData);
                    setUser({ ...currentUser, ...adminData });
                    setUserRole('admin');
                } else {
                    setUser(currentUser);
                    setUserRole(null);
                }
            } else {
                setUser(null);
                setUserRole(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    return { user, isAdmin: userRole === 'admin', loading };
};

// =================================================================
// COMPOSANTS UI
// =================================================================
const AnimationStyles = () => (<style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}.animate-fade-in{animation:fadeIn .5s ease-in-out}@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.animate-fade-in-up{animation:fadeInUp .5s ease-out forwards}`}</style>);

const Modal = ({ children, onClose, size = 'md' }) => ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
        <div className={`bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-${size} border border-gray-700 relative animate-fade-in-up`} onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={24} /></button>
            {children}
        </div>
    </div>, document.body
);

const ConfirmationModal = ({ onConfirm, onCancel, title, message }) => (
    <Modal onClose={onCancel} size="sm">
        <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-500/20"><AlertTriangle className="h-6 w-6 text-yellow-400" /></div>
            <h3 className="mt-4 text-xl font-bold text-white">{title}</h3>
            <p className="mt-2 text-sm text-gray-400">{message}</p>
            <div className="mt-6 flex gap-4">
                <button type="button" onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-500 font-bold py-2 px-4 rounded-lg">Annuler</button>
                <button type="button" onClick={onConfirm} className="w-full bg-red-600 hover:bg-red-700 font-bold py-2 px-4 rounded-lg">Confirmer</button>
            </div>
        </div>
    </Modal>
);

const LoginForm = ({ onLogin, authError }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        await onLogin(email, password);
        setIsLoading(false);
    };

    return (
        <div>
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Connexion AOD Tracker</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                {authError && <p className="text-red-400 text-sm text-center">{authError}</p>}
                <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors disabled:bg-gray-500">
                    {isLoading ? "Connexion..." : "Se connecter"}
                </button>
            </form>
        </div>
    );
};
// ... (autres composants UI, pas de changement majeur ici)
const OrderForm = ({ onSave, onCancel, order, advisors, currentUser, isAdmin }) => {
    const [clientName, setClientName] = useState(order?.clientName || '');
    const [accessory, setAccessory] = useState(order?.accessory || '');
    const [advisorId, setAdvisorId] = useState(order?.advisorId || currentUser.uid);
    
    const handleSubmit = (e) => {
        e.preventDefault();
        const advisor = advisors.find(a => a.uid === advisorId);
        onSave({
            clientName,
            accessory,
            advisorId,
            advisorName: advisor?.displayName || 'Inconnu'
        });
    };

    return (
        <div>
            <h2 className="text-2xl font-bold text-white mb-6">{order ? 'Modifier' : 'Ajouter'} une commande</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <input type="text" placeholder="Nom du client" value={clientName} onChange={e => setClientName(e.target.value)} required className="w-full bg-gray-700 p-3 rounded-lg" />
                <input type="text" placeholder="Accessoire commandé" value={accessory} onChange={e => setAccessory(e.target.value)} required className="w-full bg-gray-700 p-3 rounded-lg" />
                {isAdmin && (
                    <select value={advisorId} onChange={e => setAdvisorId(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg">
                        <option value="">-- Choisir un conseiller --</option>
                        {advisors.map(adv => <option key={adv.uid} value={adv.uid}>{adv.displayName}</option>)}
                    </select>
                )}
                <div className="flex gap-4 pt-4">
                    <button type="button" onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-500 font-bold py-2 px-4 rounded-lg">Annuler</button>
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 font-bold py-2 px-4 rounded-lg">Enregistrer</button>
                </div>
            </form>
        </div>
    );
};

const UserManagementModal = ({ onRegister, onClose, advisors }) => {
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('conseiller');
    const [error, setError] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < 6) {
            setError('Le mot de passe doit contenir au moins 6 caractères.');
            return;
        }
        setIsRegistering(true);
        try {
            await onRegister({ displayName, email, password, role });
            setDisplayName(''); setEmail(''); setPassword(''); setRole('conseiller');
        } catch(err) {
            setError(err.message);
        } finally {
            setIsRegistering(false);
        }
    };
    
    return (
      <Modal onClose={onClose} size="lg">
        <h2 className="text-2xl font-bold text-white mb-6">Gérer les utilisateurs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <h3 className="text-lg font-semibold text-blue-300 mb-4">Ajouter un utilisateur</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" placeholder="Nom complet" value={displayName} onChange={e => setDisplayName(e.target.value)} required className="w-full bg-gray-700 p-3 rounded-lg" />
                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-gray-700 p-3 rounded-lg" />
                    <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-gray-700 p-3 rounded-lg" />
                    <select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg">
                        <option value="conseiller">Conseiller</option>
                        <option value="admin">Administrateur</option>
                    </select>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <button type="submit" disabled={isRegistering} className="w-full bg-blue-600 hover:bg-blue-700 font-bold py-2 px-4 rounded-lg disabled:bg-gray-500">
                        {isRegistering ? 'Création...' : "Créer l'utilisateur"}
                    </button>
                </form>
            </div>
            <div>
                <h3 className="text-lg font-semibold text-blue-300 mb-4">Utilisateurs actuels</h3>
                <ul className="space-y-3 max-h-64 overflow-y-auto pr-2">
                    {advisors.map(adv => (
                        <li key={adv.uid} className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                            <div>
                                <p className="font-semibold text-white">{adv.displayName}</p>
                                <p className="text-xs text-gray-400">{adv.email}</p>
                            </div>
                            <span className={`inline-flex items-center gap-2 px-2 py-1 text-xs font-medium rounded-full ${adv.role === 'admin' ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300'}`}>
                                {adv.role === 'admin' ? <ShieldCheck size={14} /> : <UserCheck size={14} />} {adv.role}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
      </Modal>
    );
};

const StatusPill = ({ status }) => {
    const statusInfo = {[ORDER_STATUSES.COMMANDÉ]:{i:Clock,c:'bg-blue-500/20 text-blue-300',r:'ring-blue-500/30'},[ORDER_STATUSES.LIVRÉ]:{i:PackageCheck,c:'bg-yellow-500/20 text-yellow-300',r:'ring-yellow-500/30'},[ORDER_STATUSES.RÉCUPÉRÉ]:{i:CheckCircle,c:'bg-green-500/20 text-green-300',r:'ring-green-500/30'}};
    const { i: Icon, c, r } = statusInfo[status] || { i: Clock, c: 'bg-gray-500/20 text-gray-300', r: 'ring-gray-500/30' };
    return <span className={`inline-flex items-center gap-2 px-3 py-1 text-sm font-medium rounded-full ${c} ring-1 ring-inset ${r}`}><Icon size={16} /> {status}</span>;
};

const OrderCard = ({ order, onStatusChange, onEdit, onDelete, isAdmin }) => {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="bg-gray-800 rounded-2xl shadow-lg p-5 transition-all duration-300 hover:shadow-2xl hover:bg-gray-700/50 animate-fade-in-up">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-bold text-white">{order.clientName}</h3>
                    <p className="text-gray-300">{order.accessory}</p>
                    <p className="text-xs text-gray-400 mt-1">Par {order.advisorName} - {order.createdAt?.toDate().toLocaleDateString('fr-FR')}</p>
                </div>
                <StatusPill status={order.status} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    {Object.values(ORDER_STATUSES).map(status => (
                        <button key={status} onClick={() => onStatusChange(order.id, status)} disabled={order.status === status} className={`px-3 py-1 text-xs rounded-md transition-colors ${order.status===status?'bg-blue-600 text-white cursor-not-allowed':'bg-gray-700 hover:bg-gray-600'}`}>{status.split(' ')[0]}</button>
                    ))}
                </div>
                {isAdmin && (
                    <div className="flex items-center gap-2">
                        <button onClick={() => onEdit(order)} className="p-2 text-gray-400 hover:text-white"><Edit size={18} /></button>
                        <button onClick={() => onDelete(order.id)} className="p-2 text-red-500 hover:text-red-400"><Trash2 size={18} /></button>
                    </div>
                )}
            </div>
            {order.history && <div className="mt-4">
                <button onClick={() => setExpanded(!expanded)} className="text-sm text-blue-400 flex items-center gap-1">Historique <ChevronDown className={`transition-transform ${expanded?'rotate-180':''}`} size={16}/></button>
                {expanded && <ul className="mt-2 space-y-2 text-xs text-gray-400 pl-2 border-l-2 border-gray-700">{[...order.history].reverse().map((e, i)=><li key={i} className="pl-2"><p><strong>{e.status}</strong> par {e.updatedBy}</p><p>{e.updatedAt?.toDate().toLocaleString('fr-FR')}</p></li>)}</ul>}
            </div>}
        </div>
    );
};

// =================================================================
// COMPOSANT PRINCIPAL : App
// =================================================================
export default function App() {
    const { user, isAdmin, loading } = useAuth();
    const [orders, setOrders] = useState([]);
    const [advisors, setAdvisors] = useState([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [authError, setAuthError] = useState(null);
    const [confirmAction, setConfirmAction] = useState(null);

    useEffect(() => { document.title = "AOD Tracker OS"; }, []);

    useEffect(() => {
        if (!user) return;
        const qUsers = query(collection(db, 'users'), orderBy('displayName'));
        const unsubUsers = onSnapshot(qUsers, snap => setAdvisors(snap.docs.map(d => ({ uid: d.id, ...d.data() }))));
        
        const qOrders = query(collection(db, `artifacts/${APP_ID}/public/data/orders`), orderBy('createdAt', 'desc'));
        const unsubOrders = onSnapshot(qOrders, snap => {
            setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsDataLoading(false);
        }, err => { console.error(err); setIsDataLoading(false); });

        return () => { unsubUsers(); unsubOrders(); };
    }, [user]);

    const handleLogin = useCallback(async (email, password) => {
        setAuthError(null);
        console.log(`Tentative de connexion avec : ${email}`);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            console.log("Connexion réussie !");
        } catch (error) {
            console.error("Erreur de connexion Firebase :", error.code, error.message);
            if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(error.code)) {
                setAuthError("Email ou mot de passe incorrect.");
            } else {
                setAuthError("Une erreur de connexion est survenue. Vérifiez la console pour les détails.");
            }
        }
    }, []);

    const handleLogout = useCallback(() => { signOut(auth); }, []);
    
    const handleRegisterUser = useCallback(async ({ displayName, email, password, role }) => {
        const tempAppForRegistration = initializeApp(firebaseConfig, `temp-app-${Date.now()}`);
        try {
            const tempAuth = getAuth(tempAppForRegistration);
            const userCredential = await createUserWithEmailAndPassword(tempAuth, email, password);
            const newUser = userCredential.user;
            await updateProfile(newUser, { displayName });
            await setDoc(doc(db, 'users', newUser.uid), { displayName, email, role, createdAt: serverTimestamp() });
            await signOut(tempAuth);
        } catch (error) {
            console.error("Erreur de création d'utilisateur:", error);
            throw new Error(error.code === 'auth/email-already-in-use' ? "Cet email est déjà utilisé." : "Erreur lors de la création.");
        } finally {
            await deleteApp(tempAppForRegistration);
        }
    }, []);

    const handleSaveOrder = useCallback(async (orderData) => {
        if (!user) return;
        const id = editingOrder?.id || doc(collection(db, `artifacts/${APP_ID}/public/data/orders`)).id;
        const ref = doc(db, `artifacts/${APP_ID}/public/data/orders`, id);
        try {
            if (editingOrder) {
                await setDoc(ref, orderData, { merge: true });
            } else {
                const newOrder = { ...orderData, id, status: ORDER_STATUSES.COMMANDÉ, createdAt: serverTimestamp(), history: [{ status: ORDER_STATUSES.COMMANDÉ, updatedAt: serverTimestamp(), updatedBy: user.displayName || user.email }]};
                await setDoc(ref, newOrder);
            }
            setIsOrderModalOpen(false); setEditingOrder(null);
        } catch (e) { console.error("Erreur d'enregistrement:", e); }
    }, [user, editingOrder]);
    
    const handleStatusChange = useCallback(async (orderId, newStatus) => {
        if (!user) return;
        const ref = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderId);
        const historyEntry = { status: newStatus, updatedAt: serverTimestamp(), updatedBy: user.displayName || user.email };
        try { await setDoc(ref, { status: newStatus, history: arrayUnion(historyEntry) }, { merge: true }); } catch (e) { console.error("Erreur de statut:", e); }
    }, [user]);

    const handleDeleteOrder = (orderId) => {
        setConfirmAction({
            title: "Supprimer la commande ?",
            message: "Cette action est irréversible et la commande sera définitivement supprimée.",
            onConfirm: async () => {
                const ref = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderId);
                try { await deleteDoc(ref); } catch (e) { console.error("Erreur de suppression:", e); }
                setConfirmAction(null);
            }
        });
    };

    if (loading) {
        return <div className="bg-gray-900 min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" /></div>;
    }

    if (!user) {
        return (
            <div className="bg-gray-900 min-h-screen flex items-center justify-center">
                 <AnimationStyles />
                 <Modal onClose={() => {}}><LoginForm onLogin={handleLogin} authError={authError}/></Modal>
            </div>
        );
    }
    
    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <AnimationStyles />
            {isOrderModalOpen && <Modal onClose={() => { setIsOrderModalOpen(false); setEditingOrder(null); }}><OrderForm onSave={handleSaveOrder} onCancel={() => { setIsOrderModalOpen(false); setEditingOrder(null); }} order={editingOrder} advisors={advisors} currentUser={user} isAdmin={isAdmin} /></Modal>}
            {isAdmin && isUserModalOpen && <UserManagementModal advisors={advisors} onRegister={handleRegisterUser} onClose={() => setIsUserModalOpen(false)} />}
            {confirmAction && <ConfirmationModal {...confirmAction} onCancel={() => setConfirmAction(null)} />}

            <div className="max-w-4xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3"><Package/>Suivi des Commandes</h1>
                        <p className="text-gray-400 mt-1">Gérez les commandes d'accessoires de votre équipe.</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-gray-300 flex items-center gap-2">{user.displayName || user.email} {isAdmin && <span className="text-xs font-bold text-blue-300 bg-blue-500/20 px-2 py-1 rounded-full">Admin</span>}</span>
                        {isAdmin && <button onClick={() => setIsUserModalOpen(true)} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg flex items-center gap-2"><Users size={18}/> Gérer</button>}
                        <button onClick={() => { setEditingOrder(null); setIsOrderModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg flex items-center gap-2"><Plus size={18}/> Ajouter</button>
                        <button onClick={handleLogout} title="Se déconnecter" className="text-gray-400 hover:text-white p-2 rounded-lg bg-gray-800 hover:bg-gray-700"><LogOut size={20}/></button>
                    </div>
                </header>

                <main>
                    {isDataLoading ? (
                        <div className="text-center py-10"><p>Chargement des données...</p></div>
                    ) : orders.length === 0 ? (
                        <div className="text-center py-20 bg-gray-800 rounded-2xl">
                            <h2 className="text-2xl font-semibold text-gray-300">Aucune commande en cours.</h2>
                            <p className="text-gray-400 mt-2">Cliquez sur "Ajouter" pour créer une nouvelle commande.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {orders.map(order => (
                                <OrderCard key={order.id} order={order} onStatusChange={handleStatusChange} onEdit={o => { setEditingOrder(o); setIsOrderModalOpen(true); }} onDelete={handleDeleteOrder} isAdmin={isAdmin} />
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
