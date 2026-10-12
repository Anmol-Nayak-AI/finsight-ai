import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
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
  Shield, 
  Terminal, 
  Activity, 
  Download, 
  Database, 
  FileCheck, 
  Scale, 
  Dices,
  Lock,
  LogOut,
  BadgeCheck,
  UserPlus,
  LogIn,
  Users,
  KeyRound,
  ShieldCheck,
  Fingerprint,
  ChevronRight,
  X,
  Clock
} from 'lucide-react';

const RANDOM_ORIGINATORS = [
  "Aarav Malhotra", "Vikram Singhania", "Nexa Cloud Tech", "TechFab Solutions", 
  "Ananya Iyer", "Karan Singhal", "TCS Global Ltd", "Deepak Verma", "Siddharth Roy"
];

const RANDOM_BENEFICIARIES = [
  { name: "Panama Horizon Shell Corp", isNew: true },
  { name: "KoinX BVI Crypto Exchange", isNew: true },
  { name: "Kiran Global Hardware", isNew: false },
  { name: "Zepto Retail Store", isNew: false },
  { name: "Al-Miraj Holdings Dubai", isNew: true },
  { name: "ByteCraft Infotech LLP", isNew: true }
];

const CHANNELS = ["IMPS", "NEFT", "RTGS", "UPI", "SWIFT"];

