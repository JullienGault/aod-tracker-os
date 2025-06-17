// En haut de votre fichier, assurez-vous d'importer ReactDOM
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import CountUp from 'react-countup';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, signInAnonymously } from 'firebase/auth';
import { TrendingUp, TrendingDown, Star, Crown, Store, Users, AlertCircle, Percent, LogOut, UserCheck, LogIn, AlertTriangle, Minus, ChevronDown, ChevronUp, Search, Award, X, Info, Sparkles } from 'lucide-react';

// =================================================================
// CONFIGURATION & CONSTANTES
// =================================================================

const firebaseConfig = {
    apiKey: "AIzaSyAmKRm86tc34cX66vaRUDsvby9LVgBv9As",
    authDomain: "csat-tracker-os.firebaseapp.com",
    projectId: "csat-tracker-os",
    storageBucket: "csat-tracker-os.appspot.com",
    messagingSenderId: "900233645747",
    appId: "1:900233645747:web:cb1fe11a25f6be122f6ac6",
    measurementId: "G-9SJMCB6X3Q"
};

const APP_ID = "csat-tracker-os";
const ADMIN_EMAIL = "jullien.gault@orange-store.com";
const MY_STORE_NAME = "COGNAC";

const GOALS = {
    CSAT: { goal: 90 },
    RESPONSE_RATE: { goal: 5 },
};

const RANKING_KEYS = {
    SATISFACTION: 'satisfaction',
    SCORE: 'score',
    RESPONSES: 'responses',
    NAME: 'name',
    PERFORMANCE: 'performanceScore',
};

const DEFAULT_ADVISORS = [
    { name: 'Enzo', code: 'VHBG5190', score: '', responses: '', noReviews: true },
    { name: 'Guewen', code: 'SCNN8217', score: '', responses: '', noReviews: false },
    { name: 'Jullien', code: 'LHFG3929', score: '', responses: '', noReviews: false },
    { name: 'Kenza', code: '', score: '', responses: '', noReviews: false },
    { name: 'Manuel', code: 'HVHN8012', score: '', responses: '', noReviews: false },
    { name: 'Marie', code: 'SFLD8590', score: '', responses: '', noReviews: false },
    { name: 'Marvyn', code: 'FVFS6456', score: '', responses: '', noReviews: true },
    { name: 'Tom', code: 'DBNN6733', score: '', responses: '', noReviews: false },
];

const DEFAULT_STORES = [
    { name: 'Boisseuil', satisfaction: '' },
    { name: 'Brive La Gaillarde', satisfaction: '' },
    { name: 'Cognac', satisfaction: '' },
    { name: 'Gueret', satisfaction: '' },
    { name: 'La Couronne', satisfaction: '' },
    { name: 'Limoges Beaubreuil', satisfaction: '' },
    { name: 'Ruffec', satisfaction: '' },
    { name: 'St Junien', satisfaction: '' },
    { name: 'Tulle', satisfaction: '' },
    { name: 'Ussel', satisfaction: '' },
];


// =================================================================
// FONCTIONS UTILITAIRES (Helpers)
// =================================================================

const calculateRanks = (data = [], key) => {
    if (!data || data.length === 0) return [];
    const withReviews = data.filter(item => !item.noReviews);
    const noReviews = data.filter(item => item.noReviews);
    const sortedWithReviews = [...withReviews].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    let rank = 1;
    const rankedWithReviews = sortedWithReviews.map((item, index) => {
        if (index > 0 && item[key] < sortedWithReviews[index - 1][key]) {
            rank = index + 1;
        }
        return { ...item, rank };
    });
    const unranked = noReviews.map(item => ({ ...item, rank: rankedWithReviews.length + 1 }));
    return [...rankedWithReviews, ...unranked];
};

