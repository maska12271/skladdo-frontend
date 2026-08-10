import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en'
import et from './locales/et'
import ru from './locales/ru'

export const SUPPORTED_LANGUAGES = [
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'et', label: 'Eesti', short: 'ET' },
    { code: 'ru', label: 'Русский', short: 'RU' },
]

// Browser-language detection with localStorage persistence. Anything that isn't et/ru/en falls
// back to English. The detected/stored choice is read once on startup; the header switcher calls
// i18n.changeLanguage(...) which the detector then persists.
i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            et: { translation: et },
            ru: { translation: ru },
        },
        supportedLngs: ['en', 'et', 'ru'],
        // Region-tagged locales must match their base language. Without this, i18next tests each detected
        // code verbatim against supportedLngs, so 'en-US' misses and the NEXT language the browser lists
        // wins instead — an en-US user with Russian also installed was served Russian, and an et-EE user
        // likewise. Baltic users routinely have two or three of these configured, so this is the common case.
        nonExplicitSupportedLngs: true,
        fallbackLng: 'en',
        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            lookupLocalStorage: 'lang',
            caches: ['localStorage'],
        },
        interpolation: {
            escapeValue: false, // React already escapes
        },
    })

export default i18n
