// Voice Guidance Service using Web Speech API (Client-Side Audio Directions)
// Synthesizes driving turn-by-turn prompts (e.g. "In 200 meters, turn right onto Main Road")

let lastSpokenText = '';
let lastSpokenTime = 0;

export function speakInstruction(text: string, force = false): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  const now = Date.now();
  // Prevent stutter / repeat within 4 seconds unless forced
  if (!force && text === lastSpokenText && now - lastSpokenTime < 4000) {
    return;
  }

  try {
    window.speechSynthesis.cancel(); // cancel pending utterances
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Prefer English voices if available
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find((v) => v.lang.startsWith('en') && !v.name.includes('Google'));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    lastSpokenText = text;
    lastSpokenTime = now;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Voice guidance speech error:', err);
  }
}

export function cancelSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}
