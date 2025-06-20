import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// Importations Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

// Importations des icônes Lucide React
import {
    PlusCircle, Package, CheckCircle, Bell, History, User, LogOut, UserCheck, LogIn, AlertTriangle, X, Info, Trash2, Edit, Phone, Mail, ReceiptText, Search, MinusCircle, Check, ChevronDown, Archive, Undo2, List, XCircle, FileWarning,
    MessageSquareText, PhoneCall, BellRing, Clock, CalendarCheck2, FileUp, FilePenLine
} from 'lucide-react';

// Importation de la bibliothèque PDF
import * as pdfjs from 'pdfjs-dist/build/pdf';

// CONFIGURATION FINALE ET INFALLIBLE VIA CDN
pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js';

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

const ADMIN_EMAILS = [
    "jullien.gault@orange-store.com",
    "marvyn.ammiche@orange-store.com"
];

const SPECIAL_USER_NAMES = {
    "jullien.gault@orange-store.com": "Jullien",
    "marvyn.ammiche@orange-store.com": "Marvyn"
};

const ITEM_STATUS = {
    ORDERED: 'Commandé',
    RECEIVED: 'Reçu',
    CANCELLED: 'Annulé',
};

const ORDER_STATUS = {
    ORDERED: 'Commandé',
    PARTIALLY_RECEIVED: 'Partiellement Reçu',
    READY_FOR_PICKUP: 'Prêt pour retrait',
    NOTIFIED: 'Client Prévenu',
    PICKED_UP: 'Retirée',
    ARCHIVED: 'Archivé',
    COMPLETE_CANCELLED: 'Annulée'
};

const ORDER_STATUSES_CONFIG = {
    [ORDER_STATUS.ORDERED]: { label: 'Commandé', colorClass: 'bg-yellow-500', icon: Package },
    [ORDER_STATUS.PARTIALLY_RECEIVED]: { label: 'Partiellement Reçu', colorClass: 'bg-blue-400', icon: FileWarning },
    [ORDER_STATUS.READY_FOR_PICKUP]: { label: 'Prêt pour retrait', colorClass: 'bg-green-500', icon: CheckCircle },
    [ORDER_STATUS.NOTIFIED]: { label: 'Client Prévenu', colorClass: 'bg-blue-500', icon: Bell },
    [ORDER_STATUS.PICKED_UP]: { label: 'Retirée', colorClass: 'bg-purple-600', icon: UserCheck },
    [ORDER_STATUS.ARCHIVED]: { label: 'Archivé', colorClass: 'bg-gray-600', icon: Archive },
    [ORDER_STATUS.COMPLETE_CANCELLED]: { label: 'Annulée', colorClass: 'bg-red-700', icon: XCircle }
};

const getUserDisplayName = (email) => {
    if (!email) return 'N/A';
    if (SPECIAL_USER_NAMES[email]) {
        return SPECIAL_USER_NAMES[email];
    }
    const namePart = email.split('@')[0].split('.')[0];
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
};

// =================================================================
// FONCTIONS UTILITAIRES PARTAGÉES
// =================================================================

const isDateToday = (isoString) => {
    if (!isoString) return false;
    try {
        const date = new Date(isoString);
        const today = new Date();
        return date.getDate() === today.getDate() &&
               date.getMonth() === today.getMonth() &&
               date.getFullYear() === today.getFullYear();
    } catch (e) {
        return false;
    }
};

const getNotificationStats = (history) => {
    if (!history) return { email: 0, sms: 0, phone: 0, voicemail: 0, total: 0 };
    return history.reduce((acc, event) => {
        if (event.action.includes('prévenu')) {
            acc.total++;
            if (event.action.includes('Email')) acc.email++;
            if (event.action.includes('SMS')) acc.sms++;
            if (event.action.includes('Appel')) {
                acc.phone++;
                if (event.note && event.note.includes('Message vocal')) { acc.voicemail++; }
            }
        }
        return acc;
    }, { email: 0, sms: 0, phone: 0, voicemail: 0, total: 0 });
};

const findLastNotificationTimestamp = (history) => {
    if (!history) return null;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].action.includes('prévenu')) {
            return history[i].timestamp;
        }
    }
    return null;
};

const getDerivedOrderStatus = (order) => {
    if (!order || !order.items || order.items.length === 0) return order.currentStatus;
    const activeItems = order.items.filter(item => item.status !== ITEM_STATUS.CANCELLED);
    if (activeItems.length === 0) return ORDER_STATUS.COMPLETE_CANCELLED;
    const activeStatuses = activeItems.map(item => item.status);
    const allReceived = activeStatuses.every(status => status === ITEM_STATUS.RECEIVED);
    const someReceived = activeStatuses.some(status => status === ITEM_STATUS.RECEIVED);
    if (allReceived) return ORDER_STATUS.READY_FOR_PICKUP;
    if (someReceived) return ORDER_STATUS.PARTIALLY_RECEIVED;
    return ORDER_STATUS.ORDERED;
};

