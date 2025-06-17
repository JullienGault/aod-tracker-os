import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, onSnapshot, setDoc, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, signInAnonymously } from 'firebase/auth';
import { PlusCircle, Package, CheckCircle, Bell, Truck, History, User, Calendar, LogOut, UserCheck, LogIn, AlertTriangle, X, Info, Trash2, Edit } from 'lucide-react';

// =================================================================
// CONFIGURATION & CONSTANTES
// =================================================================

// Firebase configuration. DO NOT modify this. This is handled by the environment.
// const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

// Configuration Firebase mise à jour selon votre demande
const firebaseConfig = {
    apiKey: "AIzaSyBuWquEXyrx7EEMLcOsRJ81ThnlUhrnIew", // <-- NOUVELLE CLÉ INSÉRÉE
    authDomain: "aod-tracker-os.firebaseapp.com",
    projectId: "aod-tracker-os",
    storageBucket: "aod-tracker-os.appspot.com",
    messagingSenderId: "429289937311",
    appId: "1:429289937311:web:1ab993b09899afc2b245aa",
};

// App ID provided by the environment. DO NOT modify this.
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-aod-app';

const ADMIN_EMAIL = "jullien.gault@orange-store.com"; // Your admin email for full control
const DEFAULT_ADVISORS = [ // Used for mapping user emails to display names
    { name: 'Enzo', email: 'enzo@orange-store.com' },
    { name: 'Guewen', email: 'guewen@orange-store.com' },
    { name: 'Jullien', email: 'jullien.gault@orange-store.com' },
    { name: 'Kenza', email: 'kenza@orange-store.com' },
    { name: 'Manuel', email: 'manuel@orange-store.com' },
    { name: 'Marie', email: 'marie@orange-store.com' },
    { name: 'Marvyn', email: 'marvyn@orange-store.com' },
    { name: 'Tom', email: 'tom@orange-store.com' },
];

// =================================================================
// COMPOSANTS UI
// =================================================================

// Styles for animations
const AnimationStyles = () => (
    <style>{`
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .animate-fade-in { animation: fadeIn 0.5s ease-in-out; }
      @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .animate-fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
      .tooltip {
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        padding: 8px 12px;
        background-color: rgba(45, 55, 72, 0.9);
        color: white;
        border-radius: 8px;
        font-size: 14px;
        white-space: pre-wrap;
        z-index: 50;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease-in-out, visibility 0.2s ease-in-out;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        border: 1px solid rgba(255,255,255,0.1);
      }
      .group:hover .tooltip {
        opacity: 1;
        visibility: visible;
      }
    `}</style>
);

// Tooltip component for hover information
const Tooltip = ({ children, text }) => {
    return (
        <div className="relative inline-block group">
            {children}
            {text && (
                <div className="tooltip">
                    {text}
                </div>
            )}
        </div>
    );
};

