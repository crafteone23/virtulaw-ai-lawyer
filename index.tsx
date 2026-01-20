
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Scale, 
  PlusCircle, 
  X, 
  Library, 
  MessageSquare,
  Hammer, 
  Volume2, 
  VolumeX,
  Loader2,
  Menu,
  ChevronRight,
  Users,
  Lightbulb,
  Mic,
  History,
  ExternalLink,
  Smartphone,
  Cpu,
  ShieldCheck,
  Trash2,
  Download,
  Gavel,
  FileText,
  Bookmark,
  Activity,
  Search,
  Tag,
  Copy,
  CheckCircle2,
  Info,
  AlertCircle,
  Crown,
  Zap,
  CreditCard,
  Lock,
  Star,
  Flag,
  Award,
  Terminal,
  Shield,
  RefreshCcw,
  Check,
  Eye
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from "jspdf";

// --- Capacitor Native Bridge Setup ---
let CapacitorInstance: any = null;
const initCapacitor = async () => {
  if (CapacitorInstance) return CapacitorInstance;
  try {
    const core = await import('https://esm.sh/@capacitor/core');
    CapacitorInstance = core.Capacitor;
    return CapacitorInstance;
  } catch (e) { return null; }
};

const getCapacitorPlugin = async (pluginName: string) => {
  const cap = await initCapacitor();
  if (cap?.isNativePlatform()) {
    try {
      return await import(`https://esm.sh/@capacitor/${pluginName}`);
    } catch (e) { return null; }
  }
  return null;
};

const triggerHaptic = async (type: 'impact' | 'success' | 'warning' = 'impact') => {
  try {
    const haptics = await getCapacitorPlugin('haptics');
    if (!haptics) return;
    const { Haptics, ImpactStyle } = haptics;
    if (type === 'impact') await Haptics.impact({ style: ImpactStyle.Medium });
    else if (type === 'success') await Haptics.notification({ type: 'SUCCESS' });
    else if (type === 'warning') await Haptics.notification({ type: 'WARNING' });
  } catch (e) { /* Silent */ }
};

// --- Types & Interfaces ---
type OSType = 'google' | 'ios';
type BootPhase = 'os-select' | 'compliance' | 'loading' | 'active';
type ViewType = 'chat' | 'library' | 'mock-trial' | 'upgrade';

interface Source { uri: string; title: string; }
interface Exhibit { id: string; name: string; content: string; admittedAt: number; }
interface Message { 
  id: string; 
  role: 'user' | 'assistant'; 
  content: string; 
  tacticalTip?: string; 
  sources?: Source[]; 
  timestamp: number; 
  isStreaming?: boolean; 
  isRuling?: boolean;
  isVerdict?: boolean;
  isThinking?: boolean;
}
interface Case { 
  id: string; 
  title: string; 
  messages: Message[]; 
  exhibits: Exhibit[]; 
  category: string; 
  tags: string[]; 
  lastUpdated: number; 
}

interface UsageStats {
  questionsUsed: number;
  trialsUsed: number;
  isPremium: boolean;
  purchaseToken?: string;
}

// --- Constants ---
const FREE_QUESTION_LIMIT = 30;
const FREE_TRIAL_LIMIT = 1;
const PREMIUM_PRICE = "$14.99";
const APP_TOS_URL = "https://virtulaw.ai/terms";
const APP_PRIVACY_URL = "https://virtulaw.ai/privacy";

// --- Prompt Engineering ---
const INITIAL_PROMPT = `You are VirtuLaw AI, a state-of-the-art legal reasoning engine. 
Provide professional, authoritative analysis using relevant codes and precedents.
MANDATORY: You must start your first response with: "**SYSTEM: AI-Generated Information. Not Legal Advice.**"
Maintain a formal and precise tone. Always cite relevant sources using web grounding.`;

const TRIAL_SIMULATION_PROMPT = (exhibits: Exhibit[]) => `You are a Courtroom Simulation Core. 
Persona 1: **Opposing Counsel** (Aggressive, cites rules of evidence, raises objections).
Persona 2: **Presiding Judge** (Neutral, makes formal rulings).

**EXHIBIT RECORD**:
${exhibits.length > 0 ? exhibits.map(e => `- EXHIBIT ${e.name}: ${e.content}`).join('\n') : "No exhibits admitted yet."}

**COMMAND PROTOCOL**: 
- If user input starts with "[COMMAND: OBJECTION]", switch IMMEDIATELY to **Judge** persona. 
  - State "SUSTAINED" or "OVERRULED" in bold caps at the start. 
  - Provide legal reasoning based on the grounds provided.
- If user input starts with "[COMMAND: REST CASE]", switch IMMEDIATELY to **Judge** persona. 
  - Review all testimony and admitted exhibits.
  - Summarize the strongest and weakest points of the case.
  - Provide a formal "VERDICT PREDICTION" with percentage likelihood of success in a real court.
- Otherwise, act as **Opposing Counsel** responding to the user's testimony or cross-examination. Be challenging.

After every response, provide strategic trial feedback in a section labeled "[TACTICAL TIP]".`;

const OBJECTION_GROUNDS = ["Hearsay", "Relevance", "Leading", "Foundation", "Speculation", "Argumentative", "Non-Responsive"];

const TEMPLATES = [
  { id: 'nda', name: 'Non-Disclosure Agreement', category: 'Business', description: 'Protects trade secrets and confidential information.', tags: ['Contract', 'Privacy', 'Corporate'] },
  { id: 'will', name: 'Standard Will', category: 'Family', description: 'Asset distribution and guardianship.', tags: ['Estate', 'Family', 'Wealth'] },
  { id: 'lease', name: 'Residential Lease', category: 'Property', description: 'Landlord and tenant agreement.', tags: ['Real Estate', 'Rental', 'Contract'] }
];

