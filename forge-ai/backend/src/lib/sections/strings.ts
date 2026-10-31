// The few words ForgeAI itself writes on a site (form messages, countdown units,
// fallback labels) in the site's language. The model writes everything else.

export type StringKey =
  | 'popular' | 'days' | 'hours' | 'minutes' | 'seconds' | 'mostPopular' | 'choose'
  | 'name' | 'email' | 'message' | 'send' | 'subscribe' | 'emailAddress' | 'latest'
  | 'lookingFor' | 'search' | 'whatNeed' | 'continue' | 'join' | 'yes' | 'no' | 'stars'
  | 'thanks' | 'fail' | 'ask' | 'sending' | 'quranText' | 'translation' | 'recitation'

const EN: Record<StringKey, string> = {
  popular: 'Popular:', days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds',
  mostPopular: 'Most popular', choose: 'Choose', name: 'Name', email: 'Email', message: 'Message', send: 'Send',
  subscribe: 'Subscribe', emailAddress: 'Email address', latest: 'Latest', lookingFor: 'What are you looking for?',
  search: 'Search', whatNeed: 'What do you need?', continue: 'Continue', join: 'Join', yes: 'Yes', no: 'No',
  stars: '{n} out of 5 stars',
  thanks: 'Thank you — your message has been sent. We will be in touch soon.',
  fail: 'Sorry — your message could not be sent. Please try again or contact us directly.',
  ask: 'Please add your phone number or email so we can reply.',
  sending: 'Sending…',
  quranText: 'Quran text', translation: 'Translation', recitation: 'Recitation',
}

const STRINGS: Record<string, Record<StringKey, string>> = {
  en: EN,
  ur: {
    popular: 'مقبول:', days: 'دن', hours: 'گھنٹے', minutes: 'منٹ', seconds: 'سیکنڈ',
    mostPopular: 'سب سے مقبول', choose: 'منتخب کریں', name: 'نام', email: 'ای میل', message: 'پیغام', send: 'بھیجیں',
    subscribe: 'سبسکرائب کریں', emailAddress: 'ای میل ایڈریس', latest: 'تازہ ترین', lookingFor: 'آپ کیا تلاش کر رہے ہیں؟',
    search: 'تلاش کریں', whatNeed: 'آپ کو کیا چاہیے؟', continue: 'جاری رکھیں', join: 'شامل ہوں', yes: 'ہاں', no: 'نہیں',
    stars: '5 میں سے {n} ستارے',
    thanks: 'شکریہ — آپ کا پیغام بھیج دیا گیا ہے۔ ہم جلد آپ سے رابطہ کریں گے۔',
    fail: 'معذرت — آپ کا پیغام نہیں بھیجا جا سکا۔ براہ کرم دوبارہ کوشش کریں یا ہم سے براہ راست رابطہ کریں۔',
    ask: 'براہ کرم اپنا فون نمبر یا ای میل درج کریں تاکہ ہم جواب دے سکیں۔',
    sending: 'بھیجا جا رہا ہے…',
    quranText: 'قرآنی متن', translation: 'ترجمہ', recitation: 'تلاوت',
  },
  ar: {
    popular: 'الأكثر بحثًا:', days: 'أيام', hours: 'ساعات', minutes: 'دقائق', seconds: 'ثوانٍ',
    mostPopular: 'الأكثر طلبًا', choose: 'اختر', name: 'الاسم', email: 'البريد الإلكتروني', message: 'الرسالة', send: 'إرسال',
    subscribe: 'اشترك', emailAddress: 'عنوان البريد الإلكتروني', latest: 'الأحدث', lookingFor: 'عمّ تبحث؟',
    search: 'بحث', whatNeed: 'ماذا تحتاج؟', continue: 'متابعة', join: 'انضم', yes: 'نعم', no: 'لا',
    stars: '{n} من 5 نجوم',
    thanks: 'شكرًا لك — تم إرسال رسالتك. سنتواصل معك قريبًا.',
    fail: 'عذرًا — تعذّر إرسال رسالتك. يُرجى المحاولة مرة أخرى أو التواصل معنا مباشرة.',
    ask: 'يُرجى إضافة رقم هاتفك أو بريدك الإلكتروني حتى نتمكن من الرد.',
    sending: 'جارٍ الإرسال…',
    quranText: 'نص القرآن', translation: 'الترجمة', recitation: 'التلاوة',
  },
}

/** A ForgeAI string in the site's language — English when there is no translation */
export function t(lang: string, key: StringKey, vars: Record<string, string | number> = {}): string {
  const s = (STRINGS[lang] ?? STRINGS[lang.split('-')[0]] ?? EN)[key]
  return s.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''))
}
