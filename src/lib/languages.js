// Languages offered across Voice Mode, dictation, and the advisor's replies.
// `code` is a BCP-47 tag used for speech recognition + TTS voice matching;
// `say` is how we tell the LLM which language to respond in.
export const LANGUAGES = [
  { code: 'en-US', label: 'English', say: 'English' },
  { code: 'fil-PH', label: 'Tagalog / Filipino', say: 'Tagalog (Filipino)' },
  { code: 'es-ES', label: 'Spanish', say: 'Spanish' },
  { code: 'pt-BR', label: 'Portuguese', say: 'Portuguese' },
  { code: 'fr-FR', label: 'French', say: 'French' },
  { code: 'hi-IN', label: 'Hindi', say: 'Hindi' },
  { code: 'id-ID', label: 'Indonesian', say: 'Indonesian' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)', say: 'Mandarin Chinese' },
  { code: 'ar-SA', label: 'Arabic', say: 'Arabic' },
]

export function langSay(code) {
  return LANGUAGES.find((l) => l.code === code)?.say || 'English'
}

export function langLabel(code) {
  return LANGUAGES.find((l) => l.code === code)?.label || 'English'
}
