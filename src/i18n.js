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
};

function pack(lang) {
  const out = {};
  for (const key of Object.keys(lines)) {
    const [line, stat] = lines[key][lang];
    out[key] = { line, stat };
  }
  return out;
}

export const copy = {
  en: {
    title: 'Void',
    description: 'A continuous zoom from a person standing still to the last light going out.',
    sr: 'A film of scale. It waits until you begin. Scroll or drag to move through it. Space pauses. The sizes are shortened so the motion stays visible.',
    begin: 'Begin',
    again: 'Play again',
    play: 'Play',
    pause: 'Pause',
    farther: 'Farther',
    closer: 'Closer',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    hintScroll: 'Wait, or scroll.',
    hintDrag: 'Wait, or drag.',
    hintStep: 'Step through, or drag.',
    note: 'Sizes are shortened so the motion stays visible.',
    scrub: 'Move through the zoom',
    failWebgl: 'This piece needs WebGL.',
    failJs: 'This piece plays with JavaScript and WebGL.',
    creditAria: 'By Noor — bynoor.io (opens in a new tab)',
    langLabel: 'Language',
    lines: pack('en'),
  },
  ar: {
    title: 'خلاء',
    description: 'تقريب متواصل من شخص واقف إلى آخر ضوء ينطفئ.',
    sr: 'فيلم عن المقياس. ينتظر حتّى تبدأ. مرّر أو اسحب للتنقّل فيه. مفتاح المسافة يُوقف. الأحجام مختصرة كي تبقى الحركة مرئيّة.',
    begin: 'ابدأ',
    again: 'من جديد',
    play: 'تشغيل',
    pause: 'إيقاف',
    farther: 'أبعد',
    closer: 'أقرب',
    soundOn: 'الصوت مفعّل',
    soundOff: 'الصوت مكتوم',
    hintScroll: 'انتظر، أو مرّر.',
    hintDrag: 'انتظر، أو اسحب.',
    hintStep: 'خطوة بخطوة، أو اسحب.',
    note: 'الأحجام مختصرة كي تبقى الحركة مرئيّة.',
    scrub: 'التنقّل في التقريب',
    failWebgl: 'يتطلّب هذا العمل WebGL.',
    failJs: 'يتطلّب هذا العمل JavaScript وWebGL.',
    creditAria: 'نور — bynoor.io (يُفتَح في تبويب جديد)',
    langLabel: 'اللغة',
    lines: pack('ar'),
  },
};