// --- Audio Helpers ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Specialized Courtroom Components ---
const CourtroomScene = ({ currentSpeaker, exhibits }: { currentSpeaker: 'Judge' | 'Counsel' | 'Client' | 'None', exhibits: Exhibit[] }) => {
  return (
    <div className="w-full h-48 md:h-64 bg-slate-950 rounded-[2.5rem] border border-slate-800 relative overflow-hidden shadow-2xl mb-8 group">
      {/* Courtroom Backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black opacity-60" />
      <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
        <Scale size={200} className="text-slate-100" />
      </div>

      {/* Grid Floor */}
      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      {/* Judge's Bench (Top Center) */}
      <motion.div 
        animate={{ scale: currentSpeaker === 'Judge' ? 1.05 : 1, y: currentSpeaker === 'Judge' ? -5 : 0 }}
        className={`absolute top-4 left-1/2 -translate-x-1/2 w-48 md:w-64 h-24 rounded-b-3xl border-x-2 border-b-2 transition-colors flex flex-col items-center justify-end pb-3 z-20 ${currentSpeaker === 'Judge' ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/20' : 'bg-slate-900 border-slate-800'}`}
      >
        <div className={`w-12 h-12 rounded-full mb-1 flex items-center justify-center border-2 transition-colors ${currentSpeaker === 'Judge' ? 'border-amber-500 text-amber-500' : 'border-slate-700 text-slate-500'}`}>
          <Gavel size={24} />
        </div>
        <span className={`text-[10px] font-black uppercase tracking-widest ${currentSpeaker === 'Judge' ? 'text-amber-500' : 'text-slate-500'}`}>Presiding Judge</span>
      </motion.div>

      {/* Witness Stand (Next to Judge) */}
      <motion.div 
        animate={{ scale: currentSpeaker === 'Client' ? 1.05 : 1 }}
        className={`absolute top-12 left-[calc(50%+100px)] md:left-[calc(50%+160px)] -translate-x-1/2 w-20 md:w-28 h-20 rounded-xl border transition-colors flex flex-col items-center justify-center z-10 ${currentSpeaker === 'Client' ? 'bg-blue-500/10 border-blue-500/50 shadow-lg' : 'bg-slate-900/50 border-slate-800'}`}
      >
        <Users size={20} className={currentSpeaker === 'Client' ? 'text-blue-500' : 'text-slate-700'} />
        <span className="text-[7px] font-black uppercase tracking-tighter text-slate-500 mt-1">Witness</span>
      </motion.div>

      {/* Jury Box (Left Side) */}
      <div className="absolute top-1/2 -translate-y-1/2 left-8 w-16 md:w-24 h-32 bg-slate-900/40 rounded-2xl border border-slate-800/50 flex flex-col items-center justify-center gap-2 p-2">
         <div className="grid grid-cols-2 gap-1">
           {[...Array(6)].map((_, i) => <div key={i} className="w-3 h-3 md:w-4 md:h-4 bg-slate-800 rounded-sm" />)}
         </div>
         <span className="text-[7px] font-black uppercase tracking-widest text-slate-700">The Jury</span>
      </div>

      {/* Opposing Counsel Table (Right Side) */}
      <motion.div 
        animate={{ scale: currentSpeaker === 'Counsel' ? 1.05 : 1, x: currentSpeaker === 'Counsel' ? -10 : 0 }}
        className={`absolute bottom-6 right-8 w-32 md:w-48 h-20 rounded-2xl border transition-colors flex flex-col items-center justify-center z-10 ${currentSpeaker === 'Counsel' ? 'bg-red-500/10 border-red-500/50 shadow-lg' : 'bg-slate-900/80 border-slate-800'}`}
      >
        <Hammer size={24} className={currentSpeaker === 'Counsel' ? 'text-red-500' : 'text-slate-700'} />
        <span className={`text-[9px] font-black uppercase tracking-widest mt-1 ${currentSpeaker === 'Counsel' ? 'text-red-500' : 'text-slate-600'}`}>Opposing Counsel</span>
      </motion.div>

      {/* Evidence Table (Bottom Center) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-32 md:w-40 h-10 bg-slate-800/20 rounded-full border border-slate-800/30 flex items-center justify-center gap-1.5 overflow-hidden">
        {exhibits.length > 0 ? (
          exhibits.slice(-4).map((ex, i) => (
            <motion.div 
              key={ex.id} 
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="w-4 h-6 bg-slate-100 rounded-[2px] shadow-sm flex items-center justify-center border border-slate-300"
            >
              <span className="text-[5px] font-black text-slate-950">{ex.name.slice(-1)}</span>
            </motion.div>
          ))
        ) : (
          <span className="text-[7px] font-black uppercase tracking-widest text-slate-700">Evidence Desk</span>
        )}
      </div>

      {/* View Exhibits Badge */}
      <div className="absolute bottom-4 left-6 flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg shadow-xl cursor-default opacity-0 group-hover:opacity-100 transition-opacity">
        <Eye size={10} className="text-slate-400" />
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">{exhibits.length} Exhibits Lodged</span>
      </div>
    </div>
  );
};

