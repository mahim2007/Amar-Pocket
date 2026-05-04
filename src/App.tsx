/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Minus, 
  Download, 
  Trash2, 
  Wallet, 
  ArrowUpCircle, 
  ArrowDownCircle,
  Clock,
  Filter,
  X,
  LogOut,
  LogIn,
  Loader2,
  Mail,
  Lock,
  User as UserIcon,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  History,
  LayoutDashboard,
  Settings,
  ChevronRight,
  PlusCircle,
  ArrowRight,
  XCircle,
  HelpCircle,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, isAfter } from 'date-fns';
import { bn } from 'date-fns/locale';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Firebase imports
import { 
  auth, 
  db, 
  googleProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  reload,
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  orderBy,
  handleFirestoreError,
  OperationType,
  type User
} from './lib/firebase';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type TransactionType = 'income' | 'expense';

interface Transaction {
  id: string;
  amount: number;
  category: string;
  type: TransactionType;
  date: string; // ISO string
  time: string;
  note: string;
  userId: string;
  createdAt: string;
}

// --- Constants ---
const CATEGORIES = {
  income: ['ব্যাবসা', 'বেতন', 'বোনাস', 'উপহার', 'বিনিয়োগ', 'অন্যান্য'],
  expense: ['খাবার', 'যাতায়াত', 'ব্যাবসা', 'বাজার', 'বিল', 'মেডিকেল', 'কেনাকাটা', 'বিনোদন', 'অন্যান্য']
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [note, setNote] = useState('');

  // Auth UI state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // PDF Export State
  const reportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDays, setExportDays] = useState<number | 'all'>(7);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPhotoURL, setNewPhotoURL] = useState('');

  // Custom UI Dialog State
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'confirm' | 'alert' | 'success' | 'error';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert'
  });

  const showDialog = (title: string, message: string, type: 'confirm' | 'alert' | 'success' | 'error', onConfirm?: () => void) => {
    setDialog({ isOpen: true, title, message, type, onConfirm });
  };

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  // Handle Auth
  useEffect(() => {
    let isMounted = true;
    
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && isMounted) {
          // Successfully logged in via redirect
          showDialog('সফল', 'Google এর মাধ্যমে সফলভাবে লগইন হয়েছে।', 'success');
        }
      } catch (error: any) {
        console.error('Redirect Result Error:', error);
        if (isMounted) {
          if (error.code === 'auth/credential-already-in-use') {
            setAuthError('এই অ্যাকাউন্টটি ইতিপূর্বে অন্যভাবে নিবন্ধিত হয়েছে।');
          } else {
            setAuthError(`লগইন ব্যর্থ: ${error.message}`);
          }
        }
      }
    };
    checkRedirect();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!isMounted) return;
      
      const isEmailPasswordUser = currentUser?.providerData?.some(p => p.providerId === 'password');
      const needsEmailVerification = currentUser && !currentUser.emailVerified && isEmailPasswordUser;
      
      if (needsEmailVerification) {
        setIsVerifying(true);
      } else {
        setIsVerifying(false);
      }
      
      setUser(currentUser);
      if (currentUser) {
        setNewDisplayName(currentUser.displayName || '');
        setNewPhotoURL(currentUser.photoURL || '');
      } else {
        // Reduced timeout for faster feel
        setTimeout(() => {
          if (isMounted) setLoading(false);
        }, 100);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Sync Transactions
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const path = 'transactions';
    const q = query(
      collection(db, path),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      
      setTransactions(txs);
      
      // Stop skeleton loading as soon as we have data (could be from cache)
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  // Calculations
  const summary = useMemo(() => {
    return transactions.reduce((acc, curr) => {
      if (curr.type === 'income') acc.income += curr.amount;
      else acc.expense += curr.amount;
      return acc;
    }, { income: 0, expense: 0 });
  }, [transactions]);

  const balance = summary.income - summary.expense;

  // Auth Actions
  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    
    try {
      // Prefer popup
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Google Login Error:', error);
      
      if (error.code === 'auth/popup-blocked') {
        showDialog(
          'পপআপ ব্লকড', 
          'আপনার ব্রাউজারে পপআপ ব্লক করা আছে। বিকল্প পদ্ধতিতে চেষ্টা করতে চান?', 
          'confirm',
          () => signInWithRedirect(auth, googleProvider)
        );
      } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        // User closed
      } else if (error.code === 'auth/operation-not-allowed') {
        showDialog('কনফিগারেশন সমস্যা', 'Firebase কনসোলে Google Login মেথডটি এনাবল করা নেই।', 'error');
      } else {
        // Try fallback if popup fails
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError) {
          showDialog('লগইন ব্যর্থ', `Google লগইন করা সম্ভব হয়নি। (Error: ${error.code})`, 'error');
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      if (authMode === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: fullName });
        await sendEmailVerification(userCredential.user);
        setIsVerifying(true);
        showDialog('সফল', 'অ্যাকাউন্ট তৈরি হয়েছে! আপনার ইমেইল যাচাইয়ের জন্য একটি লিংক পাঠানো হয়েছে।', 'success');
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          setIsVerifying(true);
          await sendEmailVerification(userCredential.user);
        }
      }
    } catch (error: any) {
      console.error('Auth Error:', error);
      if (error.code === 'auth/email-already-in-use') setAuthError('এই ইমেইলটি ইতিপূর্বে ব্যবহার করা হয়েছে।');
      else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') setAuthError('পাসওয়ার্ড বা ইমেইল সঠিক নয়।');
      else if (error.code === 'auth/too-many-requests') setAuthError('অতিরিক্ত চেষ্টার কারণে অ্যাকাউন্ট সাময়িকভাবে বন্ধ। পরে চেষ্টা করুন।');
      else setAuthError('লগইন ব্যর্থ হয়েছে। তথ্য যাচাই করুন।');
    } finally {
      setAuthLoading(false);
    }
  };

  const checkEmailVerificationStatus = async () => {
    if (!auth.currentUser) return;
    setAuthLoading(true);
    try {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        setUser({ ...auth.currentUser });
        setIsVerifying(false);
        showDialog('সফল', 'ইমেইল সফলভাবে যাচাই করা হয়েছে!', 'success');
      } else {
        showDialog('অপেক্ষমান', 'আপনার ইমেইল এখনও যাচাই করা হয়নি। দয়া করে ইনবক্স চেক করুন।', 'alert');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    showDialog(
      'লগ-আউট নিশ্চিত করুন', 
      'আপনি কি আপনার অ্যাকাউন্ট থেকে লগ-আউট করতে চান?', 
      'confirm', 
      () => signOut(auth)
    );
  };

  // Transaction Actions
  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category || !user || isSaving) return;

    const txAmount = parseFloat(amount);
    const txCategory = category;
    const txType = type;
    const txNote = note;
    const now = new Date();
    const tempId = `temp-${Date.now()}`;

    // Optimistic Transaction Object
    const optimisticTx: Transaction = {
      id: tempId,
      amount: txAmount,
      category: txCategory,
      type: txType,
      date: now.toISOString(),
      time: format(now, 'hh:mm a'),
      note: txNote,
      userId: user.uid,
      createdAt: now.toISOString()
    };

    // Update state immediately
    setTransactions(prev => [optimisticTx, ...prev]);
    
    // Reset form UI immediately
    setIsAdding(false);
    setAmount('');
    setCategory('');
    setNote('');

    try {
      const path = 'transactions';
      await addDoc(collection(db, path), {
        amount: txAmount,
        category: txCategory,
        type: txType,
        date: now.toISOString(),
        time: format(now, 'hh:mm a'),
        note: txNote,
        userId: user.uid,
        createdAt: now.toISOString()
      });
      // The onSnapshot listener will eventually sync the real document (with real ID)
    } catch (error) {
      console.error(error);
      // Rollback on failure
      setTransactions(prev => prev.filter(tx => tx.id !== tempId));
      showDialog('ত্রুটি', 'হিসাব যোগ করা সম্ভব হয়নি। ইন্টারনেটে সমস্যা হতে পারে।', 'error');
    }
  };

  const deleteTransaction = async (id: string) => {
    showDialog(
      'রেকর্ড মুছে ফেলুন',
      'আপনি কি নিশ্চিতভাবে এই রেকর্ডটি মুছে ফেলতে চান?',
      'confirm',
      async () => {
        try {
          await deleteDoc(doc(db, 'transactions', id));
          showDialog('সফল', 'রেকর্ডটি সফলভাবে মুছে ফেলা হয়েছে।', 'success');
        } catch (error) {
          console.error(error);
          showDialog('ত্রুটি', 'রেকর্ডটি মুছে ফেলা সম্ভব হয়নি।', 'error');
        }
      }
    );
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setAuthLoading(true);
    try {
      await updateProfile(user, { 
        displayName: newDisplayName.trim() || user.displayName,
        photoURL: newPhotoURL.trim() || user.photoURL
      });
      setIsProfileOpen(false);
      showDialog('সফল', 'প্রোফাইল সফলভাবে আপডেট হয়েছে!', 'success');
    } catch (error) {
      showDialog('ত্রুটি', 'আপডেট করা সম্ভব হয়নি। আবার চেষ্টা করুন।', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showDialog('বড় ফাইল', 'ছবিটি ২ এমবি এর বেশি হতে পারবে না।', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewPhotoURL(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Improved PDF Export using html2canvas to support Bengali
  const exportPDFWithCanvas = async (days: number | 'all') => {
    setIsExporting(true);
    setExportDays(days);
    
    // Wait for state update and rendering
    setTimeout(async () => {
      const element = reportRef.current;
      if (!element) return;

      try {
        // Higher scale for 2x clarity, but keeping it reasonable for file size
        const canvas = await html2canvas(element, {
          scale: 2, 
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        
        // Use 0.8 quality for crisp text with decent compression
        const imgData = canvas.toDataURL('image/jpeg', 0.8); 
        const pdf = new jsPDF('p', 'mm', 'a4', true);
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
        pdf.save(`${user?.displayName || 'pocket'}_statement_${days === 'all' ? 'total' : days + 'days'}.pdf`);
      } catch (err) {
        console.error('PDF Export failed', err);
        showDialog('ত্রুটি', 'পিডিএফ এক্সপোর্ট করা সম্ভব হচ্ছে না।', 'error');
      } finally {
        setIsExporting(false);
      }
    }, 500);
  };

  // --- Loading Screen ---
  if (loading && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-slate-100 border-t-emerald-500 rounded-full animate-spin" />
          <img src="/logo.png" alt="Logo" className="w-10 h-10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" onError={(e) => (e.currentTarget.style.display='none')} />
        </div>
        <p className="mt-6 text-slate-400 font-bold text-[10px] uppercase tracking-widest animate-pulse">লোড হচ্ছে...</p>
      </div>
    );
  }

  // --- Auth View (Premium Mobile Experience) ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] bg-emerald-500/10 blur-[130px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-500/10 blur-[110px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white/90 backdrop-blur-xl p-8 rounded-[3.5rem] shadow-[0_32px_80px_-20px_rgba(0,0,0,0.1)] border border-white z-10 relative"
        >
          <div className="text-center mb-10">
            <div className="bg-white w-20 h-20 rounded-[2.2rem] flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-emerald-500/10 border-2 border-slate-50">
              <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" onError={(e) => (e.currentTarget.style.display='none')} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tight">আমার পকেট</h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] leading-none">Smart Expense Tracker</p>
          </div>

          <div className="flex bg-slate-100/50 rounded-2xl p-1.5 mb-8 border border-slate-100 shadow-inner">
            <button 
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className={cn(
                "flex-1 py-4 rounded-xl text-sm font-black transition-all duration-300",
                authMode === 'login' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600 font-bold"
              )}
            >
              প্রবেশ
            </button>
            <button 
              onClick={() => { setAuthMode('signup'); setAuthError(''); }}
              className={cn(
                "flex-1 py-4 rounded-xl text-sm font-black transition-all duration-300",
                authMode === 'signup' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600 font-bold"
              )}
            >
              নিবন্ধন
            </button>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-4">
            <AnimatePresence mode="wait">
              {authMode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="relative group">
                    <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="text" 
                      placeholder="আপনার নাম"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white text-slate-900 placeholder:text-slate-400 transition-all font-bold text-base"
                      required
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative group">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              <input 
                type="email" 
                placeholder="ইমেইল অ্যাড্রেস"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white text-slate-900 placeholder:text-slate-400 transition-all font-bold text-base"
                required
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              <input 
                type="password" 
                placeholder="পাসওয়ার্ড"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white text-slate-900 placeholder:text-slate-400 transition-all font-bold text-base"
                required
                minLength={6}
              />
            </div>

            {authError && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-rose-500 text-[12px] font-bold flex items-center gap-3 bg-rose-50 p-4 rounded-2xl border border-rose-100"
              >
                <AlertCircle className="w-5 h-5 shrink-0" /> {authError}
              </motion.p>
            )}

            <button 
              disabled={authLoading}
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-5 rounded-2xl font-black text-lg transition-all active:scale-[0.98] shadow-xl shadow-emerald-500/20 disabled:opacity-50 mt-2"
            >
              {authLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : (authMode === 'login' ? 'শুরু করুন' : 'নিবন্ধন করুন')}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
            <div className="relative flex justify-center text-[10px]"><span className="bg-white px-4 text-slate-300 font-black uppercase tracking-[0.2em] leading-none">অথবা সোশ্যাল</span></div>
          </div>

          <button 
            onClick={handleGoogleLogin}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-100 text-slate-600 py-5 rounded-2xl font-black text-sm hover:border-emerald-500/50 hover:text-emerald-600 hover:bg-emerald-50 transition-all active:scale-[0.98] shadow-sm group"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Google অ্যাকাউন্ট দিয়ে লগইন
          </button>
        </motion.div>
      </div>
    );
  }

  // --- Verification View ---
  if (user && isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-500/5 blur-[120px] rounded-full" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white p-10 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] text-center border border-slate-100 z-10 relative"
        >
          <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-[2.2rem] flex items-center justify-center mx-auto mb-8 shadow-sm ring-4 ring-white">
            <Mail className="w-10 h-10" />
          </div>
          
          <h2 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">ইমেইল যাচাই করুন</h2>
          <p className="text-slate-500 text-sm font-medium mb-10 leading-relaxed px-4">
            আপনার <b>{user.email}</b> ঠিকানায় একটি ভেরিফিকেশন লিংক পাঠানো হয়েছে। দয়া করে ইনবক্স চেক করে লিংকে ক্লিক করুন।
          </p>
          
          <div className="space-y-4">
            <button 
              onClick={checkEmailVerificationStatus}
              disabled={authLoading}
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-sm shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              লিংকে ক্লিক করেছি
            </button>
            
            <button 
              onClick={() => {
                if (auth.currentUser) {
                  sendEmailVerification(auth.currentUser);
                  showDialog('সাফল্য', 'ভেরিফিকেশন ইমেইল পুনরায় পাঠানো হয়েছে।', 'success');
                }
              }}
              className="w-full bg-slate-50 text-slate-500 py-4.5 rounded-2xl font-black text-xs hover:bg-slate-100 transition-all border border-slate-100"
            >
              ইমেইল আবার পাঠান
            </button>
            
            <button 
              onClick={() => {
                signOut(auth);
                setIsVerifying(false);
              }}
              className="w-full text-slate-400 font-bold text-xs pt-4 hover:text-slate-600 transition-colors"
            >
              অন্য অ্যাকাউন্ট ব্যবহার করুন
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- Dashboard ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-32 font-sans">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-slate-100 px-6 py-4">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsProfileOpen(true)}
              className="w-10 h-10 rounded-2xl bg-emerald-500 overflow-hidden shadow-lg shadow-emerald-500/20 border-2 border-white active:scale-95 transition-all"
            >
               {user.photoURL ? (
                 <img src={user.photoURL} alt="User" referrerPolicy="no-referrer" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-white font-black text-sm uppercase">
                   {user.displayName?.[0] || user.email?.[0]}
                 </div>
               )}
            </button>
            <div onClick={() => setIsProfileOpen(true)} className="cursor-pointer">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">শুভ দিন,</p>
              <h2 className="font-bold text-sm text-slate-800">{user.displayName?.split(' ')[0] || 'ইউজার'}</h2>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all font-bold"
          >
             <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 pt-6 space-y-6">
        {/* Main Balance Card */}
        <section className="relative group">
          <div className="absolute inset-0 bg-emerald-500 blur-[40px] opacity-10 group-hover:opacity-20 transition-opacity rounded-[2.5rem]" />
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/40 border border-white"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">মোট ব্যালেন্স</p>
                {loading ? (
                  <div className="h-10 w-32 bg-slate-100 animate-pulse rounded-xl" />
                ) : (
                  <h1 className="text-4xl font-black text-slate-900 tracking-tight">
                    <span className="text-emerald-500 text-2xl mr-1 font-bold">৳</span>
                    {balance.toLocaleString('en-US')}
                  </h1>
                )}
              </div>
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
                <Wallet className="w-6 h-6 text-slate-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <ArrowUpCircle className="w-4 h-4 font-bold" />
                  <span className="text-[10px] font-black uppercase tracking-wider">আয়</span>
                </div>
                {loading ? (
                  <div className="h-6 w-20 bg-slate-50 animate-pulse rounded-lg" />
                ) : (
                  <p className="text-lg font-black text-slate-800">৳{summary.income.toLocaleString('en-US')}</p>
                )}
              </div>
              <div className="space-y-1 border-l border-slate-100 pl-4">
                <div className="flex items-center gap-1.5 text-rose-500">
                  <ArrowDownCircle className="w-4 h-4 font-bold" />
                  <span className="text-[10px] font-black uppercase tracking-wider">ব্যয়</span>
                </div>
                {loading ? (
                  <div className="h-6 w-20 bg-slate-50 animate-pulse rounded-lg" />
                ) : (
                  <p className="text-lg font-black text-slate-800">৳{summary.expense.toLocaleString('en-US')}</p>
                )}
              </div>
            </div>
          </motion.div>
        </section>

        {/* Action Pills for Report */}
        <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
          <div className="flex gap-3 pb-2">
            {[
              { l: '১ দিন', d: 1 },
              { l: '৭ দিন', d: 7 },
              { l: '৩০ দিন', d: 30 },
              { l: 'আজীবন', d: 'all' }
            ].map((opt) => (
              <button 
                key={opt.l}
                onClick={() => exportPDFWithCanvas(opt.d as any)}
                disabled={isExporting}
                className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-900 hover:text-white rounded-2xl text-[10px] font-black transition-all border border-slate-100 shadow-sm whitespace-nowrap group disabled:opacity-50"
              >
                {isExporting && exportDays === opt.d ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 text-emerald-500 group-hover:text-white" />}
                {opt.l} রিপোর্ট
              </button>
            ))}
          </div>
        </div>

        {/* Recent Transactions List */}
        <section className="space-y-4">
          <div className="flex justify-between items-end px-1">
            <h3 className="font-black text-lg text-slate-800 tracking-tight">রেকর্ডসমূহ</h3>
            <div className="flex items-center gap-1 bg-white px-3 py-1 rounded-full border border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest shadow-sm">
               সাম্প্রতিক তথ্য
            </div>
          </div>

          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white p-5 rounded-[2rem] border border-slate-50 flex items-center justify-between animate-pulse">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 rounded-[1.25rem]" />
                        <div className="space-y-2">
                          <div className="h-3 w-20 bg-slate-50 rounded" />
                          <div className="h-2 w-12 bg-slate-50 rounded" />
                        </div>
                      </div>
                      <div className="h-4 w-16 bg-slate-50 rounded" />
                    </div>
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                   <div className="w-20 h-20 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-slate-200">
                      <History className="w-8 h-8" />
                   </div>
                   <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">রেকর্ড পাওয়া যায়নি</p>
                </div>
              ) : (
                transactions.map((tx, i) => (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-50 flex items-center justify-between group active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 shadow-sm",
                        tx.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                      )}>
                        {tx.type === 'income' ? <PlusCircle className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-slate-800 mb-0.5">{tx.category}</h4>
                        <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold uppercase tracking-[0.05em]">
                          <span>{format(new Date(tx.date), 'dd MMM', { locale: bn })}</span>
                          <span className="w-1 h-1 bg-slate-200 rounded-full" />
                          <span>{tx.time}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={cn(
                          "font-black text-base italic",
                          tx.type === 'income' ? "text-emerald-600" : "text-rose-500"
                        )}>
                          {tx.type === 'income' ? '+' : '-'} ৳{tx.amount.toLocaleString('en-US')}
                        </p>
                        {tx.note && <p className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]">{tx.note}</p>}
                      </div>
                      <button 
                        onClick={() => deleteTransaction(tx.id)}
                        className="p-2 text-slate-200 hover:text-rose-500 transition-all md:opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-10 right-6 z-50">
        <button 
          onClick={() => setIsAdding(true)}
          className="w-16 h-16 flex items-center justify-center bg-slate-900 text-white rounded-full font-black shadow-[0_20px_50px_rgba(0,0,0,0.3)] active:scale-90 transition-all hover:bg-emerald-600 hover:shadow-emerald-500/30 group"
          title="হিসাব যোগ করুন"
        >
          <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      {/* --- ADD MODAL --- */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 md:p-6 md:items-center overflow-y-auto no-scrollbar py-10 md:py-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-white rounded-t-[3rem] md:rounded-[3rem] p-8 shadow-2xl max-h-[92vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">নতুন এন্ট্রি</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">সঠিক তথ্য দিয়ে পূরণ করুন</p>
                </div>
                <button 
                  onClick={() => setIsAdding(false)} 
                  className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={addTransaction} className="space-y-6">
                {/* Type Toggle */}
                <div className="flex p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setType('expense')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all",
                      type === 'expense' ? "bg-white text-rose-600 shadow-xl border border-slate-100" : "text-slate-500"
                    )}
                  >
                    <ArrowDownCircle className="w-4 h-4" /> ব্যয়
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('income')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all",
                      type === 'income' ? "bg-white text-emerald-600 shadow-xl border border-slate-100" : "text-slate-500"
                    )}
                  >
                    <ArrowUpCircle className="w-4 h-4" /> আয়
                  </button>
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">টাকার পরিমাণ</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 text-2xl font-black">৳</span>
                    <input 
                      type="number" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-6 pl-12 pr-6 text-3xl font-black text-slate-900 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all placeholder:text-slate-200 shadow-inner"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">খাতা বা বিষয়</label>
                  <div className="grid grid-cols-3 gap-3">
                    {CATEGORIES[type].map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={cn(
                          "py-3.5 rounded-2xl text-[10px] font-black transition-all border-2",
                          category === cat 
                            ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/20" 
                            : "bg-white text-slate-400 border-slate-100 hover:border-slate-200 hover:text-slate-600"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">নোট (অপশনাল)</label>
                  <input 
                    type="text" 
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="নোট লিখে রাখুন..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 outline-none focus:bg-white transition-all text-sm font-medium"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={!amount || !category || isSaving}
                  className={cn(
                    "w-full py-5 rounded-[2rem] text-slate-950 font-black text-lg transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-3 disabled:opacity-50",
                    "bg-emerald-500 shadow-xl shadow-emerald-500/20"
                  )}
                >
                  {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <ArrowRight className="w-6 h-6" />}
                  {isSaving ? 'সেভ হচ্ছে...' : 'সেভ করুন'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- PROFILE/SETTINGS MODAL --- */}
      <AnimatePresence>
        {isProfileOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 overflow-y-auto no-scrollbar py-20">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProfileOpen(false)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-sm bg-white rounded-[3rem] p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-emerald-400 to-emerald-600" />
              
              <div className="relative pt-8 text-center">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-[2rem] bg-emerald-500 border-4 border-white shadow-xl mx-auto mb-2 overflow-hidden relative group"
                >
                  {newPhotoURL ? (
                    <img src={newPhotoURL} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : user.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-black text-3xl uppercase">
                      {user.displayName?.[0] || user.email?.[0]}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus className="w-8 h-8 text-white" />
                  </div>
                </button>
                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-4">ছবি পরিবর্তন করুন</p>
                
                <h3 className="text-xl font-black text-slate-900 mb-1">{user.displayName || 'ইউজার'}</h3>
                <p className="text-slate-400 text-xs font-medium mb-8">{user.email}</p>

                <form onSubmit={handleUpdateProfile} className="space-y-4 text-left">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">আপনার নাম</label>
                    <input 
                      type="text" 
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="নতুন নাম লিখুন"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-slate-800"
                      required
                    />
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-500 font-bold text-sm hover:bg-slate-200 transition-all"
                    >
                      বাতিল
                    </button>
                    <button 
                      disabled={authLoading || (!newDisplayName.trim() && !newPhotoURL.trim()) || (newDisplayName === user.displayName && newPhotoURL === user.photoURL)}
                      type="submit"
                      className="flex-[2] bg-emerald-500 text-slate-950 py-4 rounded-2xl font-black text-sm shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 transition-all"
                    >
                      {authLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'আপডেট করুন'}
                    </button>
                  </div>
                </form>

                <button 
                  onClick={() => { setIsProfileOpen(false); handleLogout(); }}
                  className="mt-8 text-rose-500 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 mx-auto hover:opacity-70 transition-all"
                >
                  <LogOut className="w-3 h-3" /> লগ-আউট করুন
                </button>
              </div>

              <button 
                onClick={() => setIsProfileOpen(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- CUSTOM DIALOG / ALERT --- */}
      <AnimatePresence>
        {dialog.isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDialog}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-[340px] bg-white rounded-[2.5rem] p-8 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] border border-slate-100 text-center"
            >
              <div className={cn(
                "w-20 h-20 rounded-[1.8rem] flex items-center justify-center mx-auto mb-6 shadow-sm",
                dialog.type === 'success' ? "bg-emerald-50 text-emerald-500" : 
                dialog.type === 'error' ? "bg-rose-50 text-rose-500" :
                dialog.type === 'confirm' ? "bg-blue-50 text-blue-500" : "bg-slate-50 text-slate-500"
              )}>
                {dialog.type === 'success' ? <PlusCircle className="w-10 h-10" /> : 
                 dialog.type === 'error' ? <XCircle className="w-10 h-10" /> :
                 dialog.type === 'confirm' ? <HelpCircle className="w-10 h-10" /> : <Info className="w-10 h-10" />}
              </div>

              <h3 className="text-xl font-black text-slate-900 mb-3 tracking-tight">{dialog.title}</h3>
              <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed px-1">{dialog.message}</p>

              <div className="flex gap-3">
                {dialog.type === 'confirm' && (
                  <button 
                    onClick={closeDialog}
                    className="flex-1 py-4.5 rounded-2xl bg-slate-50 text-slate-400 font-black text-xs hover:bg-slate-100 transition-all border border-slate-100"
                  >
                    না
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (dialog.onConfirm) dialog.onConfirm();
                    closeDialog();
                  }}
                  className={cn(
                    "flex-[1.5] py-4.5 rounded-2xl font-black text-xs shadow-lg transition-all active:scale-95",
                    dialog.type === 'confirm' ? "bg-slate-900 text-white shadow-slate-900/10" : 
                    dialog.type === 'error' ? "bg-rose-500 text-white shadow-rose-500/10" :
                    "bg-emerald-500 text-slate-950 shadow-emerald-500/10"
                  )}
                >
                  {dialog.type === 'confirm' ? 'হ্যাঁ, নিশ্চিত' : 'ঠিক আছে'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- HIDDEN REPORT COMPONENT FOR PDF CAPTURE --- */}
      <div className="fixed left-[-9999px] top-[-9999px]">
        <div 
          ref={reportRef} 
          className="bg-white w-[1000px] p-24 font-sans"
          style={{ 
            fontFeatureSettings: '"kern" 1, "liga" 1', 
            backgroundColor: '#ffffff',
            color: '#0f172a'
          }}
        >
          {/* Header Section */}
          <div className="pb-12 mb-12" style={{ borderBottom: '2px solid #0f172a' }}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-6">
                <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain" onError={(e) => (e.currentTarget.style.display='none')} />
                <div>
                  <h1 className="text-4xl font-black tracking-tight" style={{ color: '#0f172a' }}>আমার পকেট</h1>
                  <p className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#64748b' }}>Statement of Account</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>প্রস্তুতকাল</p>
                <p className="text-sm font-bold" style={{ color: '#0f172a' }}>{format(new Date(), 'dd MMMM, yyyy (hh:mm a)', { locale: bn })}</p>
              </div>
            </div>
          </div>

          {/* Account Summary & Info */}
          <div className="grid grid-cols-2 gap-16 mb-16">
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>হিসাবধারী</p>
                <h2 className="text-xl font-black" style={{ color: '#1e293b' }}>{user.displayName || 'ইউজার'}</h2>
                <p className="text-sm font-medium" style={{ color: '#64748b' }}>{user.email}</p>
              </div>
              <div className="pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>রিপোর্টের সময়কাল</p>
                <p className="text-sm font-bold" style={{ color: '#334155' }}>
                  {exportDays === 'all' ? 'শুরু থেকে আজ পর্যন্ত' : exportDays === 1 ? 'আজকের পূর্ণাঙ্গ তথ্য' : `বিগত ${exportDays} দিনের লেনদেন`}
                </p>
              </div>
            </div>
            
            <div className="p-10 border" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] mb-6 pb-4 border-b" style={{ color: '#64748b', borderColor: '#e2e8f0' }}>আর্থিক স্থিতি (Summary)</p>
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold" style={{ color: '#64748b' }}>মোট আয়:</span>
                  <span className="text-lg font-black" style={{ color: '#059669' }}>৳{summary.income.toLocaleString('en-US')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold" style={{ color: '#64748b' }}>মোট ব্যয়:</span>
                  <span className="text-lg font-black" style={{ color: '#e11d48' }}>৳{summary.expense.toLocaleString('en-US')}</span>
                </div>
                <div className="h-px my-2" style={{ backgroundColor: '#cbd5e1' }} />
                <div className="flex justify-between items-center">
                  <span className="text-base font-black px-4" style={{ color: '#0f172a', borderLeft: '4px solid #0f172a' }}>বর্তমান ব্যালেন্স:</span>
                  <span className="text-2xl font-black" style={{ color: '#0f172a' }}>৳{balance.toLocaleString('en-US')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Table */}
          <div className="mb-20">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-4" style={{ color: '#0f172a' }}>
              <span className="shrink-0">লেনদেনের বিস্তারিত</span>
              <div className="h-0.5 w-full" style={{ backgroundColor: '#0f172a' }} />
            </h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid #94a3b8' }}>
                  <th className="py-6 text-[10px] font-black uppercase" style={{ color: '#94a3b8' }}>তারিখ</th>
                  <th className="py-6 text-[10px] font-black uppercase" style={{ color: '#94a3b8' }}>সময়</th>
                  <th className="py-6 text-[10px] font-black uppercase" style={{ color: '#94a3b8' }}>খাত / বিবরণ</th>
                  <th className="py-6 text-[10px] font-black uppercase" style={{ color: '#94a3b8' }}>টাইপ</th>
                  <th className="py-6 text-[10px] font-black uppercase text-right" style={{ color: '#94a3b8' }}>পরিমাণ (৳)</th>
                </tr>
              </thead>
              <tbody>
                {(exportDays === 'all' ? transactions : transactions.filter(t => isAfter(new Date(t.date), subDays(new Date(), exportDays as number)))).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-20 text-center font-bold italic" style={{ color: '#cbd5e1' }}>কোনো লেনদেন পাওয়া যায়নি</td>
                  </tr>
                ) : (
                  (exportDays === 'all' ? transactions : transactions.filter(t => isAfter(new Date(t.date), subDays(new Date(), exportDays as number)))).map((tx) => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td className="py-6">
                        <p className="font-bold text-sm tracking-tight" style={{ color: '#1e293b' }}>{format(new Date(tx.date), 'dd/MM/yyyy')}</p>
                      </td>
                      <td className="py-6">
                        <p className="font-medium text-[10px] uppercase" style={{ color: '#94a3b8' }}>{tx.time}</p>
                      </td>
                      <td className="py-6">
                        <p className="font-black text-sm" style={{ color: '#1e293b' }}>{tx.category}</p>
                        {tx.note && <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>{tx.note}</p>}
                      </td>
                      <td className="py-6">
                        <span className="px-4 py-1.5 text-[9px] font-black uppercase border" style={{ 
                          backgroundColor: tx.type === 'income' ? '#ecfdf5' : '#fff1f2',
                          color: tx.type === 'income' ? '#047857' : '#be123c',
                          borderColor: tx.type === 'income' ? '#a7f3d0' : '#fecdd3'
                        }}>
                          {tx.type === 'income' ? 'CREDIT' : 'DEBIT'}
                        </span>
                      </td>
                      <td className="py-6 text-right">
                        <p className="font-black text-xl italic" style={{ 
                          color: tx.type === 'income' ? '#059669' : '#e11d48'
                        }}>
                          {tx.type === 'income' ? '+' : '-'} {tx.amount.toLocaleString('en-US')}
                        </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Section */}
          <div className="pt-12 text-center space-y-6" style={{ borderTop: '1px solid #e2e8f0' }}>
            <div className="flex justify-center gap-12">
              <div className="text-center">
                <div className="w-32 h-px mx-auto mb-3" style={{ backgroundColor: '#cbd5e1' }} />
                <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#94a3b8' }}>Client Signature</p>
              </div>
              <div className="text-center">
                <div className="w-32 h-px mx-auto mb-3" style={{ backgroundColor: '#e2e8f0' }} />
                <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#94a3b8' }}>Authorized Stamp</p>
              </div>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: '#cbd5e1' }}>Amar Pocket • Generated Digital Document</p>
          </div>
        </div>
      </div>

    </div>
  );
}
