import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// Importations Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

// Importations des icônes Lucide React
import {
    PlusCircle, Package, CheckCircle, Bell, History, User, LogOut, UserCheck, LogIn, AlertTriangle, X, Info, Trash2, Edit, Phone, Mail, ReceiptText, Search, MinusCircle, Check, ChevronDown, Archive, Undo2, List, XCircle, FileWarning,
    MessageSquareText, PhoneCall, BellRing, Clock, CalendarCheck2, FileUp
} from 'lucide-react';

// Importation de la bibliothèque PDF (MÉTHODE CORRIGÉE)
import * as pdfjs from 'pdfjs-dist';
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();


// =================================================================
// CONFIGURATION & CONSTANTES DE L'APPLICATION
// (inchangé)
// =================================================================
const firebaseConfig = { /* ... */ };
const APP_ID = 'default-aod-app';
const ADMIN_EMAILS = [ "jullien.gault@orange-store.com", "marvyn.ammiche@orange-store.com" ];
const SPECIAL_USER_NAMES = { "jullien.gault@orange-store.com": "Jullien", "marvyn.ammiche@orange-store.com": "Marvyn" };
const ITEM_STATUS = { ORDERED: 'Commandé', RECEIVED: 'Reçu', CANCELLED: 'Annulé' };
const ORDER_STATUS = { ORDERED: 'Commandé', PARTIALLY_RECEIVED: 'Partiellement Reçu', READY_FOR_PICKUP: 'Prêt pour retrait', NOTIFIED: 'Client Prévenu', PICKED_UP: 'Retirée', ARCHIVED: 'Archivé', COMPLETE_CANCELLED: 'Annulée' };
const ORDER_STATUSES_CONFIG = { [ORDER_STATUS.ORDERED]: { label: 'Commandé', colorClass: 'bg-yellow-500', icon: Package }, [ORDER_STATUS.PARTIALLY_RECEIVED]: { label: 'Partiellement Reçu', colorClass: 'bg-blue-400', icon: FileWarning }, [ORDER_STATUS.READY_FOR_PICKUP]: { label: 'Prêt pour retrait', colorClass: 'bg-green-500', icon: CheckCircle }, [ORDER_STATUS.NOTIFIED]: { label: 'Client Prévenu', colorClass: 'bg-blue-500', icon: Bell }, [ORDER_STATUS.PICKED_UP]: { label: 'Retirée', colorClass: 'bg-purple-600', icon: UserCheck }, [ORDER_STATUS.ARCHIVED]: { label: 'Archivé', colorClass: 'bg-gray-600', icon: Archive }, [ORDER_STATUS.COMPLETE_CANCELLED]: { label: 'Annulée', colorClass: 'bg-red-700', icon: XCircle } };
const getUserDisplayName = (email) => { if (!email) return 'N/A'; if (SPECIAL_USER_NAMES[email]) { return SPECIAL_USER_NAMES[email]; } const namePart = email.split('@')[0].split('.')[0]; return namePart.charAt(0).toUpperCase() + namePart.slice(1); };


