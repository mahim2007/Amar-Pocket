import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  Bell, 
  ShieldAlert, 
  Trash2, 
  UserX, 
  Search, 
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  Send,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { 
  db, 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  doc, 
  updateDoc, 
  deleteDoc, 
  addDoc,
  onSnapshot
} from '../lib/firebase';

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  createdAt: string;
  lastLogin: string;
  blocked?: boolean;
}

interface Transaction {
  id: string;
  amount: number;
  category: string;
  type: 'income' | 'expense';
  date: string;
  note: string;
  userId: string;
  userEmail?: string;
  userName?: string;
}

interface AdminDashboardProps {
  onBack: () => void;
  adminEmail: string;
}

export default function AdminDashboard({ onBack, adminEmail }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'activity' | 'notifications'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationMsg, setNotificationMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [stats, setStats] = useState({ totalUsers: 0, totalTx: 0, totalIncome: 0, totalExpense: 0 });

  useEffect(() => {
    // Fetch Stats & Users
    const fetchUsers = async () => {
      try {
        const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserProfile[];
          setUsers(userList);
          setStats(prev => ({ ...prev, totalUsers: userList.length }));
          setLoading(false);
        });
        return unsubscribe;
      } catch (err) {
        console.error('Fetch users error:', err);
      }
    };

    // Fetch Recent Activity (all transactions)
    const fetchActivity = async () => {
      try {
        const q = query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(50));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const txList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Transaction[];
          setTransactions(txList);
          setStats(prev => ({ ...prev, totalTx: snapshot.size }));
        });
        return unsubscribe;
      } catch (err) {
        console.error('Fetch activity error:', err);
      }
    };

    const unsubUsersPromise = fetchUsers();
    const unsubActivityPromise = fetchActivity();

    return () => {
      unsubUsersPromise.then(unsub => unsub?.());
      unsubActivityPromise.then(unsub => unsub?.());
    };
  }, []);

  const handleBlockUser = async (userId: string, currentlyBlocked: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        blocked: !currentlyBlocked,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      alert('Action failed');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure? This will delete the user record but not their Auth account (backend required for that).')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (err) {
      alert('Delete failed');
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notificationMsg.trim()) return;
    setIsSending(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        message: notificationMsg.trim(),
        createdAt: new Date().toISOString(),
        adminEmail: adminEmail
      });
      setNotificationMsg('');
      alert('Notification sent to all users!');
    } catch (err) {
      alert('Failed to send');
    } finally {
      setIsSending(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Sidebar / Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-all active:scale-95">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-none mb-1 text-slate-900">Admin Control</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{adminEmail}</p>
            </div>
          </div>
        </div>

        <nav className="hidden md:flex bg-slate-100 p-1.5 rounded-2xl gap-1">
          {[
            { id: 'users', label: 'Users', icon: Users },
            { id: 'activity', label: 'Activity', icon: Activity },
            { id: 'notifications', label: 'Broadcast', icon: Bell },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-[1rem] text-sm font-black transition-all ${
                activeTab === tab.id 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-emerald-500' : ''}`} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <StatCard icon={<Users className="text-blue-500" />} label="Total Users" value={stats.totalUsers} color="blue" />
          <StatCard icon={<Activity className="text-emerald-500" />} label="Recent Tx" value={stats.totalTx} color="emerald" />
          <StatCard icon={<Bell className="text-amber-500" />} label="Notifications" value="System Live" color="amber" />
          <StatCard icon={<ShieldAlert className="text-slate-500" />} label="Admin Role" value="Master" color="slate" />
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-[2.5rem] shadow-[0_32px_64px_-24px_rgba(0,0,0,0.06)] border border-slate-100 overflow-hidden">
          {activeTab === 'users' && (
            <div className="p-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">User Management</h2>
                  <p className="text-slate-400 font-medium text-sm">Control and monitor all registered users</p>
                </div>
                <div className="relative w-full md:w-64">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                   <input 
                    type="text" 
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 transition-all"
                   />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="pb-4 pt-0 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">User</th>
                      <th className="pb-4 pt-0 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Joined</th>
                      <th className="pb-4 pt-0 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Last Login</th>
                      <th className="pb-4 pt-0 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Status</th>
                      <th className="pb-4 pt-0 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                     {filteredUsers.map(user => (
                       <tr key={user.id} className="group hover:bg-slate-50/50 transition-all">
                         <td className="py-5 px-4 font-bold text-sm text-slate-900">
                           <div className="flex items-center gap-3">
                             <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-400">
                               {user.displayName?.charAt(0) || 'U'}
                             </div>
                             <div>
                               <div className="leading-none mb-1">{user.displayName}</div>
                               <div className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">{user.email}</div>
                             </div>
                           </div>
                         </td>
                         <td className="py-5 px-4 text-sm font-bold text-slate-400">{format(new Date(user.createdAt || Date.now()), 'MMM d, yyyy')}</td>
                         <td className="py-5 px-4 text-sm font-bold text-slate-400">{user.lastLogin ? format(new Date(user.lastLogin), 'hh:mm a, MMM d') : '-'}</td>
                         <td className="py-5 px-4">
                           <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${user.blocked ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                             {user.blocked ? 'Blocked' : 'Active'}
                           </span>
                         </td>
                         <td className="py-5 px-4 text-right">
                           <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                             <button 
                               onClick={() => handleBlockUser(user.id, !!user.blocked)}
                               className={`p-2 rounded-xl transition-all ${user.blocked ? 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100' : 'bg-amber-50 text-amber-500 hover:bg-amber-100'}`}
                               title={user.blocked ? 'Unblock' : 'Block'}
                             >
                                <UserX className="w-4 h-4" />
                             </button>
                             <button 
                               onClick={() => handleDeleteUser(user.id)}
                               className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all"
                               title="Delete Data"
                             >
                                <Trash2 className="w-4 h-4" />
                             </button>
                           </div>
                         </td>
                       </tr>
                     ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="p-8">
               <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-8">Activity Tracking</h2>
               <div className="space-y-3">
                 {transactions.map(tx => (
                   <div key={tx.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                     <div className="flex items-center gap-4">
                       <div className={`p-3 rounded-xl ${tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                         {tx.type === 'income' ? <Activity className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                       </div>
                       <div>
                         <p className="text-sm font-black text-slate-800">{tx.category} <span className="text-slate-400 font-bold ml-1">- {tx.note}</span></p>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(tx.date), 'MMM d, hh:mm a')}</p>
                       </div>
                     </div>
                     <div className="text-right">
                       <p className={`text-sm font-black ${tx.type === 'income' ? 'text-emerald-500' : 'text-slate-900'}`}>
                         {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString()}
                       </p>
                       <p className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">UID: {tx.userId.slice(0, 8)}...</p>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="p-8">
               <div className="max-w-xl">
                 <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Send Broadcast</h2>
                 <p className="text-slate-400 font-medium text-sm mb-8">This message will be visible to all users on their dashboards.</p>
                 
                 <form onSubmit={handleSendNotification} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notification Message</label>
                      <textarea 
                        value={notificationMsg}
                        onChange={(e) => setNotificationMsg(e.target.value)}
                        placeholder="Type your message here..."
                        className="w-full min-h-[160px] bg-slate-50 border-none rounded-3xl p-6 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={isSending || !notificationMsg.trim()}
                      className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-5 rounded-[1.5rem] font-black text-sm shadow-xl shadow-slate-900/10 active:scale-95 disabled:opacity-50 transition-all hover:bg-slate-800"
                    >
                      {isSending ? <Clock className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                      Send Broadcast Now
                    </button>
                 </form>

                 <div className="mt-12 p-6 bg-amber-50 rounded-3xl border border-amber-100 flex gap-4">
                    <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
                    <div>
                      <h4 className="text-sm font-black text-amber-900 mb-1">Important Note</h4>
                      <p className="text-xs font-semibold text-amber-800/60 leading-relaxed">
                        Notifications sent are immutable and visible instantly. Ensure the content is verified before broadcasting.
                      </p>
                    </div>
                 </div>
               </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string | number, color: string }) {
  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-50 flex items-center gap-5">
      <div className={`p-4 rounded-xl bg-${color}-50`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
        <p className="text-xl font-black text-slate-900 tracking-tight">{value}</p>
      </div>
    </div>
  );
}
