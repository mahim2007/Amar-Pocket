/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Minus, 
  Download, 
  Trash2, 
  Calendar, 
  Wallet, 
  ArrowUpCircle, 
  ArrowDownCircle,
  Clock,
  ChevronRight,
  Filter,
  X,
  LogOut,
  LogIn,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, isAfter } from 'date-fns';
import { bn } from 'date-fns/locale';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
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

  // Actions
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

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
      resetForm();
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!user) return;
    if (window.confirm('আপনি কি এই হিসাবটি মুছে ফেলতে চান?')) {
      const path = `transactions/${id}`;
      try {
        await deleteDoc(doc(db, 'transactions', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  };

  const resetForm = () => {
    setAmount('');
    setCategory('');
    setNote('');
    setType('expense');
  };

  // PDF Export
  const exportPDF = (days: number | 'all') => {
    const doc = new jsPDF();
    const filteredTx = days === 'all' 
      ? transactions 
      : transactions.filter(t => isAfter(new Date(t.date), subDays(new Date(), days)));

    const title = days === 'all' 
      ? 'পূর্ণাঙ্গ হিসাব রিপোর্ট' 
      : `গত ${days} দিনের হিসাব রিপোর্ট`;

    doc.setFontSize(20);
    doc.text('Amar Pocket (আমার পকেট)', 14, 20);
    doc.setFontSize(12);
    doc.text(`${title} - ${format(new Date(), 'dd/MM/yyyy')}`, 14, 30);

    const tableData = filteredTx.map(t => [
      format(new Date(t.date), 'dd/MM/yyyy'),
      t.time,
      t.category,
      t.type === 'income' ? 'Income' : 'Expense',
      t.amount.toLocaleString('en-US'),
      t.note || '-'
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Time', 'Category', 'Type', 'Amount', 'Note']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
    });

    const totalIncome = filteredTx.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const totalExpense = filteredTx.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.text(`Total Income: ${totalIncome.toLocaleString('en-US')}`, 14, finalY);
    doc.text(`Total Expense: ${totalExpense.toLocaleString('en-US')}`, 14, finalY + 7);
    doc.text(`Balance: ${(totalIncome - totalExpense).toLocaleString('en-US')}`, 14, finalY + 14);

    doc.save(`hishab_report_${days}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl text-center"
        >
          <div className="bg-emerald-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600">
            <Wallet className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">আমার পকেট</h1>
          <p className="text-slate-500 mb-8">আপনার দৈনন্দিন হিসাব সুরক্ষিত রাখতে লগইন করুন</p>
          
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
          >
            <LogIn className="w-5 h-5" />
            Google দিয়ে লগইন করুন
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-slate-900 text-white p-6 rounded-b-3xl shadow-lg mb-6 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             {user.photoURL && <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-full border-2 border-emerald-400" referrerPolicy="no-referrer" />}
             <div>
               <h1 className="text-xl font-bold flex items-center gap-2">আমার পকেট</h1>
               <p className="text-slate-400 text-[10px] truncate max-w-[120px]">{user.displayName || user.email}</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-300 hover:text-rose-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsAdding(true)}
              className="p-3 bg-emerald-500 rounded-full hover:bg-emerald-600 transition-colors shadow-lg active:scale-95 ml-2"
              id="add-btn"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4">
        {/* Balance Card */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
          <p className="text-slate-500 text-sm mb-1">মোট অবশিষ্ট অর্থ</p>
          <h2 className={cn(
            "text-4xl font-bold mb-6",
            balance >= 0 ? "text-slate-900" : "text-rose-600"
          )}>
            ৳{balance.toLocaleString('bn-BD')}
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium mb-1">
                <ArrowUpCircle className="w-4 h-4" />
                আয় (Income)
              </div>
              <p className="text-lg font-bold text-emerald-800">৳{summary.income.toLocaleString('bn-BD')}</p>
            </div>
            <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
              <div className="flex items-center gap-2 text-rose-700 text-sm font-medium mb-1">
                <ArrowDownCircle className="w-4 h-4" />
                ব্যয় (Expense)
              </div>
              <p className="text-lg font-bold text-rose-800">৳{summary.expense.toLocaleString('bn-BD')}</p>
            </div>
          </div>
        </section>

        {/* Export Options */}
        <section className="mb-6 overflow-x-auto">
          <div className="flex gap-2 pb-2">
            <button 
              onClick={() => exportPDF(1)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 text-xs font-semibold hover:border-slate-900 transition-all shadow-sm"
              id="export-today"
            >
              <Download className="w-3 h-3" /> আজকের রিপোর্ট
            </button>
            <button 
              onClick={() => exportPDF(7)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 text-xs font-semibold hover:border-slate-900 transition-all shadow-sm"
            >
              <Download className="w-3 h-3" /> ৭ দিনের
            </button>
            <button 
              onClick={() => exportPDF(30)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 text-xs font-semibold hover:border-slate-900 transition-all shadow-sm"
            >
              <Download className="w-3 h-3" /> ১ মাসের
            </button>
            <button 
              onClick={() => exportPDF('all')}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 text-xs font-semibold hover:border-slate-900 transition-all shadow-sm"
            >
              <Download className="w-3 h-3" /> আজীবন
            </button>
          </div>
        </section>

        {/* Transactions List */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">সাম্প্রতিক লেনদেন</h3>
            <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
              <Clock className="w-3 h-3" /> রিয়েল-টাইম ডাটা
            </div>
          </div>

          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {transactions.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <div className="bg-slate-200 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Filter className="text-slate-400" />
                  </div>
                  <p>এখনো কোনো হিসাব যোগ করা হয়নি</p>
                </div>
              ) : (
                transactions.map((tx) => (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between group"
                    id={`tx-${tx.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        tx.type === 'income' ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                      )}>
                        {tx.type === 'income' ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">{tx.category}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{format(new Date(tx.date), 'dd MMM', { locale: bn })}</span>
                          <span>•</span>
                          <span>{tx.time}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={cn(
                          "font-bold",
                          tx.type === 'income' ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {tx.type === 'income' ? '+' : '-'} ৳{tx.amount.toLocaleString('bn-BD')}
                        </p>
                        {tx.note && <p className="text-[10px] text-slate-400 truncate max-w-[80px]">{tx.note}</p>}
                      </div>
                      <button 
                        onClick={() => deleteTransaction(tx.id)}
                        className="p-2 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
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

      {/* Add Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
              id="add-modal"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">নতুন হিসাব যোগ করুন</h3>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={addTransaction} className="space-y-4">
                {/* Type Toggle */}
                <div className="flex p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setType('expense')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all",
                      type === 'expense' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    <Minus className="w-4 h-4" /> ব্যয় (Expense)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('income')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all",
                      type === 'income' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    <Plus className="w-4 h-4" /> আয় (Income)
                  </button>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">টাকার পরিমাণ</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">৳</span>
                    <input 
                      type="number" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-8 pr-4 text-xl font-bold focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">খাত (Category)</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all appearance-none"
                    required
                  >
                    <option value="">নির্বাচন করুন</option>
                    {CATEGORIES[type].map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">নোট (ঐচ্ছিক)</label>
                  <input 
                    type="text" 
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="কিছু লিখে রাখুন..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <button 
                  type="submit"
                  className={cn(
                    "w-full py-4 rounded-xl text-white font-bold shadow-lg transition-all active:scale-[0.98] mt-4",
                    type === 'income' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200" : "bg-slate-900 hover:bg-slate-800 shadow-slate-200"
                  )}
                >
                  সেভ করুন
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