export default function App() {
  const [authToken, setAuthToken] = useState(localStorage.getItem('finsight_token') || '');
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('finsight_user') || 'null'));
  
  // Auth Form State
  const [authMode, setAuthMode] = useState('LOGIN'); // 'LOGIN' | 'REGISTER'
  const [loginUsername, setLoginUsername] = useState('officer.sharma');
  const [loginPassword, setLoginPassword] = useState('Compliance@2026');

  // Registration Form State
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('MLRO_OFFICER'); // 'MLRO_OFFICER' | 'ANALYST'
  const [regDepartment, setRegDepartment] = useState('Special Investigations Unit (SIU)');

  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Officer Directory Modal
  const [directoryModalOpen, setDirectoryModalOpen] = useState(false);
  const [officerList, setOfficerList] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // App Workspace State
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
  const [humanModalOpen, setHumanModalOpen] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [resumeAction, setResumeAction] = useState('REJECTED');
  const [errorMessage, setErrorMessage] = useState('');

  // Handle Login
  const handleLogin = async (overrideUser, overridePass) => {
    setAuthLoading(true);
    setAuthError('');
    const u = overrideUser !== undefined ? overrideUser : loginUsername;
    const p = overridePass !== undefined ? overridePass : loginPassword;

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Authentication failed. Please verify credentials.');
      }

      const data = await res.json();
      setAuthToken(data.access_token);
      setCurrentUser(data.user);
      localStorage.setItem('finsight_token', data.access_token);
      localStorage.setItem('finsight_user', JSON.stringify(data.user));
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Registration
  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    if (!regUsername || !regPassword) {
      setAuthError('Username and password are required.');
      setAuthLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername,
          password: regPassword,
          full_name: regFullName || regUsername,
          role: regRole,
          department: regDepartment
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Officer registration failed.');
      }

      const data = await res.json();
      setAuthToken(data.access_token);
      setCurrentUser(data.user);
      localStorage.setItem('finsight_token', data.access_token);
      localStorage.setItem('finsight_user', JSON.stringify(data.user));
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthToken('');
    setCurrentUser(null);
    localStorage.removeItem('finsight_token');
    localStorage.removeItem('finsight_user');
  };

  // Fetch Officer Directory
  const loadOfficerDirectory = async () => {
    setLoadingDirectory(true);
    try {
      const res = await fetch('/api/v1/auth/users', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOfficerList(data);
      }
    } catch (err) {
      console.error("Directory fetch error:", err);
    } finally {
      setLoadingDirectory(false);
    }
  };

  useEffect(() => {
    if (directoryModalOpen && authToken) {
      loadOfficerDirectory();
    }
  }, [directoryModalOpen]);

  const generateRandomSimulation = () => {
    const randomTxn = `TXN-${Math.floor(1000000 + Math.random() * 900000)}`;
    const originator = RANDOM_ORIGINATORS[Math.floor(Math.random() * RANDOM_ORIGINATORS.length)];
    const beneficiaryObj = RANDOM_BENEFICIARIES[Math.floor(Math.random() * RANDOM_BENEFICIARIES.length)];
    const channel = CHANNELS[Math.floor(Math.random() * CHANNELS.length)];

    const isHighValue = Math.random() > 0.4;
    const amount = isHighValue 
      ? Math.floor(300000 + Math.random() * 2000000)
      : Math.floor(1500 + Math.random() * 45000);
      
    const baseline = isHighValue && Math.random() > 0.5
      ? Math.floor(15000 + Math.random() * 50000)
      : Math.floor(40000 + Math.random() * 200000);

    setFormData({
      transaction_id: randomTxn,
      customer_name: originator,
      amount: amount,
      historical_avg: baseline,
      channel: channel,
      beneficiary_name: beneficiaryObj.name,
      beneficiary_is_new: beneficiaryObj.isNew,
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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        handleLogout();
        throw new Error("Session expired. Please log in again.");
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setCaseData(data);
    } catch (err) {
      setErrorMessage(err.message || 'Audit failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResumeHITL = async () => {
    if (!caseData?.case_id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/investigations/${caseData.case_id}/resume`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ decision: resumeAction, notes: decisionNotes }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Adjudication failed: HTTP ${res.status}`);
      }

      const updated = await res.json();
      setCaseData(prev => ({
        ...prev,
        status: updated.review_status,
        final_verdict: updated.final_verdict,
        execution_trace: updated.execution_trace,
        requires_human_review: false
      }));
      setHumanModalOpen(false);
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

  const velocityRatio = (parseFloat(formData.amount || 0) / (parseFloat(formData.historical_avg || 1) || 1)).toFixed(1);
  const riskPercent = caseData ? Math.round((caseData.risk_score || 0) * 100) : null;
  const isManuallyAdjudicated = caseData?.final_verdict?.startsWith('MANUAL_');

  // =========================================================================
  // AUTH PORTAL: INSTITUTIONAL SPLIT-SCREEN CONSOLE
  // =========================================================================
  if (!authToken || !currentUser) {
    return (
      <div className="min-h-screen bg-[#05070e] text-slate-100 flex items-center justify-center p-4 md:p-8 font-sans antialiased selection:bg-indigo-500/30">
        <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 bg-[#090d18] border border-slate-800/90 rounded-3xl shadow-2xl overflow-hidden min-h-[640px]">
          
          {/* Left Column: Institutional Brand & Security Telemetry */}
          <div className="md:col-span-5 bg-gradient-to-br from-[#0c1224] via-[#090d18] to-[#060810] p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800/80 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-3xl pointer-events-none rounded-full" />
            
            <div className="space-y-6 relative z-10">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1.5px] shadow-lg shadow-indigo-500/25">
                  <div className="h-full w-full bg-[#090d18] rounded-[14px] flex items-center justify-center">
                    <Shield className="w-5 h-5 text-indigo-400" />
                  </div>
                </div>
                <div>
                  <h1 className="text-base font-extrabold tracking-wider text-white uppercase font-mono">FINSIGHT AI</h1>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-semibold tracking-wide">
                    LEVEL 4 LAWFUL AUDIT
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Statutory Regulatory & Compliance Network</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Autonomous Anti-Money Laundering decisioning engine backed by 1,000,000-row partitioned PostgreSQL ledgers and stateful LangGraph HITL checkpoints.
                </p>
              </div>

              {/* Security Telemetry Chips */}
              <div className="space-y-2.5 pt-2 font-mono text-[11px]">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-400" /> Cryptosystem
                  </span>
                  <span className="text-slate-200 font-semibold">JWT HS256 / SHA-256</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-cyan-400" /> Ledger Partitioning
                  </span>
                  <span className="text-emerald-400 font-semibold">1,000,000 Rows</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-amber-400" /> Mandate Authority
                  </span>
                  <span className="text-amber-300 font-semibold">RBI Sec 41 / PMLA R3</span>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Restricted Financial Institution Access Only</span>
            </div>
          </div>

          {/* Right Column: Clean Auth Cards & Custom Role Selectors */}
          <div className="md:col-span-7 p-8 flex flex-col justify-between bg-[#080c16]">
            <div>
              {/* Mode Switcher Tabs */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/80">
                <div className="flex gap-2 p-1 bg-[#05070e] rounded-xl border border-slate-800 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('LOGIN'); setAuthError(''); }}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
                      authMode === 'LOGIN' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Officer Sign In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthMode('REGISTER'); setAuthError(''); }}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
                      authMode === 'REGISTER' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Provision Officer</span>
                  </button>
                </div>

                <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
                  {authMode === 'LOGIN' ? "SESSION_LOGIN" : "RBAC_PROVISION"}
                </span>
              </div>

              {/* 1. SIGN IN FORM */}
              {authMode === 'LOGIN' ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Compliance Officer Handle</label>
                    <input
                      type="text"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="e.g. officer.sharma"
                      className="w-full bg-[#05070e] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Officer Security Password</label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full bg-[#05070e] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition font-mono"
                    />
                  </div>

                  {authError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{authError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleLogin()}
                    disabled={authLoading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/25 mt-2"
                  >
                    {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    <span>Authenticate Officer Session (JWT)</span>
                  </button>

                  {/* 1-Click Fast Credentials */}
                  <div className="pt-4 mt-2 border-t border-slate-800/80 space-y-2">
                    <span className="text-[11px] text-slate-400 font-mono">Pre-Configured Institution Profiles:</span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleLogin('officer.sharma', 'Compliance@2026')}
                        className="p-3 rounded-xl bg-[#05070e] border border-slate-800 hover:border-cyan-500/50 text-left transition cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white group-hover:text-cyan-400">Priya Sharma</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">MLRO</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">Special Investigations Unit &bull; Full Freeze Authority</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleLogin('analyst.verma', 'Analyst@2026')}
                        className="p-3 rounded-xl bg-[#05070e] border border-slate-800 hover:border-indigo-500/50 text-left transition cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white group-hover:text-indigo-400">Rohan Verma</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">ANALYST</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">Transaction Monitoring &bull; Investigative Scope</div>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* 2. REGISTRATION FORM WITH DARK ROLE TILES (NO OS DROPDOWN) */
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Full Legal Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Aarav Malhotra (CAMS)"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      className="w-full bg-[#05070e] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300 font-medium">Username</label>
                      <input
                        type="text"
                        placeholder="e.g. officer.aarav"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        className="w-full bg-[#05070e] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition font-mono"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300 font-medium">Security Password</label>
                      <input
                        type="password"
                        placeholder="Min 4 characters"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full bg-[#05070e] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition font-mono"
                        required
                      />
                    </div>
                  </div>

                  {/* CUSTOM ROLE SELECTION TILES (NO WHITE DROPDOWN) */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs text-slate-300 font-medium">Assigned Regulatory Role & Authority Tier</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div
                        onClick={() => setRegRole('MLRO_OFFICER')}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                          regRole === 'MLRO_OFFICER'
                            ? 'bg-cyan-500/10 border-cyan-500/60 ring-1 ring-cyan-500/30'
                            : 'bg-[#05070e] border-slate-800 hover:border-slate-700 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Scale className="w-3.5 h-3.5 text-cyan-400" /> MLRO Officer
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">FULL</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          Full Adjudication Authority &bull; Fund Freeze &bull; FIU-IND SAR Filing
                        </p>
                      </div>

                      <div
                        onClick={() => setRegRole('ANALYST')}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                          regRole === 'ANALYST'
                            ? 'bg-indigo-500/10 border-indigo-500/60 ring-1 ring-indigo-500/30'
                            : 'bg-[#05070e] border-slate-800 hover:border-slate-700 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> AML Analyst
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold">MONITOR</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          Transaction Monitoring &bull; Anomaly Simulation &bull; Evidence Compilation
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Assigned Operational Department</label>
                    <input
                      type="text"
                      value={regDepartment}
                      onChange={(e) => setRegDepartment(e.target.value)}
                      className="w-full bg-[#05070e] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  {authError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{authError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-semibold py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/25 mt-2"
                  >
                    {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    <span>Provision Officer Account & Open Terminal</span>
                  </button>
                </form>
              )}
            </div>

            <p className="text-[11px] text-slate-500 text-center mt-6">
              FinSight AI Security Architecture &bull; ISO 27001 / SOC-2 Type II Certified Pipeline
            </p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN WORKSPACE (AUTHENTICATED COMPLIANCE WORKBENCH)
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#06080f] text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500/30">
      
      {/* 1. Global Navigation Bar with Authenticated Officer Telemetry */}
      <header className="border-b border-slate-800/80 bg-[#090d18]/90 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20">
            <div className="h-full w-full bg-[#090d18] rounded-[11px] flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider text-white uppercase font-mono">FINSIGHT INTELLIGENCE</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                SCALE: 1,000,000 ROWS
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Autonomous Regulatory Compliance & Suspicious Activity Decisioning</p>
          </div>
        </div>

        {/* Global Officer Session Badge + Directory Control */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300">
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            <span>Partitioned Ledger:</span>
            <span className="text-emerald-400 font-bold">1,000,000 Records</span>
          </div>

          {/* Directory & RBAC Trigger Button */}
          <button
            onClick={() => setDirectoryModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition cursor-pointer font-sans text-xs font-medium"
            title="Inspect Bank Personnel & Roles"
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>Officer Directory</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
            <BadgeCheck className="w-4 h-4 text-indigo-400" />
            <span className="font-sans font-medium">{currentUser.full_name}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
              currentUser.role === 'MLRO_OFFICER' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-indigo-600/30 text-indigo-300'
            }`}>
              {currentUser.role}
            </span>
          </div>

          <button
            onClick={handleLogout}
            title="Sign Out Officer Session"
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main Executive Command Deck */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* Dynamic Parameter Injector Deck */}
        <section className="bg-gradient-to-b from-[#0b1020] to-[#080c18] border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Dynamic Transaction Synthesizer (Linked to 1M Ledger)</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Audit any transaction ID from the 1M partition table or inject unconstrained parameters.</p>
            </div>

            <button
              onClick={generateRandomSimulation}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/30 transition cursor-pointer flex items-center gap-2 font-mono shadow-sm"
            >
              <Dices className="w-4 h-4 text-indigo-400" />
              <span>Synthesize Dynamic Record</span>
            </button>
          </div>

          {/* Form Fields Grid */}
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
                  formData.beneficiary_is_new
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${formData.beneficiary_is_new ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  <span>{formData.beneficiary_is_new ? "First-Time Beneficiary" : "Historical Established Linkage"}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase bg-black/40">
                  {formData.beneficiary_is_new ? "EDD Trigger" : "Standard"}
                </span>
              </button>
            </div>

            {/* Sliders: Amount & Baseline */}
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

            {/* Narration Memo & Manual Trigger Button */}
            <div className="md:col-span-9 space-y-1.5">
              <label className="text-slate-400 font-medium">Transaction Narration / Purpose Memo</label>
              <input
                type="text"
                value={formData.narration}
                onChange={(e) => setFormData({ ...formData, narration: e.target.value })}
                placeholder="Type custom memo..."
                className="w-full bg-[#060912] border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
              />
            </div>

            <div className="md:col-span-3 flex items-end">
              <button
                onClick={handleSimulate}
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30 disabled:opacity-50"
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

        {/* 3. Live State Banner */}
        {caseData && (
          <div>
            {caseData.requires_human_review ? (
              <div className="p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30 text-amber-200 flex items-center justify-between shadow-lg shadow-amber-500/5">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold tracking-wide text-amber-300">
                      LANGGRAPH WORKFLOW SUSPENDED — HUMAN AUDIT MANDATORY
                    </h4>
                    <p className="text-xs text-amber-200/80 font-mono mt-0.5">
                      Case: <span className="font-bold">{caseData.case_id}</span> &bull; Risk: <span className="font-bold">{riskPercent}%</span> &bull; Checkpoint Thread: <span className="font-bold">Persisted in PostgreSQL</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setHumanModalOpen(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-lg shadow-amber-500/20 flex items-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Adjudicate Decision</span>
                </button>
              </div>
            ) : isManuallyAdjudicated ? (
              <div className="p-4 rounded-2xl border bg-indigo-500/10 border-indigo-500/30 text-indigo-200 flex items-center justify-between shadow-lg shadow-indigo-500/5">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold tracking-wide text-indigo-300">
                        OFFICIAL COMPLIANCE ADJUDICATION FILED
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        {caseData.final_verdict}
                      </span>
                    </div>
                    <p className="text-xs text-indigo-200/80 font-mono mt-0.5">
                      Case: <span className="font-bold">{caseData.case_id}</span> &bull; Status: <span className="font-bold">{caseData.status}</span> &bull; Audited by Officer: <span className="font-bold">{currentUser.badge_id}</span>
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
            ) : (
              <div className="p-4 rounded-2xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-200 flex items-center justify-between shadow-lg shadow-emerald-500/5">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold tracking-wide text-emerald-300">
                      TRANSACTION CLEARED BY AUTONOMOUS POLICY ENGINE
                    </h4>
                    <p className="text-xs opacity-80 font-mono mt-0.5">
                      Case: <span className="font-bold">{caseData.case_id}</span> &bull; Risk Score: <span className="font-bold">{riskPercent}%</span> &bull; Below 70% threshold &bull; Status: Cleared
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono px-3 py-1.5 rounded-xl font-bold border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                  AUTO_APPROVED
                </span>
              </div>
            )}
          </div>
        )}

        {/* 4. Telemetry & Evidence Workspace */}
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
                    riskPercent >= 70 
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-lg shadow-rose-500/50' 
                      : (riskPercent >= 35 ? 'bg-gradient-to-r from-cyan-500 to-amber-500' : 'bg-gradient-to-r from-cyan-500 to-emerald-500')
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
                  <Activity className="w-4 h-4 text-indigo-400" /> LangGraph Active State Nodes
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                  Cyclic StateGraph
                </span>
              </div>

              <div className="space-y-2 text-xs font-mono">
                {[
                  { name: "Transaction Investigator", action: "Ledger Volume & Relationship", active: Boolean(caseData) },
                  { name: "Customer Risk Analyst", action: "Velocity Profiler & Sanctions", active: Boolean(caseData) },
                  { name: "Regulatory Researcher", action: "Hybrid BM25 + pgvector RRF", active: Boolean(caseData) },
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
                  { id: 'findings', label: 'Agent Findings & Evidence', icon: FileText, count: caseData?.findings?.length },
                  { id: 'citations', label: 'Statutory Citations (RRF)', icon: BookOpen, count: caseData?.retrieved_policies?.length },
                  { id: 'trace', label: 'State Transition Trace', icon: Terminal, count: caseData?.execution_trace?.length },
                  { id: 'audit_pack', label: 'Compliance Dossier', icon: FileCheck },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
                        activeTab === tab.id
                          ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                      {tab.count !== undefined && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 font-mono text-slate-300">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
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
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded uppercase ${
                              f.risk_level === 'HIGH' 
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' 
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            }`}>
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
                      Configure dynamic parameters above and click "Trigger Multi-Agent Audit".
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
                          <div className="flex items-center gap-2 font-mono text-[10px]">
                            <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-bold">
                              RRF Score: {p.rrf_score}
                            </span>
                            <span className="bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800">
                              BM25 Rank: #{p.sparse_rank}
                            </span>
                            <span className="bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800">
                              HNSW Rank: #{p.dense_rank}
                            </span>
                          </div>
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

      {/* 5. Officer Directory & RBAC Governance Modal */}
      {directoryModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#0b1020] border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Compliance Personnel Directory & RBAC Governance</h3>
                  <p className="text-xs text-slate-400 font-mono">Active Institutional Officers in PostgreSQL</p>
                </div>
              </div>
              <button
                onClick={() => setDirectoryModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Officer Table */}
            <div className="max-h-[360px] overflow-y-auto space-y-2.5">
              {loadingDirectory ? (
                <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Loading directory from database...</span>
                </div>
              ) : officerList.length > 0 ? (
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
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">YOU</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {off.username} &bull; Badge: {off.badge_id}
                        </div>
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${
                        off.role === 'MLRO_OFFICER'
                          ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                          : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                      }`}>
                        {off.role}
                      </span>
                      <div className="text-[10px] text-slate-500">{off.department}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs">No officer records retrieved.</div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800/80">
              <button
                onClick={() => setDirectoryModalOpen(false)}
                className="px-5 py-2 rounded-xl text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
              >
                Close Directory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Human-In-The-Loop Adjudication Modal */}
      {humanModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#0b1020] border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Compliance Officer Adjudication Sign-Off</h3>
                <p className="text-xs text-slate-400 font-mono">Case ID: {caseData?.case_id} &bull; Officer: {currentUser.badge_id}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-[#060912] p-3.5 rounded-xl border border-slate-800 leading-relaxed">
              LangGraph suspended state via <code className="text-indigo-400 font-mono">interrupt()</code> because risk score reached <strong className="text-rose-400 font-mono">{riskPercent}%</strong>. As an authorized <strong className="text-cyan-400">{currentUser.role}</strong>, select the formal statutory ruling:
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Official Adjudication Ruling</label>
                <select
                  value={resumeAction}
                  onChange={(e) => setResumeAction(e.target.value)}
                  className="w-full bg-[#060912] border border-slate-700 rounded-xl p-3 text-slate-200 font-mono focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="REJECTED">REJECT (Block Transfer & Freeze Account Funds)</option>
                  <option value="ESCALATED">ESCALATE (Refer to Legal / FIU-IND Suspicious Activity Filing)</option>
                  <option value="APPROVED">APPROVE (Override & Release Transaction Funds)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Auditor Justification & Notes</label>
                <textarea
                  rows={3}
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="Record formal statutory justification for compliance logs..."
                  className="w-full bg-[#060912] border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setHumanModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleResumeHITL}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-2 shadow-lg shadow-indigo-600/30"
              >
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Submit Ruling & Resume Graph</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
