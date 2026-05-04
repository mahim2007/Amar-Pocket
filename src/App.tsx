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
  Search,
  HelpCircle,
  Info,
  Utensils,
  Bus,
  ShoppingCart,
  Receipt,
  ShoppingBag,
  Stethoscope,
  Briefcase,
  Sparkles,
  Gift,
  MoreHorizontal,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, isAfter } from 'date-fns';
import { bn, enUS } from 'date-fns/locale';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { translations, type Language } from './translations';

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
  sendPasswordResetEmail,
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  getDocs,
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingDaily, setIsDownloadingDaily] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [transactionDate, setTransactionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState<TransactionType>('income');
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuickCategory, setSelectedQuickCategory] = useState('');

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => 
      tx.category.toLowerCase().includes(searchQuery.toLowerCase()) || 
      tx.note.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.amount.toString().includes(searchQuery)
    );
  }, [transactions, searchQuery]);

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
  const dailyReportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDays, setExportDays] = useState<number | 'all'>(7);
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPhotoURL, setNewPhotoURL] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [lang, setLang] = useState<Language>('en');
  const [initialLang, setInitialLang] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem('pocket_lang');
    if (saved) {
      setLang(saved as Language);
      setInitialLang(saved as Language);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pocket_lang', lang);
  }, [lang]);

  const t = translations[lang];
  const locale = lang === 'bn' ? bn : enUS;

  const expenseCategories = t.categories.expense;
  const incomeCategories = t.categories.income;
  const quickCategories = type === 'expense' ? expenseCategories : incomeCategories;

  const toggleAdd = () => {
    if (isAdding) {
      setIsAdding(false);
    } else {
      setAmount('');
      setCategory('');
      setNote('');
      setTransactionDate(format(new Date(), 'yyyy-MM-dd'));
      setType('income');
      setIsAdding(true);
    }
  };

  useEffect(() => {
    localStorage.setItem('pocket_lang', lang);
  }, [lang]);

  const CATEGORIES = t.categories;

  const categoryIcons: Record<string, React.ReactNode> = {
    'খাবার': <Utensils className="w-4 h-4" />,
    'Food': <Utensils className="w-4 h-4" />,
    'যাতায়াত': <Bus className="w-4 h-4" />,
    'Transport': <Bus className="w-4 h-4" />,
    'বাজার': <ShoppingCart className="w-4 h-4" />,
    'Groceries': <ShoppingCart className="w-4 h-4" />,
    'বিল': <Receipt className="w-4 h-4" />,
    'Bills': <Receipt className="w-4 h-4" />,
    'কেনাকাটা': <ShoppingBag className="w-4 h-4" />,
    'Shopping': <ShoppingBag className="w-4 h-4" />,
    'মেডিকেল': <Stethoscope className="w-4 h-4" />,
    'Medical': <Stethoscope className="w-4 h-4" />,
    'Business': <Briefcase className="w-4 h-4" />,
    'Entertainment': <MoreHorizontal className="w-4 h-4" />,
    'বেতন': <Briefcase className="w-4 h-4" />,
    'Salary': <Briefcase className="w-4 h-4" />,
    'বোনাস': <Sparkles className="w-4 h-4" />,
    'Bonus': <Sparkles className="w-4 h-4" />,
    'উপহার': <Gift className="w-4 h-4" />,
    'Gift': <Gift className="w-4 h-4" />,
    'বিনিয়োগ': <TrendingUp className="w-4 h-4" />,
    'Investment': <TrendingUp className="w-4 h-4" />,
    'অন্যান্য': <MoreHorizontal className="w-4 h-4" />,
    'Others': <MoreHorizontal className="w-4 h-4" />,
  };

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

  // PWA Install Event
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Handle Auth
  useEffect(() => {
    let isMounted = true;
    
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && isMounted) {
          // Successfully logged in via redirect
          showDialog(t.success, t.googleLoginSuccess, 'success');
        }
      } catch (error: any) {
        console.error('Redirect Result Error:', error);
        if (isMounted) {
          if (error.code === 'auth/credential-already-in-use') {
            setAuthError(t.accountAlreadyRegistered);
          } else {
            setAuthError(t.loginFailed + error.message);
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
        // Reduced timeout for even faster feel
        setTimeout(() => {
          if (isMounted) setLoading(false);
        }, 30);
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

  const dailySummary = useMemo(() => {
    return transactions.reduce((acc, curr) => {
      const txDate = format(new Date(curr.date), 'yyyy-MM-dd');
      if (txDate === reportDate) {
        if (curr.type === 'income') acc.income += curr.amount;
        else acc.expense += curr.amount;
      }
      return acc;
    }, { income: 0, expense: 0 });
  }, [transactions, reportDate]);

  const dailyCash = dailySummary.income - dailySummary.expense;

  const downloadDailyReportCard = async () => {
    if (!dailyReportRef.current) return;
    setIsDownloadingDaily(true);
    try {
      const canvas = await html2canvas(dailyReportRef.current, {
        scale: 4, // Higher scale for better quality
        backgroundColor: '#f8fafc',
        useCORS: true,
        logging: false
      });
      const link = document.createElement('a');
      link.download = `daily-report-${reportDate}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (error) {
      console.error('Download error:', error);
      showDialog(t.error, t.updateFailed, 'error');
    } finally {
      setIsDownloadingDaily(false);
    }
  };

  // Auth Actions
  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    
    try {
      // Force popup for this environment
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Google Login Error:', error);
      
      if (error.code === 'auth/popup-blocked') {
        showDialog(
          t.popupBlockedTitle, 
          t.popupBlockedMessage, 
          'alert'
        );
      } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        // User closed
      } else if (error.code === 'auth/operation-not-allowed') {
        showDialog(t.configProblemTitle, t.configProblemMessage, 'error');
      } else if (error.code === 'auth/invalid-credential') {
        showDialog(t.error, lang === 'bn' ? 'অকার্যকর ক্রেডেনশিয়াল। দয়া করে ফায়ারবেস কনসোলে ডোমেইন অথরাইজড আছে কিনা চেক করুন।' : 'Invalid credential. Please check if your domain is authorized in Firebase Console.', 'error');
      } else {
        showDialog(t.login + ' ' + t.error, t.googleLoginFailed + ` (Error: ${error.code})`, 'error');
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
        showDialog(t.success, t.accountCreatedVerify, 'success');
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          setIsVerifying(true);
          await sendEmailVerification(userCredential.user);
        }
      }
    } catch (error: any) {
      console.error('Auth Error:', error);
      if (error.code === 'auth/email-already-in-use') setAuthError(t.emailInUse);
      else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') setAuthError(t.wrongCredentials);
      else if (error.code === 'auth/too-many-requests') setAuthError(t.tooManyAttempts);
      else setAuthError(t.error + '. ' + (error.message || t.checkInfo));
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
        showDialog(t.success, t.emailVerified, 'success');
      } else {
        showDialog(t.wait, t.emailNotVerified, 'alert');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setAuthError(lang === 'bn' ? 'ইমেইল এড্রেস লিখুন' : 'Please enter email address');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      await sendPasswordResetEmail(auth, email);
      showDialog(t.resetPasswordTitle, t.resetPasswordMessage.replace('{email}', email), 'success');
    } catch (error: any) {
      console.error('Password Reset Error:', error);
      let errorMsg = t.resetPasswordError;
      if (error.code === 'auth/user-not-found') {
        errorMsg = lang === 'bn' ? 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।' : 'No account found with this email.';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = lang === 'bn' ? 'অকার্যকর ইমেইল এড্রেস।' : 'Invalid email address.';
      }
      showDialog(t.error, errorMsg, 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    showDialog(
      t.logoutConfirm, 
      t.logoutMessage, 
      'confirm', 
      () => signOut(auth)
    );
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    if (!user.emailVerified) {
      showDialog(t.error, t.deleteAccountVerifiedOnly, 'error');
      return;
    }

    showDialog(
      t.deleteAccountConfirm,
      t.deleteAccountMessage,
      'confirm',
      async () => {
        try {
          setAuthLoading(true);
          // Delete transactions first
          const q = query(collection(db, 'transactions'), where('userId', '==', user.uid));
          const snapshot = await getDocs(q);
          const deletions = snapshot.docs.map(d => deleteDoc(doc(db, 'transactions', d.id)));
          await Promise.all(deletions);
          
          await user.delete();
          showDialog(t.success, t.accountDeleted, 'success');
        } catch (error: any) {
          console.error('Account Delete Error:', error);
          if (error.code === 'auth/requires-recent-login') {
            showDialog(t.error, t.accountDeleteFailed, 'error');
          } else {
            showDialog(t.error, error.message, 'error');
          }
        } finally {
          setAuthLoading(false);
          setIsProfileOpen(false);
        }
      }
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
    
    // Parse the selected date and set current time
    const selectedDate = new Date(transactionDate);
    const now = new Date();
    selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    
    const txDateIso = selectedDate.toISOString();
    const tempId = `temp-${Date.now()}`;

    // Optimistic Transaction Object
    const optimisticTx: Transaction = {
      id: tempId,
      amount: txAmount,
      category: txCategory,
      type: txType,
      date: txDateIso,
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
    setTransactionDate(format(new Date(), 'yyyy-MM-dd'));

    try {
      const path = 'transactions';
      await addDoc(collection(db, path), {
        amount: txAmount,
        category: txCategory,
        type: txType,
        date: txDateIso,
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
      showDialog(t.error, t.addTransactionFailed, 'error');
    }
  };

  const deleteTransaction = async (id: string) => {
    showDialog(
      t.deleteConfirm,
      t.deleteMessage,
      'confirm',
      async () => {
        try {
          await deleteDoc(doc(db, 'transactions', id));
          showDialog(t.success, t.recordDeleted, 'success');
        } catch (error) {
          console.error(error);
          showDialog(t.error, t.recordDeleteFailed, 'error');
        }
      }
    );
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setAuthLoading(true);
    try {
      // Update Firebase Profile if needed
      if (newDisplayName.trim() !== (user.displayName || '') || newPhotoURL.trim() !== (user.photoURL || '')) {
        await updateProfile(user, { 
          displayName: newDisplayName.trim(),
          photoURL: newPhotoURL.trim()
        });
      }
      
      // Save language preference
      localStorage.setItem('pocket_lang', lang);
      setInitialLang(lang);
      setIsProfileOpen(false);
      showDialog(t.success, t.profileUpdated, 'success');
    } catch (error) {
      showDialog(t.error, t.updateFailed, 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showDialog(t.largeFileTitle, t.largeFileMessage, 'error');
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
        pdf.save(`${user?.displayName || 'pocket'}_statement_${days === 'all' ? (lang === 'bn' ? 'total' : 'total') : days + 'days'}.pdf`);
      } catch (err) {
        console.error('PDF Export failed', err);
        showDialog(t.error, t.exportError, 'error');
      } finally {
        setIsExporting(false);
      }
    }, 250); // Reduced delay for faster export feel
  };

  const renderDialog = () => (
    <AnimatePresence>
      {dialog.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={closeDialog}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.15 }}
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
                  {t.no}
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
                {dialog.type === 'confirm' ? t.yesConfirm : t.ok}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // --- Loading Screen ---
  if (loading && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-slate-100 border-t-emerald-500 rounded-full animate-spin" />
          <img 
            src="/logo.png?v=final_prod_v4" 
            alt="Logo" 
            className="w-10 h-10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" 
          />
        </div>
        <p className="mt-6 text-slate-400 font-bold text-[10px] uppercase tracking-widest animate-pulse">{t.loading}</p>
      </div>
    );
  }

  // --- Auth View (Premium Mobile Experience) ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] bg-emerald-500/10 blur-[130px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-500/10 blur-[110px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />

        {/* Language Toggle */}
        <div className="absolute top-6 right-8 z-20">
            <button 
              onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] hover:bg-white transition-all active:scale-95 group"
            >
              <Sparkles className="w-3 h-3 text-emerald-500 group-hover:rotate-12 transition-transform" />
              {lang === 'bn' ? 'English' : 'বাংলা'}
            </button>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white/90 backdrop-blur-xl p-8 rounded-[3.5rem] shadow-[0_32px_80px_-20px_rgba(0,0,0,0.1)] border border-white z-10 relative"
        >
          <div className="text-center mb-10">
            <div className="bg-white w-20 h-20 rounded-[2.2rem] flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-emerald-500/10 border-2 border-slate-50">
              <img 
                src="/logo.png?v=final_prod_v4" 
                alt="Logo" 
                className="w-14 h-14 object-contain" 
              />
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tight">{t.appName}</h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] leading-none">{t.tagline}</p>
          </div>

          <div className="flex bg-slate-100/50 rounded-2xl p-1.5 mb-8 border border-slate-100 shadow-inner">
            <button 
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className={cn(
                "flex-1 py-4 rounded-xl text-sm font-black transition-all duration-200",
                authMode === 'login' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600 font-bold"
              )}
            >
              {t.login}
            </button>
            <button 
              onClick={() => { setAuthMode('signup'); setAuthError(''); }}
              className={cn(
                "flex-1 py-4 rounded-xl text-sm font-black transition-all duration-200",
                authMode === 'signup' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600 font-bold"
              )}
            >
              {t.signup}
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
                      placeholder={t.namePlaceholder}
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
                placeholder={t.emailPlaceholder}
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
                placeholder={t.passwordPlaceholder}
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

            {authMode === 'login' && (
              <div className="flex justify-end px-1">
                <button 
                  disabled={authLoading}
                  type="button" 
                  onClick={handleForgotPassword}
                  className="text-[10px] font-black text-emerald-500 hover:text-emerald-600 transition-colors uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {authLoading ? t.sending : t.forgotPassword}
                </button>
              </div>
            )}

            <button 
              disabled={authLoading}
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-5 rounded-2xl font-black text-lg transition-all active:scale-[0.98] shadow-xl shadow-emerald-500/20 disabled:opacity-50 mt-2"
            >
              {authLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : (authMode === 'login' ? t.start : t.register)}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
            <div className="relative flex justify-center text-[10px]"><span className="bg-white px-4 text-slate-300 font-black uppercase tracking-[0.2em] leading-none">{t.orSocial}</span></div>
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
            {t.googleLogin}
          </button>
        </motion.div>
        {renderDialog()}
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
          
          <h2 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">{t.verifyEmail}</h2>
          <p className="text-slate-500 text-sm font-medium mb-10 leading-relaxed px-4">
            {t.verifyEmailSent.replace('{email}', user.email || '')}
          </p>
          
          <div className="space-y-4">
            <button 
              onClick={checkEmailVerificationStatus}
              disabled={authLoading}
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-sm shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {t.clickedLink}
            </button>
            
            <button 
              onClick={() => {
                if (auth.currentUser) {
                  sendEmailVerification(auth.currentUser);
                  showDialog(t.success, t.verificationSent, 'success');
                }
              }}
              className="w-full bg-slate-50 text-slate-500 py-4.5 rounded-2xl font-black text-xs hover:bg-slate-100 transition-all border border-slate-100"
            >
              {t.resendEmail}
            </button>
            
            <button 
              onClick={() => {
                signOut(auth);
                setIsVerifying(false);
              }}
              className="w-full text-slate-400 font-bold text-xs pt-4 hover:text-slate-600 transition-colors"
            >
              {t.useOtherAccount}
            </button>
          </div>
        </motion.div>
        {renderDialog()}
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
              onClick={() => {
                setNewDisplayName(user.displayName || '');
                setNewPhotoURL(user.photoURL || '');
                setInitialLang(lang);
                setIsProfileOpen(true);
              }}
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
            <div onClick={() => { 
              setNewDisplayName(user.displayName || '');
              setNewPhotoURL(user.photoURL || '');
              setInitialLang(lang);
              setIsProfileOpen(true); 
            }} className="cursor-pointer">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{t.goodDay}</p>
              <h2 className="font-bold text-sm text-slate-800">{user.displayName || t.user}</h2>
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
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{t.totalBalance}</p>
                {loading ? (
                  <div className="h-10 w-32 bg-slate-100 animate-pulse rounded-xl" />
                ) : (
                  <h1 className="text-4xl font-black text-slate-900 tracking-tight">
                    <span className="text-emerald-500 text-2xl mr-1 font-bold">৳</span>
                    {balance.toLocaleString('en-US')}
                  </h1>
                )}
              </div>
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center p-2">
                <img 
                  src="/logo.png?v=final_prod_v4" 
                  alt="Logo" 
                  className="w-10 h-10 object-contain" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <ArrowDownCircle className="w-4 h-4 font-bold" />
                  <span className="text-[10px] font-black uppercase tracking-wider">{t.income}</span>
                </div>
                {loading ? (
                  <div className="h-6 w-20 bg-slate-50 animate-pulse rounded-lg" />
                ) : (
                  <p className="text-lg font-black text-slate-800">৳{summary.income.toLocaleString('en-US')}</p>
                )}
              </div>
              <div className="space-y-1 border-l border-slate-100 pl-4">
                <div className="flex items-center gap-1.5 text-rose-500">
                  <ArrowUpCircle className="w-4 h-4 font-bold" />
                  <span className="text-[10px] font-black uppercase tracking-wider">{t.expense}</span>
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
              { l: t.oneDay, d: 1 },
              { l: t.sevenDays, d: 7 },
              { l: t.thirtyDays, d: 30 },
              { l: t.forever, d: 'all' }
            ].map((opt) => (
              <button 
                key={opt.l}
                onClick={() => exportPDFWithCanvas(opt.d as any)}
                disabled={isExporting}
                className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-900 hover:text-white rounded-2xl text-[10px] font-black transition-all border border-slate-100 shadow-sm whitespace-nowrap group disabled:opacity-50"
              >
                {isExporting && exportDays === opt.d ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t.preparing}
                  </>
                ) : (
                  <>
                    <Download className="w-3 h-3 text-emerald-500 group-hover:text-white" />
                    {opt.l} {t.report}
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Daily Report Section */}
        <section className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-black text-lg text-slate-800 tracking-tight">{t.dailyReport}</h3>
            <div className="relative">
              <input 
                type="date" 
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="bg-white px-2 py-2 rounded-xl border border-slate-100 text-[10px] font-black text-slate-600 outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer w-[145px] md:w-[160px] appearance-none"
              />
            </div>
          </div>

          <div className="relative group">
            <div 
              ref={dailyReportRef}
              className="rounded-[2.5rem] p-8 relative overflow-hidden shadow-2xl border font-sans"
              style={{ 
                backgroundColor: '#ffffff', 
                color: '#0f172a', 
                borderColor: '#f1f5f9',
                fontFamily: '"Hind Siliguri", sans-serif'
              }}
            >
              {/* Decorative elements for the card */}
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 blur-3xl opacity-40" style={{ backgroundColor: '#dcfce7' }} />
              <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full -ml-12 -mb-12 blur-2xl opacity-30" style={{ backgroundColor: '#ecfdf5' }} />
 
              <div className="relative z-10 flex flex-col gap-8">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: '#64748b' }}>{t.dailySummary}</p>
                    <h4 className="text-xl font-black" style={{ color: '#0f172a' }}>{format(new Date(reportDate), 'dd MMMM, yyyy', { locale })}</h4>
                  </div>
                  <div className="p-2 rounded-2xl" style={{ backgroundColor: '#ecfdf5' }}>
                    <img 
                      src="/logo.png?v=final_prod_v4" 
                      alt="Logo" 
                      className="w-8 h-8 object-contain" 
                    />
                  </div>
                </div>
 
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 rounded-3xl border" style={{ backgroundColor: '#f0fdf4', borderStyle: 'dashed', borderColor: '#bcf2d1' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-3 h-3" style={{ color: '#059669' }} />
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#059669' }}>{t.income}</span>
                    </div>
                    <p className="text-lg font-black" style={{ color: '#065f46' }}>৳{dailySummary.income.toLocaleString('en-US')}</p>
                  </div>
                  <div className="p-5 rounded-3xl border" style={{ backgroundColor: '#fff1f2', borderStyle: 'dashed', borderColor: '#fecdd3' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-3 h-3" style={{ color: '#e11d48' }} />
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#e11d48' }}>{t.expense}</span>
                    </div>
                    <p className="text-lg font-black" style={{ color: '#9f1239' }}>৳{dailySummary.expense.toLocaleString('en-US')}</p>
                  </div>
                </div>
 
                <div className="pt-6 border-t flex justify-between items-end" style={{ borderColor: '#f1f5f9' }}>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>{t.netCash}</p>
                    <p className="text-3xl font-black tracking-tighter" style={{ color: dailyCash >= 0 ? '#10b981' : '#e11d48' }}>
                      ৳{dailyCash.toLocaleString('en-US')}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="mb-2">
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#0f172a' }}>{t.appName}</p>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                       <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#10b981' }} />
                       <span className="text-[8px] font-bold" style={{ color: '#64748b' }}>LIVE REPORT</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-6 right-8 flex items-center gap-3">
              {isDownloadingDaily && (
                <div className="bg-slate-900 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg animate-bounce">
                  {t.preparing}
                </div>
              )}
              <button 
                onClick={downloadDailyReportCard}
                disabled={isDownloadingDaily}
                className="bg-emerald-500 text-slate-950 w-12 h-12 rounded-full shadow-2xl shadow-emerald-500/40 hover:scale-110 active:scale-95 transition-all flex items-center justify-center z-20 group border-4 border-white disabled:opacity-70 disabled:scale-100"
                title={t.downloadImage}
              >
                {isDownloadingDaily ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Today's Activity Summary - UX Enhancement */}
        <section className="grid grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.inToday}</p>
            <p className="text-sm font-black text-emerald-600">৳{dailySummary.income.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.outToday}</p>
            <p className="text-sm font-black text-rose-500">৳{dailySummary.expense.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.balance}</p>
            <p className="text-sm font-black text-slate-900">৳{dailyCash.toLocaleString()}</p>
          </div>
        </section>

        {/* Recent Transactions List */}
        <section className="space-y-4">
          <div className="space-y-4">
            <div className="flex justify-between items-end px-1">
              <h3 className="font-black text-lg text-slate-800 tracking-tight">{t.records}</h3>
              <div className="flex items-center gap-1 bg-white px-3 py-1 rounded-full border border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest shadow-sm">
                 {filteredTransactions.length} {t.recentInfo}
              </div>
            </div>

            {/* Search Bar - UX Improvement */}
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full bg-white border border-slate-100 rounded-2xl py-3 pl-11 pr-4 text-xs font-bold text-slate-600 outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500/20 transition-all shadow-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-300 hover:text-rose-500"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
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
              ) : filteredTransactions.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                   <div className="w-20 h-20 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-slate-200">
                      <Search className="w-8 h-8" />
                   </div>
                   <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">{searchQuery ? t.noMatches : t.noRecords}</p>
                   {searchQuery && (
                     <button 
                       onClick={() => setSearchQuery('')}
                       className="text-emerald-500 text-[10px] font-black uppercase tracking-widest hover:underline"
                     >
                       সব দেখুন
                     </button>
                   )}
                </div>
              ) : (
                <motion.div layout className="space-y-3">
                  {filteredTransactions.map((tx, i) => (
                    <motion.div
                      key={tx.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ 
                        opacity: { duration: 0.15 },
                        layout: { type: 'spring', damping: 30, stiffness: 450 }
                      }}
                      className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-50 flex items-center justify-between group active:scale-[0.98] transition-all"
                    >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 shadow-sm",
                        tx.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                      )}>
                        {tx.type === 'income' ? <Minus className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-slate-800 mb-0.5">{tx.category}</h4>
                        <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold uppercase tracking-[0.05em]">
                          <span>{format(new Date(tx.date), 'dd MMM', { locale })}</span>
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
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-10 right-6 z-50">
        <button 
          onClick={toggleAdd}
          className="w-16 h-16 flex items-center justify-center bg-slate-900 text-white rounded-full font-black shadow-[0_20px_50px_rgba(0,0,0,0.3)] active:scale-90 transition-all hover:bg-emerald-600 hover:shadow-emerald-500/30 group"
          title={t.addRecord}
        >
          <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-200" />
        </button>
      </div>

      {/* --- ADD MODAL --- */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center md:p-6 md:items-center overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleAdd}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 30, stiffness: 450 }}
              className="relative w-full max-w-md bg-white rounded-t-[3rem] md:rounded-[3rem] p-8 pb-10 shadow-2xl max-h-[92vh] overflow-y-auto overscroll-contain no-scrollbar"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">{t.newEntry}</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">{t.correctInfo}</p>
                </div>
                <button 
                  onClick={toggleAdd} 
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
                    onClick={() => setType('income')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all",
                      type === 'income' ? "bg-white text-emerald-600 shadow-xl border border-slate-100" : "text-slate-500"
                    )}
                  >
                    <ArrowUpCircle className="w-4 h-4" /> {t.income}
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('expense')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all",
                      type === 'expense' ? "bg-white text-rose-600 shadow-xl border border-slate-100" : "text-slate-500"
                    )}
                  >
                    <ArrowDownCircle className="w-4 h-4" /> {t.expense}
                  </button>
                </div>

                {/* Amount and Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t.amount}</label>
                    <div className="relative group">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 text-xl font-black group-focus-within:text-emerald-500 transition-colors">৳</span>
                      <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0"
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 pl-10 pr-4 text-2xl font-black text-slate-900 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all placeholder:text-slate-200 shadow-sm h-[72px]"
                        required
                        autoFocus
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t.date || 'Date'}</label>
                    <div className="relative group">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-emerald-500 transition-colors pointer-events-none" />
                      <input 
                        type="date" 
                        value={transactionDate}
                        onChange={(e) => setTransactionDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 pl-10 pr-4 text-xs font-black text-slate-900 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all shadow-sm appearance-none h-[72px]"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Amounts */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {[10, 50, 100, 500, 1000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmount(val.toString())}
                      className={cn(
                        "shrink-0 px-4 py-2 bg-slate-50 border border-slate-100 rounded-full text-[10px] font-black transition-all active:scale-95",
                        type === 'income' 
                          ? "text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200" 
                          : "text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                      )}
                    >
                      {type === 'income' ? '+' : '-'}৳{val}
                    </button>
                  ))}
                </div>

                {/* Category */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">{t.categoryLabel}</label>
                    {category && (
                      <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest animate-pulse">
                        {category} {t.selected}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <div className="grid grid-cols-3 gap-3">
                      {CATEGORIES[type].map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategory(cat)}
                          className={cn(
                            "flex flex-col items-center justify-center gap-2 py-4 rounded-2xl text-[10px] font-black transition-all border-2",
                            category === cat 
                              ? "bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-900/20 scale-105 z-10" 
                              : "bg-white text-slate-400 border-slate-100 hover:border-slate-200 hover:text-slate-600 active:scale-95"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                            category === cat ? "bg-white/10" : "bg-slate-50"
                          )}>
                            {categoryIcons[cat] || <MoreHorizontal className="w-4 h-4" />}
                          </div>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t.noteOptional}</label>
                  <input 
                    type="text" 
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t.notePlaceholder}
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
                  {isSaving ? t.saving : t.save}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- PROFILE/SETTINGS MODAL --- */}
      <AnimatePresence>
        {isProfileOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 overflow-hidden">
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
              transition={{ type: 'spring', damping: 30, stiffness: 450 }}
              className="relative w-full max-w-sm bg-white rounded-[3rem] p-8 pb-10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100 overflow-y-auto overscroll-contain no-scrollbar max-h-[90vh]"
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
                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-4">{t.changePhoto}</p>
                
                <h3 className="text-xl font-black text-slate-900 mb-1">{user.displayName || t.user}</h3>
                <p className="text-slate-400 text-xs font-medium mb-8">{user.email}</p>
 
                <form onSubmit={handleUpdateProfile} className="space-y-4 text-left">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t.namePlaceholder}</label>
                    <input 
                      type="text" 
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder={t.namePlaceholder}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-slate-800"
                      required
                    />
                  </div>

                  {/* Language Selector */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t.language}</label>
                    <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                      <button
                        type="button"
                        onClick={() => setLang('bn')}
                        className={cn(
                          "flex-1 py-3 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest",
                          lang === 'bn' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        বাংলা
                      </button>
                      <button
                        type="button"
                        onClick={() => setLang('en')}
                        className={cn(
                          "flex-1 py-3 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest",
                          lang === 'en' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        English
                      </button>
                    </div>
                  </div>
 
                  <div className="pt-2 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-500 font-bold text-sm hover:bg-slate-200 transition-all"
                    >
                      {t.cancel}
                    </button>
                    <button 
                      disabled={authLoading || (newDisplayName.trim() === (user.displayName || '') && newPhotoURL.trim() === (user.photoURL || '') && lang === initialLang)}
                      type="submit"
                      className={cn(
                        "flex-[2] py-4 rounded-2xl font-black text-sm transition-all active:scale-95",
                        (newDisplayName.trim() !== (user.displayName || '') || newPhotoURL.trim() !== (user.photoURL || '') || lang !== initialLang) && !authLoading
                          ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20" 
                          : "bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed"
                      )}
                    >
                      {authLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : t.update}
                    </button>
                  </div>
                </form>
 
                <div className="mt-8 space-y-4">
                  {deferredPrompt ? (
                    <button 
                      onClick={installApp}
                      className="w-full bg-emerald-500 text-slate-950 py-4 rounded-2xl font-black text-sm shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
                    >
                      <Download className="w-5 h-5" /> {t.installApp}
                    </button>
                  ) : (
                    <div className="bg-slate-50 p-4 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center leading-relaxed">
                        {t.pwaNote}
                      </p>
                    </div>
                  )}
 
                  <button 
                    onClick={() => { setIsProfileOpen(false); handleLogout(); }}
                    className="w-full py-4 bg-slate-50 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition-all border border-slate-100"
                  >
                    <LogOut className="w-3 h-3" /> {t.logout}
                  </button>

                  <button 
                    onClick={handleDeleteAccount}
                    className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" /> {t.deleteAccount}
                  </button>
                </div>
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
      {renderDialog()}

      {/* --- HIDDEN REPORT COMPONENT FOR PDF CAPTURE --- */}
      <div className="fixed left-[-9999px] top-[-9999px]">
        <div 
          ref={reportRef} 
          className="bg-white w-[1000px] p-24 font-sans"
          style={{ 
            fontFeatureSettings: '"kern" 1, "liga" 1', 
            backgroundColor: '#ffffff',
            color: '#0f172a',
            fontFamily: '"Hind Siliguri", sans-serif'
          }}
        >
          {/* Header Section */}
          <div className="pb-12 mb-12" style={{ borderBottom: '2px solid #0f172a' }}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-6">
                <img 
                  src="/logo.png?v=final_prod_v4" 
                  alt="Logo" 
                  className="w-16 h-16 object-contain" 
                />
                <div>
                  <h1 className="text-4xl font-black tracking-tight" style={{ color: '#0f172a' }}>{t.appName}</h1>
                  <p className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#64748b' }}>{t.statementOfAccount}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>{t.preparedAt}</p>
                <p className="text-sm font-bold" style={{ color: '#0f172a' }}>{format(new Date(), 'dd MMMM, yyyy (hh:mm a)', { locale })}</p>
              </div>
            </div>
          </div>

          {/* Account Summary & Info */}
          <div className="grid grid-cols-2 gap-16 mb-16">
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>{t.accountHolder}</p>
                <h2 className="text-xl font-black" style={{ color: '#1e293b' }}>{user.displayName || t.user}</h2>
                <p className="text-sm font-medium" style={{ color: '#64748b' }}>{user.email}</p>
              </div>
              <div className="pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>{t.reportPeriod}</p>
                <p className="text-sm font-bold" style={{ color: '#334155' }}>
                  {exportDays === 'all' ? t.allTime : exportDays === 1 ? t.today : t.lastDays.replace('{days}', exportDays.toString())}
                </p>
              </div>
            </div>
            
            <div className="p-10 border" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] mb-6 pb-4 border-b" style={{ color: '#64748b', borderColor: '#e2e8f0' }}>{t.financialSummary}</p>
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold" style={{ color: '#64748b' }}>{t.totalIncome}</span>
                  <span className="text-lg font-black" style={{ color: '#059669' }}>৳{summary.income.toLocaleString('en-US')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold" style={{ color: '#64748b' }}>{t.totalExpense}</span>
                  <span className="text-lg font-black" style={{ color: '#e11d48' }}>৳{summary.expense.toLocaleString('en-US')}</span>
                </div>
                <div className="h-px my-2" style={{ backgroundColor: '#cbd5e1' }} />
                <div className="flex justify-between items-center">
                  <span className="text-base font-black px-4" style={{ color: '#0f172a', borderLeft: '4px solid #0f172a' }}>{t.currentBalance}</span>
                  <span className="text-2xl font-black" style={{ color: '#0f172a' }}>৳{balance.toLocaleString('en-US')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Table */}
          <div className="mb-20">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-4" style={{ color: '#0f172a' }}>
              <span className="shrink-0">{t.transactionDetails}</span>
              <div className="h-0.5 w-full" style={{ backgroundColor: '#0f172a' }} />
            </h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid #94a3b8' }}>
                  <th className="py-6 text-[10px] font-black uppercase" style={{ color: '#94a3b8' }}>{t.date}</th>
                  <th className="py-6 text-[10px] font-black uppercase" style={{ color: '#94a3b8' }}>{t.time}</th>
                  <th className="py-6 text-[10px] font-black uppercase" style={{ color: '#94a3b8' }}>{t.category}</th>
                  <th className="py-6 text-[10px] font-black uppercase" style={{ color: '#94a3b8' }}>{t.type}</th>
                  <th className="py-6 text-[10px] font-black uppercase text-right" style={{ color: '#94a3b8' }}>{t.amountTable}</th>
                </tr>
              </thead>
              <tbody>
                {(exportDays === 'all' ? transactions : transactions.filter(t_item => isAfter(new Date(t_item.date), subDays(new Date(), exportDays as number)))).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-20 text-center font-bold italic" style={{ color: '#cbd5e1' }}>{t.noTransactionsFound}</td>
                  </tr>
                ) : (
                  (exportDays === 'all' ? transactions : transactions.filter(t_item => isAfter(new Date(t_item.date), subDays(new Date(), exportDays as number)))).map((tx) => (
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
                          {tx.type === 'income' ? t.credit : t.debit}
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
                <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#94a3b8' }}>{t.clientSignature}</p>
              </div>
              <div className="text-center">
                <div className="w-32 h-px mx-auto mb-3" style={{ backgroundColor: '#e2e8f0' }} />
                <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#94a3b8' }}>{t.authorizedStamp}</p>
              </div>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: '#cbd5e1' }}>{t.generatedDocument}</p>
          </div>
        </div>
      </div>

    </div>
  );
}
