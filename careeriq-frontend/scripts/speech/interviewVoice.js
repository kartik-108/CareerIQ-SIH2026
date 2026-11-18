const VOICE_PREFERENCE_KEY = 'careeriq:interview-voice-preferences';
const FEMALE_VOICE_HINTS = ['female', 'samantha', 'victoria', 'zira', 'hazel', 'aria', 'jenny', 'susan', 'karen', 'moira', 'google uk english female', 'raveena', 'veena'];

function readPreferences() {
  try { return { rate: 0.98, pitch: 1.02, volume: 1, muted: false, voiceName: '', ...JSON.parse(localStorage.getItem(VOICE_PREFERENCE_KEY) || '{}') }; } catch { return { rate: 0.98, pitch: 1.02, volume: 1, muted: false, voiceName: '' }; }
}
function savePreferences(preferences) { try { localStorage.setItem(VOICE_PREFERENCE_KEY, JSON.stringify(preferences)); } catch { /* Voice still works when storage is unavailable. */ } }

export class InterviewVoice {
  constructor({ language = 'en-IN', onSpeakingChange, onUnavailable } = {}) {
    this.language = language;
    this.onSpeakingChange = onSpeakingChange;
    this.onUnavailable = onUnavailable;
    this.synthesis = window.speechSynthesis || null;
    this.utterance = null;
    this.speaking = false;
    this.preferences = readPreferences();
    this.voice = null;
    this.voices = [];
    this.pendingResolve = null;
    this.voiceReady = this.loadVoices();
  }

  async loadVoices() {
    if (!this.synthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
      this.onUnavailable?.();
      return [];
    }
    const read = () => { this.voices = this.synthesis.getVoices?.() || []; if (this.voices.length) this.selectVoice(); return this.voices; };
    if (read().length) return this.voices;
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); this.synthesis.removeEventListener?.('voiceschanged', finish); resolve(read()); };
      const timer = setTimeout(finish, 1000);
      this.synthesis.addEventListener?.('voiceschanged', finish);
      this.synthesis.getVoices?.();
    });
  }

  selectVoice(name = this.preferences.voiceName) {
    const englishVoices = this.voices.filter((voice) => /^en(-|_)/i.test(voice.lang || ''));
    const selected = englishVoices.find((voice) => voice.name === name)
      || [...englishVoices].sort((first, second) => this.voiceScore(second) - this.voiceScore(first))[0]
      || this.voices[0]
      || null;
    this.voice = selected;
    if (selected) { this.preferences.voiceName = selected.name; savePreferences(this.preferences); }
    return selected;
  }

  voiceScore(voice) {
    const name = voice.name.toLowerCase();
    return (voice.lang?.toLowerCase() === 'en-in' ? 40 : 0) + (name.includes('india') ? 30 : 0) + (FEMALE_VOICE_HINTS.some((hint) => name.includes(hint)) ? 20 : 0) + (voice.localService ? 2 : 0);
  }

  getVoices() { return [...this.voices]; }
  getPreferences() { return { ...this.preferences }; }
  setPreferences(next) { this.preferences = { ...this.preferences, ...next }; savePreferences(this.preferences); if (next.voiceName) this.selectVoice(next.voiceName); }

  async speakQuestion(text) {
    const content = String(text || '').trim();
    if (!content) return false;
    if (this.isMuted()) return false;
    if (!this.synthesis || typeof window.SpeechSynthesisUtterance === 'undefined') { this.onUnavailable?.(); return false; }
    await this.voiceReady;
    this.stop();
    this.selectVoice();
    return new Promise((resolve, reject) => {
      const utterance = new window.SpeechSynthesisUtterance(content);
      utterance.lang = this.voice?.lang || this.language;
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = Number(this.preferences.rate) || 0.98;
      utterance.pitch = Number(this.preferences.pitch) || 1.02;
      utterance.volume = Number(this.preferences.volume) || 1;
      this.utterance = utterance;
      this.speaking = true;
      this.onSpeakingChange?.(true);
      const finish = (error = null) => {
        if (this.utterance !== utterance) return;
        this.utterance = null;
        this.pendingResolve = null;
        this.speaking = false;
        this.onSpeakingChange?.(false);
        if (error) reject(error); else resolve(true);
      };
      utterance.onend = () => finish();
      utterance.onerror = (event) => finish(new Error(event.error || 'Voice playback failed'));
      this.pendingResolve = (value) => finish() || value;
      try { this.synthesis.speak(utterance); } catch (error) { finish(error); }
    });
  }

  speak(text) { return this.speakQuestion(text).catch(() => false); }

  stop() {
    this.synthesis?.cancel();
    const resolvePending = this.pendingResolve;
    this.pendingResolve = null;
    resolvePending?.(false);
    if (this.speaking) { this.speaking = false; this.onSpeakingChange?.(false); }
    this.utterance = null;
  }

  pause() {
    if (!this.synthesis || !this.speaking) return;
    this.synthesis.pause();
  }

  resume() {
    if (!this.synthesis || !this.speaking) return;
    this.synthesis.resume();
  }

  isSpeaking() {
    return this.speaking;
  }

  setMuted(muted) {
    this.preferences.muted = Boolean(muted);
    savePreferences(this.preferences);
    if (this.preferences.muted) this.stop();
  }

  isMuted() { return Boolean(this.preferences.muted); }
}
