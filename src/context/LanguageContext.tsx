import React, { createContext, useContext, useState, useEffect } from 'react';
import { SupportedLanguage, LanguageInfo, SUPPORTED_LANGUAGES } from '../locales/languages';
import { TRANSLATIONS } from '../locales/translations';

export type { SupportedLanguage, LanguageInfo };
export { SUPPORTED_LANGUAGES, TRANSLATIONS };

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string) => string;
  languages: LanguageInfo[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const saved = localStorage.getItem('tactical_app_lang');
    // If previous saved was 'zh', reset to Hindi or English
    if (saved && saved !== 'zh' && SUPPORTED_LANGUAGES.some(l => l.code === saved)) {
      return saved as SupportedLanguage;
    }
    return 'en';
  });

  // Keep HTML document lang attribute in sync for accessibility & SEO
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    localStorage.setItem('tactical_app_lang', lang);
  };

  const t = (key: string): string => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
    return dict[key] || TRANSLATIONS.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages: SUPPORTED_LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
