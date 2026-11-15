import React, { useState, useEffect } from 'react';
import {
  adminLogin,
  adminLogout,
  adminGetMe,
  adminGetSetupStatus,
  adminFirstRunSetup,
  adminGetLeads,
  adminGetLeadDetails,
  adminUpdateLeadStatus,
  adminAddLeadNote,
  adminDeleteLead,
  adminSaveProposal,
  getSystemHealth
} from '../services/api';
import {
  X,
  Search,
  Filter,
  MessageSquare,
  Clipboard,
  Lock,
  LogOut,
  KeyRound,
  Trash2,
  Database,
  Shield,
  Clock,
  Send,
  AlertTriangle
} from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: string } | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Login form state
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState<number | null>(null);

  // First-run setup state
  const [isSetupRequired, setIsSetupRequired] = useState(false);
  const [setupTokenInput, setSetupTokenInput] = useState('');
  const [setupUsernameInput, setSetupUsernameInput] = useState('');
  const [setupPasswordInput, setSetupPasswordInput] = useState('');
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('');
  const [setupError, setSetupError] = useState('');
  const [isSubmittingSetup, setIsSubmittingSetup] = useState(false);

  // Dashboard state
  const [leads, setLeads] = useState<any[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('الكل');
  const [sectorFilter, setSectorFilter] = useState('الكل');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [leadDetailsLoading, setLeadDetailsLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [proposalModal, setProposalModal] = useState<{ lead: any; text: string } | null>(null);
  const [storageMode, setStorageMode] = useState<string>('checking');

  // Check existing session
  useEffect(() => {
    const checkSession = async () => {
      const res = await adminGetMe();
      if (res.authenticated && res.user) {
        setCurrentUser(res.user);
      } else {
        const setupStatus = await adminGetSetupStatus();
        setIsSetupRequired(setupStatus.isSetupRequired);
      }
      setAuthChecking(false);

      const health = await getSystemHealth();
      setStorageMode(health.storageMode);
    };
    checkSession();
  }, []);

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');

    if (setupPasswordInput !== setupPasswordConfirm) {
      setSetupError('كلمتا المرور غير متطابقتين');
      return;
    }

    if (setupPasswordInput.length < 10) {
      setSetupError('كلمة المرور يجب ألا تقل عن 10 خانات');
      return;
    }

    setIsSubmittingSetup(true);
    const res = await adminFirstRunSetup(setupTokenInput, setupUsernameInput, setupPasswordInput);
    setIsSubmittingSetup(false);

    if (res.success && res.user) {
      setCurrentUser(res.user);
      setIsSetupRequired(false);
    } else {
      setSetupError(res.error || 'فشلت عملية التهيئة الأولية');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    const res = await adminLogin(usernameInput, passwordInput);
    setIsLoggingIn(false);

    if (res.success && res.user) {
      setCurrentUser(res.user);
      setLockoutTimer(null);
    } else {
      setLoginError(res.error || 'فشل تسجيل الدخول');
      if (res.waitSeconds) {
        setLockoutTimer(res.waitSeconds);
      }
    }
  };

  const handleLogout = async () => {
    await adminLogout();
    setCurrentUser(null);
    setSelectedLead(null);
  };

  const fetchLeads = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await adminGetLeads({
        search: searchTerm,
        status: statusFilter,
        sector: sectorFilter,
        limit: 100
      });
      setLeads(res.leads || []);
      setTotalLeads(res.total || 0);
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchLeads();
      const interval = setInterval(fetchLeads, 60000);
      return () => clearInterval(interval);
    }
  }, [currentUser, searchTerm, statusFilter, sectorFilter]);

  const openLeadDetails = async (leadId: string) => {
    setLeadDetailsLoading(true);
    try {
      const detailed = await adminGetLeadDetails(leadId);
      if (detailed) {
        setSelectedLead(detailed);
      }
    } catch (e) {
      console.error('Failed to load lead details:', e);
    } finally {
      setLeadDetailsLoading(false);
    }
  };

  const handleStatusChange = async (leadId: string, status: string) => {
    try {
      const success = await adminUpdateLeadStatus(leadId, status);
      if (success) {
        setLeads(leads.map(l => (l.id === leadId ? { ...l, status } : l)));
        if (selectedLead && selectedLead.id === leadId) {
          setSelectedLead({ ...selectedLead, status });
        }
      }
    } catch (e) {
      console.error('Failed status change:', e);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !noteText.trim() || isAddingNote) return;

    setIsAddingNote(true);
    try {
      const newNote = await adminAddLeadNote(selectedLead.id, noteText.trim());
      if (newNote) {
        setSelectedLead({
          ...selectedLead,
          notes: [newNote, ...(selectedLead.notes || [])]
        });
        setNoteText('');
      }
    } catch (e) {
      console.error('Failed adding note:', e);
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (currentUser?.role !== 'superadmin') {
      alert('حذف العملاء مقتصر على المشرف العام (superadmin)');
      return;
    }

    if (!window.confirm('هل تريد حذف هذا العميل وسجلاته نهائياً من قاعدة البيانات؟')) {
      return;
    }

    try {
      const success = await adminDeleteLead(leadId);
      if (success) {
        setLeads(leads.filter(l => l.id !== leadId));
        if (selectedLead && selectedLead.id === leadId) {
          setSelectedLead(null);
        }
      }
    } catch (e) {
      console.error('Failed deleting lead:', e);
    }
  };

  const handleSendProposal = async () => {
    if (!proposalModal) return;
    try {
      await adminSaveProposal(proposalModal.lead.id, proposalModal.text);
      await handleStatusChange(proposalModal.lead.id, 'contacted');

      const text = encodeURIComponent(proposalModal.text);
      window.open(`https://wa.me/${proposalModal.lead.whatsapp_number || proposalModal.lead.whatsapp}?text=${text}`, '_blank');
      setProposalModal(null);
    } catch (e) {
      console.error(e);
    }
  };

  const uniqueSectors = Array.from(new Set(leads.map(l => l.sector_l2))).filter(Boolean);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center rtl font-arabic">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-luxury-accent mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm">جاري التحقق من جلسة الإدارة…</p>
        </div>
      </div>
    );
  }

  // --- LOGIN / SETUP SCREEN ---
  if (!currentUser) {
    if (isSetupRequired) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 rtl font-arabic">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl text-white">
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Shield size={26} />
            </div>

            <h2 className="text-2xl font-bold text-center mb-1 text-slate-100">تهيئة لوحة التحكم</h2>
            <p className="text-slate-400 text-xs text-center mb-6 leading-relaxed">
              لم يتم إنشاء أي حساب إداري بعد. يرجى إدخال رمز التهيئة الأولي (One-Time Setup Token) المعروض في سجلات الخادم لتعيين حساب المشرف العام.
            </p>

            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">رمز التهيئة (Setup Token)</label>
                <input
                  type="password"
                  required
                  value={setupTokenInput}
                  onChange={(e) => setSetupTokenInput(e.target.value)}
                  placeholder="أدخل الرمز من سجلات الخادم…"
                  className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-luxury-accent text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">اسم المستخدم الجديد</label>
                <input
                  type="text"
                  required
                  value={setupUsernameInput}
                  onChange={(e) => setSetupUsernameInput(e.target.value)}
                  placeholder="مثال: system_lead"
                  className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-luxury-accent text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">كلمة المرور القوية (10 خانات فأكثر)</label>
                <input
                  type="password"
                  required
                  value={setupPasswordInput}
                  onChange={(e) => setSetupPasswordInput(e.target.value)}
                  placeholder="••••••••••"
                  className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-luxury-accent text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">تأكيد كلمة المرور</label>
                <input
                  type="password"
                  required
                  value={setupPasswordConfirm}
                  onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                  placeholder="••••••••••"
                  className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-luxury-accent text-sm"
                />
              </div>

              {setupError && (
                <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                  <span>{setupError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingSetup}
                className="w-full py-3 bg-luxury-accent hover:opacity-95 text-white font-bold rounded-xl transition-all shadow-lg text-sm flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {isSubmittingSetup ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>
                    <span>جاري التهيئة وتأمين النظام…</span>
                  </>
                ) : (
                  <>
                    <KeyRound size={16} />
                    <span>إتمام التهيئة وتأمين لوحة الإدارة</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 rtl font-arabic">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl text-white">
          <div className="w-14 h-14 bg-luxury-accent/10 border border-luxury-accent/30 text-luxury-accent rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock size={26} />
          </div>

          <h2 className="text-2xl font-bold text-center mb-1 text-slate-100">لوحة إدارة BIK</h2>
          <p className="text-slate-400 text-sm text-center mb-6">
            تسجيل الدخول للنظام الداخلي الآمن (Self-Hosted)
          </p>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">اسم المستخدم</label>
              <input
                type="text"
                required
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="اسم المستخدم"
                className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-luxury-accent text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">كلمة المرور</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-luxury-accent text-sm"
              />
            </div>

            {loginError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {lockoutTimer && (
              <p className="text-amber-400 text-xs text-center font-medium">
                يرجى الانتظار {lockoutTimer} ثانية قبل إعادة المحاولة.
              </p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3.5 bg-luxury-accent hover:opacity-95 text-white font-bold rounded-xl transition-all shadow-lg text-sm flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>جاري التحقق…</span>
                </>
              ) : (
                <>
                  <KeyRound size={16} />
                  <span>دخول لوحة التحكم</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800 text-center">
            <span className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
              <Database size={12} />
              نمط التخزين: {storageMode === 'managed_database' ? 'قاعدة بيانات مُدارة' : 'مستودع بيانات محلي معزول'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // --- DASHBOARD VIEW ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 rtl font-arabic pb-20">
      
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="text-xl font-black text-luxury-accent font-display">BIK Admin</span>
          <div className="h-5 w-px bg-slate-800"></div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1.5">
            <Database size={12} className={storageMode === 'managed_database' ? 'text-green-400' : 'text-amber-400'} />
            {storageMode === 'managed_database' ? 'قاعدة بيانات مُدارة' : 'تخزين احتياطي محلي'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <Shield size={14} className="text-luxury-accent" />
            <span className="font-bold text-slate-200">{currentUser.username}</span>
            <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[11px]">
              {currentUser.role === 'superadmin' ? 'مشرف عام' : currentUser.role === 'editor' ? 'محرر' : 'مشاهد'}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-900/40 px-3 py-1.5 rounded-lg transition-all"
          >
            <LogOut size={14} />
            <span>خروج</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Search & Filters */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute right-3.5 top-3 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="بحث بالاسم أو الشركة أو الهاتف…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pr-10 pl-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-luxury-accent"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Filter size={14} />
              <span>الحالة:</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-luxury-accent"
            >
              <option value="الكل">كل الحالات</option>
              <option value="new">جديد (New)</option>
              <option value="contacted">تم التواصل (Contacted)</option>
              <option value="in_progress">قيد المتابعة (In Progress)</option>
              <option value="closed">مكتمل (Closed)</option>
              <option value="archived">مؤرشف (Archived)</option>
            </select>

            {uniqueSectors.length > 0 && (
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-luxury-accent"
              >
                <option value="الكل">كل القطاعات</option>
                {uniqueSectors.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            <button
              onClick={fetchLeads}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs rounded-xl text-slate-300 transition-all"
            >
              تحديث
            </button>
          </div>
        </div>

        {/* Leads Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-base text-slate-200">
              سجل العملاء ({totalLeads})
            </h3>
            {loading && <span className="text-xs text-slate-400 animate-pulse">جاري التحميل…</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-800/60 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">الشركة وصاحبها</th>
                  <th className="p-3.5">القطاع</th>
                  <th className="p-3.5">التواصل</th>
                  <th className="p-3.5">الصحة التشخيصية</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-slate-500">
                      لا يوجد عملاء مسجلين يطابقون شروط البحث.
                    </td>
                  </tr>
                ) : (
                  leads.map((l) => {
                    const r = l.report;
                    const phone = l.whatsapp_number || l.whatsapp;
                    return (
                      <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5">
                          <div className="font-bold text-slate-100 text-sm">{l.company_name}</div>
                          <div className="text-slate-400 text-xs">{l.name || l.user_name}</div>
                        </td>
                        <td className="p-3.5">
                          <span className="bg-slate-800 px-2 py-1 rounded text-[11px] text-slate-300">
                            {l.sector_l2 || l.sector_l1 || 'غير محدد'}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-300" dir="ltr">
                          {phone}
                        </td>
                        <td className="p-3.5">
                          {r ? (
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${
                                r.overall_score >= 75 ? 'text-green-400' : r.overall_score >= 50 ? 'text-amber-400' : 'text-red-400'
                              }`}>
                                {r.overall_score}/100
                              </span>
                              <span className="text-[11px] text-slate-500">({r.health_label})</span>
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <select
                            value={l.status || 'new'}
                            onChange={(e) => handleStatusChange(l.id, e.target.value)}
                            disabled={currentUser.role === 'viewer'}
                            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none"
                          >
                            <option value="new">جديد</option>
                            <option value="contacted">تم التواصل</option>
                            <option value="in_progress">قيد المتابعة</option>
                            <option value="closed">مكتمل</option>
                            <option value="archived">مؤرشف</option>
                          </select>
                        </td>
                        <td className="p-3.5 text-slate-400 text-[11px]">
                          {new Date(l.created_at).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openLeadDetails(l.id)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
                            >
                              التفاصيل
                            </button>
                            {currentUser.role === 'superadmin' && (
                              <button
                                onClick={() => handleDeleteLead(l.id)}
                                title="حذف العميل"
                                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* LEAD DETAILS MODAL */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 text-slate-200 max-h-[90vh] overflow-y-auto shadow-2xl">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedLead.company_name}</h2>
                <span className="text-xs text-slate-400">العميل: {selectedLead.name || selectedLead.user_name}</span>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6 text-xs bg-slate-800/50 p-4 rounded-xl">
              <div>
                <span className="text-slate-400">رقم واتساب:</span>{' '}
                <span className="font-mono text-white" dir="ltr">{selectedLead.whatsapp_number || selectedLead.whatsapp}</span>
              </div>
              <div>
                <span className="text-slate-400">القطاع:</span>{' '}
                <span className="text-white">{selectedLead.sector_l2 || selectedLead.sector_l1 || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400">الدولة والمدينة:</span>{' '}
                <span className="text-white">{selectedLead.country || '—'} - {selectedLead.city || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400">تاريخ التسجيل:</span>{' '}
                <span className="text-white">{new Date(selectedLead.created_at).toLocaleString('ar-EG')}</span>
              </div>
            </div>

            {/* Diagnostic Report Summary */}
            {selectedLead.report && (
              <div className="mb-6 bg-slate-800/30 border border-slate-800 rounded-xl p-4">
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <Clipboard size={16} className="text-luxury-accent" />
                  <span>نتائج التقرير التشخيصي</span>
                  <span className="text-xs text-green-400 mr-auto font-mono">
                    {selectedLead.report.overall_score}/100 ({selectedLead.report.health_label})
                  </span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-lg mb-3">
                  {selectedLead.report.headline_diagnosis}
                </p>

                {selectedLead.report.blind_spots && selectedLead.report.blind_spots.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    <span className="text-[11px] font-bold text-amber-400">النقاط العمياء:</span>
                    {selectedLead.report.blind_spots.map((b: any, idx: number) => (
                      <div key={idx} className="text-[11px] text-slate-300 bg-slate-900/40 p-2 rounded flex justify-between">
                        <span>{b.name}</span>
                        <span className="text-amber-400 font-semibold">{b.impact_level}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Admin Notes Section */}
            <div className="mb-6">
              <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <MessageSquare size={16} className="text-luxury-accent" />
                <span>ملاحظات فريق الاستشارات ({selectedLead.notes?.length || 0})</span>
              </h4>

              {currentUser.role !== 'viewer' && (
                <form onSubmit={handleAddNote} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="إضافة ملاحظة جديدة حول العميل…"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-luxury-accent"
                  />
                  <button
                    type="submit"
                    disabled={isAddingNote || !noteText.trim()}
                    className="px-4 py-2 bg-luxury-accent hover:opacity-90 disabled:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <Send size={13} />
                    <span>حفظ</span>
                  </button>
                </form>
              )}

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedLead.notes && selectedLead.notes.length > 0 ? (
                  selectedLead.notes.map((n: any) => (
                    <div key={n.id} className="bg-slate-800/40 border border-slate-800 p-3 rounded-xl text-xs">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span className="font-semibold text-slate-300">{n.author_name || 'مسؤول'}</span>
                        <span>{new Date(n.created_at).toLocaleString('ar-EG')}</span>
                      </div>
                      <p className="text-slate-200">{n.note_text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 text-center py-3">لا توجد ملاحظات مسجلة بعد.</p>
                )}
              </div>
            </div>

            {/* Status Change History */}
            {selectedLead.status_history && selectedLead.status_history.length > 0 && (
              <div className="mb-4 pt-4 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-400 mb-2 block">سجل تغييرات الحالة:</span>
                <div className="space-y-1 text-[11px] text-slate-500">
                  {selectedLead.status_history.map((h: any) => (
                    <div key={h.id} className="flex items-center justify-between">
                      <span>تغيير إلى "{h.new_status}" بواسطة {h.changed_by_name || 'مسؤول'}</span>
                      <span>{new Date(h.changed_at).toLocaleString('ar-EG')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLead(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs rounded-xl text-slate-300"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
