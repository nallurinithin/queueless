import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { Volume2, VolumeX, ShieldCheck, RefreshCw, Tv, Maximize2, Sparkles, User } from 'lucide-react';

export function WaitingRoomDisplay() {
  const { t, currentLang } = useTranslation();
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [broadcastEnabled, setBroadcastEnabled] = useState(true);
  const [showPatientName, setShowPatientName] = useState(true);
  const [announcementLanguage, setAnnouncementLanguage] = useState('en');
  const [clinicName, setClinicName] = useState('Aarogyam Community Clinic');
  const [nowServingList, setNowServingList] = useState([]);
  const [upNextList, setUpNextList] = useState([]);
  const [lastAnnouncement, setLastAnnouncement] = useState('');
  const announcedTokensRef = useRef(new Set());

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Web Audio Clinic Chime (Ding-Dong 🔔)
  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Note 1: E5 (659.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);

      // Note 2: C5 (523.25 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(523.25, now + 0.18);
      gain2.gain.setValueAtTime(0.3, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.75);
    } catch {}
  };

  // Speak announcement in chosen language
  const triggerVoiceAnnouncement = (item, langCode) => {
    playChime();

    setTimeout(() => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel(); // clear queue
        let text = '';
        let speechLang = 'en-IN';

        if (langCode === 'te') {
          speechLang = 'te-IN';
          text = item.patientName
            ? `టోకెన్ ${item.token}, ${item.patientName}, దయచేసి డాక్టర్ ${item.doctor} కోసం గది నంబర్ ${item.room} కి వెళ్లండి.`
            : `టోకెన్ ${item.token}, దయచేసి డాక్టర్ ${item.doctor} కోసం గది నంబర్ ${item.room} కి వెళ్లండి.`;
        } else if (langCode === 'hi') {
          speechLang = 'hi-IN';
          text = item.patientName
            ? `टोकन ${item.token}, ${item.patientName}, कृपया डॉक्टर ${item.doctor} के लिए कमरा नंबर ${item.room} में आएं।`
            : `टोकन ${item.token}, कृपया डॉक्टर ${item.doctor} के लिए कमरा नंबर ${item.room} में आएं।`;
        } else {
          speechLang = 'en-IN';
          text = item.patientName
            ? `Token ${item.token}, ${item.patientName}, please proceed to Room ${item.room} for ${item.doctor}.`
            : `Token ${item.token}, please proceed to Room ${item.room} for ${item.doctor}.`;
        }

        setLastAnnouncement(text);

        if (audioEnabled) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = speechLang;
          utterance.rate = 0.9;
          utterance.pitch = 1.0;
          window.speechSynthesis.speak(utterance);
        }
      } catch {}
    }, 450);
  };

  // Fetch live waiting room display data
  const fetchDisplayData = async () => {
    try {
      const res = await fetch('/api/v1/queue/display');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const isBroadcastActive = json.data.broadcastEnabled !== false;
          setBroadcastEnabled(isBroadcastActive);
          setShowPatientName(json.data.showPatientName !== false);
          const lang = json.data.announcementLanguage || 'en';
          setAnnouncementLanguage(lang);
          if (json.data.clinicName) setClinicName(json.data.clinicName);

          const serving = (json.data.nowServing || []).map((item) => ({
            token: item.token,
            patientName: item.patientName,
            room: item.roomNumber || '101',
            doctor: item.doctorName || 'Dr. Practitioner',
            dept: item.department || 'General Medicine',
            status: item.status || 'SERVING',
          }));

          setNowServingList(serving.length > 0 ? serving : [
            { token: 'A-11', room: '101', doctor: 'Dr. Suresh', dept: 'General Medicine', status: 'SERVING' },
            { token: 'B-04', room: '102', doctor: 'Dr. Ananya Rao', dept: 'Pediatrics', status: 'CALLED' },
          ]);

          setUpNextList(json.data.upNext && json.data.upNext.length > 0 ? json.data.upNext : ['A-12', 'A-13', 'B-05']);

          // Voice and ARIA Announcement trigger for newly called tokens
          serving.forEach((item) => {
            if (item.status === 'CALLED' && !announcedTokensRef.current.has(item.token)) {
              announcedTokensRef.current.add(item.token);
              triggerVoiceAnnouncement(item, lang);
            }
          });
        }
      }
    } catch {
      // Fallback display state if server unreachable
      if (nowServingList.length === 0) {
        setNowServingList([
          { token: 'A-11', room: '101', doctor: 'Dr. Suresh', dept: 'General Medicine', status: 'SERVING' },
          { token: 'B-04', room: '102', doctor: 'Dr. Ananya Rao', dept: 'Pediatrics', status: 'CALLED' },
        ]);
        setUpNextList(['A-12', 'A-13', 'B-05']);
      }
    }
  };

  useEffect(() => {
    fetchDisplayData();
    const interval = setInterval(fetchDisplayData, 4000);
    return () => clearInterval(interval);
  }, [audioEnabled, currentLang]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // If broadcast is disabled by receptionist
  if (!broadcastEnabled) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-8 select-none">
        {/* Hidden screen reader live region */}
        <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only" data-testid="aria-announcement">
          {lastAnnouncement}
        </div>

        <header className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center font-black text-xl">Q</div>
            <h1 className="text-xl font-bold">{clinicName}</h1>
          </div>
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="flex items-center space-x-2 text-xs text-slate-400 hover:text-white transition-colors bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg"
            aria-label="Toggle voice audio announcements"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            <span>Voice Audio: {audioEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </header>

        <main className="text-center my-auto py-12 space-y-4">
          <div className="w-20 h-20 bg-slate-900 border-2 border-slate-800 rounded-3xl flex items-center justify-center mx-auto text-slate-500">
            <Tv className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-200">Waiting Room TV Display Offline</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Live waiting room broadcast is currently paused by reception desk. Please listen for manual announcements or track your token on mobile.
          </p>
          <div className="pt-4">
            <button
              onClick={fetchDisplayData}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs rounded-xl border border-slate-800 inline-flex items-center"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              Check Status
            </button>
          </div>
        </main>

        <footer className="pt-4 border-t border-slate-900 text-center text-xs text-slate-600">
          QueueLess Smart Clinic Display System • Standby Mode
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 sm:p-10 select-none">
      {/* Screen Reader ARIA Live Region for Accessibility */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-testid="aria-announcement"
      >
        {lastAnnouncement}
      </div>

      {/* Top Header */}
      <header className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-800 pb-6 gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-teal-500 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">
            Q
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {clinicName || t('common.clinicName')}
            </h1>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-sm text-teal-400 font-medium">
                {t('display.waitingRoom')}
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-amber-400 uppercase tracking-wider font-semibold">
                Voice: {announcementLanguage === 'te' ? 'Telugu (తెలుగు)' : announcementLanguage === 'hi' ? 'Hindi (हिंदी)' : 'English'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="flex items-center space-x-2 text-xs text-slate-300 hover:text-white transition-colors bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl focus-visible:ring-2 focus-visible:ring-teal-500"
            aria-label="Toggle voice audio announcements"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
            <span className="font-semibold">Voice Audio: {audioEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl"
            title="Toggle TV Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fullscreen</span>
          </button>

          <div className="text-2xl sm:text-3xl font-mono font-bold text-slate-200 pl-2">
            {currentTime}
          </div>
        </div>
      </header>

      {/* Main Grid: NOW SERVING */}
      <main className="my-8">
        <div className="text-center mb-8 flex items-center justify-center space-x-3">
          <span className="text-base sm:text-xl font-black uppercase tracking-widest text-teal-300 bg-teal-950/80 px-8 py-2.5 rounded-full border border-teal-700/80 shadow-lg shadow-teal-950/50">
            {t('display.nowServing')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-7xl mx-auto">
          {nowServingList.map((item) => (
            <div
              key={item.token}
              className={`rounded-3xl p-8 border-2 flex flex-col items-center justify-center text-center transition-all ${
                item.status === 'CALLED'
                  ? 'bg-rose-950/50 border-rose-500 shadow-2xl shadow-rose-950 animate-pulse'
                  : 'bg-slate-900/90 border-slate-700 shadow-xl'
              }`}
            >
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span>{t('display.token')}</span>
                {item.status === 'CALLED' && (
                  <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-bounce">
                    CALLED
                  </span>
                )}
              </div>

              {/* Large High-Contrast Token */}
              <div className="text-6xl sm:text-7xl font-black text-white tracking-wider my-2 font-mono">
                {item.token}
              </div>

              {/* Patient Name (if enabled by receptionist) */}
              {item.patientName && (
                <div className="flex items-center justify-center space-x-1.5 text-xl sm:text-2xl font-black text-amber-300 mb-2">
                  <User className="w-5 h-5 text-amber-400 shrink-0" />
                  <span className="truncate max-w-[240px]">{item.patientName}</span>
                </div>
              )}

              <div className="w-full pt-4 border-t border-slate-800/80 space-y-1">
                <div className="text-2xl font-extrabold text-teal-300">
                  {t('display.room')} {item.room}
                </div>
                <div className="text-base font-semibold text-slate-200">
                  {item.doctor}
                </div>
                <div className="text-xs text-slate-400 font-medium">
                  {item.dept}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Up Next Ribbon */}
        <div className="mt-12 max-w-4xl mx-auto bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm font-bold uppercase tracking-wider text-slate-400">
            {t('display.nextInLine')}
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            {upNextList.map((tok) => (
              <span
                key={tok}
                className="px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 font-mono font-bold text-xl text-teal-200 shadow-xs"
              >
                {tok}
              </span>
            ))}
          </div>
        </div>
      </main>

      {/* Audio Enable Overlay Banner (If TV started muted) */}
      {!audioEnabled && (
        <div className="max-w-xl mx-auto mb-4 bg-emerald-950/80 border border-emerald-500/60 rounded-2xl p-4 flex items-center justify-between gap-4 text-emerald-200 shadow-xl">
          <div className="flex items-center space-x-3">
            <Volume2 className="w-6 h-6 text-emerald-400 shrink-0 animate-pulse" />
            <span className="text-xs sm:text-sm font-medium">
              Click to unlock voice speech announcements on this TV.
            </span>
          </div>
          <button
            onClick={() => {
              setAudioEnabled(true);
              playChime();
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shrink-0"
          >
            Enable Audio
          </button>
        </div>
      )}

      {/* Privacy Notice Footer */}
      <footer className="pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>{t('display.privacyNotice')}</span>
        </div>
        <div className="text-slate-600">
          Receptionist Controlled Broadcast • Real-time Chime & Voice
        </div>
      </footer>
    </div>
  );
}
