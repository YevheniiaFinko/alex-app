import { useState, useEffect, useRef } from "react"

// ─── PALETTE ──────────────────────────────────────────────────────────────────
const C = {
  bg:          "#F5F9FF",
  blue:        "#4A9EDF",
  blueLight:   "#5BB8F5",
  mint:        "#4ECBA8",
  text:        "#1A2433",
  textSub:     "#6B7A8D",
  glass:       "rgba(255,255,255,0.78)",
  glassBorder: "rgba(255,255,255,0.92)",
}

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ─── LOGIC HELPERS ────────────────────────────────────────────────────────────
function calcAge(y) { return new Date().getFullYear() - parseInt(y) }

function getPhase(day, cycleLength = 28) {
  const d = parseInt(day); const cl = parseInt(cycleLength) || 28
  if (d >= 1 && d <= 5) return "menstrual"
  if (d / cl < 0.5)     return "follicular"
  if (d / cl >= 0.5 && d / cl <= 0.58) return "ovulation"
  return "luteal"
}

function calcStreak(history, activityDays) {
  const histDays = (history || []).map(h => h.date?.slice(0, 10)).filter(Boolean)
  const allDaySet = new Set([...histDays, ...(activityDays || [])])
  const days = [...allDaySet].sort().reverse()
  if (!days.length) return 0
  const today = new Date().toISOString().slice(0, 10)
  let streak = 0
  let expected = today
  for (const d of days) {
    if (d === expected) {
      streak++
      const dt = new Date(expected + "T12:00:00Z")
      dt.setUTCDate(dt.getUTCDate() - 1)
      expected = dt.toISOString().slice(0, 10)
    } else break
  }
  return streak
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

function calcCycleDay(profile) {
  if (profile.lastPeriodDate) {
    const start = new Date(profile.lastPeriodDate + "T12:00:00Z")
    const diff = Math.floor((Date.now() - start.getTime()) / 86400000) + 1
    const cl = parseInt(profile.cycleLength) || 28
    return ((diff - 1) % cl) + 1
  }
  return parseInt(profile.cycleDay) || 14
}

function getCalendarDays(lastPeriodDate, cycleLength) {
  const cl = parseInt(cycleLength) || 28
  const start = new Date(lastPeriodDate + "T12:00:00Z")
  const today = new Date().toISOString().slice(0, 10)
  return Array.from({ length: cl }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    return { date: dateStr, cycleDay: i + 1, phase: getPhase(i + 1, cl), isToday: dateStr === today, isPast: dateStr < today }
  })
}

function toggle(arr, id) {
  return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
}

// ─── ROOT CAUSE DATA ──────────────────────────────────────────────────────────
const CAUSE_DATA = {
  cortisol: {
    icon: "⚡",
    title: { en: "Elevated Cortisol", uk: "Підвищений кортизол" },
    subtitle: { en: "Chronic stress affecting your whole body", uk: "Хронічний стрес впливає на весь організм" },
    body: {
      en: "Elevated cortisol suppresses progesterone, triggers hair shedding, promotes belly fat, and disrupts sleep. Your symptoms across skin, hair, and energy may share one source.",
      uk: "Підвищений кортизол пригнічує прогестерон, провокує випадіння волосся, накопичення жиру на животі та порушує сон. Твої симптоми зі шкірою, волоссям і енергією можуть мати одне джерело.",
    },
    protocol: {
      en: ["🍳 Eat within 1h of waking — blood sugar stability lowers cortisol spikes", "💊 Magnesium glycinate 300mg before bed — reduces cortisol, improves sleep", "🏋️ Swap HIIT for strength training 2x this week — HIIT raises cortisol further"],
      uk: ["🍳 Їж протягом 1г після пробудження — стабілізація цукру знижує стрибки кортизолу", "💊 Магній гліцинат 300мг перед сном — знижує кортизол, покращує сон", "🏋️ Заміни HIIT на силові тренування 2 рази цього тижня — HIIT зараз підвищує кортизол"],
    },
  },
  estrogen: {
    icon: "🌸",
    title: { en: "Estrogen Fluctuation", uk: "Флуктуація естрогену" },
    subtitle: { en: "Hormonal shift affecting skin, hair & brain", uk: "Гормональний зсув впливає на шкіру, волосся і мозок" },
    body: {
      en: "Estrogen stimulates collagen by 76%, regulates hair follicle cycles, and protects neurotransmitters. When it fluctuates you notice it in skin, hair texture, sleep quality, and mental clarity.",
      uk: "Естроген стимулює синтез колагену на 76%, регулює цикли фолікулів і захищає нейротрансмітери. Коли він коливається — помічаєш у шкірі, текстурі волосся, якості сну і чіткості думок.",
    },
    protocol: {
      en: ["🥦 Cruciferous vegetables (broccoli, cauliflower) daily — support estrogen metabolism", "💊 Vitamin D3 2000 IU + Omega-3 daily — hormonal balance and skin integrity", "😴 Sleep before midnight — estrogen-related brain restoration happens in early sleep cycles"],
      uk: ["🥦 Хрестоцвіті (броколі, цвітна капуста) щодня — підтримують метаболізм естрогену", "💊 Вітамін D3 2000 МО + Омега-3 щодня — гормональний баланс і цілісність шкіри", "😴 Сон до опівночі — відновлення мозку відбувається в ранніх циклах сну"],
    },
  },
  protein: {
    icon: "💪",
    title: { en: "Protein & Iron Deficiency", uk: "Дефіцит білку і заліза" },
    subtitle: { en: "The silent driver of hair, energy & muscle loss", uk: "Прихований двигун втрати волосся, енергії і м'язів" },
    body: {
      en: "Most women eat 40–60g protein daily. Hair follicles, skin repair, muscles, and immunity all compete for what's available. Low ferritin is the #1 overlooked cause of hair shedding.",
      uk: "Більшість жінок їдять 40–60г білку на день. Фолікули, шкіра, м'язи і імунітет конкурують за те, що є. Низький феритин — причина №1 випадіння волосся, яку часто пропускають в аналізах.",
    },
    protocol: {
      en: ["🍳 Add 25–30g protein at breakfast — eggs, Greek yogurt, or protein powder", "🥩 Target 1.6g protein per kg bodyweight daily (most women get 0.6g)", "💊 Ask your doctor to test ferritin specifically — not just general iron levels"],
      uk: ["🍳 Додай 25–30г білку на сніданок — яйця, грецький йогурт або протеїн", "🥩 Ціль: 1.6г білку на кг ваги на день (більшість жінок отримують 0.6г)", "💊 Попроси лікаря перевірити феритин окремо — не просто загальне залізо"],
    },
  },
  pcos: {
    icon: "🔬",
    title: { en: "PCOS Pattern", uk: "Патерн СПКЯ" },
    subtitle: { en: "1 in 4 women have PCOS — 70% don't know", uk: "Кожна 4-та жінка має СПКЯ — 70% не знають" },
    body: {
      en: "Hormonal acne, hair thinning, and belly weight gain together are a classic PCOS pattern. PCOS affects insulin, cortisol, androgens, and metabolism simultaneously — not just reproduction.",
      uk: "Гормональне акне, стоншення волосся і жир на животі разом — класичний патерн СПКЯ. СПКЯ впливає на інсулін, кортизол, андрогени і метаболізм одночасно — не лише на репродукцію.",
    },
    protocol: {
      en: ["🍳 Prioritise protein + reduce refined carbs — improves insulin sensitivity", "🏋️ Strength training 3x/week — most effective intervention for PCOS symptoms", "🩸 Ask your doctor: testosterone, DHEA-S, fasting insulin, AMH"],
      uk: ["🍳 Пріоритизуй білок, знижуй рафіновані вуглеводи — покращує чутливість до інсуліну", "🏋️ Силові тренування 3 рази/тиждень — найефективніша інтервенція для СПКЯ", "🩸 Попроси лікаря: тестостерон, ДГЕА-С, інсулін натщесерце, АМГ"],
    },
  },
  inflammation: {
    icon: "🔥",
    title: { en: "Low-grade Inflammation", uk: "Хронічне запалення" },
    subtitle: { en: "Silent driver of skin, energy & gut issues", uk: "Прихований двигун проблем зі шкірою, енергією і кишківником" },
    body: {
      en: "Chronic low-grade inflammation — from food, stress, or gut imbalance — damages the skin barrier, impairs energy production, and drives a cycle of symptoms: reactive skin, bloating, fatigue.",
      uk: "Хронічне запалення — від їжі, стресу або дисбалансу мікробіому — пошкоджує шкірний бар'єр, порушує виробництво енергії і підживлює симптоми: реактивна шкіра, здуття, втома.",
    },
    protocol: {
      en: ["🐟 Omega-3 2g/day from fish oil — anti-inflammatory, supports skin barrier", "🥗 Fermented foods (kimchi, kefir, yogurt) 3x/week — gut microbiome drives inflammation", "❌ Identify your triggers — alcohol, gluten, or dairy often drive reactive skin and bloating"],
      uk: ["🐟 Омега-3 2г/день — протизапальна дія, підтримує шкірний бар'єр", "🥗 Ферментовані продукти (кімчі, кефір, йогурт) 3 рази/тиждень — мікробіом контролює запалення", "❌ Визнач тригери — алкоголь, глютен або молочне часто провокують реактивну шкіру і здуття"],
    },
  },
}

function getRootCauses(profile) {
  const skin = profile.skinSymptoms || []
  const hair = profile.hairSymptoms || []
  const body = profile.bodySymptoms || []
  const age  = profile.birthYear ? calcAge(profile.birthYear) : 35
  const s    = { cortisol: 0, estrogen: 0, protein: 0, pcos: 0, inflammation: 0 }

  if ((profile.stressLevel || 5) >= 7) s.cortisol += 2
  if ((profile.stressLevel || 5) >= 5) s.cortisol += 1
  if (profile.wakeNight === "yes")       s.cortisol += 2
  if (profile.wakeNight === "sometimes") s.cortisol += 1
  if (body.includes("belly"))    s.cortisol += 1
  if (body.includes("brainfog")) s.cortisol += 1
  if (body.includes("fatigue"))  s.cortisol += 1
  if (skin.includes("acne"))     s.cortisol += 1
  if (hair.includes("shedding")) s.cortisol += 1

  if (age >= 38) s.estrogen += 2
  if (age >= 35) s.estrogen += 1
  if (skin.includes("dry"))      s.estrogen += 1
  if (skin.includes("wrinkles")) s.estrogen += 1
  if (hair.includes("thinning")) s.estrogen += 2
  if (body.includes("libido"))   s.estrogen += 1
  if (body.includes("joints"))   s.estrogen += 1
  if (profile.sleepQuality === "poor") s.estrogen += 1

  if (profile.proteinIntake === "low")      s.protein += 3
  if (profile.proteinIntake === "moderate") s.protein += 1
  if (hair.includes("shedding"))  s.protein += 1
  if (hair.includes("dry"))       s.protein += 1
  if (body.includes("fatigue"))   s.protein += 1
  if (body.includes("recovery"))  s.protein += 1

  if (age <= 40) {
    if (skin.includes("acne"))     s.pcos += 2
    if (hair.includes("thinning")) s.pcos += 1
    if (body.includes("belly"))    s.pcos += 1
  }

  if (skin.includes("sensitive")) s.inflammation += 1
  if (skin.includes("acne"))      s.inflammation += 1
  if (body.includes("bloating"))  s.inflammation += 2
  if (body.includes("brainfog"))  s.inflammation += 1

  return Object.entries(s)
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => b.score - a.score)
    .filter(c => c.score > 0)
    .slice(0, 3)
}