// Form for creating and editing orders
const OrderForm = ({ onSave, initialData, isSaving, onClose }) => {
    const [itemName, setItemName] = useState(initialData?.itemName || '');
    const [quantity, setQuantity] = useState(initialData?.quantity || '');
    const [clientName, setClientName] = useState(initialData?.clientName || '');
    const [orderNotes, setOrderNotes] = useState(initialData?.orderNotes || '');
    const [formError, setFormError] = useState(null);

    // Handle form submission
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        setFormError(null);

        if (!itemName || !quantity || !clientName) {
            setFormError("Veuillez remplir tous les champs obligatoires (Nom de l'accessoire, Quantité, Nom du client).");
            return;
        }
        if (isNaN(parseInt(quantity)) || parseInt(quantity) <= 0) {
            setFormError("La quantité doit être un nombre positif.");
            return;
        }

        try {
            await onSave({
                itemName: itemName.trim(),
                quantity: parseInt(quantity, 10),
                clientName: clientName.trim(),
                orderNotes: orderNotes.trim(),
            });
            onClose(); // Close form on successful save
        } catch (error) {
            console.error("Error saving order:", error);
            setFormError("Échec de l'enregistrement de la commande. Veuillez réessayer.");
        }
    }, [itemName, quantity, clientName, orderNotes, onSave, onClose]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 relative animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} aria-label="Fermer le formulaire" className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={24} />
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 text-center">{initialData ? 'Modifier la commande' : 'Nouvelle Commande d\'Accessoire'}</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="itemName" className="block text-sm font-medium text-gray-300 mb-2">Nom de l'accessoire *</label>
                        <input id="itemName" type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                    </div>
                    <div>
                        <label htmlFor="quantity" className="block text-sm font-medium text-gray-300 mb-2">Quantité *</label>
                        <input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                    </div>
                    <div>
                        <label htmlFor="clientName" className="block text-sm font-medium text-gray-300 mb-2">Nom du client *</label>
                        <input id="clientName" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                    </div>
                    <div>
                        <label htmlFor="orderNotes" className="block text-sm font-medium text-gray-300 mb-2">Notes (optionnel)</label>
                        <textarea id="orderNotes" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows="3" className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg"></textarea>
                    </div>
                    {formError && (<div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-lg flex items-center space-x-3"><AlertTriangle className="w-5 h-5" /><span>{formError}</span></div>)}
                    <button type="submit" disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {isSaving ? 'Enregistrement...' : (initialData ? 'Mettre à jour la commande' : 'Passer la commande')}
                    </button>
                </form>
            </div>
        </div>
    );
};

