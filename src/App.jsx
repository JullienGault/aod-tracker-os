import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, onSnapshot, setDoc, doc, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, deleteUser } from 'firebase/auth'; // Added createUserWithEmailAndPassword, deleteUser
import { PlusCircle, Package, CheckCircle, Bell, Truck, History, User, Calendar, LogOut, UserCheck, LogIn, AlertTriangle, X, Info, Trash2, Edit, UserPlus, Phone, Mail, ReceiptText, Search, MinusCircle, Check, Slash } from 'lucide-react';

// =================================================================
// CONFIGURATION & CONSTANTES
// =================================================================

// Configuration Firebase mise à jour
const firebaseConfig = {
    apiKey: "AIzaSyBn-xE-Zf4JvIKKQNZBus8AvNmJLMeKPdg",
    authDomain: "aod-tracker-os.firebaseapp.com",
    projectId: "aod-tracker-os",
    storageBucket: "aod-tracker-os.appspot.com",
    messagingSenderId: "429289937311",
    appId: "1:429289937311:web:1ab993b09899afc2b245aa",
};

// App ID provided by the environment.
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-aod-app';

const ADMIN_EMAIL = "jullien.gault@orange-store.com"; // Your admin email for full control

// Define order statuses with display names and next possible statuses
const ORDER_STATUSES = {
    ORDERED: { name: 'Commandé', next: ['RECEIVED_IN_STORE'] }, // Changed next to use keys for robustness
    RECEIVED_IN_STORE: { name: 'Reçu en boutique', next: ['CLIENT_NOTIFIED'] },
    CLIENT_NOTIFIED: { name: 'Client prévenu ou averti', next: ['PICKED_UP'] },
    PICKED_UP: { name: 'Client a retiré son colis', next: [] },
    CANCELLED: { name: 'Annulée', next: [] }
};

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

// Toast Notification Component
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

