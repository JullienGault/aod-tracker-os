import React, { useState, useEffect, useMemo, useCallback } from 'react';

// Importations Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, onSnapshot, setDoc, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

// Importations des icônes Lucide React
import {
    PlusCircle, Package, CheckCircle, Bell, Truck, History, User, Calendar, LogOut, UserCheck, LogIn, AlertTriangle, X, Info, Trash2, Edit, Phone, Mail, ReceiptText, Search, MinusCircle, Check, ChevronDown, RefreshCcw, Archive, Undo2, List
} from 'lucide-react';

// =================================================================
// CONFIGURATION & CONSTANTES DE L'APPLICATION
// =================================================================

// Configuration Firebase pour l'initialisation de l'application.
const firebaseConfig = {
    apiKey: "AIzaSyBn-xE-Zf4JvIKKQNZBus8AvNmJLMeKPdg", // Remplacez par votre vraie clé API
    authDomain: "aod-tracker-os.firebaseapp.com",
    projectId: "aod-tracker-os",
    storageBucket: "aod-tracker-os.appspot.com",
    messagingSenderId: "429289937311",
    appId: "1:429289937311:web:1ab993b09899afc2b245aa",
};

const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-aod-app';
const ADMIN_EMAIL = "jullien.gault@orange-store.com";

// CONFIGURATION DES STATUTS
const ORDER_STATUSES_CONFIG = {
    ORDERED:   { key: 'ORDERED',   label: 'Commandé', description: 'Commande passée',                colorClass: 'bg-yellow-500', icon: Package,   order: 1, allowTransitionTo: ['RECEIVED'],   allowTransitionFrom: [] },
    RECEIVED:  { key: 'RECEIVED',  label: 'Reçu',     description: 'Article reçu en boutique',        colorClass: 'bg-green-500',  icon: Truck,     order: 2, allowTransitionTo: ['NOTIFIED'],   allowTransitionFrom: ['ORDERED'] },
    NOTIFIED:  { key: 'NOTIFIED',  label: 'Prévenu',  description: 'Client prévenu de la disponibilité', colorClass: 'bg-blue-500',   icon: Bell,      order: 3, allowTransitionTo: ['PICKED_UP'],  allowTransitionFrom: ['RECEIVED'] },
    PICKED_UP: { key: 'PICKED_UP', label: 'Retiré',   description: 'Colis retiré par le client',      colorClass: 'bg-purple-600', icon: UserCheck, order: 4, allowTransitionTo: ['ARCHIVED'],   allowTransitionFrom: ['NOTIFIED'] },
    ARCHIVED:  { key: 'ARCHIVED',  label: 'Archivé',  description: 'Commande terminée et archivée',   colorClass: 'bg-gray-600',   icon: Archive,   order: 5, allowTransitionTo: [],           allowTransitionFrom: ['PICKED_UP'] }
};


const ORDER_STATUSES_ARRAY = Object.values(ORDER_STATUSES_CONFIG).sort((a, b) => a.order - b.order);

// Fonction pour extraire et capitaliser le prénom depuis l'email
const getUserDisplayName = (email) => {
    if (!email) return 'N/A';
    if (email === ADMIN_EMAIL) return 'Jullien';
    const namePart = email.split('@')[0].split('.')[0];
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
};


// =================================================================
// COMPOSANTS DE L'INTERFACE UTILISATEUR (UI)
// =================================================================