const addRankChanges = (currentRanked, previousRaw, rankKey, nameKey) => {
    if (!previousRaw) {
        return currentRanked.map(item => ({ ...item, rankChange: null }));
    }
    const previousRankedMap = new Map(
        calculateRanks(previousRaw, rankKey).map(item => [String(item[nameKey]).trim().toLowerCase(), item.rank])
    );
    return currentRanked.map(currentItem => {
        const currentName = String(currentItem[nameKey]).trim().toLowerCase();
        const previousRank = previousRankedMap.get(currentName);
        if (previousRank === undefined || currentItem.noReviews) {
            return { ...currentItem, rankChange: null };
        }
        const rankChange = previousRank - currentItem.rank;
        return { ...currentItem, rankChange };
    });
};

const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
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

const Tooltip = ({ children, text }) => {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef(null);
    const tooltipRef = useRef(null);

    const showTooltip = () => {
        if (triggerRef.current) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            setPosition({
                top: triggerRect.bottom + 8,
                left: triggerRect.left + triggerRect.width / 2,
            });
        }
        setVisible(true);
    };

    useEffect(() => {
        if (visible && triggerRef.current && tooltipRef.current) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();
            
            let top = triggerRect.top - tooltipRect.height - 8;
            let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);

            if (top < 0) {
                top = triggerRect.bottom + 8;
            }
            if (left < 8) left = 8;
            if (left + tooltipRect.width > window.innerWidth) {
                left = window.innerWidth - tooltipRect.width - 8;
            }

            setPosition({ top, left });
        }
    }, [visible]);

    const hideTooltip = () => setVisible(false);
    
    const tooltipContent = (
        <div
            ref={tooltipRef}
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
            className={`fixed max-w-xs p-3 text-sm font-medium text-white bg-slate-800/90 border border-white/10 rounded-lg shadow-2xl backdrop-blur-sm transition-all duration-300 pointer-events-none z-50 whitespace-pre-wrap text-left ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        >
            {text}
        </div>
    );

    return (
        <>
            <span 
                ref={triggerRef}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
            >
                {children}
            </span>
            {visible && ReactDOM.createPortal(tooltipContent, document.body)}
        </>
    );
};

const ProgressBar = ({ value, goal }) => {
    const percentage = goal > 0 ? (value / goal) * 100 : 0;
    
    let progressColor = 'bg-red-500';
    if (goal && value >= goal) {
        progressColor = 'bg-green-400';
    }

    return (
        <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2 relative">
            <div className={`${progressColor} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${Math.min(percentage, 100)}%` }} />
        </div>
    );
};

const TopPerformerCard = React.memo(({ performer }) => {
    if (!performer) return null;
    
    const tooltipText = `Le Top Performer est le conseiller avec le plus haut "Score de Performance".\n\nFormule :\nScore de satisfaction (%) x Nombre de réponses`;

    return (
        <div className="bg-gradient-to-br from-yellow-400 via-yellow-500 to-orange-500 p-6 rounded-2xl shadow-lg text-white text-center transition-all duration-500 hover:shadow-2xl hover:scale-105 animate-fade-in-up h-full flex flex-col justify-center items-center">
            <h3 className="text-xl font-bold flex items-center justify-center gap-2">
                <Award /> 
                <span>Top Performer du Mois</span>
                <Tooltip text={tooltipText}>
                    <Info size={18} className="cursor-help"/>
                </Tooltip>
            </h3>
            <p className="text-4xl font-extrabold mt-4">{performer.name}</p>
            <p className="text-xl font-semibold opacity-80 mt-1">{performer.score}% sur {performer.responses} réponses</p>
        </div>
    );
});

const StatCard = React.memo(({ title, value, unit = '', icon, isLoading, goal, animationDelay, subText, useCountUp = false }) => {
    const IconComponent = icon;
    
    let valueColorClass = 'text-white';
    const numericValue = parseFloat(value) || 0;

    if (goal) {
        if (numericValue >= goal) {
            valueColorClass = 'text-green-400';
        } else {
            valueColorClass = 'text-red-400';
        }
    }

    if (isLoading) return <div className="bg-gray-800 p-6 rounded-2xl shadow-lg animate-pulse min-h-[160px]" />;
    
    const decimals = String(value).includes('.') ? 1 : 0;
    
    return (
        <div 
            className="bg-gray-800 p-6 rounded-2xl shadow-lg flex flex-col justify-between transition-all duration-300 hover:-translate-y-2 hover:scale-[1.03] hover:shadow-2xl hover:shadow-blue-500/10 hover:ring-2 hover:ring-blue-500/50 min-h-[160px] animate-fade-in-up" 
            style={{ animationDelay }}
        >
            <div className="flex items-center justify-between text-gray-400">
                <span className="text-lg font-medium">{title}</span>
                <IconComponent className="w-7 h-7" />
            </div>
            <div>
                <p className={`text-4xl font-bold mt-2 ${valueColorClass}`}>
                    {useCountUp ? (
                        <CountUp
                            end={numericValue}
                            duration={2.5}
                            decimals={decimals}
                            decimal=","
                            separator=" "
                            suffix={unit}
                        />
                    ) : (
                        <>{value}{unit}</>
                    )}
                </p>
                {subText && <p className="text-sm text-gray-400 mt-1">{subText}</p>}
                 {goal && (
                    <div>
                        <ProgressBar value={numericValue} goal={goal} />
                        <p className="text-right text-xs text-gray-400 mt-1">Objectif: {goal}{unit}</p>
                    </div>
                )}
            </div>
        </div>
    );
});

const RankingList = React.memo(({ title, data, keyName, valueName, rankKey = 'rank', unit, icon, highlight, searchTerm, onSearchChange, animationDelay, isExpanded, collapsedItemCount = 3, showToggleButton = false, onToggleExpand = () => {}, renderValue }) => {
    const IconComponent = icon;
    const bgMedalColors = ['bg-yellow-400', 'bg-gray-300', 'bg-yellow-600'];
    
    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        return data.filter(item => String(item[keyName]).toLowerCase().includes(searchTerm.toLowerCase()));
    }, [data, searchTerm, keyName]);

    const displayedData = isExpanded ? filteredData : filteredData.slice(0, collapsedItemCount);

    const getTooltipText = (change) => {
        if (change === null || change === undefined) return '';
        if (change === 0) return 'Position stable';
        const places = Math.abs(change) === 1 ? 'place' : 'places';
        return change > 0 ? `Gagné ${change} ${places}` : `Perdu ${Math.abs(change)} ${places}`;
    };

    return (
        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg h-full flex flex-col animate-fade-in-up" style={{ animationDelay }}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                    <IconComponent className="w-6 h-6 mr-3 text-white" />
                    <h3 className="text-xl font-bold text-white leading-tight">{title}</h3>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input type="text" placeholder="Rechercher..." value={searchTerm} onChange={onSearchChange} className="bg-gray-700/50 rounded-lg pl-10 pr-3 py-1.5 text-sm w-full max-w-xs focus:ring-2 focus:ring-blue-500 outline-none text-white"/>
                </div>
            </div>
            <ul className="space-y-3 flex-grow transition-all duration-300">
                {displayedData.length === 0 && <li className="text-gray-400 text-center py-4">Aucun résultat</li>}
                {displayedData.map((item, index) => (
                    <li key={`${item[keyName]}-${index}`} className={`flex items-center p-3 rounded-lg transition-colors ${String(item[keyName]).trim().toLowerCase() === String(highlight).trim().toLowerCase() ? 'bg-blue-500/20 ring-1 ring-blue-400' : 'bg-gray-700/50'}`}>
                        <div className="flex items-center flex-grow">
                             <span className={`w-8 h-6 flex items-center justify-center font-bold rounded mr-3 text-sm ${item[rankKey] <= 3 && !item.noReviews ? `${bgMedalColors[item[rankKey]-1]} text-gray-900` : 'text-gray-400'}`}>
                                {item.noReviews ? '-' : item[rankKey]}
                             </span>
                            <span className="font-medium text-white">{item[keyName]}</span>
                            
                            {item.rankChange !== null && item.rankChange !== undefined && !item.noReviews && (
                                <Tooltip text={getTooltipText(item.rankChange)}>
                                    <span className="ml-2 flex items-center">
                                        {item.rankChange > 0 && <TrendingUp size={18} className="text-green-400" />}
                                        {item.rankChange < 0 && <TrendingDown size={18} className="text-red-400" />}
                                        {item.rankChange === 0 && <Minus size={18} className="text-gray-400" />}
                                    </span>
                                </Tooltip>
                            )}
                        </div>
                        {renderValue ? renderValue(item) : (
                             <span className="font-bold text-lg text-white ml-4">
                               {item.noReviews ? (
                                   <span className="text-sm italic text-gray-400">Non classé</span>
                               ) : (
                                   <>{item[valueName]}{unit}</>
                               )}
                            </span>
                        )}
                    </li>
                ))}
            </ul>
             {showToggleButton && (
                <button onClick={onToggleExpand} className="w-full mt-4 text-center text-blue-400 hover:text-blue-300 font-semibold flex items-center justify-center gap-2 transition-colors py-2 rounded-lg hover:bg-blue-500/10">
                    {isExpanded ? 'Voir moins' : `Voir les ${data.length - collapsedItemCount} autres`}
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
            )}
        </div>
    );
});

const DataEntryForm = ({ onSave, initialData, isSaving }) => {
    const getInitialListState = (defaultList, initialRanking) => {
        if (!initialRanking || initialRanking.length === 0) {
            return defaultList;
        }
        const initialMap = new Map(initialRanking.map(item => [item.name, item]));
        return defaultList.map(defaultItem => {
            const savedItem = initialMap.get(defaultItem.name);
            return savedItem ? { ...defaultItem, ...savedItem } : defaultItem;
        });
    };

    const [csatMagasin, setCsatMagasin] = useState(initialData?.csatMagasin || '');
    const [responseRate, setResponseRate] = useState(initialData?.responseRate || '');
    const [googleRating, setGoogleRating] = useState(initialData?.googleRating || '');
    const [googleReviews, setGoogleReviews] = useState(initialData?.googleReviews || '');
    const [stores, setStores] = useState(() => getInitialListState(DEFAULT_STORES, initialData?.storeRanking));
    const [advisors, setAdvisors] = useState(() => getInitialListState(DEFAULT_ADVISORS, initialData?.advisorRanking));
    const [formError, setFormError] = useState(null);

    const handleListChange = (list, setList, index, field, value) => { 
        const newList = [...list];
        newList[index][field] = value; 
        setList(newList); 
        setFormError(null); 
    };
    
    const handleAdvisorCheckboxChange = (index, checked) => {
        const newList = [...advisors];
        newList[index].noReviews = checked;
        if (checked) {
            newList[index].score = '';
            newList[index].responses = '';
        }
        setAdvisors(newList);
    };
    
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        setFormError(null);
        try {
            if (csatMagasin === '' || isNaN(parseFloat(csatMagasin))) throw new Error("Le CSAT Magasin doit être un nombre.");
            if (responseRate === '' || isNaN(parseFloat(responseRate))) throw new Error("Le Taux de réponse doit être un nombre.");

            const parsedStores = stores.map(item => {
                const name = String(item.name).trim();
                const satisfaction = String(item.satisfaction).trim();
                if (name && satisfaction && !isNaN(parseFloat(satisfaction))) {
                    return { name, satisfaction: parseFloat(satisfaction) };
                }
                if (name) {
                    return { name, satisfaction: 0 };
                }
                return null;
            }).filter(Boolean);

            const parsedAdvisors = advisors.map(item => {
                const name = String(item.name).trim();
                if (!name) return null;
                const code = item.code || '';
                if (item.noReviews) {
                    return { name, code, score: 0, responses: 0, noReviews: true };
                }
                const scoreStr = String(item.score).trim();
                const responsesStr = String(item.responses).trim();
                if (!scoreStr || isNaN(parseFloat(scoreStr)) || !responsesStr || isNaN(parseInt(responsesStr))) {
                    return { name, code, score: 0, responses: 0, noReviews: false };
                }
                return { name, code, score: parseFloat(scoreStr), responses: parseInt(responsesStr, 10), noReviews: false };
            }).filter(Boolean);

            const now = new Date();
            const weekId = `week-${now.getFullYear()}-${String(getWeekNumber(now)).padStart(2, '0')}`;
            
            await onSave({
                weekId,
                createdAt: now.toISOString(),
                csatMagasin: parseFloat(csatMagasin),
                responseRate: parseFloat(responseRate),
                googleRating: parseFloat(googleRating) || 0,
                googleReviews: parseInt(googleReviews, 10) || 0,
                storeRanking: parsedStores,
                advisorRanking: parsedAdvisors,
            });
        } catch (error) { 
            setFormError(error.message); 
        }
    }, [csatMagasin, responseRate, googleRating, googleReviews, stores, advisors, onSave]);

    return (
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl mb-8 border border-blue-500 animate-fade-in">
            <h2 className="text-2xl font-bold text-white mb-6">Saisie des données</h2>
            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div><label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="csat-magasin">CSAT Magasin (%)</label><input id="csat-magasin" type="number" step="0.1" value={csatMagasin} onChange={(e) => setCsatMagasin(e.target.value)} required className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3"/></div>
                    <div><label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="response-rate">Taux de réponses (%)</label><input id="response-rate" type="number" step="0.1" value={responseRate} onChange={(e) => setResponseRate(e.target.value)} required className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3"/></div>
                    <div><label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="google-rating">Note Google (/5)</label><input id="google-rating" type="number" step="0.1" value={googleRating} onChange={(e) => setGoogleRating(e.target.value)} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3"/></div>
                    <div><label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="google-reviews">Nombre d'avis Google</label><input id="google-reviews" type="number" value={googleReviews} onChange={(e) => setGoogleReviews(e.target.value)} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3"/></div>
                </div>
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white">Classement Boutiques</h3>
                    {stores.map((store, index) => (<div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                        <input type="text" readOnly placeholder="Nom boutique" value={store.name} className="md:col-span-2 w-full bg-gray-600 p-2 rounded-lg text-gray-300 cursor-not-allowed"/>
                        <input type="number" step="0.1" placeholder="Satisfaction (%)" value={store.satisfaction} onChange={(e) => handleListChange(stores, setStores, index, 'satisfaction', e.target.value)} className="md:col-span-2 w-full bg-gray-700 p-2 rounded-lg"/>
                    </div>))}
                </div>
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white">Classement Conseillers</h3>
                    {advisors.map((advisor, index) => (<div key={index} className="grid grid-cols-12 gap-3 items-center">
                        <input type="text" readOnly placeholder="Nom conseiller" value={advisor.name} className="col-span-12 md:col-span-3 w-full bg-gray-600 p-2 rounded-lg text-gray-300 cursor-not-allowed"/>
                        <input type="text" readOnly placeholder="Code" value={advisor.code || ''} className="col-span-12 md:col-span-2 w-full bg-gray-600 p-2 rounded-lg text-gray-300 cursor-not-allowed"/>
                        <input type="number" step="0.1" placeholder="Score (%)" value={advisor.score} disabled={advisor.noReviews} onChange={(e) => handleListChange(advisors, setAdvisors, index, 'score', e.target.value)} className="col-span-6 md:col-span-2 w-full bg-gray-700 p-2 rounded-lg disabled:bg-gray-600 disabled:opacity-50"/>
                        <input type="number" placeholder="Nb rép." value={advisor.responses} disabled={advisor.noReviews} onChange={(e) => handleListChange(advisors, setAdvisors, index, 'responses', e.target.value)} className="col-span-6 md:col-span-2 w-full bg-gray-700 p-2 rounded-lg disabled:bg-gray-600 disabled:opacity-50"/>
                        <label className="col-span-12 md:col-span-3 flex items-center gap-2 text-sm text-gray-300 cursor-pointer"><input type="checkbox" checked={advisor.noReviews} onChange={(e) => handleAdvisorCheckboxChange(index, e.target.checked)} className="h-4 w-4 rounded bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-500" /> Sans avis</label>
                    </div>))}
                </div>
                {formError && (<div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-lg flex items-center space-x-3"><AlertCircle className="w-5 h-5" /><span>{formError}</span></div>)}
                <button type="submit" disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSaving ? 'Enregistrement...' : 'Enregistrer les données'}
                </button>
            </form>
        </div>
    );
};

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

const ConfirmationModal = ({ onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 animate-fade-in-up">
            <div className="text-center">
                <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
                <h3 className="mt-4 text-xl font-medium text-white">Voulez-vous vraiment fermer ?</h3>
                <p className="mt-2 text-sm text-gray-400">Vos modifications non enregistrées seront perdues.</p>
            </div>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors">Annuler</button>
                <button onClick={onConfirm} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">Oui, fermer</button>
            </div>
        </div>
    </div>
);

// =================================================================
// COMPOSANT PRINCIPAL : App
// =================================================================

export default function App() {
    const [reports, setReports] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [dbError, setDbError] = useState(null);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authReady, setAuthReady] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const [isDataEntryVisible, setDataEntryVisible] = useState(false);
    const [showLogin, setShowLogin] = useState(false);
    const [showConfirmClose, setShowConfirmClose] = useState(false);
    
    const [storeSearch, setStoreSearch] = useState('');
    const [advisorPerfSearch, setAdvisorPerfSearch] = useState('');

    const [storeListExpanded, setStoreListExpanded] = useState(false);
    const [advisorListExpanded, setAdvisorListExpanded] = useState(false);
    
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const authInstance = getAuth(app);
            setDb(firestore);
            setAuth(authInstance);
            
            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                setIsAdmin(!!(user && !user.isAnonymous && user.email === ADMIN_EMAIL));
                if (!user) {
                    signInAnonymously(authInstance).catch(err => console.error("Anonymous sign-in failed", err));
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
    
    useEffect(() => {
        if (!authReady || !db) return;
        const q = query(collection(db, `artifacts/${APP_ID}/public/data/reports`), orderBy("createdAt", "desc"), limit(10));
        const unsubscribe = onSnapshot(q, 
            (snapshot) => { 
                setReports(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))); 
                setIsLoading(false); 
                setDbError(null);
            }, 
            (err) => { 
                console.error("Error fetching data:", err);
                setDbError("Impossible de charger les données. Vérifiez les règles de sécurité Firestore.");
                setIsLoading(false);
            }
        );
        return () => unsubscribe();
    }, [authReady, db]);

    const handleLogin = useCallback(async (email, password) => {
        setLoginError(null);
        try { 
            await signInWithEmailAndPassword(auth, email, password);
            setShowLogin(false);
        } catch (error) {
            console.error("Login failed:", error.code);
            setLoginError("Email ou mot de passe incorrect.");
        }
    }, [auth]);

    const handleLogout = useCallback(() => { 
        signOut(auth);
        setDataEntryVisible(false);
    }, [auth]);

    const handleSaveData = useCallback(async (data) => {
        if (!db) {
            setDbError("Connexion à la base de données échouée.");
            return;
        }
        setIsSaving(true);
        try {
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/reports`, data.weekId), data);
            setDataEntryVisible(false);
        } catch (e) {
            console.error("Save error:", e);
            setDbError("L'enregistrement a échoué. Vérifiez la console pour plus de détails.");
        } finally {
            setIsSaving(false);
        }
    }, [db]);
    
    const processedData = useMemo(() => {
        const current = reports[0] || null;
        const previous = reports[1] || null;

        if (!current) {
            return {
                myStoreName: MY_STORE_NAME, currentReport: null, rankedData: { storesBySat: [], advisorsByPerf: [] },
                mainStoreRank: null, regionalData: {}, topPerformer: null,
            };
        }
        
        const calculatePerformance = (advisor) => ({
            ...advisor,
            performanceScore: (advisor.score || 0) * (advisor.responses || 0),
        });

        const advisorRanking = (current.advisorRanking || []).map(calculatePerformance);
        const previousAdvisorRanking = (previous?.advisorRanking || []).map(calculatePerformance);
        const storeRanking = current.storeRanking || [];
        
        const rankedData = {
            storesBySat: addRankChanges(calculateRanks(storeRanking, RANKING_KEYS.SATISFACTION), previous?.storeRanking, RANKING_KEYS.SATISFACTION, RANKING_KEYS.NAME),
            advisorsByPerf: addRankChanges(calculateRanks(advisorRanking, RANKING_KEYS.PERFORMANCE), previousAdvisorRanking, RANKING_KEYS.PERFORMANCE, RANKING_KEYS.NAME),
        };
        
        const calculateAverage = (r = []) => r.length === 0 ? 0 : r.reduce((sum, store) => sum + (store.satisfaction || 0), 0) / r.length;
        const regionalData = { average: calculateAverage(storeRanking) };
        
        const mainStoreRank = rankedData.storesBySat.find(s => String(s.name).trim().toLowerCase() === MY_STORE_NAME.trim().toLowerCase());
        
        const topPerformer = advisorRanking.length > 0 
            ? [...advisorRanking]
                .filter(a => !a.noReviews)
                .sort((a,b) => b.performanceScore - a.performanceScore)[0] 
            : null;

        return { currentReport: current, rankedData, mainStoreRank, myStoreName: MY_STORE_NAME, regionalData, topPerformer };
    }, [reports]);

    const handleAttemptCloseForm = () => setShowConfirmClose(true);
    const handleConfirmClose = () => { setDataEntryVisible(false); setShowConfirmClose(false); };
    const handleCancelClose = () => setShowConfirmClose(false);

    if (!authReady) {
        return <div className="bg-gray-900 min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" /></div>;
    }

    const { currentReport, rankedData, mainStoreRank, myStoreName, regionalData, topPerformer } = processedData;

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <AnimationStyles />
            {showLogin && <LoginForm onLogin={handleLogin} error={loginError} onClose={() => setShowLogin(false)} />}
            {showConfirmClose && <ConfirmationModal onConfirm={handleConfirmClose} onCancel={handleCancelClose} />}

            <div className="max-w-7xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight">CSAT Tracker 2.0</h1>
                        <p className="text-gray-400 mt-1">
                            {currentReport ? `Mise à jour : ${new Date(currentReport.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : "En attente de données..."}
                        </p>
                    </div>
                    <div className="mt-4 sm:mt-0 flex items-center gap-4">
                        {isAdmin ? (
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-blue-300"> <UserCheck size={18}/> <span>Mode Admin</span></div>
                                <button onClick={isDataEntryVisible ? handleAttemptCloseForm : () => setDataEntryVisible(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">{isDataEntryVisible ? 'Fermer' : 'Saisir Données'}</button>
                                <button onClick={handleLogout} title="Se déconnecter" aria-label="Se déconnecter" className="text-gray-400 hover:text-white transition-colors"><LogOut size={22}/></button>
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
                {isAdmin && isDataEntryVisible && <DataEntryForm onSave={handleSaveData} initialData={currentReport} isSaving={isSaving} />}
                {!currentReport && isLoading && ( <div className="text-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto" /></div> )}
                {!currentReport && !isLoading && !dbError && (
                    <div className="text-center py-20 bg-gray-800 rounded-2xl">
                        <h2 className="text-2xl font-semibold text-gray-300">Aucun rapport disponible.</h2>
                        {isAdmin && <p className="text-gray-400 mt-2">Cliquez sur "Saisir Données" pour commencer.</p>}
                    </div>
                )}
                
                {currentReport && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard title="CSAT Magasin" value={(currentReport.csatMagasin || 0).toFixed(1)} unit="%" icon={Star} isLoading={isLoading} goal={GOALS.CSAT.goal} animationDelay="0s" useCountUp />
                            <StatCard title="Taux de Réponse" value={(currentReport.responseRate || 0).toFixed(1)} unit="%" icon={Percent} isLoading={isLoading} goal={GOALS.RESPONSE_RATE.goal} animationDelay="100ms" useCountUp />
                            <StatCard 
                                title="Classement Régional" 
                                value={mainStoreRank?.rank ? (mainStoreRank.rank === 1 ? '1er' : `${mainStoreRank.rank}e`) : 'N/A'}
                                unit={mainStoreRank?.rank ? ' place' : ''}
                                icon={Store} 
                                isLoading={isLoading} 
                                animationDelay="200ms"
                            />
                            <StatCard title="CSAT Région" value={(regionalData.average || 0).toFixed(1)} unit="%" icon={Crown} isLoading={isLoading} animationDelay="300ms" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                           <TopPerformerCard performer={topPerformer} />
                           <StatCard title="Note Google" value={(currentReport.googleRating || 0).toFixed(1)} unit="/5" subText={`${currentReport.googleReviews || 0} avis`} icon={Star} isLoading={isLoading} animationDelay="400ms" />
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                            <RankingList 
                                title="Classement Boutiques (par Satisfaction)" 
                                data={rankedData.storesBySat} 
                                keyName={RANKING_KEYS.NAME} 
                                valueName={RANKING_KEYS.SATISFACTION} 
                                unit="%" 
                                icon={Crown} 
                                highlight={myStoreName} 
                                searchTerm={storeSearch} 
                                onSearchChange={(e) => setStoreSearch(e.target.value)} 
                                animationDelay="500ms" 
                                isExpanded={storeListExpanded}
                                collapsedItemCount={3}
                                showToggleButton={rankedData.storesBySat.length > 3}
                                onToggleExpand={() => setStoreListExpanded(prev => !prev)}
                            />
                            <RankingList 
                                title={
                                    <div className="flex items-center gap-2">
                                        <span>Classement Conseillers (par Performance)</span>
                                        <Tooltip text={"Ce classement est basé sur le Score de Performance.\n\nFormule :\nScore de satisfaction (%) x Nombre de réponses"}>
                                            <Info size={18} className="cursor-help text-gray-400 hover:text-white"/>
                                        </Tooltip>
                                    </div>
                                }
                                data={rankedData.advisorsByPerf} 
                                keyName={RANKING_KEYS.NAME} 
                                icon={Award}
                                searchTerm={advisorPerfSearch} 
                                onSearchChange={(e) => setAdvisorPerfSearch(e.target.value)} 
                                animationDelay="600ms" 
                                isExpanded={advisorListExpanded}
                                collapsedItemCount={3}
                                showToggleButton={rankedData.advisorsByPerf.length > 3}
                                onToggleExpand={() => setAdvisorListExpanded(prev => !prev)}
                                renderValue={(item) => (
                                    <div className="text-right">
                                        {item.noReviews ? (
                                            <span className="text-sm italic text-gray-400">Non classé</span>
                                        ) : (
                                            <div className="flex items-baseline justify-end gap-3">
                                                <span className="font-bold text-white text-lg">{item.score}%</span>
                                                <span className="font-medium text-gray-400 text-base">({item.responses} rép.)</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
