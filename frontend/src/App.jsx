import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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
  Database,
  FileText,
  BookOpen,
  Terminal,
  FileCheck,
  Dices,
  PlusCircle,
  FileWarning,
  ExternalLink
} from 'lucide-react';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
  || (import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE !== 'false');

const apiErrorMessage = (payload, fallback) => {
  const detail = payload?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => item?.msg || item?.message)
      .filter(Boolean);
    if (messages.length) return messages.join(' ');
  }
  return fallback;
};

const formatTraceEntry = (entry) => {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return String(entry ?? 'Unknown transition');
  const event = String(entry.event || 'STATE_TRANSITION').replaceAll('_', ' ');
  const decision = entry.decision ? ` · ${entry.decision}` : '';
  const actor = entry.actor ? ` · ${entry.actor}` : '';
  return `${event}${decision}${actor}`;
};

const checkerActionForMakerRecommendation = (recommendation) => ({
  RECOMMEND_APPROVE: 'APPROVED',
  RECOMMEND_REJECT: 'REJECTED',
  RECOMMEND_ESCALATE: 'ESCALATED',
}[recommendation] || 'REJECTED');

const canonicalizeCases = (records) => {
  if (!Array.isArray(records)) return [];
  const canonical = new Map();
  records.forEach((record) => {
    if (!record?.case_id || record.status === 'DUPLICATE_SUPERSEDED') return;
    const isPending = record.status === 'PENDING_MAKER' || record.status === 'PENDING_CHECKER';
    const accountIdentity = record.customer_id || String(record.customer_name || '').trim().toLowerCase();
    const identity = isPending ? `pending-account:${accountIdentity}` : `case:${record.case_id}`;
    const current = canonical.get(identity);
    if (!current || Number(record.decision_version || 0) > Number(current.decision_version || 0)) {
      canonical.set(identity, record);
    }
  });
  return [...canonical.values()];
};

