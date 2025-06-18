import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// Importations Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, onSnapshot, setDoc, doc, addDoc, updateDoc, deleteDoc, getDocs, FieldValue } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from 'firebase/auth';

// Importations des icônes Lucide React
import {
    PlusCircle, Package, CheckCircle, Bell, Truck, History, User, Calendar, LogOut, UserCheck, LogIn, AlertTriangle, X, Info, Trash2, Edit, UserPlus, Phone, Mail, ReceiptText, Search, MinusCircle, Check, ChevronDown, RefreshCcw
} from 'lucide-react';

// =================================================================
// CONFIGURATION & CONSTANTES DE L'APPLICATION
// =================================================================

const firebaseConfig = {
    apiKey: "YOUR_API_KEY", // Remplacez par votre vraie clé API
    authDomain: "aod-tracker-os.firebaseapp.com",
    projectId: "aod-tracker-os",
    storageBucket: "aod-tracker-os.appspot.com",
    messagingSenderId: "429289937311",
    appId: "1:429289937311:web:1ab993b09899afc2b245aa",
};

const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-aod-app';
const ADMIN_EMAIL = "jullien.gault@orange-store.com";

const ORDER_STATUSES_CONFIG = {
    ORDERED: { label: 'Commandé', description: 'La commande a été passée.', colorClass: 'bg-yellow-500', icon: Package, order: 1, allowTransitionTo: ['RECEIVED_IN_STORE', 'CANCELLED'], allowTransitionFrom: [] },
    RECEIVED_IN_STORE: { label: 'Reçu en boutique', description: 'L\'article a été reçu en magasin.', colorClass: 'bg-green-500', icon: Truck, order: 2, allowTransitionTo: ['CLIENT_NOTIFIED', 'CANCELLED'], allowTransitionFrom: ['ORDERED'] },
    CLIENT_NOTIFIED: { label: 'Client prévenu', description: 'Le client a été informé.', colorClass: 'bg-blue-500', icon: Bell, order: 3, allowTransitionTo: ['PICKED_UP', 'CANCELLED'], allowTransitionFrom: ['RECEIVED_IN_STORE'] },
    PICKED_UP: { label: 'Client a retiré', description: 'Le client a récupéré sa commande.', colorClass: 'bg-purple-600', icon: UserCheck, order: 4, allowTransitionTo: [], allowTransitionFrom: ['CLIENT_NOTIFIED'] },
    CANCELLED: { label: 'Annulée', description: 'La commande a été annulée.', colorClass: 'bg-red-500', icon: X, order: 5, allowTransitionTo: [], allowTransitionFrom: ['ORDERED', 'RECEIVED_IN_STORE', 'CLIENT_NOTIFIED', 'PICKED_UP'] }
};

const ORDER_STATUSES_ARRAY = Object.keys(ORDER_STATUSES_CONFIG).map(key => ({ key, ...ORDER_STATUSES_CONFIG[key] })).sort((a, b) => a.order - b.order);

// =================================================================
// COMPOSANTS DE L'INTERFACE UTILISATEUR (UI)
// =================================================================

