const FILLERS = ['um', 'uh', 'like', 'basically', 'actually', 'literally'];
const FILLER_PATTERN = new RegExp(`\\b(${FILLERS.join('|')})\\b`, 'gi');
const MIN_PAUSE_MS = 700;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

function countFillers(transcript) {
  return transcript.match(FILLER_PATTERN)?.length || 0;
}

function calculateAverageSentenceLength(transcript, wordCount) {
  const sentences = transcript.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean);
  return sentences.length ? Math.round(wordCount / sentences.length) : wordCount;
}

export class SpeechAnalyzer {
  constructor({ onUpdate, onFinal, onError, language = 'en-US' } = {}) {
    this.onUpdate = onUpdate;
    this.onFinal = onFinal;
    this.onError = onError;
    this.language = language;
    this.recognition = null;
    this.updateInterval = null;
    this.finalText = '';
    this.interimText = '';
    this.startedAt = 0;
    this.lastSpeechAt = 0;
    this.pauseDurationMs = 0;
    this.lastResultIndex = 0;
    this.running = false;
  }

  start() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return false;
    this.stop();
    this.finalText = '';
    this.interimText = '';
    this.pauseDurationMs = 0;
    this.recognition = new Recognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.language;
    this.startedAt = Date.now();
    this.lastSpeechAt = this.startedAt;
    this.running = true;
    this.recognition.onresult = (event) => this.handleResult(event);
    this.recognition.onerror = (event) => this.onError?.(event);
    this.recognition.onend = () => {
      if (!this.running) return;
      try { this.recognition.start(); } catch { /* Chrome can still be closing the previous recognition session. */ }
    };
    this.recognition.start();
    this.updateInterval = setInterval(() => this.emit(), 1000);
    this.emit();
    return true;
  }

  handleResult(event) {
    let interim = '';
    let receivedSpeech = false;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) {
        this.finalText += `${result[0].transcript.trim()} `;
        receivedSpeech = true;
      } else {
        interim += result[0].transcript;
        receivedSpeech = true;
      }
    }
    const now = Date.now();
    if (receivedSpeech) {
      const gap = now - this.lastSpeechAt;
      if (gap >= MIN_PAUSE_MS) this.pauseDurationMs += gap;
      this.lastSpeechAt = now;
    }
    this.interimText = interim;
    this.emit();
  }

  buildMetrics() {
    const now = Date.now();
    const transcript = `${this.finalText}${this.interimText}`.trim();
    const words = transcript ? transcript.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const currentPause = this.running && now - this.lastSpeechAt >= MIN_PAUSE_MS ? now - this.lastSpeechAt : 0;
    const pauseDuration = (this.pauseDurationMs + currentPause) / 1000;
    const speechDuration = Math.max(0, (now - this.startedAt - this.pauseDurationMs - currentPause) / 1000);
    const wpm = speechDuration > 0 ? Math.round(wordCount / speechDuration * 60) : 0;
    const fillers = countFillers(transcript);
    const averageSentenceLength = calculateAverageSentenceLength(transcript, wordCount);
    const paceScore = wpm === 0 ? 0 : clamp(100 - Math.abs(wpm - 135) * 0.65);
    const fillerScore = clamp(100 - fillers * 5);
    const clarity = clamp(fillerScore * 0.65 + paceScore * 0.35);
    const confidence = clamp(clarity * 0.7 + (pauseDuration < speechDuration * 0.35 ? 30 : 15));
    return {
      transcript,
      wpm,
      fillers,
      pauseDuration: Number(pauseDuration.toFixed(1)),
      speechDuration: Number(speechDuration.toFixed(1)),
      confidence,
      clarity,
      wordCount,
      averageSentenceLength,
      // Existing Interview Studio/backend aliases.
      wordsPerMinute: wpm,
      speakingDuration: speechDuration,
      speakingPace: clamp(wpm / 1.8),
      clarityScore: clarity,
    };
  }

  emit() {
    const metrics = this.buildMetrics();
    this.onUpdate?.(metrics);
    return metrics;
  }

  stop() {
    this.running = false;
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.updateInterval = null;
    this.recognition?.stop();
    this.recognition = null;
    this.interimText = '';
    this.onFinal?.({ transcript: this.finalText.trim(), metrics: this.buildMetrics() });
    return { transcript: this.finalText.trim(), metrics: this.buildMetrics() };
  }

  getMetrics() { return this.buildMetrics(); }
}

export function highlightFillers(transcript = '') {
  const escaped = transcript.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  return escaped.replace(FILLER_PATTERN, '<mark class="speech-filler">$1</mark>');
}

export { FILLERS };