const createTransactionId = () => {
  const randomPart = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()
    : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `TXN-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
};

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

  // Bearer tokens remain in memory only. The HttpOnly cookie restores the
  // session after reload without exposing credentials to persistent storage.
  const [sessionToken, setSessionToken] = useState('');

  useEffect(() => {
    localStorage.removeItem('finsight_token');
  }, []);

  // Auth States
  const [loginStep, setLoginStep] = useState(1);
  const [username, setUsername] = useState(DEMO_MODE ? 'officer.sharma' : '');
  const [password, setPassword] = useState(DEMO_MODE ? 'Compliance@2026' : '');
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
  const [checkerConfirmOpen, setCheckerConfirmOpen] = useState(false);
  const [regulatorConfirmOpen, setRegulatorConfirmOpen] = useState(false);
  const [formError, setFormError] = useState('');

  // React state updates are asynchronous. These refs close the few-millisecond
  // window in which a rapid double click could otherwise dispatch twice.
  const simulationLockRef = useRef(false);
  const simulationRequestRef = useRef(0);
  const makerSubmitLockRef = useRef(false);
  const checkerExecuteLockRef = useRef(false);
  const regulatorExecuteLockRef = useRef(false);
  const ingestionLockRef = useRef(false);
  const authRequestLockRef = useRef(false);
  const queueRequestRef = useRef(0);
  const accountLookupRequestRef = useRef(0);

  // Governance Modal
  const [govModalOpen, setGovModalOpen] = useState(false);
  const [govTab, setGovTab] = useState('directory');
  const [officerList, setOfficerList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Maker Investigation Workspace States
  const [formData, setFormData] = useState(() => ({
    transaction_id: createTransactionId(),
    customer_id: 'CUST-10492',
    customer_name: 'Aarav Malhotra',
    amount: 850000,
    historical_avg: 45000,
    channel: 'IMPS',
    beneficiary_name: 'Apex Shell Logistics Ltd',
    beneficiary_is_new: true,
    narration: 'Consulting Retainer Settlement'
  }));

  const [loading, setLoading] = useState(false);
  const [caseData, setCaseData] = useState(null);
  const [activeTab, setActiveTab] = useState('findings');
  const [accountHolderQuery, setAccountHolderQuery] = useState('Aarav Malhotra');
  const [accountHolderOptions, setAccountHolderOptions] = useState([]);
  const [accountHolderOffset, setAccountHolderOffset] = useState(0);
  const [accountHolderHasMore, setAccountHolderHasMore] = useState(false);
  const [accountLookupOpen, setAccountLookupOpen] = useState(false);
  const [accountLookupLoading, setAccountLookupLoading] = useState(false);
  const [preparingNewCase, setPreparingNewCase] = useState(false);

  // Adjudication Dialogs
  const [makerModalOpen, setMakerModalOpen] = useState(false);
  const [makerDecision, setMakerDecision] = useState('RECOMMEND_REJECT');
  const [makerNotes, setMakerNotes] = useState('');

  const [checkerDecision, setCheckerDecision] = useState('REJECTED');
  const [checkerNotes, setCheckerNotes] = useState('');
  const [regulatorDisposition, setRegulatorDisposition] = useState('NO_FURTHER_ACTION');
  const [regulatorReference, setRegulatorReference] = useState('');
  const [regulatorNotes, setRegulatorNotes] = useState('');

  const loadCaseIntoAnalystWorkspace = (data) => {
    if (!data?.case_id) return;
    setCaseData(data);
    setFormData((current) => ({
      ...current,
      transaction_id: data.transaction_id || current.transaction_id,
      customer_id: data.customer_id || current.customer_id,
      customer_name: data.customer_name || current.customer_name,
      amount: Number(data.amount ?? current.amount),
      historical_avg: Number(data.historical_avg ?? current.historical_avg),
      channel: data.channel || current.channel,
      beneficiary_name: data.beneficiary_name || current.beneficiary_name,
    }));
    setAccountHolderQuery(data.customer_name || '');
    setAccountLookupOpen(false);
  };

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
      setCurrentUser(null);
      setSessionToken('');
      setAuthError('Compliance shift session expired. Please re-authenticate.');
      throw new Error('Session expired');
    }
    return res;
  };

  const fetchAccountHolderOptions = async (query = '', offset = 0) => {
    const requestId = ++accountLookupRequestRef.current;
    setAccountLookupLoading(true);
    try {
      const params = new URLSearchParams({ search: query.trim(), limit: '30', offset: String(offset) });
      const response = await apiFetch(`/api/v1/investigations/account-holders?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(apiErrorMessage(payload, 'Account-holder lookup failed.'));
      }
      const payload = await response.json();
      if (requestId !== accountLookupRequestRef.current) return;
      setAccountHolderOptions(payload.items || []);
      setAccountHolderOffset(payload.offset || 0);
      setAccountHolderHasMore(Boolean(payload.has_more));
    } catch (error) {
      if (requestId === accountLookupRequestRef.current && error.message !== 'Session expired') {
        setErrorMessage(error.message || 'Account-holder lookup failed.');
      }
    } finally {
      if (requestId === accountLookupRequestRef.current) setAccountLookupLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role !== 'ANALYST') return undefined;
    const timeoutId = setTimeout(() => {
      fetchAccountHolderOptions(accountHolderQuery, 0);
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [currentUser?.role, accountHolderQuery]);

  const selectAccountHolder = (holder) => {
    setFormData((current) => ({
      ...current,
      customer_id: holder.customer_id,
      customer_name: holder.customer_name,
      historical_avg: Number(holder.historical_avg),
    }));
    setAccountHolderQuery(holder.customer_name);
    setAccountLookupOpen(false);
    setErrorMessage('');
  };

  const fetchRandomAccountHolder = async () => {
    const params = new URLSearchParams({
      sample: 'true',
      limit: '1',
      exclude_customer_id: formData.customer_id || '',
      exclude_customer_name: formData.customer_name || '',
    });
    const response = await apiFetch(`/api/v1/investigations/account-holders?${params.toString()}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(apiErrorMessage(payload, 'Unable to select an eligible ledger account.'));
    }
    const payload = await response.json();
    if (!payload.items?.length) {
      throw new Error('No additional eligible ledger account is available. Resolve active account reviews or load ledger records.');
    }
    return payload.items[0];
  };

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    apiFetch('/api/v1/auth/me')
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const verifiedUser = await response.json();
        if (cancelled) return;
        setCurrentUser(verifiedUser);
        localStorage.setItem('finsight_user', JSON.stringify(verifiedUser));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentUser?.username]);

  // Step 1: Password Check
  const handleStep1Submit = async (e) => {
    if (e) e.preventDefault();
    if (authRequestLockRef.current) return;
    authRequestLockRef.current = true;
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
        throw new Error(apiErrorMessage(err, 'Authentication failed. Check credentials.'));
      }
      const data = await res.json();
      setMfaChallengeToken(data.mfa_challenge_token);
      setPendingOfficerInfo(data);
      setLoginStep(2);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      authRequestLockRef.current = false;
      setAuthLoading(false);
    }
  };

  // Step 2: 2FA TOTP Check
  const handleStep2Submit = async (e) => {
    if (e) e.preventDefault();
    if (authRequestLockRef.current) return;
    authRequestLockRef.current = true;
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
        throw new Error(apiErrorMessage(err, 'MFA validation failed.'));
      }
      const data = await res.json();
      setCurrentUser(data.user);
      setSessionToken(data.access_token || '');
      localStorage.setItem('finsight_user', JSON.stringify(data.user));
    } catch (err) {
      setAuthError(err.message);
    } finally {
      authRequestLockRef.current = false;
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
    setCaseData(null);
    setMakerDecision('RECOMMEND_REJECT');
    setSelectedCase(null);
    setExecutionSuccessNotice('');
    setErrorMessage('');
    setLoginStep(1);
    setTotpCode('');
  };

  // Fetch MLRO Queue
  const fetchExecutiveQueue = async (preserveCaseId = null) => {
    const requestId = ++queueRequestRef.current;
    setLoadingQueue(true);
    setErrorMessage('');
    try {
      const isRegulatorSession = currentUser?.role === 'REGULATOR_OFFICER';
      const res = await apiFetch(isRegulatorSession ? '/api/v1/regulatory/queue' : '/api/v1/investigations/queue');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(errData, 'Queue synchronization failed.'));
      }
      const data = canonicalizeCases(await res.json());
      if (requestId !== queueRequestRef.current) return;
      setCasesList(data);

      setSelectedCase((current) => {
        const desiredId = preserveCaseId || current?.case_id;
        const match = desiredId ? data.find(c => c.case_id === desiredId) : null;
        if (match) return match;
        const pendingMatch = data.find(c => c.status === (isRegulatorSession ? 'ESCALATED_FIU' : 'PENDING_CHECKER'));
        return pendingMatch || data[0] || null;
      });

      const pendingCount = data.filter(c => c.status === (isRegulatorSession ? 'ESCALATED_FIU' : 'PENDING_CHECKER')).length;
      const now = new Date().toLocaleTimeString();
      setRefreshNotification(`Synced at ${now} (${pendingCount} pending)`);
      setTimeout(() => setRefreshNotification(''), 4000);
    } catch (err) {
      if (err.message !== 'Session expired') {
        setErrorMessage("Failed to load queue. Please check database connection.");
      }
    } finally {
      if (requestId === queueRequestRef.current) setLoadingQueue(false);
    }
  };

  // Ingest Live Stream Anomaly
  const handleIngestStream = async () => {
    if (ingestionLockRef.current) return;
    ingestionLockRef.current = true;
    setIngestingStream(true);
    setErrorMessage('');
    try {
      const res = await apiFetch('/api/v1/investigations/queue/ingest-stream', {
        method: 'POST'
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(errData, 'Stream ingestion failed.'));
      }
      const respData = await res.json();
      await fetchExecutiveQueue(respData.case_id);
      setRefreshNotification(
        respData.deduplicated
          ? `Existing alert opened (${respData.case_id}); duplicate blocked`
          : `Stream alert ingested (${respData.case_id})`
      );
      setTimeout(() => setRefreshNotification(''), 5000);
    } catch (err) {
      if (err.message !== 'Session expired') {
        setErrorMessage(err.message || "Failed to ingest stream record.");
      }
    } finally {
      ingestionLockRef.current = false;
      setIngestingStream(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (currentUser?.role === 'MLRO_OFFICER' || currentUser?.role === 'REGULATOR_OFFICER') {
      fetchExecutiveQueue();
    } else if (currentUser?.role === 'ANALYST') {
      apiFetch('/api/v1/investigations/my-open')
        .then(async (response) => {
          if (!response.ok || cancelled) return null;
          return response.json();
        })
        .then((data) => {
          if (!data?.case_id || cancelled) return;
          loadCaseIntoAnalystWorkspace(data);
          setExecutionSuccessNotice(`Restored pending case ${data.case_id} after sign-in.`);
          setTimeout(() => setExecutionSuccessNotice(''), 5000);
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [currentUser?.username, currentUser?.role]);

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

  useEffect(() => {
    setCheckerNotes('');
    setCheckerDecision(checkerActionForMakerRecommendation(selectedCase?.maker_status?.decision));
    setCheckerConfirmOpen(false);
    setRegulatorDisposition('NO_FURTHER_ACTION');
    setRegulatorReference('');
    setRegulatorNotes('');
    setRegulatorConfirmOpen(false);
    setFormError('');
  }, [selectedCase?.case_id, selectedCase?.maker_status?.decision]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  // Start one new case from an eligible canonical ledger identity.
  const handleStartNewInvestigation = async () => {
    if (caseData?.status === 'PENDING_MAKER') {
      setErrorMessage('Submit or complete the current Maker recommendation before starting another investigation.');
      return;
    }
    if (preparingNewCase) return;
    setPreparingNewCase(true);
    setErrorMessage('');
    try {
      const accountHolder = await fetchRandomAccountHolder();
      simulationRequestRef.current += 1;
      simulationLockRef.current = false;
      setLoading(false);
      setFormData({
        transaction_id: createTransactionId(),
        customer_id: accountHolder.customer_id,
        customer_name: accountHolder.customer_name,
        amount: 450000,
        historical_avg: Number(accountHolder.historical_avg),
        channel: 'RTGS',
        beneficiary_name: 'Panama Horizon Shell Corp',
        beneficiary_is_new: true,
        narration: 'Commercial Retainer Settlement'
      });
      setAccountHolderQuery(accountHolder.customer_name);
      setAccountLookupOpen(false);
      setCaseData(null);
      setMakerDecision('RECOMMEND_REJECT');
      setMakerNotes('');
      setFormError('');
      setExecutionSuccessNotice(`New case draft opened for ${accountHolder.customer_name} (${accountHolder.customer_id}).`);
      setTimeout(() => setExecutionSuccessNotice(''), 5000);
    } catch (error) {
      if (error.message !== 'Session expired') setErrorMessage(error.message);
    } finally {
      setPreparingNewCase(false);
    }
  };

  // Dynamic Synthesis Engine
  const generateRandomSimulation = async () => {
    if (loading || caseData?.status === 'PENDING_MAKER' || caseData?.status === 'PENDING_CHECKER') return;
    if (preparingNewCase) return;
    setPreparingNewCase(true);
    setErrorMessage('');
    try {
      const originator = await fetchRandomAccountHolder();
      const benList = [
        { name: "Panama Horizon Shell Corp", isNew: true },
        { name: "Kiran Global Hardware", isNew: false },
        { name: "KoinX BVI Crypto Exchange", isNew: true },
        { name: "Apex Shell Logistics Ltd", isNew: true }
      ];
      const benObj = benList[Math.floor(Math.random() * benList.length)];
      const ch = ["IMPS", "NEFT", "RTGS", "UPI", "SWIFT"][Math.floor(Math.random() * 5)];
      const isHigh = Math.random() > 0.4;
      const amount = isHigh ? Math.floor(450000 + Math.random() * 1800000) : Math.floor(2500 + Math.random() * 35000);

      setFormData({
        transaction_id: createTransactionId(),
        customer_id: originator.customer_id,
        customer_name: originator.customer_name,
        amount,
        historical_avg: Number(originator.historical_avg),
        channel: ch,
        beneficiary_name: benObj.name,
        beneficiary_is_new: benObj.isNew,
        narration: "Commercial Retainer Settlement"
      });
      setAccountHolderQuery(originator.customer_name);
      setAccountLookupOpen(false);
    } catch (error) {
      if (error.message !== 'Session expired') setErrorMessage(error.message);
    } finally {
      setPreparingNewCase(false);
    }
  };

  // Maker: Trigger Audit
  const handleSimulate = async () => {
    if (simulationLockRef.current || caseData?.status === 'PENDING_MAKER' || caseData?.status === 'PENDING_CHECKER') return;
    simulationLockRef.current = true;
    const requestId = ++simulationRequestRef.current;
    setLoading(true);
    setErrorMessage('');
    const payload = {
      transaction_id: String(formData.transaction_id || `TXN-${Date.now()}`),
      customer_id: String(formData.customer_id || '').trim(),
      customer_name: String(formData.customer_name || '').trim(),
      amount: Number(formData.amount),
      currency: 'INR',
      channel: String(formData.channel || 'IMPS'),
      beneficiary_name: String(formData.beneficiary_name || '').trim(),
      beneficiary_is_new: Boolean(formData.beneficiary_is_new),
      narration: String(formData.narration || '').trim(),
      historical_avg: Number(formData.historical_avg)
    };

    const validationError =
      payload.customer_id.length < 3 ? 'Account Holder ID must contain at least 3 characters.'
      : payload.customer_name.length < 2 ? 'Account holder name must contain at least 2 characters.'
      : payload.beneficiary_name.length < 2 ? 'Beneficiary name must contain at least 2 characters.'
      : payload.narration.length < 2 ? 'Payment purpose must contain at least 2 characters.'
      : !Number.isFinite(payload.amount) || payload.amount <= 0 ? 'Transaction amount must be greater than zero.'
      : !Number.isFinite(payload.historical_avg) || payload.historical_avg <= 0 ? 'Historical average must be greater than zero.'
      : '';
    if (validationError) {
      setErrorMessage(validationError);
      simulationLockRef.current = false;
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch('/api/v1/investigations/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(errData, `Investigation failed with HTTP ${res.status}.`));
      }

      const data = await res.json();
      if (requestId !== simulationRequestRef.current) return;
      loadCaseIntoAnalystWorkspace(data);
      if (data.resumed_existing_case) {
        setExecutionSuccessNotice(data.resume_message || `Pending case ${data.case_id} restored.`);
        setTimeout(() => setExecutionSuccessNotice(''), 5000);
      }
    } catch (err) {
      if (requestId === simulationRequestRef.current && err.message !== 'Session expired') {
        setErrorMessage(err.message || 'Audit failed');
      }
    } finally {
      simulationLockRef.current = false;
      if (requestId === simulationRequestRef.current) setLoading(false);
    }
  };

  // Maker: Transmit Recommendation
  const handleMakerSubmit = async () => {
    if (makerSubmitLockRef.current) return;
    if (!caseData?.case_id || caseData?.status !== 'PENDING_MAKER') {
      setFormError('This case is no longer awaiting a Maker recommendation. Close the dialog and refresh the case.');
      return;
    }
    if (makerNotes.trim().length < 12) {
      setFormError('Add at least 12 characters of evidence rationale before transmission.');
      return;
    }
    makerSubmitLockRef.current = true;
    setLoading(true);
    setFormError('');
    setErrorMessage('');
    try {
      const res = await apiFetch(`/api/v1/investigations/${caseData.case_id}/maker-recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation: makerDecision, findings_summary: makerNotes }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(errData, 'Maker submission rejected.'));
      }
      const updated = await res.json();
      setCaseData(updated.case);
      setMakerModalOpen(false);
    } catch (err) {
      if (err.message !== 'Session expired') setFormError(err.message || 'Maker submission failed.');
    } finally {
      makerSubmitLockRef.current = false;
      setLoading(false);
    }
  };

  // Checker: Execute Statutory Ruling
  const handleCheckerExecute = async () => {
    if (checkerExecuteLockRef.current || !selectedCase?.case_id || selectedCase?.status !== 'PENDING_CHECKER') return;
    if (checkerNotes.trim().length < 12) {
      setFormError('A statutory memo of at least 12 characters is required for every binding decision.');
      setCheckerConfirmOpen(false);
      return;
    }
    checkerExecuteLockRef.current = true;
    setExecutingRuling(true);
    setCheckerConfirmOpen(false);
    setFormError('');
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
        throw new Error(apiErrorMessage(err, 'Checker authorization failed.'));
      }

      const data = await res.json();
      const finalized = data.case;

      setSelectedCase(finalized);
      setCasesList(prev => prev.map(c => c.case_id === finalized.case_id ? finalized : c));
      setInboxTab('finalized');
      
      if (finalized.status === 'ESCALATED_FIU') {
        setExecutionSuccessNotice(`⚖️ STATUTORY ESCALATION SEALED: Transmitted to Financial Intelligence Unit (FIU-IND) under Docket ${finalized.fiu_docket_id}. Funds frozen in Escrow.`);
      } else {
        setExecutionSuccessNotice(`Statutory ruling [${finalized.final_verdict}] sealed & written to core ledger.`);
      }

      setCheckerNotes('');
      setTimeout(() => setExecutionSuccessNotice(''), 8000);
    } catch (err) {
      if (err.message !== 'Session expired') {
        setErrorMessage(err.message);
        if (String(err.message).includes('already')) await fetchExecutiveQueue(selectedCase.case_id);
      }
    } finally {
      checkerExecuteLockRef.current = false;
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
    a.download = `FINSIGHT_STATUTORY_DOCKET_${target.fiu_docket_id || target.case_id || 'REPORT'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const requestCheckerConfirmation = () => {
    if (executingRuling || selectedCase?.status !== 'PENDING_CHECKER') return;
    if (checkerNotes.trim().length < 12) {
      setFormError('A statutory memo of at least 12 characters is required for every binding decision.');
      return;
    }
    setFormError('');
    setCheckerConfirmOpen(true);
  };

  const requestRegulatorConfirmation = () => {
    if (executingRuling || selectedCase?.status !== 'ESCALATED_FIU') return;
    if (regulatorReference.trim().length < 6) {
      setFormError('Enter the official FIU acknowledgement or order reference (minimum 6 characters).');
      return;
    }
    if (regulatorNotes.trim().length < 12) {
      setFormError('A regulator rationale of at least 12 characters is required.');
      return;
    }
    setFormError('');
    setRegulatorConfirmOpen(true);
  };

  const handleRegulatorDisposition = async () => {
    if (regulatorExecuteLockRef.current || !selectedCase?.case_id || selectedCase?.status !== 'ESCALATED_FIU') return;
    regulatorExecuteLockRef.current = true;
    setExecutingRuling(true);
    setRegulatorConfirmOpen(false);
    setErrorMessage('');
    setFormError('');
    try {
      const res = await apiFetch(`/api/v1/regulatory/cases/${selectedCase.case_id}/disposition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disposition: regulatorDisposition,
          regulator_reference: regulatorReference.trim(),
          rationale: regulatorNotes.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(err, 'Regulator disposition could not be recorded.'));
      }
      const data = await res.json();
      const finalized = data.case;
      setSelectedCase(finalized);
      setCasesList((previous) => previous.map((item) => item.case_id === finalized.case_id ? finalized : item));
      setInboxTab('finalized');
      setExecutionSuccessNotice(`External disposition ${finalized.final_verdict} sealed under ${finalized.regulator_reference}.`);
      setTimeout(() => setExecutionSuccessNotice(''), 8000);
    } catch (err) {
      if (err.message !== 'Session expired') {
        setErrorMessage(err.message);
        if (String(err.message).includes('already')) await fetchExecutiveQueue(selectedCase.case_id);
      }
    } finally {
      regulatorExecuteLockRef.current = false;
      setExecutingRuling(false);
    }
  };

  const isChecker = currentUser?.role === 'MLRO_OFFICER';
  const isRegulator = currentUser?.role === 'REGULATOR_OFFICER';
  const isDecisionDesk = isChecker || isRegulator;
  const velocityRatio = (parseFloat(formData.amount || 0) / (parseFloat(formData.historical_avg || 1) || 1)).toFixed(1);
  const riskPercent = caseData ? Math.round((caseData.risk_score || 0) * 100) : null;

  const pendingCases = (casesList || []).filter(c => c && c.status === (isRegulator ? 'ESCALATED_FIU' : 'PENDING_CHECKER'));
  const finalizedCases = (casesList || []).filter(c => c && (
    isRegulator
      ? c.status.startsWith('REGULATOR_')
      : c.status === 'FINALIZED' || c.status === 'ESCALATED_FIU' || c.status.startsWith('REGULATOR_')
  ));
  const displayedCases = inboxTab === 'pending' ? pendingCases : finalizedCases;

  const isMakerLocked = caseData?.status === 'PENDING_MAKER' || caseData?.status === 'PENDING_CHECKER';
  const violatesSegregationOfDuties = selectedCase?.maker_status?.username === currentUser?.username;
  const makerRecommendedCheckerAction = checkerActionForMakerRecommendation(selectedCase?.maker_status?.decision);
  const isCheckerOverride = Boolean(selectedCase?.maker_status?.decision) && checkerDecision !== makerRecommendedCheckerAction;

  // ==========================================
  // AUTHENTICATION VIEW
  // ==========================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans antialiased selection:bg-cyan-500/30">
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
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
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
                  <div className="text-[10px] text-cyan-400">Dense + Sparse RRF</div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0e172c] border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Segregation
                  </div>
                  <div className="text-sm font-bold text-white">Maker & Checker</div>
                  <div className="text-[10px] text-indigo-400">Enforced SoD</div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0e172c] border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-emerald-400" /> Cryptography
                  </div>
                  <div className="text-sm font-bold text-white">RFC 6238 TOTP</div>
                  <div className="text-[10px] text-emerald-400">HttpOnly Binding</div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-800/80 text-[11px] text-slate-500 font-mono flex items-center justify-between">
              <span>ISO 27001 / SOC 2 Control-Aligned Design</span>
              <span>Central Bank KYC Master Directive</span>
            </div>
          </div>

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
                    ? DEMO_MODE
                      ? "Enter institutional clearance credentials or select a test persona below."
                      : "Enter your institutional clearance credentials."
                    : "Enter rolling 6-digit code from your authenticator app."}
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

                  {DEMO_MODE && <div className="pt-5 border-t border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>Test Harness Personas:</span>
                      <span className="text-cyan-400">Select to Populate</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
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
                      </button>

                      <button
                        type="button"
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
                      </button>

                      <button
                        type="button"
                        onClick={() => { setUsername('regulator.iyer'); setPassword('Regulator@2026'); }}
                        className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                          username === 'regulator.iyer'
                            ? 'bg-purple-950/40 border-purple-500 ring-1 ring-purple-500/30'
                            : 'bg-[#0d1424] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Ananya Iyer</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">FIU</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">Regulator &bull; External Disposition</div>
                      </button>
                    </div>
                  </div>}
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
                      {DEMO_MODE && pendingOfficerInfo?.otpauth_uri && (
                        <button
                          type="button"
                          onClick={() => setShowPairingModal(true)}
                          className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                        >
                          Pair demo authenticator
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
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
        {DEMO_MODE && showPairingModal && pendingOfficerInfo?.otpauth_uri && pendingOfficerInfo?.totp_seed && (
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

                <div className="flex justify-center p-3 bg-white rounded-xl w-fit mx-auto" aria-label="Authenticator QR code">
                  <QRCodeSVG value={pendingOfficerInfo.otpauth_uri} size={160} level="M" />
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
                isRegulator ? 'bg-purple-950 text-purple-300 border-purple-800' : isChecker ? 'bg-cyan-950 text-cyan-400 border-cyan-800' : 'bg-indigo-950 text-indigo-400 border-indigo-800'
              }`}>
                {isRegulator ? "DESK: FIU EXTERNAL DISPOSITION" : isChecker ? "DESK: MLRO EXECUTIVE ADJUDICATION" : "DESK: ANALYST INVESTIGATION & TRIAGE"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isRegulator ? "Independent Regulatory Review & Enforcement Authority" : isChecker ? "Statutory Account Freeze & Regulatory Reporting Authority" : "Transaction Monitoring & Anomaly Evidence Profiler"}
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
            isRegulator ? 'bg-purple-950/40 border-purple-800 text-purple-300' : isChecker ? 'bg-cyan-950/40 border-cyan-800 text-cyan-300' : 'bg-indigo-950/40 border-indigo-800 text-indigo-300'
          }`}>
            <BadgeCheck className="w-3.5 h-3.5" />
            <span className="font-sans font-medium text-xs">{currentUser.full_name}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold uppercase bg-black/40">
              {isRegulator ? "REGULATOR" : isChecker ? "CHECKER" : "MAKER"}
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
        {isDecisionDesk ? (
          <div className="space-y-6">
            
            {/* Header Banner */}
            <div className="bg-[#0c1427] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${isRegulator ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'}`}>
                  <Inbox className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                    {isRegulator ? 'FIU-IND Escalation Review Queue' : 'Executive Adjudication Queue & Four-Eyes Clearance'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isRegulator
                      ? 'Review MLRO-referred STR dossiers and record an independent, immutable external disposition.'
                      : 'Review triaged anomalies submitted by AML Analysts. Select binding orders: Freeze Funds, Escalate to FIU-IND, or Override.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {!isRegulator && (
                  <button
                    onClick={handleIngestStream}
                    disabled={ingestingStream}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 rounded-xl text-xs font-mono transition cursor-pointer shadow-sm disabled:opacity-50"
                    title="Pull fresh high-risk transfers from the 1M database table"
                  >
                    <Radio className={`w-3.5 h-3.5 ${ingestingStream ? 'animate-spin text-cyan-400' : 'text-indigo-400'}`} />
                    <span>{ingestingStream ? "Ingesting..." : "Ingest Inbound Stream"}</span>
                  </button>
                )}

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
                    onClick={() => {
                      setInboxTab('pending');
                      setSelectedCase(pendingCases[0] || null);
                      setErrorMessage('');
                    }}
                    className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      inboxTab === 'pending' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{isRegulator ? 'Awaiting FIU' : 'Pending'} ({pendingCases.length})</span>
                  </button>
                  <button
                    onClick={() => {
                      setInboxTab('finalized');
                      setSelectedCase(finalizedCases[0] || null);
                      setErrorMessage('');
                    }}
                    className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      inboxTab === 'finalized' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>{isRegulator ? 'Disposed' : 'Resolved / Escalated'} ({finalizedCases.length})</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                  {displayedCases.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-500 bg-[#0c1427] border border-slate-800 rounded-2xl italic space-y-2">
                      <Inbox className="w-6 h-6 mx-auto text-slate-600" />
                      <div>No {inboxTab} cases in registry.</div>
                      {inboxTab === 'pending' && !isRegulator && (
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
                        onClick={() => {
                          setSelectedCase(item);
                          setErrorMessage('');
                          setFormError('');
                        }}
                        className={`p-4 rounded-xl border text-xs cursor-pointer transition space-y-2 ${
                          selectedCase?.case_id === item.case_id
                            ? 'bg-[#121e3a] border-cyan-500/80 shadow-md'
                            : 'bg-[#0c1427] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-white">{item.case_id}</span>
                          <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                            item.status === 'ESCALATED_FIU'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : item.status === 'FINALIZED' || item.status.startsWith('REGULATOR_')
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {item.status === 'ESCALATED_FIU' ? 'AWAITING FIU' : (item.status === 'FINALIZED' || item.status.startsWith('REGULATOR_') ? item.final_verdict : (item.priority || "P1 CRITICAL"))}
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

              {/* Right Column: Case Dossier & Statutory Execution Controls */}
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
                          {selectedCase.fiu_docket_id && (
                            <span className="text-[10px] font-mono text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800 font-bold">
                              Docket: {selectedCase.fiu_docket_id}
                            </span>
                          )}
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
                        Investigated by: {selectedCase.maker_status?.officer || "Compliance Analyst"}
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
                                +{Number(f.score_delta || 0).toFixed(2)} Delta
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

                    {/* Statutory Adjudication Controls & Escalation Treatment */}
                    {selectedCase.status === 'ESCALATED_FIU' ? (
                      /* ESCALATION SCENARIO: LOCKED BY EXTERNAL STATUTE */
                      <div className="p-5 rounded-xl bg-purple-950/40 border border-purple-800 text-purple-200 text-xs space-y-3 shadow-xl">
                        <div className="flex items-center justify-between border-b border-purple-800/80 pb-3">
                          <div className="flex items-center gap-2">
                            <Scale className="w-5 h-5 text-purple-400 animate-pulse" />
                            <div>
                              <div className="font-bold text-white text-sm">STATUTORY REGULATORY ESCALATION ACTIVE</div>
                              <div className="text-[11px] text-purple-300 font-mono">FIU-IND Suspicious Transaction Report (STR) Filed</div>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-md bg-purple-900 border border-purple-700 text-white font-mono font-bold text-xs">
                            {selectedCase.fiu_docket_id}
                          </span>
                        </div>

                        <p className="text-slate-300 text-[11px] leading-relaxed">
                          This case has been formally referred to the <strong>Financial Intelligence Unit - India (FIU-IND)</strong> under the institution's applicable AML reporting obligations. The transaction value of <strong>₹{Number(selectedCase.amount).toLocaleString('en-IN')}</strong> is held in <strong>regulatory review</strong>. {isRegulator ? 'Record the independent external outcome below.' : 'Internal officers cannot release or alter the case until an authorized external disposition is recorded.'}
                        </p>

                        {isRegulator && (
                          <div className="space-y-3 rounded-xl border border-purple-700/70 bg-[#080f1d]/80 p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="text-[11px] text-slate-400 block mb-1.5 font-medium">External disposition</label>
                                <select
                                  value={regulatorDisposition}
                                  onChange={(event) => { setRegulatorDisposition(event.target.value); setFormError(''); }}
                                  className="w-full bg-[#070b14] border border-slate-700 rounded-xl p-2.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500 text-xs"
                                >
                                  <option value="NO_FURTHER_ACTION">NO FURTHER ACTION — Clear and release</option>
                                  <option value="CONTINUE_MONITORING">CONTINUE MONITORING — Close with surveillance</option>
                                  <option value="ENFORCEMENT_REFERRED">ENFORCEMENT REFERRED — Maintain restraint</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400 block mb-1.5 font-medium">FIU acknowledgement / order reference</label>
                                <input
                                  value={regulatorReference}
                                  onChange={(event) => { setRegulatorReference(event.target.value); setFormError(''); }}
                                  placeholder="e.g. FIU-ACK-2026-001842"
                                  className="w-full bg-[#070b14] border border-slate-700 rounded-xl p-2.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500 text-xs"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-400 block mb-1.5 font-medium">Regulator rationale / binding instructions</label>
                              <textarea
                                rows={3}
                                value={regulatorNotes}
                                onChange={(event) => { setRegulatorNotes(event.target.value); setFormError(''); }}
                                placeholder="Record the legal basis and operative instructions returned by FIU-IND..."
                                className="w-full resize-none bg-[#070b14] border border-slate-700 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-purple-500 text-xs"
                              />
                            </div>
                            {formError && (
                              <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/30 p-3 text-[11px] text-rose-300">
                                {formError}
                              </div>
                            )}
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={requestRegulatorConfirmation}
                                disabled={executingRuling}
                                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg shadow-purple-600/30"
                              >
                                {executingRuling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                                Review External Disposition
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-purple-800/80">
                          <span className="text-[10px] font-mono text-slate-400">
                            Escalated by: {selectedCase.checker_status?.officer || "MLRO"}
                          </span>
                          <button
                            onClick={downloadAuditReport}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-purple-600/30"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download Statutory FIU STR Docket (XML/JSON)</span>
                          </button>
                        </div>
                      </div>
                    ) : selectedCase.status === 'FINALIZED' || selectedCase.status.startsWith('REGULATOR_') ? (
                      /* RESOLVED INTERNALLY */
                      <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
                        <div className="space-y-1">
                          <div className="font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Ruling Sealed & Recorded in Ledger
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            Verdict: <strong className="text-white">{selectedCase.final_verdict}</strong> by {selectedCase.regulator_status?.officer || selectedCase.checker_status?.officer || "MLRO"}
                          </div>
                          {selectedCase.regulator_reference && (
                            <div className="text-[10px] text-emerald-400 font-mono">External reference: {selectedCase.regulator_reference}</div>
                          )}
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
                      /* PENDING ADJUDICATION CONTROLS */
                      <div className="pt-4 border-t border-slate-800 space-y-3">
                        <h4 className="text-xs font-mono font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Scale className="w-4 h-4 text-cyan-400" /> Record MLRO Decision
                        </h4>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="text-slate-400 block mb-1 font-medium">Binding Statutory Decision</label>
                            <select
                              value={checkerDecision}
                              onChange={(e) => {
                                setCheckerDecision(e.target.value);
                                setFormError('');
                              }}
                              className="w-full bg-[#080f1d] border border-slate-700 rounded-xl p-2.5 text-slate-200 font-mono focus:outline-none focus:border-cyan-500 text-xs"
                            >
                              <option value="REJECTED">
                                REJECT — {makerRecommendedCheckerAction === 'REJECTED' ? 'Confirm Maker and freeze' : 'Override Maker and freeze'}
                              </option>
                              <option value="ESCALATED">
                                ESCALATE — {makerRecommendedCheckerAction === 'ESCALATED' ? 'Confirm FIU-IND referral' : 'Refer authority to FIU-IND'}
                              </option>
                              <option value="APPROVED">
                                APPROVE — {makerRecommendedCheckerAction === 'APPROVED' ? 'Confirm Maker and release' : 'Override Maker and release'}
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="text-slate-400 block mb-1 font-medium">Officer Legal Justification / Memo</label>
                            <input
                              type="text"
                              value={checkerNotes}
                              onChange={(e) => {
                                setCheckerNotes(e.target.value);
                                setFormError('');
                              }}
                              placeholder={checkerDecision === 'ESCALATED' ? "Mandatory statutory justification for FIU-IND..." : "Record formal statutory memo for regulatory logs..."}
                              className="w-full bg-[#080f1d] border border-slate-700 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 text-xs"
                            />
                          </div>
                        </div>

                        <div className={`rounded-xl border p-3 text-[11px] leading-relaxed flex items-start gap-2 ${
                          isCheckerOverride
                            ? 'border-amber-700/60 bg-amber-950/30 text-amber-200'
                            : 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200'
                        }`}>
                          {isCheckerOverride ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                          <span>
                            {isCheckerOverride
                              ? `MLRO override selected. The Maker recommended ${makerRecommendedCheckerAction}; document the independent legal basis in the memo.`
                              : `Decision aligned with the Maker recommendation (${selectedCase.maker_status?.decision}). Independent MLRO review and memo remain mandatory.`}
                          </span>
                        </div>

                        {checkerDecision === 'ESCALATED' && (
                          <div className="rounded-xl border border-purple-700/60 bg-purple-950/30 p-3 text-[11px] leading-relaxed text-purple-200">
                            Escalation does not approve or reject the transaction. It transfers authority to FIU-IND, freezes internal action, creates an external docket, and locks the case pending regulator disposition.
                          </div>
                        )}

                        {violatesSegregationOfDuties && (
                          <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-3 text-[11px] text-rose-300 flex items-center gap-2">
                            <Lock className="h-3.5 w-3.5 shrink-0" /> Four-Eyes control: you cannot adjudicate a case you submitted as Maker.
                          </div>
                        )}

                        {formError && (
                          <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/30 p-3 text-[11px] text-rose-300">
                            {formError}
                          </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            onClick={requestCheckerConfirmation}
                            disabled={executingRuling || violatesSegregationOfDuties}
                            className={`font-bold px-6 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50 ${
                              checkerDecision === 'ESCALATED'
                                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30' 
                                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
                            }`}
                          >
                            {executingRuling ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : checkerDecision === 'ESCALATED' ? (
                              <FileWarning className="w-4 h-4" />
                            ) : (
                              <Scale className="w-4 h-4" />
                            )}
                            <span>
                              {executingRuling 
                                ? "Recording on Core Ledger..."
                                : checkerDecision === 'ESCALATED'
                                ? "Review External Escalation"
                                : "Review Binding Decision"}
                            </span>
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
              MAKER VIEW: ANALYST INVESTIGATION WORKBENCH (WITH FORM LOCKING & RESET)
             ========================================================================= */
          <div className="space-y-6">
            
            {/* 1. Transaction Injection & Counterparty Profiler */}
            <section className="bg-gradient-to-b from-[#0c1427] to-[#091020] border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800/80">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <span>Transaction Injection & Counterparty Profiler</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure transaction attributes or synthesize synthetic anomalies across the 1,000,000-record core banking ledger.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  {/* Single canonical action for opening the next case draft. */}
                  <button
                    type="button"
                    onClick={handleStartNewInvestigation}
                    disabled={loading || preparingNewCase || caseData?.status === 'PENDING_MAKER'}
                    className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition cursor-pointer flex items-center gap-1.5 font-mono shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {preparingNewCase ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                    <span>{preparingNewCase ? 'Preparing Case...' : 'Start New Case'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={generateRandomSimulation}
                    disabled={loading || preparingNewCase || isMakerLocked}
                    className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 transition cursor-pointer flex items-center gap-2 font-mono shadow-sm disabled:opacity-40"
                  >
                    <Dices className="w-4 h-4 text-indigo-400" />
                    <span>Synthesize Dynamic Record</span>
                  </button>
                </div>
              </div>

              {/* Form Grid (Locked when case is pending with Checker) */}
              <div className={`grid grid-cols-1 md:grid-cols-12 gap-5 text-xs transition-opacity ${isMakerLocked ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="md:col-span-5 space-y-1.5 relative">
                  <label htmlFor="account-holder-search" className="text-slate-400 font-medium flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-400" /> Originating Account Holder
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">Indexed ledger search</span>
                  </label>
                  <div className="relative">
                    <input
                      id="account-holder-search"
                      type="search"
                      role="combobox"
                      aria-expanded={accountLookupOpen}
                      aria-controls="account-holder-results"
                      aria-autocomplete="list"
                      autoComplete="off"
                      disabled={isMakerLocked}
                      value={accountHolderQuery}
                      onFocus={() => setAccountLookupOpen(true)}
                      onBlur={() => setTimeout(() => setAccountLookupOpen(false), 150)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setAccountHolderQuery(value);
                        setFormData((current) => ({ ...current, customer_id: '', customer_name: value }));
                        setAccountLookupOpen(true);
                      }}
                      placeholder="Search any account holder name or customer ID..."
                      className="w-full bg-[#080f1d] border border-slate-700 rounded-xl px-3.5 py-2.5 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
                    />
                    {accountLookupLoading && <RefreshCw className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-indigo-400" />}

                    {accountLookupOpen && !isMakerLocked && (
                      <div id="account-holder-results" role="listbox" className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-slate-700 bg-[#080f1d] shadow-2xl shadow-black/50">
                        <div className="max-h-64 overflow-y-auto p-1.5">
                          {accountHolderOptions.length > 0 ? accountHolderOptions.map((holder) => (
                            <button
                              type="button"
                              role="option"
                              aria-selected={formData.customer_id === holder.customer_id}
                              key={holder.customer_id}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                selectAccountHolder(holder);
                              }}
                              className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-indigo-500/10 focus:bg-indigo-500/10 focus:outline-none transition"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold text-slate-100">{holder.customer_name}</span>
                                <span className="shrink-0 font-mono text-[10px] text-cyan-400">{holder.customer_id}</span>
                              </div>
                              <div className="mt-1 text-[10px] text-slate-500 font-mono">
                                30-day baseline ₹{Number(holder.historical_avg).toLocaleString('en-IN')}
                              </div>
                            </button>
                          )) : (
                            <div className="px-3 py-6 text-center text-[11px] text-slate-500">
                              {accountLookupLoading ? 'Searching ledger identities...' : 'No eligible account holders match this search.'}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-slate-800 bg-[#0c1427] px-2.5 py-2 text-[10px] font-mono text-slate-500">
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setAccountHolderQuery('');
                              setFormData((current) => ({ ...current, customer_id: '', customer_name: '' }));
                              setAccountLookupOpen(true);
                            }}
                            className="text-indigo-400 hover:text-indigo-300"
                          >
                            Browse all
                          </button>
                          <span>
                            {accountHolderOptions.length
                              ? `Rows ${accountHolderOffset + 1}–${accountHolderOffset + accountHolderOptions.length}`
                              : 'No matching rows'}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={accountHolderOffset === 0 || accountLookupLoading}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => fetchAccountHolderOptions(accountHolderQuery, Math.max(0, accountHolderOffset - 30))}
                              className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-30"
                            >
                              Previous
                            </button>
                            <button
                              type="button"
                              disabled={!accountHolderHasMore || accountLookupLoading}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => fetchAccountHolderOptions(accountHolderQuery, accountHolderOffset + 30)}
                              className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-30"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <BadgeCheck className={`h-3.5 w-3.5 ${formData.customer_id ? 'text-emerald-400' : 'text-amber-400'}`} />
                    {formData.customer_id ? (
                      <span className="text-cyan-400">Selected identity: {formData.customer_id}</span>
                    ) : (
                      <span className="text-amber-300">Select a matching ledger identity before running the audit.</span>
                    )}
                  </div>
                </div>

                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" /> Beneficiary Entity Name
                  </label>
                  <input
                    type="text"
                    disabled={isMakerLocked}
                    value={formData.beneficiary_name}
                    onChange={(e) => setFormData({ ...formData, beneficiary_name: e.target.value })}
                    className="w-full bg-[#080f1d] border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
                  />
                </div>

                <div className="md:col-span-4 space-y-1.5">
                  <label className="text-slate-400 font-medium flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-indigo-400" /> Payment Channel
                  </label>
                  <select
                    disabled={isMakerLocked}
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
                    disabled={isMakerLocked}
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

                <div className="md:col-span-4 bg-[#080f1d] p-4 rounded-xl border border-slate-800 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Transaction Amount</span>
                    <span className="font-mono text-cyan-400 font-bold text-base">
                      ₹{Number(formData.amount).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <input
                    type="range"
                    disabled={isMakerLocked}
                    min="1000"
                    max="2500000"
                    step="5000"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>

                <div className="md:col-span-4 bg-[#080f1d] p-4 rounded-xl border border-slate-800 space-y-2.5">
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
                    disabled={isMakerLocked}
                    min="5000"
                    max={Math.max(300000, Number(formData.historical_avg) || 300000)}
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
                    disabled={isMakerLocked}
                    value={formData.narration}
                    onChange={(e) => setFormData({ ...formData, narration: e.target.value })}
                    className="w-full bg-[#080f1d] border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
                  />
                </div>

                <div className="md:col-span-3 flex items-end">
                  <button
                    onClick={handleSimulate}
                    disabled={loading || isMakerLocked}
                    className={`w-full font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-50 ${
                      isMakerLocked 
                        ? 'bg-slate-800 text-slate-400 cursor-not-allowed' 
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                    }`}
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : isMakerLocked ? (
                      <Lock className="w-4 h-4" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>
                      {caseData?.status === 'PENDING_MAKER'
                        ? 'Audit Ready — Submit Recommendation Below'
                        : caseData?.status === 'PENDING_CHECKER'
                          ? 'Transmitted to MLRO'
                          : 'Trigger Multi-Agent Audit'}
                    </span>
                  </button>
                </div>
              </div>
            </section>

            {/* 2. Interactive Status Banners */}
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
                      onClick={() => {
                        setFormError('');
                        setMakerModalOpen(true);
                      }}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-lg flex items-center gap-2"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Submit Recommendation to MLRO</span>
                    </button>
                  </div>
                ) : caseData.status === 'PENDING_CHECKER' ? (
                  /* STAGE 2: TRANSMITTED - CLEAR ACTIONS TO START NEXT CASE */
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
                          Recommendation submitted: <strong>{caseData.maker_status?.decision}</strong>. Case suspended in MLRO queue. Investigation locked.
                        </p>
                      </div>
                    </div>

                    <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400">
                      Transmitted &bull; Start New Case from the profiler toolbar
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
                          Risk Score: {riskPercent}% &bull; Below 70% threshold &bull; Cleared on Core Ledger
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

            {/* 3. Telemetry & 4-Tab Evidence Intelligence Console */}
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-4 space-y-6">
                <div className="bg-[#0c1427] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <TrendingUp className="w-4 h-4 text-indigo-400" /> Cumulative Risk Index
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-amber-400 font-bold border border-slate-800">
                      HITL Gate: 70%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-4xl font-mono font-extrabold text-white">
                      {riskPercent !== null ? `${riskPercent}%` : '--'}
                    </span>
                    <span className="text-xs font-mono font-semibold uppercase">
                      {riskPercent >= 70 ? (
                        <span className="text-rose-400 bg-rose-950/40 border border-rose-800 px-2 py-1 rounded">Critical AML Anomaly</span>
                      ) : riskPercent >= 35 ? (
                        <span className="text-amber-400 bg-amber-950/40 border border-amber-800 px-2 py-1 rounded">Moderate Commercial</span>
                      ) : riskPercent !== null ? (
                        <span className="text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-2 py-1 rounded">Within Policy Limits</span>
                      ) : (
                        <span className="text-slate-500">Standby</span>
                      )}
                    </span>
                  </div>

                  <div className="w-full bg-[#080f1d] h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ease-out ${
                        riskPercent >= 70 ? 'bg-gradient-to-r from-amber-500 to-rose-500' : 'bg-gradient-to-r from-cyan-500 to-emerald-500'
                      }`}
                      style={{ width: `${riskPercent || 0}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-2">
                    <span>0.00 Clean</span>
                    <span className="text-amber-400 font-semibold">0.70 Boundary</span>
                    <span>1.00 Critical</span>
                  </div>
                </div>

                <div className="bg-[#0c1427] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
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
                      <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-[#080f1d] border border-slate-800">
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

              {/* 4-Tab Evidence Intelligence Console */}
              <div className="col-span-12 lg:col-span-8 bg-[#0c1427] border border-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-800 px-6 pt-3 bg-[#090f1d]">
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
                              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
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
                          <div key={i} className="bg-[#080f1d] border border-slate-800 rounded-xl p-4 text-xs space-y-2.5 transition hover:border-slate-700">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-indigo-400">{f.agent}</span>
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded uppercase ${
                                  f.risk_level === 'HIGH' 
                                    ? 'bg-rose-950 text-rose-400 border border-rose-800' 
                                    : (f.risk_level === 'MEDIUM' ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800')
                                }`}>
                                  {f.risk_level} SEVERITY
                                </span>
                              </div>
                              <span className="font-mono text-slate-300 font-bold bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px]">
                                +{Number(f.score_delta || 0).toFixed(2)} Risk Delta
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
                          <div key={idx} className="bg-[#080f1d] border border-slate-800 rounded-xl p-4 text-xs space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-200 text-sm">{p.document_title}</span>
                              <span className="bg-indigo-950 text-indigo-400 border border-indigo-800 px-2 py-0.5 rounded font-mono text-[10px] font-bold">
                                Citation: {p.citation}
                              </span>
                            </div>
                            <div className="font-mono text-cyan-400 text-xs font-semibold">
                              Section: {p.section}
                            </div>
                            <p className="text-slate-400 italic bg-[#0c1427] p-3.5 rounded-lg border border-slate-800/80 leading-relaxed">
                              "{p.snippet}"
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="py-20 text-center text-slate-500 text-xs italic">
                          No statutory policies retrieved yet.
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'trace' && (
                    <div className="relative border-l-2 border-slate-800 ml-3 space-y-4 my-2">
                      {caseData?.execution_trace && caseData.execution_trace.length > 0 ? (
                        caseData.execution_trace.map((trace, i) => (
                          <div key={i} className="pl-5 relative">
                            <div className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-[#0c1427]" />
                            <div className="text-xs text-slate-300 font-mono leading-relaxed bg-[#080f1d] p-3 rounded-xl border border-slate-800">
                              {formatTraceEntry(trace)}
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
                      <div className="bg-[#080f1d] border border-slate-800 rounded-xl p-5 space-y-3">
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

                        <pre className="bg-[#0c1427] p-4 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800/80 leading-relaxed max-h-[360px]">
                          {caseData ? JSON.stringify(caseData, null, 2) : "// No investigation executed yet."}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Binding checker actions require an explicit second acknowledgement. */}
      {checkerConfirmOpen && selectedCase && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checker-confirm-title"
            className="bg-[#0c1427] border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-start gap-3 border-b border-slate-800 pb-4">
              <div className={`p-2.5 rounded-xl border ${checkerDecision === 'ESCALATED' ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'}`}>
                {checkerDecision === 'ESCALATED' ? <FileWarning className="h-5 w-5" /> : <Scale className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <h3 id="checker-confirm-title" className="text-sm font-bold text-white">Confirm irreversible decision</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Case <span className="font-mono text-slate-200">{selectedCase.case_id}</span> will transition from the checker queue and cannot be adjudicated again.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#080f1d] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Decision</span>
                <span className="font-mono font-bold text-white">{checkerDecision}</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-slate-500">Memo</span>
                <span className="max-w-xs text-right text-slate-300">{checkerNotes.trim()}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Authorized by</span>
                <span className="text-slate-300">{currentUser.full_name} · {currentUser.badge_id}</span>
              </div>
            </div>

            {checkerDecision === 'ESCALATED' && (
              <p className="rounded-xl border border-purple-800 bg-purple-950/30 p-3 text-[11px] leading-relaxed text-purple-200">
                This creates an FIU-IND docket and places the case into read-only external review. The checker is referring authority—not approving the case.
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCheckerConfirmOpen(false)}
                disabled={executingRuling}
                className="rounded-xl px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCheckerExecute}
                disabled={executingRuling}
                className={`rounded-xl px-5 py-2.5 text-xs font-bold flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 ${checkerDecision === 'ESCALATED' ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'}`}
              >
                {executingRuling && <RefreshCw className="h-4 w-4 animate-spin" />}
                <span>{checkerDecision === 'ESCALATED' ? 'Create FIU-IND Escalation' : 'Seal Decision on Ledger'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {regulatorConfirmOpen && selectedCase && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regulator-confirm-title"
            className="bg-[#0c1427] border border-purple-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-start gap-3 border-b border-slate-800 pb-4">
              <div className="p-2.5 rounded-xl border bg-purple-500/10 border-purple-500/30 text-purple-300">
                <Scale className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 id="regulator-confirm-title" className="text-sm font-bold text-white">Seal external regulator disposition</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  This terminal outcome is immutable. Case <span className="font-mono text-slate-200">{selectedCase.case_id}</span> cannot receive a second disposition.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#080f1d] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-4"><span className="text-slate-500">Disposition</span><span className="font-mono font-bold text-white">{regulatorDisposition}</span></div>
              <div className="flex items-center justify-between gap-4"><span className="text-slate-500">External reference</span><span className="font-mono text-purple-300">{regulatorReference.trim()}</span></div>
              <div className="flex items-start justify-between gap-4"><span className="text-slate-500">Rationale</span><span className="max-w-xs text-right text-slate-300">{regulatorNotes.trim()}</span></div>
              <div className="flex items-center justify-between gap-4"><span className="text-slate-500">Authorized by</span><span className="text-slate-300">{currentUser.full_name} · {currentUser.badge_id}</span></div>
            </div>
            <p className="rounded-xl border border-purple-800 bg-purple-950/30 p-3 text-[11px] leading-relaxed text-purple-200">
              The original Maker recommendation and MLRO referral remain preserved. This action appends the FIU outcome and closes external review.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRegulatorConfirmOpen(false)} disabled={executingRuling} className="rounded-xl px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleRegulatorDisposition} disabled={executingRuling} className="rounded-xl px-5 py-2.5 text-xs font-bold flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50">
                {executingRuling && <RefreshCw className="h-4 w-4 animate-spin" />}
                Seal FIU Disposition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maker Recommendation Modal */}
      {makerModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="maker-dialog-title"
            className="bg-[#0c1427] border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 id="maker-dialog-title" className="text-xs font-bold text-white uppercase font-mono tracking-wider">Analyst Recommendation (Maker Step)</h3>
                  <p className="text-xs text-slate-400 font-mono">Case: {caseData?.case_id}</p>
                </div>
              </div>
              <button type="button" aria-label="Close recommendation dialog" disabled={loading} onClick={() => setMakerModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
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
                  <label htmlFor="maker-evidence" className="text-slate-400 block mb-1 font-medium">
                    Analyst Findings & Evidence Rationale <span className="text-amber-400">*</span>
                  </label>
                  <textarea
                    id="maker-evidence"
                    rows={3}
                    autoFocus
                    required
                    minLength={12}
                    maxLength={2000}
                    aria-invalid={Boolean(formError)}
                    aria-describedby="maker-evidence-help maker-form-error"
                    value={makerNotes}
                    onChange={(e) => {
                      setMakerNotes(e.target.value);
                      setFormError('');
                    }}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleMakerSubmit();
                    }}
                    placeholder="e.g. Beneficiary matched offshore shell pattern; customer velocity spike is 18.8x..."
                    className="w-full bg-[#080f1d] border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-amber-500 text-xs"
                  />
                  <div id="maker-evidence-help" className="mt-1 flex items-center justify-between text-[10px] font-mono">
                    <span className={makerNotes.trim().length > 0 && makerNotes.trim().length < 12 ? 'text-amber-400' : 'text-slate-500'}>
                      Minimum 12 characters · Ctrl/⌘ + Enter to transmit
                    </span>
                    <span className="text-slate-500">{makerNotes.length} / 2000</span>
                  </div>
                </div>
              </div>

              {formError && (
                <div id="maker-form-error" role="alert" className="rounded-xl border border-rose-800 bg-rose-950/30 p-3 text-xs text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" disabled={loading} onClick={() => setMakerModalOpen(false)} className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                  Cancel
                </button>
                <button
                  onClick={handleMakerSubmit}
                  disabled={loading}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{loading ? 'Transmitting once…' : 'Transmit to MLRO Checker Queue'}</span>
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
                        off.role === 'REGULATOR_OFFICER'
                          ? 'bg-purple-950 text-purple-300 border-purple-800'
                          : off.role === 'MLRO_OFFICER'
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                          : 'bg-indigo-950 text-indigo-300 border-indigo-800'
                      }`}>
                        {off.role === 'REGULATOR_OFFICER' ? "REGULATOR" : off.role === 'MLRO_OFFICER' ? "CHECKER" : "MAKER"}
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
