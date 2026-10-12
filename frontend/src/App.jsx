import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  UserCheck, 
  BookOpen, 
  RefreshCw, 
  TrendingUp, 
  Sliders, 
  Send, 
  Building2, 
  CreditCard, 
  User, 
  Terminal, 
  Activity, 
  Download, 
  Scale, 
  Lock, 
  LogOut, 
  BadgeCheck, 
  Users, 
  ShieldCheck, 
  X, 
  History,
  ArrowRight
} from 'lucide-react';

export default function App() {
  // Safe state initialization prevents JSON.parse from ever crashing React
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const raw = localStorage.getItem('finsight_user');
      if (!raw || raw === 'undefined' || raw === 'null') return null;
      return JSON.parse(raw);
    } catch (_) {
      localStorage.removeItem('finsight_user');
      return null;
    }
  });

  // 2-Step Login States
  const [loginStep, setLoginStep] = useState(1);
  const [username, setUsername] = useState('analyst.verma');
  const [password, setPassword] = useState('Analyst@2026');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingOfficerInfo, setPendingOfficerInfo] = useState(null);
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Executive Queue for Checker
  const [executiveQueue, setExecutiveQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  // Governance Modal
  const [govModalOpen, setGovModalOpen] = useState(false);
  const [govTab, setGovTab] = useState('directory');
  const [officerList, setOfficerList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Active Workspace Transaction
  const [formData, setFormData] = useState({
    transaction_id: 'TXN-1002491',
    customer_name: 'Aarav Malhotra',
    amount: 850000,
    historical_avg: 45000,
    channel: 'IMPS',
    beneficiary_name: 'Apex Shell Logistics Ltd',
    beneficiary_is_new: true,
    narration: 'Consulting Retainer Settlement'
  });

  const [loading, setLoading] = useState(false);
  const [caseData, setCaseData] = useState(null);
  const [activeTab, setActiveTab] = useState('findings');
  const [errorMessage, setErrorMessage] = useState('');

  // Adjudication Dialogs
  const [makerModalOpen, setMakerModalOpen] = useState(false);
  const [makerDecision, setMakerDecision] = useState('RECOMMEND_REJECT');
  const [makerNotes, setMakerNotes] = useState('');

  const [checkerModalOpen, setCheckerModalOpen] = useState(false);
  const [checkerDecision, setCheckerDecision] = useState('CONFIRMED_REJECTED');
  const [checkerNotes, setCheckerNotes] = useState('');
  const [activeAdjudicatingCase, setActiveAdjudicatingCase] = useState(null);

  // Step 1: Password Check
  const handleStep1Submit = async (e) => {
    if (e) e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/v1/auth/login-step1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Authentication failed. Check credentials.');
      }
      const data = await res.json();
      setMfaChallengeToken(data.mfa_challenge_token);
      setPendingOfficerInfo(data);
      setLoginStep(2);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 2: 2FA TOTP Check
  const handleStep2Submit = async (e) => {
    if (e) e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/v1/auth/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mfa_challenge_token: mfaChallengeToken, totp_code: totpCode })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'MFA validation failed.');
      }
      const data = await res.json();
      setCurrentUser(data.user);
      localStorage.setItem('finsight_user', JSON.stringify(data.user));
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) {}
    setCurrentUser(null);
    localStorage.removeItem('finsight_user');
    setCaseData(null);
    setLoginStep(1);
    setTotpCode('');
  };

  const fetchExecutiveQueue = async () => {
    setLoadingQueue(true);
    try {
      const res = await fetch('/api/v1/investigations/queue', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setExecutiveQueue(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchExecutiveQueue();
    }
  }, [currentUser]);

  const loadGovernanceData = async () => {
    try {
      const [uRes, aRes] = await Promise.all([
        fetch('/api/v1/auth/users', { credentials: 'include' }),
        fetch('/api/v1/auth/audit-logs', { credentials: 'include' })
      ]);
      if (uRes.ok) setOfficerList(await uRes.json());
      if (aRes.ok) setAuditLogs(await aRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (govModalOpen && currentUser) loadGovernanceData();
  }, [govModalOpen]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const generateRandomSimulation = () => {
    const randomTxn = `TXN-${Math.floor(1000000 + Math.random() * 900000)}`;
    const originator = ["Aarav Malhotra", "Vikram Singhania", "Nexa Cloud Tech", "TechFab Solutions"][Math.floor(Math.random() * 4)];
    const benList = [
      { name: "Panama Horizon Shell Corp", isNew: true },
      { name: "Kiran Global Hardware", isNew: false },
      { name: "KoinX BVI Crypto Exchange", isNew: true }
    ];
    const benObj = benList[Math.floor(Math.random() * benList.length)];
    const ch = ["IMPS", "NEFT", "RTGS", "UPI", "SWIFT"][Math.floor(Math.random() * 5)];
    const isHigh = Math.random() > 0.4;
    const amount = isHigh ? Math.floor(450000 + Math.random() * 1800000) : Math.floor(2500 + Math.random() * 35000);
    const baseline = isHigh ? Math.floor(20000 + Math.random() * 40000) : Math.floor(50000 + Math.random() * 180000);

    setFormData({
      transaction_id: randomTxn,
      customer_name: originator,
      amount: amount,
      historical_avg: baseline,
      channel: ch,
      beneficiary_name: benObj.name,
      beneficiary_is_new: benObj.isNew,
      narration: "Commercial Retainer Settlement"
    });
  };

  const handleSimulate = async () => {
    setLoading(true);
    setErrorMessage('');
    const payload = {
      transaction_id: String(formData.transaction_id || `TXN-${Date.now()}`),
      customer_id: 'CUST-44021',
      customer_name: String(formData.customer_name || 'Customer'),
      amount: parseFloat(formData.amount) || 1000.0,
      currency: 'INR',
      channel: String(formData.channel || 'IMPS'),
      beneficiary_name: String(formData.beneficiary_name || 'Beneficiary'),
      beneficiary_is_new: Boolean(formData.beneficiary_is_new),
      narration: String(formData.narration || 'Transfer'),
      historical_avg: parseFloat(formData.historical_avg) || 50000.0
    };

    try {
      const res = await fetch('/api/v1/investigations/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setCaseData(data);
      fetchExecutiveQueue();
    } catch (err) {
      setErrorMessage(err.message || 'Audit failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMakerSubmit = async () => {
    if (!caseData?.case_id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/investigations/${caseData.case_id}/maker-recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recommendation: makerDecision, findings_summary: makerNotes }),
      });
      if (!res.ok) throw new Error("Maker submission rejected.");
      const updated = await res.json();
      setCaseData(updated);
      setMakerModalOpen(false);
      fetchExecutiveQueue();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckerSubmit = async () => {
    const targetCaseId = activeAdjudicatingCase?.case_id || caseData?.case_id;
    if (!targetCaseId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/investigations/${targetCaseId}/checker-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ final_decision: checkerDecision, statutory_memo: checkerNotes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Checker authorization failed.");
      }
      const updated = await res.json();
      setCaseData(updated);
      setCheckerModalOpen(false);
      fetchExecutiveQueue();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadAuditReport = () => {
    if (!caseData) return;
    const blob = new Blob([JSON.stringify(caseData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FINSIGHT_SAR_AUDIT_${caseData.case_id || 'REPORT'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isChecker = currentUser?.role === 'MLRO_OFFICER';
  const velocityRatio = (parseFloat(formData.amount || 0) / (parseFloat(formData.historical_avg || 1) || 1)).toFixed(1);
  const riskPercent = caseData ? Math.round((caseData.risk_score || 0) * 100) : null;

  // ==========================================
  // AUTHENTICATION VIEW (MFA TOTP)
  // ==========================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#05070e] text-slate-100 flex items-center justify-center p-4 md:p-8 font-sans antialiased selection:bg-indigo-500/30">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 bg-[#090d18] border border-slate-800/90 rounded-3xl shadow-2xl overflow-hidden min-h-[580px]">
          
          <div className="md:col-span-5 bg-gradient-to-br from-[#0c1326] via-[#090e1c] to-[#060912] p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800/80">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 p-[1.5px] shadow-lg shadow-indigo-500/20">
                  <div className="h-full w-full bg-[#090e1c] rounded-[14px] flex items-center justify-center">
                    <Shield className="w-5 h-5 text-indigo-400" />
                  </div>
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-wider text-white uppercase font-mono">FINSIGHT AI</h1>
                  <span className="text-[10px] font-sans px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium">
                    Restricted Banking Gateway
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Four-Eyes Governance Portal</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Dual-control AML decisioning. Analysts triage anomalies (Maker); MLRO Officers execute legal freezes (Checker).
                </p>
              </div>

              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-start gap-2.5 text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">Separation of Operational Duties</div>
                    <div className="text-[11px] text-slate-400">Analyst recommends; MLRO Officer holds exclusive authority to freeze or file SARs.</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-slate-300">
                  <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">RFC 6238 Rolling TOTP</div>
                    <div className="text-[11px] text-slate-400">Time-based cryptographic codes generated via Google/Microsoft Authenticator.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-800/80 text-[11px] text-slate-500 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>SOC-2 Type II Certified Institutional Access</span>
            </div>
          </div>

          <div className="md:col-span-7 p-8 flex flex-col justify-between bg-[#080c16]">
            <div>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    {loginStep === 1 ? "1. Officer Authentication" : "2. Two-Factor Verification"}
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded">
                  STEP {loginStep} OF 2
                </span>
              </div>

              {loginStep === 1 ? (
                <form onSubmit={handleStep1Submit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium">Compliance Officer Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. analyst.verma"
                      className="w-full bg-[#05070e] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition font-mono"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full bg-[#05070e] border border-slate-800 rounded-xl px-4 py-2.5 pr-10 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition font-mono"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer text-xs"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  {authError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{authError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/25 mt-2"
                  >
                    {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    <span>Verify Credentials & Proceed to 2FA</span>
                  </button>

                  <div className="pt-4 mt-2 border-t border-slate-800/80 space-y-2">
                    <span className="text-[11px] text-slate-400 font-medium">Select Pre-Provisioned Officer Persona:</span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => { setUsername('analyst.verma'); setPassword('Analyst@2026'); }}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                          username === 'analyst.verma' ? 'bg-indigo-500/10 border-indigo-500/60 ring-1 ring-indigo-500/30' : 'bg-[#05070e] border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Rohan Verma</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">MAKER</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">Role: ANALYST &bull; Desk: Triage</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setUsername('officer.sharma'); setPassword('Compliance@2026'); }}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                          username === 'officer.sharma' ? 'bg-cyan-500/10 border-cyan-500/60 ring-1 ring-cyan-500/30' : 'bg-[#05070e] border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Priya Sharma</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">CHECKER</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">Role: MLRO &bull; Desk: Adjudication</div>
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleStep2Submit} className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-[#05070e] border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-slate-400">Authenticating Identity:</div>
                      <div className="text-sm font-bold text-white">{pendingOfficerInfo?.officer_name}</div>
                    </div>
                    <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded">
                      {pendingOfficerInfo?.badge_id}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label className="text-slate-300 font-medium">Enter 6-Digit Authenticator Code (TOTP)</label>
                      <button
                        type="button"
                        onClick={() => setShowPairingModal(true)}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                      >
                        Pair Authenticator App
                      </button>
                    </div>

                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className="w-full bg-[#05070e] border border-slate-800 rounded-xl px-4 py-3 text-center text-xl tracking-[0.6em] text-white focus:outline-none focus:border-emerald-500 transition font-mono font-bold"
                      required
                    />
                    <p className="text-[11px] text-slate-500 text-center">
                      Read the rolling code generated in Google Authenticator or Microsoft Authenticator.
                    </p>
                  </div>

                  {authError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{authError}</span>
                    </div>
                  )}

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => { setLoginStep(1); setTotpCode(''); }}
                      className="w-1/3 py-3 rounded-xl text-xs bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 transition cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={authLoading || totpCode.length !== 6}
                      className="w-2/3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/25 disabled:opacity-50"
                    >
                      {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      <span>Validate & Establish Session</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            <p className="text-[11px] text-slate-500 text-center mt-6">
              FinSight AI Institutional Terminal &bull; Bank Identity Synchronization Active
            </p>
          </div>
        </div>

        {/* Device Pairing Modal */}
        {showPairingModal && pendingOfficerInfo && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-[#0b1020] border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="text-white font-bold text-sm">
                  Pair Corporate Mobile Authenticator
                </div>
                <button onClick={() => setShowPairingModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed space-y-3">
                <p>
                  Scan this QR code into <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> on your phone:
                </p>

                <div className="flex justify-center p-3 bg-white rounded-2xl w-fit mx-auto shadow-inner">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pendingOfficerInfo.otpauth_uri)}`} 
                    alt="Authenticator QR Code" 
                    className="w-44 h-44 rounded"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] text-slate-400">Manual Entry Base32 Secret:</span>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#05070e] border border-slate-800 font-mono text-cyan-300 text-xs">
                    <span>{pendingOfficerInfo.totp_seed}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(pendingOfficerInfo.totp_seed)}
                      className="px-2 py-1 text-slate-400 hover:text-white transition cursor-pointer text-xs"
                    >
                      {copiedSeed ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowPairingModal(false)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // MAIN WORKSPACE (AUTHENTICATED)
  // ==========================================
  return (
    <div className="min-h-screen bg-[#06080f] text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500/30">
      
      <header className="border-b border-slate-800/80 bg-[#090d18]/90 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20">
            <div className="h-full w-full bg-[#090d18] rounded-[11px] flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider text-white uppercase font-mono">FINSIGHT INTELLIGENCE</h1>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                isChecker ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
              }`}>
                {isChecker ? "DESK: MLRO EXECUTIVE ADJUDICATION" : "DESK: ANALYST INVESTIGATION & TRIAGE"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isChecker ? "Exclusive Statutory Account Freeze & FIU-IND Reporting Authority" : "Transaction Monitoring & Anomaly Evidence Compilation Scope"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => setGovModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer font-sans text-xs font-medium"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span>Personnel & Security Logs</span>
          </button>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
            isChecker ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
          }`}>
            <BadgeCheck className="w-4 h-4" />
            <span className="font-sans font-medium">{currentUser.full_name}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold uppercase bg-black/40">
              {isChecker ? "CHECKER" : "MAKER"}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition cursor-pointer font-sans font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* CHECKER VIEW: EXECUTIVE REVIEW QUEUE */}
        {isChecker && (
          <section className="bg-gradient-to-b from-[#0b1020] to-[#080c18] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wide">
                  Executive Adjudication Queue & Four-Eyes Clearance Desk
                </h2>
                <p className="text-xs text-slate-400">
                  Cases flagged by automated models and recommended by Analysts. Review evidence and execute statutory orders.
                </p>
              </div>
              <button
                onClick={fetchExecutiveQueue}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-xs font-mono text-cyan-400 border border-slate-800 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingQueue ? 'animate-spin' : ''}`} />
                <span>Refresh Queue ({executiveQueue.length})</span>
              </button>
            </div>

            {executiveQueue.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 italic">
                No cases currently awaiting executive sign-off.
              </div>
            ) : (
              <div className="space-y-3">
                {executiveQueue.map((item) => (
                  <div key={item.case_id} className="p-4 rounded-xl bg-[#060912] border border-slate-800 hover:border-cyan-500/40 transition flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{item.case_id}</span>
                        <span className="font-mono text-cyan-400">&bull; {item.transaction_data?.transaction_id}</span>
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                          item.status === 'PENDING_CHECKER_APPROVAL' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      <div className="text-slate-300">
                        Transfer of <strong className="text-cyan-400 font-mono">₹{Number(item.transaction_data?.amount).toLocaleString('en-IN')}</strong> from {item.transaction_data?.customer_name} to <em>{item.transaction_data?.beneficiary_name}</em>
                      </div>
                      {item.maker_status && (
                        <div className="text-[11px] text-amber-300 flex items-center gap-1.5 pt-0.5">
                          <span>Maker Recommendation: <strong>{item.maker_status.decision}</strong> by {item.maker_status.officer}</span>
                          <span className="text-slate-500 italic font-sans">— "{item.maker_status.summary}"</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setCaseData(item);
                        setActiveAdjudicatingCase(item);
                        setCheckerModalOpen(true);
                      }}
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
                    >
                      <Scale className="w-4 h-4" />
                      <span>Adjudicate Ruling (Checker)</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Transaction Synthesizer Deck */}
        <section className="bg-gradient-to-b from-[#0b1020] to-[#080c18] border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Core Banking Transaction Injection & Velocity Profiler</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isChecker ? "Inspect or simulate live ledger scenarios across the 1,000,000-record database." : "Input transaction attributes for automated multi-agent audit."}
              </p>
            </div>

            <button
              onClick={generateRandomSimulation}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/30 transition cursor-pointer flex items-center gap-2 font-mono shadow-sm"
            >
              <span>Synthesize Dynamic Record</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 text-xs">
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-slate-400 font-medium flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-400" /> Originating Account Holder
              </label>
              <input
                type="text"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full bg-[#060912] border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
              />
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <label className="text-slate-400 font-medium flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" /> Beneficiary Entity Name
              </label>
              <input
                type="text"
                value={formData.beneficiary_name}
                onChange={(e) => setFormData({ ...formData, beneficiary_name: e.target.value })}
                className="w-full bg-[#060912] border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="text-slate-400 font-medium flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-400" /> Payment Channel
              </label>
              <select
                value={formData.channel}
                onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                className="w-full bg-[#060912] border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-mono focus:outline-none focus:border-indigo-500 transition font-medium"
              >
                <option value="IMPS">IMPS (Immediate Transfer)</option>
                <option value="NEFT">NEFT (Batch Settlement)</option>
                <option value="RTGS">RTGS (High Value Gross)</option>
                <option value="UPI">UPI (Unified Payments)</option>
                <option value="SWIFT">SWIFT (Cross-Border Wire)</option>
              </select>
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <label className="text-slate-400 font-medium">Beneficiary Relationship Status</label>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, beneficiary_is_new: !formData.beneficiary_is_new })}
                className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                  formData.beneficiary_is_new ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${formData.beneficiary_is_new ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  <span>{formData.beneficiary_is_new ? "First-Time Beneficiary" : "Historical Established Linkage"}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase bg-black/40">
                  {formData.beneficiary_is_new ? "EDD Mandated" : "Standard"}
                </span>
              </button>
            </div>

            <div className="md:col-span-6 bg-[#060912] p-4 rounded-xl border border-slate-800/80 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Transaction Amount</span>
                <span className="font-mono text-cyan-400 font-bold text-base">
                  ₹{Number(formData.amount).toLocaleString('en-IN')}
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="2500000"
                step="5000"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
            </div>

            <div className="md:col-span-6 bg-[#060912] p-4 rounded-xl border border-slate-800/80 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">30-Day Historical Average Baseline</span>
                <span className="font-mono text-slate-300 font-semibold text-xs">
                  ₹{Number(formData.historical_avg).toLocaleString('en-IN')}{" "}
                  <span className="font-mono font-bold px-2 py-0.5 rounded ml-2 bg-slate-800 text-slate-400">
                    {velocityRatio}x Spike Factor
                  </span>
                </span>
              </div>
              <input
                type="range"
                min="5000"
                max="300000"
                step="5000"
                value={formData.historical_avg}
                onChange={(e) => setFormData({ ...formData, historical_avg: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
            </div>

            <div className="md:col-span-9 space-y-1.5">
              <label className="text-slate-400 font-medium">Payment Narration / Purpose Memo</label>
              <input
                type="text"
                value={formData.narration}
                onChange={(e) => setFormData({ ...formData, narration: e.target.value })}
                className="w-full bg-[#060912] border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
              />
            </div>

            <div className="md:col-span-3 flex items-end">
              <button
                onClick={handleSimulate}
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30 disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Trigger Multi-Agent Audit</span>
              </button>
            </div>
          </div>
          {errorMessage && (
            <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </section>

        {/* Workflow State Banner */}
        {caseData && (
          <div>
            {caseData.requires_maker_review ? (
              <div className="p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30 text-amber-200 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                    <UserCheck className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold tracking-wide text-amber-300">
                      STAGE 1: AWAITING ANALYST RECOMMENDATION (MAKER STEP)
                    </h4>
                    <p className="text-xs text-amber-200/80 font-mono mt-0.5">
                      Case: <span className="font-bold">{caseData.case_id}</span> &bull; Risk: <span className="font-bold">{riskPercent}%</span> &bull; Anomaly detected. Analyst investigates and recommends action to MLRO.
                    </p>
                  </div>
                </div>

                {!isChecker ? (
                  <button
                    onClick={() => setMakerModalOpen(true)}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-lg flex items-center gap-2"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Submit Recommendation (Maker)</span>
                  </button>
                ) : (
                  <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400">
                    Awaiting Analyst Triage
                  </span>
                )}
              </div>
            ) : caseData.requires_checker_review ? (
              <div className="p-4 rounded-2xl border bg-cyan-500/10 border-cyan-500/30 text-cyan-200 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400">
                    <Scale className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold tracking-wide text-cyan-300">
                        STAGE 2: AWAITING MLRO OFFICER FINAL ADJUDICATION (CHECKER STEP)
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        MAKER PROPOSED: {caseData.maker_status?.decision}
                      </span>
                    </div>
                    <p className="text-xs text-cyan-200/80 font-mono mt-0.5">
                      Analyst {caseData.maker_status?.officer} recommended action: "{caseData.maker_status?.summary}". MLRO Checker approval required.
                    </p>
                  </div>
                </div>

                {isChecker ? (
                  <button
                    onClick={() => {
                      setActiveAdjudicatingCase(caseData);
                      setCheckerModalOpen(true);
                    }}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-lg flex items-center gap-2"
                  >
                    <Scale className="w-4 h-4" />
                    <span>Execute Ruling (Checker)</span>
                  </button>
                ) : (
                  <div className="text-right">
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-amber-400">
                      Locked: Awaiting MLRO Officer Sign-Off
                    </span>
                  </div>
                )}
              </div>
            ) : caseData.final_verdict && caseData.final_verdict !== "AUTO_APPROVED" ? (
              <div className="p-4 rounded-2xl border bg-indigo-500/10 border-indigo-500/30 text-indigo-200 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold tracking-wide text-indigo-300">
                        DUAL-CONTROL FOUR-EYES ADJUDICATION FINALIZED
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        {caseData.final_verdict}
                      </span>
                    </div>
                    <p className="text-xs text-indigo-200/80 font-mono mt-0.5">
                      Audited by Maker {caseData.maker_status?.officer} &bull; Legally Authorized by Checker {caseData.checker_status?.officer}
                    </p>
                  </div>
                </div>

                <button
                  onClick={downloadAuditReport}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Download SAR Case Dossier</span>
                </button>
              </div>
            ) : null}
          </div>
        )}

        {/* Telemetry Workspace */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <div className="bg-[#0b1020] border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-indigo-400" /> Cumulative Risk Index
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-400 font-bold">
                  HITL Gate: 70%
                </span>
              </div>

              <div className="flex items-baseline justify-between mb-3">
                <span className="text-4xl font-mono font-extrabold tracking-tight">
                  {riskPercent !== null ? (
                    <span className={riskPercent >= 70 ? 'text-rose-400' : (riskPercent >= 35 ? 'text-amber-400' : 'text-emerald-400')}>
                      {riskPercent}%
                    </span>
                  ) : (
                    <span className="text-slate-600 font-normal">--</span>
                  )}
                </span>
                <span className="text-xs font-mono font-semibold uppercase">
                  {riskPercent >= 70 ? (
                    <span className="text-rose-400 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">Critical AML Anomaly</span>
                  ) : riskPercent >= 35 ? (
                    <span className="text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">Moderate Commercial</span>
                  ) : riskPercent !== null ? (
                    <span className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">Within Policy Limits</span>
                  ) : (
                    <span className="text-slate-500">Standby</span>
                  )}
                </span>
              </div>

              <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div 
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    riskPercent >= 70 ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-lg' : 'bg-gradient-to-r from-cyan-500 to-emerald-500'
                  }`}
                  style={{ width: `${riskPercent || 0}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-2">
                <span>0.00 Clean</span>
                <span className="text-amber-400 font-semibold">0.70 Human Boundary</span>
                <span>1.00 Critical</span>
              </div>
            </div>

            <div className="bg-[#0b1020] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-indigo-400" /> Active Investigation Nodes
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                  State Machine
                </span>
              </div>

              <div className="space-y-2 text-xs font-mono">
                {[
                  { name: "Transaction Investigator", action: "Ledger Volume & Relationship", active: Boolean(caseData) },
                  { name: "Customer Risk Analyst", action: "Velocity Profiler & Sanctions", active: Boolean(caseData) },
                  { name: "Regulatory Researcher", action: "Statutory Law Retrieval", active: Boolean(caseData) },
                  { name: "Compliance Evaluator", action: "Synthesis & HITL Gate", active: Boolean(caseData) },
                ].map((node, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-[#060912] border border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${node.active ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-700'}`} />
                      <span className="text-slate-200 font-medium">{node.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">{node.action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-8 bg-[#0b1020] border border-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 pt-3 bg-[#080d18]">
              <div className="flex gap-2">
                {[
                  { id: 'findings', label: 'Agent Findings & Evidence', count: caseData?.findings?.length },
                  { id: 'citations', label: 'Statutory Citations', count: caseData?.retrieved_policies?.length },
                  { id: 'trace', label: 'State Transition Trace', count: caseData?.execution_trace?.length },
                  { id: 'audit_pack', label: 'Compliance Dossier' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
                      activeTab === tab.id ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.count !== undefined && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 font-mono text-slate-300">
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto max-h-[580px]">
              {activeTab === 'findings' && (
                <div className="space-y-3.5">
                  {caseData?.findings && caseData.findings.length > 0 ? (
                    caseData.findings.map((f, i) => (
                      <div key={i} className="bg-[#060912] border border-slate-800 rounded-xl p-4 text-xs space-y-2.5 transition hover:border-slate-700">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-indigo-400">{f.agent}</span>
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30">
                              {f.risk_level} SEVERITY
                            </span>
                          </div>
                          <span className="font-mono text-slate-300 font-bold bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px]">
                            +{f.score_delta.toFixed(2)} Risk Delta
                          </span>
                        </div>
                        <p className="text-slate-300 leading-relaxed font-sans">{f.details}</p>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center text-slate-500 text-xs italic">
                      Configure parameters above and click "Trigger Multi-Agent Audit".
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'citations' && (
                <div className="space-y-4">
                  {caseData?.retrieved_policies && caseData.retrieved_policies.length > 0 ? (
                    caseData.retrieved_policies.map((p, idx) => (
                      <div key={idx} className="bg-[#060912] border border-slate-800 rounded-xl p-4 text-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200 text-sm">{p.document_title}</span>
                          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-mono text-[10px] font-bold">
                            Relevance Score: {p.rrf_score}
                          </span>
                        </div>
                        <div className="font-mono text-cyan-400 text-xs font-semibold">
                          {p.citation} &bull; {p.section}
                        </div>
                        <p className="text-slate-400 italic bg-[#090d18] p-3.5 rounded-lg border border-slate-800/80 leading-relaxed">
                          "{p.snippet}"
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center text-slate-500 text-xs italic">
                      No statutory circulars retrieved yet.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'trace' && (
                <div className="relative border-l-2 border-slate-800 ml-3 space-y-4 my-2">
                  {caseData?.execution_trace && caseData.execution_trace.length > 0 ? (
                    caseData.execution_trace.map((trace, i) => (
                      <div key={i} className="pl-5 relative">
                        <div className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-[#0b1020]" />
                        <div className="text-xs text-slate-300 font-mono leading-relaxed bg-[#060912] p-3 rounded-xl border border-slate-800">
                          {trace}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center text-slate-500 text-xs italic">
                      No state transitions recorded.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'audit_pack' && (
                <div className="space-y-4">
                  <div className="bg-[#060912] border border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-white uppercase font-mono">Suspicious Activity Audit Dossier (FIU-IND Format)</h4>
                        <p className="text-xs text-slate-400">Generated automatically by FinSight Multi-Agent Decisioning Engine</p>
                      </div>
                      <button
                        onClick={downloadAuditReport}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3.5 py-1.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download JSON</span>
                      </button>
                    </div>

                    <pre className="bg-[#090d18] p-4 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800/80 leading-relaxed max-h-[360px]">
                      {caseData ? JSON.stringify(caseData, null, 2) : "// No investigation executed yet."}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* MAKER MODAL */}
      {makerModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#0b1020] border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Analyst Recommendation (Maker Step)</h3>
                  <p className="text-xs text-slate-400 font-mono">Case: {caseData?.case_id}</p>
                </div>
              </div>
              <button onClick={() => setMakerModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 leading-relaxed">
                As an Analyst (Maker), submit your findings and proposed course of action. This case will be transmitted to the MLRO Executive Queue for independent approval.
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Proposed Statutory Action</label>
                  <select
                    value={makerDecision}
                    onChange={(e) => setMakerDecision(e.target.value)}
                    className="w-full bg-[#060912] border border-slate-700 rounded-xl p-3 text-slate-200 font-mono focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="RECOMMEND_REJECT">RECOMMEND REJECT (Recommend Account Freeze & FIU SAR)</option>
                    <option value="RECOMMEND_ESCALATE">RECOMMEND ESCALATE (Refer to Legal / FIU Enforcement)</option>
                    <option value="RECOMMEND_APPROVE">RECOMMEND APPROVE (Recommend Clearing Transaction)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Analyst Findings & Evidence Rationale</label>
                  <textarea
                    rows={3}
                    value={makerNotes}
                    onChange={(e) => setMakerNotes(e.target.value)}
                    placeholder="e.g. Beneficiary matched offshore shell pattern; customer velocity spike is 18.8x..."
                    className="w-full bg-[#060912] border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setMakerModalOpen(false)} className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 cursor-pointer">
                  Cancel
                </button>
                <button
                  onClick={handleMakerSubmit}
                  disabled={loading}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Transmit to MLRO Checker Queue</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHECKER MODAL */}
      {checkerModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#0b1020] border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                  <Scale className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Statutory Adjudication (Checker Step)</h3>
                  <p className="text-xs text-slate-400 font-mono">Case: {activeAdjudicatingCase?.case_id || caseData?.case_id}</p>
                </div>
              </div>
              <button onClick={() => setCheckerModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-[#060912] border border-slate-800 rounded-xl text-xs space-y-1.5">
                <div className="text-slate-400 font-semibold">Maker Recommendation on File:</div>
                <div className="text-cyan-400 font-mono font-bold">
                  {activeAdjudicatingCase?.maker_status?.decision || caseData?.maker_status?.decision || "NO_PRIOR_RECOMMENDATION"}
                </div>
                <div className="text-slate-300 italic">
                  "{activeAdjudicatingCase?.maker_status?.summary || caseData?.maker_status?.summary || "Direct Case Review"}"
                </div>
                <div className="text-[10px] text-slate-500">
                  Submitted by: {activeAdjudicatingCase?.maker_status?.officer || caseData?.maker_status?.officer || "Direct"}
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Official Executive Ruling</label>
                  <select
                    value={checkerDecision}
                    onChange={(e) => setCheckerDecision(e.target.value)}
                    className="w-full bg-[#060912] border border-slate-700 rounded-xl p-3 text-slate-200 font-mono focus:outline-none focus:border-cyan-500 font-semibold"
                  >
                    <option value="CONFIRMED_REJECTED">CONFIRM REJECT (Freeze Account & Transmit SAR to FIU)</option>
                    <option value="CONFIRMED_ESCALATED">CONFIRM ESCALATE (Refer to Law Enforcement / FIU-IND)</option>
                    <option value="OVERRIDDEN_APPROVED">OVERRIDE & APPROVE (Release Transfer Funds)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">MLRO Officer Statutory Rationale</label>
                  <textarea
                    rows={3}
                    value={checkerNotes}
                    onChange={(e) => setCheckerNotes(e.target.value)}
                    placeholder="Record formal statutory justification for legal filing..."
                    className="w-full bg-[#060912] border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setCheckerModalOpen(false)} className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 cursor-pointer">
                  Cancel
                </button>
                <button
                  onClick={handleCheckerSubmit}
                  disabled={loading}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Execute Final Ruling (Checker)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GOVERNANCE MODAL */}
      {govModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#0b1020] border border-slate-800 rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Personnel Directory & Security Audit Logs</h3>
                  <p className="text-xs text-slate-400 font-mono">Pre-Provisioned Officers & Immutable System Events</p>
                </div>
              </div>
              <button onClick={() => setGovModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 p-1 bg-[#060912] rounded-xl border border-slate-800 text-xs font-semibold w-fit">
              <button
                onClick={() => setGovTab('directory')}
                className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                  govTab === 'directory' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Personnel Roster ({officerList.length})</span>
              </button>
              <button
                onClick={() => setGovTab('logs')}
                className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                  govTab === 'logs' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Security Audit Log ({auditLogs.length})</span>
              </button>
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1">
              {govTab === 'directory' ? (
                officerList.map((off, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-[#060912] border border-slate-800/80 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-slate-300 font-mono">
                        {off.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>{off.full_name}</span>
                          {off.username === currentUser.username && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">ACTIVE</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Handle: {off.username} &bull; Badge: {off.badge_id}
                        </div>
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${
                        off.role === 'MLRO_OFFICER' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                      }`}>
                        {off.role === 'MLRO_OFFICER' ? "CHECKER" : "MAKER"}
                      </span>
                      <div className="text-[10px] text-slate-500">{off.department}</div>
                    </div>
                  </div>
                ))
              ) : (
                auditLogs.map((log, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-[#060912] border border-slate-800/80 text-xs space-y-1 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-cyan-400 font-bold">{log.event_type}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-slate-300 text-[11px]">
                      Officer: {log.username || 'System'} {log.badge_id ? `(${log.badge_id})` : ''} &bull; {log.details}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800/80">
              <button onClick={() => setGovModalOpen(false)} className="px-5 py-2 rounded-xl text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer">
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