const AnimationStyles = () => ( <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}.animate-fade-in{animation:fadeIn .5s ease-in-out}@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.animate-fade-in-up{animation:fadeInUp .5s ease-out forwards}.tooltip{position:absolute;top:100%;left:50%;transform:translateX(-50%);padding:8px 12px;background-color:rgba(45,55,72,.9);color:#fff;border-radius:8px;font-size:14px;white-space:pre-wrap;z-index:50;opacity:0;visibility:hidden;transition:opacity .2s ease-in-out,visibility .2s ease-in-out;box-shadow:0 4px 10px rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.1)}.group:hover .tooltip{opacity:1;visibility:visible}.custom-scrollbar::-webkit-scrollbar{width:8px}.custom-scrollbar::-webkit-scrollbar-track{background:#374151;border-radius:10px}.custom-scrollbar::-webkit-scrollbar-thumb{background:#60A5FA;border-radius:10px}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:#3B82F6}`}</style> );
const Tooltip = ({ children, text }) => ( <div className="relative inline-block group">{children}{text && (<div className="tooltip">{text}</div>)}</div> );
const Toast = ({ message, type, onClose }) => { const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500'; const Icon = type === 'success' ? Check : AlertTriangle; return ( <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 p-4 rounded-lg shadow-lg text-white flex items-center gap-3 z-[999] ${bgColor} animate-fade-in-up`}><Icon size={24} /><span>{message}</span><button onClick={onClose} className="ml-2 text-white/80 hover:text-white transition-colors"><X size={20} /></button></div> ); };
const OrderForm = ({ onSave, initialData, isSaving, onClose }) => { const [clientFirstName, setClientFirstName] = useState(initialData?.clientFirstName || ''); const [clientLastName, setClientLastName] = useState(initialData?.clientLastName || ''); const [clientEmail, setClientEmail] = useState(initialData?.clientEmail || ''); const [clientPhone, setClientPhone] = useState(initialData?.clientPhone || ''); const [receiptNumber, setReceiptNumber] = useState(initialData?.receiptNumber || ''); const [items, setItems] = useState(initialData?.items && initialData.items.length > 0 ? initialData.items : [{ itemName: '', quantity: '' }]); const [orderNotes, setOrderNotes] = useState(initialData?.orderNotes || ''); const [formError, setFormError] = useState(null); const handleItemChange = useCallback((index, field, value) => { const newItems = [...items]; newItems[index][field] = value; setItems(newItems); }, [items]); const handleAddItem = useCallback(() => { setItems([...items, { itemName: '', quantity: '' }]); }, [items]); const handleRemoveItem = useCallback((index) => { const newItems = items.filter((_, i) => i !== index); setItems(newItems); }, [items]); const handleSubmit = useCallback(async (e) => { e.preventDefault(); setFormError(null); if (!clientFirstName || !clientLastName) { setFormError("Veuillez remplir le prénom et le nom du client."); return; } const validItems = items.filter(item => item.itemName.trim() && parseInt(item.quantity, 10) > 0); if (validItems.length === 0) { setFormError("Veuillez ajouter au moins un article valide."); return; } try { await onSave({ clientFirstName: clientFirstName.trim(), clientLastName: clientLastName.trim(), clientEmail: clientEmail.trim(), clientPhone: clientPhone.trim(), receiptNumber: receiptNumber.trim(), items: validItems.map(item => ({ itemName: item.itemName.trim(), quantity: parseInt(item.quantity, 10) })), orderNotes: orderNotes.trim(), }); onClose(); } catch (error) { setFormError("Échec de l'enregistrement."); } }, [clientFirstName, clientLastName, clientEmail, clientPhone, receiptNumber, items, orderNotes, onSave, onClose]); return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh] md:max-h-[80vh] custom-scrollbar" onClick={(e) => e.stopPropagation()}><button onClick={onClose} aria-label="Fermer" className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={24} /></button><h2 className="text-2xl font-bold text-white mb-6 text-center">{initialData ? 'Modifier la commande' : 'Nouvelle Commande'}</h2><form onSubmit={handleSubmit} className="space-y-6">{/* ... form content ... */}</form></div></div> ); };
const ConfirmationModal = ({ message, onConfirm, onCancel, confirmText = 'Confirmer', cancelText = 'Annuler', confirmColor = 'bg-red-600' }) => ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in"><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 animate-fade-in-up mx-4 sm:mx-0"><div className="text-center"><AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" /><h3 className="mt-4 text-xl font-medium text-white">{message}</h3></div><div className="mt-6 flex flex-col sm:flex-row justify-center gap-4"><button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto">{cancelText}</button><button onClick={onConfirm} className={`${confirmColor} hover:${confirmColor.replace('600', '700')} text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto`}>{confirmText}</button></div></div></div> );
const ConfirmationModalAdvisor = ({ message, onConfirm, onCancel, confirmText = 'Confirmer', cancelText = 'Annuler' }) => ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in"><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 animate-fade-in-up mx-4 sm:mx-0"><div className="text-center"><Info className="mx-auto h-12 w-12 text-blue-400" /><h3 className="mt-4 text-xl font-medium text-white">{message}</h3><p className="text-gray-400 text-sm mt-2">Cette action est définitive. Contactez un admin en cas d'erreur.</p></div><div className="mt-6 flex flex-col sm:flex-row justify-center gap-4"><button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto">{cancelText}</button><button onClick={onConfirm} className={`bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto`}>{confirmText}</button></div></div></div> );
const LoginForm = ({ onLogin, error, onClose }) => { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const handleSubmit = (e) => { e.preventDefault(); onLogin(email, password); }; return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 relative animate-fade-in-up mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}><button onClick={onClose} aria-label="Fermer" className="absolute top-2 right-2 text-gray-500 hover:text-white"><X size={24} /></button><h2 className="text-2xl font-bold text-white mb-6 text-center">Connexion</h2><form onSubmit={handleSubmit} className="space-y-6"><div><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><div><input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div>{error && <p className="text-red-400 text-sm text-center">{error}</p>}<button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg">Se connecter</button></form></div></div> ); };
const AdvisorManagementForm = ({ db, auth, appId, advisors, onSaveAdvisor, onDeleteAdvisor, onClose, isAdmin, adminEmail }) => { /* ... code du composant inchangé ... */ return null; };
const OrderHistoryModal = ({ order, onClose, advisorsMap }) => { const getDisplayName = (email) => { return advisorsMap[email.toLowerCase()]?.name || email; }; return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 relative animate-fade-in-up" onClick={(e) => e.stopPropagation()}><button onClick={onClose} aria-label="Fermer" className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={24} /></button><h2 className="text-2xl font-bold text-white mb-6 text-center">Historique</h2><div className="space-y-4">{/* ... contenu ... */}</div></div></div> ); };

// COMPOSANT OrderCard AMÉLIORÉ
const OrderCard = ({ order, onUpdateStatus, onEdit, onDelete, isAdmin, onShowHistory, advisorsMap, onRevertStatus }) => {
    const [isOpen, setIsOpen] = useState(false);
    const getStatusColor = (statusLabel) => ORDER_STATUSES_CONFIG[Object.keys(ORDER_STATUSES_CONFIG).find(key => ORDER_STATUSES_CONFIG[key].label === statusLabel)]?.colorClass || 'bg-gray-500';
    const getDisplayName = (email) => advisorsMap[email?.toLowerCase()]?.name || email || 'N/A';
    const getNextStatusButton = (currentStatusLabel) => { /* ... code inchangé ... */ return null; };
    const getRevertStatusButtons = (currentStatusLabel) => { /* ... code inchangé ... */ return null; };
    const itemsSummary = order.items?.length > 0 ? `${order.items[0].itemName}${order.items.length > 1 ? ` (+ ${order.items.length - 1} autre${order.items.length > 2 ? 's' : ''})` : ''}` : "Aucun article";

    return (
        <div className="bg-gray-800 rounded-2xl shadow-lg flex flex-col transition-all duration-300 animate-fade-in-up hover:shadow-2xl hover:ring-2 hover:ring-blue-500/50">
            <div className="flex justify-between items-center p-4 sm:p-6 cursor-pointer hover:bg-gray-700/50 rounded-t-2xl transition-colors" onClick={() => setIsOpen(!isOpen)}>
                <div>
                    <h3 className="text-xl font-bold text-white">{order.clientFirstName} {order.clientLastName}</h3>
                    <p className="text-gray-400 text-sm mt-1">{itemsSummary}</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold text-white ${getStatusColor(order.currentStatus)}`}>{order.currentStatus}</span>
                    <ChevronDown size={24} className={`text-gray-400 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`} />
                </div>
            </div>
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isOpen ? 'max-h-screen' : 'max-h-0'}`}>
                <div className="p-4 sm:p-6 border-t border-gray-700">{/* ... contenu détaillé de la carte ... */}</div>
            </div>
        </div>
    );
};

// =================================================================
// COMPOSANT PRINCIPAL : App
// =================================================================
export default function App() {
    const [orders, setOrders] = useState([]);
    const [advisors, setAdvisors] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [dbError, setDbError] = useState(null);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authReady, setAuthReady] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const [showLogin, setShowLogin] = useState(false);
    const [showOrderForm, setShowOrderForm] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [orderToDeleteId, setOrderToDeleteId] = useState(null);
    const [showConfirmAdvisorChange, setShowConfirmAdvisorChange] = useState(false);
    const [orderToUpdateStatusAdvisor, setOrderToUpdateStatusAdvisor] = useState(null);
    const [showOrderHistory, setShowOrderHistory] = useState(false);
    const [selectedOrderForHistory, setSelectedOrderForHistory] = useState(null);
    const [showAdvisorManagement, setShowAdvisorManagement] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
    const [selectedAdvisorFilter, setSelectedAdvisorFilter] = useState('All');
    const [isMenuOpen, setIsMenuOpen] = useState(false); // NOUVEL ÉTAT POUR LE MENU

    useEffect(() => { document.title = "AOD Tracker OS"; }, []);

    const advisorsMap = useMemo(() => advisors.reduce((acc, advisor) => { acc[advisor.email.toLowerCase()] = advisor; return acc; }, {}), [advisors]);

    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setAuth(authInstance);
            setDb(dbInstance);
            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                if (user) {
                    setCurrentUser(user);
                    const userProfile = advisorsMap[user.email?.toLowerCase()];
                    setIsAdmin(user.email === ADMIN_EMAIL || userProfile?.role === 'admin');
                } else {
                    setCurrentUser(null);
                    setIsAdmin(false);
                    setShowLogin(true);
                }
                setAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase Init Error:", error);
            setDbError("Impossible d'initialiser Firebase.");
            setAuthReady(true);
        }
    }, [advisorsMap]);
    
    // ... Toutes les autres fonctions (useCallback, etc.) restent ici ...
    const showToast = useCallback((message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3000); }, []);
    const getCurrentUserInfo = useCallback(() => { if (!currentUser) return null; const userProfile = advisorsMap[currentUser.email?.toLowerCase()]; const displayName = userProfile?.name || currentUser.email; return { uid: currentUser.uid, email: currentUser.email, name: displayName, role: userProfile?.role || (currentUser.email === ADMIN_EMAIL ? 'admin' : 'unknown') }; }, [currentUser, advisorsMap]);
    const handleLogin = useCallback(async (email, password) => { setLoginError(null); if (!auth) { setLoginError("Service non prêt."); return; } try { await signInWithEmailAndPassword(auth, email, password); setShowLogin(false); } catch (error) { setLoginError("Identifiants incorrects."); } }, [auth]);
    const handleLogout = useCallback(() => { if(auth) signOut(auth); }, [auth]);
    // ... et ainsi de suite pour toutes vos fonctions handle...

    const filteredAndSortedOrders = useMemo(() => {
        // ... Logique de filtre et de tri inchangée
        return orders;
    }, [orders, selectedStatusFilter, selectedAdvisorFilter, searchTerm]);

    if (!authReady) { return ( <div className="bg-gray-900 min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" /></div> ); }
    if (showLogin || !currentUser) { return ( <div className="bg-gray-900 min-h-screen flex items-center justify-center"><LoginForm onLogin={handleLogin} error={loginError} onClose={() => setShowLogin(false)} /></div> ); }

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <AnimationStyles />
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {/* ... Tous les autres modals ... */}

            <div className="max-w-4xl mx-auto px-2 sm:px-4 lg:px-6"> 
                {/* ======================= NOUVEL EN-TÊTE RESPONSIVE ======================= */}
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">AOD Tracker OS</h1>
                        <p className="text-gray-400 mt-1 text-sm sm:text-base">Suivez vos commandes d'accessoires en temps réel.</p>
                    </div>
                    <div className="w-full sm:w-auto flex flex-col items-stretch sm:items-center gap-4">
                        <div className="flex items-center gap-2 text-blue-300 bg-gray-800/50 p-2 rounded-lg justify-center sm:justify-start sm:bg-transparent sm:p-0">
                            <User size={18} />
                            <span className="font-medium text-sm sm:text-base">Connecté :</span>
                            <span className="bg-gray-700/50 px-2 py-1 rounded-full text-xs sm:text-sm font-semibold text-white">{getCurrentUserInfo()?.name || 'Conseiller'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => { setShowOrderForm(true); setEditingOrder(null); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-base flex-grow"><PlusCircle size={20} /><span>Nouvelle Commande</span></button>
                            <div className="relative">
                                <button onClick={() => setIsMenuOpen(!isMenuOpen)} onBlur={() => setTimeout(() => setIsMenuOpen(false), 150)} aria-label="Plus d'actions" className="p-2 text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                                </button>
                                {isMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-xl shadow-lg border border-gray-700 z-50 animate-fade-in">
                                        <div className="p-2">
                                            {isAdmin && (
                                                <>
                                                    <a href="#" onClick={(e) => { e.preventDefault(); setShowAdvisorManagement(true); setIsMenuOpen(false); }} className="flex items-center gap-3 w-full px-3 py-2 text-sm text-white rounded-md hover:bg-green-600"><UserPlus size={18} />Gérer Conseillers</a>
                                                    <div className="flex items-center gap-3 w-full px-3 py-2 text-sm text-blue-300 rounded-md"><UserCheck size={18} />Mode Admin Actif</div>
                                                    <div className="border-t border-gray-700 my-1"></div>
                                                </>
                                            )}
                                            <a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); setIsMenuOpen(false); }} className="flex items-center gap-3 w-full px-3 py-2 text-sm text-red-400 rounded-md hover:bg-red-500 hover:text-white"><LogOut size={18} />Déconnexion</a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* ... Reste de l'interface (filtres, liste des commandes) ... */}
                <div className="grid grid-cols-1 gap-6 animate-fade-in">
                    {isLoading ? <p>Chargement...</p> : filteredAndSortedOrders.map((order) => (
                        <OrderCard key={order.id} order={order} /* ... autres props */ />
                    ))}
                </div>
            </div>
        </div>
    );
}