// Component to display an individual order card
const OrderCard = ({ order, onUpdateStatus, onEdit, onDelete, isAdmin, currentUserId, onShowHistory }) => {
    // Determine the color of the status badge
    const getStatusColor = (status) => {
        switch (status) {
            case 'Pending': return 'bg-yellow-500';
            case 'Received': return 'bg-green-500';
            case 'Notified': return 'bg-blue-500';
            case 'Cancelled': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    };

    // Helper to get display name from email
    const getDisplayName = (email) => {
        const advisor = DEFAULT_ADVISORS.find(a => a.email.toLowerCase() === email.toLowerCase());
        return advisor ? advisor.name : email;
    };

    return (
        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg flex flex-col transition-all duration-300 hover:shadow-2xl hover:scale-[1.01] hover:shadow-blue-500/10 hover:ring-2 hover:ring-blue-500/50 animate-fade-in-up">
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                    <Package size={24} className="text-blue-400" />
                    {order.itemName}
                </h3>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold text-white ${getStatusColor(order.currentStatus)}`}>
                    {order.currentStatus === 'Pending' && 'En attente'}
                    {order.currentStatus === 'Received' && 'Reçu'}
                    {order.currentStatus === 'Notified' && 'Client Prévenu'}
                    {order.currentStatus === 'Cancelled' && 'Annulée'}
                </span>
            </div>

            <p className="text-gray-300 mb-2">
                <span className="font-semibold">Quantité:</span> {order.quantity}
            </p>
            <p className="text-gray-300 mb-2">
                <span className="font-semibold">Pour le client:</span> {order.clientName}
            </p>
            {order.orderNotes && (
                <p className="text-gray-400 text-sm italic mb-3 break-words">
                    <span className="font-semibold">Notes:</span> {order.orderNotes}
                </p>
            )}

            <div className="text-sm text-gray-400 mt-auto pt-3 border-t border-gray-700">
                <p className="flex items-center gap-2 mb-1">
                    <User size={16} /> Commandé par <span className="font-medium text-white">{getDisplayName(order.orderedBy?.email || 'N/A')}</span>
                    le {new Date(order.orderDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {order.currentStatus === 'Received' && order.receivedBy && order.receptionDate && (
                    <p className="flex items-center gap-2 mb-1">
                        <CheckCircle size={16} className="text-green-400" /> Reçu par <span className="font-medium text-white">{getDisplayName(order.receivedBy?.email || 'N/A')}</span>
                        le {new Date(order.receptionDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
                {order.currentStatus === 'Notified' && order.notifiedBy && order.notificationDate && (
                    <p className="flex items-center gap-2">
                        <Bell size={16} className="text-blue-400" /> Client prévenu par <span className="font-medium text-white">{getDisplayName(order.notifiedBy?.email || 'N/A')}</span>
                        le {new Date(order.notificationDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>

            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-700">
                {order.currentStatus === 'Pending' && isAdmin && (
                    <button
                        onClick={() => onUpdateStatus(order.id, 'Received')}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                    >
                        <CheckCircle size={18} /> Marquer Reçu
                    </button>
                )}
                {order.currentStatus === 'Received' && isAdmin && (
                    <button
                        onClick={() => onUpdateStatus(order.id, 'Notified')}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                    >
                        <Bell size={18} /> Prévenir Client
                    </button>
                )}
                {isAdmin && order.currentStatus !== 'Cancelled' && ( // Admin can edit/delete if not cancelled
                    <>
                        <button
                            onClick={() => onEdit(order)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                        >
                            <Edit size={18} />
                        </button>
                        <button
                            onClick={() => onDelete(order.id)}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                        >
                            <Trash2 size={18} />
                        </button>
                    </>
                )}
                {order.currentStatus !== 'Cancelled' && ( // All users can view history if not cancelled
                    <button
                        onClick={() => onShowHistory(order)}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                    >
                        <History size={18} /> Historique
                    </button>
                )}
            </div>
        </div>
    );
};


// Modal for displaying order history
const OrderHistoryModal = ({ order, onClose }) => {
    // Helper to get display name from email
    const getDisplayName = (email) => {
        const advisor = DEFAULT_ADVISORS.find(a => a.email.toLowerCase() === email.toLowerCase());
        return advisor ? advisor.name : email;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 relative animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} aria-label="Fermer l'historique" className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={24} />
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 text-center">Historique de la commande: {order.itemName}</h2>
                <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                    {order.history && order.history.length > 0 ? (
                        order.history.map((event, index) => (
                            <div key={index} className="bg-gray-700 p-4 rounded-lg flex items-start space-x-4">
                                <Calendar size={20} className="text-blue-400 flex-shrink-0 mt-1" />
                                <div>
                                    <p className="text-white font-medium">{event.action}</p>
                                    <p className="text-gray-300 text-sm">
                                        Par <span className="font-semibold">{getDisplayName(event.by?.email || 'N/A')}</span>
                                        le {new Date(event.timestamp).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    {event.notes && <p className="text-gray-400 text-xs italic mt-1">Notes: {event.notes}</p>}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-400 text-center">Aucun historique disponible pour cette commande.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

// Confirmation modal for critical actions (e.g., deletion, cancellation)
const ConfirmationModal = ({ message, onConfirm, onCancel, confirmText = 'Confirmer', cancelText = 'Annuler', confirmColor = 'bg-red-600' }) => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 animate-fade-in-up">
            <div className="text-center">
                <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
                <h3 className="mt-4 text-xl font-medium text-white">{message}</h3>
            </div>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors">{cancelText}</button>
                <button onClick={onConfirm} className={`${confirmColor} hover:${confirmColor.replace('600', '700')} text-white font-bold py-2 px-6 rounded-lg transition-colors`}>{confirmText}</button>
            </div>
        </div>
    );
};

// Login form component
const LoginForm = ({ onLogin, error, onClose }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onLogin(email, password); };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 relative animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} aria-label="Fermer la fenêtre de connexion" className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors">
                    <X size={24} />
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 text-center">Connexion Administrateur</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div>
                    <div><input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div>
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors">Se connecter</button>
                </form>
            </div>
        </div>
    );
};

// =================================================================
// COMPOSANT PRINCIPAL : App
// =================================================================

export default function App() {
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [dbError, setDbError] = useState(null);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [currentUser, setCurrentUser] = useState(null); // Stores Firebase User object
    const [isAdmin, setIsAdmin] = useState(false);
    const [authReady, setAuthReady] = useState(false);
    const [loginError, setLoginError] = useState(null);

    const [showOrderForm, setShowOrderForm] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null); // Stores order data if in edit mode

    const [showConfirmCancel, setShowConfirmCancel] = useState(false);
    const [orderToCancelId, setOrderToCancelId] = useState(null);

    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [orderToDeleteId, setOrderToDeleteId] = useState(null);

    const [showOrderHistory, setShowOrderHistory] = useState(false);
    const [selectedOrderForHistory, setSelectedOrderForHistory] = useState(null);

    // Initialize Firebase and set up auth listener
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const authInstance = getAuth(app);
            setDb(firestore);
            setAuth(authInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setCurrentUser(user);
                    setIsAdmin(user.email === ADMIN_EMAIL);
                } else {
                    setCurrentUser(null);
                    setIsAdmin(false);
                    // Attempt anonymous sign-in if not logged in
                    try {
                        const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                        if (token) {
                            await signInWithCustomToken(authInstance, token);
                        } else {
                            await signInAnonymously(authInstance);
                        }
                    } catch (err) {
                        console.error("Anonymous sign-in failed", err);
                    }
                }
                setAuthReady(true);
            });
            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase initialization error:", e);
            setDbError("Configuration Firebase invalide.");
            setIsLoading(false);
        }
    }, []);

    // Fetch orders from Firestore
    useEffect(() => {
        if (!authReady || !db) return;

        // Public data collection for orders
        const ordersCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/orders`);
        const q = query(ordersCollectionRef, orderBy("orderDate", "desc"));

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                setOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                setIsLoading(false);
                setDbError(null);
            },
            (err) => {
                console.error("Error fetching orders:", err);
                setDbError("Impossible de charger les commandes. Vérifiez les règles de sécurité Firestore.");
                setIsLoading(false);
            }
        );
        return () => unsubscribe();
    }, [authReady, db]);

    // Handle user login
    const handleLogin = useCallback(async (email, password) => {
        setLoginError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            setShowOrderForm(false); // Close form if open
            setShowLogin(false);
        } catch (error) {
            console.error("Login failed:", error.code);
            setLoginError("Email ou mot de passe incorrect.");
        }
    }, [auth]);

    // Handle user logout
    const handleLogout = useCallback(() => {
        signOut(auth);
        setShowOrderForm(false); // Close form if open
    }, [auth]);

    // Helper to get current user info for history/tracking
    const getCurrentUserInfo = useCallback(() => {
        if (!currentUser) return null;
        const displayName = DEFAULT_ADVISORS.find(a => a.email.toLowerCase() === currentUser.email?.toLowerCase())?.name || currentUser.email || 'Inconnu';
        return { uid: currentUser.uid, email: currentUser.email, name: displayName };
    }, [currentUser]);

    // Handle placing a new order or updating an existing one
    const handleSaveOrder = useCallback(async (orderData) => {
        if (!db || !currentUser) {
            setDbError("Vous devez être connecté pour passer ou modifier une commande.");
            return;
        }
        setIsSaving(true);
        const userInfo = getCurrentUserInfo();
        const now = new Date().toISOString();

        try {
            if (editingOrder) { // Editing existing order
                const updatedHistory = [...(editingOrder.history || []), {
                    timestamp: now,
                    action: "Commande modifiée",
                    by: userInfo,
                    notes: `Mise à jour: ${JSON.stringify({ itemName: orderData.itemName, quantity: orderData.quantity, clientName: orderData.clientName, orderNotes: orderData.orderNotes })}`
                }];
                await updateDoc(doc(db, `artifacts/${APP_ID}/public/data/orders`, editingOrder.id), {
                    ...orderData,
                    history: updatedHistory,
                });
                setEditingOrder(null); // Exit edit mode
            } else { // Placing a new order
                const newOrder = {
                    ...orderData,
                    orderedBy: userInfo,
                    orderDate: now,
                    currentStatus: 'Pending',
                    receivedBy: null,
                    receptionDate: null,
                    notifiedBy: null,
                    notificationDate: null,
                    history: [{ timestamp: now, action: "Commande passée", by: userInfo }]
                };
                await addDoc(collection(db, `artifacts/${APP_ID}/public/data/orders`), newOrder);
            }
            setShowOrderForm(false);
        } catch (e) {
            console.error("Error saving order:", e);
            setDbError("L'enregistrement de la commande a échoué. Vérifiez la console pour plus de détails.");
        } finally {
            setIsSaving(false);
        }
    }, [db, currentUser, editingOrder, getCurrentUserInfo]);

    // Handle updating order status (e.g., Received, Notified)
    const handleUpdateOrderStatus = useCallback(async (orderId, newStatus) => {
        if (!db || !currentUser || !isAdmin) {
            setDbError("Accès non autorisé pour cette action.");
            return;
        }
        setIsSaving(true);
        const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderId);
        const userInfo = getCurrentUserInfo();
        const now = new Date().toISOString();

        try {
            let updateData = { currentStatus: newStatus };
            let actionText = '';
            if (newStatus === 'Received') {
                updateData.receivedBy = userInfo;
                updateData.receptionDate = now;
                actionText = "Commande reçue et validée";
            } else if (newStatus === 'Notified') {
                updateData.notifiedBy = userInfo;
                updateData.notificationDate = now;
                actionText = "Client prévenu";
            }

            // Fetch current order to append to history
            const currentOrder = orders.find(order => order.id === orderId);
            const updatedHistory = [...(currentOrder?.history || []), {
                timestamp: now,
                action: actionText,
                by: userInfo
            }];
            updateData.history = updatedHistory;

            await updateDoc(orderRef, updateData);
        } catch (e) {
            console.error(`Error updating order status to ${newStatus}:`, e);
            setDbError("Échec de la mise à jour du statut. Vérifiez la console.");
        } finally {
            setIsSaving(false);
        }
    }, [db, currentUser, isAdmin, orders, getCurrentUserInfo]);


    // Handle order cancellation (only admin)
    const handleConfirmCancel = useCallback(async () => {
        if (!db || !currentUser || !isAdmin || !orderToCancelId) {
            setDbError("Accès non autorisé pour annuler la commande.");
            return;
        }
        setIsSaving(true);
        setShowConfirmCancel(false); // Close confirmation modal
        const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderToCancelId);
        const userInfo = getCurrentUserInfo();
        const now = new Date().toISOString();

        try {
            const currentOrder = orders.find(order => order.id === orderToCancelId);
            const updatedHistory = [...(currentOrder?.history || []), {
                timestamp: now,
                action: "Commande annulée",
                by: userInfo
            }];

            await updateDoc(orderRef, {
                currentStatus: 'Cancelled',
                history: updatedHistory
            });
            setOrderToCancelId(null);
        } catch (e) {
            console.error("Error cancelling order:", e);
            setDbError("Échec de l'annulation de la commande. Vérifiez la console.");
        } finally {
            setIsSaving(false);
        }
    }, [db, currentUser, isAdmin, orderToCancelId, orders, getCurrentUserInfo]);

    // Handle order deletion (only admin)
    const handleConfirmDelete = useCallback(async () => {
        if (!db || !currentUser || !isAdmin || !orderToDeleteId) {
            setDbError("Accès non autorisé pour supprimer la commande.");
            return;
        }
        setIsSaving(true);
        setShowConfirmDelete(false); // Close confirmation modal

        try {
            await deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/orders`, orderToDeleteId));
            setOrderToDeleteId(null);
        } catch (e) {
            console.error("Error deleting order:", e);
            setDbError("Échec de la suppression de la commande. Vérifiez la console.");
        } finally {
            setIsSaving(false);
        }
    }, [db, currentUser, isAdmin, orderToDeleteId]);

    // Show order history modal
    const handleShowOrderHistory = useCallback((order) => {
        setSelectedOrderForHistory(order);
        setShowOrderHistory(true);
    }, []);

    // Edit order
    const handleEditOrder = useCallback((order) => {
        setEditingOrder(order);
        setShowOrderForm(true);
    }, []);

    if (!authReady) {
        return <div className="bg-gray-900 min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" /></div>;
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <AnimationStyles />
            {showLogin && <LoginForm onLogin={handleLogin} error={loginError} onClose={() => setShowLogin(false)} />}
            {showConfirmCancel && (
                <ConfirmationModal
                    message="Voulez-vous vraiment annuler cette commande ?"
                    onConfirm={handleConfirmCancel}
                    onCancel={() => { setShowConfirmCancel(false); setOrderToCancelId(null); }}
                    confirmText="Oui, annuler"
                />
            )}
            {showConfirmDelete && (
                <ConfirmationModal
                    message="Voulez-vous vraiment supprimer cette commande ? Cette action est irréversible."
                    onConfirm={handleConfirmDelete}
                    onCancel={() => { setShowConfirmDelete(false); setOrderToDeleteId(null); }}
                    confirmText="Oui, supprimer"
                    confirmColor="bg-red-600"
                />
            )}
            {showOrderHistory && selectedOrderForHistory && (
                <OrderHistoryModal order={selectedOrderForHistory} onClose={() => setShowOrderHistory(false)} />
            )}

            {showOrderForm && (
                <OrderForm
                    onSave={handleSaveOrder}
                    initialData={editingOrder}
                    isSaving={isSaving}
                    onClose={() => {
                        setShowOrderForm(false);
                        setEditingOrder(null); // Reset editing order when closing form
                    }}
                />
            )}

            <div className="max-w-7xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight">AOD Tracker 2.0</h1>
                        <p className="text-gray-400 mt-1">
                            Suivez vos commandes d'accessoires en temps réel.
                        </p>
                    </div>
                    <div className="mt-4 sm:mt-0 flex items-center gap-4">
                        {currentUser && (
                            <div className="flex items-center gap-2 text-blue-300">
                                <User size={18} />
                                <span>Connecté en tant que: {currentUser.email === ADMIN_EMAIL ? 'Admin' : getCurrentUserInfo()?.name || 'Conseiller'}</span>
                            </div>
                        )}
                        {isAdmin ? (
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-blue-300"> <UserCheck size={18} /> <span>Mode Admin</span></div>
                                <button
                                    onClick={() => { setShowOrderForm(true); setEditingOrder(null); }} // Open form for new order
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <PlusCircle size={20} /> Nouvelle Commande
                                </button>
                                <button onClick={handleLogout} title="Se déconnecter" aria-label="Se déconnecter" className="text-gray-400 hover:text-white transition-colors"><LogOut size={22} /></button>
                            </div>
                        ) : (
                            <button onClick={() => setShowLogin(true)} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                                <LogIn size={18} />
                                Connexion Admin
                            </button>
                        )}
                    </div>
                </header>

                {dbError && <div className="bg-red-500/20 text-red-300 p-4 rounded-lg mb-6">{dbError}</div>}

                {isLoading && (
                    <div className="text-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto" />
                        <p className="text-gray-400 mt-4">Chargement des commandes...</p>
                    </div>
                )}

                {!isLoading && orders.length === 0 && (
                    <div className="text-center py-20 bg-gray-800 rounded-2xl">
                        <h2 className="text-2xl font-semibold text-gray-300">Aucune commande disponible.</h2>
                        {(currentUser && !isAdmin) && <p className="text-gray-400 mt-2">Connectez-vous en tant qu'administrateur pour ajouter la première commande, ou demandez à votre conseiller de le faire.</p>}
                        {isAdmin && <p className="text-gray-400 mt-2">Cliquez sur "Nouvelle Commande" pour commencer.</p>}
                    </div>
                )}

                {!isLoading && orders.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                        {orders.map((order) => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                onUpdateStatus={handleUpdateOrderStatus}
                                onEdit={handleEditOrder}
                                onDelete={(id) => { setOrderToDeleteId(id); setShowConfirmDelete(true); }}
                                isAdmin={isAdmin}
                                currentUserId={currentUser?.uid}
                                onShowHistory={handleShowOrderHistory}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
