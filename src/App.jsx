import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// Importations Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, onSnapshot, setDoc, doc, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from 'firebase/auth';

// Importations des icônes Lucide React
import {
    PlusCircle, Package, CheckCircle, Bell, Truck, History, User, Calendar, LogOut, UserCheck, LogIn, AlertTriangle, X, Info, Trash2, Edit, UserPlus, Phone, Mail, ReceiptText, Search, MinusCircle, Check, ChevronDown, RefreshCcw
} from 'lucide-react';

// =================================================================
// CONFIGURATION & CONSTANTES DE L'APPLICATION
// =================================================================

// Configuration Firebase pour l'initialisation de l'application.
// Ces valeurs sont spécifiques à votre projet Firebase.
const firebaseConfig = {
    apiKey: "AIzaSyBn-xE-Zf4JvIKKQNZBus8AvNmJLMeKPdg",
    authDomain: "aod-tracker-os.firebaseapp.com",
    projectId: "aod-tracker-os",
    storageBucket: "aod-tracker-os.appspot.com",
    messagingSenderId: "429289937311",
    appId: "1:429289937311:web:1ab993b09899afc2b245aa",
};

// ID unique de l'application, utilisé pour isoler les données dans Firestore.
// Il est récupéré depuis l'environnement ou utilise une valeur par défaut.
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-aod-app';

// Email de l'administrateur principal. Ce compte a des privilèges étendus.
const ADMIN_EMAIL = "jullien.gault@orange-store.com";

// Définition des statuts de commande : nom affichable, description, style, icône, ordre de progression,
// et transitions autorisées (vers l'avant et vers l'arrière pour les admins).
const ORDER_STATUSES_CONFIG = {
    // Statut initial: la commande est enregistrée et attend sa réception.
    ORDERED: {
        label: 'Commandé',
        description: 'La commande a été passée et est en attente de réception.',
        colorClass: 'bg-yellow-500',
        icon: Package,
        order: 1,
        allowTransitionTo: ['RECEIVED_IN_STORE', 'CANCELLED'],
        allowTransitionFrom: []
    },
    // Statut intermédiaire: l'article est arrivé en boutique.
    RECEIVED_IN_STORE: {
        label: 'Reçu en boutique',
        description: 'L\'article a été reçu en magasin et est prêt à être traité.',
        colorClass: 'bg-green-500',
        icon: Truck,
        order: 2,
        allowTransitionTo: ['CLIENT_NOTIFIED', 'CANCELLED'],
        allowTransitionFrom: ['ORDERED']
    },
    // Statut intermédiaire: le client a été informé de la disponibilité de sa commande.
    CLIENT_NOTIFIED: {
        label: 'Client prévenu',
        description: 'Le client a été informé que sa commande est disponible.',
        colorClass: 'bg-blue-500',
        icon: Bell,
        order: 3,
        allowTransitionTo: ['PICKED_UP', 'CANCELLED'],
        allowTransitionFrom: ['RECEIVED_IN_STORE']
    },
    // Statut terminal de succès: le client a retiré sa commande.
    PICKED_UP: {
        label: 'Client a retiré',
        description: 'Le client a récupéré sa commande.',
        colorClass: 'bg-purple-600',
        icon: UserCheck,
        order: 4,
        allowTransitionTo: [],
        allowTransitionFrom: ['CLIENT_NOTIFIED']
    },
    // Statut terminal d'échec ou d'annulation: la commande est annulée.
    CANCELLED: {
        label: 'Annulée',
        description: 'La commande a été annulée.',
        colorClass: 'bg-red-500',
        icon: X,
        order: 5,
        allowTransitionTo: [],
        allowTransitionFrom: ['ORDERED', 'RECEIVED_IN_STORE', 'CLIENT_NOTIFIED', 'PICKED_UP']
    }
};

// Tableau des statuts de commande triés par ordre de progression, pour faciliter l'itération.
const ORDER_STATUSES_ARRAY = Object.keys(ORDER_STATUSES_CONFIG)
    .map(key => ({ key, ...ORDER_STATUSES_CONFIG[key] }))
    .sort((a, b) => a.order - b.order);


// =================================================================
// COMPOSANTS DE L'INTERFACE UTILISATEUR (UI)
// =================================================================

// Styles d'animation pour les transitions fluides
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
      /* Custom scrollbar for modals */
      .custom-scrollbar::-webkit-scrollbar {
        width: 8px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: #374151; /* gray-700 */
        border-radius: 10px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #60A5FA; /* blue-400 */
        border-radius: 10px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #3B82F6; /* blue-500 */
      }
    `}</style>
);

// Composant Tooltip pour afficher des informations au survol
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

// Composant Toast pour les notifications temporaires
const Toast = ({ message, type, onClose }) => {
    const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    const Icon = type === 'success' ? Check : AlertTriangle;

    return (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 p-4 rounded-lg shadow-lg text-white flex items-center gap-3 z-[999] ${bgColor} animate-fade-in-up`}>
            <Icon size={24} />
            <span>{message}</span>
            <button onClick={onClose} className="ml-2 text-white/80 hover:text-white transition-colors">
                <X size={20} />
            </button>
        </div>
    );
};

