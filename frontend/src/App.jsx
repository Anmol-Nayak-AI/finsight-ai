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
  LogIn, 
  Users, 
  KeyRound, 
  ShieldCheck, 
  X, 
  History,
  Eye,
  EyeOff,
  Smartphone,
  ArrowRight,
  GitMerge,
  UserCog
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('finsight_user') || 'null'));
  
  // 2-Step Login States
  const [loginStep, setLoginStep] = useState(1); // 1 = Password, 2 = 6-Digit TOTP
  const [username, setUsername] = useState('analyst.verma');
  const [password, setPassword] = useState('Analyst@2026');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingOfficerInfo, setPendingOfficerInfo] = useState(null);
  
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Governance Modal
  const [govModalOpen, setGovModalOpen] = useState(false);
  const [govTab, setGovTab] = useState('directory');
  const [officerList, setOfficerList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingGov, setLoadingGov] = useState(false);

  // Investigation Workspace State
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

  // Maker-Checker Adjudication Modal States
  const [adjudicationModalOpen, setAdjudicationModalOpen] = useState(false);
  const [makerRecDecision, setMakerRecDecision] = useState('RECOMMEND_REJECT');
  const [makerNotes, setMakerNotes] = useState('');
  const [checkerFinalDecision, setCheckerFinalDecision] = useState('CONFIRMED_REJECTED');
  const [checkerNotes, setCheckerNotes] = useState('');

  // 1. Step-1 Login: Password Verification
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
      setLoginStep(2); // Advance to 2FA TOTP code screen
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // 2. Step-2 Login: 6-Digit MFA Verification
  const handleStep2Submit = async (e) => {
    if (e) e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/v1/auth/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Stores HttpOnly session cookie
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

  const loadGovernanceData = async () => {
    setLoadingGov(true);
    try {
      const [uRes, aRes] = await Promise.all([
        fetch('/api/v1/auth/users', { credentials: 'include' }),
        fetch('/api/v1/auth/audit-logs', { credentials: 'include' })
      ]);
      if (uRes.ok) setOfficerList(await uRes.json());
      if (aRes.ok) setAuditLogs(await aRes.json());
    } catch (err) {
      console.error("Governance fetch error:", err);
    } finally {
      setLoadingGov(false);
    }
  };

  useEffect(() => {
    if (govModalOpen && currentUser) loadGovernanceData();
  }, [govModalOpen]);

  const generateRandomSimulation = () => {
    const randomTxn = `TXN-${Math.floor(1000000 + Math.random() * 900000)}`;
    const originator = ["Aarav Malhotra", "Vikram Singhania", "Nexa Cloud Tech", "TechFab Solutions"][Math.floor(Math.random() * 4)];
    const benList = [
      { name: "Panama Horizon Shell Corp", isNew: true },
      { name: "Kiran Global Hardware", isNew: false },
      { name: "KoinX BVI Crypto Exchange", isNew: true },
      { name: "Zepto Retail Store", isNew: false }
    ];
    const benObj = benList[Math.floor(Math.random() * benList.length)];
    const ch = ["IMPS", "NEFT", "RTGS", "UPI", "SWIFT"][Math.floor(Math.random() * 5)];

    const isHigh = Math.random() > 0.4;
    const amount = isHigh ? Math.floor(350000 + Math.random() * 1800000) : Math.floor(2500 + Math.random() * 35000);
    const baseline = isHigh && Math.random() > 0.5 ? Math.floor(20000 + Math.random() * 40000) : Math.floor(50000 + Math.random() * 180000);

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

      if (res.status === 401) {
        handleLogout();
        throw new Error("Session expired. Please sign in again.");
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

  // Maker: Submit Recommendation
  const handleMakerSubmit = async () => {
    if (!caseData?.case_id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/investigations/${caseData.case_id}/maker-recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recommendation: makerRecDecision, findings_summary: makerNotes }),
      });
      if (!res.ok) throw new Error("Maker recommendation submission failed.");
      const updated = await res.json();
      setCaseData(prev => ({
        ...prev,
        status: updated.status,
        requires_maker_review: false,
        requires_checker_review: true,
        maker_status: updated.maker_recommendation
      }));
      setAdjudicationModalOpen(false);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Checker: Execute Final Decision
  const handleCheckerSubmit = async () => {
    if (!caseData?.case_id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/investigations/${caseData.case_id}/checker-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ final_decision: checkerFinalDecision, statutory_memo: checkerNotes }),
      });
      if (!res.ok) throw new Error("Checker execution failed.");
      const updated = await res.json();
      setCaseData(prev => ({
        ...prev,
        status: updated.status,
        final_verdict: updated.final_verdict,
        requires_maker_review: false,
        requires_checker_review: false,
        checker_status: updated.checker_signoff
      }));
      setAdjudicationModalOpen(false);
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

  // =========================================================================
  // 1. INSTITUTIONAL LOGIN PORTAL (ZERO REGISTRATION, MFA TOTP ENFORCED)
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#05070e] text-slate-100 flex items-center justify-center p-4 md:p-8 font-sans antialiased selection:bg-indigo-500/30">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 bg-[#090d18] border border-slate-800/90 rounded-3xl shadow-2xl overflow-hidden min-h-[580px]">
          
          {/* Left Panel: Enterprise Governance & Institutional Assurance */}
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
                    Restricted Banking Terminal
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Financial Crime Compliance Network</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Dual-controlled transaction monitoring and AML decisioning platform. Public registration is prohibited by security policy.
                </p>
              </div>

              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-start gap-2.5 text-slate-300">
                  <GitMerge className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">Maker-Checker Dual Control</div>
                    <div className="text-[11px] text-slate-400">Analyst investigates and recommends; MLRO Officer verifies and executes.</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-slate-300">
                  <Smartphone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">Mandatory Two-Factor Auth (MFA)</div>
                    <div className="text-[11px] text-slate-400">Hardware token or authenticator code required on every sign-in.</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-slate-300">
                  <Lock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">Encrypted HttpOnly Sessions</div>
                    <div className="text-[11px] text-slate-400">Zero browser-readable tokens; protected against cross-site script theft.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-800/80 text-[11px] text-slate-500 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Zero-Trust Enterprise Access Control</span>
            </div>
          </div>

          {/* Right Panel: Two-Step Login */}
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
                /* STEP 1: PASSWORD FORM */
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
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                    <span>Verify Credentials & Request 2FA</span>
                  </button>

                  {/* Pre-Provisioned Enterprise Badge Directory */}
                  <div className="pt-4 mt-2 border-t border-slate-800/80 space-y-2">
                    <div className="flex justify-between items-center text-[11px] text-slate-400 font-medium">
                      <span>Enterprise Pre-Provisioned Personnel Roster:</span>
                      <span className="text-[10px] text-indigo-400">Click to Select</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => { setUsername('analyst.verma'); setPassword('Analyst@2026'); }}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                          username === 'analyst.verma' ? 'bg-indigo-500/10 border-indigo-500/60 ring-1 ring-indigo-500/30' : 'bg-[#05070e] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Rohan Verma</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">MAKER</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">Role: ANALYST &bull; Badge: AML-33012</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setUsername('officer.sharma'); setPassword('Compliance@2026'); }}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                          username === 'officer.sharma' ? 'bg-cyan-500/10 border-cyan-500/60 ring-1 ring-cyan-500/30' : 'bg-[#05070e] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Priya Sharma</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">CHECKER</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">Role: MLRO_OFFICER &bull; Badge: AML-88219</div>
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                /* STEP 2: MFA 6-DIGIT CODE FORM */
                <form onSubmit={handleStep2Submit} className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-[#05070e] border border-slate-800 space-y-1">
                    <div className="text-xs text-slate-400 font-medium">Authenticating Identity:</div>
                    <div className="text-sm font-bold text-white flex items-center justify-between">
                      <span>{pendingOfficerInfo?.officer_name}</span>
                      <span className="text-xs font-mono text-cyan-400">Badge: {pendingOfficerInfo?.badge_id}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label className="text-slate-300 font-medium flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-emerald-400" /> Enter 6-Digit Authenticator Code (TOTP)
                      </label>
                      <span className="text-[10px] font-mono text-emerald-400">
                        {pendingOfficerInfo?.role === 'MLRO_OFFICER' ? "Code: 123456" : "Code: 654321"}
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className="w-full bg-[#05070e] border border-slate-800 rounded-xl px-4 py-3 text-center text-lg tracking-[0.5em] text-white focus:outline-none focus:border-emerald-500 transition font-mono font-bold"
                      required
                    />
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
                      <span>Validate & Open Session</span>
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
      </div>
    );
  }

  // =========================================================================
  // 2. MAIN WORKBENCH (AUTHENTICATED)
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#06080f] text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500/30">
      
      {/* Header */}
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
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                DUAL-CONTROL HITL
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Autonomous AML Anomaly Detection & Maker-Checker Adjudication</p>
          </div>
        </div>

        {/* Global Officer Badge & Controls */}
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => setGovModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer font-sans text-xs font-medium"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span>Personnel & Security Logs</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
            <BadgeCheck className="w-4 h-4 text-indigo-400" />
            <span className="font-sans font-medium">{currentUser.full_name}</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
              currentUser.role === 'MLRO_OFFICER' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-indigo-600/30 text-indigo-300'
            }`}>
              {currentUser.role === 'MLRO_OFFICER' ? "CHECKER" : "MAKER"}
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

      {/* Main Deck */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* Transaction Synthesizer Deck */}
        <section className="bg-gradient-to-b from-[#0b1020] to-[#080c18] border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Transaction Injection & Counterparty Parameters</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Configure transaction attributes and trigger multi-agent investigation.</p>
            </div>

            <button
              onClick={generateRandomSimulation}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/30 transition cursor-pointer flex items-center gap-2 font-mono shadow-sm"
            >
              <Dices className="w-4 h-4 text-indigo-400" />
              <span>Synthesize Dynamic Record</span>
            </button>
          </div>

          {/* Form Fields */}
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

            {/* Sliders */}
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

        {/* Maker-Checker Workflow Banner */}
        {caseData && (
          <div>
            {caseData.requires_maker_review ? (
              /* STAGE 1: PENDING MAKER RECOMMENDATION */
              <div className="p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30 text-amber-200 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                    <UserCheck className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold tracking-wide text-amber-300">
                      STAGE 1: AWAITING ANALYST RECOMMENDATION (MAKER)
                    </h4>
                    <p className="text-xs text-amber-200/80 font-mono mt-0.5">
                      Case: <span className="font-bold">{caseData.case_id}</span> &bull; Risk: <span className="font-bold">{riskPercent}%</span> &bull; Anomaly detected. Analyst must investigate and recommend action.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setAdjudicationModalOpen(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-lg flex items-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Submit Recommendation (Maker)</span>
                </button>
              </div>
            ) : caseData.requires_checker_review ? (
              /* STAGE 2: PENDING MLRO CHECKER FINAL EXECUTION */
              <div className="p-4 rounded-2xl border bg-cyan-500/10 border-cyan-500/30 text-cyan-200 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400">
                    <GitMerge className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold tracking-wide text-cyan-300">
                        STAGE 2: AWAITING MLRO OFFICER ADJUDICATION (CHECKER)
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        MAKER: {caseData.maker_status?.decision}
                      </span>
                    </div>
                    <p className="text-xs text-cyan-200/80 font-mono mt-0.5">
                      Analyst {caseData.maker_status?.officer} recommended action: "{caseData.maker_status?.summary}". MLRO Checker approval required.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setAdjudicationModalOpen(true)}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-lg flex items-center gap-2"
                >
                  <Scale className="w-4 h-4" />
                  <span>Execute Ruling (Checker)</span>
                </button>
              </div>
            ) : caseData.final_verdict && caseData.final_verdict !== "AUTO_APPROVED" ? (
              /* FINALIZED DUAL-CONTROL ADJUDICATION */
              <div className="p-4 rounded-2xl border bg-indigo-500/10 border-indigo-500/30 text-indigo-200 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold tracking-wide text-indigo-300">
                        DUAL-CONTROL STATUTORY ADJUDICATION COMPLETED
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        {caseData.final_verdict}
                      </span>
                    </div>
                    <p className="text-xs text-indigo-200/80 font-mono mt-0.5">
                      Signed off under Four-Eyes Principle. Action executed on Core Banking Ledger.
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
              /* AUTO-CLEARED */
              <div className="p-4 rounded-2xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-200 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold tracking-wide text-emerald-300">
                      TRANSACTION CLEARED BY AUTONOMOUS POLICY ENGINE
                    </h4>
                    <p className="text-xs opacity-80 font-mono mt-0.5">
                      Risk Score: {riskPercent}% &bull; Below 70% threshold &bull; Ledger Cleared
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

        {/* Workspace Telemetry */}
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
                  { id: 'findings', label: 'Agent Findings & Evidence', icon: FileText, count: caseData?.findings?.length },
                  { id: 'citations', label: 'Statutory Citations', icon: BookOpen, count: caseData?.retrieved_policies?.length },
                  { id: 'trace', label: 'State Transition Trace', icon: Terminal, count: caseData?.execution_trace?.length },
                  { id: 'audit_pack', label: 'Compliance Dossier', icon: FileCheck },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
                        activeTab === tab.id ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
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

      {/* 3. DUAL-CONTROL ADJUDICATION MODAL (MAKER vs CHECKER) */}
      {adjudicationModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#0b1020] border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                  <GitMerge className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Dual-Control Statutory Adjudication</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Case: {caseData?.case_id} &bull; Officer: {currentUser.full_name}
                  </p>
                </div>
              </div>
              <button onClick={() => setAdjudicationModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STAGE A: MAKER RECOMMENDATION (ANALYST) */}
            {caseData?.requires_maker_review ? (
              <div className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 leading-relaxed">
                  <strong>Stage 1 (Maker Review):</strong> As an Analyst, record your investigation findings and recommend an action. The funds will remain suspended until an independent MLRO Officer reviews this.
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-300 block mb-1 font-semibold">Recommended Action</label>
                    <select
                      value={makerRecDecision}
                      onChange={(e) => setMakerRecDecision(e.target.value)}
                      className="w-full bg-[#060912] border border-slate-700 rounded-xl p-3 text-slate-200 font-mono focus:outline-none focus:border-amber-500 font-semibold"
                    >
                      <option value="RECOMMEND_REJECT">RECOMMEND REJECT (Recommend freezing transfer & filing SAR)</option>
                      <option value="RECOMMEND_ESCALATE">RECOMMEND ESCALATE (Recommend referral to Legal / FIU-IND)</option>
                      <option value="RECOMMEND_APPROVE">RECOMMEND APPROVE (Recommend clearing transaction)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-300 block mb-1 font-semibold">Investigator Findings & Justification</label>
                    <textarea
                      rows={3}
                      value={makerNotes}
                      onChange={(e) => setMakerNotes(e.target.value)}
                      placeholder="e.g. Beneficiary is an unverified shell company with 18.8x velocity spike..."
                      className="w-full bg-[#060912] border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setAdjudicationModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMakerSubmit}
                    disabled={loading}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-2"
                  >
                    {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                    <span>Submit Recommendation (Maker)</span>
                  </button>
                </div>
              </div>
            ) : caseData?.requires_checker_review ? (
              /* STAGE B: CHECKER EXECUTION (MLRO OFFICER) */
              <div className="space-y-4">
                {currentUser.role !== 'MLRO_OFFICER' ? (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-2">
                    <div className="font-bold flex items-center gap-1.5">
                      <Lock className="w-4 h-4" /> Authority Restriction (Four-Eyes Principle)
                    </div>
                    <div>
                      You are currently logged in as <strong>{currentUser.full_name} ({currentUser.role})</strong>. Under central bank regulations, the Maker cannot approve their own recommendation.
                    </div>
                    <div className="text-[11px] text-slate-400 pt-1">
                      Sign out and sign in as <strong>Officer Priya Sharma (MLRO_OFFICER)</strong> to execute the final statutory ruling.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-[#060912] border border-slate-800 rounded-xl text-xs space-y-1.5">
                      <div className="text-slate-400 font-semibold">Maker Recommendation on Record:</div>
                      <div className="text-cyan-400 font-mono font-bold">{caseData.maker_status?.decision}</div>
                      <div className="text-slate-300 italic">"{caseData.maker_status?.summary}"</div>
                      <div className="text-[10px] text-slate-500">Submitted by: {caseData.maker_status?.officer}</div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-slate-300 block mb-1 font-semibold">Final Checker Statutory Ruling</label>
                        <select
                          value={checkerFinalDecision}
                          onChange={(e) => setCheckerFinalDecision(e.target.value)}
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
                          placeholder="Record formal legal rationale for statutory audit logs..."
                          className="w-full bg-[#060912] border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        onClick={() => setAdjudicationModalOpen(false)}
                        className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
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
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 4. GOVERNANCE MODAL */}
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
              {loadingGov ? (
                <div className="py-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Loading records...</span>
                </div>
              ) : govTab === 'directory' ? (
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
              <button
                onClick={() => setGovModalOpen(false)}
                className="px-5 py-2 rounded-xl text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