function generateBeautyRoutine(profile, uk) {
  const skin        = profile.skinSymptoms || []
  const age         = profile.birthYear ? calcAge(profile.birthYear) : 35
  const phase       = getPhase(calcCycleDay(profile), parseInt(profile.cycleLength) || 28)
  const activePhase = phase === "follicular" || phase === "ovulation"

  if (skin.includes("acne")) return {
    morning: [
      { step: uk ? "Очищення" : "Cleanse", product: uk ? "Гелевий засіб із саліциловою кислотою 0.5–1%" : "Gel cleanser with salicylic acid 0.5–1%" },
      { step: uk ? "Сироватка"  : "Serum",   product: uk ? "Ніацинамід 10% + Цинк" : "Niacinamide 10% + Zinc" },
      { step: uk ? "Захист"     : "Protect", product: uk ? "Легкий SPF 30–50 без олій" : "Lightweight oil-free SPF 30–50" },
    ],
    evening: [
      { step: uk ? "Подвійне очищення" : "Double cleanse", product: uk ? "Міцелярна вода → гелевий засіб" : "Micellar water → gel cleanser" },
      { step: uk ? "Актив"      : "Active",   product: activePhase ? (uk ? "BHA сироватка (Cosrx, Paula's Choice)" : "BHA serum (Cosrx, Paula's Choice)") : (uk ? "Ніацинамід — без кислот у цю фазу" : "Niacinamide only — no acids this phase") },
      { step: uk ? "Зволоження" : "Moisturise", product: uk ? "Легкий крем з ніацинамідом" : "Light cream with niacinamide" },
    ],
  }

  if (skin.includes("dry") || skin.includes("wrinkles")) return {
    morning: [
      { step: uk ? "Очищення" : "Cleanse", product: uk ? "Кремовий засіб без SLS" : "Cream cleanser without SLS" },
      { step: uk ? "Сироватка"  : "Serum",   product: uk ? "Гіалуронова кислота 1–2% (на вологу шкіру)" : "Hyaluronic acid 1–2% (on damp skin)" },
      { step: uk ? "Захист"     : "Protect", product: uk ? "Зволожувальний SPF 30–50 з церамідами" : "Moisturising SPF 30–50 with ceramides" },
    ],
    evening: [
      { step: uk ? "Очищення"  : "Cleanse", product: uk ? "Бальзам або олія для очищення" : "Cleansing balm or oil" },
      { step: uk ? "Актив"     : "Active",  product: activePhase ? (age >= 35 ? (uk ? "Ретинол 0.025–0.05%" : "Retinol 0.025–0.05%") : (uk ? "Пептиди" : "Peptides")) : (uk ? "Пептиди — без ретинолу в цю фазу" : "Peptides — no retinol this phase") },
      { step: uk ? "Живлення"  : "Nourish", product: uk ? "Щільний крем з церамідами або сквалановою олією" : "Rich ceramide cream or squalane oil" },
    ],
  }

  return {
    morning: [
      { step: uk ? "Очищення" : "Cleanse", product: uk ? "М'який гель без SLS" : "Gentle gel cleanser without SLS" },
      { step: uk ? "Сироватка"  : "Serum",   product: uk ? "Вітамін C 10–15%" : "Vitamin C 10–15% (L-ascorbic acid)" },
      { step: uk ? "Захист"     : "Protect", product: uk ? "SPF 30–50 щодня (навіть вдома)" : "SPF 30–50 daily (even indoors)" },
    ],
    evening: [
      { step: uk ? "Очищення"   : "Cleanse",   product: uk ? "Той самий засіб або бальзам" : "Same cleanser or cleansing balm" },
      { step: uk ? "Актив"      : "Active",     product: activePhase ? (uk ? "Ретинол 0.05% або AHA 5–10%" : "Retinol 0.05% or AHA 5–10%") : (uk ? "Пептиди або ніацинамід — без кислот" : "Peptides or niacinamide — no acids") },
      { step: uk ? "Зволоження" : "Moisturise", product: uk ? "Крем з пептидами або гіалуроновою кислотою" : "Peptide or hyaluronic acid moisturiser" },
    ],
  }
}

function generateDailyTasks(profile, phaseKey, uk) {
  const sport = {
    menstrual:  { en: "Gentle yoga or walking 20 min",         uk: "Ніжна йога або ходьба 20 хв" },
    follicular: { en: "Cardio or dancing 30 min",              uk: "Кардіо або танці 30 хв" },
    ovulation:  { en: "HIIT or strength training 30 min",      uk: "HIIT або силові тренування 30 хв" },
    luteal:     { en: "Pilates or strength exercises 25 min",  uk: "Пілатес або силові вправи 25 хв" },
  }
  const L = uk ? "uk" : "en"
  return [
    { id: "beauty_am", icon: "🌅", title: uk ? "Ранкова рутина"  : "Morning routine",  detail: uk ? "Очищення → сироватка → SPF"       : "Cleanse → serum → SPF", done: false },
    { id: "sport",     icon: "🏃", title: uk ? "Рух"             : "Movement",         detail: sport[phaseKey][L],                                                 done: false },
    { id: "supps",     icon: "💊", title: uk ? "Добавки"         : "Supplements",      detail: uk ? "Магній + D3 + Омега-3"             : "Magnesium + D3 + Omega-3", done: false },
  ]
}

function getDefaultProtocol(uk) {
  return [
    { id: "cosm", icon: "💆", name: uk ? "Косметолог"  : "Cosmetologist", note: uk ? "Раз на місяць"      : "Once a month" },
    { id: "labs", icon: "🩸", name: uk ? "Аналізи"     : "Lab tests",     note: uk ? "Раз на 6 місяців"  : "Every 6 months" },
    { id: "led",  icon: "💡", name: uk ? "LED-маска"   : "LED mask",      note: uk ? "3–5x на тиждень"   : "3–5x per week" },
  ]
}

const PHASE_RECS = {
  menstrual:  {
    emoji: "🌙", color: "#9B8FE8",
    uk: { name: "Менструальна", tip: "Відпочинок — це продуктивність. Ніжні практики підтримують гормональний баланс.", sport: "Ніжна йога, ходьба", food: "Залізо: шпинат, сочевиця, яловичина", beauty: "Без ретинолу та кислот" },
    en: { name: "Menstrual",    tip: "Rest is productive. Gentle movement supports hormonal balance.", sport: "Gentle yoga, walking", food: "Iron: spinach, lentils, beef", beauty: "No retinol or acids" },
  },
  follicular: {
    emoji: "🌱", color: "#4ECBA8",
    uk: { name: "Фолікулярна", tip: "Енергія зростає — ідеальний час для нових цілей та ефективних тренувань.", sport: "Кардіо, танці, HIIT", food: "Хрестоцвіті, ферментовані продукти", beauty: "BHA сироватка, ретинол — зелене світло" },
    en: { name: "Follicular",   tip: "Energy is rising — the best time for new goals and intense training.", sport: "Cardio, dancing, HIIT", food: "Cruciferous veggies, fermented foods", beauty: "BHA serum, retinol — green light" },
  },
  ovulation:  {
    emoji: "✨", color: "#4A9EDF",
    uk: { name: "Овуляція",    tip: "Пік енергії та впевненості. Максимальна продуктивність і соціальна активність.", sport: "Силові тренування, HIIT", food: "Омега-3, яйця, горіхи", beauty: "Легкий зволожувальний крем + SPF" },
    en: { name: "Ovulation",   tip: "Peak energy and confidence. Maximum productivity and social drive.", sport: "Strength training, HIIT", food: "Omega-3, eggs, nuts", beauty: "Light moisturizer + SPF" },
  },
  luteal:     {
    emoji: "🍂", color: "#F59E3F",
    uk: { name: "Лютеальна",   tip: "Тіло готується. Підтримай себе магнієм та менш інтенсивними тренуваннями.", sport: "Пілатес, силові вправи, йога", food: "Магній: темний шоколад, банани, насіння", beauty: "Пептиди, ніацинамід — без кислот" },
    en: { name: "Luteal",      tip: "Your body is preparing. Support yourself with magnesium and lighter training.", sport: "Pilates, strength, yoga", food: "Magnesium: dark chocolate, bananas, seeds", beauty: "Peptides, niacinamide — no acids" },
  },
}

function getTimeTasks(timeFilter, phaseKey, uk) {
  if (timeFilter === "10") return [
    { id: "breath",   icon: "🫁", title: uk ? "4-7-8 дихання"    : "4-7-8 breathing",   detail: uk ? "3 хв — знижує кортизол"        : "3 min — lowers cortisol" },
    { id: "cold",     icon: "🚿", title: uk ? "Контрастний душ"   : "Cold/hot shower",   detail: uk ? "30с холодної води наприкінці"  : "End with 30s cold water" },
    { id: "sunlight", icon: "☀️", title: uk ? "Сонячне світло"    : "Morning sunlight",  detail: uk ? "5–10 хв вранці на вулиці"      : "5–10 min morning outdoor light" },
  ]
  if (timeFilter === "60") return [
    { id: "workout",  icon: "🏋️", title: uk ? "Тренування"        : "Workout",           detail: { menstrual: uk?"Йога 45 хв":"Yoga 45 min", follicular: uk?"Кардіо 45 хв":"Cardio 45 min", ovulation: uk?"HIIT 45 хв":"HIIT 45 min", luteal: uk?"Пілатес 45 хв":"Pilates 45 min" }[phaseKey] },
    { id: "mealprep", icon: "🥗", title: uk ? "Підготовка їжі"    : "Meal prep",         detail: uk ? "Приготуй білок + овочі на день" : "Prep protein + vegetables" },
    { id: "journal",  icon: "📔", title: uk ? "Рефлексія"         : "Journaling",        detail: uk ? "3 речі + медитація 15 хв"       : "3 things + 15 min meditation" },
  ]
  return generateDailyTasks({}, phaseKey, uk)
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
const S = {
  screen: {
    height: "100%",
    background: "linear-gradient(160deg, #F5F9FF 0%, #EBF4FF 55%, #F0FDF8 100%)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
    color: "#1A2433",
    position: "relative",
    overflow: "hidden",
  },
  card: {
    background: "rgba(255,255,255,0.78)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.92)",
    boxShadow: "0 4px 24px rgba(74,158,223,0.07)",
    padding: 20,
  },
  btnPrimary: {
    background: "linear-gradient(135deg, rgba(74,158,223,0.82) 0%, rgba(78,203,168,0.82) 100%)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.45)",
    borderRadius: 18,
    padding: "18px 32px",
    fontSize: 17,
    fontWeight: 700,
    cursor: "pointer",
    width: "100%",
    boxShadow: "0 8px 32px rgba(74,158,223,0.28), inset 0 1px 0 rgba(255,255,255,0.35)",
    fontFamily: "inherit",
    letterSpacing: "-0.2px",
  },
  btnGhost: {
    background: "rgba(74,158,223,0.07)",
    color: "#4A9EDF",
    border: "1px solid rgba(74,158,223,0.2)",
    borderRadius: 16,
    padding: "16px 32px",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
    fontFamily: "inherit",
  },
}

function Card({ children, style = {} }) {
  return <div style={{ ...S.card, ...style }}>{children}</div>
}

function Blob({ top, left, right, bottom, size = 240, color, blur = 60 }) {
  return (
    <div style={{
      position: "absolute", top, left, right, bottom,
      width: size, height: size, borderRadius: "50%",
      background: color, filter: `blur(${blur}px)`, pointerEvents: "none", zIndex: 0,
    }} />
  )
}

function Chip({ children, active, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 16px", borderRadius: 12, cursor: "pointer",
      border: active ? "1.5px solid #4A9EDF" : "1.5px solid rgba(107,122,141,0.18)",
      background: active ? "rgba(74,158,223,0.1)" : "rgba(255,255,255,0.6)",
      color: active ? "#4A9EDF" : "#6B7A8D",
      fontSize: 14, fontWeight: active ? 700 : 500,
      fontFamily: "inherit", transition: "all .15s",
      ...style,
    }}>
      {children}
    </button>
  )
}