const getEffectiveOrderStatus = (order) => {
    if (!order) return null;
    const advancedStatuses = [ORDER_STATUS.NOTIFIED, ORDER_STATUS.PICKED_UP, ORDER_STATUS.ARCHIVED, ORDER_STATUS.COMPLETE_CANCELLED];
    if (advancedStatuses.includes(order.currentStatus)) return order.currentStatus;
    return getDerivedOrderStatus(order);
};

const getIconForHistoryAction = (action) => {
    if (!action) return History;
    const lowerCaseAction = action.toLowerCase();
    if (lowerCaseAction.includes('créée')) return Package;
    if (lowerCaseAction.includes('prévenu')) return Bell;
    if (lowerCaseAction.includes('retirée')) return UserCheck;
    if (lowerCaseAction.includes('archivée')) return Archive;
    if (lowerCaseAction.includes('reçu')) return CheckCircle;
    if (lowerCaseAction.includes('annulé')) return XCircle;
    if (lowerCaseAction.includes('modifiée')) return Edit;
    if (lowerCaseAction.includes('retour arrière')) return Undo2;
    return History;
};

const getIconColorClass = (action) => {
    if (!action) return 'text-gray-400';
    const lowerCaseAction = action.toLowerCase();
    if (lowerCaseAction.includes('créée') || lowerCaseAction.includes('retour arrière')) return 'text-yellow-400';
    if (lowerCaseAction.includes('reçu')) return 'text-green-400';
    if (lowerCaseAction.includes('prévenu')) return 'text-blue-400';
    if (lowerCaseAction.includes('retirée') || lowerCaseAction.includes('modifiée')) return 'text-purple-400';
    if (lowerCaseAction.includes('annulé')) return 'text-red-400';
    if (lowerCaseAction.includes('archivée')) return 'text-gray-500';
    return 'text-gray-400';
};

const formatPhoneNumber = (phoneStr) => {
    if (!phoneStr) return null;
    const cleaned = ('' + phoneStr).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (match) return `${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}`;
    return cleaned;
};

const formatOrderDate = (isoString) => {
    if (!isoString) return 'Date inconnue';
    try {
        return new Date(isoString).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return 'Date invalide';
    }
};

// =================================================================
// COMPOSANTS DE L'INTERFACE UTILISATEUR (UI)
// =================================================================

