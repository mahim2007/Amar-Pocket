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
  ArrowRight
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
  signOut, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
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
}

// --- Constants ---
const CATEGORIES = {
  income: ['বেতন', 'বোনাস', 'উপহার', 'বিনিয়োগ', 'অন্যান্য'],
  expense: ['খাবার', 'যাতায়াত', 'বাজার', 'বিল', 'মেডিকেল', 'কেনাকাটা', 'বিনোদন', 'অন্যান্য']
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isAdding, setIsAdding] = useState(false);
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

  // PDF Export State
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDays, setExportDays] = useState<number | 'all'>(7);

  // Handle Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      setTransactions(txs);
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
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      setAuthError('Google লগইন ব্যর্থ হয়েছে।');
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
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') setAuthError('এই ইমেইলটি ইতিপূর্বে ব্যবহার করা হয়েছে।');
      else if (error.code === 'auth/wrong-password') setAuthError('পাসওয়ার্ড সঠিক নয়।');
      else setAuthError('লগইন ব্যর্থ হয়েছে। তথ্য যাচাই করুন।');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('আপনি কি লগ-আউট করতে চান?')) {
      await signOut(auth);
    }
  };

  // Transaction Actions
  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category || !user) return;

    const path = 'transactions';
    const newTx = {
      amount: parseFloat(amount),
      category,
      type,
      date: new Date().toISOString(),
      time: format(new Date(), 'hh:mm a'),
      note,
      userId: user.uid
    };

    try {
      await addDoc(collection(db, path), newTx);
      setAmount('');
      setCategory('');
      setNote('');
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (window.confirm('মুছে ফেলতে চান?')) {
      try {
        await deleteDoc(doc(db, 'transactions', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `transactions/${id}`);
      }
    }
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
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        pdf.save(`amar_pocket_report_${days}.pdf`);
      } catch (err) {
        console.error('PDF Export failed', err);
        alert('পিডিএফ এক্সপোর্ট করা সম্ভব হচ্ছে না।');
      } finally {
        setIsExporting(false);
      }
    }, 500);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
        <p className="text-slate-400 font-medium">অপেক্ষা করুন...</p>
      </div>
    );
  }

  // --- Auth View ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 relative overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[100px] rounded-full" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full backdrop-blur-xl bg-white/10 p-8 rounded-[2.5rem] shadow-2xl border border-white/10 z-10"
        >
          <div className="text-center mb-8">
            <div className="bg-emerald-500 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-emerald-500/20 rotate-12">
              <Wallet className="w-8 h-8 text-white -rotate-12" />
            </div>
            <h1 className="text-3xl font-black text-white mb-2 tracking-tight">আমার পকেট</h1>
            <p className="text-slate-400 text-sm">আপনার দৈনন্দিন পকেট ডায়েরি</p>
          </div>

          {/* Tab Switch */}
          <div className="flex bg-white/5 rounded-2xl p-1 mb-6">
            <button 
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                authMode === 'login' ? "bg-white text-slate-900 shadow-lg" : "text-slate-400 hover:text-white"
              )}
            >
              লগইন
            </button>
            <button 
              onClick={() => { setAuthMode('signup'); setAuthError(''); }}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                authMode === 'signup' ? "bg-white text-slate-900 shadow-lg" : "text-slate-400 hover:text-white"
              )}
            >
              সাইন আপ
            </button>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <AnimatePresence mode="wait">
              {authMode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="আপনার পূর্ণ নাম"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder:text-slate-500 transition-all"
                      required
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="email" 
                placeholder="ইমেইল অ্যাড্রেস"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder:text-slate-500 transition-all font-mono text-sm"
                required
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="password" 
                placeholder="পাসওয়ার্ড"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder:text-slate-500 transition-all font-mono"
                required
                minLength={6}
              />
            </div>

            {authError && (
              <p className="text-rose-400 text-xs font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {authError}
              </p>
            )}

            <button 
              disabled={authLoading}
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-4 rounded-2xl font-black text-lg transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {authLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : (authMode === 'login' ? 'প্রবেশ করুন' : 'তৈরি করুন')}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative flex justify-center text-xs"><span className="bg-[#0f172a] px-3 text-slate-500 font-bold">অথবা লগইন করুন</span></div>
          </div>

          <button 
            onClick={handleGoogleLogin}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white py-4 rounded-2xl font-bold hover:bg-white/10 transition-all active:scale-[0.98]"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/pwa/google.svg" className="w-5 h-5 flex-shrink-0" alt="GMail" />
            Google অ্যাকাউন্ট দিয়ে
          </button>
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
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 overflow-hidden shadow-lg shadow-emerald-500/20 border-2 border-white">
               {user.photoURL ? (
                 <img src={user.photoURL} alt="User" referrerPolicy="no-referrer" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-white font-black text-sm uppercase">
                   {user.displayName?.[0] || user.email?.[0]}
                 </div>
               )}
            </div>
            <div>
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
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">
                  <span className="text-emerald-500 text-2xl mr-1 font-bold">৳</span>
                  {balance.toLocaleString('en-US')}
                </h1>
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
                <p className="text-lg font-black text-slate-800">৳{summary.income.toLocaleString('en-US')}</p>
              </div>
              <div className="space-y-1 border-l border-slate-100 pl-4">
                <div className="flex items-center gap-1.5 text-rose-500">
                  <ArrowDownCircle className="w-4 h-4 font-bold" />
                  <span className="text-[10px] font-black uppercase tracking-wider">ব্যয়</span>
                </div>
                <p className="text-lg font-black text-slate-800">৳{summary.expense.toLocaleString('en-US')}</p>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Action Pills for Report */}
        <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
          <div className="flex gap-3 pb-2">
            {[
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
              {transactions.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-200">
                   <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200">
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
      <div className="fixed bottom-8 left-0 right-0 px-6 z-50 pointer-events-none">
        <div className="max-w-md mx-auto flex justify-center pointer-events-auto">
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-3 bg-slate-900 text-white px-8 py-5 rounded-[2.5rem] font-black text-base shadow-2xl shadow-slate-900/40 active:scale-95 transition-all"
          >
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            হিসাব যোগ করুন
          </button>
        </div>
      </div>

      {/* --- ADD MODAL --- */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 md:p-6 md:items-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-white rounded-t-[3rem] md:rounded-[3rem] p-8 shadow-2xl"
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">খাত বা বিষয়</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORIES[type].map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={cn(
                          "py-3 rounded-2xl text-[10px] font-bold transition-all border",
                          category === cat 
                            ? "bg-slate-900 text-white border-slate-900" 
                            : "bg-slate-50 text-slate-500 border-slate-100 hover:border-slate-200"
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
                  disabled={!amount || !category}
                  className={cn(
                    "w-full py-5 rounded-[2rem] text-slate-950 font-black text-lg transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-3 disabled:opacity-30",
                    type === 'income' ? "bg-emerald-500 shadow-xl shadow-emerald-500/20" : "bg-emerald-500 shadow-xl shadow-emerald-500/20"
                  )}
                >
                  <ArrowRight className="w-6 h-6" />
                  সেভ করুন
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- HIDDEN REPORT COMPONENT FOR PDF CAPTURE --- */}
      <div className="fixed left-[-9999px] top-[-9999px]">
        <div 
          ref={reportRef} 
          className="bg-white w-[800px] p-20 text-slate-900 font-sans"
          style={{ fontFeatureSettings: '"kern" 1, "liga" 1' }}
        >
          <div className="flex justify-between items-center mb-10 border-b-2 border-slate-900 pb-10">
            <div>
              <h1 className="text-4xl font-black mb-2">আমার পকেট</h1>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Amar Pocket Report</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase">আপনার রিপোর্ট</p>
              <p className="text-lg font-black text-slate-900">{exportDays === 'all' ? 'পূর্ণাঙ্গ রিপোর্ট' : `গত ${exportDays} দিনের ডাটা`}</p>
              <p className="text-xs text-slate-400 mt-1">{format(new Date(), 'dd MMMM yyyy (hh:mm a)', { locale: bn })}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-10 mb-10">
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">মোট ব্যালেন্স</p>
              <p className="text-3xl font-black">৳{balance.toLocaleString('en-US')}</p>
            </div>
            <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
              <p className="text-[10px] font-black text-emerald-400 uppercase mb-2">মোট আয়</p>
              <p className="text-3xl font-black text-emerald-600">৳{summary.income.toLocaleString('en-US')}</p>
            </div>
            <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100">
              <p className="text-[10px] font-black text-rose-400 uppercase mb-2">মোট ব্যয়</p>
              <p className="text-3xl font-black text-rose-600">৳{summary.expense.toLocaleString('en-US')}</p>
            </div>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="py-5 text-xs font-black uppercase text-slate-400">তারিখ ও সময়</th>
                <th className="py-5 text-xs font-black uppercase text-slate-400">খাত / বিষয়</th>
                <th className="py-5 text-xs font-black uppercase text-slate-400">ধরন</th>
                <th className="py-5 text-xs font-black uppercase text-slate-400 text-right">টাকা (৳)</th>
              </tr>
            </thead>
            <tbody>
              {(exportDays === 'all' ? transactions : transactions.filter(t => isAfter(new Date(t.date), subDays(new Date(), exportDays as number)))).map((tx) => (
                <tr key={tx.id} className="border-b border-slate-50">
                  <td className="py-5">
                    <p className="font-bold text-sm">{format(new Date(tx.date), 'dd/MM/yyyy')}</p>
                    <p className="text-[10px] text-slate-400">{tx.time}</p>
                  </td>
                  <td className="py-5">
                    <p className="font-bold text-sm">{tx.category}</p>
                    {tx.note && <p className="text-[10px] text-slate-400">{tx.note}</p>}
                  </td>
                  <td className="py-5">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[9px] font-black uppercase",
                      tx.type === 'income' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    )}>
                      {tx.type === 'income' ? 'আয়' : 'ব্যয়'}
                    </span>
                  </td>
                  <td className={cn(
                    "py-5 text-right font-black text-lg",
                    tx.type === 'income' ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {tx.type === 'income' ? '+' : '-'} {tx.amount.toLocaleString('en-US')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-20 pt-10 border-t border-slate-200 text-center">
            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Amar Pocket - Smart Finance Tracker</p>
          </div>
        </div>
      </div>

    </div>
  );
}