// Formulaire pour créer ou modifier une commande
const OrderForm = ({ onSave, initialData, isSaving, onClose }) => {
    const [clientFirstName, setClientFirstName] = useState(initialData?.clientFirstName || '');
    const [clientLastName, setClientLastName] = useState(initialData?.clientLastName || '');
    const [clientEmail, setClientEmail] = useState(initialData?.clientEmail || '');
    const [clientPhone, setClientPhone] = useState(initialData?.clientPhone || '');
    const [receiptNumber, setReceiptNumber] = useState(initialData?.receiptNumber || '');
    const [items, setItems] = useState(initialData?.items && initialData.items.length > 0 ? initialData.items : [{ itemName: '', quantity: '' }]);
    const [orderNotes, setOrderNotes] = useState(initialData?.orderNotes || '');
    const [formError, setFormError] = useState(null);

    // Gère les changements sur les champs d'un article
    const handleItemChange = useCallback((index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    }, [items]);

    // Ajoute un nouvel article au formulaire
    const handleAddItem = useCallback(() => {
        setItems([...items, { itemName: '', quantity: '' }]);
    }, [items]);

    // Supprime un article du formulaire
    const handleRemoveItem = useCallback((index) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    }, [items]);

    // Gère la soumission du formulaire de commande
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        setFormError(null);

        if (!clientFirstName || !clientLastName) {
            setFormError("Veuillez remplir le prénom et le nom du client.");
            return;
        }

        const validItems = items.filter(item => item.itemName.trim() && parseInt(item.quantity, 10) > 0);
        if (validItems.length === 0) {
            setFormError("Veuillez ajouter au moins un article valide (Nom de l'accessoire et Quantité > 0).");
            return;
        }

        try {
            await onSave({
                clientFirstName: clientFirstName.trim(),
                clientLastName: clientLastName.trim(),
                clientEmail: clientEmail.trim(),
                clientPhone: clientPhone.trim(),
                receiptNumber: receiptNumber.trim(),
                items: validItems.map(item => ({ itemName: item.itemName.trim(), quantity: parseInt(item.quantity, 10) })),
                orderNotes: orderNotes.trim(),
            });
            onClose();
        } catch (error) {
            console.error("Error saving order:", error);
            setFormError("Échec de l'enregistrement de la commande. Veuillez réessayer.");
        }
    }, [clientFirstName, clientLastName, clientEmail, clientPhone, receiptNumber, items, orderNotes, onSave, onClose]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh] md:max-h-[80vh] custom-scrollbar" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} aria-label="Fermer le formulaire" className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={24} />
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 text-center">{initialData ? 'Modifier la commande' : 'Nouvelle Commande d\'Accessoire'}</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> {/* Changed to 1 column on small screens, 2 on sm and up */}
                        <div>
                            <label htmlFor="clientFirstName" className="block text-sm font-medium text-gray-300 mb-2">Prénom client *</label>
                            <input id="clientFirstName" type="text" value={clientFirstName} onChange={(e) => setClientFirstName(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                        </div>
                        <div>
                            <label htmlFor="clientLastName" className="block text-sm font-medium text-gray-300 mb-2">Nom client *</label>
                            <input id="clientLastName" type="text" value={clientLastName} onChange={(e) => setClientLastName(e.target.value)} required className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="clientEmail" className="block text-sm font-medium text-gray-300 mb-2">Email client (optionnel)</label>
                        <input id="clientEmail" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                    </div>
                    <div>
                        <label htmlFor="clientPhone" className="block text-sm font-medium text-gray-300 mb-2">Téléphone client (optionnel)</label>
                        <input id="clientPhone" type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
                    </div>
                    <hr className="border-gray-700" />

                    <h3 className="text-xl font-semibold text-white mb-4">Articles Commandés *</h3>
                    <div className="space-y-3">
                        {items.map((item, index) => (
                            <div key={index} className="flex flex-col sm:flex-row items-end gap-2 bg-gray-700/50 p-3 rounded-lg"> {/* Changed to column on small, row on sm and up */}
                                <div className="flex-grow w-full"> {/* Added w-full for small screens */}
                                    <label htmlFor={`itemName-${index}`} className="block text-xs font-medium text-gray-400 mb-1">Article</label>
                                    <input
                                        id={`itemName-${index}`}
                                        type="text"
                                        placeholder="Nom de l'accessoire"
                                        value={item.itemName}
                                        onChange={(e) => handleItemChange(index, 'itemName', e.target.value)}
                                        required
                                        className="w-full bg-gray-600 border-gray-500 text-white p-2 rounded-lg text-sm"
                                    />
                                </div>
                                <div className="w-full sm:w-auto"> {/* Adjusted width for quantity on small screens */}
                                    <label htmlFor={`quantity-${index}`} className="block text-xs font-medium text-gray-400 mb-1">Qté</label>
                                    <input
                                        id={`quantity-${index}`}
                                        type="number"
                                        placeholder="Qté"
                                        value={item.quantity}
                                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                        required
                                        className="w-full sm:w-20 bg-gray-600 border-gray-500 text-white p-2 rounded-lg text-sm"
                                    />
                                </div>
                                {items.length > 1 && (
                                    <button type="button" onClick={() => handleRemoveItem(index)} className="p-2 text-red-400 hover:text-red-300 transition-colors self-end sm:self-auto"> {/* Aligned to end on small screens */}
                                        <MinusCircle size={20} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={handleAddItem} className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                        <PlusCircle size={20} /> Ajouter un article
                    </button>
                    
                    <hr className="border-gray-700" />
                    <div>
                        <label htmlFor="receiptNumber" className="block text-sm font-medium text-gray-300 mb-2">Numéro de ticket de caisse (optionnel)</label>
                        <input id="receiptNumber" type="text" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg" />
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

// Composant pour afficher une carte de commande individuelle
const OrderCard = ({ order, onUpdateStatus, onEdit, onDelete, isAdmin, onShowHistory, advisorsMap, onRevertStatus }) => {
    // Détermine la couleur du badge de statut
    const getStatusColor = (statusLabel) => {
        const statusConfig = Object.values(ORDER_STATUSES_CONFIG).find(s => s.label === statusLabel);
        return statusConfig?.colorClass || 'bg-gray-500';
    };

    // Aide pour obtenir le nom d'affichage à partir de l'email
    const getDisplayName = (email) => {
        return advisorsMap[email.toLowerCase()]?.name || email;
    };

    // Obtient la configuration du bouton pour le prochain statut
    const getNextStatusButton = (currentStatusLabel) => {
        // Trouvez la clé du statut actuel pour accéder à sa configuration
        const currentStatusKey = Object.keys(ORDER_STATUSES_CONFIG).find(key => ORDER_STATUSES_CONFIG[key].label === currentStatusLabel);
        const currentConfig = ORDER_STATUSES_CONFIG[currentStatusKey];

        // Un conseiller peut avancer, un admin aussi (mais l'admin a d'autres options)
        if (!currentConfig || currentConfig.allowTransitionTo.length === 0) {
            return null;
        }

        // Pour l'instant, on prend le premier statut dans allowTransitionTo, comme dans votre logique originale.
        const nextStatusKey = currentConfig.allowTransitionTo[0];
        const nextStatusConfig = ORDER_STATUSES_CONFIG[nextStatusKey];

        // Ne pas proposer l'annulation comme "prochain statut" ici si un bouton d'annulation existe déjà
        if (!nextStatusConfig || nextStatusConfig.key === 'CANCELLED') {
             return null;
        }
        
        const nextStatusLabel = nextStatusConfig.label;
        const ButtonIcon = nextStatusConfig.icon;
        // Extrait la couleur de base et construit une version foncée pour le hover
        const buttonColorBase = nextStatusConfig.colorClass.replace('bg-', 'bg-');
        const buttonColorHover = buttonColorBase.replace(/\d+$/, num => parseInt(num, 10) + 100); // Ex: bg-green-500 -> bg-green-600


        return (
            <button
                onClick={() => onUpdateStatus(order.id, nextStatusLabel)} // Passez le label du nouveau statut
                className={`flex-1 ${buttonColorBase} hover:${buttonColorHover} text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2`}
            >
                <ButtonIcon size={18} /> Marquer "{nextStatusLabel}"
            </button>
        );
    };

    // Boutons de retour de statut pour l'admin
    const getRevertStatusButtons = (currentStatusLabel) => {
        if (!isAdmin) return null;

        const currentStatusKey = Object.keys(ORDER_STATUSES_CONFIG).find(key => ORDER_STATUSES_CONFIG[key].label === currentStatusLabel);
        const currentConfig = ORDER_STATUSES_CONFIG[currentStatusKey];

        if (!currentConfig || currentConfig.allowTransitionFrom.length === 0) {
            return null;
        }

        return (
            <div className="relative group">
                <button
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                >
                    <RefreshCcw size={18} /> Revenir à...
                </button>
                <div className="absolute left-0 bottom-full mb-2 w-48 bg-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                    {currentConfig.allowTransitionFrom.map(prevStatusKey => {
                        const prevStatusConfig = ORDER_STATUSES_CONFIG[prevStatusKey];
                        if (!prevStatusConfig) return null;
                        return (
                            <button
                                key={prevStatusKey}
                                onClick={() => onRevertStatus(order.id, prevStatusConfig.label)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 rounded-lg flex items-center gap-2"
                            >
                                <prevStatusConfig.icon size={16} /> {prevStatusConfig.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg flex flex-col transition-all duration-300 hover:shadow-2xl hover:scale-[1.01] hover:shadow-blue-500/10 hover:ring-2 hover:ring-blue-500/50 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4"> {/* Added flex-col for small screens */}
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">
                        <span className="text-blue-200">{order.clientFirstName} {order.clientLastName}</span>
                    </h3>
                    <p className="text-gray-400 text-sm mb-2">
                        Commandé le {new Date(order.orderDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold text-white ${getStatusColor(order.currentStatus)} mt-2 sm:mt-0`}> {/* Added margin top for small screens */}
                    {order.currentStatus}
                </span>
            </div>

            {order.clientEmail && (
                <p className="text-gray-300 text-sm flex items-center gap-2 mb-1">
                    <Mail size={16} /> {order.clientEmail}
                </p>
            )}
            {order.clientPhone && (
                <p className="text-gray-300 text-sm flex items-center gap-2 mb-2">
                    <Phone size={16} /> {order.clientPhone}
                </p>
            )}

            <hr className="border-gray-700 my-2" />
            
            <h4 className="text-md font-semibold text-gray-300 mb-2">Articles :</h4>
            <ul className="list-disc list-inside text-gray-300 mb-2 pl-4">
                {order.items && order.items.map((item, idx) => (
                    <li key={idx} className="text-sm">
                        <span className="font-semibold">{item.itemName}</span> (Qté: {item.quantity})
                    </li>
                ))}
            </ul>

            {order.receiptNumber && (
                <p className="text-gray-300 text-sm flex items-center gap-2 mb-2">
                    <ReceiptText size={16} /> <span className="font-semibold">Ticket:</span> {order.receiptNumber}
                </p>
            )}
            {order.orderNotes && (
                <p className="text-gray-400 text-sm italic mb-3 break-words">
                    <span className="font-semibold">Notes:</span> {order.orderNotes}
                </p>
            )}

            <div className="text-sm text-gray-400 mt-auto pt-3 border-t border-gray-700">
                <p className="flex items-center gap-2 mb-1">
                    <User size={16} /> Commandé par <span className="font-medium text-white">{getDisplayName(order.orderedBy?.email || 'N/A')}</span>
                </p>
                {/* Affichage conditionnel des informations de statut : corrigé ici */}
                {order.receivedBy && order.receptionDate && ORDER_STATUSES_CONFIG.RECEIVED_IN_STORE.order <= (ORDER_STATUSES_ARRAY.find(s => s.label === order.currentStatus)?.order || 0) && (
                    <p className="flex items-center gap-2 mb-1">
                        <CheckCircle size={16} className="text-green-400" /> Reçu par <span className="font-medium text-white">{getDisplayName(order.receivedBy?.email || 'N/A')}</span>
                        le {new Date(order.receptionDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
                {order.notifiedBy && order.notificationDate && ORDER_STATUSES_CONFIG.CLIENT_NOTIFIED.order <= (ORDER_STATUSES_ARRAY.find(s => s.label === order.currentStatus)?.order || 0) && (
                    <p className="flex items-center gap-2 mb-1">
                        <Bell size={16} className="text-blue-400" /> Client prévenu par <span className="font-medium text-white">{getDisplayName(order.notifiedBy?.email || 'N/A')}</span>
                        le {new Date(order.notificationDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
                {order.pickedUpBy && order.pickedUpDate && ORDER_STATUSES_CONFIG.PICKED_UP.order <= (ORDER_STATUSES_ARRAY.find(s => s.label === order.currentStatus)?.order || 0) && (
                    <p className="flex items-center gap-2">
                        <UserCheck size={16} className="text-purple-400" /> Retiré par <span className="font-medium text-white">{getDisplayName(order.pickedUpBy?.email || 'N/A')}</span>
                        le {new Date(order.pickedUpDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap gap-2 mt-4 pt-4 border-t border-gray-700"> {/* Changed to flex-col on small screens, wrap on sm and up */}
                {getNextStatusButton(order.currentStatus)}
                {isAdmin && order.currentStatus !== ORDER_STATUSES_CONFIG.CANCELLED.label && (
                    <>
                        <button
                            onClick={() => onEdit(order)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 w-full sm:w-auto" {/* Added w-full for small screens */}
                        >
                            <Edit size={18} /> Modifier
                        </button>
                        <button
                            onClick={() => onDelete(order.id)}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 w-full sm:w-auto" {/* Added w-full for small screens */}
                        >
                            <Trash2 size={18} /> Supprimer
                        </button>
                    </>
                )}
                {getRevertStatusButtons(order.currentStatus)}
                <button
                    onClick={() => onShowHistory(order)}
                    className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 w-full sm:w-auto" {/* Added w-full for small screens */}
                >
                    <History size={18} /> Historique
                </button>
            </div>
        </div>
    );
};


// Modale pour afficher l'historique d'une commande
const OrderHistoryModal = ({ order, onClose, advisorsMap }) => {
    // Aide pour obtenir le nom d'affichage à partir de l'email
    const getDisplayName = (email) => {
        return advisorsMap[email.toLowerCase()]?.name || email;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh] custom-scrollbar mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}> {/* Added horizontal margin for small screens */}
                <button onClick={onClose} aria-label="Fermer l'historique" className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={24} />
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 text-center">Historique de la commande: {order.items?.[0]?.itemName || 'Article(s)'}</h2>
                <div className="space-y-4">
                    {order.history && order.history.length > 0 ? (
                        order.history.map((event, index) => (
                            <div key={index} className="bg-gray-700 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4"> {/* Adjusted for small screens */}
                                <Calendar size={20} className="text-blue-400 flex-shrink-0 sm:mt-1" />
                                <div>
                                    <p className="text-white font-medium">{event.action}</p>
                                    <p className="text-gray-300 text-sm">
                                        Par <span className="font-semibold">{getDisplayName(event.by?.email || 'N/A')}</span> le {new Date(event.timestamp).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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

// Composant de modale de confirmation pour les actions critiques (Admin)
const ConfirmationModal = ({ message, onConfirm, onCancel, confirmText = 'Confirmer', cancelText = 'Annuler', confirmColor = 'bg-red-600' }) => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 animate-fade-in-up mx-4 sm:mx-0"> {/* Added horizontal margin for small screens */}
            <div className="text-center">
                <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
                <h3 className="mt-4 text-xl font-medium text-white">{message}</h3>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row justify-center gap-4"> {/* Changed to column on small, row on sm and up */}
                <button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto">{cancelText}</button>
                <button onClick={onConfirm} className={`${confirmColor} hover:${confirmColor.replace('600', '700')} text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto`}>{confirmText}</button>
            </div>
        </div>
    </div>
);

// Nouvelle modale de confirmation pour les conseillers
const ConfirmationModalAdvisor = ({ message, onConfirm, onCancel, confirmText = 'Confirmer', cancelText = 'Annuler' }) => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 animate-fade-in-up mx-4 sm:mx-0"> {/* Added horizontal margin for small screens */}
            <div className="text-center">
                <Info className="mx-auto h-12 w-12 text-blue-400" />
                <h3 className="mt-4 text-xl font-medium text-white">{message}</h3>
                <p className="text-gray-400 text-sm mt-2">Le changement d'étape est définitif. En cas de besoin, merci de contacter un administrateur.</p>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row justify-center gap-4"> {/* Changed to column on small, row on sm and up */}
                <button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto">{cancelText}</button>
                <button onClick={onConfirm} className={`bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full sm:w-auto`}>{confirmText}</button>
            </div>
        </div>
    </div>
);


// Composant de formulaire de connexion
const LoginForm = ({ onLogin, error, onClose }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onLogin(email, password); };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 relative animate-fade-in-up mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}> {/* Added horizontal margin for small screens */}
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

// Composant de gestion des conseillers (nouvelle fonctionnalité)
const AdvisorManagementForm = ({ db, auth, appId, advisors, onSaveAdvisor, onDeleteAdvisor, onClose, isAdmin, adminEmail }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('counselor');
    const [editAdvisorId, setEditAdvisorId] = useState(null);
    const [formError, setFormError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Placeholder pour la fonction showToast du composant parent
    const showToast = useCallback((message, type) => {
        // Cette fonction sera remplacée par le vrai showToast du composant App via une prop
        // Pour l'instant, elle se contente d'afficher dans la console.
        console.log(`Toast (${type}): ${message}`);
    }, []);

    // Gère l'ajout ou la mise à jour d'un conseiller
    const handleAddUpdateAdvisor = async (e) => {
        e.preventDefault();
        setFormError(null);
        if (!name.trim() || !email.trim() || (!editAdvisorId && !password.trim())) {
            setFormError("Le nom, l'email et le mot de passe (pour un nouvel utilisateur) du conseiller sont obligatoires.");
            return;
        }
        if (!email.includes('@')) {
            setFormError("L'email n'est pas valide.");
            return;
        }
        setIsSaving(true);
        try {
            if (!editAdvisorId) { // Création d'un nouvel utilisateur dans Firebase Auth
                const createdUserCredential = await createUserWithEmailAndPassword(auth, email, password);

                // Sauvegarde du profil du conseiller dans Firestore
                await onSaveAdvisor({
                    id: email.toLowerCase(), // L'ID du document Firestore sera l'email
                    name: name.trim(),
                    email: email.trim().toLowerCase(),
                    role: role,
                });

                // Déconnexion immédiate du nouvel utilisateur (pour éviter le "cafouillage")
                await auth.signOut();

                setFormError(null);
                setName(''); setEmail(''); setPassword(''); setRole('counselor'); setEditAdvisorId(null);
                showToast("Conseiller créé. Veuillez vous reconnecter en tant qu'administrateur.", 'success');
                onClose(); // Ferme la modale
            } else { // Modification d'un conseiller existant
                await onSaveAdvisor({
                    id: editAdvisorId,
                    name: name.trim(),
                    email: email.trim().toLowerCase(),
                    role: role,
                });
                setFormError(null);
                setName(''); setEmail(''); setPassword(''); setRole('counselor'); setEditAdvisorId(null);
                showToast("Conseiller modifié avec succès !", 'success');
            }
        } catch (error) {
            console.error("Error adding/updating advisor:", error);
            let errorMessage = "Échec de l'enregistrement du conseiller.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "Cet email est déjà utilisé pour un autre compte.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "Le mot de passe est trop faible (minimum 6 caractères).";
            } else if (error.message) {
                errorMessage = error.message;
            }
            setFormError(`Erreur : ${errorMessage}`);
            showToast(`Échec de l'opération : ${errorMessage}`, 'error');

            // Si une erreur s'est produite lors de la création et qu'un nouvel utilisateur a été partiellement créé,
            // tentez de le déconnecter pour éviter le "cafouillage".
            if (!editAdvisorId && auth.currentUser && auth.currentUser.email === email.trim().toLowerCase()) {
                await auth.signOut().catch(e => console.error("Error signing out after partial creation:", e));
            }

        } finally {
            setIsSaving(false);
        }
    };

    // Gère le clic sur le bouton d'édition
    const handleEditClick = (advisor) => {
        setName(advisor.name);
        setEmail(advisor.email);
        setRole(advisor.role || 'counselor');
        setPassword('');
        setEditAdvisorId(advisor.id);
    };

    // Gère l'annulation de l'édition
    const handleCancelEdit = () => {
        setName('');
        setEmail('');
        setPassword('');
        setRole('counselor');
        setEditAdvisorId(null);
        setFormError(null);
    };

    // Gère la suppression d'un conseiller
    const handleDeleteClick = async (advisor) => {
        if (advisor.email === adminEmail) {
            setFormError("Vous ne pouvez pas supprimer le compte administrateur principal.");
            showToast("Impossible de supprimer le compte admin principal.", 'error');
            return;
        }
        if (window.confirm(`Êtes-vous sûr de vouloir supprimer le conseiller ${advisor.name} (${advisor.email})? Cette action est irréversible et supprime le profil du conseiller. Pour des raisons de sécurité côté client, cela ne supprime PAS le compte d'authentification Firebase associé. Vous devrez le faire manuellement dans la console Firebase Auth.`)) {
             setIsSaving(true);
             try {
                 await onDeleteAdvisor(advisor.id); // Supprime le profil Firestore
                 showToast("Conseiller supprimé de la liste. Pensez à supprimer le compte Auth manuellement.", 'success');
             } catch (error) {
                 setFormError(`Erreur lors de la suppression: ${error.message}`);
                 showToast("Échec de la suppression du conseiller.", 'error');
             } finally {
                 setIsSaving(false);
             }
           }
    };

    if (!isAdmin) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in">
                <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 animate-fade-in-up mx-4 sm:mx-0"> {/* Added horizontal margin for small screens */}
                    <p className="text-red-400 text-center">Accès refusé. Seul l'administrateur peut gérer les conseillers.</p>
                    <button onClick={onClose} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg">Fermer</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-3xl border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh] custom-scrollbar mx-4 sm:mx-0" onClick={(e) => e.stopPropagation()}> {/* Added horizontal margin for small screens */}
                <button onClick={onClose} aria-label="Fermer la gestion des conseillers" className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={24} />
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 text-center">Gérer les Conseillers</h2>

                <form onSubmit={handleAddUpdateAdvisor} className="space-y-4 mb-8 p-4 bg-gray-700 rounded-lg">
                    <h3 className="text-xl font-semibold text-white mb-4">{editAdvisorId ? 'Modifier un conseiller' : 'Ajouter un nouveau conseiller'}</h3>
                    <div>
                        <label htmlFor="advisorName" className="block text-sm font-medium text-gray-300 mb-1">Nom du conseiller *</label>
                        <input id="advisorName" type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-gray-600 border border-gray-500 text-white p-2 rounded-lg" />
                    </div>
                    <div>
                        <label htmlFor="advisorEmail" className="block text-sm font-medium text-gray-300 mb-1">Email du conseiller *</label>
                        <input id="advisorEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-gray-600 border border-gray-500 text-white p-2 rounded-lg" readOnly={!!editAdvisorId} />
                    </div>
                    {!editAdvisorId && (
                        <div>
                            <label htmlFor="advisorPassword" className="block text-sm font-medium text-gray-300 mb-1">Mot de passe (temporaire) *</label>
                            <input id="advisorPassword" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-gray-600 border border-gray-500 text-white p-2 rounded-lg" />
                            <p className="text-xs text-gray-400 mt-1">Min. 6 caractères. Le conseiller pourra le changer plus tard.</p>
                        </div>
                    )}
                    <div>
                        <label htmlFor="advisorRole" className="block text-sm font-medium text-gray-300 mb-1">Rôle *</label>
                        <div className="relative">
                            <select
                                id="advisorRole"
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-lg appearance-none pr-8 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                            >
                                <option value="counselor">Conseiller</option>
                                <option value="admin">Admin</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    {formError && <p className="text-red-400 text-sm">{formError}</p>}
                    <div className="flex flex-col sm:flex-row gap-4"> {/* Changed to column on small, row on sm and up */}
                        <button type="submit" disabled={isSaving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            {isSaving ? 'Enregistrement...' : (editAdvisorId ? 'Mettre à jour' : 'Ajouter')}
                        </button>
                        {editAdvisorId && (
                            <button type="button" onClick={handleCancelEdit} className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition-colors">
                                Annuler
                            </button>
                        )}
                    </div>
                </form>

                <div>
                    <h3 className="text-xl font-semibold text-white mb-4">Liste des Conseillers</h3>
                    {advisors.length === 0 ? (
                        <p className="text-gray-400 text-center">Aucun conseiller enregistré.</p>
                    ) : (
                        <ul className="space-y-3">
                            {advisors.map((advisor) => (
                                <li key={advisor.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-700/50 p-3 rounded-lg"> {/* Adjusted for small screens */}
                                    <div>
                                        <p className="font-medium text-white">{advisor.name}</p>
                                        <p className="text-sm text-gray-400">{advisor.email} (<span className="capitalize">{advisor.role}</span>)</p>
                                    </div>
                                    <div className="flex gap-2 mt-2 sm:mt-0"> {/* Added margin top for small screens */}
                                        <button onClick={() => handleEditClick(advisor)} className="text-blue-400 hover:text-blue-300 transition-colors">
                                            <Edit size={20} />
                                        </button>
                                        <button onClick={() => handleDeleteClick(advisor)} className="text-red-400 hover:text-red-300 transition-colors" disabled={advisor.email === adminEmail}>
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
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

    const [showConfirmCancel, setShowConfirmCancel] = useState(false);
    const [orderToCancelId, setOrderToCancelId] = useState(null);

    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [orderToDeleteId, setOrderToDeleteId] = useState(null);
    
    // Nouveaux états pour la confirmation conseiller
    const [showConfirmAdvisorChange, setShowConfirmAdvisorChange] = useState(false);
    const [orderToUpdateStatusAdvisor, setOrderToUpdateStatusAdvisor] = useState(null); // { id, newStatusLabel }

    const [showOrderHistory, setShowOrderHistory] = useState(false);
    const [selectedOrderForHistory, setSelectedOrderForHistory] = useState(null);
    const [showAdvisorManagement, setShowAdvisorManagement] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
    const [selectedAdvisorFilter, setSelectedAdvisorFilter] = useState('All');
    const [sortOrder, setSortOrder] = useState('orderDateDesc');
    
    const [toast, setToast] = useState(null);

    // Mettre à jour le titre de la page pour "AOD Tracker OS"
    useEffect(() => {
        document.title = "AOD Tracker OS";
    }, []);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        const timer = setTimeout(() => {
            setToast(null);
        }, 3000);
        return () => clearTimeout(timer);
    }, []);


    const advisorsMap = useMemo(() => {
        return advisors.reduce((acc, advisor) => {
            acc[advisor.email.toLowerCase()] = advisor;
            return acc;
        }, {});
    }, [advisors]);

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
                    const userProfile = advisorsMap[user.email?.toLowerCase()];
                    // Détermine si l'utilisateur est admin (email principal ou rôle admin)
                    // ou si c'est un conseiller (n'est pas admin et a un rôle 'counselor' ou par défaut)
                    setIsAdmin(user.email === ADMIN_EMAIL || userProfile?.role === 'admin');
                    setShowLogin(false);
                    setAuthReady(true);
                } else {
                    setCurrentUser(null);
                    setIsAdmin(false);
                    setAuthReady(true);
                    setShowLogin(true);
                    setIsLoading(false);
                }
            });
            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase initialization error:", e);
            setDbError("Configuration Firebase invalide.");
            setIsLoading(false);
        }
    }, [advisorsMap]);

    useEffect(() => {
        if (!authReady || !db) return;

        const advisorsColRef = collection(db, `artifacts/${APP_ID}/public/data/advisors`);
        const unsubscribe = onSnapshot(advisorsColRef,
            async (snapshot) => {
                const fetchedAdvisors = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setAdvisors(fetchedAdvisors);
            },
            (err) => {
                console.error("Error fetching advisors:", err);
                setDbError("Impossible de charger les conseillers. Vérifiez les règles de sécurité Firestore.");
            }
        );
        return () => unsubscribe();
    }, [authReady, db]);

    useEffect(() => {
        if (!authReady || !db || !currentUser) return;

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
    }, [authReady, db, currentUser]);

    const filteredAndSortedOrders = useMemo(() => {
        let currentOrders = [...orders];

        if (selectedStatusFilter !== 'All') {
            currentOrders = currentOrders.filter(order => order.currentStatus === selectedStatusFilter);
        }

        if (selectedAdvisorFilter !== 'All') {
            currentOrders = currentOrders.filter(order =>
                order.orderedBy && order.orderedBy.email && order.orderedBy.email.toLowerCase() === selectedAdvisorFilter.toLowerCase()
            );
        }

        if (searchTerm.trim()) {
            const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
            currentOrders = currentOrders.filter(order =>
                (order.clientFirstName && order.clientFirstName.toLowerCase().includes(lowerCaseSearchTerm)) ||
                (order.clientLastName && order.clientLastName.toLowerCase().includes(lowerCaseSearchTerm)) ||
                (order.clientEmail && order.clientEmail.toLowerCase().includes(lowerCaseSearchTerm)) ||
                (order.clientPhone && order.clientPhone.toLowerCase().includes(lowerCaseSearchTerm)) ||
                (order.items && order.items.some(item => item.itemName.toLowerCase().includes(lowerCaseSearchTerm))) ||
                (order.receiptNumber && order.receiptNumber.toLowerCase().includes(lowerCaseSearchTerm))
            );
        }

        currentOrders.sort((a, b) => {
            if (sortOrder === 'orderDateDesc') {
                return new Date(b.orderDate) - new Date(a.orderDate);
            } else if (sortOrder === 'orderDateAsc') {
                return new Date(a.orderDate) - new Date(b.orderDate);
            } else if (sortOrder === 'clientNameAsc') {
                const nameA = `${a.clientLastName} ${a.clientFirstName}`.toLowerCase();
                const nameB = `${b.clientLastName} ${b.clientFirstName}`.toLowerCase();
                return nameA.localeCompare(nameB);
            } else if (sortOrder === 'clientNameDesc') {
                const nameA = `${a.clientLastName} ${a.clientFirstName}`.toLowerCase();
                const nameB = `${b.clientLastName} ${b.clientFirstName}`.toLowerCase();
                return nameB.localeCompare(nameA);
            } else if (sortOrder === 'itemNameAsc') {
                const itemA = a.items?.[0]?.itemName || '';
                const itemB = b.items?.[0]?.itemName || '';
                return itemA.toLowerCase().localeCompare(itemB.toLowerCase());
            } else if (sortOrder === 'itemNameDesc') {
                const itemA = a.items?.[0]?.itemName || '';
                const itemB = b.items?.[0]?.itemName || '';
                return itemB.toLowerCase().localeCompare(itemA.toLowerCase());
            }
            return 0;
        });

        return currentOrders;
    }, [orders, selectedStatusFilter, selectedAdvisorFilter, searchTerm, sortOrder]);


    const handleLogin = useCallback(async (email, password) => {
        setLoginError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            setShowOrderForm(false);
            setShowLogin(false);
        } catch (error) {
            console.error("Login failed:", error.code);
            setLoginError("Email ou mot de passe incorrect.");
            showToast("Échec de la connexion. Email ou mot de passe incorrect.", 'error');
        }
    }, [auth, showToast]);

    const handleLogout = useCallback(() => {
        signOut(auth);
        setShowOrderForm(false);
        showToast("Déconnexion réussie.", 'success');
    }, [auth, showToast]);

    const getCurrentUserInfo = useCallback(() => {
        if (!currentUser) return null;
        const userProfile = advisorsMap[currentUser.email?.toLowerCase()];
        const displayName = userProfile?.name || currentUser.email || 'Inconnu';
        return { uid: currentUser.uid, email: currentUser.email, name: displayName, role: userProfile?.role || (currentUser.email === ADMIN_EMAIL ? 'admin' : 'unknown') };
    }, [currentUser, advisorsMap]);

    const handleSaveOrder = useCallback(async (orderData) => {
        if (!db || !currentUser) {
            setDbError("Vous devez être connecté pour passer ou modifier une commande.");
            showToast("Erreur: Vous devez être connecté.", 'error');
            return;
        }
        setIsSaving(true);
        const userInfo = getCurrentUserInfo();
        const now = new Date().toISOString();

        try {
            if (editingOrder) {
                const updatedHistory = [...(editingOrder.history || []), {
                    timestamp: now,
                    action: "Commande modifiée",
                    by: userInfo,
                    notes: `Mise à jour: ${JSON.stringify(orderData)}`
                }];
                await updateDoc(doc(db, `artifacts/${APP_ID}/public/data/orders`, editingOrder.id), {
                    ...orderData,
                    history: updatedHistory,
                });
                setEditingOrder(null);
                showToast("Commande modifiée avec succès !", 'success');
            } else {
                const newOrder = {
                    ...orderData,
                    orderedBy: userInfo,
                    orderDate: now,
                    currentStatus: ORDER_STATUSES_CONFIG.ORDERED.label,
                    receivedBy: null,
                    receptionDate: null,
                    notifiedBy: null,
                    pickedUpBy: null,
                    pickedUpDate: null,
                    history: [{ timestamp: now, action: `Commande ${ORDER_STATUSES_CONFIG.ORDERED.label.toLowerCase()}`, by: userInfo }]
                };
                await addDoc(collection(db, `artifacts/${APP_ID}/public/data/orders`), newOrder);
                showToast("Commande ajoutée avec succès !", 'success');
            }
            setShowOrderForm(false);
        } catch (e) {
            console.error("Error saving order:", e);
            setDbError("L'enregistrement de la commande a échoué. Vérifiez la console pour plus de détails.");
            showToast("Échec de l'enregistrement de la commande.", 'error');
        } finally {
            setIsSaving(false);
        }
    }, [db, currentUser, editingOrder, getCurrentUserInfo, showToast]);

    // Fonction de mise à jour de statut (appelée par les conseillers et admins)
    const updateOrderStatus = useCallback(async (orderId, newStatusLabel, isRevert = false) => {
        if (!db || !currentUser) {
            setDbError("Vous devez être connecté pour cette action.");
            showToast("Erreur: Vous devez être connecté.", 'error');
            return;
        }
        setIsSaving(true);
        const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderId);
        const userInfo = getCurrentUserInfo();
        const now = new Date().toISOString();

        try {
            let updateData = { currentStatus: newStatusLabel };
            let actionText = '';

            const newStatusConfig = Object.values(ORDER_STATUSES_CONFIG).find(s => s.label === newStatusLabel);
            if (!newStatusConfig) {
                console.error("Statut non reconnu:", newStatusLabel);
                setDbError("Statut de commande non valide.");
                showToast("Statut de commande non valide.", 'error');
                setIsSaving(false);
                return;
            }
            
            // Logique pour réinitialiser les étapes "futures" lors d'un changement de statut
            const currentOrder = orders.find(order => order.id === orderId);
            const currentStatusOrder = ORDER_STATUSES_ARRAY.find(s => s.label === currentOrder.currentStatus)?.order || 0;
            const newStatusOrder = newStatusConfig.order;

            // Réinitialiser les champs de date/par des étapes supérieures
            if (newStatusOrder < currentStatusOrder) { // Si on recule
                // Déterminer quels champs réinitialiser en fonction du nouveau statut
                const fieldsToReset = {};
                if (newStatusOrder < ORDER_STATUSES_CONFIG.PICKED_UP.order) {
                    fieldsToReset.pickedUpBy = null;
                    fieldsToReset.pickedUpDate = null;
                }
                if (newStatusOrder < ORDER_STATUSES_CONFIG.CLIENT_NOTIFIED.order) {
                    fieldsToReset.notifiedBy = null;
                    fieldsToReset.notificationDate = null;
                }
                if (newStatusOrder < ORDER_STATUSES_CONFIG.RECEIVED_IN_STORE.order) {
                    fieldsToReset.receivedBy = null;
                    fieldsToReset.receptionDate = null;
                }
                updateData = { ...updateData, ...fieldsToReset };
            } else if (newStatusOrder > currentStatusOrder) { // Si on avance, s'assurer que les champs passés ne sont pas réinitialisés
                // Rien à faire ici car les champs sont mis à jour spécifiquement pour le nouveau statut
                // et les anciens restent tels quels (ce qui est le comportement désiré pour l'historique)
            }


            switch (newStatusConfig.key) {
                case 'RECEIVED_IN_STORE':
                    updateData.receivedBy = userInfo;
                    updateData.receptionDate = now;
                    actionText = isRevert ? `Retour au statut: ${newStatusLabel} (Correction)` : "Commande reçue et validée";
                    break;
                case 'CLIENT_NOTIFIED':
                    updateData.notifiedBy = userInfo;
                    updateData.notificationDate = now;
                    actionText = isRevert ? `Retour au statut: ${newStatusLabel} (Correction)` : "Client prévenu ou averti";
                    break;
                case 'PICKED_UP':
                    updateData.pickedUpBy = userInfo;
                    updateData.pickedUpDate = now;
                    actionText = isRevert ? `Retour au statut: ${newStatusLabel} (Correction)` : "Client a retiré son colis";
                    break;
                case 'ORDERED': // Pour les retours à "Commandé"
                    // Les champs sont déjà réinitialisés par la logique ci-dessus pour ORDERED
                    actionText = `Retour au statut: ${newStatusLabel} (Correction)`;
                    break;
                case 'CANCELLED': // C'est normalement géré par handleConfirmCancel, mais pour la complétude
                    actionText = isRevert ? `Retour au statut: ${newStatusLabel} (Correction)` : "Commande annulée";
                    break;
                default:
                    actionText = `Statut mis à jour: ${newStatusLabel}`;
            }

            const updatedHistory = [...(currentOrder?.history || []), {
                timestamp: now,
                action: actionText,
                by: userInfo
            }];
            updateData.history = updatedHistory;

            await updateDoc(orderRef, updateData);
            showToast(`Statut mis à jour en "${newStatusLabel}"`, 'success');
        } catch (e) {
            console.error(`Error updating order status to ${newStatusLabel}:`, e);
            setDbError("Échec de la mise à jour du statut. Vérifiez la console.");
            showToast("Échec de la mise à jour du statut.", 'error');
        } finally {
            setIsSaving(false);
        }
    }, [db, currentUser, orders, getCurrentUserInfo, showToast]);

    // Fonction appelée par OrderCard pour la progression standard du statut
    const handleUpdateStatus = useCallback((orderId, newStatusLabel) => {
        // La confirmation modale est désormais affichée pour tous les utilisateurs, sauf les admins qui utilisent les boutons "retour"
        // Si c'est un admin et qu'il clique sur le bouton de progression, on ne lui montre pas la modale, on procède directement.
        // C'est le bouton "Retour à..." qui est spécifique à l'admin et n'a pas de modale.
        // Pour les autres cas (progression), la modale s'affiche.
        const currentUserProfile = getCurrentUserInfo();
        if (currentUserProfile && currentUserProfile.role === 'admin') {
            // L'admin fait une progression, pas besoin de confirmation supplémentaire pour lui (il peut revenir en arrière de toute façon)
            updateOrderStatus(orderId, newStatusLabel);
        } else {
            // Les conseillers ont toujours la confirmation
            setOrderToUpdateStatusAdvisor({ id: orderId, newStatusLabel: newStatusLabel });
            setShowConfirmAdvisorChange(true);
        }
    }, [getCurrentUserInfo, updateOrderStatus]);

    // Fonction de confirmation pour les conseillers (et maintenant aussi pour admins qui progressent)
    const confirmAdvisorUpdateStatus = useCallback(() => {
        if (orderToUpdateStatusAdvisor) {
            updateOrderStatus(orderToUpdateStatusAdvisor.id, orderToUpdateStatusAdvisor.newStatusLabel);
        }
        setShowConfirmAdvisorChange(false);
        setOrderToUpdateStatusAdvisor(null);
    }, [orderToUpdateStatusAdvisor, updateOrderStatus]);


    // Nouvelle fonction pour permettre à l'admin de revenir en arrière
    const handleRevertOrderStatus = useCallback(async (orderId, targetStatusLabel) => {
        if (!db || !currentUser || !isAdmin) { // Seul l'admin peut faire ça
            setDbError("Accès non autorisé pour cette action de retour en arrière.");
            showToast("Accès non autorisé.", 'error');
            return;
        }
        // Pas de confirmation spéciale pour l'admin ici, il est censé savoir ce qu'il fait
        await updateOrderStatus(orderId, targetStatusLabel, true); // Passer isRevert = true
    }, [db, currentUser, isAdmin, updateOrderStatus, showToast]);

    const handleConfirmCancel = useCallback(async () => {
        if (!db || !currentUser || !isAdmin || !orderToCancelId) { // Seul l'admin peut annuler
            setDbError("Accès non autorisé pour annuler la commande.");
            showToast("Accès non autorisé.", 'error');
            return;
        }
        setIsSaving(true);
        setShowConfirmCancel(false);
        const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderToCancelId);
        const userInfo = getCurrentUserInfo();
        const now = new Date().toISOString();

        try {
            const currentOrder = orders.find(order => order.id === orderToCancelId);
            const updatedHistory = [...(currentOrder?.history || []), {
                timestamp: now,
                action: `Commande ${ORDER_STATUSES_CONFIG.CANCELLED.label.toLowerCase()}`,
                by: userInfo
            }];

            await updateDoc(orderRef, {
                currentStatus: ORDER_STATUSES_CONFIG.CANCELLED.label,
                history: updatedHistory
            });
            setOrderToCancelId(null);
            showToast("Commande annulée avec succès.", 'success');
        } catch (e) {
            console.error("Error cancelling order:", e);
            setDbError("Échec de l'annulation de la commande. Vérifiez la console.");
            showToast("Échec de l'annulation de la commande.", 'error');
        } finally {
            setIsSaving(false);
        }
    }, [db, currentUser, isAdmin, orderToCancelId, orders, getCurrentUserInfo, showToast]);

    const handleConfirmDelete = useCallback(async () => {
        if (!db || !currentUser || !isAdmin || !orderToDeleteId) { // Seul l'admin peut supprimer
            setDbError("Accès non autorisé pour supprimer la commande.");
            showToast("Accès non autorisé.", 'error');
            return;
        }
        setIsSaving(true);
        setShowConfirmDelete(false);

        try {
            await deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/orders`, orderToDeleteId));
            setOrderToDeleteId(null);
            showToast("Commande supprimée avec succès.", 'success');
        } catch (e) {
            console.error("Error deleting order:", e);
            setDbError("Échec de la suppression de la commande. Vérifiez la console.");
            showToast("Échec de la suppression de la commande.", 'error');
        } finally {
            setIsSaving(false);
        }
    }, [db, currentUser, isAdmin, orderToDeleteId, showToast]);

    const handleShowOrderHistory = useCallback((order) => {
        setSelectedOrderForHistory(order);
        setShowOrderHistory(true);
    }, []);

    const handleEditOrder = useCallback((order) => {
        setEditingOrder(order);
        setShowOrderForm(true);
    }, []);

    const handleSaveAdvisor = useCallback(async (advisorData) => {
        if (!db || !isAdmin) {
            showToast("Accès non autorisé.", 'error');
            throw new Error("Seul l'administrateur peut ajouter/modifier les conseillers.");
        }
        setIsSaving(true);
        try {
            const docRef = doc(db, `artifacts/${APP_ID}/public/data/advisors`, advisorData.email.toLowerCase());
            await setDoc(docRef, {
                name: advisorData.name,
                email: advisorData.email.toLowerCase(),
                role: advisorData.role
            }, { merge: true });
            showToast("Conseiller enregistré avec succès !", 'success');
        } catch (e) {
            console.error("Error saving advisor:", e);
            showToast("Échec de l'enregistrement du conseiller.", 'error');
            throw new Error("Échec de l'enregistrement du conseiller.");
        } finally {
            setIsSaving(false);
        }
    }, [db, isAdmin, showToast]);

    const handleDeleteAdvisor = useCallback(async (advisorId) => {
        if (!db || !isAdmin) {
            showToast("Accès non autorisé.", 'error');
            setDbError("Seul l'administrateur peut supprimer les conseillers.");
            return;
        }
        setIsSaving(true);
        try {
            await deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/advisors`, advisorId));
            showToast("Conseiller supprimé de la liste. Le compte d'authentification Firebase doit être supprimé manuellement dans la console Firebase Auth si nécessaire.", 'success');
        } catch (e) {
                console.error("Error deleting advisor:", e);
                setDbError("Échec de la suppression du conseiller.");
                showToast("Échec de la suppression du conseiller.", 'error');
            } finally {
                setIsSaving(false);
            }
        }, [db, isAdmin, showToast]);


    if (!authReady) {
        return (
            <div className="bg-gray-900 min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto" />
            </div>
        );
    }

    if (showLogin || !currentUser) {
        return (
            <div className="bg-gray-900 min-h-screen flex items-center justify-center">
                <LoginForm onLogin={handleLogin} error={loginError} onClose={() => { /* No-op, user must log in */ }} />
            </div>
        );
    }

    // Détermine si l'utilisateur est un conseiller (et non un admin principal)
    // Note: isAdmin est déjà vrai si c'est l'admin principal ou un rôle 'admin'
    // Donc, isCounselor sera vrai si l'utilisateur n'est PAS admin mais est connecté.
    const isCounselorOnly = currentUser && !isAdmin;

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <AnimationStyles />
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

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
            {showConfirmAdvisorChange && orderToUpdateStatusAdvisor && (
                <ConfirmationModalAdvisor
                    message={`Confirmez-vous le passage au statut "${orderToUpdateStatusAdvisor.newStatusLabel}" ?`}
                    onConfirm={confirmAdvisorUpdateStatus}
                    onCancel={() => { setShowConfirmAdvisorChange(false); setOrderToUpdateStatusAdvisor(null); }}
                />
            )}
            {showOrderHistory && selectedOrderForHistory && (
                <OrderHistoryModal order={selectedOrderForHistory} onClose={() => setShowOrderHistory(false)} advisorsMap={advisorsMap} />
            )}
            {showAdvisorManagement && (
                <AdvisorManagementForm
                    db={db}
                    auth={auth}
                    appId={APP_ID}
                    advisors={advisors}
                    onSaveAdvisor={handleSaveAdvisor}
                    onDeleteAdvisor={handleDeleteAdvisor}
                    onClose={() => setShowAdvisorManagement(false)}
                    isAdmin={isAdmin}
                    adminEmail={ADMIN_EMAIL}
                />
            )}

            {showOrderForm && (
                <OrderForm
                    onSave={handleSaveOrder}
                    initialData={editingOrder}
                    isSaving={isSaving}
                    onClose={() => {
                        setShowOrderForm(false);
                        setEditingOrder(null);
                    }}
                />
            )}

            <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6"> {/* Added responsive padding */}
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">AOD Tracker OS</h1> {/* Responsive text size */}
                        <p className="text-gray-400 mt-1 text-sm sm:text-base"> {/* Responsive text size */}
                            Suivez vos commandes d'accessoires en temps réel.
                        </p>
                    </div>
                    <div className="mt-4 sm:mt-0 flex flex-wrap items-center justify-end gap-2 sm:gap-4"> {/* Added flex-wrap and adjusted gap for smaller screens */}
                        {currentUser && (
                            <div className="flex items-center gap-2 text-blue-300">
                                <User size={18} />
                                <span className="font-medium text-sm sm:text-base">Connecté :</span> {/* Responsive text size */}
                                <span className="bg-gray-700/50 px-2 py-1 rounded-full text-xs sm:text-sm font-semibold text-white"> {/* Responsive text size and padding */}
                                    {getCurrentUserInfo()?.name || 'Conseiller'}
                                </span>
                            </div>
                        )}
                        {isAdmin ? (
                            <div className="flex flex-wrap gap-2 sm:gap-4"> {/* flex-wrap for admin buttons on smaller screens */}
                                <span className="inline-flex items-center gap-2 bg-blue-600 px-3 py-1 rounded-full text-xs sm:text-sm font-bold text-white shadow-md"> {/* Responsive text size and padding */}
                                    <UserCheck size={16} /> Mode Admin
                                </span>
                                <button
                                    onClick={() => { setShowOrderForm(true); setEditingOrder(null); }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base flex-1 sm:flex-none" /* Responsive padding and flex-1 for full width on small screens */
                                >
                                    <PlusCircle size={20} /> Nouvelle Commande
                                </button>
                                <button
                                    onClick={() => setShowAdvisorManagement(true)}
                                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base flex-1 sm:flex-none" /* Responsive padding and flex-1 for full width on small screens */
                                >
                                    <UserPlus size={20} /> Gérer Conseillers
                                </button>
                                <Tooltip text="Se déconnecter">
                                    <button onClick={handleLogout} aria-label="Se déconnecter" className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700">
                                        <LogOut size={22} />
                                    </button>
                                </Tooltip>
                            </div>
                        ) : ( /* Bloc pour les conseillers (non-admin) */
                            <div className="flex flex-wrap gap-2 sm:gap-4"> {/* flex-wrap for counselor buttons on smaller screens */}
                                <button
                                    onClick={() => { setShowOrderForm(true); setEditingOrder(null); }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base flex-1 sm:flex-none" /* Responsive padding and flex-1 for full width on small screens */
                                >
                                    <PlusCircle size={20} /> Nouvelle Commande
                                </button>
                                <Tooltip text="Se déconnecter">
                                    <button onClick={handleLogout} aria-label="Se déconnecter" className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700">
                                        <LogOut size={22} />
                                    </button>
                                </Tooltip>
                            </div>
                        )}
                    </div>
                </header>

                {/* Filter and Sort Controls */}
                {currentUser && (
                    <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 mb-8"> {/* Changed to column on small, row and wrap on sm and up */}
                        {/* Search Input */}
                        <div className="relative flex-grow min-w-full sm:min-w-[200px] sm:flex-grow-0"> {/* Adjusted min-width for small screens and flex-grow */}
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Rechercher (client, accessoire, ticket...)"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-gray-700/50 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white"
                            />
                        </div>

                        {/* Status Filter Dropdown */}
                        <div className="relative w-full sm:w-auto"> {/* Added full width on small screens */}
                            <select
                                value={selectedStatusFilter}
                                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                                className="bg-gray-700/50 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none pr-8 cursor-pointer w-full" /* Added full width */
                            >
                                <option value="All">Tous les statuts</option>
                                {ORDER_STATUSES_ARRAY.map(status => (
                                    <option key={status.key} value={status.label}>
                                        {status.label}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>

                        {/* Advisor Filter Dropdown */}
                        <div className="relative w-full sm:w-auto"> {/* Added full width on small screens */}
                            <select
                                value={selectedAdvisorFilter}
                                onChange={(e) => setSelectedAdvisorFilter(e.target.value)}
                                className="bg-gray-700/50 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none pr-8 cursor-pointer w-full" /* Added full width */
                            >
                                <option value="All">Tous les conseillers</option>
                                {advisors.map(advisor => (
                                    <option key={advisor.email} value={advisor.email}>
                                        {advisor.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>

                        {/* Sort Order Dropdown */}
                        <div className="relative w-full sm:w-auto"> {/* Added full width on small screens */}
                            <select
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                                className="bg-gray-700/50 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none pr-8 cursor-pointer w-full" /* Added full width */
                            >
                                <option value="orderDateDesc">Date (la plus récente)</option>
                                <option value="orderDateAsc">Date (la plus ancienne)</option>
                                <option value="clientNameAsc">Client (A-Z)</option>
                                <option value="clientNameDesc">Client (Z-A)</option>
                                <option value="itemNameAsc">Accessoire (A-Z)</option>
                                <option value="itemNameDesc">Accessoire (Z-A)</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                )}


                {dbError && <div className="bg-red-500/20 text-red-300 p-4 rounded-lg mb-6">{dbError}</div>}

                {isLoading && (
                    <div className="text-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto" />
                        <p className="text-gray-400 mt-4">Chargement des commandes...</p>
                    </div>
                )}

                {!isLoading && filteredAndSortedOrders.length === 0 && (
                    <div className="text-center py-10 sm:py-20 bg-gray-800 rounded-2xl"> {/* Adjusted vertical padding */}
                        <h2 className="text-xl sm:text-2xl font-semibold text-gray-300">Aucune commande ne correspond aux filtres.</h2> {/* Responsive text size */}
                        <p className="text-gray-400 mt-2 text-sm sm:text-base">Essayez d'ajuster vos critères de recherche ou vos filtres.</p> {/* Responsive text size */}
                        {currentUser && <p className="text-gray-400 mt-2 text-sm sm:text-base">Cliquez sur "Nouvelle Commande" pour ajouter une commande.</p>}
                    </div>
                )}

                {!isLoading && filteredAndSortedOrders.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in"> {/* Grid layout for cards, responsive columns */}
                        {filteredAndSortedOrders.map((order) => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                onUpdateStatus={handleUpdateStatus}
                                onEdit={handleEditOrder}
                                onDelete={(id) => { setOrderToDeleteId(id); setShowConfirmDelete(true); }}
                                isAdmin={isAdmin}
                                onShowHistory={handleShowOrderHistory}
                                advisorsMap={advisorsMap}
                                onRevertStatus={handleRevertOrderStatus}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