const AnimationStyles = () => ( <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}.animate-fade-in{animation:fadeIn .5s ease-in-out}@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.animate-fade-in-up{animation:fadeInUp .5s ease-out forwards}.tooltip{position:absolute;top:100%;left:50%;transform:translateX(-50%);padding:8px 12px;background-color:rgba(45,55,72,.9);color:#fff;border-radius:8px;font-size:14px;white-space:pre-wrap;z-index:50;opacity:0;visibility:hidden;transition:opacity .2s ease-in-out,visibility .2s ease-in-out;box-shadow:0 4px 10px rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.1)}.group:hover .tooltip{opacity:1;visibility:visible}.custom-scrollbar::-webkit-scrollbar{width:8px}.custom-scrollbar::-webkit-scrollbar-track{background:#374151;border-radius:10px}.custom-scrollbar::-webkit-scrollbar-thumb{background:#60A5FA;border-radius:10px}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:#3B82F6}`}</style> );
const Tooltip = ({ children, text }) => ( <div className="relative inline-block group">{children}{text && (<div className="tooltip">{text}</div>)}</div> );
const Toast = ({ message, type, onClose }) => { const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500'; const Icon = type === 'success' ? Check : AlertTriangle; return ( <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 p-4 rounded-lg shadow-lg text-white flex items-center gap-3 z-[999] ${bgColor} animate-fade-in-up`}><Icon size={24} /><span>{message}</span><button onClick={onClose} className="ml-2 text-white/80 hover:text-white transition-colors"><X size={20} /></button></div> ); };
const OrderForm = ({ onSave, initialData, isSaving, onClose }) => { const [clientFirstName, setClientFirstName] = useState(initialData?.clientFirstName || ''); const [clientLastName, setClientLastName] = useState(initialData?.clientLastName || ''); const [clientEmail, setClientEmail] = useState(initialData?.clientEmail || ''); const [clientPhone, setClientPhone] = useState(initialData?.clientPhone || ''); const [receiptNumber, setReceiptNumber] = useState(initialData?.receiptNumber || ''); const [items, setItems] = useState(initialData?.items && initialData.items.length > 0 ? initialData.items : [{ itemName: '', quantity: '' }]); const [orderNotes, setOrderNotes] = useState(initialData?.orderNotes || ''); const [formError, setFormError] = useState(null); const handleItemChange = useCallback((index, field, value) => { const newItems = [...items]; newItems[index][field] = value; setItems(newItems); }, [items]); const handleAddItem = useCallback(() => { setItems([...items, { itemName: '', quantity: '' }]); }, [items]); const handleRemoveItem = useCallback((index) => { const newItems = items.filter((_, i) => i !== index); setItems(newItems); }, [items]); const handleSubmit = useCallback(async (e) => { e.preventDefault(); setFormError(null); if (!clientFirstName || !clientLastName) { setFormError("Veuillez remplir le prénom et le nom du client."); return; } const validItems = items.filter(item => item.itemName.trim() && parseInt(item.quantity, 10) > 0); if (validItems.length === 0) { setFormError("Veuillez ajouter au moins un article valide (Nom de l'accessoire et Quantité > 0)."); return; } try { await onSave({ clientFirstName: clientFirstName.trim(), clientLastName: clientLastName.trim(), clientEmail: clientEmail.trim(), clientPhone: clientPhone.trim(), receiptNumber: receiptNumber.trim(), items: validItems.map(item => ({ itemName: item.itemName.trim(), quantity: parseInt(item.quantity, 10) })), orderNotes: orderNotes.trim(), }); onClose(); } catch (error) { console.error("Error saving order:", error); setFormError("Échec de l'enregistrement de la commande. Veuillez réessayer."); } }, [clientFirstName, clientLastName, clientEmail, clientPhone, receiptNumber, items, orderNotes, onSave, onClose]); return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh] md:max-h-[80vh] custom-scrollbar" onClick={(e) => e.stopPropagation()}><button onClick={onClose} aria-label="Fermer le formulaire" className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"><X size={24} /></button><h2 className="text-2xl font-bold text-white mb-6 text-center">{initialData ? 'Modifier la commande' : 'Nouvelle Commande d\'Accessoire'}</h2><form onSubmit={handleSubmit} className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label htmlFor="clientFirstName" className="block text-sm font-medium text-gray-300 mb-2">Prénom client *</label><input id="clientFirstName" type="text" value={clientFirstName} onChange={(e) => setClientFirstName(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><div><label htmlFor="clientLastName" className="block text-sm font-medium text-gray-300 mb-2">Nom client *</label><input id="clientLastName" type="text" value={clientLastName} onChange={(e) => setClientLastName(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div></div><div><label htmlFor="clientEmail" className="block text-sm font-medium text-gray-300 mb-2">Email client (optionnel)</label><input id="clientEmail" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><div><label htmlFor="clientPhone" className="block text-sm font-medium text-gray-300 mb-2">Téléphone client (optionnel)</label><input id="clientPhone" type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><hr className="border-gray-700" /><h3 className="text-xl font-semibold text-white mb-4">Articles Commandés *</h3><div className="space-y-3">{items.map((item, index) => ( <div key={index} className="flex flex-col sm:flex-row items-end gap-2 bg-gray-700/50 p-3 rounded-lg"><div className="flex-grow w-full"><label htmlFor={`itemName-${index}`} className="block text-xs font-medium text-gray-400 mb-1">Article</label><input id={`itemName-${index}`} type="text" placeholder="Nom de l'accessoire" value={item.itemName} onChange={(e) => handleItemChange(index, 'itemName', e.target.value)} required className="w-full bg-gray-600 border-gray-500 text-white p-2 rounded-lg text-sm" /></div><div className="w-full sm:w-auto"><label htmlFor={`quantity-${index}`} className="block text-xs font-medium text-gray-400 mb-1">Qté</label><input id={`quantity-${index}`} type="number" placeholder="Qté" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} required className="w-full sm:w-20 bg-gray-600 border-gray-500 text-white p-2 rounded-lg text-sm" /></div>{items.length > 1 && ( <button type="button" onClick={() => handleRemoveItem(index)} className="p-2 text-red-400 hover:text-red-300 transition-colors self-end sm:self-auto"><MinusCircle size={20} /></button> )}</div> ))}</div><button type="button" onClick={handleAddItem} className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"><PlusCircle size={20} /> Ajouter un article</button><hr className="border-gray-700" /><div><label htmlFor="receiptNumber" className="block text-sm font-medium text-gray-300 mb-2">Numéro de ticket de caisse (optionnel)</label><input id="receiptNumber" type="text" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><div><label htmlFor="orderNotes" className="block text-sm font-medium text-gray-300 mb-2">Notes (optionnel)</label><textarea id="orderNotes" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows="3" className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg"></textarea></div>{formError && (<div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-lg flex items-center space-x-3"><AlertTriangle className="w-5 h-5" /><span>{formError}</span></div>)}<button type="submit" disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{isSaving ? 'Enregistrement...' : (initialData ? 'Mettre à jour la commande' : 'Passer la commande')}</button></form></div></div> ); };
const ConfirmationModal = ({ message, onConfirm, onCancel, confirmText = 'Confirmer', cancelText = 'Annuler', confirmColor = 'bg-red-600' }) => ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in"><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 animate-fade-in-up mx-4 sm:mx-0"><div className="text-center"><AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" /><h3 className="mt-4 text-xl font-medium text-white">{message}</h3></div><div className="mt-6 flex flex-col sm:flex-row justify-center gap-4"><button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto">{cancelText}</button><button onClick={onConfirm} className={`${confirmColor} hover:${confirmColor.replace('600', '700')} text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto`}>{confirmText}</button></div></div></div> );
const ConfirmationModalAdvisor = ({ message, onConfirm, onCancel, confirmText = 'Confirmer', cancelText = 'Annuler' }) => ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in"><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 animate-fade-in-up mx-4 sm:mx-0"><div className="text-center"><Info className="mx-auto h-12 w-12 text-blue-400" /><h3 className="mt-4 text-xl font-medium text-white">{message}</h3><p className="text-gray-400 text-sm mt-2">Le changement d'étape est définitif. En cas de besoin, merci de contacter un administrateur.</p></div><div className="mt-6 flex flex-col sm:flex-row justify-center gap-4"><button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto">{cancelText}</button><button onClick={onConfirm} className={`bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto`}>{confirmText}</button></div></div></div> );
const LoginForm = ({ onLogin, error, onClose }) => { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const handleSubmit = (e) => { e.preventDefault(); onLogin(email, password); }; return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 relative animate-fade-in-up mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}><button onClick={onClose} aria-label="Fermer la fenêtre de connexion" className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors"><X size={24} /></button><h2 className="text-2xl font-bold text-white mb-6 text-center">Connexion</h2><form onSubmit={handleSubmit} className="space-y-6"><div><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div><div><input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" /></div>{error && <p className="text-red-400 text-sm text-center">{error}</p>}<button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors">Se connecter</button></form></div></div> ); };
const OrderHistoryModal = ({ order, onClose }) => { return ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh] custom-scrollbar mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}><button onClick={onClose} aria-label="Fermer l'historique" className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"><X size={24} /></button><h2 className="text-2xl font-bold text-white mb-6 text-center">Historique: {order.items?.[0]?.itemName || 'Article(s)'}</h2><div className="space-y-4">{order.history && order.history.length > 0 ? (order.history.slice().reverse().map((event, index) => ( <div key={index} className="bg-gray-700 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4"><Calendar size={20} className="text-blue-400 flex-shrink-0 sm:mt-1" /><div><p className="text-white font-medium">{event.action}</p><p className="text-gray-300 text-sm">Par <span className="font-semibold">{getUserDisplayName(event.by?.email || 'N/A')}</span> le {new Date(event.timestamp).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>{event.notes && <p className="text-gray-400 text-xs italic mt-1">Notes: {event.notes}</p>}</div></div> ))) : (<p className="text-gray-400 text-center">Aucun historique disponible.</p>)}</div></div></div> ); };
const RevertStatusModal = ({ onClose, onRevert, possibleStatuses }) => ( <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}><div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 animate-fade-in-up mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}><div className="text-center"><Undo2 className="mx-auto h-12 w-12 text-blue-400" /><h3 className="mt-4 text-xl font-medium text-white">Retourner à une étape précédente ?</h3><p className="text-gray-400 text-sm mt-2">Quel statut souhaitez-vous ré-appliquer à cette commande ?</p></div><div className="mt-6 flex flex-col justify-center gap-3">{possibleStatuses.map(status => ( <button key={status.key} onClick={() => onRevert(status.label)} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full flex items-center justify-center gap-2"><status.icon size={16} />{status.label}</button> ))}<div className="mt-6 flex justify-center"><button onClick={onClose} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto">Annuler</button></div></div></div></div> );


// =================================================================
// COMPOSANT OrderCard AMÉLIORÉ
// =================================================================
const OrderCard = ({ order, onUpdateStatus, onEdit, onDelete, isAdmin, onShowHistory, onShowRevertModal }) => {
    const [isOpen, setIsOpen] = useState(false);

    const getStatusColor = (statusLabel) => {
        const statusConfig = Object.values(ORDER_STATUSES_CONFIG).find(s => s.label === statusLabel);
        return statusConfig?.colorClass || 'bg-gray-500';
    };

    const findStatusConfigByAction = (action) => {
        if (!action) return null;
        return Object.values(ORDER_STATUSES_CONFIG).find(s => s.description === action || s.label === action);
    };

    const getIconForHistoryAction = (action) => {
        if (!action) return History;
        if (action.startsWith('Retour au statut:')) return RefreshCcw;
        if (action === 'Commande modifiée') return Edit;
        const statusConfig = findStatusConfigByAction(action);
        return statusConfig?.icon || CheckCircle;
    };

    const getColorClassForHistoryAction = (action) => {
        if (!action) return 'text-gray-400';
        if (action.startsWith('Retour au statut:')) return 'text-gray-400';
        if (action === 'Commande modifiée') return 'text-purple-400';
        const statusConfig = findStatusConfigByAction(action);
        if (statusConfig && statusConfig.colorClass) {
            return statusConfig.colorClass.replace('bg-', 'text-');
        }
        return 'text-gray-400';
    };

    const getNextStatusButton = (currentStatusLabel) => {
        const currentConfig = Object.values(ORDER_STATUSES_CONFIG).find(s => s.label === currentStatusLabel);
        if (!currentConfig || currentConfig.allowTransitionTo.length === 0) return null;
        const nextStatusKey = currentConfig.allowTransitionTo[0];
        const nextStatusConfig = ORDER_STATUSES_CONFIG[nextStatusKey];
        if (!nextStatusConfig) return null;
        const nextStatusLabel = nextStatusConfig.label;
        const ButtonIcon = nextStatusConfig.icon;
        const buttonColorBase = nextStatusConfig.colorClass;
        const buttonColorHover = buttonColorBase.includes('600') ? buttonColorBase.replace('600', '700') : buttonColorBase.replace('500', '600');
        return ( <button onClick={() => onUpdateStatus(order.id, nextStatusLabel)} className={`flex-1 ${buttonColorBase} hover:${buttonColorHover} text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2`}><ButtonIcon size={18} /> Marquer "{nextStatusLabel}"</button> );
    };

    const getRevertStatusButton = () => {
        if (!isAdmin) return null;
        const currentConfig = Object.values(ORDER_STATUSES_CONFIG).find(s => s.label === order.currentStatus);
        if (!currentConfig || currentConfig.allowTransitionFrom.length === 0) return null;
        return ( <button onClick={() => onShowRevertModal(order)} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"><Undo2 size={16} /> Retour</button> );
    };
    
    const itemsSummary = order.items && order.items.length > 0
        ? `${order.items[0].itemName}${order.items.length > 1 ? ` (+ ${order.items.length - 1} autre${order.items.length > 2 ? 's' : ''})` : ''}`
        : "Aucun article";

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
                <div className="p-4 sm:p-6 border-t border-gray-700">
                    {order.clientEmail && (<p className="text-gray-300 text-sm flex items-center gap-2 mb-1"><Mail size={16} /> {order.clientEmail}</p>)}
                    {order.clientPhone && (<p className="text-gray-300 text-sm flex items-center gap-2 mb-2"><Phone size={16} /> {order.clientPhone}</p>)}
                    <hr className="border-gray-700 my-4" />
                    <h4 className="text-md font-semibold text-gray-300 mb-2">Détail des articles :</h4>
                    <ul className="list-disc list-inside text-gray-300 mb-2 pl-4">{order.items?.map((item, idx) => (<li key={idx} className="text-sm"><span className="font-semibold">{item.itemName}</span> (Qté: {item.quantity})</li>))}</ul>
                    {order.receiptNumber && (<p className="text-gray-300 text-sm flex items-center gap-2 mt-3"><ReceiptText size={16} /> <span className="font-semibold">Ticket:</span> {order.receiptNumber}</p>)}
                    {order.orderNotes && (<p className="text-gray-400 text-sm italic mt-3 break-words"><span className="font-semibold">Notes:</span> {order.orderNotes}</p>)}
                    
                    <div className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-700 space-y-2">
                        {order.history && order.history.length > 0 ? (
                            order.history.map((event, index) => {
                                const Icon = getIconForHistoryAction(event.action);
                                const colorClass = getColorClassForHistoryAction(event.action);
                                return (
                                    <div key={index} className="flex items-center">
                                        <Icon className={`mr-2 h-4 w-4 ${colorClass} flex-shrink-0`} />
                                        <p><span className="font-medium text-white">{event.action}</span> par <span className="font-medium text-white">{getUserDisplayName(event.by?.email)}</span> le {new Date(event.timestamp).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex items-center">
                                 <Package className="mr-2 h-4 w-4 text-yellow-500 flex-shrink-0" />
                                 <p>Commandé par <span className="font-medium text-white">{getUserDisplayName(order.orderedBy?.email)}</span> le {new Date(order.orderDate).toLocaleDateString('fr-FR')}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row flex-wrap gap-2 mt-4 pt-4 border-t border-gray-700">
                        {getNextStatusButton(order.currentStatus)}
                        {getRevertStatusButton()}
                        <button onClick={() => onShowHistory(order)} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 flex-1 sm:flex-none"><History size={18} /> Historique</button>
                        {isAdmin && <button onClick={() => onEdit(order)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 flex-1 sm:flex-none"><Edit size={18} /> Modifier</button>}
                        {isAdmin && <button onClick={() => onDelete(order.id)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 flex-1 sm:flex-none"><Trash2 size={18} /> Supprimer</button>}
                    </div>
                </div>
            </div>
        </div>
    );
};


// =================================================================
// COMPOSANT PRINCIPAL : App
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
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [orderToDeleteId, setOrderToDeleteId] = useState(null);
    const [showConfirmAdvisorChange, setShowConfirmAdvisorChange] = useState(false);
    const [orderToUpdateStatusAdvisor, setOrderToUpdateStatusAdvisor] = useState(null);
    const [showOrderHistory, setShowOrderHistory] = useState(false);
    const [selectedOrderForHistory, setSelectedOrderForHistory] = useState(null);
    const [showRevertModal, setShowRevertModal] = useState(false);
    const [orderToRevert, setOrderToRevert] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
    const [selectedAdvisorFilter, setSelectedAdvisorFilter] = useState('All');
    const [viewMode, setViewMode] = useState('active');

    useEffect(() => { document.title = "AOD Tracker OS"; }, []);

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
                    setIsAdmin(user.email === ADMIN_EMAIL);
                    setShowLogin(false);
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
    }, []);

    const showToast = useCallback((message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3000); }, []);
    
    useEffect(() => {
        if (!authReady || !db || !currentUser) {
            if(authReady) setIsLoading(false);
            return;
        }
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
        if (viewMode === 'active') {
            currentOrders = currentOrders.filter(order => order.currentStatus !== ORDER_STATUSES_CONFIG.ARCHIVED.label);
        } else {
            currentOrders = currentOrders.filter(order => order.currentStatus === ORDER_STATUSES_CONFIG.ARCHIVED.label);
        }
        if (selectedStatusFilter !== 'All' && viewMode === 'active') { currentOrders = currentOrders.filter(order => order.currentStatus === selectedStatusFilter); }
        if (selectedAdvisorFilter !== 'All') { currentOrders = currentOrders.filter(order => order.orderedBy?.email?.toLowerCase() === selectedAdvisorFilter.toLowerCase()); }
        if (searchTerm.trim()) { const lowerCaseSearchTerm = searchTerm.trim().toLowerCase(); currentOrders = currentOrders.filter(order => (order.clientFirstName?.toLowerCase().includes(lowerCaseSearchTerm)) || (order.clientLastName?.toLowerCase().includes(lowerCaseSearchTerm)) || (order.clientEmail?.toLowerCase().includes(lowerCaseSearchTerm)) || (order.clientPhone?.toLowerCase().includes(lowerCaseSearchTerm)) || (order.items?.some(item => item.itemName.toLowerCase().includes(lowerCaseSearchTerm))) || (order.receiptNumber?.toLowerCase().includes(lowerCaseSearchTerm)) ); }
        return currentOrders;
    }, [orders, selectedStatusFilter, selectedAdvisorFilter, searchTerm, viewMode]);

    const handleLogin = useCallback(async (email, password) => { setLoginError(null); if (!auth) { setLoginError("Service d'authentification non prêt."); return; } try { await signInWithEmailAndPassword(auth, email, password); setShowLogin(false); } catch (error) { setLoginError("Email ou mot de passe incorrect."); showToast("Échec de la connexion.", 'error'); } }, [auth, showToast]);
    const handleLogout = useCallback(() => { if(auth) signOut(auth).then(() => showToast("Déconnexion réussie.", "success")); }, [auth, showToast]);
    
    const getCurrentUserInfo = useCallback(() => {
        if (!currentUser) return null;
        return { uid: currentUser.uid, email: currentUser.email, name: getUserDisplayName(currentUser.email), role: currentUser.email === ADMIN_EMAIL ? 'admin' : 'counselor' };
    }, [currentUser]);

    const handleSaveOrder = useCallback(async (orderData) => { if (!db || !currentUser) { showToast("Vous devez être connecté.", 'error'); return; } setIsSaving(true); const userInfo = getCurrentUserInfo(); const now = new Date().toISOString(); try { if (editingOrder) { await updateDoc(doc(db, `artifacts/${APP_ID}/public/data/orders`, editingOrder.id), { ...orderData, history: [...(editingOrder.history || []), { timestamp: now, action: "Commande modifiée", by: userInfo }] }); showToast("Commande modifiée !", 'success'); } else { await addDoc(collection(db, `artifacts/${APP_ID}/public/data/orders`), { ...orderData, orderedBy: userInfo, orderDate: now, currentStatus: ORDER_STATUSES_CONFIG.ORDERED.label, history: [{ timestamp: now, action: ORDER_STATUSES_CONFIG.ORDERED.description, by: userInfo }] }); showToast("Commande ajoutée !", 'success'); } setShowOrderForm(false); setEditingOrder(null); } catch (e) { showToast("Échec de l'enregistrement.", 'error'); } finally { setIsSaving(false); } }, [db, currentUser, editingOrder, getCurrentUserInfo, showToast]);
    
    const updateOrderStatus = useCallback(async (orderId, newStatusLabel, isRevert = false) => {
        if (!db || !currentUser) return;
        setIsSaving(true);
        const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderId);
        const userInfo = getCurrentUserInfo();
        const now = new Date().toISOString();
        try {
            const orderToUpdate = orders.find(o => o.id === orderId);
            if (!orderToUpdate) throw new Error("Commande non trouvée");
            const newStatusConfig = Object.values(ORDER_STATUSES_CONFIG).find(s => s.label === newStatusLabel);
            if (!newStatusConfig) throw new Error("Nouveau statut invalide");
            const historyAction = isRevert ? `Retour au statut: ${newStatusLabel}` : newStatusConfig.description;
            let updateData = { currentStatus: newStatusLabel };
            if (newStatusLabel === ORDER_STATUSES_CONFIG.ARCHIVED.label) {
                updateData.archivedAt = now;
            }
            await updateDoc(orderRef, { ...updateData, history: [...(orderToUpdate.history || []), { timestamp: now, action: historyAction, by: userInfo }] });
            showToast(`Statut mis à jour: "${newStatusLabel}"`, 'success');
        } catch (e) { console.error(e); showToast("Échec de la mise à jour.", 'error'); } finally { setIsSaving(false); }
    }, [db, currentUser, orders, getCurrentUserInfo, showToast]);

    const handleUpdateStatus = useCallback((orderId, newStatusLabel) => {
        if (isAdmin) {
            updateOrderStatus(orderId, newStatusLabel);
        } else {
            setOrderToUpdateStatusAdvisor({ id: orderId, newStatusLabel });
            setShowConfirmAdvisorChange(true);
        }
    }, [isAdmin, updateOrderStatus]);

    const confirmAdvisorUpdateStatus = useCallback(() => {
        if (orderToUpdateStatusAdvisor) {
            updateOrderStatus(orderToUpdateStatusAdvisor.id, orderToUpdateStatusAdvisor.newStatusLabel);
        }
        setShowConfirmAdvisorChange(false);
        setOrderToUpdateStatusAdvisor(null);
    }, [orderToUpdateStatusAdvisor, updateOrderStatus]);

    const handleDeleteOrder = useCallback((id) => { setOrderToDeleteId(id); setShowConfirmDelete(true); }, []);
    const handleConfirmDelete = useCallback(async () => { if (!db || !isAdmin || !orderToDeleteId) { showToast("Action non autorisée.", 'error'); return; } setIsSaving(true); try { await deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/orders`, orderToDeleteId)); showToast("Commande supprimée.", 'success'); } catch (e) { showToast("Échec de la suppression.", 'error'); } finally { setShowConfirmDelete(false); setOrderToDeleteId(null); setIsSaving(false); } }, [db, isAdmin, orderToDeleteId, showToast]);
    
    const handleShowOrderHistory = useCallback((order) => { setSelectedOrderForHistory(order); setShowOrderHistory(true); }, []);
    const handleEditOrder = useCallback((order) => { setEditingOrder(order); setShowOrderForm(true); }, []);
    
    const handleShowRevertModal = useCallback((order) => { setOrderToRevert(order); setShowRevertModal(true); }, []);
    const handleRevertStatus = useCallback((newStatusLabel) => {
        if (!orderToRevert) return;
        updateOrderStatus(orderToRevert.id, newStatusLabel, true);
        setShowRevertModal(false);
        setOrderToRevert(null);
    }, [orderToRevert, updateOrderStatus]);

    const possibleRevertStatuses = useMemo(() => {
        if (!orderToRevert) return [];
        const currentConfig = Object.values(ORDER_STATUSES_CONFIG).find(s => s.label === orderToRevert.currentStatus);
        const prevStatusKeys = currentConfig?.allowTransitionFrom || [];
        return prevStatusKeys.map(key => ORDER_STATUSES_CONFIG[key]).filter(Boolean);
    }, [orderToRevert]);

    
    if (!authReady) { return ( <div className="bg-gray-900 min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto" /></div> ); }
    if (showLogin || !currentUser) { return ( <div className="bg-gray-900 min-h-screen flex items-center justify-center"><LoginForm onLogin={handleLogin} error={loginError} onClose={() => { if(currentUser) setShowLogin(false); }} /></div> ); }

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <AnimationStyles />
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {showConfirmDelete && ( <ConfirmationModal message="Voulez-vous vraiment supprimer cette commande ?" onConfirm={handleConfirmDelete} onCancel={() => setShowConfirmDelete(false)} /> )}
            {showConfirmAdvisorChange && ( <ConfirmationModalAdvisor message={`Confirmer le passage au statut "${orderToUpdateStatusAdvisor?.newStatusLabel}" ?`} onConfirm={confirmAdvisorUpdateStatus} onCancel={() => setShowConfirmAdvisorChange(false)} /> )}
            {showOrderHistory && selectedOrderForHistory && ( <OrderHistoryModal order={selectedOrderForHistory} onClose={() => setShowOrderHistory(false)} /> )}
            {showOrderForm && ( <OrderForm onSave={handleSaveOrder} initialData={editingOrder} isSaving={isSaving} onClose={() => { setShowOrderForm(false); setEditingOrder(null); }} /> )}
            {showRevertModal && ( <RevertStatusModal onClose={() => setShowRevertModal(false)} onRevert={handleRevertStatus} possibleStatuses={possibleRevertStatuses}/> )}

            <div className="max-w-4xl mx-auto px-2 sm:px-4 lg:px-6"> 
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">AOD Tracker OS</h1>
                        <p className="text-gray-400 mt-1 text-sm sm:text-base">Suivez vos commandes d'accessoires en temps réel.</p>
                    </div>
                    <div className="mt-4 sm:mt-0 flex flex-wrap items-center justify-end gap-2 sm:gap-4">
                        <div className="flex items-center gap-2 text-blue-300"><User size={18} /><span className="font-medium text-sm sm:text-base">Connecté :</span><span className="bg-gray-700/50 px-2 py-1 rounded-full text-xs sm:text-sm font-semibold text-white">{getCurrentUserInfo()?.name || 'Conseiller'}</span></div>
                        {isAdmin ? ( <div className="flex flex-wrap gap-2 sm:gap-4"><span className="inline-flex items-center gap-2 bg-blue-600 px-3 py-1 rounded-full text-xs sm:text-sm font-bold text-white shadow-md"><UserCheck size={16} /> Mode Admin</span><Tooltip text="Se déconnecter"><button onClick={handleLogout} aria-label="Se déconnecter" className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700"><LogOut size={22} /></button></Tooltip></div> ) : ( <Tooltip text="Se déconnecter"><button onClick={handleLogout} aria-label="Se déconnecter" className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700"><LogOut size={22} /></button></Tooltip> )}
                    </div>
                </header>
                
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 mb-6">
                    <button onClick={() => { setShowOrderForm(true); setEditingOrder(null); }} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-base"><PlusCircle size={20} /> Nouvelle Commande</button>
                    <div className="flex-grow"></div>
                    {viewMode === 'active' ? (
                        <button onClick={() => setViewMode('archived')} className="w-full sm:w-auto bg-gray-600 hover:bg-gray-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-base"><Archive size={20} /> Consulter les Archives</button>
                    ) : (
                        <button onClick={() => setViewMode('active')} className="w-full sm:w-auto bg-gray-600 hover:bg-gray-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-base"><List size={20} /> Commandes Actives</button>
                    )}
                </div>

                <div className="bg-gray-800/50 rounded-2xl p-4 mb-8">
                     <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="relative flex-grow">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-700/50 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white" />
                        </div>
                        <div className="relative"><select value={selectedStatusFilter} onChange={(e) => setSelectedStatusFilter(e.target.value)} className="bg-gray-700/50 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none pr-8 cursor-pointer w-full" disabled={viewMode === 'archived'}><option value="All">Tous les statuts</option>{ORDER_STATUSES_ARRAY.filter(s => s.key !== 'ARCHIVED').map(status => (<option key={status.key} value={status.label}>{status.label}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" /></div>
                        <div className="relative"><select value={selectedAdvisorFilter} onChange={(e) => setSelectedAdvisorFilter(e.target.value)} className="bg-gray-700/50 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none pr-8 cursor-pointer w-full"><option value="All">Tous les conseillers</option>{allUsers.map(user => (<option key={user.email} value={user.email}>{user.name}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" /></div>
                    </div>
                </div>


                {dbError && <div className="bg-red-500/20 text-red-300 p-4 rounded-lg mb-6">{dbError}</div>}
                
                {isLoading ? (
                    <div className="text-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto" /><p className="text-gray-400 mt-4">Chargement...</p></div>
                ) : filteredAndSortedOrders.length === 0 ? (
                    <div className="text-center py-10 sm:py-20 bg-gray-800 rounded-2xl"><h2 className="text-xl sm:text-2xl font-semibold text-gray-300">{viewMode === 'active' ? 'Aucune commande active trouvée' : 'Aucune commande dans les archives'}</h2><p className="text-gray-400 mt-2">{viewMode === 'active' ? 'Créez une nouvelle commande pour commencer.' : ''}</p></div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 animate-fade-in">
                        {filteredAndSortedOrders.map((order) => (
                            <OrderCard key={order.id} order={order} onUpdateStatus={handleUpdateStatus} onEdit={handleEditOrder} onDelete={handleDeleteOrder} isAdmin={isAdmin} onShowHistory={handleShowOrderHistory} onShowRevertModal={handleShowRevertModal} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
