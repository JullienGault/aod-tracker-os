import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { initializeApp } from 'firebase/app';
import { 
    getFirestore, collection, query, onSnapshot, doc, setDoc, deleteDoc, 
    orderBy, serverTimestamp, writeBatch, arrayUnion 
} from 'firebase/firestore';
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, 
    createUserWithEmailAndPassword, updateProfile 
} from 'firebase/auth';
import { 
    Package, PackageCheck, PackageOpen, User, Plus, Edit, Trash2, LogIn, LogOut, 
    UserCheck, X, AlertTriangle, ChevronDown, ChevronUp, History, CheckCircle, Clock 
} from 'lucide-react';

// =================================================================
// CONFIGURATION FIREBASE & CONSTANTES
// =================================================================
const firebaseConfig = {
    apiKey: "AlzaSyDonMYAFvy4kB8NmxSYF77bpJ5IRTwptR4",
    authDomain: "aod-tracker-os.firebaseapp.com",
    projectId: "aod-tracker-os",
    storageBucket: "aod-tracker-os.appspot.com",
    messagingSenderId: "429289937311",
    appId: "1:429289937311:web:1ab993b09899afc2b245aa",
};

const APP_ID = "aod-tracker-os";
const ADMIN_EMAIL = "jullien.gault@orange-store.com";

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
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);

    useEffect(() => {
        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const firestoreInstance = getFirestore(app);
        setAuth(authInstance);
        setDb(firestoreInstance);

        const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
            setUser(currentUser);
            setIsAdmin(currentUser?.email === ADMIN_EMAIL);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { user, isAdmin, loading, auth, db };
};


// =================================================================
// COMPOSANTS UI
// =================================================================

const AnimationStyles = () => (
    <style>{`
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .animate-fade-in { animation: fadeIn 0.5s ease-in-out; }
      @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .animate-fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
    `}</style>
);

const Modal = ({ children, onClose }) => ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 relative animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={24} /></button>
            {children}
        </div>
    </div>,
    document.body
);

const LoginForm = ({ onLogin, authError }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    const handleSubmit = (e) => {
        e.preventDefault();
        onLogin(email, password);
    };

    return (
        <div>
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Connexion</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                {authError && <p className="text-red-400 text-sm text-center">{authError}</p>}
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors">Se connecter</button>
            </form>
        </div>
    );
};

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

const StatusPill = ({ status }) => {
    const statusInfo = {
        [ORDER_STATUSES.COMMANDÉ]: { icon: Clock, color: 'bg-blue-500/20 text-blue-300', ring: 'ring-blue-500/30' },
        [ORDER_STATUSES.LIVRÉ]: { icon: PackageCheck, color: 'bg-yellow-500/20 text-yellow-300', ring: 'ring-yellow-500/30' },
        [ORDER_STATUSES.RÉCUPÉRÉ]: { icon: CheckCircle, color: 'bg-green-500/20 text-green-300', ring: 'ring-green-500/30' },
    };
    const { icon: Icon, color, ring } = statusInfo[status] || { icon: Clock, color: 'bg-gray-500/20 text-gray-300', ring: 'ring-gray-500/30' };

    return (
        <span className={`inline-flex items-center gap-2 px-3 py-1 text-sm font-medium rounded-full ${color} ring-1 ring-inset ${ring}`}>
            <Icon size={16} /> {status}
        </span>
    );
};

const OrderCard = ({ order, onStatusChange, onEdit, onDelete, isAdmin }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-gray-800 rounded-2xl shadow-lg p-5 transition-all duration-300 hover:shadow-2xl hover:bg-gray-700/50 animate-fade-in-up">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-bold text-white">{order.clientName}</h3>
                    <p className="text-gray-300">{order.accessory}</p>
                    <p className="text-xs text-gray-400 mt-1">Par {order.advisorName} - {new Date(order.createdAt?.toDate()).toLocaleDateString('fr-FR')}</p>
                </div>
                <StatusPill status={order.status} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    {Object.values(ORDER_STATUSES).map(status => (
                        <button 
                            key={status}
                            onClick={() => onStatusChange(order.id, status)}
                            disabled={order.status === status}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${order.status === status ? 'bg-blue-600 text-white cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            {status.split(' ')[0]}
                        </button>
                    ))}
                </div>
                {isAdmin && (
                    <div className="flex items-center gap-2">
                        <button onClick={() => onEdit(order)} className="p-2 text-gray-400 hover:text-white"><Edit size={18} /></button>
                        <button onClick={() => onDelete(order.id)} className="p-2 text-red-500 hover:text-red-400"><Trash2 size={18} /></button>
                    </div>
                )}
            </div>
            <div className="mt-4">
                <button onClick={() => setExpanded(!expanded)} className="text-sm text-blue-400 flex items-center gap-1">
                    Historique <ChevronDown className={`transition-transform ${expanded ? 'rotate-180' : ''}`} size={16} />
                </button>
                {expanded && (
                    <ul className="mt-2 space-y-2 text-xs text-gray-400 pl-2 border-l-2 border-gray-700">
                        {order.history?.map((entry, i) => (
                            <li key={i} className="pl-2">
                                <p><strong>{entry.status}</strong> par {entry.updatedBy}</p>
                                <p>{new Date(entry.updatedAt?.toDate()).toLocaleString('fr-FR')}</p>
                            </li>
                        )).reverse()}
                    </ul>
                )}
            </div>
        </div>
    );
};