function App() {
  const [bootPhase, setBootPhase] = useState<BootPhase>('os-select');
  const [currentOS, setCurrentOS] = useState<OSType>('google');
  const [platform, setPlatform] = useState<'web' | 'android' | 'ios'>('web');
  const [bootLog, setBootLog] = useState<string[]>([]);
  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState(false);
  
  const [cases, setCases] = useState<Case[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAutoSpeakEnabled, setIsAutoSpeakEnabled] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [readingMessageId, setReadingMessageId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copySuccessId, setCopySuccessId] = useState<string | null>(null);
  const [repositoryTab, setRepositoryTab] = useState<'advisory' | 'simulations'>('advisory');
  
  // Monetization State
  const [usageStats, setUsageStats] = useState<UsageStats>({ questionsUsed: 0, trialsUsed: 0, isPremium: false });
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);

  // Modals
  const [isObjectionModalOpen, setIsObjectionModalOpen] = useState(false);
  const [isExhibitModalOpen, setIsExhibitModalOpen] = useState(false);
  const [isTagInputVisible, setIsTagInputVisible] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [exhibitForm, setExhibitForm] = useState({ name: '', content: '' });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [libCategoryFilter, setLibCategoryFilter] = useState<'all' | 'system' | 'user'>('all');

  const ttsAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeCase = useMemo(() => cases.find(c => c.id === activeCaseId), [cases, activeCaseId]);

  const sortedCases = useMemo(() => {
    return [...cases].sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [cases]);

  // Determine current courtroom speaker for visual scene
  const currentSpeaker = useMemo(() => {
    if (!activeCase || activeCase.category !== 'Mock Trial') return 'None';
    if (isLoading) return 'Counsel'; // Counsel is usually the one thinking/opposing
    const lastMsg = activeCase.messages[activeCase.messages.length - 1];
    if (!lastMsg) return 'None';
    if (lastMsg.role === 'user') return 'Client';
    if (lastMsg.isRuling || lastMsg.isVerdict || lastMsg.content.includes('JUDGE') || lastMsg.content.includes('COURT')) return 'Judge';
    return 'Counsel';
  }, [activeCase, isLoading]);

  useEffect(() => {
    const initApp = async () => {
      const cap = await initCapacitor();
      if (cap) setPlatform(cap.getPlatform());
      
      const savedOS = localStorage.getItem('vlaw_os') as OSType;
      if (savedOS) {
        setCurrentOS(savedOS);
        setBootPhase('active');
      }
      
      try {
        const statusBar = await getCapacitorPlugin('status-bar');
        if (statusBar) {
          const { StatusBar } = statusBar;
          await StatusBar.setBackgroundColor({ color: '#0B0F19' });
        }
      } catch (e) { /* Ignore */ }

      try {
        const savedCases = localStorage.getItem('vlaw_cases');
        if (savedCases) setCases(JSON.parse(savedCases));
        const savedAutoSpeak = localStorage.getItem('vlaw_autospeak');
        if (savedAutoSpeak) setIsAutoSpeakEnabled(savedAutoSpeak === 'true');
        const savedUsage = localStorage.getItem('vlaw_usage');
        if (savedUsage) setUsageStats(JSON.parse(savedUsage));
      } catch (e) { console.error("Session restore error", e); }
      setHasLoaded(true);
    };
    initApp();
  }, []);

  useEffect(() => {
    if (hasLoaded && bootPhase === 'active') {
      localStorage.setItem('vlaw_cases', JSON.stringify(cases));
      localStorage.setItem('vlaw_autospeak', isAutoSpeakEnabled.toString());
      localStorage.setItem('vlaw_usage', JSON.stringify(usageStats));
      if (usageStats.purchaseToken) {
        localStorage.setItem('vlaw_purchase_token', usageStats.purchaseToken);
      }
    }
  }, [cases, bootPhase, isAutoSpeakEnabled, hasLoaded, usageStats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeCase?.messages, isLoading]);

  const filteredLibraryItems = useMemo(() => {
    const systemItems = TEMPLATES.map(t => ({ ...t, type: 'system' as const }));
    const userItems = cases.map(c => ({ ...c, type: 'user' as const, name: c.title }));
    let combined: any[] = [];
    if (libCategoryFilter === 'all' || libCategoryFilter === 'system') combined = [...combined, ...systemItems];
    if (libCategoryFilter === 'all' || libCategoryFilter === 'user') combined = [...combined, ...userItems];
    return combined.filter(item => {
      const name = item.name || item.title || '';
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [searchQuery, libCategoryFilter, cases]);

  const handleSelectOS = (os: OSType) => {
    setCurrentOS(os);
    localStorage.setItem('vlaw_os', os);
    setBootPhase('compliance');
    triggerHaptic('success');
  };

  const startBootSequence = () => {
    setBootPhase('loading');
    const logs = ["Initializing Kernel...", "Linking GenAI Nodes...", "Syncing Database...", "Sandbox Ready."];
    let i = 0;
    const interval = setInterval(() => {
      if (i < logs.length) { 
        setBootLog(p => [...p, logs[i]]); 
        i++; 
      }
      else { 
        clearInterval(interval); 
        setTimeout(() => setBootPhase('active'), 600); 
      }
    }, 300);
  };

  const handlePurchase = async () => {
    setIsPaymentProcessing(true);
    triggerHaptic('impact');
    setTimeout(() => {
      const mockToken = `PLAY-BILLING-${Date.now()}`;
      setUsageStats(p => ({ ...p, isPremium: true, purchaseToken: mockToken }));
      setIsPaymentProcessing(false);
      setCurrentView('chat');
      triggerHaptic('success');
      setErrorMessage("Premium Access Granted. Welcome to VirtuLaw Enterprise.");
      setTimeout(() => setErrorMessage(null), 5000);
    }, 2500);
  };

  const handleRestorePurchase = () => {
    setIsPaymentProcessing(true);
    triggerHaptic('impact');
    setTimeout(() => {
      const savedToken = localStorage.getItem('vlaw_purchase_token');
      if (savedToken) {
        setUsageStats(p => ({ ...p, isPremium: true, purchaseToken: savedToken }));
        setErrorMessage("Purchase Restored Successfully.");
        triggerHaptic('success');
      } else {
        setErrorMessage("No active subscription found for this account.");
        triggerHaptic('warning');
      }
      setIsPaymentProcessing(false);
      setTimeout(() => setErrorMessage(null), 3000);
    }, 2000);
  };

  const startNewCase = (category: string = 'General') => {
    const isMock = category === 'Mock Trial';
    if (!usageStats.isPremium && isMock && usageStats.trialsUsed >= FREE_TRIAL_LIMIT) {
      setCurrentView('upgrade');
      triggerHaptic('warning');
      return;
    }

    const newId = `case-${Date.now()}`;
    const newCase: Case = {
      id: newId,
      title: isMock ? 'Mock Trial Simulation' : 'New Legal Matter',
      messages: [],
      exhibits: [],
      category: isMock ? 'Mock Trial' : 'General Advisory',
      tags: isMock ? ['Litigation'] : [],
      lastUpdated: Date.now()
    };
    
    setCases(prev => [newCase, ...prev]);
    setActiveCaseId(newId);
    setCurrentView(isMock ? 'mock-trial' : 'chat');
    
    if (isMock) {
      setUsageStats(p => ({ ...p, trialsUsed: p.trialsUsed + 1 }));
    }
    
    triggerHaptic('success');
  };

  const resumeCase = (c: Case) => {
    setActiveCaseId(c.id);
    const view = c.category === 'Mock Trial' ? 'mock-trial' : 'chat';
    setCurrentView(view);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
    triggerHaptic('impact');
  };

  const deleteCase = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm("Permanently purge this legal matter from history?")) {
      setCases(prev => prev.filter(c => c.id !== id));
      if (activeCaseId === id) setActiveCaseId(null);
      triggerHaptic('warning');
    }
  };

  const clearAllHistory = () => {
    if (confirm("Reset everything? All stored matters will be lost.")) {
      setCases([]);
      setActiveCaseId(null);
      localStorage.removeItem('vlaw_cases');
      triggerHaptic('warning');
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccessId(id);
    triggerHaptic('success');
    setTimeout(() => setCopySuccessId(null), 2000);
  };

  const ensureAudioContext = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    return audioContextRef.current;
  };

  const stopAllAudio = useCallback(() => {
    if (ttsAudioSourceRef.current) {
      try { ttsAudioSourceRef.current.stop(); } catch(e){}
      ttsAudioSourceRef.current.disconnect();
      ttsAudioSourceRef.current = null;
    }
    setReadingMessageId(null);
  }, []);

  const handleReadAloud = async (content: string, id: string) => {
    const ctx = await ensureAudioContext();
    if (readingMessageId === id) { stopAllAudio(); return; }
    stopAllAudio();
    setReadingMessageId(id);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: content.slice(0, 3000) }] }],
        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
      });
      const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (data) {
        const buf = await decodeAudioData(decode(data), ctx, 24000, 1);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(ctx.destination);
        src.onended = () => { if (readingMessageId === id) setReadingMessageId(null); };
        ttsAudioSourceRef.current = src; src.start();
      }
    } catch { setReadingMessageId(null); }
  };

  const toggleSpeechRecognition = async () => {
    await ensureAudioContext();
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return setErrorMessage("Voice engine not supported.");
    const recognition = new SR();
    recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = (e: any) => {
      let chunkText = ''; 
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) chunkText += e.results[i][0].transcript;
      if (chunkText) setInput(prev => prev + (prev ? ' ' : '') + chunkText);
    };
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition; recognition.start();
    setIsRecording(true);
  };

  const handleSendMessage = async (e?: React.FormEvent, cmd?: string) => {
    e?.preventDefault();
    if (!activeCaseId) return;
    const isMockTrial = activeCase?.category === 'Mock Trial';
    const msg = cmd || input;
    if (!msg.trim() || isLoading) return;

    if (!usageStats.isPremium && !isMockTrial && usageStats.questionsUsed >= FREE_QUESTION_LIMIT) {
      setCurrentView('upgrade');
      triggerHaptic('warning');
      return;
    }

    stopAllAudio();
    triggerHaptic('impact');
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); }

    const isFirst = (activeCase?.messages.length || 0) === 0;
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: msg, timestamp: Date.now() };
    
    setCases(prev => prev.map(c => c.id === activeCaseId ? { ...c, messages: [...c.messages, userMsg], lastUpdated: Date.now() } : c));
    setInput('');
    setIsLoading(true);
    
    if (!isMockTrial) {
      setUsageStats(p => ({ ...p, questionsUsed: p.questionsUsed + 1 }));
    }

    const streamId = `a-${Date.now()}`;
    const initialAssistantMsg: Message = { id: streamId, role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true, isThinking: true };
    setCases(prev => prev.map(c => c.id === activeCaseId ? { ...c, messages: [...c.messages, initialAssistantMsg] } : c));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const model = isMockTrial ? 'gemini-3-flash-preview' : 'gemini-3-pro-preview';
      const instruction = isMockTrial ? TRIAL_SIMULATION_PROMPT(activeCase?.exhibits || []) : INITIAL_PROMPT;
      
      const stream = await ai.models.generateContentStream({
        model,
        contents: [{ role: 'user', parts: [{ text: userMsg.content }] }],
        config: { 
          systemInstruction: instruction, 
          tools: [{ googleSearch: {} }], 
          temperature: 0.1,
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: isMockTrial ? 24576 : 32768 }
        },
      });

      let fullContent = '';
      let detectedSources: Source[] = [];

      for await (const chunk of stream) {
        fullContent += chunk.text || "";
        const grounding = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (grounding) {
          grounding.forEach(c => {
            if (c.web && !detectedSources.find(s => s.uri === c.web!.uri)) {
              detectedSources.push({ uri: c.web!.uri, title: c.web!.title || 'Reference' });
            }
          });
        }
        setCases(prev => prev.map(c => c.id === activeCaseId ? {
          ...c, messages: c.messages.map(m => m.id === streamId ? { 
            ...m, 
            content: fullContent, 
            sources: detectedSources.length ? detectedSources : m.sources,
            isThinking: fullContent === ''
          } : m)
        } : c));
      }

      let finalDisplay = fullContent, tip = '';
      const matchTip = fullContent.match(/\[TACTICAL TIP\][:\s]*(.*)/is);
      if (matchTip) { finalDisplay = fullContent.replace(matchTip[0], '').trim(); tip = matchTip[1].trim(); }
      
      const isRuling = isMockTrial && (finalDisplay.includes("SUSTAINED") || finalDisplay.includes("OVERRULED"));
      const isVerdict = isMockTrial && (finalDisplay.includes("VERDICT PREDICTION") || finalDisplay.includes("FINAL VERDICT"));

      setCases(prev => prev.map(c => c.id === activeCaseId ? {
        ...c, messages: c.messages.map(m => m.id === streamId ? { 
          ...m, content: finalDisplay, tacticalTip: tip, isStreaming: false, isRuling, isVerdict, isThinking: false
        } : m)
      } : c));

      if (isFirst && !isMockTrial) {
        const titleRes = await ai.models.generateContent({ 
          model: 'gemini-3-flash-preview', 
          contents: [{role:'user', parts:[{text:`Concise legal title for: "${userMsg.content}"`}]}] 
        });
        setCases(prev => prev.map(c => c.id === activeCaseId ? { ...c, title: titleRes.text?.replace(/[#*"]/g, '').trim() || 'Legal Brief' } : c));
      }
      if (isAutoSpeakEnabled) handleReadAloud(finalDisplay, streamId);
      triggerHaptic('success');
    } catch (err: any) {
      setErrorMessage(err.message || "Link severed.");
      setCases(prev => prev.map(c => c.id === activeCaseId ? { ...c, messages: c.messages.filter(m => m.id !== streamId) } : c));
    } finally { setIsLoading(false); }
  };

  const handleAddExhibit = () => {
    if (!exhibitForm.name || !exhibitForm.content || !activeCaseId) return;
    const newExhibit: Exhibit = {
      id: `ex-${Date.now()}`,
      name: exhibitForm.name,
      content: exhibitForm.content,
      admittedAt: Date.now()
    };
    setCases(prev => prev.map(c => c.id === activeCaseId ? { ...c, exhibits: [...c.exhibits, newExhibit], lastUpdated: Date.now() } : c));
    setExhibitForm({ name: '', content: '' });
    setIsExhibitModalOpen(false);
    triggerHaptic('success');
  };

  const handleAddTag = (tag: string) => {
    if (!tag.trim() || !activeCaseId) return;
    setCases(prev => prev.map(c => c.id === activeCaseId ? { 
      ...c, tags: Array.from(new Set([...(c.tags || []), tag.trim()])), lastUpdated: Date.now() 
    } : c));
    setTagInput('');
    setIsTagInputVisible(false);
    triggerHaptic('success');
  };

  const exportToPDF = () => {
    if (!activeCase) return;
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 30;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("VIRTU-LAW CASE FILE", margin, y);
    y += 15;
    doc.setFontSize(12);
    doc.text(activeCase.title.toUpperCase(), margin, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`EXPORT DATE: ${new Date().toLocaleString()}`, margin, y);
    y += 5;
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;
    activeCase.messages.forEach(m => {
      doc.setFont("helvetica", "bold");
      doc.text(`${m.role.toUpperCase()}:`, margin, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      const split = doc.splitTextToSize(m.content, pageWidth - (margin * 2));
      if (y + (split.length * 5) > 280) { doc.addPage(); y = 20; }
      doc.text(split, margin, y);
      y += (split.length * 5) + 8;
    });
    doc.save(`${activeCase.title.replace(/\s/g, '_')}_brief.pdf`);
    triggerHaptic('success');
  };

  const isIOS = currentOS === 'ios';
  const theme = {
    bg: isIOS ? 'bg-[#F2F2F7]' : 'bg-[#FAFBFC]',
    header: isIOS ? 'bg-white/80 backdrop-blur-3xl border-slate-200' : 'bg-white border-slate-200',
    card: 'bg-white rounded-[2rem] border-slate-100 shadow-sm',
    accent: isIOS ? 'bg-[#007AFF] text-white' : 'bg-[#FF9F0A] text-[#1D1D1F]',
    sidebar: isIOS ? 'bg-[#F2F2F7] border-slate-200' : 'bg-[#0B0F19] border-slate-800'
  };

  if (!hasLoaded) {
    return (
       <div className="fixed inset-0 bg-[#0B0F19] flex items-center justify-center">
         <Loader2 className="animate-spin text-amber-500" size={48} />
       </div>
    );
  }

  if (bootPhase === 'os-select') {
    return (
      <div className="fixed inset-0 bg-[#0B0F19] flex flex-col items-center justify-center p-6 text-white z-[100]">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center w-full max-w-xl">
          <div className="w-20 h-20 bg-amber-500/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-amber-500/20 shadow-2xl"><Scale size={40} className="text-amber-500" /></div>
          <h1 className="text-6xl font-black uppercase tracking-tighter mb-4">VirtuLaw</h1>
          <p className="text-slate-500 text-[10px] font-black tracking-[0.4em] mb-16 uppercase">Universal Advisor Kernel</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            <button onClick={() => handleSelectOS('google')} className="p-10 bg-slate-900/50 rounded-[2.5rem] border border-white/5 hover:border-amber-500 transition-all flex flex-col items-center gap-6 group active:scale-95">
              <Cpu size={40} className="group-hover:text-amber-500 transition-colors" /><span className="font-black uppercase text-xs tracking-widest">Material Engine</span>
            </button>
            <button onClick={() => handleSelectOS('ios')} className="p-10 bg-slate-900/50 rounded-[2.5rem] border border-white/5 hover:border-blue-500 transition-all flex flex-col items-center gap-6 group active:scale-95">
              <Smartphone size={40} className="group-hover:text-blue-500 transition-colors" /><span className="font-black uppercase text-xs tracking-widest">Cupertino Engine</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (bootPhase === 'compliance') {
    return (
      <div className="fixed inset-0 bg-[#0B0F19] flex items-center justify-center p-6 z-[100]">
        <div className="max-w-md w-full bg-slate-900 p-10 rounded-[3rem] border border-white/5 shadow-2xl">
          <ShieldCheck size={48} className="text-blue-500 mb-8" />
          <h2 className="text-3xl font-black text-white uppercase mb-6 tracking-tight">Node Integrity</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-10 font-medium">VirtuLaw is a generative reasoning tool. By proceeding, you acknowledge this is not a law firm. No attorney-client privilege is formed.</p>
          <label className="flex items-center gap-4 p-6 bg-black rounded-2xl mb-10 cursor-pointer">
            <input type="checkbox" checked={isDisclaimerAccepted} onChange={e => setIsDisclaimerAccepted(e.target.checked)} className="w-6 h-6 rounded-md bg-slate-800 border-none text-blue-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Accept Protocol 4.5.2</span>
          </label>
          <button onClick={startBootSequence} disabled={!isDisclaimerAccepted} className={`w-full py-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${isDisclaimerAccepted ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30' : 'bg-slate-800 text-slate-600'}`}>Initialize Kernel</button>
        </div>
      </div>
    );
  }

  if (bootPhase === 'loading') {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-12 text-emerald-500 font-mono z-[100]">
        <div className="w-full max-w-sm space-y-1">
          {bootLog.map((l, i) => <motion.div key={i} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className="text-[10px] uppercase tracking-widest">{l}</motion.div>)}
          <motion.div animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-2 h-4 bg-emerald-500 inline-block" />
        </div>
      </div>
    );
  }

  const advisoryCases = sortedCases.filter(c => c.category !== 'Mock Trial');
  const simulationCases = sortedCases.filter(c => c.category === 'Mock Trial');

  return (
    <div className={`flex h-screen overflow-hidden ${theme.bg}`}>
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside initial={{ width: 0 }} animate={{ width: 300 }} exit={{ width: 0 }} className={`fixed lg:relative z-50 h-full flex flex-col border-r shadow-2xl overflow-hidden ${theme.sidebar}`}>
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Scale className={isIOS ? 'text-blue-500' : 'text-amber-500'} size={24} />
                <span className={`font-black text-xl tracking-tighter uppercase ${isIOS ? 'text-slate-900' : 'text-white'}`}>VirtuLaw</span>
              </div>
              <button aria-label="Close sidebar" onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-500 p-2"><X size={20}/></button>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto flex-grow scrollbar-hide">
              <button onClick={() => setCurrentView('upgrade')} className={`p-4 rounded-2xl flex items-center gap-3 mb-2 border transition-all ${usageStats.isPremium ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}>
                {usageStats.isPremium ? <Crown size={18}/> : <Star size={18}/>}
                <div className="text-[10px] font-black uppercase tracking-widest">
                  {usageStats.isPremium ? 'Enterprise Core Active' : 'Upgrade to Pro'}
                </div>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => startNewCase('General')} className={`p-4 rounded-2xl font-black text-[9px] uppercase tracking-widest flex flex-col items-center gap-2 shadow-lg active:scale-95 transition-all ${currentView === 'chat' && activeCaseId ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                  <MessageSquare size={16}/> New Case
                </button>
                <button onClick={() => startNewCase('Mock Trial')} className={`p-4 rounded-2xl font-black text-[9px] uppercase tracking-widest flex flex-col items-center gap-2 shadow-lg active:scale-95 transition-all ${currentView === 'mock-trial' && activeCaseId ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
                  <Hammer size={16}/> New Trial
                </button>
              </div>
              
              <div className="pt-6 pb-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-2">
                <Terminal size={12}/> Repository
              </div>

              <div className="flex bg-slate-900/50 p-1 rounded-xl mb-4">
                <button 
                  onClick={() => setRepositoryTab('advisory')} 
                  className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${repositoryTab === 'advisory' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500'}`}
                >
                  Advisory
                </button>
                <button 
                  onClick={() => setRepositoryTab('simulations')} 
                  className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${repositoryTab === 'simulations' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500'}`}
                >
                  Simulations
                </button>
              </div>

              <div className="space-y-2">
                {(repositoryTab === 'advisory' ? advisoryCases : simulationCases).map(c => (
                  <div key={c.id} className="relative group">
                    <button 
                      onClick={() => resumeCase(c)} 
                      className={`w-full text-left p-4 pr-12 rounded-xl text-[10px] font-bold truncate transition-all ${activeCaseId === c.id ? (isIOS ? 'bg-white text-slate-900 shadow-sm' : 'bg-slate-800 text-white') : 'text-slate-500 hover:bg-white/5'}`}
                    >
                      <div className="truncate mb-1">{c.title}</div>
                      <div className="text-[8px] opacity-30 uppercase tracking-widest">{new Date(c.lastUpdated).toLocaleDateString()} • {c.messages.length} msg</div>
                    </button>
                    <button aria-label="Delete matter" onClick={(e) => deleteCase(c.id, e)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
                  </div>
                ))}
                {(repositoryTab === 'advisory' ? advisoryCases : simulationCases).length === 0 && (
                  <div className="p-10 text-center border-2 border-dashed border-white/5 rounded-3xl">
                    <History size={24} className="mx-auto text-slate-700 mb-2" />
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-600">No active {repositoryTab} stored.</p>
                  </div>
                )}
              </div>
              
              <div className="pt-6 pb-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-2">
                <Library size={12}/> Protocols
              </div>
              <button onClick={() => { setCurrentView('library'); setActiveCaseId(null); }} className={`w-full p-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all ${currentView === 'library' ? (isIOS ? 'bg-white text-blue-600 shadow-sm' : 'bg-slate-800 text-amber-500') : 'text-slate-400 hover:text-white'}`}><Library size={16}/> Reference Nodes</button>
            </div>

            {cases.length > 0 && (
              <div className="p-6 border-t border-white/5">
                <button onClick={clearAllHistory} className="w-full p-4 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-red-500 hover:bg-red-500/5 transition-all flex items-center justify-center gap-2">
                  <Trash2 size={14}/> Reset Kernel
                </button>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-grow flex flex-col relative h-full overflow-hidden">
        {currentView === 'upgrade' ? (
          <div className="flex-grow overflow-y-auto scrollbar-hide bg-white">
            <header className="h-20 flex items-center px-8 border-b border-slate-100">
               <button onClick={() => setCurrentView('chat')} className="p-2 text-slate-400 hover:text-slate-900 transition-colors"><ChevronRight size={24} className="rotate-180"/></button>
               <h2 className="ml-4 font-black text-lg uppercase tracking-tight text-slate-900">Enterprise Access</h2>
            </header>
            
            <div className="max-w-xl mx-auto p-8 pt-12 pb-32 space-y-12">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-amber-500 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-amber-500/20"><Crown size={40} className="text-white"/></div>
                <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-900">VirtuLaw Pro</h1>
                <p className="text-slate-500 font-bold max-w-sm mx-auto">The ultimate reasoning kernel for professional litigation and advisory.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {[
                  { icon: <Zap className="text-amber-500"/>, title: "Infinite Reasoning", desc: "Bypass the 30-question daily limit on all Advisory nodes." },
                  { icon: <Hammer className="text-blue-500"/>, title: "Mock Trial Unlocked", desc: "Run unlimited courtroom simulations with advanced AI judges." },
                  { icon: <Cpu className="text-indigo-500"/>, title: "Enterprise Logic", desc: "Access higher-tier thinking budgets for complex legal matters." },
                  { icon: <Download className="text-emerald-500"/>, title: "Full PDF Records", desc: "Export unlimited, professional case files and testimony records." },
                  { icon: <Shield className="text-slate-900"/>, title: "Encrypted Persistence", desc: "Extended cloud-synced matter history across all devices." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-6 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                    <div className="p-3 bg-white rounded-2xl shadow-sm h-fit">{item.icon}</div>
                    <div>
                      <div className="text-sm font-black uppercase tracking-widest text-slate-900 mb-1">{item.title}</div>
                      <p className="text-xs text-slate-500 font-bold leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-6 pt-6">
                <div className="bg-slate-900 text-white rounded-[2.5rem] p-10 relative overflow-hidden shadow-2xl">
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Lifetime Access</span>
                    <div className="text-5xl font-black mb-8">{PREMIUM_PRICE}</div>
                    
                    {isPaymentProcessing ? (
                      <div className="w-full py-6 rounded-2xl bg-white/10 flex items-center justify-center gap-3">
                        <Loader2 className="animate-spin" size={20}/>
                        <span className="font-black uppercase text-xs tracking-widest">Verifying Node...</span>
                      </div>
                    ) : (
                      <button 
                        onClick={handlePurchase}
                        className="w-full py-6 rounded-2xl bg-white text-slate-900 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl hover:bg-slate-100"
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-blue-500 font-black">G</span>
                          <span className="text-red-500 font-black">P</span>
                          <span className="text-amber-500 font-black">a</span>
                          <span className="text-blue-500 font-black">y</span>
                        </div>
                        Buy with Google Pay
                      </button>
                    )}
                  </div>
                  <div className="absolute top-0 right-0 p-8 opacity-5"><Scale size={160}/></div>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleRestorePurchase}
                    className="w-full py-4 text-slate-400 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:text-slate-900 transition-colors"
                  >
                    <RefreshCcw size={14}/> Restore Purchase
                  </button>
                  <div className="flex justify-center gap-6 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    <a href={APP_TOS_URL} target="_blank" className="hover:text-blue-600">Terms of Service</a>
                    <a href={APP_PRIVACY_URL} target="_blank" className="hover:text-blue-600">Privacy Policy</a>
                  </div>
                  <p className="text-center text-[8px] text-slate-300 px-12 leading-relaxed">VirtuLaw Pro is a one-time lifetime license. Subscription will be billed to your Google Play account and can be managed in account settings. No attorney-client privilege is formed by upgrading.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <header className={`h-20 border-b flex items-center justify-between px-8 z-10 safe-top ${theme.header}`}>
               <div className="flex items-center gap-5">
                 {!isSidebarOpen && <button aria-label="Open menu" onClick={() => setIsSidebarOpen(true)} className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 shadow-sm hover:scale-105 active:scale-95 transition-all"><Menu size={20}/></button>}
                 <div>
                   <h2 className="font-black text-lg uppercase tracking-tight text-slate-900 truncate max-w-[120px] md:max-w-none">
                     {currentView === 'library' ? 'Protocols' : (activeCase?.title || 'System Idle')}
                   </h2>
                   <div className="flex items-center gap-2">
                     <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                     <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        {activeCase?.category === 'Mock Trial' && <Hammer size={10} className="text-amber-500"/>}
                        {usageStats.isPremium ? 'Enterprise Node Connected' : `${FREE_QUESTION_LIMIT - usageStats.questionsUsed} Inquiries Left`}
                     </span>
                   </div>
                 </div>
               </div>
               <div className="flex items-center gap-3">
                 {activeCase && (
                   <div className="hidden md:flex items-center gap-2 mr-4">
                     {activeCase.tags.map(t => <span key={t} className="px-3 py-1 bg-slate-100 rounded-full text-[8px] font-black uppercase tracking-widest text-slate-500">{t}</span>)}
                     <button aria-label="Add tag" onClick={() => setIsTagInputVisible(!isTagInputVisible)} className={`p-2 rounded-lg transition-all ${isTagInputVisible ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}><Tag size={16}/></button>
                   </div>
                 )}
                 {activeCase && <button aria-label="Delete matter" onClick={() => deleteCase(activeCase.id)} className="p-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all"><Trash2 size={20}/></button>}
                 {activeCase && <button aria-label="Export PDF" onClick={exportToPDF} className="p-3 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all shadow-sm"><Download size={20}/></button>}
                 {!usageStats.isPremium && (
                   <button onClick={() => setCurrentView('upgrade')} className="p-3 rounded-xl bg-amber-500 text-white shadow-xl animate-pulse">
                     <Crown size={20}/>
                   </button>
                 )}
                 <button aria-label="Auto speak" onClick={() => setIsAutoSpeakEnabled(!isAutoSpeakEnabled)} className={`p-3 rounded-xl transition-all shadow-sm ${isAutoSpeakEnabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                   {isAutoSpeakEnabled ? <Volume2 size={20}/> : <VolumeX size={20}/>}
                 </button>
               </div>
            </header>

            <div className="flex-grow overflow-y-auto p-6 md:p-12 space-y-12 pb-60 scrollbar-hide">
              {currentView === 'library' ? (
                <div className="max-w-6xl mx-auto space-y-10">
                  <div className="bg-white/50 backdrop-blur-xl p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                    <div className="flex flex-col md:flex-row gap-6 items-center">
                      <div className="relative flex-grow w-full group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20}/>
                        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search repository..." className="w-full pl-16 pr-6 py-5 bg-slate-50/50 rounded-2xl outline-none text-sm font-bold border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all shadow-inner" />
                      </div>
                      <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl w-full md:w-auto">
                        {(['all', 'system', 'user'] as const).map(cat => (
                          <button key={cat} onClick={() => setLibCategoryFilter(cat)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${libCategoryFilter === cat ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{cat}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
                    {filteredLibraryItems.map(t => (
                      <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={t.id} className={`p-10 border transition-all shadow-sm hover:shadow-xl ${theme.card} relative group`}>
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="font-black text-xl text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">{t.name || t.title}</h4>
                          {t.type === 'system' && <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest">Protocol</span>}
                        </div>
                        <p className="text-xs font-medium text-slate-500 leading-relaxed mb-8 line-clamp-3">{t.description || "Stored legal session record."}</p>
                        <button onClick={() => { if (t.type === 'user') { resumeCase(t); } else { startNewCase(); handleSendMessage(undefined, `Draft a professional ${t.name}.`); } }} className="w-full py-4 rounded-xl font-black text-[9px] uppercase tracking-widest border-2 border-slate-100 hover:bg-slate-50 transition-all flex items-center justify-center gap-2">Execute Node <ChevronRight size={14}/></button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : !activeCase ? (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto pt-20">
                  <motion.div animate={{ rotate: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 4 }} className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-10 ${theme.accent} shadow-2xl shadow-amber-500/20`}><Scale size={48}/></motion.div>
                  <h3 className="text-4xl font-black uppercase tracking-tighter text-slate-900 mb-4">Legal Hub</h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-12 font-medium">Connect to a reasoning module to begin legal advisory or courtroom simulation.</p>
                  <div className="flex flex-col gap-4 w-full px-8">
                    <button onClick={() => startNewCase('General')} className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl ${theme.accent} active:scale-95 transition-all`}>Advisory Node</button>
                    <button onClick={() => startNewCase('Mock Trial')} className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest bg-slate-900 text-white shadow-xl active:scale-95 transition-all">Trial Simulation</button>
                    {!usageStats.isPremium && (
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-4 flex items-center justify-center gap-2">
                        <Star size={12}/> {FREE_QUESTION_LIMIT - usageStats.questionsUsed} Inquiries Available
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-12 pb-32">
                  {/* Integrated Courtroom Visual for Mock Trials */}
                  {activeCase.category === 'Mock Trial' && (
                    <CourtroomScene currentSpeaker={currentSpeaker as any} exhibits={activeCase.exhibits} />
                  )}

                  {activeCase.messages.map(m => (
                    <div key={m.id} className={`flex flex-col gap-4 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`max-w-[95%] p-8 relative overflow-hidden ${m.role === 'user' ? (isIOS ? 'bg-[#007AFF] text-white rounded-[2rem] rounded-tr-none shadow-lg' : 'bg-slate-900 text-white rounded-[2rem] rounded-tr-none shadow-xl') : (m.isVerdict ? 'bg-emerald-50 border-2 border-emerald-500 rounded-[2rem] shadow-xl shadow-emerald-500/10' : m.isRuling ? 'bg-amber-50 border-l-8 border-amber-500 rounded-r-[2rem]' : theme.card)} shadow-sm group`}>
                        <div className="flex items-center justify-between mb-6 text-[9px] font-black uppercase tracking-widest opacity-40">
                          <div className="flex items-center gap-2">
                            {m.role === 'user' ? <Users size={12}/> : (m.isVerdict ? <Award size={12} className="text-emerald-600"/> : m.isRuling ? <Gavel size={12}/> : <ShieldCheck size={12}/>)} 
                            {m.role === 'user' ? 'Client Testimony' : (m.isVerdict ? 'Court Verdict' : m.isRuling ? 'Judicial Ruling' : 'VirtuLaw Node')}
                          </div>
                          <div className="flex items-center gap-4">
                            <button aria-label="Copy" onClick={() => handleCopy(m.content, m.id)} className="hover:opacity-100 transition-opacity">
                              {copySuccessId === m.id ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Copy size={12}/>}
                            </button>
                            <button aria-label="Read" onClick={() => handleReadAloud(m.content, m.id)} className="hover:opacity-100 transition-opacity"><Volume2 size={12}/></button>
                          </div>
                        </div>
                        {m.isThinking && m.role === 'assistant' && !m.content ? (
                          <div className="flex items-center gap-3 text-slate-400 font-bold text-sm italic">
                            <Loader2 className="animate-spin" size={16}/> Node is reasoning...
                          </div>
                        ) : (
                          <div className="prose prose-slate leading-relaxed font-medium text-sm md:text-base selection:bg-blue-200 overflow-x-hidden">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                            {m.isStreaming && <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity }} className="inline-block w-2 h-5 bg-blue-500 ml-1 translate-y-1" />}
                          </div>
                        )}
                        {m.sources && m.sources.length > 0 && (
                          <div className="mt-8 pt-6 border-t border-slate-100/50">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 block">Legal Grounding & Citations</span>
                            <div className="flex flex-wrap gap-2">
                              {m.sources.map((s, idx) => (
                                <a key={idx} href={s.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold text-blue-600 hover:bg-blue-600 hover:text-white transition-all">
                                  <ExternalLink size={10} /> {s.title}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                      {m.tacticalTip && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[85%] bg-blue-50/50 border border-blue-100 rounded-[2rem] p-8 ml-8 flex gap-6 items-start shadow-sm backdrop-blur-sm">
                          <div className="p-4 bg-blue-600 text-white rounded-2xl flex-shrink-0 shadow-lg shadow-blue-500/20"><Lightbulb size={24}/></div>
                          <div><span className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-2 block">Strategic Feedback</span><p className="text-sm text-blue-950 font-bold leading-relaxed">{m.tacticalTip}</p></div>
                        </motion.div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} className="h-20" />
                </div>
              )}
            </div>

            {activeCase && currentView !== 'library' && (
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-none safe-bottom z-20">
                <div className="max-w-3xl mx-auto space-y-4 pointer-events-auto">
                  <AnimatePresence>
                    {isTagInputVisible && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="p-4 bg-white border-2 border-slate-300 rounded-[1.5rem] shadow-2xl flex gap-3">
                        <input autoFocus value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTag(tagInput)} placeholder="New session tag..." className="flex-grow p-4 outline-none text-xs font-bold bg-slate-50 rounded-xl border border-slate-100" />
                        <button aria-label="Submit tag" onClick={() => handleAddTag(tagInput)} className="p-4 bg-slate-900 text-white rounded-xl"><PlusCircle size={18}/></button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {activeCase.category === 'Mock Trial' && activeCase.exhibits.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {activeCase.exhibits.map(e => (
                        <div key={e.id} className="flex-shrink-0 px-3 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border border-white/10 shadow-sm"><Bookmark size={12}/> EXHIBIT {e.name}</div>
                      ))}
                    </div>
                  )}
                  
                  <form onSubmit={handleSendMessage} className={`flex gap-3 p-4 bg-white border-2 border-slate-400 rounded-[2.5rem] shadow-[0_25px_60px_rgba(0,0,0,0.2)] items-end transition-all focus-within:ring-4 focus-within:ring-blue-100 focus-within:border-blue-600 relative`}>
                    <button aria-label="Mic" type="button" onClick={toggleSpeechRecognition} className={`p-4 rounded-full transition-all ${isRecording ? 'text-red-600 bg-red-50 animate-pulse scale-110' : 'text-slate-500 hover:text-blue-600'}`}>
                      {isRecording ? <Activity size={24} className="animate-spin" /> : <Mic size={24}/>}
                    </button>
                    {activeCase.category === 'Mock Trial' && (
                      <div className="flex items-center gap-1 border-x border-slate-200 px-2 mx-1">
                        <button 
                          aria-label="Objection"
                          type="button" 
                          onClick={() => { setIsObjectionModalOpen(true); triggerHaptic('impact'); }} 
                          className="p-3 rounded-full text-slate-600 hover:text-red-600 hover:bg-red-50 transition-all" 
                        >
                          <Gavel size={22}/>
                        </button>
                        <button 
                          aria-label="Exhibit"
                          type="button" 
                          onClick={() => { setIsExhibitModalOpen(true); triggerHaptic('impact'); }} 
                          className="p-3 rounded-full text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-all" 
                        >
                          <FileText size={22}/>
                        </button>
                        <button 
                          aria-label="Rest"
                          type="button" 
                          onClick={() => { 
                            handleSendMessage(undefined, "[COMMAND: REST CASE] I rest my case and request a formal verdict prediction based on today's simulation."); 
                            triggerHaptic('success'); 
                          }} 
                          className="p-3 rounded-full text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all" 
                        >
                          <Flag size={22}/>
                        </button>
                      </div>
                    )}
                    <textarea 
                      ref={textareaRef} 
                      rows={1} 
                      value={input} 
                      onChange={e => { 
                        setInput(e.target.value); 
                        e.target.style.height = 'auto'; 
                        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'; 
                      }} 
                      placeholder={isLoading ? "Advisor is thinking..." : "Ask a legal question..."} 
                      className="flex-grow p-4 outline-none text-base font-bold bg-transparent resize-none max-h-60 scrollbar-hide text-slate-900 placeholder:text-slate-400" 
                      onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} 
                    />
                    <button 
                      aria-label="Send"
                      type="submit" 
                      disabled={isLoading || !input.trim()} 
                      className={`p-4 rounded-full transition-all min-w-[56px] h-[56px] flex items-center justify-center ${theme.accent} disabled:opacity-30 shadow-lg active:scale-95`}
                    >
                      {isLoading ? <Loader2 size={24} className="animate-spin"/> : <ChevronRight size={32}/>}
                    </button>
                  </form>
                  <div className="flex justify-center"><p className="text-[10px] text-slate-400 font-bold flex items-center gap-1"><Info size={10}/> AI Kernel Output. Standard Professional Disclaimer Applies.</p></div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <AnimatePresence>
        {errorMessage && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] ${errorMessage.includes("Granted") || errorMessage.includes("Restored") ? 'bg-emerald-600' : 'bg-red-600'} text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-4 shadow-2xl`}>
            {errorMessage.includes("Granted") ? <Check size={18}/> : <AlertCircle size={18}/>} {errorMessage}<button aria-label="Dismiss" onClick={() => setErrorMessage(null)} className="ml-4 p-1"><X size={14}/></button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isObjectionModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md" onClick={() => setIsObjectionModalOpen(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()} className="w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 relative">
              <button aria-label="Close" onClick={() => setIsObjectionModalOpen(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-900"><X size={20}/></button>
              <h3 className="text-xl font-black uppercase tracking-tight mb-6 flex items-center gap-3 text-slate-900"><Gavel className="text-red-500" /> Courtroom Objection</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Select Grounds</p>
              <div className="grid grid-cols-1 gap-3">
                {OBJECTION_GROUNDS.map(g => (
                  <button 
                    key={g} 
                    onClick={() => { 
                      setIsObjectionModalOpen(false); 
                      handleSendMessage(undefined, `[COMMAND: OBJECTION] Grounds: ${g}.`); 
                      triggerHaptic('impact');
                    }} 
                    className="p-5 text-left rounded-2xl bg-slate-50 border border-slate-100 text-slate-900 text-xs font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm flex items-center justify-between group active:scale-[0.98]"
                  >
                    {g}
                    <ChevronRight size={14} className="opacity-40 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExhibitModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md" onClick={() => setIsExhibitModalOpen(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()} className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 relative">
              <button aria-label="Close" onClick={() => setIsExhibitModalOpen(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-900"><X size={20}/></button>
              <h3 className="text-xl font-black uppercase tracking-tight mb-8 flex items-center gap-3 text-slate-900"><FileText className="text-emerald-500" /> Lodge Evidence</h3>
              <div className="space-y-6">
                <input value={exhibitForm.name} onChange={e => setExhibitForm({...exhibitForm, name: e.target.value})} placeholder="ID (e.g. EXHIBIT-A)" className="w-full p-5 bg-slate-50 rounded-2xl border border-slate-100 outline-none font-black uppercase text-xs tracking-widest text-slate-900 focus:border-emerald-200" />
                <textarea value={exhibitForm.content} onChange={e => setExhibitForm({...exhibitForm, content: e.target.value})} placeholder="Describe evidence contents..." rows={5} className="w-full p-5 bg-slate-50 rounded-2xl border border-slate-100 outline-none font-bold text-sm resize-none text-slate-900 focus:border-emerald-200" />
                <button onClick={handleAddExhibit} className="w-full py-5 rounded-2xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-600/20 active:scale-95 transition-all">Submit Evidence</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