function ProgressDots({ current, total }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 2,
          background: i < current ? "#4A9EDF" : "rgba(74,158,223,0.15)",
          transition: "background .3s",
        }} />
      ))}
    </div>
  )
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 36, height: 36, borderRadius: 10,
      background: "rgba(74,158,223,0.1)", border: "none",
      fontSize: 17, cursor: "pointer", color: "#4A9EDF",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>←</button>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: "#6B7A8D", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 12 }}>
      {children}
    </div>
  )
}

// ─── SCREEN 1: WELCOME ────────────────────────────────────────────────────────
function WelcomeScreen({ onStart, lang, onLangToggle }) {
  const uk = lang === "uk"
  return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column" }}>
      <Blob top={-80} right={-80} size={260} color="rgba(74,158,223,0.11)" />
      <Blob bottom={60} left={-60} size={200} color="rgba(78,203,168,0.09)" />

      {/* Top bar */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "48px 24px 0" }}>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px" }}>Alex</div>
        <button onClick={onLangToggle} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid rgba(74,158,223,0.25)", background: "rgba(255,255,255,0.7)", color: "#4A9EDF", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {uk ? "EN" : "UA"}
        </button>
      </div>

      {/* Hero */}
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
        <h1 style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.08, margin: "0 0 3px", letterSpacing: "-1.5px", color: "#1A2433" }}>
          {uk ? "AI-подруга" : "AI friend"}
        </h1>
        <h1 style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.08, margin: "0 0 16px", letterSpacing: "-1.5px", background: "linear-gradient(135deg, #4A9EDF, #4ECBA8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          {uk ? "у світі біохакінгу" : "in biohacking"}
        </h1>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#4ECBA8", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 16 }}>
          {uk ? "Біохакінг створений для жіночого тіла" : "Biohacking built for the female body"}
        </div>

        <p style={{ fontSize: 15, lineHeight: 1.55, color: "#6B7A8D", margin: 0, maxWidth: 300 }}>
          {uk
            ? "Твій персональний wellness-протокол. Синхронізований з циклом. Оновлюється щодня."
            : "Your personal wellness protocol. Synced with your cycle. Updated every day."}
        </p>
      </div>

      {/* CTA */}
      <div style={{ position: "relative", zIndex: 1, padding: "0 24px 44px" }}>
        <button onClick={onStart} style={S.btnPrimary}>
          {uk ? "Отримати мій протокол →" : "Get My Protocol →"}
        </button>
        <p style={{ textAlign: "center", fontSize: 12, color: "#6B7A8D", marginTop: 10 }}>
          {uk ? "Безкоштовно · 2 хвилини · Без реєстрації" : "Free · 2 minutes · No signup required"}
        </p>
      </div>
    </div>
  )
}

// ─── SCREEN 2: BODY AUDIT ────────────────────────────────────────────────────
const AUDIT_STEPS = ["skin", "hair", "body", "sleep", "nutrition", "cycle", "goal"]

const OPTIONS = {
  skin: [
    { id: "dry",       en: "Dryness / flakiness",       uk: "Сухість / лущення" },
    { id: "acne",      en: "Adult acne / breakouts",     uk: "Акне / висипання" },
    { id: "dull",      en: "Dull, uneven tone",          uk: "Тьмяна, нерівна текстура" },
    { id: "wrinkles",  en: "Fine lines / wrinkles",      uk: "Дрібні зморшки" },
    { id: "sensitive", en: "Sensitive / reactive",       uk: "Чутлива / реактивна" },
    { id: "oily",      en: "Oily T-zone",                uk: "Жирна Т-зона" },
    { id: "puffiness", en: "Dark circles / puffiness",   uk: "Темні кола / набряки" },
  ],
  hair: [
    { id: "thinning",  en: "Thinning / less volume",     uk: "Стоншення / менше об'єму" },
    { id: "shedding",  en: "Excess shedding",            uk: "Надмірне випадіння" },
    { id: "dry",       en: "Dry or brittle",             uk: "Сухе або ламке" },
    { id: "slow",      en: "Slow growth",                uk: "Повільний ріст" },
    { id: "oily",      en: "Oily scalp",                 uk: "Жирна шкіра голови" },
    { id: "texture",   en: "Changed texture",            uk: "Змінена текстура" },
  ],
  body: [
    { id: "belly",     en: "Belly weight gain",          uk: "Жир на животі" },
    { id: "fatigue",   en: "Constant fatigue",           uk: "Постійна втома" },
    { id: "brainfog",  en: "Brain fog",                  uk: "Туман в голові" },
    { id: "recovery",  en: "Poor muscle recovery",       uk: "Поганий відновлення м'язів" },
    { id: "libido",    en: "Low libido",                 uk: "Знижене лібідо" },
    { id: "joints",    en: "Joint stiffness / pain",     uk: "Скутість / біль у суглобах" },
    { id: "bloating",  en: "Bloating / digestive issues",uk: "Здуття / кишківник" },
  ],
  sleep: [
    { id: "great",     en: "Restful — wake refreshed",   uk: "Відновлюючий — прокидаюсь бадьорою" },
    { id: "ok",        en: "OK but could be better",     uk: "Нормально, але могло б бути краще" },
    { id: "poor",      en: "Poor — hard to sleep or stay asleep", uk: "Погано — важко заснути або прокидаюсь" },
  ],
  wake: [
    { id: "no",        en: "No, I sleep through",        uk: "Ні, сплю до ранку" },
    { id: "sometimes", en: "Sometimes",                  uk: "Іноді" },
    { id: "yes",       en: "Yes, often at 3–4am",        uk: "Так, часто о 3–4 ночі" },
  ],
  diet: [
    { id: "omni",  en: "🍖 Omnivore",    uk: "🍖 Всеїдна" },
    { id: "veg",   en: "🥗 Vegetarian",  uk: "🥗 Вегетаріанка" },
    { id: "vegan", en: "🌱 Vegan",       uk: "🌱 Веганка" },
    { id: "keto",  en: "🥑 Keto",        uk: "🥑 Кето" },
  ],
  protein: [
    { id: "low",      en: "Low — rarely think about protein",  uk: "Мало — рідко думаю про білок" },
    { id: "moderate", en: "Moderate — some protein each meal", uk: "Помірно — є білок у кожному прийомі" },
    { id: "high",     en: "Good — I prioritise 80g+/day",      uk: "Добре — пріоритизую 80г+/день" },
  ],
  contra: [
    { id: "none",         en: "No contraception",    uk: "Без контрацепції" },
    { id: "hormonal_pill",en: "Hormonal pill",        uk: "Гормональні таблетки" },
    { id: "hormonal_iud", en: "Hormonal IUD",         uk: "Гормональна спіраль" },
    { id: "copper_iud",   en: "Copper IUD",           uk: "Мідна спіраль" },
    { id: "barrier",      en: "Barrier method",       uk: "Бар'єрний метод" },
  ],
  goal: [
    { id: "skin",     en: "✨ Skin",               uk: "✨ Шкіра" },
    { id: "hair",     en: "💇 Hair",               uk: "💇 Волосся" },
    { id: "body",     en: "💪 Body composition",   uk: "💪 Склад тіла" },
    { id: "energy",   en: "⚡ Energy & mood",       uk: "⚡ Енергія і настрій" },
    { id: "sleep",    en: "😴 Sleep",               uk: "😴 Сон" },
    { id: "hormones", en: "🌸 Hormonal balance",    uk: "🌸 Гормональний баланс" },
    { id: "all",      en: "🎯 All of the above",    uk: "🎯 Все вищезазначене" },
  ],
}

const STEP_META = {
  en: {
    skin:      { title: "Skin",                  sub: "Noticed any of these in the past 3 months?" },
    hair:      { title: "Hair",                  sub: "What has changed recently?" },
    body:      { title: "Body & Energy",         sub: "What have you been experiencing?" },
    sleep:     { title: "Sleep & Stress",        sub: "Tell us about your sleep and stress" },
    nutrition: { title: "Nutrition",             sub: "Your eating style" },
    cycle:     { title: "Cycle & Contraception", sub: "Your cycle information" },
    goal:      { title: "Main Goal",             sub: "What do you most want to change?" },
  },
  uk: {
    skin:      { title: "Шкіра",                      sub: "Помічала щось із цього за останні 3 місяці?" },
    hair:      { title: "Волосся",                     sub: "Що змінилось останнім часом?" },
    body:      { title: "Тіло і енергія",              sub: "Що ти відчувала?" },
    sleep:     { title: "Сон і стрес",                 sub: "Розкажи про свій сон і стрес" },
    nutrition: { title: "Харчування і добавки",        sub: "Твій стиль харчування" },
    cycle:     { title: "Цикл і контрацепція",         sub: "Інформація про цикл" },
    goal:      { title: "Головна ціль",                sub: "Що найбільше хочеш змінити?" },
  },
}

