import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  MessageSquare,
  BookOpen,
  Settings,
  Send,
  RotateCcw,
  Key,
  CheckCircle2,
  ArrowRight,
  Headphones,
  Flame,
  Globe,
  Play
} from 'lucide-react';

const TOPICS = [
  { id: 'casual', label: 'Casual Daily Chat', prompt: 'Casual everyday life, hobbies, movies, music, and how our day is going' },
  { id: 'tech', label: 'Tech & Coding', prompt: 'Software development, web apps, AI, and building cool projects' },
  { id: 'finance', label: 'Markets & Finance', prompt: 'Stock market trends, investing ideas, business news, and personal finance' },
  { id: 'cars', label: 'Cars & Road Trips', prompt: 'Luxury SUVs, dream cars like the BMW X7, night highway drives, and travel' },
  { id: 'interview', label: 'Job & Interview Prep', prompt: 'Software engineering interviews, project pitches, and confident professional communication' }
];

const MODES = [
  { id: 'flow', label: 'Just Chat (Flow Mode)', desc: 'Natural conversation first. Only log tips silently in the side panel.' },
  { id: 'gentle', label: 'Gentle Partner', desc: 'Keep the chat flowing warmly and gently mention 1 natural phrasing upgrade when helpful.' },
  { id: 'coach', label: 'Active Coach', desc: 'Actively polish my grammar, vocabulary, and sentence structure on every turn.' }
];

const FEMALE_VOICES = [
  { id: 'Aoede', label: 'Aoede (Warm & Expressive)' },
  { id: 'Kore', label: 'Kore (Clear & Friendly)' },
  { id: 'Leda', label: 'Leda (Calm & Articulate)' }
];

