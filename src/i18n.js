export function resolveLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ar' || q === 'en') return q;
  try {
    const stored = localStorage.getItem('void-lang');
    if (stored === 'ar' || stored === 'en') return stored;
  } catch {
    // Storage can be blocked. Detection still works for this visit.
  }
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
  if (list.some((item) => String(item).toLowerCase().startsWith('ar'))) return 'ar';
  return 'en';
}

const lines = {
  still: {
    en: ['You have not moved yet.', '1.8 meters tall. Everything else is measured from here.'],
    ar: ['لم تتحرّك بعد.', 'طولك 1.8 م. كلّ شيء آخر يُقاس من هنا.'],
  },
  step: {
    en: ['The first motion is yours, and it is small.', 'About 0.7 meters a step. A life is a few hundred million of them.'],
    ar: ['أوّل حركة هي حركتك، وهي صغيرة.', 'نحو 0.7 م في الخطوة. العمر بضع مئات الملايين منها.'],
  },
  place: {
    en: ['A place is what you can still walk back to.', 'A few hundred meters. You could cross it before dark.'],
    ar: ['المكان هو ما تستطيع أن تعود إليه مشيًا.', 'بضع مئات الأمتار. تقطعها قبل حلول الظلام.'],
  },
  coast: {
    en: ['The edge you could not see was a coastline.', 'A country spans hundreds of kilometers. Earth is 12,742 kilometers across.'],
    ar: ['تلك الحافة التي لم تَرَها كانت ساحلًا.', 'تمتدّ البلاد مئات الكيلومترات. وقُطر الأرض 12,742 كم.'],
  },
  spin: {
    en: ['The world turns all the way around.', 'About 1,670 kilometers an hour at the equator. One full turn is a day.'],
    ar: ['الأرض تدور دورةً كاملة.', 'نحو 1,670 كم في الساعة عند خطّ الاستواء. كلّ دورة يوم.'],
  },
  lights: {
    en: ['Every light down there is someone’s evening.', 'Eight billion people, all on this one turning ground.'],
    ar: ['كلّ ضوءٍ هناك مساءُ أحدٍ ما.', 'ثمانية مليارات إنسان، كلّهم على هذه الأرض الدائرة.'],
  },
  moon: {
    en: ['Something else is falling, and it never lands.', 'The Moon is 384,000 kilometers away. It goes around once a month.'],
    ar: ['شيءٌ آخر يسقط ولا يصل الأرض أبدًا.', 'يبعد القمر 384,000 كم. يدور حولها مرّة كلّ شهر.'],
  },
  year: {
    en: ['You are not the center. You are riding one.', '150 million kilometers out. The world comes toward you, then falls away. One trip is a year.'],
    ar: ['لستَ المركز، لكنّك تركب واحدًا.', 'على بُعد 150 مليون كم. تقترب الأرض منك ثمّ تبتعد. الدورة الواحدة سنة.'],
  },
  planets: {
    en: ['The fall is not a single circle.', 'The outer worlds sit billions of kilometers farther out, and they move more slowly.'],
    ar: ['المدار ليس دائرة واحدة.', 'الكواكب البعيدة على بُعد مليارات الكيلومترات، وحركتها أبطأ.'],
  },
  dot: {
    en: ['Everyone you have ever known is on that point.', 'Everyone who has ever lived, lived there. From six billion kilometers it is less than a pixel.'],
    ar: ['كلّ من عرفتَهم يومًا على تلك النقطة.', 'كلّ من عاش يومًا عاش هناك. من 6 مليارات كم تبدو أصغر من بكسل.'],
  },
  sun: {
    en: ['The center you found is leaving too.', 'The Sun moves at about 220 km/s, and it rises and falls through the disk as it goes.'],
    ar: ['حتّى المركز الذي وجدته يرحل.', 'تسير الشمس بنحو 220 كم/ث، وتعلو وتهبط عبر قرص المجرّة وهي تمضي.'],
  },
  disk: {
    en: ['The whole disk turns. The inside pulls ahead.', 'One turn takes about 230 million years. The near side is coming toward you.'],
    ar: ['القرص كلّه يدور. والداخل يسبق.', 'الدورة الواحدة نحو 230 مليون سنة. والجانب القريب يتّجه نحوك.'],
  },
  galaxies: {
    en: ['Past this, the motions stop sharing a center.', 'Andromeda is 2.5 million light-years away. The gap between galaxies is almost empty.'],
    ar: ['بعد هذا الحدّ، لم يعد للحركة مركز مشترك.', 'تبعد أندروميدا 2.5 مليون سنة ضوئية. والفراغ بين المجرّات يكاد يكون عدمًا.'],
  },
  end: {
    en: ['There is no middle left to stand in.', 'About 93 billion light-years across. Most of that distance is nothing.'],
    ar: ['لم يبقَ وسطٌ تقف فيه.', 'قُطره نحو 93 مليار سنة ضوئية. أغلب تلك المسافة فراغ.'],
  },
  coda: {
    en: ['And somewhere in all of it, you.', 'Still 1.8 meters tall. Still where everything is measured from.'],
    ar: ['وفي مكانٍ ما من هذا كلّه، أنت.', 'ما زال طولك 1.8 م. وما زال كلّ شيء يُقاس من هنا.'],
  },
};