// =================================================================
// FONCTIONS UTILITAIRES PARTAGÉES
// (inchangé)
// =================================================================
const isDateToday = (isoString) => { if (!isoString) return false; try { const date = new Date(isoString); const today = new Date(); return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear(); } catch (e) { return false; } };
const getNotificationStats = (history) => { if (!history) return { email: 0, sms: 0, phone: 0, voicemail: 0, total: 0 }; return history.reduce((acc, event) => { if (event.action.includes('prévenu')) { acc.total++; if (event.action.includes('Email')) acc.email++; if (event.action.includes('SMS')) acc.sms++; if (event.action.includes('Appel')) { acc.phone++; if (event.note && event.note.includes('Message vocal')) { acc.voicemail++; } } } return acc; }, { email: 0, sms: 0, phone: 0, voicemail: 0, total: 0 }); };
const findLastNotificationTimestamp = (history) => { if (!history) return null; for (let i = history.length - 1; i >= 0; i--) { if (history[i].action.includes('prévenu')) { return history[i].timestamp; } } return null; };
const getDerivedOrderStatus = (order) => { if (!order || !order.items || order.items.length === 0) return order.currentStatus; const activeItems = order.items.filter(item => item.status !== ITEM_STATUS.CANCELLED); if (activeItems.length === 0) return ORDER_STATUS.COMPLETE_CANCELLED; const activeStatuses = activeItems.map(item => item.status); const allReceived = activeStatuses.every(status => status === ITEM_STATUS.RECEIVED); const someReceived = activeStatuses.some(status => status === ITEM_STATUS.RECEIVED); if (allReceived) return ORDER_STATUS.READY_FOR_PICKUP; if (someReceived) return ORDER_STATUS.PARTIALLY_RECEIVED; return ORDER_STATUS.ORDERED; };
const getEffectiveOrderStatus = (order) => { if (!order) return null; const advancedStatuses = [ORDER_STATUS.NOTIFIED, ORDER_STATUS.PICKED_UP, ORDER_STATUS.ARCHIVED, ORDER_STATUS.COMPLETE_CANCELLED]; if (advancedStatuses.includes(order.currentStatus)) return order.currentStatus; return getDerivedOrderStatus(order); };
const getIconForHistoryAction = (action) => { if (!action) return History; const lowerCaseAction = action.toLowerCase(); if (lowerCaseAction.includes('créée')) return Package; if (lowerCaseAction.includes('prévenu')) return Bell; if (lowerCaseAction.includes('retirée')) return UserCheck; if (lowerCaseAction.includes('archivée')) return Archive; if (lowerCaseAction.includes('reçu')) return CheckCircle; if (lowerCaseAction.includes('annulé')) return XCircle; if (lowerCaseAction.includes('modifiée')) return Edit; if (lowerCaseAction.includes('retour arrière')) return Undo2; return History; };
const getIconColorClass = (action) => { if (!action) return 'text-gray-400'; const lowerCaseAction = action.toLowerCase(); if (lowerCaseAction.includes('créée') || lowerCaseAction.includes('retour arrière')) return 'text-yellow-400'; if (lowerCaseAction.includes('reçu')) return 'text-green-400'; if (lowerCaseAction.includes('prévenu')) return 'text-blue-400'; if (lowerCaseAction.includes('retirée') || lowerCaseAction.includes('modifiée')) return 'text-purple-400'; if (lowerCaseAction.includes('annulé')) return 'text-red-400'; if (lowerCaseAction.includes('archivée')) return 'text-gray-500'; return 'text-gray-400'; };
const formatPhoneNumber = (phoneStr) => { if (!phoneStr) return null; const cleaned = ('' + phoneStr).replace(/\D/g, ''); const match = cleaned.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/); if (match) return `${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}`; return cleaned; };
const formatOrderDate = (isoString) => { if (!isoString) return 'Date inconnue'; try { return new Date(isoString).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return 'Date invalide'; } };

// =================================================================
// COMPOSANTS DE L'INTERFACE UTILISATEUR (UI)
// (inchangés, je les omets pour la lisibilité, mais ils doivent être présents dans votre fichier)
// =================================================================
const TailwindColorSafelist = () => { /* ... */ };
const HistoryActionText = ({ text }) => { /* ... */ };
const AnimationStyles = () => { /* ... */ };
const Tooltip = ({ children, text, className }) => { /* ... */ };
const Toast = ({ message, type, onClose }) => { /* ... */ };
const ConfirmationModal = ({ message, onConfirm, onCancel, confirmText, cancelText, confirmColor }) => { /* ... */ };
const CancellationModal = ({ onConfirm, onCancel, title, message }) => { /* ... */ };
const RollbackStatusModal = ({ onConfirm, onCancel, title, message }) => { /* ... */ };
const LoginForm = ({ onLogin, error }) => { /* ... */ };
const OrderForm = ({ onSave, initialData, isSaving, onClose, isAdmin, allUsers }) => { /* ... */ };
const NotificationModal = ({ onConfirm, onCancel }) => { /* ... */ };
const OrderHistoryModal = ({ order, onClose }) => { /* ... */ };
const OrderCard = ({ order, onRequestItemStatusUpdate, onCancelItem, onRequestOrderStatusUpdate, isAdmin, onShowHistory, onEdit, onRequestDelete, onInitiateRollback, onNotifyClient, isOpen, onToggleOpen, isNew }) => { /* ... */ };