// Convert raw PCM16 base64 from Gemini TTS to playable WAV Blob URL
function pcmBase64ToWavUrl(base64Pcm, sampleRate = 24000) {
  const binaryString = atob(base64Pcm);
  const pcmLength = binaryString.length;
  const buffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmLength, true);

  const bytes = new Uint8Array(buffer, 44);
  for (let i = 0; i < pcmLength; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export default function App() {
  const [apiKey, setApiKey] = useState(
    () => import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('aria_gemini_api_key') || ''
  );
  const [showKeyModal, setShowKeyModal] = useState(false);

  const [selectedTopic, setSelectedTopic] = useState(TOPICS[0]);
  const [customTopic, setCustomTopic] = useState('');
  const [selectedMode, setSelectedMode] = useState(MODES[1]);
  const [selectedVoice, setSelectedVoice] = useState(FEMALE_VOICES[0].id);
  const [speechSpeed, setSpeechSpeed] = useState(1.0);
  const [HandsFreeMode, setHandsFreeMode] = useState(true);
  const [muted, setMuted] = useState(false);

  const [status, setStatus] = useState('idle'); // 'idle' | 'listening' | 'thinking' | 'speaking'
  const [liveTranscript, setLiveTranscript] = useState('');
  const [textInput, setTextInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      reply: "Hey! I'm Aria, your personal English speaking partner. Tap 'Start Talking' and tell me about your day, or pick any topic you'd like to chat about!",
      betterWay: null,
      grammarTip: null,
      vocabSpotlight: {
        word: 'Articulate',
        meaning: 'Able to express thoughts and feelings clearly and effectively.'
      }
    }
  ]);
  const [learningCards, setLearningCards] = useState([]);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'upgrades' | 'settings'

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const audioRef = useRef(new Audio());
  const chatEndRef = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscript]);

  // Pre-load Web Speech voices
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const saveApiKey = (val) => {
    setApiKey(val);
    localStorage.setItem('aria_gemini_api_key', val);
  };

  // Pick a natural female voice from browser Web Speech API as instant fallback
  const speakWithBrowserFemaleVoice = (text, onEndCallback) => {
    if (!('speechSynthesis' in window) || muted) {
      onEndCallback?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechSpeed;
    utterance.pitch = 1.08;

    const voices = window.speechSynthesis.getVoices();
    const preferredFemale = voices.find((v) =>
      /Zira|Samantha|Victoria|Aria|Jenny|Google UK English Female|Google US English|Female/i.test(v.name) &&
      /en/i.test(v.lang)
    ) || voices.find((v) => /en/i.test(v.lang));

    if (preferredFemale) {
      utterance.voice = preferredFemale;
    }

    utterance.onend = () => onEndCallback?.();
    utterance.onerror = () => onEndCallback?.();
    window.speechSynthesis.speak(utterance);
  };

  // Speak using Gemini TTS female voice with automatic browser voice fallback
  const speakResponse = async (text) => {
    if (muted) {
      setStatus('idle');
      if (HandsFreeMode) startListening();
      return;
    }

    setStatus('speaking');

    const finishSpeaking = () => {
      setStatus('idle');
      if (HandsFreeMode) {
        setTimeout(() => startListening(), 350);
      }
    };

    if (!apiKey) {
      speakWithBrowserFemaleVoice(text, finishSpeaking);
      return;
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Speak in a warm, friendly, natural young woman's conversational voice: ${text}` }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: selectedVoice }
                }
              }
            }
          })
        }
      );

      if (!res.ok) throw new Error('Gemini TTS fallback to Web Speech');
      const data = await res.json();
      const base64Audio = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) throw new Error('No audio bytes returned');

      const wavUrl = pcmBase64ToWavUrl(base64Audio, 24000);
      audioRef.current.src = wavUrl;
      audioRef.current.playbackRate = speechSpeed;
      audioRef.current.onended = () => {
        URL.revokeObjectURL(wavUrl);
        finishSpeaking();
      };
      audioRef.current.onerror = () => {
        speakWithBrowserFemaleVoice(text, finishSpeaking);
      };
      await audioRef.current.play();
    } catch {
      speakWithBrowserFemaleVoice(text, finishSpeaking);
    }
  };

  const stopAllAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support Speech Recognition. Please use Chrome or Edge, or type below.');
      return;
    }

    stopAllAudio();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    let accumulatedTranscript = '';

    recognition.onstart = () => {
      setStatus('listening');
      setLiveTranscript('');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';

      for (let i = 0; i < event.results.length; i++) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcriptPiece + ' ';
        } else {
          interim += transcriptPiece;
        }
      }

      accumulatedTranscript = (finalText + interim).trim();
      setLiveTranscript(accumulatedTranscript);

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (accumulatedTranscript.length > 1) {
        silenceTimerRef.current = setTimeout(() => {
          recognition.stop();
          handleUserMessage(accumulatedTranscript);
        }, 1700);
      }
    };

    recognition.onerror = () => {
      if (statusRef.current === 'listening') {
        setStatus('idle');
      }
    };

    recognition.onend = () => {
      if (statusRef.current === 'listening' && !accumulatedTranscript) {
        setStatus('idle');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    stopAllAudio();
    setStatus('idle');
  };

  const handleUserMessage = async (userText) => {
    const cleaned = userText.trim();
    if (!cleaned) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setLiveTranscript('');
    setStatus('thinking');

    const updatedMessages = [...messages, { role: 'user', text: cleaned }];
    setMessages(updatedMessages);

    const activeTopicDescription = customTopic.trim() ? customTopic.trim() : selectedTopic.prompt;

    // Offline smart conversational fallback if user hasn't entered a Gemini API key yet
    if (!apiKey) {
      setTimeout(() => {
        const demoReply = {
          role: 'assistant',
          reply: `That's a really interesting point about "${cleaned.slice(0, 45)}". Tell me a bit more—what made you think of that, or how do you usually approach it? (Tip: Add your free Gemini API key in the top bar for full AI coaching!)`,
          betterWay: `A native speaker might also say: "From my perspective, ${cleaned.charAt(0).toLowerCase() + cleaned.slice(1)}."`,
          grammarTip: 'Try connecting your ideas with transitional phrases like "On top of that" or "What stood out to me was..."',
          vocabSpotlight: {
            word: 'Perspective',
            meaning: 'A particular attitude toward or way of regarding something; a point of view.'
          }
        };
        setMessages((prev) => [...prev, demoReply]);
        setLearningCards((prev) => [
          { original: cleaned, ...demoReply, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
          ...prev
        ]);
        speakResponse(demoReply.reply);
      }, 650);
      return;
    }

    try {
      const historyContext = updatedMessages
        .slice(-8)
        .map((m) => (m.role === 'user' ? `User: ${m.text}` : `Aria: ${m.reply}`))
        .join('\n');

      const systemPrompt = `You are Aria, an intelligent, warm, encouraging young female English conversation partner and personal fluency coach.
Current topic preference: ${activeTopicDescription}.
Coaching mode: ${selectedMode.label} (${selectedMode.desc}).

Rules for your response:
1. Respond naturally like a close, supportive friend speaking out loud on a voice call (2 to 3 sentences max so the voice conversation stays snappy and interactive).
2. Always end your spoken reply with an engaging follow-up question to keep the user talking.
3. Also analyze the user's latest message ("${cleaned}") and return JSON with this exact schema:
{
  "reply": "Your warm spoken response (plain conversational text, no markdown)",
  "betterWay": "A more natural, fluent, or native-sounding way to express what the user just said (or null if their phrasing was already super natural)",
  "grammarTip": "A brief, friendly 1-sentence tip if there was a grammar/word-choice mistake, or null",
  "vocabSpotlight": {
    "word": "One useful English word or idiom related to what you're discussing",
    "meaning": "Simple 1-sentence definition and how to use it"
  }
}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: `Conversation so far:\n${historyContext}\n\nRespond in JSON.` }] }],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );

      const data = await response.json();
      const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(rawJson);

      const assistantMsg = {
        role: 'assistant',
        reply: parsed.reply || "I loved hearing that! Could you tell me a little more about what you mean?",
        betterWay: parsed.betterWay || null,
        grammarTip: parsed.grammarTip || null,
        vocabSpotlight: parsed.vocabSpotlight || null
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (assistantMsg.betterWay || assistantMsg.grammarTip || assistantMsg.vocabSpotlight) {
        setLearningCards((prev) => [
          {
            original: cleaned,
            betterWay: assistantMsg.betterWay,
            grammarTip: assistantMsg.grammarTip,
            vocabSpotlight: assistantMsg.vocabSpotlight,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          },
          ...prev
        ]);
      }

      speakResponse(assistantMsg.reply);
    } catch (error) {
      const fallbackMsg = {
        role: 'assistant',
        reply: "I heard you! Let's keep going—tell me more about your thoughts on this.",
        betterWay: null,
        grammarTip: null,
        vocabSpotlight: null
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      speakResponse(fallbackMsg.reply);
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const msg = textInput;
    setTextInput('');
    handleUserMessage(msg);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 lg:px-8 py-3.5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-pink-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
            <Headphones className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight text-white">Aria</h1>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
                AI English Voice Partner
              </span>
            </div>
            <p className="text-xs text-slate-400">Learn English your own way by talking about any topic</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMuted(!muted)}
            className={`p-2.5 rounded-xl border transition ${
              muted
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title={muted ? 'Unmute Aria' : 'Mute Aria'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowKeyModal(true)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition ${
              apiKey
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            {apiKey ? 'Gemini Key Active' : 'Set Gemini API Key'}
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 lg:p-6">
        {/* Left Column: Interactive Female Voice Orb & Controls */}
        <section className="lg:col-span-5 flex flex-col justify-between bg-slate-900/60 border border-slate-800/90 rounded-3xl p-6 relative overflow-hidden">
          {/* Topic Selector Pill Bar */}
          <div className="space-y-3 z-10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-fuchsia-400" /> Conversation Topic
              </span>
              <span className="text-xs text-slate-400">{selectedMode.label}</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTopic(t);
                    setCustomTopic('');
                  }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    !customTopic && selectedTopic.id === t.id
                      ? 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-200 font-medium'
                      : 'bg-slate-800/60 border-slate-700/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Or type any custom topic (e.g. movies, startups, cricket, college fest)..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-500"
            />
          </div>

          {/* Center Animated Voice Orb */}
          <div className="my-8 flex flex-col items-center justify-center z-10">
            <div className="relative flex items-center justify-center">
              {/* Outer pulse rings */}
              {status !== 'idle' && (
                <>
                  <span
                    className={`absolute w-52 h-52 rounded-full animate-ping opacity-20 ${
                      status === 'listening'
                        ? 'bg-emerald-400'
                        : status === 'speaking'
                        ? 'bg-fuchsia-500'
                        : 'bg-amber-400'
                    }`}
                  />
                  <span
                    className={`absolute w-44 h-44 rounded-full animate-pulse opacity-30 ${
                      status === 'listening'
                        ? 'bg-emerald-500'
                        : status === 'speaking'
                        ? 'bg-violet-500'
                        : 'bg-amber-500'
                    }`}
                  />
                </>
              )}

              <button
                onClick={() => (status === 'listening' || status === 'speaking' ? stopListening() : startListening())}
                className={`relative w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl ${
                  status === 'listening'
                    ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-emerald-500/40 scale-105'
                    : status === 'speaking'
                    ? 'bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-pink-500 shadow-fuchsia-500/50 scale-105'
                    : status === 'thinking'
                    ? 'bg-gradient-to-tr from-amber-500 to-orange-500 shadow-amber-500/30'
                    : 'bg-gradient-to-tr from-slate-800 to-slate-700 hover:from-violet-600 hover:to-fuchsia-600 border border-slate-600'
                }`}
              >
                {status === 'listening' ? (
                  <Mic className="w-10 h-10 text-white animate-bounce" />
                ) : status === 'speaking' ? (
                  <Volume2 className="w-10 h-10 text-white animate-pulse" />
                ) : (
                  <Mic className="w-10 h-10 text-white" />
                )}
                <span className="mt-2 text-xs font-semibold tracking-wide text-white/90">
                  {status === 'listening'
                    ? 'Listening...'
                    : status === 'speaking'
                    ? 'Aria Speaking'
                    : status === 'thinking'
                    ? 'Thinking...'
                    : 'Start Talking'}
                </span>
              </button>
            </div>

            {/* Live Speech Preview */}
            <div className="mt-6 min-h-[48px] text-center px-4">
              {liveTranscript ? (
                <p className="text-sm text-emerald-300 italic">"{liveTranscript}"</p>
              ) : (
                <p className="text-xs text-slate-400">
                  {status === 'listening'
                    ? 'Speak naturally in English — pause when you finish your thought.'
                    : status === 'speaking'
                    ? 'Tap the orb anytime to interrupt or jump in.'
                    : 'Click the orb to talk hands-free, or type a message on the right.'}
                </p>
              )}
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="space-y-3 border-t border-slate-800/80 pt-4 z-10">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Hands-Free Auto-Listen</span>
              <button
                onClick={() => setHandsFreeMode(!HandsFreeMode)}
                className={`px-3 py-1 rounded-full font-medium transition ${
                  HandsFreeMode
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {HandsFreeMode ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Aria Voice Style</span>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-fuchsia-500"
              >
                {FEMALE_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Right Column: Conversation & Live English Coaching */}
        <section className="lg:col-span-7 flex flex-col bg-slate-900/60 border border-slate-800/90 rounded-3xl overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 px-5 pt-3">
            <div className="flex gap-5">
              <button
                onClick={() => setActiveTab('chat')}
                className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'chat'
                    ? 'border-fuchsia-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-fuchsia-400" />
                Live Conversation
              </button>

              <button
                onClick={() => setActiveTab('upgrades')}
                className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'upgrades'
                    ? 'border-fuchsia-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                Phrasing & Vocab ({learningCards.length})
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'settings'
                    ? 'border-fuchsia-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Settings className="w-4 h-4 text-violet-400" />
                Coaching Style
              </button>
            </div>

            <button
              onClick={() =>
                setMessages([
                  {
                    role: 'assistant',
                    reply: "Fresh start! What would you like to talk about right now?",
                    betterWay: null,
                    grammarTip: null,
                    vocabSpotlight: null
                  }
                ])
              }
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 pb-3"
              title="Reset Conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col justify-between p-5 overflow-hidden">
              <div className="space-y-4 overflow-y-auto pr-2 max-h-[420px]">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-fuchsia-600 text-white rounded-br-none'
                          : 'bg-slate-800/90 text-slate-100 border border-slate-700/70 rounded-bl-none'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-75">
                          {m.role === 'user' ? 'You' : 'Aria'}
                        </span>
                        {m.role === 'assistant' && (
                          <button
                            onClick={() => speakResponse(m.reply)}
                            className="text-xs text-fuchsia-300 hover:text-white flex items-center gap-1"
                            title="Replay Aria's voice"
                          >
                            <Play className="w-3 h-3" /> Replay
                          </button>
                        )}
                      </div>
                      <p>{m.role === 'user' ? m.text : m.reply}</p>

                      {/* Inline Coaching Card inside Chat when not in Flow-only mode */}
                      {m.role === 'assistant' && selectedMode.id !== 'flow' && (m.betterWay || m.grammarTip) && (
                        <div className="mt-3 pt-2.5 border-t border-slate-700/80 text-xs space-y-1.5">
                          {m.betterWay && (
                            <p className="text-emerald-300 flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>
                                <strong>Natural Upgrade:</strong> {m.betterWay}
                              </span>
                            </p>
                          )}
                          {m.grammarTip && (
                            <p className="text-amber-300 flex items-start gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>
                                <strong>Tip:</strong> {m.grammarTip}
                              </span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Text Input Bar */}
              <form onSubmit={handleTextSubmit} className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type in English if you're in a quiet place, or use the mic..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-medium text-sm flex items-center gap-1.5 shadow-lg shadow-fuchsia-600/20"
                >
                  <Send className="w-4 h-4" /> Send
                </button>
              </form>
            </div>
          )}

          {activeTab === 'upgrades' && (
            <div className="p-5 space-y-4 overflow-y-auto max-h-[480px]">
              {learningCards.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  Start talking with Aria! Every time you speak, she will collect natural phrasing upgrades and vocabulary words for you here.
                </div>
              ) : (
                learningCards.map((card, i) => (
                  <div key={i} className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Your sentence</span>
                      <span>{card.timestamp}</span>
                    </div>
                    <p className="text-slate-300 italic">"{card.original}"</p>
                    {card.betterWay && (
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-emerald-400">Native Upgrade: </span>
                          {card.betterWay}
                        </div>
                        <button
                          onClick={() => speakWithBrowserFemaleVoice(card.betterWay)}
                          className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200"
                          title="Listen to pronunciation"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {card.grammarTip && (
                      <p className="text-amber-300">
                        <strong>Grammar Note:</strong> {card.grammarTip}
                      </p>
                    )}
                    {card.vocabSpotlight && (
                      <div className="pt-2 border-t border-slate-800 text-fuchsia-300">
                        <strong>Word Spotlight — {card.vocabSpotlight.word}:</strong> {card.vocabSpotlight.meaning}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="p-5 space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Choose How Aria Coaches You
                </h3>
                <div className="space-y-2.5">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMode(m)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition ${
                        selectedMode.id === m.id
                          ? 'bg-fuchsia-500/15 border-fuchsia-500 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold text-sm">{m.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-400 font-medium">Aria Speaking Speed ({speechSpeed}x)</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.25"
                  step="0.05"
                  value={speechSpeed}
                  onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                  className="w-full accent-fuchsia-500"
                />
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Gemini API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-fuchsia-400" /> Gemini API Key
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Enter your free Google Gemini API key to unlock Aria's full AI conversation brain and natural Gemini TTS female voices (`Aoede`, `Kore`, `Leda`). Your key is stored only in your browser's local storage or `.env` file.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-fuchsia-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-semibold"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
