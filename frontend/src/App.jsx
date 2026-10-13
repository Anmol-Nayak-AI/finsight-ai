import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  UserCheck, 
  RefreshCw, 
  TrendingUp, 
  Sliders, 
  Send, 
  Building2, 
  CreditCard, 
  User, 
  Download, 
  Scale, 
  Lock, 
  LogOut, 
  BadgeCheck, 
  Users, 
  ShieldCheck, 
  X, 
  History, 
  ArrowRight, 
  Inbox, 
  Eye, 
  EyeOff, 
  Smartphone, 
  Check, 
  Archive, 
  Clock, 
  Radio,
  Activity,
  Layers,
  ChevronRight,
  Database,
  Cpu,
  KeyRound,
  FileCheck2,
  Terminal,
  ExternalLink
} from 'lucide-react';

export default function App() {
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

  const [sessionToken, setSessionToken] = useState(() => localStorage.getItem('finsight_token') || '');

  // Auth States
  const [loginStep, setLoginStep] = useState(1);
  const [username, setUsername] = useState('officer.sharma');
  const [password, setPassword] = useState('Compliance@2026');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingOfficerInfo, setPendingOfficerInfo] = useState(null);
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Checker Inbox & Queue States
  const [inboxTab, setInboxTab] = useState('pending');
  const [casesList, setCasesList] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [refreshNotification, setRefreshNotification] = useState('');
  const [executionSuccessNotice, setExecutionSuccessNotice] = useState('');
  const [ingestingStream, setIngestingStream] = useState(false);
  const [executingRuling, setExecutingRuling] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Governance Modal
  const [govModalOpen, setGovModalOpen] = useState(false);
  const [govTab, setGovTab] = useState('directory');
  const [officerList, setOfficerList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Maker Investigation Workspace
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

  // Adjudication Dialogs
  const [makerModalOpen, setMakerModalOpen] = useState(false);
  const [makerDecision, setMakerDecision] = useState('RECOMMEND_REJECT');
  const [makerNotes, setMakerNotes] = useState('');

  const [checkerDecision, setCheckerDecision] = useState('CONFIRMED_REJECTED');
  const [checkerNotes, setCheckerNotes] = useState('');

  // Centralized Authenticated Fetch Interceptor
  const apiFetch = async (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
    };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    const res = await fetch(url, { ...options, headers, credentials: 'include' });
    if (res.status === 401) {
      localStorage.removeItem('finsight_user');
      localStorage.removeItem('finsight_token');
      setCurrentUser(null);
      setSessionToken('');
      setAuthError('Compliance shift session expired. Please re-authenticate.');
      throw new Error('Session expired');
    }
    return res;
  };

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
      setSessionToken(data.access_token || '');
      localStorage.setItem('finsight_user', JSON.stringify(data.user));
      if (data.access_token) {
        localStorage.setItem('finsight_token', data.access_token);
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { 
        method: 'POST', 
        headers: sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {},
        credentials: 'include' 
      });
    } catch (_) {}
    setCurrentUser(null);
    setSessionToken('');
    localStorage.removeItem('finsight_user');
    localStorage.removeItem('finsight_token');
    setCaseData(null);
    setSelectedCase(null);
    setLoginStep(1);
    setTotpCode('');
  };

  // Fetch MLRO Queue
  const fetchExecutiveQueue = async (preserveCaseId = null) => {
    setLoadingQueue(true);
    setErrorMessage('');
    try {
      const res = await apiFetch('/api/v1/investigations/queue');
      if (res.ok) {
        const data = await res.json();
        setCasesList(data);
        
        if (preserveCaseId) {
          const match = data.find(c => c.case_id === preserveCaseId);
          if (match) setSelectedCase(match);
        } else if (data.length > 0 && !selectedCase) {
          const pendingMatch = data.find(c => c.status !== 'FINALIZED');
          setSelectedCase(pendingMatch || data[0]);
        }

        const pendingCount = data.filter(c => c.status !== 'FINALIZED').length;
        const now = new Date().toLocaleTimeString();
        setRefreshNotification(`Synced at ${now} (${pendingCount} pending)`);
        setTimeout(() => setRefreshNotification(''), 4000);
      }
    } catch (err) {
      if (err.message !== 'Session expired') {
        setErrorMessage("Failed to load queue. Please verify database connection.");
      }
    } finally {
      setLoadingQueue(false);
    }
  };

  // Ingest Live Stream Anomaly
  const handleIngestStream = async () => {
    setIngestingStream(true);
    setErrorMessage('');
    try {
      const res = await apiFetch('/api/v1/investigations/queue/ingest-stream', {
        method: 'POST'
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Stream ingestion failed.");
      }
      const respData = await res.json();
      await fetchExecutiveQueue(respData.case_id);
      setRefreshNotification(`Stream record ingested (${respData.case_id})`);
      setTimeout(() => setRefreshNotification(''), 5000);
    } catch (err) {
      if (err.message !== 'Session expired') {
        setErrorMessage(err.message || "Failed to ingest stream record.");
      }
    } finally {
      setIngestingStream(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === 'MLRO_OFFICER') {
      fetchExecutiveQueue();
    }
  }, [currentUser]);

  const loadGovernanceData = async () => {
    try {
      const [uRes, aRes] = await Promise.all([
        apiFetch('/api/v1/auth/users'),
        apiFetch('/api/v1/auth/audit-logs')
      ]);
      if (uRes.ok) setOfficerList(await uRes.json());
      if (aRes.ok) setAuditLogs(await aRes.json());
    } catch (_) {}
  };

  useEffect(() => {
    if (govModalOpen && currentUser) loadGovernanceData();
  }, [govModalOpen]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  // Maker: Trigger Audit
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
      const res = await apiFetch('/api/v1/investigations/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setCaseData(data);
    } catch (err) {
      if (err.message !== 'Session expired') setErrorMessage(err.message || 'Audit failed');
    } finally {
      setLoading(false);
    }
  };

  // Maker: Transmit Recommendation
  const handleMakerSubmit = async () => {
    if (!caseData?.case_id) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/investigations/${caseData.case_id}/maker-recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation: makerDecision, findings_summary: makerNotes }),
      });
      if (!res.ok) throw new Error("Maker submission rejected.");
      const updated = await res.json();
      setCaseData(updated.case);
      setMakerModalOpen(false);
    } catch (err) {
      if (err.message !== 'Session expired') setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Checker: Execute Statutory Ruling
  const handleCheckerExecute = async () => {
    if (!selectedCase?.case_id) return;
    setExecutingRuling(true);
    setErrorMessage('');
    setExecutionSuccessNotice('');

    try {
      const res = await apiFetch(`/api/v1/investigations/${selectedCase.case_id}/checker-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_decision: checkerDecision, statutory_memo: checkerNotes }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Checker authorization failed.");
      }

      const data = await res.json();
      const finalized = data.case;

      setSelectedCase(finalized);
      setCasesList(prev => prev.map(c => c.case_id === finalized.case_id ? finalized : c));
      setExecutionSuccessNotice(`Statutory ruling [${finalized.final_verdict}] sealed & written to core ledger.`);
      setCheckerNotes('');
      setTimeout(() => setExecutionSuccessNotice(''), 6000);
    } catch (err) {
      if (err.message !== 'Session expired') setErrorMessage(err.message);
    } finally {
      setExecutingRuling(false);
    }
  };

  const downloadAuditReport = () => {
    const target = selectedCase || caseData;
    if (!target) return;
    const blob = new Blob([JSON.stringify(target, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FINSIGHT_SAR_${target.case_id || 'REPORT'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isChecker = currentUser?.role === 'MLRO_OFFICER';
  const velocityRatio = (parseFloat(formData.amount || 0) / (parseFloat(formData.historical_avg || 1) || 1)).toFixed(1);
  const riskPercent = caseData ? Math.round((caseData.risk_score || 0) * 100) : null;

  const pendingCases = casesList.filter(c => c.status !== 'FINALIZED');
  const finalizedCases = casesList.filter(c => c.status === 'FINALIZED');
  const displayedCases = inboxTab === 'pending' ? pendingCases : finalizedCases;

  // ==========================================
  // AUTHENTICATION: INSTITUTIONAL WORKSTATION
  // ==========================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans antialiased selection:bg-cyan-500/30">
        
        {/* Top Institutional App Bar */}
        <div className="h-14 border-b border-slate-800 bg-[#090f1d]/90 backdrop-blur-md px-6 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Shield className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xs tracking-wider text-white">FINSIGHT INTELLIGENCE</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                GATEWAY v4.2
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>CORE LEDGER: 1M PARTITIONED</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="hidden sm:flex items-center gap-1.5 text-slate-400">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>LATENCY: 14ms</span>
            </div>
          </div>
        </div>

        {/* Full-Bleed Split Canvas */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* Left Hero Command Console (5 Cols) */}
          <div className="lg:col-span-5 bg-gradient-to-br from-[#0c1427] via-[#091020] to-[#070c18] border-b lg:border-b-0 lg:border-r border-slate-800 p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
            <div className="space-y-8 relative z-10">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-[11px]">
                  <Activity className="w-3 h-3" />
                  <span>AUTONOMOUS SURVEILLANCE RUNNING</span>
                </div>
                <h2 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight">
                  Financial Crime Compliance & Regulatory Decisioning
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                  Stateful multi-agent compliance pipeline backed by PostgreSQL range partitioning, pgvector Reciprocal Rank Fusion, and strict Four-Eyes governance.
                </p>
              </div>

              {/* Live Surveillance Metrics Matrix */}
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3.5 rounded-xl bg-[#0e172c] border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1.5">
                    <Database className="w-3 h-3 text-cyan-400" /> Sharded Ledger
                  </div>
                  <div className="text-sm font-bold text-white">1,000,000 Txns</div>
                  <div className="text-[10px] text-emerald-400">&lt;1.5ms Lookup</div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0e172c] border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1.5">
                    <Scale className="w-3 h-3 text-amber-400" /> Statutory Guard
                  </div>
                  <div className="text-sm font-bold text-white">RBI Sec 41 / PMLA</div>
                  <div className="text-[10px] text-cyan-400">RRF Hybrid 100%</div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0e172c] border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1.5">
                    <UserCheck className="w-3 h-3 text-indigo-400" /> Segregation
                  </div>
                  <div className="text-sm font-bold text-white">Maker & Checker</div>
                  <div className="text-[10px] text-indigo-400">Enforced SoD</div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0e172c] border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1.5">
                    <KeyRound className="w-3 h-3 text-emerald-400" /> Cryptography
                  </div>
                  <div className="text-sm font-bold text-white">RFC 6238 TOTP</div>
                  <div className="text-[10px] text-emerald-400">HttpOnly Binding</div>
                </div>
              </div>

              {/* Streaming Alert Feed Simulator */}
              <div className="p-4 rounded-xl bg-[#070e1c] border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase">
                  <span>Inbound Surveillance Ticker</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="text-slate-300 truncate">
                    &bull; <span className="text-cyan-400">TXN-1049281</span>: ₹14.5L &rarr; Panama Horizon (P1 CRITICAL)
                  </div>
                  <div className="text-slate-400 truncate">
                    &bull; <span className="text-indigo-400">TXN-1082914</span>: ₹18.5L &rarr; KoinX BVI (P1 CRITICAL)
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-800/80 text-[11px] text-slate-500 font-mono flex items-center justify-between">
              <span>ISO 27001 / SOC-2 Type II Certified</span>
              <span>Central Bank KYC Master Directive</span>
            </div>
          </div>

          {/* Right Terminal Console (7 Cols) */}
          <div className="lg:col-span-7 bg-[#070b14] p-8 lg:p-14 flex items-center justify-center">
            <div className="max-w-md w-full space-y-6">
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {loginStep === 1 ? "Officer Session Authentication" : "Two-Factor Verification"}
                  </h3>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                    STEP {loginStep} / 2
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {loginStep === 1 
                    ? "Enter institutional clearance credentials or select a test persona below." 
                    : "Enter the rolling 6-digit code from Google or Microsoft Authenticator."}
                </p>
              </div>

              {loginStep === 1 ? (
                <form onSubmit={handleStep1Submit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium">Compliance Officer Handle</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. officer.sharma"
                      className="w-full bg-[#0d1424] border border-slate-700 hover:border-slate-600 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 transition font-mono"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium">Security Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full bg-[#0d1424] border border-slate-700 hover:border-slate-600 rounded-xl px-4 py-2.5 pr-10 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 transition font-mono"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer text-xs"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {authError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{authError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/20"
                  >
                    {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    <span>Verify Credentials & Proceed to 2FA</span>
                  </button>

                  {/* Cryptographic Smart-Badges for Quick Testing */}
                  <div className="pt-5 border-t border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>Evaluator Persona Shortcuts:</span>
                      <span className="text-cyan-400">Select to Populate</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div
                        onClick={() => { setUsername('officer.sharma'); setPassword('Compliance@2026'); }}
                        className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                          username === 'officer.sharma' 
                            ? 'bg-cyan-950/40 border-cyan-500 ring-1 ring-cyan-500/30' 
                            : 'bg-[#0d1424] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Priya Sharma</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">CHECKER</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">MLRO &bull; Queue Adjudication</div>
                      </div>

                      <div
                        onClick={() => { setUsername('analyst.verma'); setPassword('Analyst@2026'); }}
                        className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                          username === 'analyst.verma' 
                            ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/30' 
                            : 'bg-[#0d1424] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Rohan Verma</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">MAKER</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">Analyst &bull; Simulation Desk</div>
                      </div>
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleStep2Submit} className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-[#0d1424] border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-500 font-mono uppercase">Target Identity</div>
                      <div className="text-xs font-bold text-white mt-0.5">{pendingOfficerInfo?.officer_name}</div>
                    </div>
                    <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950 border border-cyan-800 px-2.5 py-1 rounded">
                      {pendingOfficerInfo?.badge_id}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label className="text-slate-300 font-medium">6-Digit Authenticator Code (TOTP)</label>
                      <button
                        type="button"
                        onClick={() => setShowPairingModal(true)}
                        className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
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
                      className="w-full bg-[#0d1424] border border-slate-700 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] text-white focus:outline-none focus:border-cyan-500 transition font-mono font-bold"
                      required
                    />
                    <p className="text-[11px] text-slate-400 text-center font-mono">
                      Rolling 30s code from Google/Microsoft Authenticator.
                    </p>
                  </div>

                  {authError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
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
                      className="w-2/3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                    >
                      {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      <span>Establish Session</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Pairing Modal */}
        {showPairingModal && pendingOfficerInfo && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-[#0c1427] border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="text-white font-mono font-bold text-xs uppercase tracking-wider">
                  Pair Corporate Authenticator
                </div>
                <button onClick={() => setShowPairingModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed space-y-3">
                <p className="text-slate-400">
                  Scan this QR code with Google Authenticator or Microsoft Authenticator:
                </p>

                <div className="flex justify-center p-3 bg-white rounded-xl w-fit mx-auto">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pendingOfficerInfo.otpauth_uri)}`} 
                    alt="Authenticator QR Code" 
                    className="w-40 h-40 rounded"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] text-slate-400 font-mono">Manual Base32 Secret:</span>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#070b14] border border-slate-800 font-mono text-cyan-400 text-xs">
                    <span>{pendingOfficerInfo.totp_seed}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(pendingOfficerInfo.totp_seed)}
                      className="px-2 py-1 text-slate-400 hover:text-white cursor-pointer text-xs"
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
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs cursor-pointer"
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
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans antialiased selection:bg-cyan-500/30">
      
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-[#090f1d]/90 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-bold tracking-wider text-white uppercase font-mono">FINSIGHT AI</h1>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${
                isChecker ? 'bg-cyan-950 text-cyan-400 border-cyan-800' : 'bg-indigo-950 text-indigo-400 border-indigo-800'
              }`}>
                {isChecker ? "DESK: MLRO EXECUTIVE ADJUDICATION" : "DESK: ANALYST INVESTIGATION & TRIAGE"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isChecker ? "Statutory Account Freeze & Regulatory Reporting Authority" : "Transaction Monitoring & Anomaly Evidence Profiler"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => setGovModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer font-sans text-xs font-medium"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span>Audit Logs</span>
          </button>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
            isChecker ? 'bg-cyan-950/40 border-cyan-800 text-cyan-300' : 'bg-indigo-950/40 border-indigo-800 text-indigo-300'
          }`}>
            <BadgeCheck className="w-3.5 h-3.5" />
            <span className="font-sans font-medium text-xs">{currentUser.full_name}</span>
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

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* =========================================================================
            CHECKER VIEW: MLRO EXECUTIVE ADJUDICATION DESK
           ========================================================================= */}
        {isChecker ? (
          <div className="space-y-6">
            
            {/* Header Banner */}
            <div className="bg-[#0c1427] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl">
                  <Inbox className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                    Executive Adjudication Queue & Four-Eyes Clearance
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Review triaged anomalies submitted by AML Analysts. Under Segregation of Duties (SoD), input sliders are disabled on this terminal.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleIngestStream}
                  disabled={ingestingStream}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 rounded-xl text-xs font-mono transition cursor-pointer shadow-sm disabled:opacity-50"
                  title="Pull fresh high-risk transfers from the 1M database table"
                >
                  <Radio className={`w-3.5 h-3.5 ${ingestingStream ? 'animate-spin text-cyan-400' : 'text-indigo-400'}`} />
                  <span>{ingestingStream ? "Ingesting..." : "Ingest Inbound Stream"}</span>
                </button>

                <button
                  onClick={() => fetchExecutiveQueue()}
                  disabled={loadingQueue}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-xs font-mono text-cyan-400 border border-slate-800 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingQueue ? 'animate-spin' : ''}`} />
                  <span>Refresh Queue</span>
                </button>
              </div>
            </div>

            {/* Notifications */}
            {refreshNotification && (
              <div className="p-3 bg-cyan-950/40 border border-cyan-800 rounded-xl text-xs text-cyan-300 font-mono flex items-center justify-between">
                <span>{refreshNotification}</span>
                <span className="text-[10px] text-slate-400 font-mono">1M Ledger Synced</span>
              </div>
            )}

            {executionSuccessNotice && (
              <div className="p-3.5 bg-emerald-950/40 border border-emerald-800 rounded-xl text-xs text-emerald-300 font-mono flex items-center gap-2 shadow-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{executionSuccessNotice}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3.5 bg-rose-950/40 border border-rose-800 rounded-xl text-xs text-rose-300 font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Executive Queue Grid */}
            <div className="grid grid-cols-12 gap-6">
              
              {/* Left Column: Case Inbox Tabs */}
              <div className="col-span-12 lg:col-span-4 space-y-3">
                <div className="grid grid-cols-2 p-1 bg-[#090f1d] rounded-xl border border-slate-800 text-xs font-medium">
                  <button
                    onClick={() => setInboxTab('pending')}
                    className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      inboxTab === 'pending' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pending ({pendingCases.length})</span>
                  </button>
                  <button
                    onClick={() => setInboxTab('finalized')}
                    className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      inboxTab === 'finalized' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Resolved ({finalizedCases.length})</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                  {displayedCases.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-500 bg-[#0c1427] border border-slate-800 rounded-2xl italic space-y-2">
                      <Inbox className="w-6 h-6 mx-auto text-slate-600" />
                      <div>No {inboxTab} cases in registry.</div>
                      {inboxTab === 'pending' && (
                        <button
                          onClick={handleIngestStream}
                          className="mt-2 text-[11px] text-cyan-400 hover:underline cursor-pointer"
                        >
                          + Ingest sample transaction stream
                        </button>
                      )}
                    </div>
                  ) : (
                    displayedCases.map((item) => (
                      <div
                        key={item.case_id}
                        onClick={() => setSelectedCase(item)}
                        className={`p-4 rounded-xl border text-xs cursor-pointer transition space-y-2 ${
                          selectedCase?.case_id === item.case_id
                            ? 'bg-[#121e3a] border-cyan-500/80 shadow-md'
                            : 'bg-[#0c1427] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-white">{item.case_id}</span>
                          <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                            item.status === 'FINALIZED'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {item.status === 'FINALIZED' ? item.final_verdict : (item.priority || "P1 CRITICAL")}
                          </span>
                        </div>

                        <div className="text-slate-300 text-xs">
                          Amount: <strong className="text-cyan-400 font-mono">₹{Number(item.amount).toLocaleString('en-IN')}</strong> &bull; {item.channel}
                        </div>

                        <div className="text-[11px] text-slate-400 truncate">
                          {item.customer_name} &rarr; {item.beneficiary_name}
                        </div>

                        {item.maker_status && (
                          <div className="text-[10px] text-amber-300 pt-1 border-t border-slate-800 flex items-center justify-between">
                            <span>Maker: {item.maker_status.decision}</span>
                            <span className="text-slate-500 font-mono">{item.maker_status.officer?.split(' ')[0] || 'Analyst'}</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Case Dossier & Adjudication Controls */}
              <div className="col-span-12 lg:col-span-8 space-y-6">
                {selectedCase ? (
                  <div className="bg-[#0c1427] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                    
                    <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white font-mono">{selectedCase.case_id}</h3>
                          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                            Txn: {selectedCase.transaction_id}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Audit Dossier compiled via LangGraph Cyclic Engine &bull; pgvector RRF
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-2xl font-mono font-bold text-rose-400">
                          {Math.round((selectedCase.risk_score || 0) * 100)}%
                        </span>
                        <div className="text-[10px] font-mono text-slate-500 uppercase">Cumulative Risk Score</div>
                      </div>
                    </div>

                    {/* Maker Recommendation Banner */}
                    <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-amber-300 font-medium">
                        <span className="flex items-center gap-1.5 font-mono uppercase text-[11px]">
                          <UserCheck className="w-3.5 h-3.5" /> Analyst Recommendation (Maker Step)
                        </span>
                        <span className="font-mono text-[10px] bg-amber-900/60 px-2 py-0.5 rounded border border-amber-700 font-bold">
                          {selectedCase.maker_status?.decision || "RECOMMEND_REJECT"}
                        </span>
                      </div>
                      <p className="text-slate-300 italic font-sans leading-relaxed text-xs">
                        "{selectedCase.maker_status?.summary || "Automated anomaly flagged by multi-agent engine. Review required."}"
                      </p>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Investigated by: {selectedCase.maker_status?.officer || "Rohan Verma (AML-33012)"}
                      </div>
                    </div>

                    {/* Metrics Breakdown */}
                    <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                      <div className="p-3 bg-[#080f1d] rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase">Transaction Value</div>
                        <div className="text-sm font-bold text-cyan-400 mt-0.5">
                          ₹{Number(selectedCase.amount).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="p-3 bg-[#080f1d] rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase">30-Day Historical Baseline</div>
                        <div className="text-sm font-bold text-slate-300 mt-0.5">
                          ₹{Number(selectedCase.historical_avg).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="p-3 bg-[#080f1d] rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase">Settlement Channel</div>
                        <div className="text-sm font-bold text-slate-300 mt-0.5">
                          {selectedCase.channel}
                        </div>
                      </div>
                    </div>

                    {/* Agent Findings */}
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Multi-Agent Evidence & Risk Deltas ({selectedCase.findings?.length || 0})
                      </h4>
                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                        {selectedCase.findings?.map((f, i) => (
                          <div key={i} className="p-3 rounded-xl bg-[#080f1d] border border-slate-800 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-indigo-400">{f.agent}</span>
                              <span className="font-mono text-cyan-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-[10px]">
                                +{f.score_delta.toFixed(2)} Delta
                              </span>
                            </div>
                            <p className="text-slate-300 text-[11px] leading-relaxed">{f.details}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Statutory Policies */}
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Retrieved Statutory Mandates (pgvector RRF)
                      </h4>
                      <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                        {selectedCase.retrieved_policies?.map((p, idx) => (
                          <div key={idx} className="p-2.5 rounded-xl bg-[#080f1d] border border-slate-800 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-200 text-xs">{p.document_title}</span>
                              <span className="text-[10px] font-mono text-cyan-400">{p.citation}</span>
                            </div>
                            <p className="text-slate-400 text-[11px] italic">"{p.snippet}"</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Statutory Adjudication Controls */}
                    {selectedCase.status === 'FINALIZED' ? (
                      <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
                        <div className="space-y-1">
                          <div className="font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Ruling Sealed & Recorded in Ledger
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            Verdict: <strong className="text-white">{selectedCase.final_verdict}</strong> by {selectedCase.checker_status?.officer || "MLRO"}
                          </div>
                        </div>

                        <button
                          onClick={downloadAuditReport}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-sans font-medium flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-indigo-600/20"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export SAR Dossier</span>
                        </button>
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-slate-800 space-y-3">
                        <h4 className="text-xs font-mono font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Scale className="w-4 h-4 text-cyan-400" /> Execute Official MLRO Statutory Ruling
                        </h4>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="text-slate-400 block mb-1 font-medium">Binding Statutory Decision</label>
                            <select
                              value={checkerDecision}
                              onChange={(e) => setCheckerDecision(e.target.value)}
                              className="w-full bg-[#080f1d] border border-slate-700 rounded-xl p-2.5 text-slate-200 font-mono focus:outline-none focus:border-cyan-500 text-xs"
                            >
                              <option value="CONFIRMED_REJECTED">CONFIRM REJECT (Freeze Account & File SAR with FIU-IND)</option>
                              <option value="CONFIRMED_ESCALATED">CONFIRM ESCALATE (Refer to Law Enforcement / Special SIU)</option>
                              <option value="OVERRIDDEN_APPROVED">OVERRIDE & APPROVE (Release Transaction Funds)</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-slate-400 block mb-1 font-medium">Officer Legal Justification / Memo</label>
                            <input
                              type="text"
                              value={checkerNotes}
                              onChange={(e) => setCheckerNotes(e.target.value)}
                              placeholder="Record formal statutory memo for regulatory logs..."
                              className="w-full bg-[#080f1d] border border-slate-700 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            onClick={handleCheckerExecute}
                            disabled={executingRuling}
                            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                          >
                            {executingRuling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                            <span>{executingRuling ? "Recording on Core Ledger..." : "Execute Binding Ruling (Checker)"}</span>
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="p-16 text-center text-xs text-slate-500 bg-[#0c1427] border border-slate-800 rounded-2xl italic">
                    Select a case from the inbox on the left to inspect its full evidence dossier.
                  </div>
                )}
              </div>

            </div>

          </div>
        ) : (
          /* =========================================================================
              MAKER VIEW: ANALYST INVESTIGATION & TRIAGE DESK
             ========================================================================= */
          <div className="space-y-6">
            
            <section className="bg-[#0c1427] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <span>Analyst Investigation & Anomaly Profiling Desk</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Input transaction parameters and trigger multi-agent investigation.
                  </p>
                </div>
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
                    className="w-full bg-[#080f1d] border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
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
                    className="w-full bg-[#080f1d] border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
                  />
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-slate-400 font-medium flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-indigo-400" /> Payment Channel
                  </label>
                  <select
                    value={formData.channel}
                    onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                    className="w-full bg-[#080f1d] border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 font-mono focus:outline-none focus:border-indigo-500 transition font-medium"
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
                      formData.beneficiary_is_new ? 'bg-amber-950/40 border-amber-800 text-amber-300' : 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
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

                <div className="md:col-span-6 bg-[#080f1d] p-4 rounded-xl border border-slate-800 space-y-2.5">
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

                <div className="md:col-span-6 bg-[#080f1d] p-4 rounded-xl border border-slate-800 space-y-2.5">
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
                    className="w-full bg-[#080f1d] border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
                  />
                </div>

                <div className="md:col-span-3 flex items-end">
                  <button
                    onClick={handleSimulate}
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Trigger Multi-Agent Audit</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Maker Banner */}
            {caseData && (
              <div>
                {caseData.status === 'PENDING_MAKER' ? (
                  <div className="p-4 rounded-2xl border bg-amber-950/30 border-amber-800 text-amber-200 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                        <UserCheck className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold tracking-wide text-amber-300">
                          STAGE 1: AWAITING ANALYST RECOMMENDATION (MAKER STEP)
                        </h4>
                        <p className="text-xs text-amber-200/80 font-mono mt-0.5">
                          Risk Score: <span className="font-bold">{riskPercent}%</span> &bull; Exceeded 70% threshold. Record findings and transmit to MLRO.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setMakerModalOpen(true)}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-lg flex items-center gap-2"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Submit Recommendation to MLRO</span>
                    </button>
                  </div>
                ) : caseData.status === 'PENDING_CHECKER' ? (
                  <div className="p-4 rounded-2xl border bg-cyan-950/30 border-cyan-800 text-cyan-200 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold tracking-wide text-cyan-300">
                          STAGE 2: CASE TRANSMITTED TO MLRO CHECKER INBOX
                        </h4>
                        <p className="text-xs text-cyan-200/80 font-mono mt-0.5">
                          Recommendation submitted: <strong>{caseData.maker_status?.decision}</strong>. Awaiting MLRO executive ruling.
                        </p>
                      </div>
                    </div>

                    <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400">
                      Transmitted &bull; In MLRO Queue
                    </span>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border bg-emerald-950/30 border-emerald-800 text-emerald-200 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold tracking-wide text-emerald-300">
                          TRANSACTION CLEARED BY AUTONOMOUS POLICY ENGINE
                        </h4>
                        <p className="text-xs opacity-80 font-mono mt-0.5">
                          Risk Score: {riskPercent}% &bull; Below 70% threshold &bull; Cleared
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono px-3 py-1.5 rounded-xl font-bold border border-emerald-800">
                      AUTO_APPROVED
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Evidence & Telemetry */}
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-4 bg-[#0c1427] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <TrendingUp className="w-4 h-4 text-indigo-400" /> Risk Index
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-amber-400 font-bold border border-slate-800">
                    Gate: 70%
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-4xl font-mono font-extrabold text-white">
                    {riskPercent !== null ? `${riskPercent}%` : '--'}
                  </span>
                  <span className="text-xs font-mono font-semibold uppercase">
                    {riskPercent >= 70 ? 'Critical Anomaly' : (riskPercent >= 35 ? 'Moderate' : 'Low')}
                  </span>
                </div>

                <div className="w-full bg-[#080f1d] h-2.5 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className={`h-full rounded-full ${riskPercent >= 70 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${riskPercent || 0}%` }}
                  />
                </div>
              </div>

              <div className="col-span-12 lg:col-span-8 bg-[#0c1427] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
                <h4 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                  Investigative Evidence & Findings ({caseData?.findings?.length || 0})
                </h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {caseData?.findings?.length > 0 ? (
                    caseData.findings.map((f, i) => (
                      <div key={i} className="p-3 rounded-xl bg-[#080f1d] border border-slate-800 text-xs space-y-1">
                        <div className="flex items-center justify-between font-mono">
                          <span className="text-indigo-400 font-bold">{f.agent}</span>
                          <span className="text-cyan-400 font-bold">+{f.score_delta.toFixed(2)} Delta</span>
                        </div>
                        <p className="text-slate-300 text-[11px]">{f.details}</p>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-slate-500 text-xs italic">
                      Configure parameters and click "Trigger Multi-Agent Audit".
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Maker Modal */}
      {makerModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#0c1427] border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider">Analyst Recommendation (Maker Step)</h3>
                  <p className="text-xs text-slate-400 font-mono">Case: {caseData?.case_id}</p>
                </div>
              </div>
              <button onClick={() => setMakerModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-amber-950/30 border border-amber-800 rounded-xl text-xs text-amber-300 leading-relaxed">
                As an Analyst (Maker), submit your findings and proposed course of action. This case will be transmitted to the MLRO Executive Queue for independent approval.
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Proposed Statutory Action</label>
                  <select
                    value={makerDecision}
                    onChange={(e) => setMakerDecision(e.target.value)}
                    className="w-full bg-[#080f1d] border border-slate-700 rounded-xl p-3 text-slate-200 font-mono focus:outline-none focus:border-amber-500 font-semibold text-xs"
                  >
                    <option value="RECOMMEND_REJECT">RECOMMEND REJECT (Recommend Account Freeze & FIU SAR)</option>
                    <option value="RECOMMEND_ESCALATE">RECOMMEND ESCALATE (Refer to Legal / FIU Enforcement)</option>
                    <option value="RECOMMEND_APPROVE">RECOMMEND APPROVE (Recommend Clearing Transaction)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Analyst Findings & Evidence Rationale</label>
                  <textarea
                    rows={3}
                    value={makerNotes}
                    onChange={(e) => setMakerNotes(e.target.value)}
                    placeholder="e.g. Beneficiary matched offshore shell pattern; customer velocity spike is 18.8x..."
                    className="w-full bg-[#080f1d] border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-amber-500 text-xs"
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
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Transmit to MLRO Checker Queue</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Governance Modal */}
      {govModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#0c1427] border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider">Audit Trail & Governance Console</h3>
                  <p className="text-xs text-slate-400 font-mono">Pre-Provisioned Officers & Immutable System Events</p>
                </div>
              </div>
              <button onClick={() => setGovModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 p-1 bg-[#080f1d] rounded-xl border border-slate-800 text-xs font-medium w-fit">
              <button
                onClick={() => setGovTab('directory')}
                className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                  govTab === 'directory' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Personnel Roster ({officerList.length})</span>
              </button>
              <button
                onClick={() => setGovTab('logs')}
                className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                  govTab === 'logs' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Security Audit Log ({auditLogs.length})</span>
              </button>
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1">
              {govTab === 'directory' ? (
                officerList.map((off, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-[#080f1d] border border-slate-800 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 font-mono">
                        {off.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-white flex items-center gap-2">
                          <span>{off.full_name}</span>
                          {off.username === currentUser.username && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">ACTIVE</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Handle: {off.username} &bull; Badge: {off.badge_id}
                        </div>
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${
                        off.role === 'MLRO_OFFICER' ? 'bg-cyan-950 text-cyan-300 border-cyan-800' : 'bg-indigo-950 text-indigo-300 border-indigo-800'
                      }`}>
                        {off.role === 'MLRO_OFFICER' ? "CHECKER" : "MAKER"}
                      </span>
                      <div className="text-[10px] text-slate-500">{off.department}</div>
                    </div>
                  </div>
                ))
              ) : (
                auditLogs.map((log, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-[#080f1d] border border-slate-800 text-xs space-y-1 font-mono">
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

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button onClick={() => setGovModalOpen(false)} className="px-5 py-2 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer">
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
