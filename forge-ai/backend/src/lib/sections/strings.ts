// The few words ForgeAI itself writes on a site (form messages, countdown units,
// fallback labels) in the site's language. The model writes everything else.

export type StringKey =
  | 'popular' | 'days' | 'hours' | 'minutes' | 'seconds' | 'mostPopular' | 'choose'
  | 'name' | 'email' | 'message' | 'send' | 'subscribe' | 'emailAddress' | 'latest'
  | 'lookingFor' | 'search' | 'whatNeed' | 'continue' | 'join' | 'yes' | 'no' | 'stars'
  | 'thanks' | 'fail' | 'ask' | 'sending' | 'quranText' | 'translation' | 'recitation'
  | 'allTopics' | 'searchStories' | 'searchEvents' | 'noResults' | 'loadMore' | 'minRead' | 'contents' | 'share' | 'copyLink' | 'copied'
  | 'question' | 'questions' | 'next' | 'seeResult' | 'retake' | 'yourScore' | 'skip'
  | 'soldOut' | 'addCalendar' | 'googleCalendar' | 'appleCalendar' | 'showPast' | 'showUpcoming' | 'noEvents' | 'eventEnded'
  | 'date' | 'time' | 'venue' | 'price' | 'phone' | 'guests' | 'whichEvent' | 'reserve'

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
  allTopics: 'All', searchStories: 'Search stories', searchEvents: 'Search events', noResults: 'Nothing matches that yet.', loadMore: 'Show more',
  minRead: '{n} min read', contents: 'In this article', share: 'Share', copyLink: 'Copy link', copied: 'Copied',
  question: 'Question {n} of {t}', questions: '{n} questions', next: 'Next', seeResult: 'See my result', retake: 'Take it again', yourScore: 'You scored {n} of {t}', skip: 'Skip and see my result',
  soldOut: 'Sold out', addCalendar: 'Add to calendar', googleCalendar: 'Google Calendar', appleCalendar: 'Apple / Outlook', showPast: 'Show past events', showUpcoming: 'Show upcoming events', noEvents: 'No events to show right now. Check back soon.', eventEnded: 'This event has ended.',
  date: 'Date', time: 'Time', venue: 'Venue', price: 'Price', phone: 'Phone', guests: 'Guests', whichEvent: 'Which event?', reserve: 'Reserve my seat',
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
    allTopics: 'سب', searchStories: 'تحریریں تلاش کریں', searchEvents: 'تقریبات تلاش کریں', noResults: 'ابھی اس سے ملتا جلتا کچھ نہیں ملا۔', loadMore: 'مزید دکھائیں',
    minRead: '{n} منٹ کا مطالعہ', contents: 'اس مضمون میں', share: 'شیئر کریں', copyLink: 'لنک کاپی کریں', copied: 'کاپی ہو گیا',
    question: 'سوال {n} از {t}', questions: '{n} سوالات', next: 'اگلا', seeResult: 'میرا نتیجہ دکھائیں', retake: 'دوبارہ کریں', yourScore: 'آپ کا اسکور {t} میں سے {n}', skip: 'چھوڑیں اور نتیجہ دیکھیں',
    soldOut: 'ٹکٹ ختم', addCalendar: 'کیلنڈر میں شامل کریں', googleCalendar: 'گوگل کیلنڈر', appleCalendar: 'ایپل / آؤٹ لک', showPast: 'گزشتہ تقریبات دکھائیں', showUpcoming: 'آنے والی تقریبات دکھائیں', noEvents: 'فی الحال کوئی تقریب نہیں۔ جلد دوبارہ دیکھیں۔', eventEnded: 'یہ تقریب ختم ہو چکی ہے۔',
    date: 'تاریخ', time: 'وقت', venue: 'مقام', price: 'قیمت', phone: 'فون', guests: 'مہمان', whichEvent: 'کون سی تقریب؟', reserve: 'میری نشست محفوظ کریں',
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
    allTopics: 'الكل', searchStories: 'ابحث في المقالات', searchEvents: 'ابحث في الفعاليات', noResults: 'لا توجد نتائج مطابقة حتى الآن.', loadMore: 'عرض المزيد',
    minRead: 'قراءة {n} دقائق', contents: 'في هذا المقال', share: 'مشاركة', copyLink: 'نسخ الرابط', copied: 'تم النسخ',
    question: 'السؤال {n} من {t}', questions: '{n} أسئلة', next: 'التالي', seeResult: 'اعرض نتيجتي', retake: 'أعد المحاولة', yourScore: 'نتيجتك {n} من {t}', skip: 'تخطَّ واعرض النتيجة',
    soldOut: 'نفدت التذاكر', addCalendar: 'أضف إلى التقويم', googleCalendar: 'تقويم Google', appleCalendar: 'Apple / Outlook', showPast: 'عرض الفعاليات السابقة', showUpcoming: 'عرض الفعاليات القادمة', noEvents: 'لا توجد فعاليات حاليًا. عُد قريبًا.', eventEnded: 'انتهت هذه الفعالية.',
    date: 'التاريخ', time: 'الوقت', venue: 'المكان', price: 'السعر', phone: 'الهاتف', guests: 'الضيوف', whichEvent: 'أي فعالية؟', reserve: 'احجز مقعدي',
  },
}

/** A ForgeAI string in the site's language — English when there is no translation */
export function t(lang: string, key: StringKey, vars: Record<string, string | number> = {}): string {
  const s = (STRINGS[lang] ?? STRINGS[lang.split('-')[0]] ?? EN)[key]
  return s.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''))
}