// Form for creating and editing orders
const OrderForm = ({ onSave, initialData, isSaving, onClose }) => {
    const [clientFirstName, setClientFirstName] = useState(initialData?.clientFirstName || '');
    const [clientLastName, setClientLastName] = useState(initialData?.clientLastName || '');
    const [clientEmail, setClientEmail] = useState(initialData?.clientEmail || '');
    const [clientPhone, setClientPhone] = useState(initialData?.clientPhone || '');
    const [receiptNumber, setReceiptNumber] = useState(initialData?.receiptNumber || '');
    const [items, setItems] = useState(initialData?.items && initialData.items.length > 0 ? initialData.items : [{ itemName: '', quantity: '' }]); // Initialize with existing items or one empty item
    const [orderNotes, setOrderNotes] = useState(initialData?.orderNotes || '');
    const [formError, setFormError] = useState(null);

    const handleItemChange = useCallback((index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    }, [items]);

    const handleAddItem = useCallback(() => {
        setItems([...items, { itemName: '', quantity: '' }]);
    }, [items]);

    const handleRemoveItem = useCallback((index) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    }, [items]);

    // Handle form submission
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
            onClose(); // Close form on successful save
        } catch (error) {
            console.error("Error saving order:", error);
            setFormError("Échec de l'enregistrement de la commande. Veuillez réessayer.");
        }
    }, [clientFirstName, clientLastName, clientEmail, clientPhone, receiptNumber, items, orderNotes, onSave, onClose]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}> {/* Adjusted max-w to max-w-2xl */}
                <button onClick={onClose} aria-label="Fermer le formulaire" className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={24} />
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 text-center">{initialData ? 'Modifier la commande' : 'Nouvelle Commande d\'Accessoire'}</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
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
                            <div key={index} className="flex items-end gap-2 bg-gray-700/50 p-3 rounded-lg">
                                <div className="flex-grow">
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
                                <div>
                                    <label htmlFor={`quantity-${index}`} className="block text-xs font-medium text-gray-400 mb-1">Qté</label>
                                    <input
                                        id={`quantity-${index}`}
                                        type="number"
                                        placeholder="Qté"
                                        value={item.quantity}
                                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                        required
                                        className="w-20 bg-gray-600 border-gray-500 text-white p-2 rounded-lg text-sm"
                                    />
                                </div>
                                {items.length > 1 && (
                                    <button type="button" onClick={() => handleRemoveItem(index)} className="p-2 text-red-400 hover:text-red-300 transition-colors">
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

// Component to display an individual order card
const OrderCard = ({ order, onUpdateStatus, onEdit, onDelete, isAdmin, onShowHistory, advisorsMap }) => {
    // Determine the color of the status badge
    const getStatusColor = (status) => {
        switch (status) {
            case ORDER_STATUSES.ORDERED.name: return 'bg-yellow-500';
            case ORDER_STATUSES.RECEIVED_IN_STORE.name: return 'bg-green-500';
            case ORDER_STATUSES.CLIENT_NOTIFIED.name: return 'bg-blue-500';
            case ORDER_STATUSES.PICKED_UP.name: return 'bg-purple-500';
            case ORDER_STATUSES.CANCELLED.name: return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    };

    // Helper to get display name from email using the provided map
    const getDisplayName = (email) => {
        return advisorsMap[email.toLowerCase()]?.name || email;
    };

    // Get the next status button config based on current status and admin role
    const getNextStatusButton = (currentStatus) => {
        if (!isAdmin || currentStatus === ORDER_STATUSES.PICKED_UP.name || currentStatus === ORDER_STATUSES.CANCELLED.name) {
            return null; // No action if not admin or already completed/cancelled
        }

        const currentStatusKey = Object.keys(ORDER_STATUSES).find(key => ORDER_STATUSES[key].name === currentStatus);
        const currentStatusConfig = ORDER_STATUSES[currentStatusKey];

        if (currentStatusConfig && currentStatusConfig.next.length > 0) {
            const nextStatusKey = currentStatusConfig.next[0];
            const nextStatusName = ORDER_STATUSES[nextStatusKey].name; // Get the display name for the next status
            let buttonColor = 'bg-gray-600';
            let ButtonIcon = CheckCircle; 

            switch (nextStatusKey) { // Use the key for the switch for clarity
                case 'RECEIVED_IN_STORE':
                    buttonColor = 'bg-green-600';
                    ButtonIcon = Truck;
                    break;
                case 'CLIENT_NOTIFIED':
                    buttonColor = 'bg-blue-600';
                    ButtonIcon = Bell;
                    break;
                case 'PICKED_UP':
                    buttonColor = 'bg-purple-600';
                    ButtonIcon = UserCheck;
                    break;
                default:
                    // Default icon and color
                    break;
            }

            return (
                <button
                    onClick={() => onUpdateStatus(order.id, nextStatusName)} // Pass the display name
                    className={`flex-1 ${buttonColor} hover:${buttonColor.replace('600', '700')} text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2`}
                >
                    <ButtonIcon size={18} /> Marquer "{nextStatusName}"
                </button>
            );
        }
        return null;
    };

    return (
        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg flex flex-col transition-all duration-300 hover:shadow-2xl hover:scale-[1.01] hover:shadow-blue-500/10 hover:ring-2 hover:ring-blue-500/50 animate-fade-in-up">
            <div className="flex justify-between items-start mb-4">
                {/* Client Name and Order Date */}
                <div>
                    <h3 className="text-xl font-bold text-white mb-1"> {/* Increased font size and added margin-bottom */}
                        <span className="text-blue-200">{order.clientFirstName} {order.clientLastName}</span> {/* Highlighted client name */}
                    </h3>
                    <p className="text-gray-400 text-sm mb-2"> {/* Moved date here and adjusted styling */}
                        Commandé le {new Date(order.orderDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold text-white ${getStatusColor(order.currentStatus)}`}>
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
                {order.receivedBy && order.receptionDate && (
                    <p className="flex items-center gap-2 mb-1">
                        <CheckCircle size={16} className="text-green-400" /> Reçu par <span className="font-medium text-white">{getDisplayName(order.receivedBy?.email || 'N/A')}</span>
                        le {new Date(order.receptionDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
                {order.notifiedBy && order.notificationDate && (
                    <p className="flex items-center gap-2 mb-1">
                        <Bell size={16} className="text-blue-400" /> Client prévenu par <span className="font-medium text-white">{getDisplayName(order.notifiedBy?.email || 'N/A')}</span>
                        le {new Date(order.notificationDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
                {order.pickedUpBy && order.pickedUpDate && (
                    <p className="flex items-center gap-2">
                        <UserCheck size={16} className="text-purple-400" /> Retiré par <span className="font-medium text-white">{getDisplayName(order.pickedUpBy?.email || 'N/A')}</span>
                        le {new Date(order.pickedUpDate).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>

            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-700">
                {getNextStatusButton(order.currentStatus)}
                {isAdmin && order.currentStatus !== ORDER_STATUSES.CANCELLED.name && (
                    <>
                        <button
                            onClick={() => onEdit(order)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                        >
                            <Edit size={18} /> Modifier
                        </button>
                        <button
                            onClick={() => onDelete(order.id)}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                        >
                            <Trash2 size={18} /> Supprimer
                        </button>
                    </>
                )}
                <button
                    onClick={() => onShowHistory(order)}
                    className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                >
                    <History size={18} /> Historique
                </button>
            </div>
        </div>
    );
};


// Modal for displaying order history
const OrderHistoryModal = ({ order, onClose, advisorsMap }) => {
    // Helper to get display name from email
    const getDisplayName = (email) => {
        return advisorsMap[email.toLowerCase()]?.name || email;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} aria-label="Fermer l'historique" className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={24} />
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 text-center">Historique de la commande: {order.items?.[0]?.itemName || 'Article(s)'}</h2>
                <div className="space-y-4 pr-2 custom-scrollbar">
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
    </div>
);

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

// Advisor Management Component
const AdvisorManagementForm = ({ db, auth, appId, advisors, onSaveAdvisor, onDeleteAdvisor, onClose, isAdmin, adminEmail }) => { // Added 'auth' prop
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState(''); // New state for password
    const [role, setRole] = useState('counselor'); // New state for role
    const [editAdvisorId, setEditAdvisorId] = useState(null);
    const [formError, setFormError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleAddUpdateAdvisor = async (e) => {
        e.preventDefault();
        setFormError(null);
        if (!name.trim() || !email.trim() || (!editAdvisorId && !password.trim())) { // Password required only for new user
            setFormError("Le nom, l'email et le mot de passe (pour un nouvel utilisateur) du conseiller sont obligatoires.");
            return;
        }
        if (!email.includes('@')) {
            setFormError("L'email n'est pas valide.");
            return;
        }
        setIsSaving(true);
        try {
            if (!editAdvisorId) { // Create new user in Firebase Auth
                try {
                    await createUserWithEmailAndPassword(auth, email, password);
                } catch (authError) {
                    if (authError.code === 'auth/email-already-in-use') {
                        setFormError("Cet email est déjà utilisé pour un autre compte.");
                        setIsSaving(false);
                        return;
                    }
                    if (authError.code === 'auth/weak-password') {
                        setFormError("Le mot de passe est trop faible (minimum 6 caractères).");
                        setIsSaving(false);
                        return;
                    }
                    setFormError(`Erreur d'authentification: ${authError.message}`);
                    setIsSaving(false);
                    return;
                }
            }
            // Save/Update advisor profile in Firestore
            await onSaveAdvisor({
                id: editAdvisorId,
                name: name.trim(),
                email: email.trim().toLowerCase(),
                role: role,
            });
            setName('');
            setEmail('');
            setPassword('');
            setRole('counselor');
            setEditAdvisorId(null);
        } catch (error) {
            setFormError(`Erreur lors de l'enregistrement: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditClick = (advisor) => {
        setName(advisor.name);
        setEmail(advisor.email);
        setRole(advisor.role || 'counselor'); // Set existing role
        setPassword(''); // Password not editable directly for existing users
        setEditAdvisorId(advisor.id);
    };

    const handleCancelEdit = () => {
        setName('');
        setEmail('');
        setPassword('');
        setRole('counselor');
        setEditAdvisorId(null);
        setFormError(null);
    };

    const handleDeleteClick = async (advisor) => {
        if (advisor.email === adminEmail) {
            setFormError("Vous ne pouvez pas supprimer le compte administrateur principal.");
            return;
        }
        // This deletion is complex and should ideally be done server-side via Firebase Admin SDK
        // because client-side deleteUser only works for the currently signed-in user.
        // For the scope of this Canvas app, we'll delete the Firestore entry.
        // A real app would use a Cloud Function to delete the Auth user too.
        if (window.confirm(`Êtes-vous sûr de vouloir supprimer le conseiller ${advisor.name} (${advisor.email})? Cette action est irréversible et ne supprime PAS le compte d'authentification Firebase associé pour des raisons de sécurité côté client.`)) {
             setIsSaving(true);
             try {
                 await onDeleteAdvisor(advisor.id); // Deletes from Firestore
                 // Cannot delete Auth user here directly unless it's the current user for security reasons.
                 // For a robust app, this would trigger a cloud function to delete the Auth user.
                 alert("Conseiller supprimé de la liste. Note: le compte d'authentification Firebase n'est pas supprimé côté client.");
             } catch (error) {
                 setFormError(`Erreur lors de la suppression: ${error.message}`);
             } finally {
                 setIsSaving(false);
             }
         }
    };

    if (!isAdmin) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in">
                <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 animate-fade-in-up">
                    <p className="text-red-400 text-center">Accès refusé. Seul l'administrateur peut gérer les conseillers.</p>
                    <button onClick={onClose} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg">Fermer</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-3xl border border-gray-700 relative animate-fade-in-up overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
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
                        <input id="advisorEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-gray-600 border border-gray-500 text-white p-2 rounded-lg" readOnly={!!editAdvisorId} /> {/* Email is readOnly when editing */}
                    </div>
                    {!editAdvisorId && ( // Password field only for new advisors
                        <div>
                            <label htmlFor="advisorPassword" className="block text-sm font-medium text-gray-300 mb-1">Mot de passe (temporaire) *</label>
                            <input id="advisorPassword" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-gray-600 border border-gray-500 text-white p-2 rounded-lg" />
                            <p className="text-xs text-gray-400 mt-1">Min. 6 caractères. Le conseiller pourra le changer plus tard.</p>
                        </div>
                    )}
                    <div>
                        <label htmlFor="advisorRole" className="block text-sm font-medium text-gray-300 mb-1">Rôle *</label>
                        <select id="advisorRole" value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-gray-600 border border-gray-500 text-white p-2 rounded-lg">
                            <option value="counselor">Conseiller</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    {formError && <p className="text-red-400 text-sm">{formError}</p>}
                    <div className="flex gap-4">
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
                                <li key={advisor.id} className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
                                    <div>
                                        <p className="font-medium text-white">{advisor.name}</p>
                                        <p className="text-sm text-gray-400">{advisor.email} (<span className="capitalize">{advisor.role}</span>)</p> {/* Display role */}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEditClick(advisor)} className="text-blue-400 hover:text-blue-300 transition-colors">
                                            <Edit size={20} />
                                        </button>
                                        <button onClick={() => handleDeleteClick(advisor)} className="text-red-400 hover:text-red-300 transition-colors" disabled={advisor.email === adminEmail}> {/* Prevent deleting primary admin */}
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
    const [advisors, setAdvisors] = useState([]); // State to store advisors
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [dbError, setDbError] = useState(null);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [currentUser, setCurrentUser] = useState(null); // Stores Firebase User object
    const [isAdmin, setIsAdmin] = useState(false);
    const [authReady, setAuthReady] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const [showLogin, setShowLogin] = useState(false);

    const [showOrderForm, setShowOrderForm] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null); // Stores order data if in edit mode

    const [showConfirmCancel, setShowConfirmCancel] = useState(false);
    const [orderToCancelId, setOrderToCancelId] = useState(null);

    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [orderToDeleteId, setOrderToDeleteId] = useState(null);

    const [showOrderHistory, setShowOrderHistory] = useState(false);
    const [selectedOrderForHistory, setSelectedOrderForHistory] = useState(null);
    const [showAdvisorManagement, setShowAdvisorManagement] = useState(false); // New state for advisor management UI

    // New states for filtering and sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatusFilter, setSelectedStatusFilter] = useState('All'); // 'All' or specific status name
    const [selectedAdvisorFilter, setSelectedAdvisorFilter] = useState('All'); // 'All' or advisor email
    const [sortOrder, setSortOrder] = useState('orderDateDesc'); // Default sort: Date (newest first)
    
    // Toast notification state
    const [toast, setToast] = useState(null);

    // Function to display a toast notification
    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        const timer = setTimeout(() => {
            setToast(null);
        }, 3000); // Hide after 3 seconds
        return () => clearTimeout(timer);
    }, []);


    // Memoized map of advisors for quick lookup
    const advisorsMap = useMemo(() => {
        return advisors.reduce((acc, advisor) => {
            acc[advisor.email.toLowerCase()] = advisor;
            return acc;
        }, {});
    }, [advisors]);

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
                    // Determine isAdmin based on ADMIN_EMAIL or role from Firestore
                    const userProfile = advisorsMap[user.email?.toLowerCase()];
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
    }, [advisorsMap]); // Added advisorsMap as dependency so isAdmin updates if roles change

    // Fetch advisors from Firestore
    useEffect(() => {
        if (!authReady || !db) return; // Fetch advisors regardless of currentUser login, but after auth is ready

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
    }, [authReady, db]); // Removed isAdmin, currentUser from dependency array to allow fetching advisor list even before login

    // Fetch orders from Firestore
    useEffect(() => {
        if (!authReady || !db || !currentUser) return; // Only fetch if authenticated

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
    }, [authReady, db, currentUser]); // Rerun if currentUser changes

    // Filter and sort orders
    const filteredAndSortedOrders = useMemo(() => {
        let currentOrders = [...orders];

        // 1. Filter by Status
        if (selectedStatusFilter !== 'All') {
            currentOrders = currentOrders.filter(order => order.currentStatus === selectedStatusFilter);
        }

        // 2. Filter by Advisor
        if (selectedAdvisorFilter !== 'All') {
            currentOrders = currentOrders.filter(order =>
                order.orderedBy && order.orderedBy.email && order.orderedBy.email.toLowerCase() === selectedAdvisorFilter.toLowerCase()
            );
        }

        // 3. Filter by Search Term (client name, phone, email, item name, receipt number)
        if (searchTerm.trim()) {
            const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
            currentOrders = currentOrders.filter(order =>
                (order.clientFirstName && order.clientFirstName.toLowerCase().includes(lowerCaseSearchTerm)) ||
                (order.clientLastName && order.clientLastName.toLowerCase().includes(lowerCaseSearchTerm)) ||
                (order.clientEmail && order.clientEmail.toLowerCase().includes(lowerCaseSearchTerm)) ||
                (order.clientPhone && order.clientPhone.toLowerCase().includes(lowerCaseSearchTerm)) ||
                // Search within items array
                (order.items && order.items.some(item => item.itemName.toLowerCase().includes(lowerCaseSearchTerm))) ||
                (order.receiptNumber && order.receiptNumber.toLowerCase().includes(lowerCaseSearchTerm))
            );
        }

        // 4. Sort
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
                // Sort by the first item name for simplicity, or implement more complex item sorting
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
            showToast("Échec de la connexion. Email ou mot de passe incorrect.", 'error');
        }
    }, [auth, showToast]);

    // Handle user logout
    const handleLogout = useCallback(() => {
        signOut(auth);
        setShowOrderForm(false); // Close form if open
        showToast("Déconnexion réussie.", 'success');
    }, [auth, showToast]);

    // Helper to get current user info for history/tracking
    const getCurrentUserInfo = useCallback(() => {
        if (!currentUser) return null;
        // Lookup display name from advisorsMap
        const userProfile = advisorsMap[currentUser.email?.toLowerCase()];
        const displayName = userProfile?.name || currentUser.email || 'Inconnu';
        return { uid: currentUser.uid, email: currentUser.email, name: displayName, role: userProfile?.role || (currentUser.email === ADMIN_EMAIL ? 'admin' : 'unknown') };
    }, [currentUser, advisorsMap]);

    // Handle placing a new order or updating an existing one
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
            if (editingOrder) { // Editing existing order
                const updatedHistory = [...(editingOrder.history || []), {
                    timestamp: now,
                    action: "Commande modifiée",
                    by: userInfo,
                    notes: `Mise à jour: ${JSON.stringify(orderData)}` // Stringify full orderData for comprehensive notes
                }];
                await updateDoc(doc(db, `artifacts/${APP_ID}/public/data/orders`, editingOrder.id), {
                    ...orderData,
                    history: updatedHistory,
                });
                setEditingOrder(null); // Exit edit mode
                showToast("Commande modifiée avec succès !", 'success');
            } else { // Placing a new order
                const newOrder = {
                    ...orderData,
                    orderedBy: userInfo,
                    orderDate: now,
                    currentStatus: ORDER_STATUSES.ORDERED.name, // Set initial status
                    receivedBy: null,
                    receptionDate: null,
                    notifiedBy: null,
                    pickedUpBy: null,
                    pickedUpDate: null,
                    history: [{ timestamp: now, action: `Commande ${ORDER_STATUSES.ORDERED.name.toLowerCase()}`, by: userInfo }]
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

    // Handle updating order status (e.g., Received, Notified)
    const handleUpdateOrderStatus = useCallback(async (orderId, newStatusName) => {
        if (!db || !currentUser || !isAdmin) {
            setDbError("Accès non autorisé pour cette action.");
            showToast("Accès non autorisé.", 'error');
            return;
        }
        setIsSaving(true);
        const orderRef = doc(db, `artifacts/${APP_ID}/public/data/orders`, orderId);
        const userInfo = getCurrentUserInfo();
        const now = new Date().toISOString();

        try {
            let updateData = { currentStatus: newStatusName };
            let actionText = '';

            switch (newStatusName) {
                case ORDER_STATUSES.RECEIVED_IN_STORE.name:
                    updateData.receivedBy = userInfo;
                    updateData.receptionDate = now;
                    actionText = "Commande reçue et validée";
                    break;
                case ORDER_STATUSES.CLIENT_NOTIFIED.name:
                    updateData.notifiedBy = userInfo;
                    updateData.notificationDate = now;
                    actionText = "Client prévenu ou averti";
                    break;
                case ORDER_STATUSES.PICKED_UP.name:
                    updateData.pickedUpBy = userInfo;
                    updateData.pickedUpDate = now;
                    actionText = "Client a retiré son colis";
                    break;
                default:
                    actionText = `Statut mis à jour: ${newStatusName}`;
            }

            const currentOrder = orders.find(order => order.id === orderId);
            const updatedHistory = [...(currentOrder?.history || []), {
                timestamp: now,
                action: actionText,
                by: userInfo
            }];
            updateData.history = updatedHistory;

            await updateDoc(orderRef, updateData);
            showToast(`Statut mis à jour en "${newStatusName}"`, 'success');
        } catch (e) {
            console.error(`Error updating order status to ${newStatusName}:`, e);
            setDbError("Échec de la mise à jour du statut. Vérifiez la console.");
            showToast("Échec de la mise à jour du statut.", 'error');
        } finally {
            setIsSaving(false);
        }
    }, [db, currentUser, isAdmin, orders, getCurrentUserInfo, showToast]);


    // Handle order cancellation (only admin)
    const handleConfirmCancel = useCallback(async () => {
        if (!db || !currentUser || !isAdmin || !orderToCancelId) {
            setDbError("Accès non autorisé pour annuler la commande.");
            showToast("Accès non autorisé.", 'error');
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
                action: `Commande ${ORDER_STATUSES.CANCELLED.name.toLowerCase()}`,
                by: userInfo
            }];

            await updateDoc(orderRef, {
                currentStatus: ORDER_STATUSES.CANCELLED.name,
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

    // Handle order deletion (only admin)
    const handleConfirmDelete = useCallback(async () => {
        if (!db || !currentUser || !isAdmin || !orderToDeleteId) {
            setDbError("Accès non autorisé pour supprimer la commande.");
            showToast("Accès non autorisé.", 'error');
            return;
        }
        setIsSaving(true);
        setShowConfirmDelete(false); // Close confirmation modal

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

    // Advisor Management Callbacks
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
                role: advisorData.role // Save the role
            }, { merge: true }); // Use merge to avoid overwriting if doc exists
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
            // Attempt to delete the user from Firebase Auth as well
            // This requires a privileged environment (e.g., Firebase Admin SDK in a Cloud Function)
            // It's not directly possible from client-side for arbitrary users due to security.
            // For this self-contained Canvas app, we'll indicate this limitation.
            // const userToDelete = auth.currentUser; // This would only delete the *current* user
            // if (userToDelete && userToDelete.email.toLowerCase() === advisorId.toLowerCase()) {
            //     await deleteUser(userToDelete);
            // }

            await deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/advisors`, advisorId));
            showToast("Conseiller supprimé avec succès. (Compte Auth non supprimé)", 'success'); // Indicate Auth user not deleted
        } catch (e) {
            console.error("Error deleting advisor:", e);
            setDbError("Échec de la suppression du conseiller.");
            showToast("Échec de la suppression du conseiller.", 'error');
        } finally {
            setIsSaving(false);
        }
    }, [db, isAdmin, showToast]);


    if (!authReady) {
        // Show loading spinner while auth state is being determined
        return (
            <div className="bg-gray-900 min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
            </div>
        );
    }

    if (showLogin || !currentUser) {
        // Show login form if authReady is true but no user is logged in
        return (
            <div className="bg-gray-900 min-h-screen flex items-center justify-center">
                <LoginForm onLogin={handleLogin} error={loginError} onClose={() => { /* No-op, user must log in */ }} />
            </div>
        );
    }

    // Main application content, rendered only if currentUser is available
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
            {showOrderHistory && selectedOrderForHistory && (
                <OrderHistoryModal order={selectedOrderForHistory} onClose={() => setShowOrderHistory(false)} advisorsMap={advisorsMap} />
            )}
            {showAdvisorManagement && (
                <AdvisorManagementForm
                    db={db}
                    auth={auth} // Pass auth instance
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
                                <button
                                    onClick={() => setShowAdvisorManagement(true)}
                                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <UserPlus size={20} /> Gérer Conseillers
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

                {/* New Filter and Sort Controls */}
                {currentUser && ( // Only show filters/sort if a user is logged in
                    <div className="flex flex-wrap items-center gap-4 mb-8">
                        {/* Search Input */}
                        <div className="relative flex-grow min-w-[200px]">
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
                        <select
                            value={selectedStatusFilter}
                            onChange={(e) => setSelectedStatusFilter(e.target.value)}
                            className="bg-gray-700/50 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="All">Tous les statuts</option>
                            {Object.values(ORDER_STATUSES).map(status => (
                                <option key={status.name} value={status.name}>
                                    {status.name}
                                </option>
                            ))}
                        </select>

                        {/* Advisor Filter Dropdown */}
                        <select
                            value={selectedAdvisorFilter}
                            onChange={(e) => setSelectedAdvisorFilter(e.target.value)}
                            className="bg-gray-700/50 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="All">Tous les conseillers</option>
                            {advisors.map(advisor => (
                                <option key={advisor.email} value={advisor.email}>
                                    {advisor.name}
                                </option>
                            ))}
                        </select>

                        {/* Sort Order Dropdown */}
                        <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value)}
                            className="bg-gray-700/50 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="orderDateDesc">Date (la plus récente)</option>
                            <option value="orderDateAsc">Date (la plus ancienne)</option>
                            <option value="clientNameAsc">Client (A-Z)</option>
                            <option value="clientNameDesc">Client (Z-A)</option>
                            <option value="itemNameAsc">Accessoire (A-Z)</option>
                            <option value="itemNameDesc">Accessoire (Z-A)</option>
                        </select>
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
                    <div className="text-center py-20 bg-gray-800 rounded-2xl">
                        <h2 className="text-2xl font-semibold text-gray-300">Aucune commande ne correspond aux filtres.</h2>
                        <p className="text-gray-400 mt-2">Essayez d'ajuster vos critères de recherche ou vos filtres.</p>
                        {isAdmin && <p className="text-gray-400 mt-2">Cliquez sur "Nouvelle Commande" pour ajouter une commande.</p>}
                    </div>
                )}

                {!isLoading && filteredAndSortedOrders.length > 0 && (
                    <div className="flex flex-col gap-6 animate-fade-in">
                        {filteredAndSortedOrders.map((order) => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                onUpdateStatus={handleUpdateOrderStatus}
                                onEdit={handleEditOrder}
                                onDelete={(id) => { setOrderToDeleteId(id); setShowConfirmDelete(true); }}
                                isAdmin={isAdmin}
                                onShowHistory={handleShowOrderHistory}
                                advisorsMap={advisorsMap}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