// =================================================================
// COMPOSANT PRINCIPAL : App
// =================================================================
export default function App() {
    const { user, isAdmin, loading, auth, db } = useAuth();
    const [orders, setOrders] = useState([]);
    const [advisors, setAdvisors] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [showLogin, setShowLogin] = useState(true);
    const [authError, setAuthError] = useState(null);

    // Fetch Advisors (Users)
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'users'));
        const unsubscribe = onSnapshot(q, snapshot => {
            const usersList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
            setAdvisors(usersList);
        });
        return () => unsubscribe();
    }, [db]);

    // Fetch Orders
    useEffect(() => {
        if (!db) return;
        setIsLoadingData(true);
        const q = query(collection(db, `artifacts/${APP_ID}/public/data/orders`), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, snapshot => {
            setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLoadingData(false);
        }, err => {
            console.error(err);
            setIsLoadingData(false);
        });
        return () => unsubscribe();
    }, [db]);

    const handleLogin = useCallback(async (email, password) => {
        setAuthError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            setShowLogin(false);
        } catch (error) {
            setAuthError("Email ou mot de passe incorrect.");
        }
    }, [auth]);

    const handleLogout = useCallback(() => {
        signOut(auth);
        setShowLogin(true);
    }, [auth]);

    const handleSaveOrder = useCallback(async (orderData) => {
        if (!db || !user) return;
        const orderId = editingOrder?.id || doc(collection(db, `artifacts/${APP_ID}/public/data/orders`)).id;
        const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderId);

        try {
            if (editingOrder) { // Modification
                await setDoc(orderRef, orderData, { merge: true });
            } else { // Ajout
                const newOrder = {
                    ...orderData,
                    id: orderId,
                    status: ORDER_STATUSES.COMMANDÉ,
                    createdAt: serverTimestamp(),
                    history: [{
                        status: ORDER_STATUSES.COMMANDÉ,
                        updatedAt: serverTimestamp(),
                        updatedBy: user.displayName || user.email
                    }]
                };
                await setDoc(orderRef, newOrder);
            }
            setIsModalOpen(false);
            setEditingOrder(null);
        } catch (error) {
            console.error("Erreur d'enregistrement:", error);
        }
    }, [db, user, editingOrder]);
    
    const handleStatusChange = useCallback(async (orderId, newStatus) => {
        if (!db || !user) return;
        const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderId);
        const historyEntry = {
            status: newStatus,
            updatedAt: serverTimestamp(),
            updatedBy: user.displayName || user.email
        };
        try {
            await setDoc(orderRef, { 
                status: newStatus,
                history: arrayUnion(historyEntry)
            }, { merge: true });
        } catch (error) {
            console.error("Erreur de mise à jour du statut:", error);
        }
    }, [db, user]);

    const handleDeleteOrder = useCallback(async (orderId) => {
        if (!db || !window.confirm("Voulez-vous vraiment supprimer cette commande ?")) return;
        const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderId);
        try {
            await deleteDoc(orderRef);
        } catch (error) {
            console.error("Erreur de suppression:", error);
        }
    }, [db]);


    if (loading) {
        return <div className="bg-gray-900 min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" /></div>;
    }

    if (!user) {
        return (
            <div className="bg-gray-900 min-h-screen flex items-center justify-center">
                 <AnimationStyles />
                <div className="w-full max-w-sm">
                    <Modal onClose={() => {}}>
                        <LoginForm onLogin={handleLogin} authError={authError}/>
                    </Modal>
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <AnimationStyles />
            {isModalOpen && (
                <Modal onClose={() => { setIsModalOpen(false); setEditingOrder(null); }}>
                    <OrderForm 
                        onSave={handleSaveOrder} 
                        onCancel={() => { setIsModalOpen(false); setEditingOrder(null); }}
                        order={editingOrder}
                        advisors={advisors}
                        currentUser={user}
                        isAdmin={isAdmin}
                    />
                </Modal>
            )}

            <div className="max-w-4xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3"><Package/>Suivi des Commandes</h1>
                        <p className="text-gray-400 mt-1">Gérez les commandes d'accessoires de votre équipe.</p>
                    </div>
                    <div className="mt-4 sm:mt-0 flex items-center gap-4">
                        <span className="text-gray-300">{user.displayName || user.email} {isAdmin && <span className="text-blue-400">(Admin)</span>}</span>
                        <button onClick={() => { setEditingOrder(null); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2"><Plus size={18}/> Ajouter</button>
                        <button onClick={handleLogout} className="text-gray-400 hover:text-white"><LogOut size={22}/></button>
                    </div>
                </header>

                <main>
                    {isLoadingData ? (
                        <div className="text-center py-10"><p>Chargement des commandes...</p></div>
                    ) : orders.length === 0 ? (
                        <div className="text-center py-20 bg-gray-800 rounded-2xl">
                            <h2 className="text-2xl font-semibold text-gray-300">Aucune commande en cours.</h2>
                            <p className="text-gray-400 mt-2">Cliquez sur "Ajouter" pour créer une nouvelle commande.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {orders.map(order => (
                                <OrderCard 
                                    key={order.id} 
                                    order={order} 
                                    onStatusChange={handleStatusChange}
                                    onEdit={order => { setEditingOrder(order); setIsModalOpen(true); }}
                                    onDelete={handleDeleteOrder}
                                    isAdmin={isAdmin}
                                />
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
