import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ar from './locales/ar.json';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    
    interpolation: {
      escapeValue: false, // React already escapes
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

// Helper to check if current language is RTL
export const isRTL = () => {
  return i18n.language === 'ar';
};

// Helper to get current direction
export const getDirection = () => {
  return isRTL() ? 'rtl' : 'ltr';
};

export default i18n;