const TailwindColorSafelist = () => ( <div style={{ display: 'none' }}><span className="bg-yellow-500"></span><span className="text-yellow-500"></span><span className="text-yellow-400"></span><span className="bg-green-500"></span><span className="text-green-500"></span><span className="text-green-400"></span><span className="bg-green-600"></span><span className="hover:bg-green-700"></span><span className="bg-blue-400"></span><span className="bg-blue-500"></span><span className="bg-blue-600"></span><span className="hover:bg-blue-700"></span><span className="text-blue-500"></span><span className="text-blue-400"></span><span className="bg-purple-600"></span><span className="hover:bg-purple-700"></span><span className="text-purple-600"></span><span className="text-purple-400"></span><span className="bg-gray-600"></span><span className="hover:bg-gray-700"></span><span className="text-gray-600"></span><span className="text-gray-500"></span><span className="text-gray-400"></span><span className="bg-red-700"></span><span className="bg-red-600"></span><span className="hover:bg-red-700"></span><span className="hover:bg-red-800"></span><span className="text-red-700"></span><span className="text-red-400"></span><span className="bg-yellow-600"></span><span className="hover:bg-yellow-700"></span><span className="ring-green-500"></span></div> );
const HistoryActionText = ({ text }) => { if (!text) return null; const parts = text.split(/\*\*(.*?)\*\*/g); return ( <p className="text-white font-medium">{parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}</p> ); };
const AnimationStyles = () => ( <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}.animate-fade-in{animation:fadeIn .5s ease-in-out}@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.animate-fade-in-up{animation:fadeInUp .5s ease-out forwards}.tooltip{position:absolute;top:100%;left:50%;transform:translateX(-50%);padding:8px 12px;background-color:rgba(45,55,72,.9);color:#fff;border-radius:8px;font-size:14px;white-space:pre-wrap;z-index:50;opacity:0;visibility:hidden;transition:opacity .2s ease-in-out,visibility .2s ease-in-out;box-shadow:0 4px 10px rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.1)}.group:hover .tooltip{opacity:1;visibility:visible}.custom-scrollbar::-webkit-scrollbar{width:8px}.custom-scrollbar::-webkit-scrollbar-track{background:#374151;border-radius:10px}.custom-scrollbar::-webkit-scrollbar-thumb{background:#60A5FA;border-radius:10px}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:#3B82F6}`}</style> );
const Tooltip = ({ children, text, className }) => ( <div className={`relative inline-block group ${className || ''}`}>{children}{text && (<div className="tooltip">{text}</div>)}</div> );
const Toast = ({ message, type, onClose }) => { const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'; const Icon = type === 'success' ? Check : type === 'error' ? AlertTriangle : Info; return ( <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 p-4 rounded-lg shadow-lg text-white flex items-center gap-3 z-[999] ${bgColor} animate-fade-in-up`}><Icon size={24} /><span>{message}</span><button onClick={onClose} className="ml-2 text-white/80 hover:text-white transition-colors"><X size={20} /></button></div> ); };
const ConfirmationModal = ({ message, onConfirm, onCancel, confirmText = 'Confirmer', cancelText = 'Annuler', confirmColor = 'bg-blue-600' }) => ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in"><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 animate-fade-in-up mx-4 sm:mx-0"><div className="text-center"><AlertTriangle className="mx-auto h-12 w-12 text-blue-400" /><h3 className="mt-4 text-xl font-medium text-white">{message}</h3></div><div className="mt-6 flex flex-col sm:flex-row justify-center gap-4"><button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto">{cancelText}</button><button onClick={onConfirm} className={`${confirmColor} hover:${confirmColor.replace('600', '700')} text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto`}>{confirmText}</button></div></div></div> );
const CancellationModal = ({ onConfirm, onCancel, title, message }) => { const [note, setNote] = useState(''); const handleConfirmClick = () => { onConfirm(note); }; return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onCancel}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 animate-fade-in-up mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}><div className="text-center"><AlertTriangle className="mx-auto h-12 w-12 text-red-400" /><h3 className="mt-4 text-xl font-medium text-white">{title}</h3><p className="text-gray-400 mt-2">{message}</p></div><div className="mt-6"><label htmlFor="cancellation-note" className="block text-sm font-medium text-gray-300 mb-2">Raison de l'annulation (optionnel)</label><textarea id="cancellation-note" rows="3" value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg text-sm" placeholder="Ex: Rupture de stock fournisseur..."></textarea></div><div className="mt-6 flex flex-col sm:flex-row justify-center gap-4"><button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto">Retour</button><button onClick={handleConfirmClick} className="bg-red-700 hover:bg-red-800 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto">Confirmer l'annulation</button></div></div></div> ); };
const RollbackStatusModal = ({ onConfirm, onCancel, title, message }) => { const [reason, setReason] = useState(''); const handleConfirmClick = () => { if (reason.trim()) { onConfirm(reason); } }; return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onCancel}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 animate-fade-in-up mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}><div className="text-center"><Undo2 className="mx-auto h-12 w-12 text-yellow-400" /><h3 className="mt-4 text-xl font-medium text-white">{title}</h3><p className="text-gray-400 mt-2">{message}</p></div><div className="mt-6"><label htmlFor="rollback-reason" className="block text-sm font-medium text-gray-300 mb-2">Raison (obligatoire)</label><textarea id="rollback-reason" rows="3" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg text-sm" placeholder="Ex: Erreur de manipulation..."></textarea></div><div className="mt-6 flex flex-col sm:flex-row justify-center gap-4"><button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto">Annuler</button><button onClick={handleConfirmClick} className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed" disabled={!reason.trim()}>Confirmer le retour</button></div></div></div> ); };
const LoginForm = ({ onLogin, error }) => { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const handleSubmit = (e) => { e.preventDefault(); onLogin(email, password); }; return ( <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 animate-fade-in-up mx-4 sm:mx-0"><div className="text-center mb-6"><LogIn className="mx-auto h-12 w-12 text-blue-400" /><h2 className="mt-4 text-2xl font-bold text-white">Connexion</h2><p className="text-gray-400 mt-1">Accès réservé.</p></div><form onSubmit={handleSubmit} className="space-y-6"><div><label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">Adresse Email</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><div><label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">Mot de passe</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div>{error && (<p className="text-red-400 text-sm text-center">{error}</p>)}<button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors">Se connecter</button></form></div> ); };
const OrderForm = ({ onSave, initialData, isSaving, onClose, isAdmin, allUsers }) => { const [clientFirstName, setClientFirstName] = useState(initialData?.clientFirstName || ''); const [clientLastName, setClientLastName] = useState(initialData?.clientLastName || ''); const [clientEmail, setClientEmail] = useState(initialData?.clientEmail || ''); const [clientPhone, setClientPhone] = useState(initialData?.clientPhone || ''); const [receiptNumber, setReceiptNumber] = useState(initialData?.receiptNumber || ''); const [items, setItems] = useState(initialData?.items && initialData.items.length > 0 ? initialData.items.map(i => ({itemName: i.itemName, quantity: i.quantity})) : [{ itemName: '', quantity: '' }]); const [orderNotes, setOrderNotes] = useState(initialData?.orderNotes || ''); const [formError, setFormError] = useState(null); const [ownerEmail, setOwnerEmail] = useState(initialData?.orderedBy?.email || ''); const handleItemChange = useCallback((index, field, value) => { const newItems = [...items]; newItems[index][field] = value; setItems(newItems); }, [items]); const handleAddItem = useCallback(() => { setItems([...items, { itemName: '', quantity: '' }]); }, [items]); const handleRemoveItem = useCallback((index) => { const newItems = items.filter((_, i) => i !== index); setItems(newItems); }, [items]); const handleFirstNameChange = (e) => { const value = e.target.value; if (value === '') { setClientFirstName(''); } else { setClientFirstName(value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()); } }; const handleLastNameChange = (e) => { setClientLastName(e.target.value.toUpperCase()); }; const handleSubmit = useCallback(async (e) => { e.preventDefault(); setFormError(null); if (!clientFirstName || !clientLastName || !clientEmail || !clientPhone) { setFormError("Veuillez remplir tous les champs client obligatoires (*)."); return; } const validItems = items.filter(item => item.itemName.trim() && parseInt(item.quantity, 10) > 0); if (validItems.length === 0) { setFormError("Veuillez ajouter au moins un article valide (Nom et Quantité > 0)."); return; } try { await onSave({ clientFirstName: clientFirstName.trim(), clientLastName: clientLastName.trim(), clientEmail: clientEmail.trim(), clientPhone: clientPhone.trim(), receiptNumber: receiptNumber.trim(), items: validItems.map(item => ({ itemName: item.itemName.trim(), quantity: parseInt(item.quantity, 10) })), orderNotes: orderNotes.trim(), ownerEmail: ownerEmail }); onClose(); } catch (error) { console.error("Error saving order:", error); setFormError("Échec de l'enregistrement."); } }, [clientFirstName, clientLastName, clientEmail, clientPhone, receiptNumber, items, orderNotes, onSave, onClose, ownerEmail]); return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh] custom-scrollbar" onClick={(e) => e.stopPropagation()}><button onClick={onClose} aria-label="Fermer" className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={24} /></button><h2 className="text-2xl font-bold text-white mb-6 text-center">{initialData ? 'Modifier la commande' : 'Nouvelle Commande'}</h2><form onSubmit={handleSubmit} className="space-y-6">{isAdmin && initialData && (<div><h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2"><UserCheck size={20} /> Zone Administrateur</h3><div className="space-y-4 bg-gray-900/50 p-4 rounded-lg"><div><label htmlFor="owner" className="block text-sm font-medium text-gray-300 mb-2">Conseiller associé</label><select id="owner" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg">{allUsers.map(user => (<option key={user.email} value={user.email}>{user.name}</option>))}</select></div></div></div>)}<div><h3 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2"><User size={20} /> Informations Client</h3><div className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label htmlFor="clientFirstName" className="block text-sm font-medium text-gray-300 mb-2">Prénom client *</label><input id="clientFirstName" type="text" value={clientFirstName} onChange={handleFirstNameChange} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><div><label htmlFor="clientLastName" className="block text-sm font-medium text-gray-300 mb-2">Nom client *</label><input id="clientLastName" type="text" value={clientLastName} onChange={handleLastNameChange} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div></div><div><label htmlFor="clientEmail" className="block text-sm font-medium text-gray-300 mb-2">Email client *</label><input id="clientEmail" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><div><label htmlFor="clientPhone" className="block text-sm font-medium text-gray-300 mb-2">Téléphone client *</label><input id="clientPhone" type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div></div></div><hr className="border-gray-700" /><div><h3 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2"><Package size={20} /> Articles Commandés *</h3><div className="space-y-3">{items.map((item, index) => ( <div key={index} className="flex flex-col sm:flex-row items-end gap-2 bg-gray-700/50 p-3 rounded-lg"><div className="flex-grow w-full"><label htmlFor={`itemName-${index}`} className="block text-xs text-gray-400 mb-1">Article</label><input id={`itemName-${index}`} type="text" placeholder="Nom de l'accessoire" value={item.itemName} onChange={(e) => handleItemChange(index, 'itemName', e.target.value)} required className="w-full bg-gray-600 p-2 rounded-lg text-sm" /></div><div className="w-full sm:w-auto"><label htmlFor={`quantity-${index}`} className="block text-xs text-gray-400 mb-1">Qté</label><input id={`quantity-${index}`} type="number" placeholder="Qté" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} required min="1" className="w-full sm:w-20 bg-gray-600 p-2 rounded-lg text-sm" /></div>{items.length > 1 && ( <button type="button" onClick={() => handleRemoveItem(index)} className="p-2 text-red-400 hover:text-red-300"><MinusCircle size={20} /></button> )}</div> ))}</div><button type="button" onClick={handleAddItem} className="mt-4 w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 font-bold py-2 px-4 rounded-lg"><PlusCircle size={20} /> Ajouter un article</button></div><hr className="border-gray-700" /><div><h3 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2"><Info size={20} /> Informations Complémentaires</h3><div className="space-y-4"><div><label htmlFor="receiptNumber" className="block text-sm font-medium text-gray-300 mb-2">N° de ticket (optionnel)</label><input id="receiptNumber" type="text" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg" /></div><div><label htmlFor="orderNotes" className="block text-sm font-medium text-gray-300 mb-2">Notes (optionnel)</label><textarea id="orderNotes" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows="3" className="w-full bg-gray-700 p-3 rounded-lg"></textarea></div></div></div>{formError && (<div className="bg-red-500/10 border-red-500/30 text-red-300 p-3 rounded-lg flex items-center space-x-3"><AlertTriangle className="w-5 h-5" /><span>{formError}</span></div>)}<button type="submit" disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg disabled:opacity-50 text-lg">{isSaving ? 'Enregistrement...' : (initialData ? 'Mettre à jour' : 'Passer la commande')}</button></form></div></div> ); };
const NotificationModal = ({ onConfirm, onCancel }) => { const [method, setMethod] = useState('email'); const [voicemail, setVoicemail] = useState(false); const handleConfirm = () => { onConfirm({ method, voicemail }); }; return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onCancel}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 animate-fade-in-up mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}><div className="text-center"><Bell className="mx-auto h-12 w-12 text-blue-400" /><h3 className="mt-4 text-xl font-medium text-white">Comment le client a-t-il été prévenu ?</h3></div><div className="mt-6 space-y-4"><div className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${method === 'email' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500'}`} onClick={() => setMethod('email')}><div className="flex items-center gap-4"><Mail size={24} className={method === 'email' ? 'text-blue-400' : 'text-gray-400'} /><div><p className="font-semibold text-white">Par Email</p><p className="text-sm text-gray-400">Envoi automatique d'un email.</p></div></div></div><div className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${method === 'sms' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500'}`} onClick={() => setMethod('sms')}><div className="flex items-center gap-4"><MessageSquareText size={24} className={method === 'sms' ? 'text-blue-400' : 'text-gray-400'} /><div><p className="font-semibold text-white">Par SMS</p><p className="text-sm text-gray-400">Confirmer un envoi de SMS.</p></div></div></div><div className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${method === 'phone' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500'}`} onClick={() => setMethod('phone')}><div className="flex items-center gap-4"><PhoneCall size={24} className={method === 'phone' ? 'text-blue-400' : 'text-gray-400'} /><div><p className="font-semibold text-white">Par Appel Téléphonique</p><p className="text-sm text-gray-400">Confirmer un appel.</p></div></div>{method === 'phone' && ( <div className="mt-4 pl-10 flex items-center"><input id="voicemail-checkbox" type="checkbox" checked={voicemail} onChange={(e) => setVoicemail(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><label htmlFor="voicemail-checkbox" className="ml-2 block text-sm text-gray-300">Message vocal déposé.</label></div> )}</div></div><div className="mt-8 flex flex-col sm:flex-row justify-center gap-4"><button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg">Annuler</button><button onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg">Confirmer</button></div></div></div> ); };
const OrderHistoryModal = ({ order, onClose }) => { const notificationStats = useMemo(() => getNotificationStats(order.history), [order.history]); return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-xl border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh] custom-scrollbar mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}><button onClick={onClose} aria-label="Fermer" className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={24} /></button><h2 className="text-2xl font-bold text-white mb-2 text-center">Historique de la commande</h2>{notificationStats.total > 0 && ( <div className="bg-gray-900/50 p-4 rounded-lg mb-6 border border-gray-700"><h4 className="font-semibold text-white mb-3 text-center">Résumé des notifications ({notificationStats.total})</h4><div className="flex justify-center flex-wrap gap-x-6 gap-y-2 text-sm text-gray-300"><span className="flex items-center gap-1.5"><Mail size={16} /> Email: <strong className="text-white">{notificationStats.email}</strong></span><span className="flex items-center gap-1.5"><MessageSquareText size={16} /> SMS: <strong className="text-white">{notificationStats.sms}</strong></span><span className="flex items-center gap-1.5"><PhoneCall size={16} /> Appels: <strong className="text-white">{notificationStats.phone}</strong></span>{notificationStats.voicemail > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400">(dont {notificationStats.voicemail} msg. vocaux)</span>}</div></div> )}<div className="space-y-4">{order.history && order.history.length > 0 ? ( order.history.slice().reverse().map((event, index) => { const Icon = getIconForHistoryAction(event.action); return ( <div key={index} className="bg-gray-700 p-4 rounded-lg flex items-start space-x-4"><Icon size={20} className={`${getIconColorClass(event.action)} flex-shrink-0 mt-1`} /><div className="flex-1"><HistoryActionText text={event.action} /><p className="text-gray-300 text-sm">Par <span className="font-semibold">{getUserDisplayName(event.by?.email || 'N/A')}</span> le {formatOrderDate(event.timestamp)}</p>{event.note && <p className="text-gray-400 text-xs italic mt-2 border-l-2 border-gray-600 pl-2">Note: {event.note}</p>}</div></div> ); }) ) : ( <p className="text-gray-400 text-center">Aucun historique.</p> )}</div></div></div> ); };
const OrderCard = ({ order, onRequestItemStatusUpdate, onCancelItem, onRequestOrderStatusUpdate, isAdmin, onShowHistory, onEdit, onRequestDelete, onInitiateRollback, onNotifyClient, isOpen, onToggleOpen, isNew }) => { const displayStatus = getEffectiveOrderStatus(order); const statusConfig = ORDER_STATUSES_CONFIG[displayStatus] || { label: displayStatus, colorClass: 'bg-gray-500', icon: Info }; const isNotified = displayStatus === ORDER_STATUS.NOTIFIED; const notificationStats = getNotificationStats(order.history); const showAlertForExcessiveContact = notificationStats.total >= 5; let hoursSinceNotification = 0; const lastNotificationTimestamp = findLastNotificationTimestamp(order.history); if (isNotified && lastNotificationTimestamp) { hoursSinceNotification = (Date.now() - new Date(lastNotificationTimestamp).getTime()) / (1000 * 60 * 60); } const isReNotifyLocked = isNotified && hoursSinceNotification < 24; const remainingLockHours = Math.ceil(24 - hoursSinceNotification); const canNotify = displayStatus === ORDER_STATUS.READY_FOR_PICKUP; const canBePickedUp = displayStatus === ORDER_STATUS.NOTIFIED; const canBeArchived = displayStatus === ORDER_STATUS.PICKED_UP; const statusHistory = (order.history || []).filter(e => e.action.includes('**')); const canRollback = statusHistory.length >= 2 && ![ORDER_STATUS.ARCHIVED, ORDER_STATUS.COMPLETE_CANCELLED].includes(displayStatus); const canEdit = ![ORDER_STATUS.ARCHIVED, ORDER_STATUS.COMPLETE_CANCELLED].includes(displayStatus); return ( <div className={`bg-gray-800 rounded-2xl shadow-lg flex flex-col transition-all duration-300 animate-fade-in-up hover:ring-2 hover:ring-blue-500/50 ${isNew ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-green-500' : ''}`}><div className="flex justify-between items-start p-4 sm:p-6 cursor-pointer hover:bg-gray-700/50 rounded-t-2xl transition-colors" onClick={onToggleOpen}><div className="flex-1 pr-4"><h3 className="text-xl font-bold text-white">{order.clientFirstName} {order.clientLastName}</h3><div className="mt-2 space-y-1 text-sm text-gray-300">{order.clientPhone && <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400"/><span>{formatPhoneNumber(order.clientPhone)}</span></div>}{order.clientEmail && <div className="flex items-center gap-2"><Mail size={14} className="text-gray-400"/><span>{order.clientEmail}</span></div>}</div><div className="mt-3 pt-3 border-t border-gray-700/60 flex items-center flex-wrap gap-x-2 text-xs text-gray-400"><User size={14} /><span>Par</span><span className="font-semibold text-gray-300">{order.orderedBy?.name || 'N/A'}</span><span className="hidden sm:inline">le</span><span className="font-semibold text-gray-300">{formatOrderDate(order.orderDate)}</span></div></div><div className="flex flex-col items-end gap-3"><span className={`px-3 py-1 rounded-full text-sm font-semibold text-white ${statusConfig.colorClass} text-center`}>{statusConfig.label}</span><ChevronDown size={24} className={`text-gray-400 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`} /></div></div><div className={`transition-all duration-500 ease-in-out overflow-hidden ${isOpen ? 'max-h-[1000px]' : 'max-h-0'}`}><div className="p-4 sm:p-6 border-t border-gray-700">{showAlertForExcessiveContact && (<div className="bg-red-900/70 border border-red-700 rounded-lg p-3 mb-4"><div className="flex items-center gap-3 text-red-300"><AlertTriangle size={24} /><div><h4 className="font-bold text-white">Client injoignable ({notificationStats.total} notifications)</h4><p className="text-sm text-red-300 mt-1"><b>Que faire ?</b> Envisagez une action (manager, annulation...).</p></div></div></div>)}{(order.receiptNumber || order.orderNotes) && (<div className="mb-4 pb-4 border-b border-gray-700/60 space-y-3">{order.receiptNumber && ( <div className="flex items-center gap-2.5 text-sm text-gray-300"><ReceiptText size={16} className="text-gray-400 flex-shrink-0" /><span className="font-semibold">N° ticket:</span><span className="font-mono bg-gray-700 px-2 py-0.5 rounded-md text-white">{order.receiptNumber}</span></div> )}{order.orderNotes && ( <div className="flex items-start gap-2.5 text-sm text-gray-300"><Info size={16} className="text-gray-400 mt-0.5 flex-shrink-0" /><span className="font-semibold">Notes:</span><p className="text-gray-200 italic whitespace-pre-wrap flex-1">{order.orderNotes}</p></div> )}</div>)}<h4 className="text-md font-semibold text-gray-300 mb-3">Gestion des articles :</h4><div className="space-y-3">{order.items?.map(item => (<div key={item.itemId} className="bg-gray-700/50 p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"><div className="flex-1"><p className="text-white font-medium">{item.itemName} (Qté: {item.quantity})</p><p className={`text-xs font-bold ${item.status === ITEM_STATUS.RECEIVED ? 'text-green-400' : item.status === ITEM_STATUS.CANCELLED ? 'text-red-400' : 'text-yellow-400'}`}><span>Statut : {item.status || 'N/A'}</span></p></div><div className="flex gap-2 self-start sm:self-center">{item.status === ITEM_STATUS.ORDERED && ( <> <button onClick={() => onRequestItemStatusUpdate(order.id, item.itemId, ITEM_STATUS.RECEIVED, item.itemName)} className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-2 rounded-md transition-colors">Marquer Reçu</button><button onClick={() => onCancelItem(order.id, item.itemId, item.itemName)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-2 rounded-md transition-colors">Annuler</button> </> )}</div></div>))}</div><div className="mt-4 pt-4 border-t border-gray-700"><h4 className="text-md font-semibold text-gray-300 mb-2">Actions sur la commande</h4><div className="flex flex-col sm:flex-row flex-wrap gap-2">{canRollback && <button onClick={() => onInitiateRollback(order)} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2"><Undo2 size={18} /> Revenir en arrière</button>}{canNotify && <button onClick={() => onNotifyClient(order)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2"><Bell size={18} /> Prévenir le client</button>}{isNotified && (<button onClick={() => onNotifyClient(order)} disabled={isReNotifyLocked} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><BellRing size={18} /> Notifier à nouveau</button>)}{canBePickedUp && <button onClick={() => onRequestOrderStatusUpdate(order, ORDER_STATUS.PICKED_UP)} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2"><UserCheck size={18} /> Marquer comme Retirée</button>}{canBeArchived && <button onClick={() => onRequestOrderStatusUpdate(order, ORDER_STATUS.ARCHIVED)} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2"><Archive size={18} /> Archiver</button>}<button onClick={() => onShowHistory(order)} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 sm:px-4 rounded-lg text-sm flex items-center justify-center gap-2 flex-1 sm:flex-none"><History size={18} /> Historique</button>{canEdit && <button onClick={() => onEdit(order)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-3 sm:px-4 rounded-lg text-sm flex items-center justify-center gap-2 flex-1 sm:flex-none"><Edit size={18} /> Modifier</button>}{isAdmin && <button onClick={() => onRequestDelete(order.id)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 sm:px-4 rounded-lg text-sm flex items-center justify-center gap-2 flex-1 sm:flex-none"><Trash2 size={18} /> Supprimer</button>}</div>{isReNotifyLocked && (<div className="mt-3 text-center text-xs text-gray-400 flex items-center justify-center gap-2 animate-fade-in"><Clock size={14} className="flex-shrink-0" /><span>Prochaine notification possible dans env. {remainingLockHours}h.</span></div>)}</div></div></div></div> ); };
const CreationChoiceModal = ({ onManualCreate, onPdfImport, onClose }) => { return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 animate-fade-in-up mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}><button onClick={onClose} aria-label="Fermer" className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"><X size={24} /></button><div className="text-center"><h2 className="text-2xl font-bold text-white">Nouvelle Commande</h2><p className="text-gray-400 mt-2">Comment souhaitez-vous créer la commande ?</p></div><div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6"><button onClick={onManualCreate} className="bg-gray-700 hover:bg-gray-600 p-6 rounded-xl text-white text-center transition-colors flex flex-col items-center justify-center h-full"><FilePenLine size={40} className="mb-3 text-blue-400" /><h3 className="font-semibold text-lg">Création Manuelle</h3><p className="text-sm text-gray-400 mt-1">Remplir le formulaire pas à pas.</p></button><button onClick={onPdfImport} className="bg-gray-700 hover:bg-gray-600 p-6 rounded-xl text-white text-center transition-colors flex flex-col items-center justify-center h-full"><FileUp size={40} className="mb-3 text-teal-400" /><h3 className="font-semibold text-lg">Importer un PDF</h3><p className="text-sm text-gray-400 mt-1">Extraire les données d'un fichier.</p></button></div></div></div> ); };

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
    const [showCreationChoiceModal, setShowCreationChoiceModal] = useState(false);

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

    const handleEditOrder = useCallback((order) => { 
        setEditingOrder(order); 
        setShowOrderForm(true); 
    }, []);

    const handleManualCreate = () => {
        setShowCreationChoiceModal(false);
        setEditingOrder(null);
        setShowOrderForm(true);
    };

    const handlePdfImport = () => {
        setShowCreationChoiceModal(false);
        fileInputRef.current.click();
    };

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
    const handleSaveOrder = useCallback(async (orderData) => { if (!db || !currentUser) return; setIsSaving(true); const userInfo = getCurrentUserInfo(); const now = new Date().toISOString(); try { if (editingOrder && editingOrder.id) { const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, editingOrder.id); const itemsToUpdate = editingOrder.items || []; const updatedItems = orderData.items.map((newItem) => { const existing = itemsToUpdate.find(e => e.itemName === newItem.itemName); return existing ? { ...existing, quantity: newItem.quantity } : { ...newItem, itemId: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, status: ITEM_STATUS.ORDERED }; }); const updatePayload = { clientFirstName: orderData.clientFirstName, clientLastName: orderData.clientLastName, clientEmail: orderData.clientEmail, clientPhone: orderData.clientPhone, receiptNumber: orderData.receiptNumber, orderNotes: orderData.orderNotes, items: updatedItems }; const historyEvents = [...(editingOrder.history || [])]; const originalOwnerEmail = editingOrder.orderedBy?.email; const newOwnerEmail = orderData.ownerEmail; if (isAdmin && originalOwnerEmail !== newOwnerEmail) { const newOwner = allUsers.find(u => u.email === newOwnerEmail); if (newOwner) { updatePayload.orderedBy = { email: newOwner.email, name: newOwner.name, uid: editingOrder.orderedBy.uid, role: ADMIN_EMAILS.includes(newOwner.email) ? 'admin' : 'counselor' }; historyEvents.push({ timestamp: now, action: `Conseiller associé changé de **${editingOrder.orderedBy.name}** à **${newOwner.name}**`, by: userInfo }); } } historyEvents.push({ timestamp: now, action: "Commande **modifiée**", by: userInfo }); updatePayload.history = historyEvents; await updateDoc(orderRef, updatePayload); showToast("Commande modifiée !", 'success'); } else { const itemsWithStatus = orderData.items.map(item => ({ ...item, itemId: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, status: ITEM_STATUS.ORDERED })); const newOrder = { ...orderData, items: itemsWithStatus, orderedBy: userInfo, orderDate: now, currentStatus: ORDER_STATUS.ORDERED, history: [{ timestamp: now, action: `Commande **créée**`, by: userInfo }]}; delete newOrder.ownerEmail; const newDocRef = await addDoc(collection(db, `artifacts/${APP_ID}/public/data/orders`), newOrder); showToast("Commande ajoutée !", 'success'); setOpenCardId(newDocRef.id); } setShowOrderForm(false); setEditingOrder(null); } catch (e) { console.error(e); showToast("Échec.", 'error'); } finally { setIsSaving(false); } }, [db, currentUser, editingOrder, allUsers, isAdmin, showToast, getCurrentUserInfo]);
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

    if (!authReady) { return ( <div className="bg-gray-900 min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto" /></div> ); }
    if (showLogin || !currentUser) { return ( <div className="bg-gray-900 min-h-screen flex items-center justify-center"><LoginForm onLogin={handleLogin} error={loginError} /></div> ); }

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
            {showCreationChoiceModal && ( <CreationChoiceModal onManualCreate={handleManualCreate} onPdfImport={handlePdfImport} onClose={() => setShowCreationChoiceModal(false)} /> )}
            <div className="max-w-6xl mx-auto px-2 sm:px-4 lg:px-6">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <div><h1 className="text-3xl sm:text-4xl font-bold tracking-tight">AOD Tracker 2.0</h1><p className="text-gray-400 mt-1 text-sm sm:text-base">Suivi des commandes d'accessoires en temps réel.</p></div>
                    <div className="mt-4 sm:mt-0 flex flex-wrap items-center justify-end gap-2 sm:gap-4"><div className="flex items-center gap-2 text-blue-300"><User size={18} /><span className="font-medium text-sm sm:text-base">Connecté :</span><span className="bg-gray-700/50 px-2 py-1 rounded-full text-xs sm:text-sm font-semibold text-white">{getCurrentUserInfo()?.name || 'Conseiller'}</span></div>{isAdmin ? ( <div className="flex flex-wrap gap-2 sm:gap-4"><span className="inline-flex items-center gap-2 bg-blue-600 px-3 py-1 rounded-full text-xs sm:text-sm font-bold text-white shadow-md"><UserCheck size={16} /> Admin</span><Tooltip text="Déconnexion"><button onClick={handleLogout} aria-label="Déconnexion" className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700"><LogOut size={22} /></button></Tooltip></div> ) : ( <Tooltip text="Déconnexion"><button onClick={handleLogout} aria-label="Déconnexion" className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700"><LogOut size={22} /></button></Tooltip> )}</div>
                </header>
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 mb-6">
                    <button onClick={() => setShowCreationChoiceModal(true)} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 text-base"><PlusCircle size={20} /> Nouvelle Commande</button>
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