// =================================================================
// COMPOSANT PRINCIPAL : App
// (C'est le seul composant qui a réellement changé, car il contient la logique)
// =================================================================
export default function App() {
    const [orders, setOrders] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [dbError, setDbError] = useState(null);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authReady, setAuthReady] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const [showLogin, setShowLogin] = useState(true);
    const [showOrderForm, setShowOrderForm] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [itemToCancel, setItemToCancel] = useState(null);
    const [showItemCancelModal, setShowItemCancelModal] = useState(false);
    const [showOrderHistory, setShowOrderHistory] = useState(false);
    const [selectedOrderForHistory, setSelectedOrderForHistory] = useState(null);
    const [showRollbackModal, setShowRollbackModal] = useState(false);
    const [orderToRollback, setOrderToRollback] = useState(null);
    const [confirmation, setConfirmation] = useState({ isOpen: false, message: '', onConfirm: () => {}, confirmColor: 'bg-blue-600' });
    const [showNotificationModal, setShowNotificationModal] = useState(false);
    const [orderToNotify, setOrderToNotify] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
    const [selectedAdvisorFilter, setSelectedAdvisorFilter] = useState('All');
    const [viewMode, setViewMode] = useState('active');
    const [toast, setToast] = useState(null);
    const [openCardId, setOpenCardId] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => { document.title = "AOD Tracker 2.0"; }, []);

    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setAuth(authInstance);
            setDb(dbInstance);
            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                if (user) { setCurrentUser(user); setIsAdmin(ADMIN_EMAILS.includes(user.email)); setShowLogin(false); } 
                else { setCurrentUser(null); setIsAdmin(false); setShowLogin(true); }
                setAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase Init Error:", error);
            setDbError("Impossible d'initialiser Firebase.");
            setAuthReady(true);
        }
    }, []);

    const showToast = useCallback((message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3000); }, []);

    useEffect(() => {
        if (!authReady || !db || !currentUser) { if(authReady) setIsLoading(false); return; }
        setIsLoading(true);
        const ordersCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/orders`);
        const q = query(ordersCollectionRef, orderBy("orderDate", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setOrders(fetchedOrders);
            const usersFromOrders = fetchedOrders.reduce((acc, order) => {
                if (order.orderedBy?.email) { acc[order.orderedBy.email] = { email: order.orderedBy.email, name: getUserDisplayName(order.orderedBy.email) }; }
                order.history?.forEach(h => { if (h.by?.email) { acc[h.by.email] = { email: h.by.email, name: getUserDisplayName(h.by.email) }; } });
                return acc;
            }, {});
            setAllUsers(Object.values(usersFromOrders));
            setIsLoading(false);
            setDbError(null);
        }, (err) => {
            console.error("Error fetching orders:", err);
            setDbError("Impossible de charger les commandes.");
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [authReady, db, currentUser]);

    const filteredAndSortedOrders = useMemo(() => {
        let currentOrders = [...orders];
        const finalStatuses = [ORDER_STATUS.ARCHIVED, ORDER_STATUS.COMPLETE_CANCELLED];
        if (viewMode === 'active') currentOrders = currentOrders.filter(order => !finalStatuses.includes(getEffectiveOrderStatus(order)));
        else currentOrders = currentOrders.filter(order => finalStatuses.includes(getEffectiveOrderStatus(order)));
        if (selectedStatusFilter !== 'All' && viewMode === 'active') currentOrders = currentOrders.filter(order => getEffectiveOrderStatus(order) === selectedStatusFilter); 
        if (selectedAdvisorFilter !== 'All') currentOrders = currentOrders.filter(order => order.orderedBy?.email?.toLowerCase() === selectedAdvisorFilter.toLowerCase());
        if (searchTerm.trim()) { const lowerCaseSearchTerm = searchTerm.trim().toLowerCase(); currentOrders = currentOrders.filter(order => ((order.clientFirstName || '').toLowerCase().includes(lowerCaseSearchTerm)) || ((order.clientLastName || '').toLowerCase().includes(lowerCaseSearchTerm)) || ((order.clientEmail || '').toLowerCase().includes(lowerCaseSearchTerm)) || ((order.clientPhone || '').toLowerCase().includes(lowerCaseSearchTerm)) || (order.items?.some(item => (item.itemName || '').toLowerCase().includes(lowerCaseSearchTerm))) || ((order.receiptNumber || '').toLowerCase().includes(lowerCaseSearchTerm)) ); }
        return currentOrders;
    }, [orders, selectedStatusFilter, selectedAdvisorFilter, searchTerm, viewMode]);

    const todaysOrdersCount = useMemo(() => orders.filter(order => isDateToday(order.orderDate)).length, [orders]);

    const handleToggleCard = (orderId) => {
        setOpenCardId(prevOpenCardId => (prevOpenCardId === orderId ? null : orderId));
    };

    const handleEditOrder = useCallback((order) => { setEditingOrder(order); setShowOrderForm(true); }, []);

    const parseOrderFromText = useCallback((text) => {
        console.log("Texte brut extrait du PDF pour débogage :\n", text);
        const orderData = { clientFirstName: '', clientLastName: '', clientEmail: '', clientPhone: '', receiptNumber: '', items: [] };
        const refMatch = text.match(/N° de récapitulatif de commande\s+([A-Z0-9]+)/i);
        if (refMatch) { orderData.receiptNumber = refMatch[1]; }
        const clientInfoMatch = text.match(/Informations client\s+([\s\S]+?)N° de récapitulatif/i);
        if (clientInfoMatch) {
            const clientBlock = clientInfoMatch[1];
            const nameMatch = clientBlock.match(/([a-zA-Z\s]+)/);
            if (nameMatch) {
                const nameParts = nameMatch[1].trim().split(/\s+/);
                orderData.clientLastName = nameParts.pop() || '';
                orderData.clientFirstName = nameParts.join(' ') || '';
            }
            const emailMatch = clientBlock.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
            if (emailMatch) orderData.clientEmail = emailMatch[1];
            const phoneMatch = clientBlock.match(/(\d{10})/);
            if (phoneMatch) orderData.clientPhone = phoneMatch[1];
        }
        const itemsSectionMatch = text.match(/Total \(HT\)([\s\S]+?)Détail des taxes/i);
        if (itemsSectionMatch) {
            const itemsText = itemsSectionMatch[1];
            const itemRegex = /[A-Z0-9]+\s+H\d{2}\s+(.+?)\s+\d{1,2}\s*%\s+[\d,]+\s*€\s+(\d+)\s+[\d,]+\s*€/gm;
            let match;
            while ((match = itemRegex.exec(itemsText)) !== null) {
                orderData.items.push({ itemName: match[1].trim().replace(/\s+/g, ' '), quantity: parseInt(match[2], 10) });
            }
        }
        if (orderData.items.length === 0) { orderData.items.push({ itemName: '', quantity: 1 }); }
        if(orderData.clientFirstName) orderData.clientFirstName = orderData.clientFirstName.charAt(0).toUpperCase() + orderData.clientFirstName.slice(1).toLowerCase();
        if(orderData.clientLastName) orderData.clientLastName = orderData.clientLastName.toUpperCase();
        return orderData;
    }, []);

    const handlePdfFileChange = useCallback(async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        showToast("Lecture du PDF en cours...", "info");
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const pdf = await pdfjs.getDocument(data).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                }
                const parsedData = parseOrderFromText(fullText);
                handleEditOrder(parsedData); 
                showToast("Données importées ! Veuillez vérifier.", "success");
            } catch (error) {
                console.error("Erreur PDF:", error);
                showToast("Impossible de lire ce PDF.", "error");
            }
        };
        reader.readAsArrayBuffer(file);
        event.target.value = null; 
    }, [showToast, handleEditOrder, parseOrderFromText]);

    const handleLogin = useCallback(async (email, password) => { setLoginError(null); if (!auth) return; try { await signInWithEmailAndPassword(auth, email, password); setShowLogin(false); } catch (error) { setLoginError("Email ou mot de passe incorrect."); showToast("Échec de la connexion.", 'error'); } }, [auth, showToast]);
    const handleLogout = useCallback(() => { if(auth) signOut(auth).then(() => showToast("Déconnexion réussie.", "success")); }, [auth, showToast]);
    const getCurrentUserInfo = useCallback(() => { if (!currentUser) return null; return { uid: currentUser.uid, email: currentUser.email, name: getUserDisplayName(currentUser.email), role: ADMIN_EMAILS.includes(currentUser.email) ? 'admin' : 'counselor' }; }, [currentUser]);
    const handleSaveOrder = useCallback(async (orderData) => { if (!db || !currentUser) return; setIsSaving(true); const userInfo = getCurrentUserInfo(); const now = new Date().toISOString(); try { if (editingOrder) { const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, editingOrder.id); const itemsToUpdate = editingOrder.items || []; const updatedItems = orderData.items.map((newItem) => { const existing = itemsToUpdate.find(e => e.itemName === newItem.itemName); return existing ? { ...existing, quantity: newItem.quantity } : { ...newItem, itemId: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, status: ITEM_STATUS.ORDERED }; }); const updatePayload = { clientFirstName: orderData.clientFirstName, clientLastName: orderData.clientLastName, clientEmail: orderData.clientEmail, clientPhone: orderData.clientPhone, receiptNumber: orderData.receiptNumber, orderNotes: orderData.orderNotes, items: updatedItems }; const historyEvents = [...(editingOrder.history || [])]; const originalOwnerEmail = editingOrder.orderedBy?.email; const newOwnerEmail = orderData.ownerEmail; if (isAdmin && originalOwnerEmail !== newOwnerEmail) { const newOwner = allUsers.find(u => u.email === newOwnerEmail); if (newOwner) { updatePayload.orderedBy = { email: newOwner.email, name: newOwner.name, uid: editingOrder.orderedBy.uid, role: ADMIN_EMAILS.includes(newOwner.email) ? 'admin' : 'counselor' }; historyEvents.push({ timestamp: now, action: `Conseiller associé changé de **${editingOrder.orderedBy.name}** à **${newOwner.name}**`, by: userInfo }); } } historyEvents.push({ timestamp: now, action: "Commande **modifiée**", by: userInfo }); updatePayload.history = historyEvents; await updateDoc(orderRef, updatePayload); showToast("Commande modifiée !", 'success'); } else { const itemsWithStatus = orderData.items.map(item => ({ ...item, itemId: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, status: ITEM_STATUS.ORDERED })); const newOrder = { ...orderData, items: itemsWithStatus, orderedBy: userInfo, orderDate: now, currentStatus: ORDER_STATUS.ORDERED, history: [{ timestamp: now, action: `Commande **créée**`, by: userInfo }]}; delete newOrder.ownerEmail; const newDocRef = await addDoc(collection(db, `artifacts/${APP_ID}/public/data/orders`), newOrder); showToast("Commande ajoutée !", 'success'); setOpenCardId(newDocRef.id); } setShowOrderForm(false); setEditingOrder(null); } catch (e) { console.error(e); showToast("Échec.", 'error'); } finally { setIsSaving(false); } }, [db, currentUser, editingOrder, allUsers, isAdmin, showToast, getCurrentUserInfo]);
    const handleUpdateItemStatus = useCallback(async (orderId, itemId, newStatus, itemName) => { /* ... */ }, [db, currentUser, orders, getCurrentUserInfo, showToast]);
    const handleConfirmCancelItem = useCallback(async (note) => { /* ... */ }, [db, orders, itemToCancel, getCurrentUserInfo, showToast]);
    const handleUpdateOrderStatus = useCallback(async (orderId, newStatus) => { /* ... */ }, [db, currentUser, orders, getCurrentUserInfo, showToast]);
    const handleConfirmNotification = useCallback(async ({ method, voicemail }) => { /* ... */ }, [db, currentUser, orderToNotify, getCurrentUserInfo, showToast]);
    const handleConfirmDelete = useCallback(async (orderId) => { /* ... */ }, [db, isAdmin, showToast]);
    const handleConfirmRollback = useCallback(async (reason) => { /* ... */ }, [db, currentUser, orderToRollback, getCurrentUserInfo, showToast]);
    const closeConfirmation = () => setConfirmation({ isOpen: false, message: '', onConfirm: () => {} });
    const handleRequestDelete = (orderId) => setConfirmation({ isOpen: true, message: "Supprimer définitivement cette commande ?", onConfirm: () => {handleConfirmDelete(orderId); closeConfirmation();}, confirmColor: 'bg-red-600' });
    const handleRequestItemStatusUpdate = (orderId, itemId, newStatus, itemName) => setConfirmation({ isOpen: true, message: `Marquer '${itemName}' comme Reçu ?`, onConfirm: () => {handleUpdateItemStatus(orderId, itemId, newStatus, itemName); closeConfirmation(); }, confirmColor: 'bg-green-600' });
    const handleRequestOrderStatusUpdate = (order, newStatus) => { /* ... */ };
    const handleRequestNotification = useCallback((order) => { setOrderToNotify(order); setShowNotificationModal(true); }, []);
    const handleShowOrderHistory = useCallback((order) => { setSelectedOrderForHistory(order); setShowOrderHistory(true); }, []);
    const handleCancelItem = (orderId, itemId, itemName) => { setItemToCancel({ orderId, itemId, itemName }); setShowItemCancelModal(true); };
    const handleInitiateRollback = useCallback((order) => { setOrderToRollback(order); setShowRollbackModal(true); }, []);

    if (!authReady) { /* ... */ }
    if (showLogin || !currentUser) { /* ... */ }

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <TailwindColorSafelist />
            <AnimationStyles />
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {confirmation.isOpen && ( <ConfirmationModal message={confirmation.message} onConfirm={confirmation.onConfirm} onCancel={closeConfirmation} confirmColor={confirmation.confirmColor} /> )}
            {showItemCancelModal && ( <CancellationModal title={`Annuler l'article "${itemToCancel?.itemName}"`} message="Indiquer la raison de cette annulation." onConfirm={handleConfirmCancelItem} onCancel={() => setShowItemCancelModal(false)} /> )}
            {showOrderHistory && selectedOrderForHistory && ( <OrderHistoryModal order={selectedOrderForHistory} onClose={() => setShowOrderHistory(false)} /> )}
            {showOrderForm && ( <OrderForm onSave={handleSaveOrder} initialData={editingOrder} isSaving={isSaving} onClose={() => { setShowOrderForm(false); setEditingOrder(null); }} isAdmin={isAdmin} allUsers={allUsers} /> )}
            {showRollbackModal && orderToRollback && ( <RollbackStatusModal title="Annuler le dernier changement ?" message="La commande reviendra à son état précédent. Veuillez justifier." onConfirm={handleConfirmRollback} onCancel={() => { setShowRollbackModal(false); setOrderToRollback(null); }} /> )}
            {showNotificationModal && orderToNotify && ( <NotificationModal onConfirm={handleConfirmNotification} onCancel={() => { setShowNotificationModal(false); setOrderToNotify(null); }} /> )}
            <div className="max-w-6xl mx-auto px-2 sm:px-4 lg:px-6">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <div><h1 className="text-3xl sm:text-4xl font-bold tracking-tight">AOD Tracker 2.0</h1><p className="text-gray-400 mt-1 text-sm sm:text-base">Suivi des commandes d'accessoires en temps réel.</p></div>
                    <div className="mt-4 sm:mt-0 flex flex-wrap items-center justify-end gap-2 sm:gap-4"><div className="flex items-center gap-2 text-blue-300"><User size={18} /><span className="font-medium text-sm sm:text-base">Connecté :</span><span className="bg-gray-700/50 px-2 py-1 rounded-full text-xs sm:text-sm font-semibold text-white">{getCurrentUserInfo()?.name || 'Conseiller'}</span></div>{isAdmin ? ( <div className="flex flex-wrap gap-2 sm:gap-4"><span className="inline-flex items-center gap-2 bg-blue-600 px-3 py-1 rounded-full text-xs sm:text-sm font-bold text-white shadow-md"><UserCheck size={16} /> Admin</span><Tooltip text="Déconnexion"><button onClick={handleLogout} aria-label="Déconnexion" className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700"><LogOut size={22} /></button></Tooltip></div> ) : ( <Tooltip text="Déconnexion"><button onClick={handleLogout} aria-label="Déconnexion" className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700"><LogOut size={22} /></button></Tooltip> )}</div>
                </header>
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 mb-6">
                    <button onClick={() => { setShowOrderForm(true); setEditingOrder(null); }} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 text-base"><PlusCircle size={20} /> Nouvelle Commande</button>
                    <button onClick={() => fileInputRef.current.click()} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-base"><FileUp size={20} /> Importer une commande</button>
                    <input type="file" ref={fileInputRef} onChange={handlePdfFileChange} accept=".pdf" style={{ display: 'none' }} />
                    <div className="flex-grow"></div>
                    {viewMode === 'active' ? ( <button onClick={() => setViewMode('archived')} className="w-full sm:w-auto bg-gray-600 hover:bg-gray-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 text-base"><Archive size={20} /> Voir les Archives</button> ) : ( <button onClick={() => setViewMode('active')} className="w-full sm:w-auto bg-gray-600 hover:bg-gray-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 text-base"><List size={20} /> Commandes Actives</button> )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-gray-800/50 rounded-2xl p-4 flex items-center gap-4 md:col-span-1">
                        <div className="bg-green-500/10 p-3 rounded-full"><CalendarCheck2 size={24} className="text-green-400" /></div>
                        <div><p className="text-gray-400 text-sm">Commandes du jour</p><p className="text-2xl font-bold text-white">{todaysOrdersCount}</p></div>
                    </div>
                    <div className="bg-gray-800/50 rounded-2xl p-4 md:col-span-3">
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                             <div className="relative flex-grow sm:col-span-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-700/50 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white" /></div>
                             <div className="relative sm:col-span-1"><select value={selectedStatusFilter} onChange={(e) => setSelectedStatusFilter(e.target.value)} className="bg-gray-700/50 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none pr-8 cursor-pointer w-full" disabled={viewMode === 'archived'}><option value="All">Tous les statuts</option>{Object.values(ORDER_STATUSES_CONFIG).filter(s => ![ORDER_STATUS.ARCHIVED, ORDER_STATUS.COMPLETE_CANCELLED].includes(s.label)).map(status => ( <option key={status.label} value={status.label}>{status.label}</option> )) }</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" /></div>
                             <div className="relative sm:col-span-1"><select value={selectedAdvisorFilter} onChange={(e) => setSelectedAdvisorFilter(e.target.value)} className="bg-gray-700/50 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none pr-8 cursor-pointer w-full"><option value="All">Tous les conseillers</option>{allUsers.map(user => (<option key={user.email} value={user.email}>{user.name}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" /></div>
                         </div>
                    </div>
                </div>
                {dbError && <div className="bg-red-500/20 text-red-300 p-4 rounded-lg mb-6">{dbError}</div>}
                {isLoading ? ( <div className="text-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto" /><p className="text-gray-400 mt-4">Chargement...</p></div> ) : filteredAndSortedOrders.length === 0 ? ( <div className="text-center py-10 sm:py-20 bg-gray-800 rounded-2xl"><h2 className="text-xl sm:text-2xl font-semibold text-gray-300">{viewMode === 'active' ? 'Aucune commande active' : 'Aucune archive'}</h2><p className="text-gray-400 mt-2">{viewMode === 'active' ? 'Créez une nouvelle commande pour commencer.' : ''}</p></div> ) : (
                    <div className="grid grid-cols-1 gap-6 animate-fade-in">
                        {filteredAndSortedOrders.map((order) => {
                            const isNew = isDateToday(order.orderDate);
                            return (
                                <OrderCard 
                                    key={order.id} 
                                    order={order} 
                                    onRequestItemStatusUpdate={handleRequestItemStatusUpdate}
                                    onCancelItem={handleCancelItem}
                                    onNotifyClient={handleRequestNotification}
                                    onRequestOrderStatusUpdate={handleRequestOrderStatusUpdate}
                                    isAdmin={isAdmin} 
                                    onShowHistory={handleShowOrderHistory}
                                    onEdit={handleEditOrder}
                                    onRequestDelete={handleRequestDelete}
                                    onInitiateRollback={handleInitiateRollback}
                                    isOpen={openCardId === order.id}
                                    onToggleOpen={() => handleToggleCard(order.id)}
                                    isNew={isNew}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
