// The words ForgeAI's Quran sections and reader show, in the site's language.

export type QuranUiKey =
  | 'loading' | 'failed' | 'surah' | 'translation' | 'smaller' | 'bigger' | 'playAll' | 'pause' | 'play'
  | 'bookmark' | 'bookmarked' | 'removed' | 'copy' | 'copied' | 'share' | 'prev' | 'next' | 'meccan' | 'medinan'
  | 'ayahs' | 'continueReading' | 'filter' | 'noSurah' | 'searchPlaceholder' | 'search' | 'searching' | 'results'
  | 'firstResults' | 'noResults' | 'read' | 'remove' | 'noBookmarks' | 'savedHere' | 'verseOfDay'

const EN: Record<QuranUiKey, string> = {
  loading: 'Loading…',
  failed: 'The Quran text could not be loaded. Please refresh the page.',
  surah: 'Surah', translation: 'Translation', smaller: 'Smaller text', bigger: 'Larger text',
  playAll: 'Play all', pause: 'Pause', play: 'Listen', bookmark: 'Bookmark', bookmarked: 'Bookmarked', removed: 'Bookmark removed',
  copy: 'Copy', copied: 'Copied', share: 'Share', prev: 'Previous surah', next: 'Next surah',
  meccan: 'Meccan', medinan: 'Medinan', ayahs: '{n} ayahs', continueReading: 'Continue reading',
  filter: 'Find a surah by name or number', noSurah: 'No surah matches that.',
  searchPlaceholder: 'Search the Quran — a word, or 2:255', search: 'Search', searching: 'Searching… {n}/114',
  results: '{n} verses found', firstResults: 'Showing the first {n}.', noResults: 'No verses found.',
  read: 'Read in context', remove: 'Remove',
  noBookmarks: 'No bookmarks yet. Tap the bookmark on any verse in the reader to keep it here.',
  savedHere: 'Saved on this device.', verseOfDay: 'Verse of the day',
}

const UI: Record<string, Record<QuranUiKey, string>> = {
  en: EN,
  ur: {
    loading: 'لوڈ ہو رہا ہے…',
    failed: 'قرآن کا متن لوڈ نہیں ہو سکا۔ براہ کرم صفحہ دوبارہ لوڈ کریں۔',
    surah: 'سورت', translation: 'ترجمہ', smaller: 'چھوٹا متن', bigger: 'بڑا متن',
    playAll: 'مکمل تلاوت', pause: 'روکیں', play: 'سنیں', bookmark: 'بک مارک', bookmarked: 'بک مارک ہو گیا', removed: 'بک مارک ہٹا دیا گیا',
    copy: 'کاپی', copied: 'کاپی ہو گیا', share: 'شیئر', prev: 'پچھلی سورت', next: 'اگلی سورت',
    meccan: 'مکی', medinan: 'مدنی', ayahs: '{n} آیات', continueReading: 'جہاں چھوڑا تھا وہیں سے پڑھیں',
    filter: 'نام یا نمبر سے سورت تلاش کریں', noSurah: 'کوئی سورت نہیں ملی۔',
    searchPlaceholder: 'قرآن میں تلاش کریں — کوئی لفظ یا 2:255', search: 'تلاش کریں', searching: 'تلاش جاری ہے… {n}/114',
    results: '{n} آیات ملیں', firstResults: 'پہلی {n} دکھائی جا رہی ہیں۔', noResults: 'کوئی آیت نہیں ملی۔',
    read: 'سیاق میں پڑھیں', remove: 'ہٹائیں',
    noBookmarks: 'ابھی کوئی بک مارک نہیں۔ ریڈر میں کسی بھی آیت پر بک مارک دبائیں تاکہ وہ یہاں محفوظ ہو جائے۔',
    savedHere: 'اس ڈیوائس پر محفوظ ہیں۔', verseOfDay: 'آج کی آیت',
  },
  ar: {
    loading: 'جارٍ التحميل…',
    failed: 'تعذّر تحميل نص القرآن. يُرجى إعادة تحميل الصفحة.',
    surah: 'السورة', translation: 'الترجمة', smaller: 'تصغير الخط', bigger: 'تكبير الخط',
    playAll: 'تشغيل السورة', pause: 'إيقاف مؤقت', play: 'استماع', bookmark: 'حفظ الآية', bookmarked: 'تم حفظ الآية', removed: 'أُزيلت الآية من المحفوظات',
    copy: 'نسخ', copied: 'تم النسخ', share: 'مشاركة', prev: 'السورة السابقة', next: 'السورة التالية',
    meccan: 'مكية', medinan: 'مدنية', ayahs: 'آياتها {n}', continueReading: 'تابع القراءة',
    filter: 'ابحث عن سورة بالاسم أو الرقم', noSurah: 'لا توجد سورة مطابقة.',
    searchPlaceholder: 'ابحث في القرآن — كلمة أو 2:255', search: 'بحث', searching: 'جارٍ البحث… {n}/114',
    results: 'عدد الآيات: {n}', firstResults: 'تُعرض أول {n}.', noResults: 'لم يتم العثور على آيات.',
    read: 'اقرأ في السياق', remove: 'إزالة',
    noBookmarks: 'لا توجد آيات محفوظة بعد. اضغط زر الحفظ بجانب أي آية في القارئ لتظهر هنا.',
    savedHere: 'محفوظة على هذا الجهاز.', verseOfDay: 'آية اليوم',
  },
}

export function quranUi(lang: string): Record<QuranUiKey, string> {
  return UI[lang] ?? UI[lang.split('-')[0]] ?? EN
}

/** One string, with {n} filled in */
export const qt = (lang: string, key: QuranUiKey, n?: number | string) => quranUi(lang)[key].replace('{n}', String(n ?? ''))

/** Arabic-Indic digits, for verse numbers set inside Arabic text */
export const arabicDigits = (n: number | string) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])

/** A surah's name as this site writes it: transliterated on English sites, Arabic on Urdu and Arabic ones */
export const surahName = (lang: string, s: { name: string; ar: string }) => (lang === 'ur' || lang === 'ar' ? s.ar : s.name)