function BodyAudit({ profile, setProfile, onDone, lang }) {
  const uk = lang === "uk"
  const L  = uk ? "uk" : "en"
  const [step, setStep] = useState(0)
  const [d, setD] = useState({
    name:         profile.name         || "",
    birthYear:    profile.birthYear    || "",
    skinSymptoms: profile.skinSymptoms || [],
    hairSymptoms: profile.hairSymptoms || [],
    bodySymptoms: profile.bodySymptoms || [],
    sleepQuality: profile.sleepQuality || "",
    wakeNight:    profile.wakeNight    || "",
    stressLevel:  profile.stressLevel  || 5,
    diet:         profile.diet         || "",
    proteinIntake:profile.proteinIntake|| "",
    lastPeriodDate: profile.lastPeriodDate || "",
    cycleLength:    profile.cycleLength  || "28",
    contraception:profile.contraception|| "none",
    mainGoal:     profile.mainGoal     || "",
  })

  const key = AUDIT_STEPS[step]
  const meta = STEP_META[L][key]

  function next() {
    if (step < AUDIT_STEPS.length - 1) { setStep(s => s + 1) }
    else { setProfile(p => ({ ...p, ...d })); onDone() }
  }

  const canNext = {
    skin:      true,
    hair:      true,
    body:      true,
    sleep:     d.sleepQuality && d.wakeNight,
    nutrition: d.diet && d.proteinIntake,
    cycle:     !!d.lastPeriodDate,
    goal:      !!d.mainGoal,
  }[key]

  const inputStyle = {
    width: "100%", padding: "14px 16px", borderRadius: 14,
    border: "1.5px solid rgba(74,158,223,0.2)",
    background: "rgba(255,255,255,0.85)", fontSize: 16,
    fontFamily: "inherit", color: "#1A2433", outline: "none",
    boxSizing: "border-box",
  }

  return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column" }}>
      <Blob top={-60} right={-60} size={200} color="rgba(74,158,223,0.09)" />

      {/* Header */}
      <div style={{ position: "relative", zIndex: 1, padding: "20px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, paddingTop: 32 }}>
          {step > 0 && <BackBtn onClick={() => setStep(s => s - 1)} />}
          <div style={{ flex: 1 }}><ProgressDots current={step + 1} total={AUDIT_STEPS.length} /></div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7A8D" }}>{step + 1}/{AUDIT_STEPS.length}</div>
        </div>
        <h2 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.8px", margin: "0 0 6px" }}>{meta.title}</h2>
        <p style={{ fontSize: 15, color: "#6B7A8D", margin: "0 0 28px", lineHeight: 1.5 }}>{meta.sub}</p>
      </div>

      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "0 24px" }}>

        {/* SKIN step — also collects name + birth year if not yet set */}
        {key === "skin" && (
          <>
            {!profile.name && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#6B7A8D", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>
                  {uk ? "Як тебе звати?" : "What's your name?"}
                </div>
                <input value={d.name} onChange={e => setD(x => ({ ...x, name: e.target.value }))}
                  placeholder={uk ? "Наприклад: Євгенія" : "E.g. Sarah"} style={inputStyle} />
                <div style={{ fontSize: 11, fontWeight: 800, color: "#6B7A8D", letterSpacing: "1px", textTransform: "uppercase", margin: "16px 0 8px" }}>
                  {uk ? "Рік народження" : "Birth year"}
                </div>
                <input value={d.birthYear} onChange={e => setD(x => ({ ...x, birthYear: e.target.value }))}
                  placeholder="1987" type="number" style={inputStyle} />
                <div style={{ height: 24 }} />
              </div>
            )}
            <SectionLabel>{uk ? "Симптоми шкіри" : "Skin symptoms"}</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {OPTIONS.skin.map(o => (
                <Chip key={o.id} active={d.skinSymptoms.includes(o.id)} onClick={() => setD(x => ({ ...x, skinSymptoms: toggle(x.skinSymptoms, o.id) }))}>{o[L]}</Chip>
              ))}
              <Chip active={d.skinSymptoms.length === 0} onClick={() => setD(x => ({ ...x, skinSymptoms: [] }))}>{uk ? "Все добре" : "All good"}</Chip>
            </div>
          </>
        )}

        {key === "hair" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {OPTIONS.hair.map(o => (
              <Chip key={o.id} active={d.hairSymptoms.includes(o.id)} onClick={() => setD(x => ({ ...x, hairSymptoms: toggle(x.hairSymptoms, o.id) }))}>{o[L]}</Chip>
            ))}
            <Chip active={d.hairSymptoms.length === 0} onClick={() => setD(x => ({ ...x, hairSymptoms: [] }))}>{uk ? "Все добре" : "All good"}</Chip>
          </div>
        )}

        {key === "body" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {OPTIONS.body.map(o => (
              <Chip key={o.id} active={d.bodySymptoms.includes(o.id)} onClick={() => setD(x => ({ ...x, bodySymptoms: toggle(x.bodySymptoms, o.id) }))}>{o[L]}</Chip>
            ))}
            <Chip active={d.bodySymptoms.length === 0} onClick={() => setD(x => ({ ...x, bodySymptoms: [] }))}>{uk ? "Все добре" : "All good"}</Chip>
          </div>
        )}

        {key === "sleep" && (
          <>
            <SectionLabel>{uk ? "Якість сну" : "Sleep quality"}</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              {OPTIONS.sleep.map(o => (
                <Chip key={o.id} active={d.sleepQuality === o.id} onClick={() => setD(x => ({ ...x, sleepQuality: o.id }))} style={{ textAlign: "left" }}>{o[L]}</Chip>
              ))}
            </div>
            <SectionLabel>{uk ? "Прокидаєшся о 3–4 ночі?" : "Wake at 3–4am?"}</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              {OPTIONS.wake.map(o => (
                <Chip key={o.id} active={d.wakeNight === o.id} onClick={() => setD(x => ({ ...x, wakeNight: o.id }))}>{o[L]}</Chip>
              ))}
            </div>
            <SectionLabel>{uk ? `Рівень стресу: ${d.stressLevel}/10` : `Stress level: ${d.stressLevel}/10`}</SectionLabel>
            <input type="range" min={1} max={10} value={d.stressLevel}
              onChange={e => setD(x => ({ ...x, stressLevel: parseInt(e.target.value) }))}
              style={{ width: "100%", accentColor: "#4A9EDF" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7A8D", marginTop: 4 }}>
              <span>{uk ? "Розслаблено" : "Relaxed"}</span><span>{uk ? "Максимум" : "Maximum"}</span>
            </div>
          </>
        )}

        {key === "nutrition" && (
          <>
            <SectionLabel>{uk ? "Стиль харчування" : "Eating style"}</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
              {OPTIONS.diet.map(o => (
                <Chip key={o.id} active={d.diet === o.id} onClick={() => setD(x => ({ ...x, diet: o.id }))}>{o[L]}</Chip>
              ))}
            </div>
            <SectionLabel>{uk ? "Щоденний білок" : "Daily protein"}</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {OPTIONS.protein.map(o => (
                <Chip key={o.id} active={d.proteinIntake === o.id} onClick={() => setD(x => ({ ...x, proteinIntake: o.id }))}>{o[L]}</Chip>
              ))}
            </div>
          </>
        )}

        {key === "cycle" && (
          <>
            <SectionLabel>{uk ? "Перший день останніх місячних" : "First day of last period"}</SectionLabel>
            <input
              value={d.lastPeriodDate}
              onChange={e => setD(x => ({ ...x, lastPeriodDate: e.target.value }))}
              type="date"
              max={todayStr()}
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            {d.lastPeriodDate && (
              <div style={{ ...S.card, marginBottom: 20, background: "rgba(74,158,223,0.07)", border: "1px solid rgba(74,158,223,0.14)", padding: "12px 16px" }}>
                {(() => {
                  const tempProfile = { lastPeriodDate: d.lastPeriodDate, cycleLength: d.cycleLength }
                  const cd = calcCycleDay(tempProfile)
                  const ph = getPhase(cd, parseInt(d.cycleLength) || 28)
                  const phName = { menstrual: uk?"Менструальна":"Menstrual", follicular: uk?"Фолікулярна":"Follicular", ovulation: uk?"Овуляція":"Ovulation", luteal: uk?"Лютеальна":"Luteal" }[ph]
                  return <div style={{ fontSize: 13, color: "#4A9EDF", fontWeight: 600 }}>{uk ? `Сьогодні день ${cd} · ` : `Today is day ${cd} · `}<b>{phName}</b>{uk ? " фаза" : " phase"}</div>
                })()}
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>{uk ? "Довжина циклу (днів)" : "Cycle length (days)"}</SectionLabel>
              <input value={d.cycleLength} onChange={e => setD(x => ({ ...x, cycleLength: e.target.value }))}
                placeholder="28" type="number" style={inputStyle} />
            </div>
            <SectionLabel>{uk ? "Контрацепція" : "Contraception"}</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {OPTIONS.contra.map(o => (
                <Chip key={o.id} active={d.contraception === o.id} onClick={() => setD(x => ({ ...x, contraception: o.id }))}>{o[L]}</Chip>
              ))}
            </div>
          </>
        )}

        {key === "goal" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {OPTIONS.goal.map(o => (
              <Chip key={o.id} active={d.mainGoal === o.id} onClick={() => setD(x => ({ ...x, mainGoal: o.id }))}>{o[L]}</Chip>
            ))}
          </div>
        )}

        <div style={{ height: 120 }} />
      </div>

      <div style={{ position: "sticky", bottom: 0, zIndex: 2, padding: "16px 24px 44px", background: "linear-gradient(0deg, #F5F9FF 65%, transparent)" }}>
        <button onClick={next} disabled={!canNext} style={{ ...S.btnPrimary, opacity: canNext ? 1 : 0.45 }}>
          {step < AUDIT_STEPS.length - 1
            ? (uk ? "Далі →" : "Next →")
            : (uk ? "Показати причини →" : "Show Root Causes →")}
        </button>
      </div>
    </div>
  )
}

// ─── SCREEN 3: PAYWALL ────────────────────────────────────────────────────────
function PaywallScreen({ profile, onContinueFree, onBack, lang }) {
  const uk     = lang === "uk"
  const causes = getRootCauses(profile)

  return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column" }}>
      <Blob top={-60} right={-40} size={220} color="rgba(78,203,168,0.1)" />

      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "52px 24px 40px" }}>
        <BackBtn onClick={onBack} />
        <div style={{ height: 20 }} />

        <div style={{ fontSize: 12, fontWeight: 800, color: "#4ECBA8", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 10 }}>
          {uk ? "РЕЗУЛЬТАТ АУДИТУ" : "AUDIT RESULTS"}
        </div>
        <h2 style={{ fontSize: 34, fontWeight: 900, margin: "0 0 8px", letterSpacing: "-1px" }}>
          {uk ? `Знайдено ${causes.length} причини` : `Found ${causes.length} root causes`}
        </h2>
        <p style={{ fontSize: 15, color: "#6B7A8D", margin: "0 0 28px" }}>
          {uk ? "AI з'єднав твої симптоми і визначив першопричини" : "AI connected your symptoms and found the root causes"}
        </p>

        {causes.map((c, i) => {
          const cd = CAUSE_DATA[c.key]
          const L  = uk ? "uk" : "en"
          return (
            <div key={c.key} style={{ position: "relative", marginBottom: 12 }}>
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, rgba(74,158,223,0.12), rgba(78,203,168,0.12))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                    {cd.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{cd.title[L]}</div>
                    <div style={{ fontSize: 13, color: "#6B7A8D" }}>{cd.subtitle[L]}</div>
                  </div>
                </div>
              </Card>
              {i > 0 && (
                <div style={{ position: "absolute", inset: 0, backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)", background: "rgba(245,249,255,0.72)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>🔒</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#4A9EDF" }}>{uk ? "Преміум" : "Premium"}</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Pricing */}
        <Card style={{ marginTop: 28, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#4ECBA8", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 16 }}>
            {uk ? "ПОВНИЙ ДОСТУП" : "FULL ACCESS"}
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, padding: "16px 12px", borderRadius: 14, border: "2px solid #4A9EDF", background: "rgba(74,158,223,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900 }}>$19</div>
              <div style={{ fontSize: 12, color: "#6B7A8D" }}>{uk ? "/ місяць" : "/ month"}</div>
            </div>
            <div style={{ flex: 1, padding: "16px 12px", borderRadius: 14, border: "1.5px solid rgba(74,158,223,0.2)", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900 }}>$29</div>
              <div style={{ fontSize: 12, color: "#6B7A8D" }}>{uk ? "один раз" : "one-time"}</div>
            </div>
          </div>
          <button style={S.btnPrimary}>{uk ? "Отримати повний звіт →" : "Get Full Report →"}</button>
        </Card>

        <button onClick={onContinueFree} style={S.btnGhost}>{uk ? "Продовжити безкоштовно (бета)" : "Continue Free (beta)"}</button>

        <p style={{ textAlign: "center", fontSize: 11, color: "#6B7A8D", margin: "16px 0 32px", lineHeight: 1.6 }}>
          {uk ? "Не є медичною порадою. Завжди консультуйся з лікарем." : "Not medical advice. Always consult your doctor."}
        </p>
      </div>
    </div>
  )
}

// ─── SCREEN 4: FULL REPORT ────────────────────────────────────────────────────
const PHASE_NAMES = {
  menstrual:  { en: "Menstrual",  uk: "Менструальна", emoji: "🌙" },
  follicular: { en: "Follicular", uk: "Фолікулярна",  emoji: "🌱" },
  ovulation:  { en: "Ovulation",  uk: "Овуляція",     emoji: "✨" },
  luteal:     { en: "Luteal",     uk: "Лютеальна",    emoji: "🍂" },
}

function ReportScreen({ profile, onDone, lang }) {
  const uk       = lang === "uk"
  const L        = uk ? "uk" : "en"
  const causes   = getRootCauses(profile)
  const phaseKey = getPhase(parseInt(profile.cycleDay) || 14, parseInt(profile.cycleLength) || 28)
  const beauty   = generateBeautyRoutine(profile, uk)
  const protocol = getDefaultProtocol(uk)
  const phase    = PHASE_NAMES[phaseKey]

  const weekTasks = uk ? [
    { time: "Ранок", action: "Магній гліцинат 300мг + D3 2000МО з їжею" },
    { time: "День",  action: causes[0] ? CAUSE_DATA[causes[0].key].protocol.uk[1] : "Омега-3 2г з обідом" },
    { time: "Вечір", action: "Вечірня рутина + без екранів за 1г до сну" },
  ] : [
    { time: "Morning", action: "Magnesium glycinate 300mg + D3 2000IU with food" },
    { time: "Day",     action: causes[0] ? CAUSE_DATA[causes[0].key].protocol.en[1] : "Omega-3 2g with lunch" },
    { time: "Evening", action: "Evening skincare routine + no screens 1h before bed" },
  ]

  const doctorQs = uk ? [
    "Перевірте мій феритин окремо від загального аналізу крові",
    "Перевірте рівень Вітаміну D3 та щитовидну залозу (TSH, T3/T4)",
    "Зробіть гормональний профіль: естрадіол, прогестерон (день 3 циклу)",
  ] : [
    "Please test my ferritin separately from the general blood panel",
    "Check Vitamin D3 level and thyroid (TSH, T3/T4)",
    "Run a hormone panel: estradiol, progesterone (cycle day 3)",
  ]

  return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column" }}>
      <Blob top={-60} left={-60} size={220} color="rgba(74,158,223,0.08)" />

      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "52px 24px 48px" }}>

        {/* Header */}
        <div style={{ fontSize: 12, fontWeight: 800, color: "#4A9EDF", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 10 }}>
          {uk ? "ПЕРСОНАЛЬНИЙ ЗВІТ" : "PERSONAL REPORT"}
        </div>
        <h2 style={{ fontSize: 30, fontWeight: 900, margin: "0 0 6px", letterSpacing: "-0.8px" }}>
          {profile.name ? (uk ? `${profile.name}, ось твій звіт` : `${profile.name}, here's your report`) : (uk ? "Твій звіт" : "Your Report")}
        </h2>
        <div style={{ fontSize: 14, color: "#6B7A8D", marginBottom: 32 }}>
          {phase.emoji} {uk ? phase.uk : phase.en} {uk ? "фаза" : "phase"} · {uk ? `День ${profile.cycleDay || 14}` : `Day ${profile.cycleDay || 14}`}
        </div>

        {/* Section: Root Causes */}
        <SectionLabel>{uk ? "3 ПРИЧИНИ" : "ROOT CAUSES"}</SectionLabel>
        {causes.map((c, i) => {
          const cd = CAUSE_DATA[c.key]
          return (
            <Card key={c.key} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, rgba(74,158,223,0.13), rgba(78,203,168,0.13))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                  {cd.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{cd.title[L]}</div>
                  <div style={{ fontSize: 12, color: "#6B7A8D" }}>{cd.subtitle[L]}</div>
                </div>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#4A9EDF", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>{i + 1}</div>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: "#6B7A8D", margin: "0 0 14px" }}>{cd.body[L]}</p>
              <div style={{ borderTop: "1px solid rgba(74,158,223,0.1)", paddingTop: 12 }}>
                {cd.protocol[L].map((p, j) => (
                  <div key={j} style={{ fontSize: 13, color: "#1A2433", marginBottom: j < 2 ? 8 : 0, lineHeight: 1.55 }}>{p}</div>
                ))}
              </div>
            </Card>
          )
        })}

        {/* Section: Week protocol */}
        <div style={{ height: 24 }} />
        <SectionLabel>{uk ? "ПРОТОКОЛ ТИЖНЯ" : "WEEKLY PROTOCOL"}</SectionLabel>
        <Card style={{ marginBottom: 12 }}>
          {weekTasks.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 14, marginBottom: i < weekTasks.length - 1 ? 14 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#4A9EDF", textTransform: "uppercase", minWidth: 52, paddingTop: 1, flexShrink: 0 }}>{item.time}</div>
              <div style={{ fontSize: 13, color: "#1A2433", lineHeight: 1.55 }}>{item.action}</div>
            </div>
          ))}
        </Card>

        {/* Section: Beauty routine */}
        <div style={{ height: 24 }} />
        <SectionLabel>{uk ? "БЬЮТІ РУТИНА" : "BEAUTY ROUTINE"}</SectionLabel>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          {[
            { label: uk ? "🌅 Ранок" : "🌅 Morning", steps: beauty.morning },
            { label: uk ? "🌙 Вечір" : "🌙 Evening", steps: beauty.evening },
          ].map(col => (
            <Card key={col.label} style={{ flex: 1, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#4A9EDF", marginBottom: 14 }}>{col.label}</div>
              {col.steps.map((s, i) => (
                <div key={i} style={{ marginBottom: i < col.steps.length - 1 ? 12 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#4ECBA8", textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.step}</div>
                  <div style={{ fontSize: 12, color: "#1A2433", marginTop: 3, lineHeight: 1.45 }}>{s.product}</div>
                </div>
              ))}
            </Card>
          ))}
        </div>

        {/* Section: Gadget */}
        <div style={{ height: 24 }} />
        <SectionLabel>{uk ? "РЕКОМЕНДОВАНИЙ ГАДЖЕТ" : "RECOMMENDED GADGET"}</SectionLabel>
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Oura Ring Gen 4 (~$350)</div>
          <div style={{ fontSize: 13, color: "#6B7A8D", lineHeight: 1.55 }}>
            {uk ? "Відстежує HRV, якість сну і температуру тіла — підтверджує фази циклу реальними даними. Morning HRV покаже рівень відновлення щодня." : "Tracks HRV, sleep quality and body temperature — confirms cycle phases with real data. Morning HRV shows your daily recovery level."}
          </div>
        </Card>

        {/* Section: Ask your doctor */}
        <div style={{ height: 24 }} />
        <SectionLabel>{uk ? "ЗАПИТАЙ ЛІКАРЯ" : "ASK YOUR DOCTOR"}</SectionLabel>
        <Card style={{ marginBottom: 12 }}>
          {doctorQs.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < doctorQs.length - 1 ? 14 : 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(74,158,223,0.12)", color: "#4A9EDF", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontSize: 13, color: "#1A2433", lineHeight: 1.55 }}>{q}</div>
            </div>
          ))}
        </Card>

        {/* Section: My protocol */}
        <div style={{ height: 24 }} />
        <SectionLabel>{uk ? "МІЙ ПРОТОКОЛ" : "MY PROTOCOL"}</SectionLabel>
        {protocol.map(p => (
          <Card key={p.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 22 }}>{p.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "#6B7A8D" }}>{p.note}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4A9EDF", padding: "4px 10px", borderRadius: 8, background: "rgba(74,158,223,0.1)" }}>
              {uk ? "Нагадай" : "Remind"}
            </div>
          </Card>
        ))}

        {/* Disclaimer */}
        <p style={{ textAlign: "center", fontSize: 11, color: "#6B7A8D", margin: "24px 0 16px", lineHeight: 1.7 }}>
          {uk
            ? "Цей звіт носить освітній характер і не є медичною порадою. Завжди консультуйся з лікарем перед змінами у протоколах здоров'я."
            : "This report is for educational purposes and is not medical advice. Always consult your doctor before making changes to your health protocol."}
        </p>

        <button onClick={onDone} style={S.btnPrimary}>
          {uk ? "Перейти до щоденника →" : "Go to Daily Dashboard →"}
        </button>
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

// ─── SCREEN 5: DAILY DASHBOARD ────────────────────────────────────────────────
const PHASE_UI = {
  menstrual:  { emoji: "🌙", color: "#9B8FE8", uk: "Менструальна", en: "Menstrual" },
  follicular: { emoji: "🌱", color: "#4ECBA8", uk: "Фолікулярна",  en: "Follicular" },
  ovulation:  { emoji: "✨", color: "#4A9EDF", uk: "Овуляція",     en: "Ovulation" },
  luteal:     { emoji: "🍂", color: "#F59E3F", uk: "Лютеальна",    en: "Luteal" },
}

function DashboardScreen({ profile, history, onCheckIn, onChat, onProgress, onProfile, lang }) {
  const uk           = lang === "uk"
  const cycleDay     = calcCycleDay(profile)
  const phaseKey     = getPhase(cycleDay, parseInt(profile.cycleLength) || 28)
  const phase        = PHASE_UI[phaseKey]
  const phaseRec     = PHASE_RECS[phaseKey]
  const [activityDays, setActivityDays] = useState(() => lsGet("vive_activity_days", []))
  const streak       = calcStreak(history, activityDays)
  const [timeFilter, setTimeFilter] = useState("30")
  const tasks        = getTimeTasks(timeFilter, phaseKey, uk)
  const protocol     = getDefaultProtocol(uk)

  const [done, setDone] = useState(() => {
    const saved = lsGet("vive_tasks_done", { date: "", done: [] })
    return saved.date === todayStr() ? saved.done : []
  })
  const [protocolDone, setProtocolDone] = useState(() => {
    const saved = lsGet("vive_protocol_done", { date: "", done: [] })
    return saved.date === todayStr() ? saved.done : []
  })

  function markTask(taskId) {
    const wasDone = done.includes(taskId)
    const newDone = wasDone ? done.filter(x => x !== taskId) : [...done, taskId]
    setDone(newDone)
    lsSet("vive_tasks_done", { date: todayStr(), done: newDone })
    if (!wasDone && done.length === 0) {
      const today = todayStr()
      if (!activityDays.includes(today)) {
        const updated = [...activityDays, today]
        setActivityDays(updated)
        lsSet("vive_activity_days", updated)
      }
    }
  }

  function markProtocol(id) {
    const isPDone = protocolDone.includes(id)
    const newDone = isPDone ? protocolDone.filter(x => x !== id) : [...protocolDone, id]
    setProtocolDone(newDone)
    lsSet("vive_protocol_done", { date: todayStr(), done: newDone })
  }

  const h = new Date().getHours()
  const greeting = h < 12 ? (uk ? "Доброго ранку" : "Good morning") : h < 18 ? (uk ? "Доброго дня" : "Good afternoon") : (uk ? "Доброго вечора" : "Good evening")

  return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column" }}>
      <Blob top={-60} right={-40} size={200} color="rgba(74,158,223,0.09)" />

      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "52px 24px 120px" }}>

        {/* Greeting + profile icon */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, color: "#6B7A8D", marginBottom: 4 }}>{greeting} 👋</div>
            <h2 style={{ fontSize: 30, fontWeight: 900, margin: 0, letterSpacing: "-0.8px" }}>
              {profile.name || (uk ? "Привіт!" : "Hi!")}
            </h2>
          </div>
          <button onClick={onProfile} style={{
            width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer", marginTop: 4,
            background: "linear-gradient(135deg, rgba(74,158,223,0.15), rgba(78,203,168,0.15))",
            fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(74,158,223,0.15)",
          }}>
            👤
          </button>
        </div>

        {/* Phase banner */}
        <div style={{ ...S.card, marginBottom: 20, background: `linear-gradient(135deg, ${phaseRec.color}12, ${phaseRec.color}06)`, border: `1px solid ${phaseRec.color}30`, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 22 }}>{phaseRec.emoji}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: phaseRec.color, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {uk ? `День ${cycleDay} циклу` : `Cycle day ${cycleDay}`}
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#1A2433" }}>
                {uk ? phaseRec.uk.name : phaseRec.en.name}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#6B7A8D", lineHeight: 1.55 }}>
            {uk ? phaseRec.uk.tip : phaseRec.en.tip}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {[
              { icon: "🏃", label: uk ? phaseRec.uk.sport   : phaseRec.en.sport },
              { icon: "🥗", label: uk ? phaseRec.uk.food    : phaseRec.en.food },
              { icon: "✨", label: uk ? phaseRec.uk.beauty  : phaseRec.en.beauty },
            ].map(tag => (
              <div key={tag.icon} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#1A2433", fontWeight: 600, padding: "3px 8px", borderRadius: 8, background: `${phaseRec.color}18` }}>
                {tag.icon} {tag.label}
              </div>
            ))}
          </div>
        </div>

        {/* Streak card */}
        <Card style={{ marginBottom: 20, textAlign: "center", background: "linear-gradient(135deg, rgba(74,158,223,0.08), rgba(78,203,168,0.08))" }}>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, color: "#4A9EDF", letterSpacing: "-2px" }}>{streak}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#1A2433", marginTop: 6 }}>
            {uk ? (streak === 1 ? "🔥 день підряд" : streak < 5 ? "🔥 дні підряд" : "🔥 днів підряд") : (streak === 1 ? "🔥 day in a row" : "🔥 days in a row")}
          </div>
          <div style={{ fontSize: 13, color: "#6B7A8D", marginTop: 4 }}>
            {streak === 0 ? (uk ? "Зроби перший check-in!" : "Complete your first check-in!") : streak < 7 ? (uk ? "Ти формуєш звичку 🌱" : "You're building a habit 🌱") : (uk ? "Відмінна робота! 🔥" : "Outstanding! 🔥")}
          </div>
        </Card>

        {/* Time filter */}
        <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7A8D", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8 }}>
          {uk ? "Скільки часу маєш сьогодні?" : "How much time do you have?"}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["10", uk ? "10 хв" : "10 min"], ["30", uk ? "30 хв" : "30 min"], ["60", uk ? "1 год" : "1 hr"]].map(([val, label]) => (
            <button key={val} onClick={() => setTimeFilter(val)} style={{
              flex: 1, padding: "8px 0", borderRadius: 12, fontSize: 13, fontWeight: timeFilter === val ? 800 : 500,
              border: timeFilter === val ? "1.5px solid #4A9EDF" : "1.5px solid rgba(107,122,141,0.18)",
              background: timeFilter === val ? "rgba(74,158,223,0.1)" : "rgba(255,255,255,0.6)",
              color: timeFilter === val ? "#4A9EDF" : "#6B7A8D", cursor: "pointer", fontFamily: "inherit",
            }}>{label}</button>
          ))}
        </div>

        {/* Today's tasks */}
        <SectionLabel>{uk ? "СЬОГОДНІ" : "TODAY"}</SectionLabel>
        {tasks.map(task => {
          const isDone = done.includes(task.id)
          return (
            <div key={task.id} onClick={() => markTask(task.id)}
              style={{ ...S.card, marginBottom: 10, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", opacity: isDone ? 0.55 : 1, transition: "opacity .2s" }}>
              <div style={{ fontSize: 22 }}>{task.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, textDecoration: isDone ? "line-through" : "none" }}>{task.title}</div>
                <div style={{ fontSize: 12, color: "#6B7A8D" }}>{task.detail}</div>
              </div>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${isDone ? "#4ECBA8" : "rgba(74,158,223,0.3)"}`, background: isDone ? "#4ECBA8" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, transition: "all .2s" }}>
                {isDone ? "✓" : ""}
              </div>
            </div>
          )
        })}

        {/* Ask Alex */}
        <button onClick={onChat} style={{ ...S.card, marginTop: 8, marginBottom: 24, width: "100%", border: "1.5px solid rgba(74,158,223,0.25)", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, textAlign: "left", background: "rgba(74,158,223,0.04)", boxSizing: "border-box" }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: "linear-gradient(135deg, #4A9EDF, #4ECBA8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🤖</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{uk ? "Запитати Alex" : "Ask Alex"}</div>
            <div style={{ fontSize: 12, color: "#6B7A8D" }}>{uk ? "Твоя AI-подруга відповість зараз" : "Your AI friend is here for you"}</div>
          </div>
          <div style={{ fontSize: 18, color: "#4A9EDF" }}>→</div>
        </button>

        {/* Protocol */}
        <SectionLabel>{uk ? "МІЙ ПРОТОКОЛ" : "MY PROTOCOL"}</SectionLabel>
        <div style={{ fontSize: 12, color: "#6B7A8D", marginBottom: 12, marginTop: -4 }}>
          {uk ? "Торкніться щоб відмітити як виконано / заплановано" : "Tap to mark as done / scheduled"}
        </div>
        {protocol.map(p => {
          const isPDone = protocolDone.includes(p.id)
          return (
            <div key={p.id}
              onClick={() => markProtocol(p.id)}
              style={{ ...S.card, marginBottom: 8, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", opacity: isPDone ? 0.65 : 1, transition: "opacity .2s" }}>
              <div style={{ fontSize: 20 }}>{p.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, textDecoration: isPDone ? "line-through" : "none" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "#6B7A8D" }}>{isPDone ? (uk ? "Виконано ✓" : "Done ✓") : p.note}</div>
              </div>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                border: `2px solid ${isPDone ? "#4ECBA8" : "rgba(74,158,223,0.3)"}`,
                background: isPDone ? "#4ECBA8" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 14, fontWeight: 700,
                flexShrink: 0, transition: "all .2s",
              }}>
                {isPDone ? "✓" : ""}
              </div>
            </div>
          )
        })}
      </div>

      <BottomNav active="home" onCheckIn={onCheckIn} onProgress={onProgress} onChat={onChat} uk={uk} />
    </div>
  )
}

// ─── SCREEN 6: AI CHAT (LUMI) ─────────────────────────────────────────────────
const QA_PAIRS = [
  {
    triggers: ["втом", "tired", "sleep", "сон"],
    q: { uk: "Чому я втомлена попри нормальний сон?", en: "Why am I tired despite normal sleep?" },
    a: {
      uk: "Часто хронічна втома попри нормальний сон вказує на три речі: дефіцит заліза (важливо перевірити феритин, а не просто загальний аналіз), субоптимальний рівень D3, або лютеальна фаза. Спробуй магній гліцинат 300мг перед сном — якщо є кортизол-спайк о 3-4 ночі, це перший крок. Розкажи — ти прокидаєшся вночі?",
      en: "Chronic fatigue despite normal sleep often points to three things: iron deficiency (check ferritin specifically, not just general blood work), suboptimal Vitamin D3, or the luteal phase. Try magnesium glycinate 300mg before bed — if you have a cortisol spike at 3–4am, that's your first fix. Do you wake at night?",
    },
  },
  {
    triggers: ["волос", "hair", "випадін", "shedding"],
    q: { uk: "Що робити з випадінням волосся?", en: "What can I do about hair shedding?" },
    a: {
      uk: "Перша зупинка — феритин. Більшість жінок отримують «залізо в нормі» але феритин під 70 вже провокує випадіння. Друга — TSH: щитовидна регулює цикл фолікулів. І білок — 1.6г на кг ваги щодня. Три аналізи, які я б здала першими: феритин, TSH, D3. Що вже перевіряла?",
      en: "First stop — ferritin. Most women get 'iron is fine' on labs, but ferritin under 70 already causes shedding. Second — TSH: thyroid regulates the hair follicle cycle. And protein — 1.6g per kg bodyweight daily. Three labs I'd check first: ferritin, TSH, D3. What have you already tested?",
    },
  },
  {
    triggers: ["магн", "magnes"],
    q: { uk: "Як зрозуміти що є дефіцит магнію?", en: "How do I know if I have magnesium deficiency?" },
    a: {
      uk: "Класичні ознаки: нічні пробудження о 3–4, судоми в ногах, тяга до шоколаду, ПМС, тривожність, відчуття що серце «підстрибує». Аналіз крові не покаже дефіцит — магній живе в клітинах, не в плазмі. Просто спробуй 300мг гліцинату перед сном 2 тижні — якщо сон покращиться, відповідь очевидна.",
      en: "Classic signs: waking at 3–4am, leg cramps, craving chocolate, PMS, anxiety, heart flutters. Blood tests won't show deficiency — magnesium lives in cells, not plasma. Just try 300mg glycinate before bed for 2 weeks — if sleep improves, you have your answer.",
    },
  },
  {
    triggers: ["шкір", "skin", "акне", "acne", "зморш", "wrinkle"],
    q: { uk: "Чому шкіра стала гіршою після 35?", en: "Why has my skin changed after 35?" },
    a: {
      uk: "Після 35 естроген починає коливатися — він стимулює колаген на 76% і регулює гідратацію шкіри. Три зміни що дають результат: ретинол 0.025% увечері (тільки у фолікулярну/овуляторну фазу), вітамін C 10% вранці, магній для якісного сну — бо сон = відновлення шкіри. З чого починати?",
      en: "After 35, estrogen starts fluctuating — it stimulates collagen by 76% and regulates skin hydration. Three changes that work: retinol 0.025% at night (follicular/ovulation phase only), Vitamin C 10% in the morning, magnesium for quality sleep — because sleep = skin repair. Where do you want to start?",
    },
  },
]

function ChatScreen({ profile, lang, onBack, onCheckIn, onProgress }) {
  const uk = lang === "uk"
  const [messages, setMessages] = useState([{
    role: "lumi",
    text: uk
      ? `Привіт${profile.name ? `, ${profile.name}` : ""}! Я Alex — твоя AI-подруга 🌿 Знаю твій цикл, симптоми і цілі. Запитай мене про що завгодно — шкіра, волосся, гормони, енергія.`
      : `Hey${profile.name ? ` ${profile.name}` : ""}! I'm Alex — your AI wellness friend 🌿 I know your cycle, symptoms and goals. Ask me anything — skin, hair, hormones, energy.`,
  }])
  const [input, setInput] = useState("")
  const bottomRef = useRef(null)
  const L = uk ? "uk" : "en"

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  function send(text) {
    if (!text.trim()) return
    const userMsg = { role: "user", text: text.trim() }
    const t = text.toLowerCase()
    const match = QA_PAIRS.find(qa => qa.triggers.some(tr => t.includes(tr)))
    const reply = {
      role: "lumi",
      text: match
        ? match.a[L]
        : (uk
            ? "Гарне питання! Я зараз у бета-режимі — повні відповіді з Claude API незабаром. Але розкажи детальніше — що саме відчуваєш? Я спробую допомогти вже зараз. 💙"
            : "Great question! I'm in beta mode — full Claude API integration coming soon. But tell me more — what exactly are you experiencing? I'll try to help right now. 💙"),
    }
    setMessages(m => [...m, userMsg, reply])
    setInput("")
  }

  return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column" }}>
      {/* Header — opaque, always visible */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "52px 20px 14px", background: "#F5F9FF", borderBottom: "1px solid rgba(74,158,223,0.12)", flexShrink: 0 }}>
        <BackBtn onClick={onBack} />
        <div style={{ width: 42, height: 42, borderRadius: 13, background: "linear-gradient(135deg, #4A9EDF, #4ECBA8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🤖</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900 }}>Alex</div>
          <div style={{ fontSize: 12, color: "#4ECBA8", fontWeight: 700 }}>{uk ? "AI-подруга · онлайн" : "AI friend · online"}</div>
        </div>
      </div>

      {/* Quick questions — horizontal scroll, no vertical overflow */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexShrink: 0, overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch" }}>
        {QA_PAIRS.slice(0, 3).map((qa, i) => (
          <button key={i} onClick={() => send(qa.q[L])} style={{ whiteSpace: "nowrap", padding: "8px 14px", borderRadius: 100, border: "1px solid rgba(74,158,223,0.22)", background: "rgba(74,158,223,0.06)", color: "#4A9EDF", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            {qa.q[L]}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 8px" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
            <div style={{
              maxWidth: "82%",
              padding: "13px 16px",
              borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              background: m.role === "user" ? "linear-gradient(135deg, #4A9EDF, #5BB8F5)" : C.glass,
              color: m.role === "user" ? "#fff" : "#1A2433",
              fontSize: 14, lineHeight: 1.65,
              boxShadow: "0 2px 12px rgba(74,158,223,0.1)",
              border: m.role === "lumi" ? "1px solid rgba(255,255,255,0.85)" : "none",
            }}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "10px 16px 8px", background: "#F5F9FF", borderTop: "1px solid rgba(74,158,223,0.1)", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send(input)}
            placeholder={uk ? "Запитати Alex..." : "Ask Alex..."}
            style={{ flex: 1, padding: "12px 16px", borderRadius: 14, border: "1.5px solid rgba(74,158,223,0.2)", background: "rgba(255,255,255,0.9)", fontSize: 15, fontFamily: "inherit", color: "#1A2433", outline: "none" }} />
          <button onClick={() => send(input)} style={{ width: 46, height: 46, borderRadius: 12, background: "linear-gradient(135deg, #4A9EDF, #5BB8F5)", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", flexShrink: 0 }}>↑</button>
        </div>
      </div>

      {/* Inline bottom nav — no position:fixed, no overlap */}
      <div style={{ display: "flex", padding: "8px 0 28px", background: "rgba(245,249,255,0.96)", borderTop: "1px solid rgba(74,158,223,0.1)", flexShrink: 0 }}>
        {[
          { id: "home",     icon: "🏠", uk: "Головна", en: "Home",     action: onBack },
          { id: "checkin",  icon: "✓",  uk: "Check-in",en: "Check-in", action: onCheckIn },
          { id: "chat",     icon: "💬", uk: "Alex",    en: "Alex",     action: null },
          { id: "progress", icon: "📊", uk: "Прогрес", en: "Progress", action: onProgress },
        ].map(item => (
          <button key={item.id} onClick={item.action || undefined} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 0", border: "none", background: "transparent", cursor: item.action ? "pointer" : "default", fontFamily: "inherit" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: item.id === "chat" ? "rgba(74,158,223,0.14)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{item.icon}</div>
            <div style={{ fontSize: 10, fontWeight: item.id === "chat" ? 800 : 500, color: item.id === "chat" ? "#4A9EDF" : "#6B7A8D" }}>{uk ? item.uk : item.en}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── CUSTOM SLIDER (mobile-friendly, non-passive touch) ───────────────────────
function CustomSlider({ min, max, value, onChange }) {
  const trackRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    let active = false

    function getVal(clientX) {
      const rect = el.getBoundingClientRect()
      return Math.round(min + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (max - min))
    }
    function onTouchStart(e) { active = true; onChangeRef.current(getVal(e.touches[0].clientX)) }
    function onTouchMove(e)  { if (!active) return; e.preventDefault(); onChangeRef.current(getVal(e.touches[0].clientX)) }
    function onTouchEnd()    { active = false }
    function onMouseDown(e) {
      active = true; onChangeRef.current(getVal(e.clientX))
      const mm = e2 => { if (active) onChangeRef.current(getVal(e2.clientX)) }
      const mu = () => { active = false; window.removeEventListener("mousemove", mm) }
      window.addEventListener("mousemove", mm)
      window.addEventListener("mouseup", mu, { once: true })
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove",  onTouchMove,  { passive: false })
    el.addEventListener("touchend",   onTouchEnd)
    el.addEventListener("mousedown",  onMouseDown)
    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove",  onTouchMove)
      el.removeEventListener("touchend",   onTouchEnd)
      el.removeEventListener("mousedown",  onMouseDown)
    }
  }, [min, max])

  const pct = ((value - min) / (max - min)) * 100
  return (
    <div ref={trackRef} style={{ height: 34, display: "flex", alignItems: "center", cursor: "grab", userSelect: "none", WebkitUserSelect: "none" }}>
      <div style={{ position: "relative", width: "100%", height: 5, background: "rgba(74,158,223,0.15)", borderRadius: 3 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #4A9EDF, #4ECBA8)", borderRadius: 3 }} />
        <div style={{ position: "absolute", top: "50%", left: `${pct}%`, transform: "translate(-50%,-50%)", width: 24, height: 24, borderRadius: "50%", background: "#fff", border: "2.5px solid #4A9EDF", boxShadow: "0 2px 10px rgba(74,158,223,0.4)", zIndex: 1 }} />
      </div>
    </div>
  )
}

// ─── SCREEN 7: CHECK-IN ───────────────────────────────────────────────────────
function CheckInScreen({ history, setHistory, lang, onBack }) {
  const uk = lang === "uk"
  const [vals, setVals] = useState({ energy: 5, sleep: 7, mood: 5, water: 6, move: null })
  const [saved, setSaved] = useState(false)

  const doneToday = history.some(h => h.date?.startsWith(todayStr()))

  function submit() {
    const entry = { ...vals, date: new Date().toISOString() }
    const newHistory = [...history, entry]
    setHistory(newHistory)
    lsSet("vive_history", newHistory)
    setSaved(true)
  }

  if (doneToday && !saved) return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 10px" }}>{uk ? "Вже зроблено сьогодні!" : "Already done today!"}</h2>
      <p style={{ color: "#6B7A8D", marginBottom: 36, fontSize: 15, lineHeight: 1.6, maxWidth: 280 }}>
        {uk ? "Чудово! Повертайся ввечері і зроби check-in ще раз якщо хочеш, але стрік рахується 1 раз на день 💙" : "Great! Come back in the evening — streak counts once per day 💙"}
      </p>
      <button onClick={onBack} style={S.btnGhost}>{uk ? "← На головну" : "← Back to Home"}</button>
    </div>
  )

  if (saved) return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
      <div style={{ fontSize: 72, marginBottom: 20 }}>🌿</div>
      <h2 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 10px" }}>{uk ? "Check-in зроблено!" : "Check-in done!"}</h2>
      <p style={{ color: "#6B7A8D", marginBottom: 36, fontSize: 15, lineHeight: 1.6 }}>
        {uk ? "Відмінно! Стрік продовжується. Побачимось завтра 💙" : "Great! Your streak continues. See you tomorrow 💙"}
      </p>
      <button onClick={onBack} style={S.btnPrimary}>{uk ? "← На головну" : "← Back to Home"}</button>
    </div>
  )

  function SliderRow({ label, valKey, min, max, formatVal, minLabel, maxLabel }) {
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{label}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#4A9EDF" }}>{formatVal(vals[valKey])}</div>
        </div>
        <CustomSlider min={min} max={max} value={vals[valKey]} onChange={v => setVals(x => ({ ...x, [valKey]: v }))} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(107,122,141,0.55)", marginTop: 5 }}>
          <span>{minLabel || min}</span>
          <span>{maxLabel || max}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, padding: "52px 24px 0", marginBottom: 28 }}>
        <BackBtn onClick={onBack} />
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.5px" }}>{uk ? "Щоденний Check-in" : "Daily Check-in"}</h2>
          <div style={{ fontSize: 13, color: "#6B7A8D" }}>{uk ? "2 хвилини · кожен день" : "2 minutes · every day"}</div>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "0 24px 120px" }}>
        <SliderRow label={uk ? "Енергія" : "Energy"} valKey="energy" min={1} max={10}
          formatVal={n => `${n * 10}%`}
          minLabel={uk ? "😴 Мало" : "😴 Low"} maxLabel={uk ? "⚡ Висока" : "⚡ High"} />
        <SliderRow label={uk ? "Сон (год)" : "Sleep (h)"} valKey="sleep" min={4} max={10}
          formatVal={n => `${n}h`}
          minLabel="4h" maxLabel="10h" />
        <SliderRow label={uk ? "Настрій" : "Mood"} valKey="mood" min={1} max={10}
          formatVal={n => `${n <= 3 ? "😔" : n <= 6 ? "😐" : "😊"} ${n}/10`}
          minLabel="😔 1" maxLabel="10 😊" />
        <SliderRow label={uk ? "Вода (скл.)" : "Water (gl.)"} valKey="water" min={1} max={10}
          formatVal={n => `${n} ${uk ? "скл." : "gl."}`}
          minLabel="1" maxLabel="10" />

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{uk ? "Рух сьогодні?" : "Movement today?"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Chip active={vals.move === true}  onClick={() => setVals(v => ({ ...v, move: true }))}  style={{ flex: 1, textAlign: "center" }}>✓ {uk ? "Так" : "Yes"}</Chip>
            <Chip active={vals.move === false} onClick={() => setVals(v => ({ ...v, move: false }))} style={{ flex: 1, textAlign: "center" }}>✗ {uk ? "Ні" : "No"}</Chip>
          </div>
        </div>
      </div>

      <div style={{ position: "sticky", bottom: 0, zIndex: 2, padding: "16px 24px 44px", background: "linear-gradient(0deg, #F5F9FF 65%, transparent)" }}>
        <button onClick={submit} style={S.btnPrimary}>{uk ? "Зберегти Check-in ✓" : "Save Check-in ✓"}</button>
      </div>
    </div>
  )
}

// ─── SCREEN 8: PROGRESS — CYCLE CALENDAR ─────────────────────────────────────
function ProgressScreen({ profile, setProfile, lang, onBack }) {
  const uk = lang === "uk"
  const [selectedDay, setSelectedDay] = useState(null)
  const [dateInput, setDateInput] = useState("")

  const hasDate = !!profile.lastPeriodDate
  const cycleLength = parseInt(profile.cycleLength) || 28
  const days = hasDate ? getCalendarDays(profile.lastPeriodDate, cycleLength) : []

  const phaseColors = { menstrual: "#9B8FE8", follicular: "#4ECBA8", ovulation: "#4A9EDF", luteal: "#F59E3F" }

  const inputStyle = {
    width: "100%", padding: "14px 16px", borderRadius: 14,
    border: "1.5px solid rgba(74,158,223,0.25)", background: "rgba(255,255,255,0.85)",
    fontSize: 16, fontFamily: "inherit", color: "#1A2433", outline: "none", boxSizing: "border-box",
  }

  if (!hasDate) return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column" }}>
      <Blob top={-60} right={-40} size={200} color="rgba(74,158,223,0.09)" />
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, padding: "52px 24px 24px" }}>
        <BackBtn onClick={onBack} />
        <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{uk ? "Мій цикл" : "My Cycle"}</h2>
      </div>
      <div style={{ position: "relative", zIndex: 1, flex: 1, padding: "0 24px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🗓</div>
          <p style={{ color: "#6B7A8D", fontSize: 15, lineHeight: 1.65, maxWidth: 280, margin: "0 auto" }}>
            {uk ? "Вкажи перший день останніх місячних щоб побачити свій цикл." : "Enter the first day of your last period to see your cycle."}
          </p>
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>
          {uk ? "Перший день останніх місячних" : "First day of last period"}
        </div>
        <input type="date" value={dateInput} max={todayStr()} onChange={e => setDateInput(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }} />
        <button
          disabled={!dateInput}
          onClick={() => { const p = { ...profile, lastPeriodDate: dateInput }; setProfile(p) }}
          style={{ ...S.btnPrimary, opacity: dateInput ? 1 : 0.4 }}
        >
          {uk ? "Показати мій цикл →" : "Show my cycle →"}
        </button>
      </div>
    </div>
  )

  const sel = selectedDay != null ? days[selectedDay - 1] : null
  const selRec = sel ? PHASE_RECS[sel.phase] : null

  return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column" }}>
      <Blob top={-60} right={-40} size={200} color="rgba(74,158,223,0.09)" />

      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, padding: "52px 24px 16px" }}>
        <BackBtn onClick={onBack} />
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.5px" }}>{uk ? "Мій цикл" : "My Cycle"}</h2>
          <div style={{ fontSize: 13, color: "#6B7A8D" }}>{uk ? `${cycleLength}-денний цикл` : `${cycleLength}-day cycle`}</div>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "0 24px 100px" }}>

        {/* Legend */}
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          {Object.entries(PHASE_RECS).map(([k, r]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6B7A8D" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: phaseColors[k] }} />
              {uk ? r.uk.name : r.en.name}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 20 }}>
          {days.map(day => {
            const color = phaseColors[day.phase]
            const isToday = day.isToday
            const isSel = selectedDay === day.cycleDay
            return (
              <button key={day.cycleDay} onClick={() => setSelectedDay(isSel ? null : day.cycleDay)} style={{
                aspectRatio: "1", borderRadius: 10, border: isToday ? `2.5px solid ${color}` : isSel ? `2px solid ${color}` : "1.5px solid transparent",
                background: isSel ? `${color}30` : `${color}${day.isPast ? "22" : "15"}`,
                cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit", padding: 0, position: "relative",
              }}>
                <div style={{ fontSize: 13, fontWeight: isToday ? 900 : 600, color: isToday ? color : day.isPast ? "#6B7A8D" : "#1A2433" }}>
                  {day.cycleDay}
                </div>
                {isToday && <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, position: "absolute", bottom: 4 }} />}
              </button>
            )
          })}
        </div>

        {/* Selected day detail */}
        {sel && selRec && (
          <div style={{ ...S.card, background: `linear-gradient(135deg, ${phaseColors[sel.phase]}12, ${phaseColors[sel.phase]}06)`, border: `1px solid ${phaseColors[sel.phase]}30`, padding: "18px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>{selRec.emoji}</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: phaseColors[sel.phase], textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {uk ? `День ${sel.cycleDay}` : `Day ${sel.cycleDay}`}
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, color: "#1A2433" }}>{uk ? selRec.uk.name : selRec.en.name}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#6B7A8D", lineHeight: 1.55, marginBottom: 14 }}>
              {uk ? selRec.uk.tip : selRec.en.tip}
            </div>
            {[
              { icon: "🏃", uk: selRec.uk.sport,  en: selRec.en.sport,  label: uk ? "Рух" : "Movement" },
              { icon: "🥗", uk: selRec.uk.food,   en: selRec.en.food,   label: uk ? "Їжа" : "Food" },
              { icon: "✨", uk: selRec.uk.beauty, en: selRec.en.beauty, label: uk ? "Краса" : "Beauty" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                <div style={{ fontSize: 14, width: 22, flexShrink: 0 }}>{row.icon}</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: phaseColors[sel.phase], textTransform: "uppercase", letterSpacing: "0.5px" }}>{row.label}</div>
                  <div style={{ fontSize: 13, color: "#1A2433" }}>{uk ? row.uk : row.en}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!sel && (
          <p style={{ textAlign: "center", fontSize: 13, color: "#6B7A8D", marginTop: 8 }}>
            {uk ? "Натисни на день щоб побачити рекомендації" : "Tap a day to see recommendations"}
          </p>
        )}
      </div>

      <BottomNav active="progress" onCheckIn={() => {}} onProgress={null} onChat={() => {}} onHome={onBack} uk={uk} />
    </div>
  )
}

// ─── PROFILE SCREEN ───────────────────────────────────────────────────────────
function ProfileScreen({ profile, onBack, onReset, lang }) {
  const uk = lang === "uk"
  const [confirm, setConfirm] = useState(false)
  const cycleDay = calcCycleDay(profile)
  const phaseKey = getPhase(cycleDay, parseInt(profile.cycleLength) || 28)
  const phaseRec = PHASE_RECS[phaseKey]

  return (
    <div style={{ ...S.screen, display: "flex", flexDirection: "column" }}>
      <Blob top={-60} right={-40} size={200} color="rgba(74,158,223,0.09)" />

      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, padding: "52px 24px 24px" }}>
        <BackBtn onClick={onBack} />
        <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.5px" }}>
          {uk ? "Профіль" : "Profile"}
        </h2>
      </div>

      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "0 24px 40px" }}>

        {/* Avatar + name */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, rgba(74,158,223,0.2), rgba(78,203,168,0.2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, marginBottom: 12 }}>
            👤
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#1A2433" }}>{profile.name || (uk ? "Моя сторінка" : "My profile")}</div>
          {profile.birthYear && <div style={{ fontSize: 14, color: "#6B7A8D", marginTop: 2 }}>{profile.birthYear} · {calcAge(profile.birthYear)} {uk ? "років" : "y.o."}</div>}
        </div>

        {/* Phase info */}
        <Card style={{ marginBottom: 12, background: `${phaseRec.color}10`, border: `1px solid ${phaseRec.color}25` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>{phaseRec.emoji}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: phaseRec.color, textTransform: "uppercase", letterSpacing: "0.5px" }}>{uk ? `День ${cycleDay} циклу` : `Cycle day ${cycleDay}`}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#1A2433" }}>{uk ? phaseRec.uk.name : phaseRec.en.name}</div>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <Card style={{ marginBottom: 24 }}>
          {[
            { label: uk ? "Цикл"          : "Cycle length", value: `${parseInt(profile.cycleLength) || 28} ${uk ? "днів" : "days"}` },
            { label: uk ? "Головна ціль"  : "Main goal",    value: profile.mainGoal || "—" },
            { label: uk ? "Контрацепція"  : "Contraception",value: profile.contraception || "—" },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: i < arr.length - 1 ? 12 : 0, marginBottom: i < arr.length - 1 ? 12 : 0, borderBottom: i < arr.length - 1 ? "1px solid rgba(74,158,223,0.08)" : "none" }}>
              <div style={{ fontSize: 13, color: "#6B7A8D" }}>{row.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2433" }}>{row.value}</div>
            </div>
          ))}
        </Card>

        {/* Reset */}
        {!confirm ? (
          <button onClick={() => setConfirm(true)} style={{ ...S.btnGhost, color: "#E05252", borderColor: "rgba(224,82,82,0.25)", background: "rgba(224,82,82,0.06)" }}>
            {uk ? "Скинути дані і почати знову" : "Reset data and start over"}
          </button>
        ) : (
          <div style={{ ...S.card, border: "1px solid rgba(224,82,82,0.25)", padding: "20px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A2433", marginBottom: 8, textAlign: "center" }}>
              {uk ? "Видалити всі дані?" : "Delete all data?"}
            </div>
            <div style={{ fontSize: 13, color: "#6B7A8D", textAlign: "center", marginBottom: 16, lineHeight: 1.5 }}>
              {uk ? "Це видалить профіль, аудит, check-in та стрік. Дію не можна скасувати." : "This will delete your profile, audit, check-ins and streak. Cannot be undone."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(false)} style={{ ...S.btnGhost, flex: 1 }}>
                {uk ? "Скасувати" : "Cancel"}
              </button>
              <button onClick={onReset} style={{ ...S.btnGhost, flex: 1, color: "#E05252", borderColor: "rgba(224,82,82,0.3)", background: "rgba(224,82,82,0.08)" }}>
                {uk ? "Так, скинути" : "Yes, reset"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── BOTTOM NAVIGATION ────────────────────────────────────────────────────────
function BottomNav({ active, onCheckIn, onProgress, onChat, onHome, uk }) {
  const items = [
    { id: "home",     icon: "🏠", uk: "Головна", en: "Home",     action: onHome || null },
    { id: "checkin",  icon: "✓",  uk: "Check-in",en: "Check-in", action: onCheckIn },
    { id: "chat",     icon: "💬", uk: "Alex",    en: "Alex",     action: onChat },
    { id: "progress", icon: "📊", uk: "Прогрес", en: "Progress", action: onProgress },
  ]
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10, background: "rgba(245,249,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: "1px solid rgba(74,158,223,0.1)", display: "flex", padding: "8px 0 28px" }}>
      {items.map(item => (
        <button key={item.id} onClick={item.action || undefined} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 0", border: "none", background: "transparent", cursor: item.action ? "pointer" : "default", fontFamily: "inherit" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: active === item.id ? "rgba(74,158,223,0.14)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, transition: "background .2s" }}>{item.icon}</div>
          <div style={{ fontSize: 10, fontWeight: active === item.id ? 800 : 500, color: active === item.id ? "#4A9EDF" : "#6B7A8D" }}>
            {uk ? item.uk : item.en}
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [lang,    setLang]    = useState(() => lsGet("vive_lang", "uk"))
  const [screen,  setScreen]  = useState("welcome")
  const [profile, setProfile] = useState(() => lsGet("vive_profile", {}))
  const [history, setHistory] = useState(() => lsGet("vive_history", []))

  function saveProfile(p) { setProfile(p); lsSet("vive_profile", p) }
  function saveLang(l)    { setLang(l);    lsSet("vive_lang", l) }

  function handleReset() {
    ["vive_profile","vive_history","vive_lang","vive_activity_days","vive_tasks_done","vive_protocol_done"].forEach(k => {
      try { localStorage.removeItem(k) } catch {}
    })
    setProfile({})
    setHistory([])
    setScreen("welcome")
  }

  if (screen === "welcome") return (
    <WelcomeScreen lang={lang} onLangToggle={() => saveLang(lang === "uk" ? "en" : "uk")} onStart={() => setScreen("audit")} />
  )
  if (screen === "audit") return (
    <BodyAudit profile={profile} setProfile={saveProfile} lang={lang} onDone={() => setScreen("paywall")} />
  )
  if (screen === "paywall") return (
    <PaywallScreen profile={profile} lang={lang} onBack={() => setScreen("audit")} onContinueFree={() => setScreen("report")} />
  )
  if (screen === "report") return (
    <ReportScreen profile={profile} lang={lang} onDone={() => setScreen("dashboard")} />
  )
  if (screen === "dashboard") return (
    <DashboardScreen profile={profile} history={history} lang={lang}
      onCheckIn={() => setScreen("checkin")} onChat={() => setScreen("chat")}
      onProgress={() => setScreen("progress")} onProfile={() => setScreen("profile")} />
  )
  if (screen === "chat") return (
    <ChatScreen profile={profile} lang={lang} onBack={() => setScreen("dashboard")}
      onCheckIn={() => setScreen("checkin")} onProgress={() => setScreen("progress")} />
  )
  if (screen === "checkin") return (
    <CheckInScreen history={history} setHistory={setHistory} lang={lang} onBack={() => setScreen("dashboard")} />
  )
  if (screen === "progress") return (
    <ProgressScreen profile={profile} setProfile={saveProfile} lang={lang} onBack={() => setScreen("dashboard")} />
  )
  if (screen === "profile") return (
    <ProfileScreen profile={profile} lang={lang} onBack={() => setScreen("dashboard")} onReset={handleReset} />
  )
  return null
}