function pack(lang) {
  const out = {};
  for (const key of Object.keys(lines)) {
    const [line, stat] = lines[key][lang];
    out[key] = { line, stat };
  }
  return out;
}

const LIGHT_YEAR = 9.4607e15;
const numberFormats = {
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }),
  // Western digits in Arabic copy, matching the rest of the piece.
  ar: new Intl.NumberFormat('ar', { maximumFractionDigits: 1, numberingSystem: 'latn' }),
};

function twoFigures(x) {
  if (x <= 0) return 0;
  const step = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / step) * step;
}

const units = {
  en: {
    m: (n) => `${n} ${n === '1' ? 'meter' : 'meters'}`,
    km: (n) => `${n} kilometers`,
    mkm: (n) => `${n} million kilometers`,
    bkm: (n) => `${n} billion kilometers`,
    tkm: (n) => `${n} trillion kilometers`,
    ly: (n) => `${n} light-years`,
    mly: (n) => `${n} million light-years`,
    bly: (n) => `${n} billion light-years`,
    across: (s) => `${s} across`,
  },
  ar: {
    m: (n) => `${n} م`,
    km: (n) => `${n} كم`,
    mkm: (n) => `${n} مليون كم`,
    bkm: (n) => `${n} مليار كم`,
    tkm: (n) => `${n} تريليون كم`,
    ly: (n, v) => `${n} ${v >= 3 && v <= 10 ? 'سنوات ضوئية' : 'سنة ضوئية'}`,
    mly: (n) => `${n} مليون سنة ضوئية`,
    bly: (n) => `${n} مليار سنة ضوئية`,
    across: (s) => `عرض المشهد ${s}`,
  },
};

// The real width of the view, two significant figures, in the unit a
// person would say out loud.
export function formatWidth(meters, lang) {
  const u = units[lang];
  const fmt = numberFormats[lang];
  const say = (kind, value) => {
    const v = twoFigures(value);
    return u[kind](fmt.format(v), v);
  };
  let text;
  if (meters < 1000) text = say('m', meters);
  else if (meters < 0.3 * LIGHT_YEAR) {
    const km = meters / 1000;
    if (km < 1e6) text = say('km', km);
    else if (km < 1e9) text = say('mkm', km / 1e6);
    else if (km < 1e12) text = say('bkm', km / 1e9);
    else text = say('tkm', km / 1e12);
  } else {
    const ly = meters / LIGHT_YEAR;
    if (ly < 1e6) text = say('ly', ly);
    else if (ly < 1e9) text = say('mly', ly / 1e6);
    else text = say('bly', ly / 1e9);
  }
  return u.across(text);
}

export const copy = {
  en: {
    title: 'Void',
    description: 'A continuous zoom from a person standing still to the edge of everything, and home again.',
    sr: 'A film of scale. It waits until you begin. Scroll or drag to move through it. Space pauses. Sizes and times are compressed so the motion stays visible.',
    begin: 'Begin',
    again: 'Go home',
    play: 'Play',
    pause: 'Pause',
    farther: 'Farther',
    closer: 'Closer',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    hintScroll: 'Wait, or scroll.',
    hintDrag: 'Wait, or drag.',
    hintStep: 'Step through, or drag.',
    note: 'Sizes and times are compressed so the motion stays visible.',
    scrub: 'Move through the zoom',
    you: 'you',
    failWebgl: 'This piece needs WebGL.',
    failJs: 'This piece plays with JavaScript and WebGL.',
    creditAria: 'By Noor — bynoor.io (opens in a new tab)',
    langLabel: 'Language',
    lines: pack('en'),
  },
  ar: {
    title: 'خلاء',
    description: 'تقريب متواصل من شخص واقف إلى حافة كلّ شيء، ثمّ العودة إلى البيت.',
    sr: 'فيلم عن المقياس. ينتظر حتّى تبدأ. مرّر أو اسحب للتنقّل فيه. مفتاح المسافة يُوقف. الأحجام والأزمنة مختصرة كي تبقى الحركة مرئيّة.',
    begin: 'ابدأ',
    again: 'عُد إلى البيت',
    play: 'تشغيل',
    pause: 'إيقاف',
    farther: 'أبعد',
    closer: 'أقرب',
    soundOn: 'الصوت مفعّل',
    soundOff: 'الصوت مكتوم',
    hintScroll: 'انتظر، أو مرّر.',
    hintDrag: 'انتظر، أو اسحب.',
    hintStep: 'خطوة بخطوة، أو اسحب.',
    note: 'الأحجام والأزمنة مختصرة كي تبقى الحركة مرئيّة.',
    scrub: 'التنقّل في التقريب',
    you: 'أنت',
    failWebgl: 'يتطلّب هذا العمل WebGL.',
    failJs: 'يتطلّب هذا العمل JavaScript وWebGL.',
    creditAria: 'نور — bynoor.io (يُفتَح في تبويب جديد)',
    langLabel: 'اللغة',
    lines: pack('ar'),
  },
};
