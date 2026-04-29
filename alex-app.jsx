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

// Longevity score (0–100) — 4 wellness markers from last 7 check-ins
function calcLongevityMarkers(history) {
  const last7 = (history || []).slice(-7)
  if (!last7.length) return { sleepAvg: 0, proteinHits: 0, strengthCount: 0, stressDays: 0, score: 0, sample: 0 }
  const sleepAvg      = last7.reduce((acc, h) => acc + (parseFloat(h.sleep) || 0), 0) / last7.length
  const proteinHits   = last7.filter(h => h.proteinHit).length
  const strengthCount = last7.filter(h => h.strengthDone).length
  const stressDays    = last7.filter(h => (parseInt(h.mood) || 5) < 5).length
  // weighted score, normalised to 0–100
  const raw = sleepAvg * 10 + proteinHits * 8 + strengthCount * 12 + (7 - stressDays) * 6
  const score = Math.max(0, Math.min(100, Math.round(raw / 2.74)))
  return { sleepAvg, proteinHits, strengthCount, stressDays, score, sample: last7.length }
}

function getMilestoneInsight(history, milestone) {
  const h = history || []
  if (h.length < milestone) return []
  const first = h.slice(0, 30)
  const last  = h.slice(-30)
  const avg = (arr, key) => arr.reduce((s, x) => s + (parseFloat(x[key]) || 0), 0) / (arr.length || 1)
  const metrics = [
    { key: "energy", label_uk: "Енергія", label_en: "Energy" },
    { key: "sleep",  label_uk: "Сон",     label_en: "Sleep"  },
    { key: "mood",   label_uk: "Настрій", label_en: "Mood"   },
    { key: "recovery", label_uk: "Відновлення", label_en: "Recovery" },
  ]
  return metrics
    .map(m => ({ ...m, delta: avg(last, m.key) - avg(first, m.key) }))
    .filter(m => m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3)
}

// ─── NOTIFICATIONS (P0.4) ─────────────────────────────────────────────────────
// Push: local notification via service worker (no VAPID server needed for the
// streak=30/60/90 trigger — detection happens client-side on dashboard mount).
// Email: POST to /api/notify which calls Resend.

async function requestPushPermission() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported"
  try {
    const perm = await Notification.requestPermission()
    return perm // "granted" | "denied" | "default"
  } catch { return "denied" }
}

async function showLocalMilestoneNotification({ milestone, lang, insights }) {
  if (!("serviceWorker" in navigator)) return false
  if (!("Notification" in window) || Notification.permission !== "granted") return false
  try {
    const reg = await navigator.serviceWorker.ready
    const uk = lang === "uk"
    const title = uk ? `🌟 ${milestone} днів з Alex` : `🌟 ${milestone} days with Alex`
    const top = (insights || []).slice(0, 3)
      .map(i => (uk ? i.label_uk : i.label_en) + " +" + (i.delta || 0).toFixed(1))
      .join(" · ")
    const body = top
      || (uk ? "Стабільний ритм — це вже сильна перемога 💙" : "A steady rhythm is its own win 💙")
    await reg.showNotification(title, {
      body,
      tag: "alex-milestone-" + milestone,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: "/" },
    })
    return true
  } catch { return false }
}

async function sendMilestoneEmail({ email, name, milestone, lang, insights }) {
  if (!email) return { ok: false, reason: "no-email" }
  try {
    const r = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, milestone, lang, insights }),
    })
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok, status: r.status, ...data }
  } catch (e) {
    return { ok: false, reason: "network" }
  }
}

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
  hormone_shift: {
    icon: "🌷",
    title: { en: "Estrogen fluctuation pattern", uk: "Патерн коливання естрогену" },
    subtitle: { en: "Multiple body systems shifting at once", uk: "Кілька систем тіла змінюються одночасно" },
    body: {
      en: "Your symptoms across sleep, mood, energy, cycle, skin and joints often share one source — a gradual shift in hormone balance that can begin in the mid-30s and last several years. Not a diagnosis. Not connected to whether you've had children. Understanding it early is your edge.",
      uk: "Твої симптоми у сні, настрої, енергії, циклі, шкірі та суглобах часто мають одне джерело — поступовий зсув гормонального балансу, який може починатись у середині 30-х і триває кілька років. Не діагноз. Не пов'язано з тим, чи ти народжувала. Розуміти це рано — твоя перевага.",
    },
    protocol: {
      en: ["🥦 Phyto-estrogen foods daily (flax seeds, soy, chickpeas) — support fluctuating estrogen", "🏋️ Strength training 2–3x/week — protects bone density and muscle mass long-term", "😴 Anchor sleep: same bedtime every day — stabilises cortisol that drives night wakings"],
      uk: ["🥦 Фітоестрогени щодня (лляне насіння, соя, нут) — підтримують коливання естрогену", "🏋️ Силові 2–3 рази/тиждень — захищає щільність кісток і м'язи у довгостроку", "😴 Якір сну: однаковий час лягати щодня — стабілізує кортизол, що провокує нічні пробудження"],
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

// ─── CYCLE PHASE PROTOCOLS (wellness exploration, not medical advice) ────────
const CYCLE_PHASE_PROTOCOLS = {
  menstrual: {
    nutrition: {
      en: ["Iron-rich foods: spinach, lentils, grass-fed beef", "Warm soups + cooked roots — easier to digest", "Dark chocolate 70%+ for magnesium"],
      uk: ["Залізо: шпинат, сочевиця, яловичина", "Теплі супи й коренеплоди — легше травляться", "Темний шоколад 70%+ для магнію"],
    },
    movement: {
      en: ["Gentle restorative yoga 20 min", "Slow walks outdoors — daylight helps mood", "Stretching + foam rolling"],
      uk: ["Ніжна відновлювальна йога 20 хв", "Повільні прогулянки на свіжому повітрі", "Розтяжка + foam rolling"],
    },
    rest: {
      en: ["8–9h sleep — prioritise this week", "Avoid caffeine after noon", "Hot bath with epsom salts before bed"],
      uk: ["8–9 годин сну — пріоритет цього тижня", "Без кави після обіду", "Гаряча ванна з епсомом перед сном"],
    },
    beauty: {
      en: ["Skip retinol and acids — barrier is sensitive", "Hydration layers: hyaluronic + ceramides", "Lip balm + hand cream — dryness peaks"],
      uk: ["Без ретинолу й кислот — бар'єр чутливий", "Шари зволоження: гіалуронка + церамід", "Бальзам для губ + крем для рук — пік сухості"],
    },
  },
  follicular: {
    nutrition: {
      en: ["Fermented foods: kefir, kimchi, sauerkraut", "Sprouted grains + leafy greens", "Lean protein 25–30g per meal"],
      uk: ["Ферментовані: кефір, кімчі, квашена капуста", "Пророщені злаки + листяна зелень", "Легкий білок 25–30г за прийом"],
    },
    movement: {
      en: ["Cardio or dance 30–40 min — energy is rising", "Try a new class — coordination peaks now", "Strength training 2–3 sets, moderate"],
      uk: ["Кардіо або танці 30–40 хв — енергія зростає", "Спробуй нове заняття — координація на піку", "Силові 2–3 підходи, помірно"],
    },
    rest: {
      en: ["7–8h sleep — natural energy means lighter rest", "Morning sunlight 10 min sets circadian", "Short focused breaks — Pomodoro works well"],
      uk: ["7–8 годин — природна енергія, легший відпочинок", "Ранкове сонце 10 хв налаштовує циркадний ритм", "Короткі фокусовані перерви — Pomodoro"],
    },
    beauty: {
      en: ["BHA serum 2–3x — pores cooperate now", "Vitamin C in the morning under SPF", "Light retinol every other night if tolerated"],
      uk: ["BHA сироватка 2–3х — пори піддаються", "Вітамін С зранку під SPF", "Легкий ретинол через ніч, якщо переноситься"],
    },
  },
  ovulation: {
    nutrition: {
      en: ["Anti-inflammatory: salmon, walnuts, olive oil", "Cruciferous veggies — support estrogen clearance", "Berries + dark leafy greens for antioxidants"],
      uk: ["Протизапальне: лосось, волоські горіхи, олія", "Хрестоцвіті — допомагають метаболізму естрогену", "Ягоди + темна зелень як антиоксиданти"],
    },
    movement: {
      en: ["HIIT or strength training 30–45 min", "Group workouts feel best now — social peak", "Track PRs — strength is highest this phase"],
      uk: ["HIIT або силові 30–45 хв", "Групові тренування на піку соціальної енергії", "Відстежуй рекорди — сила найвища"],
    },
    rest: {
      en: ["7–8h sleep — wind down with breathwork", "Limit late screens — ovulation hormones disturb sleep", "Cooler bedroom 18–19°C for deep sleep"],
      uk: ["7–8 годин — вечірня дихальна практика", "Менше екранів увечері — гормони овуляції збивають сон", "Прохолодна спальня 18–19°C"],
    },
    beauty: {
      en: ["Light, oil-free moisturiser — skin is dewy", "Reapply SPF — UV sensitivity is higher", "Gentle exfoliation — AHA 5–7%"],
      uk: ["Легкий безмасляний крем — шкіра сяє", "Оновлюй SPF — чутливість до УФ вища", "Ніжний пілінг — AHA 5–7%"],
    },
  },
  luteal: {
    nutrition: {
      en: ["Magnesium-rich foods: pumpkin seeds, dark chocolate, bananas", "Complex carbs at dinner — stabilise mood + sleep", "Reduce salt + alcohol — bloating peaks"],
      uk: ["Магній: гарбузове насіння, темний шоколад, банани", "Складні вуглеводи на вечерю — стабілізують настрій і сон", "Менше солі та алкоголю — пік набряків"],
    },
    movement: {
      en: ["Pilates or strength — moderate intensity", "Walking 30–45 min in nature lowers cortisol", "Skip HIIT — cortisol is already elevated"],
      uk: ["Пілатес або силові — помірна інтенсивність", "Прогулянка 30–45 хв на природі знижує кортизол", "Без HIIT — кортизол уже підвищений"],
    },
    rest: {
      en: ["8–9h sleep — body needs more this phase", "Magnesium glycinate 300mg before bed", "Anchor bedtime — same hour every night"],
      uk: ["8–9 годин сну — тілу треба більше цієї фази", "Магній гліцинат 300мг перед сном", "Якір сну — однаковий час щодня"],
    },
    beauty: {
      en: ["Niacinamide + peptides — skip acids and retinol", "Extra hydration — hormonal dryness rises", "Cold gua sha or jade roller for puffiness"],
      uk: ["Ніацинамід + пептиди — без кислот і ретинолу", "Більше зволоження — гормональна сухість зростає", "Холодний gua sha або роллер від набряків"],
    },
  },
}

function generatePhaseProtocol(profile, phaseKey, uk) {
  const L  = uk ? "uk" : "en"
  const p  = CYCLE_PHASE_PROTOCOLS[phaseKey] || CYCLE_PHASE_PROTOCOLS.follicular
  const pick = (cat) => p[cat][L].slice(0, 2).map((line, i) => ({ id: `${phaseKey}_${cat}_${i}`, text: line }))
  return {
    nutrition: pick("nutrition"),
    movement:  pick("movement"),
    rest:      pick("rest"),
    beauty:    pick("beauty"),
  }
}

// ─── PERIMENOPAUSE / HORMONE SHIFT (MRS / Peri-SS based) ──────────────────────
// 8-question scale, each 0–3 (none / mild / moderate / severe). Sum 0–24.
// Detection: score >= 8 AND age 35–55. Wellness signal, not a diagnosis.
function getHormoneShiftScore(profile) {
  const a = profile.hormoneShiftAnswers
  if (!a || profile.hormoneShiftIntro !== "yes") return 0
  return Object.values(a).reduce((sum, v) => sum + (parseInt(v) || 0), 0)
}

function isHormoneShiftDetected(profile) {
  if (!profile.birthYear) return false
  const age = calcAge(profile.birthYear)
  if (age < 35 || age > 55) return false
  return getHormoneShiftScore(profile) >= 8
}

function getRootCauses(profile) {
  const skin = profile.skinSymptoms || []
  const hair = profile.hairSymptoms || []
  const body = profile.bodySymptoms || []
  const age  = profile.birthYear ? calcAge(profile.birthYear) : 35
  const s    = { cortisol: 0, estrogen: 0, protein: 0, pcos: 0, inflammation: 0, hormone_shift: 0 }

  if (isHormoneShiftDetected(profile)) {
    const score = getHormoneShiftScore(profile)
    s.hormone_shift = 4 + Math.floor(score / 4)
  }

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
  if (body.includes("morningEnergy")) s.cortisol += 1
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
  const hormoneShift = isHormoneShiftDetected(profile)
  const phaseBeautyTips = (CYCLE_PHASE_PROTOCOLS[phase] || CYCLE_PHASE_PROTOCOLS.follicular).beauty[uk ? "uk" : "en"]
  const phaseStep = hormoneShift
    ? { step: uk ? "Фазовий бустер" : "Phase booster", product: uk ? "Гідратація + пептиди — пріоритет при гормональному зсуві" : "Hydration + peptides — priority during hormone shift" }
    : { step: uk ? "Фазовий фокус" : "Phase focus", product: phaseBeautyTips[0] }

  if (skin.includes("acne")) return {
    morning: [
      { step: uk ? "Очищення" : "Cleanse", product: uk ? "Гелевий засіб із саліциловою кислотою 0.5–1%" : "Gel cleanser with salicylic acid 0.5–1%" },
      { step: uk ? "Сироватка"  : "Serum",   product: uk ? "Ніацинамід 10% + Цинк" : "Niacinamide 10% + Zinc" },
      { step: uk ? "Захист"     : "Protect", product: uk ? "Легкий SPF 30–50 без олій" : "Lightweight oil-free SPF 30–50" },
    ],
    evening: [
      { step: uk ? "Подвійне очищення" : "Double cleanse", product: uk ? "Міцелярна вода → гелевий засіб" : "Micellar water → gel cleanser" },
      { step: uk ? "Актив"      : "Active",   product: activePhase ? (uk ? "BHA сироватка (Cosrx, Paula's Choice)" : "BHA serum (Cosrx, Paula's Choice)") : (uk ? "Ніацинамід — без кислот у цю фазу" : "Niacinamide only — no acids this phase") },
      phaseStep,
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
      phaseStep,
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
      phaseStep,
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
    { id: "sauna",      icon: "🔥", name: uk ? "Сауна"          : "Sauna",                note: uk ? "3x на тиждень, 15–20 хв"     : "3x per week, 15–20 min" },
    { id: "strength",   icon: "🏋️", name: uk ? "Силові"          : "Strength training",    note: uk ? "2x на тиждень, базові рухи"  : "2x per week, compound moves" },
    { id: "biomarkers", icon: "🩸", name: uk ? "Біомаркери"      : "Biomarker check-in",   note: uk ? "Раз на квартал"              : "Quarterly" },
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

function getTabTasks(tab, phaseKey, uk) {
  if (tab === "morning") return [
    { id: "sunlight", icon: "☀️", title: uk ? "Сонячне світло"    : "Morning sunlight", detail: uk ? "5–10 хв на вулиці після пробудження" : "5–10 min outside after waking" },
    { id: "breath",   icon: "🫁", title: uk ? "4-7-8 дихання"    : "4-7-8 breathing",  detail: uk ? "3 хв — знижує ранковий кортизол"      : "3 min — lowers morning cortisol" },
    { id: "protein",  icon: "🍳", title: uk ? "Білок на сніданок" : "Protein breakfast", detail: uk ? "25г+ білку — стабілізує енергію та цукор" : "25g+ protein — stabilises energy & glucose" },
    { id: "skin_am",  icon: "🌅", title: uk ? "Ранкова рутина шкіри" : "AM skin routine", detail: uk ? "Очищення → вітамін C → SPF"          : "Cleanse → vitamin C → SPF" },
  ]
  if (tab === "movement") {
    const workout = {
      menstrual:  { uk: "Ніжна йога або ходьба 20 хв", en: "Gentle yoga or walking 20 min" },
      follicular: { uk: "Кардіо або танці 30 хв",      en: "Cardio or dancing 30 min" },
      ovulation:  { uk: "HIIT або силові 30 хв",       en: "HIIT or strength 30 min" },
      luteal:     { uk: "Пілатес або силові 25 хв",    en: "Pilates or strength 25 min" },
    }[phaseKey]
    return [
      { id: "workout",  icon: "🏋️", title: uk ? "Тренування за фазою" : "Phase-aligned workout", detail: uk ? workout.uk : workout.en },
      { id: "steps",    icon: "🚶", title: uk ? "8000 кроків"         : "8000 steps",            detail: uk ? "Ціль на день — рухомість + лімфа" : "Daily goal — mobility + lymph flow" },
      { id: "mobility", icon: "🧘", title: uk ? "Мобільність"         : "Mobility",              detail: uk ? "5 хв розтяжки/мобілізації стегон" : "5 min stretching / hip mobility" },
    ]
  }
  if (tab === "evening") return [
    { id: "skin_pm",  icon: "🌙", title: uk ? "Вечірня рутина шкіри" : "PM skin routine", detail: uk ? "Подвійне очищення → пептиди / ретинол" : "Double cleanse → peptides / retinol" },
    { id: "magnesium", icon: "💊", title: uk ? "Магній перед сном"   : "Magnesium before bed", detail: uk ? "300мг гліцинат — сон + знижує кортизол" : "300mg glycinate — sleep + lowers cortisol" },
    { id: "noscreen", icon: "📵", title: uk ? "Без екранів за 1 год" : "No screens 1h before", detail: uk ? "Захищає мелатонін і фазу засинання"   : "Protects melatonin and sleep onset" },
    { id: "cool",     icon: "❄️", title: uk ? "Прохолодна спальня"   : "Cool bedroom",         detail: uk ? "18°C — глибший сон, менше припливів"  : "18°C — deeper sleep, fewer flushes" },
  ]
  return generateDailyTasks({}, phaseKey, uk)
}

// ─── BIOHACKER STACK (female-specific longevity tools, evidence-rated) ────────
// evidence: 1–5 stars based on female-specific RCT / longitudinal data.
// Frame: wellness exploration with female caveats. Not medical advice.
const BIOHACKER_STACK = {
  sauna: {
    icon: "🔥",
    title:           { en: "Sauna",                                      uk: "Сауна" },
    evidence: 5,
    cost:            { en: "$ home / $$$ infrared",                      uk: "$ дома / $$$ інфрачервона" },
    why:             { en: "30% lower all-cause mortality at 4x/week (Finnish KIHD study). Drops cortisol, mimics moderate exercise for cardio.",
                       uk: "На 30% нижча загальна смертність при 4x/тиждень (фінське KIHD дослідження). Знижує кортизол, імітує помірне кардіо." },
    femaleCaveat:    { en: "Skip during heavy menstrual bleeding (iron loss). Stay hydrated with electrolytes — women dehydrate ~15% faster.",
                       uk: "Пропусти при сильній менструації (втрата заліза). Гідруйся з електролітами — жінки дегідратуються на ~15% швидше." },
    howToStart:      { en: "Wk1: 10 min @ 70°C, 2x. Wk2-3: 15 min, 3x. Wk4+: 20 min, 3-4x. Always end cool, not hot.",
                       uk: "Т1: 10 хв при 70°C, 2x. Т2-3: 15 хв, 3x. Т4+: 20 хв, 3-4x. Закінчуй прохолодою, не жаром." },
  },
  strength: {
    icon: "🏋️",
    title:           { en: "Strength training",                          uk: "Силові тренування" },
    evidence: 5,
    cost:            { en: "$0 bodyweight / $$ gym",                     uk: "$0 з власною вагою / $$ зал" },
    why:             { en: "Single most effective intervention for women 35+. Bone density peaks at 30, drops 1%/yr. Strength reverses sarcopenia and stabilises insulin.",
                       uk: "Найефективніша інтервенція для жінок 35+. Щільність кісток падає 1%/рік після 30. Силові реверсують саркопенію і стабілізують інсулін." },
    femaleCaveat:    { en: "Heavy lifts in follicular/ovulation, deload in luteal. Skip strength on heavy bleed days — joints are laxer.",
                       uk: "Важкі ваги — у фолікулярну/овуляцію, разгрузка — у лютеїн. Пропусти у дні сильного кровотечі — суглоби розхитані." },
    howToStart:      { en: "2x/week, 4 compound moves (squat, hinge, push, pull), 3x6-8 reps. Add weight when last rep is easy.",
                       uk: "2x/тиждень, 4 базових рухи (присід, тяга, жим, підтягування), 3x6-8 повторень. Додавай вагу, коли останнє повторення легке." },
  },
  sleep: {
    icon: "😴",
    title:           { en: "Sleep architecture",                         uk: "Архітектура сну" },
    evidence: 5,
    cost:            { en: "$0",                                         uk: "$0" },
    why:             { en: "Single biggest longevity lever. Deep sleep clears amyloid; REM consolidates memory. Estrogen drop disrupts both — fix is structural, not just hours.",
                       uk: "Найбільший важіль довголіття. Глибокий сон вичищає амілоїд; REM закріплює пам'ять. Падіння естрогену збиває обидва — фікс структурний, не лише в годинах." },
    femaleCaveat:    { en: "Luteal needs 30-60 min more sleep. Hot flushes wake you in late luteal — cool room (18°C), wicking sleepwear.",
                       uk: "У лютеїн треба на 30-60 хв більше сну. Припливи будять у кінці лютеїну — прохолодна спальня (18°C), вологовідводна піжама." },
    howToStart:      { en: "Anchor wake time 7 days/week. Sunlight in eyes within 30 min of waking. Last meal 3h before bed. No screens 1h before.",
                       uk: "Якір — однаковий час пробудження 7 днів. Сонце в очі за 30 хв після пробудження. Остання їжа за 3г до сну. Без екранів за 1г." },
  },
  creatine: {
    icon: "💪",
    title:           { en: "Creatine monohydrate",                       uk: "Креатин моногідрат" },
    evidence: 4,
    cost:            { en: "$15/month",                                  uk: "~$15/міс" },
    why:             { en: "Most-studied supplement on the planet. For women 35+: 5g/day adds muscle mass, supports brain (memory, fog), and bone density. Not just for gym bros.",
                       uk: "Найдосліджена добавка планети. Для жінок 35+: 5г/день нарощує м'язи, підтримує мозок (пам'ять, туман) і щільність кісток. Не лише для качків." },
    femaleCaveat:    { en: "Women under-respond at 3g — 5g is the dose. Water retention is intracellular (good), not bloating. Take with carbs for uptake.",
                       uk: "Жінки недореагують на 3г — доза 5г. Затримка води внутрішньоклітинна (добре), не набряк. Приймай з вуглеводами для засвоєння." },
    howToStart:      { en: "5g/day, any time, with food. No loading phase needed. Skip 'creatine HCl' — monohydrate is the only proven form.",
                       uk: "5г/день, будь-коли, з їжею. Завантаження не потрібне. Пропусти 'креатин HCl' — моногідрат єдина доведена форма." },
  },
  redLight: {
    icon: "🔴",
    title:           { en: "Red light therapy",                          uk: "Червоне світло (RLT)" },
    evidence: 3,
    cost:            { en: "$$ panel ($150-400)",                        uk: "$$ панель ($150-400)" },
    why:             { en: "Stimulates collagen (estrogen-dependent — drops 1.5%/yr after 35), improves mitochondrial energy, supports thyroid. 660nm + 850nm wavelengths.",
                       uk: "Стимулює колаген (естроген-залежний — падає 1.5%/рік після 35), покращує мітохондріальну енергію, підтримує щитовидку. Хвилі 660нм + 850нм." },
    femaleCaveat:    { en: "Avoid direct light on thyroid if Hashimoto's. Skin response is hormone-dependent — track 8 weeks before judging.",
                       uk: "Уникай прямого світла на щитовидку при Хашимото. Реакція шкіри гормон-залежна — оцінюй через 8 тижнів." },
    howToStart:      { en: "10-20 min, 3-5x/week, 30 cm from skin. Bare skin only — clothes block wavelengths. Morning is optimal.",
                       uk: "10-20 хв, 3-5x/тиждень, 30 см від шкіри. Лише гола шкіра — одяг блокує хвилі. Зранку оптимально." },
  },
  coldPlunge: {
    icon: "🧊",
    title:           { en: "Cold exposure",                              uk: "Холодова експозиція" },
    evidence: 3,
    cost:            { en: "$0 cold shower / $$$ tub",                   uk: "$0 холодний душ / $$$ ванна" },
    why:             { en: "Boosts norepinephrine 200-300%, brown fat activation, dopamine baseline. Mood + focus benefits stronger than physical.",
                       uk: "Підвищує норадреналін на 200-300%, активує бурий жир, базовий дофамін. Користь для настрою/фокусу сильніша за фізичну." },
    femaleCaveat:    { en: "CAUTION in luteal phase — already-elevated cortisol can spike further. Skip if you have Raynaud's. Never longer than 3 min for women.",
                       uk: "ОБЕРЕЖНО в лютеальній фазі — і так високий кортизол може стрибнути ще. Пропусти при Рейно. Ніколи довше 3 хв для жінок." },
    howToStart:      { en: "Wk1-2: end shower with 30s @ 15°C. Wk3+: 1-2 min plunge @ 12-15°C, 2-3x/week, only follicular/ovulation.",
                       uk: "Т1-2: закінчуй душ 30с при 15°C. Т3+: 1-2 хв занурення при 12-15°C, 2-3x/тиждень, лише фолікулярна/овуляція." },
  },
  fasting: {
    icon: "⏰",
    title:           { en: "Time-restricted eating",                     uk: "Обмежене у часі харчування" },
    evidence: 2,
    cost:            { en: "$0",                                         uk: "$0" },
    why:             { en: "Modest insulin/autophagy benefits, but female-specific data is thin. Most longevity wins come from quality of food, not timing window.",
                       uk: "Помірна користь для інсуліну/аутофагії, але жіночих даних мало. Більшість виграшу довголіття — від якості їжі, не вікна часу." },
    femaleCaveat:    { en: "Cap window at 12-14h — longer disrupts thyroid + cycle. NEVER skip breakfast in luteal phase. Stop if cycle goes irregular.",
                       uk: "Обмежуй вікно 12-14г — довше збиває щитовидку + цикл. НІКОЛИ не пропускай сніданок у лютеїн. Стоп, якщо цикл збився." },
    howToStart:      { en: "12h overnight (e.g. 8pm-8am). Add 1h every 2 weeks if it feels good. Stop at 14h. Black coffee/tea OK in fasting window.",
                       uk: "12г уночі (напр. 20:00-08:00). Додавай по 1г кожні 2 тижні якщо комфортно. Стоп на 14г. Чорна кава/чай у вікні голоду — ок." },
  },
  hrtPrep: {
    icon: "📋",
    title:           { en: "HRT-conversation prep",                      uk: "Підготовка до розмови про ГЗТ" },
    evidence: 4,
    cost:            { en: "$0 — 1 doctor visit",                        uk: "$0 — 1 візит до лікаря" },
    why:             { en: "Modern body-identical HRT (estradiol patch + micronised progesterone) is safer than 2002 WHI study suggested. Most women 40+ benefit. You bring data, doctor decides.",
                       uk: "Сучасна біоідентична ГЗТ (пластир естрадіолу + мікронізований прогестерон) безпечніша, ніж казало WHI 2002. Більшості жінок 40+ корисно. Ти приносиш дані, лікар вирішує." },
    femaleCaveat:    { en: "Not a DIY tool. This is preparation: log symptoms 90 days, request labs (FSH, estradiol, AMH), ask about transdermal route specifically.",
                       uk: "Не для самопрактики. Це підготовка: лог симптомів 90 днів, запит аналізів (ФСГ, естрадіол, АМГ), питай саме про трансдермальний шлях." },
    howToStart:      { en: "1) 90-day symptom log via Alex check-in. 2) Request: FSH day 3, estradiol, AMH, free testosterone. 3) Ask about estradiol patch + oral micronised progesterone (not synthetic progestins).",
                       uk: "1) 90-денний лог симптомів через check-in Alex. 2) Запит: ФСГ 3 день, естрадіол, АМГ, вільний тестостерон. 3) Питай про пластир естрадіолу + оральний мікронізований прогестерон (не синтетичні прогестини)." },
  },
}

// Picks 3-4 most relevant biohacker tools for a profile.
// Logic: weighted scoring on age + symptoms + hormoneShift + cycle phase.
function generateBiohackerRecs(profile) {
  const skin = profile.skinSymptoms || []
  const hair = profile.hairSymptoms || []
  const body = profile.bodySymptoms || []
  const age  = profile.birthYear ? calcAge(profile.birthYear) : 35
  const phase = getPhase(calcCycleDay(profile), parseInt(profile.cycleLength) || 28)
  const hormoneShift = isHormoneShiftDetected(profile)
  const stress = parseInt(profile.stressLevel) || 5
  const lowProtein = profile.proteinIntake === "low" || profile.proteinIntake === "moderate"

  const score = { sauna: 2, strength: 3, sleep: 2, creatine: 1, redLight: 1, coldPlunge: 1, fasting: 1, hrtPrep: 0 }

  // Strength is foundational — boost based on age and bone risk
  if (age >= 35) score.strength += 2
  if (age >= 40) score.strength += 1
  if (hair.includes("thinning") || body.includes("recovery")) score.strength += 1
  if (lowProtein)                  score.strength += 1

  // Sauna — cortisol, hormone shift, recovery
  if (stress >= 6)                 score.sauna += 2
  if (hormoneShift)                score.sauna += 2
  if (body.includes("fatigue"))    score.sauna += 1
  if (skin.includes("dry") || skin.includes("wrinkles")) score.sauna += 1

  // Sleep — anyone with sleep issues, brain fog, perimenopause
  if (profile.sleepQuality === "poor")    score.sleep += 3
  if (profile.wakeNight === "yes")        score.sleep += 2
  if (profile.wakeNight === "sometimes")  score.sleep += 1
  if (body.includes("brainfog"))          score.sleep += 1
  if (hormoneShift)                       score.sleep += 1

  // Creatine — muscle/brain/bone for 35+
  if (age >= 35)                          score.creatine += 2
  if (body.includes("brainfog"))          score.creatine += 1
  if (hair.includes("thinning") || body.includes("recovery")) score.creatine += 1
  if (lowProtein)                         score.creatine += 1

  // Red light — collagen-dependent skin, hormone shift, energy
  if (skin.includes("dry") || skin.includes("wrinkles")) score.redLight += 2
  if (hormoneShift)                                      score.redLight += 1
  if (age >= 38)                                         score.redLight += 1

  // Cold — only if not already in luteal stress, and stress is moderate/high
  if (phase !== "luteal" && stress >= 5)  score.coldPlunge += 2
  if (body.includes("brainfog") && phase !== "luteal") score.coldPlunge += 1
  if (phase === "luteal")                 score.coldPlunge -= 1

  // Fasting — only without hormone shift, only with insulin/PCOS pattern
  const pcosLike = (skin.includes("acne") && body.includes("belly") && age <= 42)
  if (pcosLike && !hormoneShift)          score.fasting += 2
  if (hormoneShift)                       score.fasting -= 2

  // HRT prep — meaningful only if hormone shift + age 40+
  if (hormoneShift)                       score.hrtPrep += 3
  if (age >= 40)                          score.hrtPrep += 2
  if (age >= 45)                          score.hrtPrep += 1

  return Object.entries(score)
    .map(([key, s]) => ({ key, score: s }))
    .sort((a, b) => b.score - a.score)
    .filter(r => r.score > 0)
    .slice(0, 4)
}

// ─── BEAUTY HORMONES MAP (4 hormones × 4 manifestations) ──────────────────────
// Educational matrix: how 4 key hormones express across skin / hair / body / brain.
// Source basis: PRODUCT_STRATEGY.md Part 1 pp. 162-170. Wellness frame, not diagnosis.
const HORMONES_MAP = {
  estrogen: {
    icon: "🌸",
    color: "#9B8FE8",
    title:     { en: "Estrogen",      uk: "Естроген" },
    direction: "↓",
    subtitle:  { en: "decline after 35", uk: "зниження після 35" },
    cells: {
      skin:  { en: "Dryness, wrinkles, -1.5%/yr collagen", uk: "Сухість, зморшки, -1.5%/рік колагену" },
      hair:  { en: "Thinning, temple recession",            uk: "Стоншення, скронева зона" },
      body:  { en: "-3-8% muscle per decade",               uk: "-3-8% м'язів за декаду" },
      brain: { en: "Brain fog, memory dips",                uk: "Туман, провали в пам'яті" },
    },
    protocol: {
      en: [
        "Strength 2x/week — preserves bone + muscle estrogen used to protect",
        "Phytoestrogens: 30g flaxseed/day, soy, chickpeas — modest support",
        "Vitamin D3 4000IU + K2 — bone density slips with estrogen",
        "Sleep 7-8h: deep sleep restores everything else",
      ],
      uk: [
        "Силові 2x/тиждень — зберігають кістки і м'язи, що раніше захищав естроген",
        "Фітоестрогени: 30г лляного насіння/день, соя, нут — м'яка підтримка",
        "Вітамін D3 4000МО + K2 — щільність кісток падає з естрогеном",
        "Сон 7-8 годин: глибокий сон відновлює все інше",
      ],
    },
  },
  cortisol: {
    icon: "⚡",
    color: "#F59E3F",
    title:     { en: "Cortisol",      uk: "Кортизол" },
    direction: "↑",
    subtitle:  { en: "chronic elevation", uk: "хронічне підвищення" },
    cells: {
      skin:  { en: "Acne, accelerated aging",                  uk: "Акне, прискорене старіння" },
      hair:  { en: "Telogen effluvium (3x more under stress)", uk: "Телоген-ефлювій (3x частіше при стресі)" },
      body:  { en: "Belly fat, insulin resistance",            uk: "Жир на животі, інсулінорезистентність" },
      brain: { en: "Anxiety, racing thoughts",                 uk: "Тривожність, потік думок" },
    },
    protocol: {
      en: [
        "Magnesium glycinate 300mg before bed — drops evening cortisol",
        "Cap caffeine at 1 cup, before noon. Skip in luteal phase",
        "Walk 20 min outside before 10 AM — anchors cortisol curve",
        "Box breathing 4-4-4-4 when a spike feels coming",
      ],
      uk: [
        "Магній гліцинат 300мг перед сном — знижує вечірній кортизол",
        "Кофеїн — макс 1 чашка до обіду. Пропусти у лютеїн",
        "Прогулянка 20 хв надворі до 10 ранку — налаштовує криву кортизолу",
        "Дихання box 4-4-4-4, коли відчуваєш сплеск",
      ],
    },
  },
  progesterone: {
    icon: "🌙",
    color: "#4A9EDF",
    title:     { en: "Progesterone",  uk: "Прогестерон" },
    direction: "↓",
    subtitle:  { en: "luteal decline", uk: "падіння у лютеїн" },
    cells: {
      skin:  { en: "Inflammation, pre-period breakouts",  uk: "Запалення, висипи перед циклом" },
      hair:  { en: "Subtle texture changes",              uk: "Тонкі зміни текстури" },
      body:  { en: "Water retention, breast tenderness",  uk: "Затримка води, чутливість грудей" },
      brain: { en: "Irritability, insomnia in luteal",    uk: "Дратівливість, безсоння у лютеїн" },
    },
    protocol: {
      en: [
        "Vitamin B6 (P5P) 50mg — supports luteal progesterone",
        "Magnesium glycinate — calms GABA where progesterone usually does",
        "Cool bedroom (18°C) + earlier bedtime in luteal week",
        "Skip alcohol second half of cycle — disrupts deep sleep further",
      ],
      uk: [
        "Вітамін B6 (P5P) 50мг — підтримує лютеїновий прогестерон",
        "Магній гліцинат — заспокоює GABA, де раніше це робив прогестерон",
        "Прохолодна спальня (18°C) + раніше лягати у лютеїновому тижні",
        "Пропусти алкоголь у другій половині циклу — додатково збиває глибокий сон",
      ],
    },
  },
  testosterone: {
    icon: "💪",
    color: "#4ECBA8",
    title:     { en: "Testosterone",  uk: "Тестостерон" },
    direction: "↓",
    subtitle:  { en: "gradual drop after 35", uk: "поступове падіння після 35" },
    cells: {
      skin:  { en: "Thinning, slower healing",   uk: "Стоншена шкіра, повільне загоєння" },
      hair:  { en: "Texture change, less density", uk: "Зміна текстури, менша густота" },
      body:  { en: "Muscle loss, slower recovery", uk: "Втрата м'язів, гірше відновлення" },
      brain: { en: "Low motivation, libido shift", uk: "Низька мотивація, зміна лібідо" },
    },
    protocol: {
      en: [
        "Heavy strength 2x/week — most direct lever for free testosterone",
        "Zinc 15mg + vitamin D3 — both required for synthesis",
        "Sleep 7-8h: testosterone is made overnight",
        "Creatine 5g/day — synergistic with strength for women 35+",
      ],
      uk: [
        "Важкі силові 2x/тиждень — найпряміший важіль для вільного тестостерону",
        "Цинк 15мг + вітамін D3 — обидва потрібні для синтезу",
        "Сон 7-8 годин: тестостерон виробляється вночі",
        "Креатин 5г/день — синергія з силовими для жінок 35+",
      ],
    },
  },
}

const HORMONE_PILLARS = [
  { key: "skin",  emoji: "✨", label: { en: "Skin",  uk: "Шкіра" } },
  { key: "hair",  emoji: "💇", label: { en: "Hair",  uk: "Волосся" } },
  { key: "body",  emoji: "🌀", label: { en: "Body",  uk: "Тіло" } },
  { key: "brain", emoji: "🧠", label: { en: "Brain", uk: "Мозок" } },
]

// ─── SKIP PRODUCTS (filter traps by symptom profile) ──────────────────────────
// Trigger keys: skin/hair/body symptom IDs + "hormone_shift" + "luteal_high_stress" + "always".
const SKIP_PRODUCTS = {
  collagen_drinks: {
    name:    { en: "Collagen drinks ($60+ a month)",          uk: "Колагенові напої ($60+ на місяць)" },
    instead: { en: "30g protein at breakfast",                 uk: "30г білка на сніданок" },
    why:     { en: "Mostly hydrolyzed peptides + sugar. Real protein at breakfast does more for skin and costs less.",
               uk: "Здебільшого гідролізовані пептиди + цукор. Білок зранку дає шкірі більше і коштує менше." },
    triggers: ["always"],
  },
  led_mask_only: {
    name:    { en: "$400 LED mask as 'main protocol'",        uk: "Дорога LED-маска як «основний протокол»" },
    instead: { en: "Sauna 3x/week + strength 2x/week",         uk: "Сауна 3р/тиж + силові 2р/тиж" },
    why:     { en: "Sauna ★★★★★ vs LED ★★★★ for skin and longevity (Часть 1, р. 152). Same money, 5x the result.",
               uk: "Сауна ★★★★★ проти LED ★★★★ для шкіри і довголіття. Ті ж гроші — у 5 разів більше ефекту." },
    triggers: ["wrinkles", "dull", "always"],
  },
  expensive_eye_cream: {
    name:    { en: "$120 'anti-aging' eye creams",            uk: "Дорогі «anti-age» креми для очей ($120)" },
    instead: { en: "Sleep + SPF + hydration",                  uk: "Сон + SPF + зволоження" },
    why:     { en: "Skin under the eyes is too thin to absorb most actives. Sleep and sunscreen do 90% for free.",
               uk: "Шкіра під очима занадто тонка щоб всмоктати активи. Сон + SPF — 90% результату безкоштовно." },
    triggers: ["puffiness", "wrinkles", "always"],
  },
  detox_tea: {
    name:    { en: "'Hormone detox' teas + cleanses",         uk: "«Детокс гормонів» — чаї і очистки" },
    instead: { en: "Liver does it for free + fiber",           uk: "Печінка робить це безкоштовно + клітковина" },
    why:     { en: "Most contain laxatives — water loss, not hormone clearance. Liver detoxes estrogen on its own.",
               uk: "Більшість містять проносне — це втрата води, а не гормонів. Печінка чистить естроген сама." },
    triggers: ["always"],
  },
  retinol_acid_combo: {
    name:    { en: "Retinol + AHA/BHA layered together",      uk: "Ретинол + AHA/BHA одним шаром" },
    instead: { en: "Alternate nights + ceramides",             uk: "Чергуй через ніч + кераміди" },
    why:     { en: "Layering on a reactive barrier = redness, breakouts, broken capillaries. Alternate, never stack.",
               uk: "Один шар на реактивний бар'єр = почервоніння, висипання, лопнуті судини. Чергуй, не стакай." },
    triggers: ["sensitive"],
  },
  foam_sls_cleanser: {
    name:    { en: "Foaming SLS / sulfate cleansers",         uk: "Гелі-пінки з SLS / сульфатами" },
    instead: { en: "Milk or balm cleanser",                    uk: "Молочко або бальзам для вмивання" },
    why:     { en: "Strip the lipids your barrier is already missing. Tight 'squeaky-clean' feel = damaged skin.",
               uk: "Змивають останні ліпіди — а їх і так бракує. Відчуття «скрипу» = пошкоджений бар'єр." },
    triggers: ["dry", "sensitive"],
  },
  heavy_oils_acne: {
    name:    { en: "Coconut / cocoa butter on face",          uk: "Кокосове / какао-масло на обличчя" },
    instead: { en: "Squalane or jojoba",                       uk: "Скволан або жожоба" },
    why:     { en: "Comedogenic — sits on top of pores. Squalane gives the same feel without the breakouts.",
               uk: "Комедогенне — сидить на порах. Скволан дає той самий ефект без висипань." },
    triggers: ["acne", "oily"],
  },
  biotin_megadose: {
    name:    { en: "High-dose biotin (5000+ mcg)",            uk: "Великі дози біотину (5000+ мкг)" },
    instead: { en: "Test ferritin + protein at breakfast",     uk: "Перевір феритин + білок на сніданок" },
    why:     { en: "Skews thyroid + troponin labs, can trigger acne. Hair thinning is almost always ferritin/protein, not biotin.",
               uk: "Спотворює аналізи щитовидки і тропоніну, провокує акне. Тонке волосся = феритин/білок, не біотин." },
    triggers: ["thinning", "shedding", "acne"],
  },
  cardio_for_belly: {
    name:    { en: "Hours of cardio for belly fat",           uk: "Години кардіо проти жиру на животі" },
    instead: { en: "Strength 2-3x/week + protein",             uk: "Силові 2-3р/тиж + білок" },
    why:     { en: "After 35 long cardio raises cortisol and shrinks muscle — belly stays. Strength + protein win this.",
               uk: "Після 35 тривале кардіо ↑ кортизол і ↓ м'язи — живіт залишається. Силові + білок виграють." },
    triggers: ["belly", "hormone_shift"],
  },
  cold_plunge_luteal: {
    name:    { en: "Daily ice baths in luteal phase",         uk: "Щоденні крижані ванни в лютеїновій фазі" },
    instead: { en: "Sauna or warm walk instead",               uk: "Замість — сауна або теплі прогулянки" },
    why:     { en: "Cortisol is already elevated second half of cycle. Cold spikes it further — sleep and mood worsen.",
               uk: "У другій половині циклу кортизол і так високий. Холод ↑ ще — сон і настрій страждають." },
    triggers: ["luteal_high_stress"],
  },
  greens_powder: {
    name:    { en: "$80 'super greens' powders",              uk: "Дорогі «super greens» порошки ($80)" },
    instead: { en: "Ferritin / B12 / vitamin D panel",         uk: "Феритин / B12 / вітамін D панель" },
    why:     { en: "Trace amounts of dozens of plants ≠ protein, fiber, or real food. Test what's actually low first.",
               uk: "Сліди десятків рослин ≠ білок, клітковина чи їжа. Спочатку перевір, чого реально бракує." },
    triggers: ["fatigue", "brainfog"],
  },
  fragrance_lotion: {
    name:    { en: "Fragranced body lotions",                 uk: "Парфумовані лосьйони для тіла" },
    instead: { en: "Unscented ceramide formula",               uk: "Без аромату, з керамідами" },
    why:     { en: "Largest organ + reactive skin = the wrong place for parfum. Unscented ceramides are safer and cheaper.",
               uk: "Найбільший орган + реактивна шкіра = не місце для парфуму. Без аромату з керамідами — безпечніше і дешевше." },
    triggers: ["sensitive"],
  },
  alcohol_toner: {
    name:    { en: "Alcohol-based 'oil control' toners",      uk: "Тоніки з алкоголем для «контролю жиру»" },
    instead: { en: "BHA 1-2x/week + niacinamide",              uk: "BHA 1-2р/тиж + ніацинамід" },
    why:     { en: "Strip oil → skin overproduces more. Niacinamide regulates sebum without rebound.",
               uk: "Знімають жир → шкіра виробляє ще більше. Ніацинамід регулює себум без відскоку." },
    triggers: ["oily", "acne"],
  },
}

// Picks 5-8 most relevant skip-products for a profile (sorted by trigger hits).
function getSkipProducts(profile) {
  const skin   = profile.skinSymptoms || []
  const hair   = profile.hairSymptoms || []
  const body   = profile.bodySymptoms || []
  const stress = parseInt(profile.stressLevel) || 5
  const phase  = getPhase(calcCycleDay(profile), parseInt(profile.cycleLength) || 28)
  const hormoneShift = isHormoneShiftDetected(profile)

  const userTriggers = new Set([...skin, ...hair, ...body])
  if (hormoneShift) userTriggers.add("hormone_shift")
  if (phase === "luteal" && stress >= 6) userTriggers.add("luteal_high_stress")

  const ranked = Object.entries(SKIP_PRODUCTS)
    .map(([key, item]) => {
      const hits = item.triggers.filter(t => t !== "always" && userTriggers.has(t)).length
      const isAlways = item.triggers.includes("always")
      return { key, item, score: hits + (isAlways ? 0.5 : 0) }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)

  return ranked.slice(0, 8)
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
          {uk ? "Твій AI" : "Your AI"}
        </h1>
        <h1 style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.08, margin: "0 0 16px", letterSpacing: "-1.5px", background: "linear-gradient(135deg, #4A9EDF, #4ECBA8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          {uk ? "longevity-тренер" : "longevity coach"}
        </h1>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#4ECBA8", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 16 }}>
          {uk ? "Для жінок 35+" : "For women 35+"}
        </div>

        <p style={{ fontSize: 15, lineHeight: 1.55, color: "#6B7A8D", margin: 0, maxWidth: 300 }}>
          {uk
            ? "5 симптомів — 1 причина. Шкіра, волосся, гормони, енергія — пов'язані."
            : "5 symptoms, 1 root cause. Skin, hair, hormones, energy — connected."}
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

// Perimenopause / hormone-shift opt-in (Peri-SS / MRS based)
const HORMONE_INTRO = [
  { id: "yes",             en: "Yes, I notice changes",          uk: "Так, я помічаю зміни" },
  { id: "not_really",      en: "Not really",                      uk: "Не дуже" },
  { id: "havent_thought",  en: "Haven't thought about it",        uk: "Не думала про це" },
]
const HORMONE_LEVELS = [
  { id: 0, en: "None",     uk: "Немає" },
  { id: 1, en: "Mild",     uk: "Легко" },
  { id: 2, en: "Moderate", uk: "Помірно" },
  { id: 3, en: "Severe",   uk: "Сильно" },
]
const HORMONE_QUESTIONS = [
  { id: "sleep",     en: "Sleep quality changes",         uk: "Зміни в якості сну" },
  { id: "brainfog",  en: "Brain fog or concentration",     uk: "Мозковий туман, концентрація" },
  { id: "mood",      en: "Mood swings or anxiety",         uk: "Перепади настрою або тривога" },
  { id: "energy",    en: "Energy through the day",         uk: "Енергія протягом дня" },
  { id: "cycle",     en: "Cycle regularity",               uk: "Регулярність циклу" },
  { id: "skin",      en: "Skin or hair changes",           uk: "Зміни шкіри або волосся" },
  { id: "joints",    en: "Joint or muscle aches",          uk: "Болі в суглобах або м'язах" },
  { id: "flushes",   en: "Hot flushes or night sweats",    uk: "Припливи або нічна пітливість" },
]

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
    { id: "morningEnergy", en: "Low morning energy",     uk: "Низька ранкова енергія" },
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
    hormoneShiftIntro:   profile.hormoneShiftIntro   || "",
    hormoneShiftAnswers: profile.hormoneShiftAnswers || {},
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

            {/* Hormone-shift opt-in (Step A) */}
            <div style={{ height: 28 }} />
            <div style={{ ...S.card, padding: "16px 18px", background: "rgba(78,203,168,0.06)", border: "1px solid rgba(78,203,168,0.18)", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#4ECBA8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                {uk ? "Опційний блок" : "Optional"}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1A2433", marginBottom: 4, lineHeight: 1.45 }}>
                {uk ? "Чи помічаєш зміни порівняно з тим, що було 5 років тому?" : "Have you noticed shifts vs 5 years ago?"}
              </div>
              <div style={{ fontSize: 12, color: "#6B7A8D", marginBottom: 12, lineHeight: 1.5 }}>
                {uk ? "Допоможе персоналізувати протокол точніше." : "Helps us personalise your protocol more precisely."}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {HORMONE_INTRO.map(o => (
                  <Chip key={o.id} active={d.hormoneShiftIntro === o.id} onClick={() => setD(x => ({ ...x, hormoneShiftIntro: o.id, hormoneShiftAnswers: o.id === "yes" ? x.hormoneShiftAnswers : {} }))} style={{ textAlign: "left" }}>{o[L]}</Chip>
                ))}
              </div>
            </div>

            {/* Hormone-shift detailed (Step B) — shown only if user selected "yes" */}
            {d.hormoneShiftIntro === "yes" && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>{uk ? "Як сильно це проявляється?" : "How much do you notice these?"}</SectionLabel>
                {HORMONE_QUESTIONS.map(q => (
                  <div key={q.id} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2433", marginBottom: 8 }}>{q[L]}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {HORMONE_LEVELS.map(lv => (
                        <Chip
                          key={lv.id}
                          active={d.hormoneShiftAnswers[q.id] === lv.id}
                          onClick={() => setD(x => ({ ...x, hormoneShiftAnswers: { ...x.hormoneShiftAnswers, [q.id]: lv.id } }))}
                          style={{ padding: "8px 12px", fontSize: 12 }}
                        >
                          {lv[L]}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: "#6B7A8D", lineHeight: 1.55, marginTop: 4 }}>
                  {uk
                    ? "Шкала на основі MRS / Peri-SS — wellness-сигнал, не діагноз."
                    : "Scale based on MRS / Peri-SS — wellness signal, not a diagnosis."}
                </div>
              </div>
            )}
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

function ReportScreen({ profile, onDone, onChat, lang }) {
  const uk           = lang === "uk"
  const L            = uk ? "uk" : "en"
  const causes       = getRootCauses(profile)
  const phaseKey     = getPhase(parseInt(profile.cycleDay) || 14, parseInt(profile.cycleLength) || 28)
  const beauty       = generateBeautyRoutine(profile, uk)
  const protocol     = getDefaultProtocol(uk)
  const phase        = PHASE_NAMES[phaseKey]
  const hormoneShift = isHormoneShiftDetected(profile)
  const hormoneCause = hormoneShift ? CAUSE_DATA.hormone_shift : null
  const biohackerRecs = generateBiohackerRecs(profile)
  const skipProducts  = getSkipProducts(profile)
  const [bioOpen, setBioOpen] = useState(null)
  const [hormoneOpen, setHormoneOpen] = useState(null)

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

        {/* Section: Hormone shifts (only when detected) */}
        {hormoneShift && hormoneCause && (
          <>
            <div style={{ height: 24 }} />
            <SectionLabel>{uk ? "ГОРМОНАЛЬНІ ЗМІНИ ЯКІ ТИ ПОМІЧАЄШ" : "HORMONE SHIFTS YOU'RE NOTICING"}</SectionLabel>

            <Card style={{ marginBottom: 12, background: "linear-gradient(135deg, rgba(78,203,168,0.06), rgba(74,158,223,0.06))", border: "1px solid rgba(78,203,168,0.18)" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#4ECBA8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                {uk ? "Що відбувається" : "What's happening"}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: "#1A2433", margin: 0 }}>
                {uk ? (
                  <>Твоє тіло поступово змінює гормональний баланс — це називається <b>перименопауза</b>. Це нормальна фаза, яка може початись у 35–45 років і триває кілька років. <b>Не діагноз. Не пов'язано з тим, чи ти народжувала.</b></>
                ) : (
                  <>Your body is gradually shifting its hormone balance — this is called <b>perimenopause</b>. It's a normal phase that can start at 35–45 and last several years. <b>Not a diagnosis. Not connected to whether you've had children.</b></>
                )}
              </p>
            </Card>

            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#4A9EDF", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                {uk ? "Чому це важливо зараз" : "Why it matters now"}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: "#1A2433", margin: 0 }}>
                {uk
                  ? "Розуміння цих змін — твоя перевага. Більшість жінок чекає 2.6 роки, щоб лікар це назвав. Ти бачиш це раніше і можеш діяти."
                  : "Understanding these shifts is your edge. Most women wait 2.6 years for a doctor to name this. You're seeing it earlier and can act."}
              </p>
            </Card>

            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#F59E3F", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                {uk ? "Що ти можеш робити" : "What you can do"}
              </div>
              {hormoneCause.protocol[L].map((p, j) => (
                <div key={j} style={{ fontSize: 13, color: "#1A2433", marginBottom: j < 2 ? 10 : 14, lineHeight: 1.55 }}>{p}</div>
              ))}
              {onChat && (
                <button onClick={onChat} style={{ ...S.btnGhost, padding: "12px 20px", fontSize: 14 }}>
                  💬 {uk ? "Запитай Alex →" : "Ask Alex →"}
                </button>
              )}
            </Card>

            <p style={{ fontSize: 14, fontWeight: 700, textAlign: "center", color: "#4A9EDF", margin: "16px 12px 8px", lineHeight: 1.5 }}>
              {uk
                ? "Це не різні проблеми. Це одна історія."
                : "These aren't different problems. They're one story."}
            </p>

            <p style={{ fontSize: 11, color: "#6B7A8D", lineHeight: 1.6, margin: "0 4px 8px", textAlign: "center" }}>
              {uk
                ? "Alex — wellness-coach, не медицина. Якщо симптоми сильні — поговори з лікарем. Шкала на основі валідованих MRS / Peri-SS, інтерпретуємо як wellness-сигнал, не діагноз."
                : "Alex is a wellness coach, not medicine. If symptoms are severe — talk to your doctor. Scale based on validated MRS / Peri-SS, interpreted as a wellness signal, not a diagnosis."}
            </p>
          </>
        )}

        {/* Section: Your Biohacker Stack */}
        <div style={{ height: 24 }} />
        <SectionLabel>{uk ? "ТВІЙ БІОХАКЕР-СТЕК" : "YOUR BIOHACKER STACK"}</SectionLabel>
        <p style={{ fontSize: 12, color: "#6B7A8D", lineHeight: 1.6, margin: "0 4px 14px" }}>
          {uk
            ? "Топ-інструменти longevity для твого профілю. З female-specific нюансами і evidence-рейтингом — без LED-масок і трендів TikTok."
            : "Top longevity tools for your profile. Female-specific caveats and evidence ratings — no LED masks, no TikTok trends."}
        </p>
        {biohackerRecs.map(rec => {
          const tool = BIOHACKER_STACK[rec.key]
          if (!tool) return null
          const isOpen = bioOpen === rec.key
          const stars = "★".repeat(tool.evidence) + "☆".repeat(5 - tool.evidence)
          return (
            <Card key={rec.key} style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
              <button
                onClick={() => setBioOpen(isOpen ? null : rec.key)}
                style={{ width: "100%", background: "transparent", border: "none", padding: "16px 18px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, rgba(245,158,63,0.15), rgba(78,203,168,0.13))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  {tool.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1A2433" }}>{tool.title[L]}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: "#F59E3F", letterSpacing: "1px" }}>{stars}</span>
                    <span style={{ fontSize: 11, color: "#6B7A8D" }}>· {tool.cost[L]}</span>
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "#4A9EDF", flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.18s" }}>›</div>
              </button>
              <div style={{ padding: "0 18px 14px", fontSize: 13, color: "#1A2433", lineHeight: 1.55 }}>
                {tool.why[L]}
              </div>
              {isOpen && (
                <div style={{ padding: "14px 18px 18px", borderTop: "1px solid rgba(74,158,223,0.1)", background: "rgba(245,249,255,0.6)" }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#9B8FE8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                      {uk ? "♀ Жіночі нюанси" : "♀ Female caveats"}
                    </div>
                    <div style={{ fontSize: 12, color: "#1A2433", lineHeight: 1.55 }}>{tool.femaleCaveat[L]}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#4ECBA8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                      {uk ? "Як почати" : "How to start"}
                    </div>
                    <div style={{ fontSize: 12, color: "#1A2433", lineHeight: 1.55 }}>{tool.howToStart[L]}</div>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
        <p style={{ fontSize: 11, color: "#6B7A8D", lineHeight: 1.6, margin: "10px 4px 0", textAlign: "center" }}>
          {uk
            ? "Тапни картку щоб побачити жіночі нюанси і покроковий план старту."
            : "Tap a card to see female caveats and a week-by-week starter plan."}
        </p>

        {/* Section: Beauty Hormones Map */}
        <div style={{ height: 24 }} />
        <SectionLabel>{uk ? "ТВОЯ КАРТА ГОРМОНІВ КРАСИ" : "YOUR BEAUTY HORMONES MAP"}</SectionLabel>
        <p style={{ fontSize: 12, color: "#6B7A8D", lineHeight: 1.6, margin: "0 4px 14px" }}>
          {uk
            ? "Як 4 ключові гормони проявляються у шкірі, волоссі, тілі та мозку. Тапни рядок — побачиш протокол."
            : "How 4 key hormones express across skin, hair, body and brain. Tap a row to see the protocol."}
        </p>

        {/* Column legend */}
        <div style={{ display: "flex", gap: 6, padding: "0 8px 10px 88px" }}>
          {HORMONE_PILLARS.map(p => (
            <div key={p.key} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 14 }}>{p.emoji}</div>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: 1 }}>
                {p.label[L]}
              </div>
            </div>
          ))}
        </div>

        {Object.entries(HORMONES_MAP).map(([key, h]) => {
          const isOpen = hormoneOpen === key
          return (
            <Card key={key} style={{ marginBottom: 8, padding: 0, overflow: "hidden", borderLeft: `3px solid ${h.color}` }}>
              <button
                onClick={() => setHormoneOpen(isOpen ? null : key)}
                style={{ width: "100%", background: "transparent", border: "none", padding: "12px 14px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                <div style={{ width: 76, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: `${h.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                    {h.icon}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: h.color, lineHeight: 1.1 }}>
                    {h.title[L]}
                    <div style={{ fontSize: 11, fontWeight: 800, color: h.color, marginTop: 1 }}>{h.direction}</div>
                  </div>
                </div>
                {HORMONE_PILLARS.map(p => (
                  <div key={p.key} style={{ flex: 1, fontSize: 9.5, lineHeight: 1.35, color: "#1A2433", textAlign: "center", padding: "0 2px" }}>
                    {h.cells[p.key][L]}
                  </div>
                ))}
              </button>
              {isOpen && (
                <div style={{ padding: "14px 18px 18px", borderTop: `1px solid ${h.color}22`, background: `${h.color}0d` }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: h.color, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>
                    {h.title[L]} {h.direction} · {h.subtitle[L]}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#4ECBA8", textTransform: "uppercase", letterSpacing: "0.6px", margin: "10px 0 8px" }}>
                    {uk ? "Що допомагає" : "What helps"}
                  </div>
                  {h.protocol[L].map((p, j) => (
                    <div key={j} style={{ display: "flex", gap: 8, fontSize: 12, color: "#1A2433", marginBottom: j < h.protocol[L].length - 1 ? 8 : 0, lineHeight: 1.5 }}>
                      <span style={{ color: h.color, fontWeight: 800, flexShrink: 0 }}>·</span>
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
        <p style={{ fontSize: 11, color: "#6B7A8D", lineHeight: 1.6, margin: "10px 4px 0", textAlign: "center" }}>
          {uk
            ? "Не діагноз — освітня карта. Один симптом часто = декілька гормонів."
            : "Not a diagnosis — an educational map. One symptom often = several hormones."}
        </p>

        {/* Section: Skip Products */}
        <div style={{ height: 24 }} />
        <SectionLabel>{uk ? "ПРОПУСТИ ЦІ ПРОДУКТИ — НЕ ДЛЯ ТВОГО ПРОФІЛЮ" : "SKIP THESE — NOT FOR YOUR PROFILE"}</SectionLabel>
        <p style={{ fontSize: 12, color: "#6B7A8D", lineHeight: 1.6, margin: "0 4px 14px" }}>
          {uk
            ? "Те, що маркетинг продає твоїй віковій групі, але не працює для твоїх симптомів — або шкодить."
            : "What marketing sells to your age bracket but doesn't fit your symptoms — or actively backfires."}
        </p>

        {skipProducts.map(({ key, item }) => (
          <Card key={key} style={{ marginBottom: 8, padding: "12px 14px", borderLeft: "3px solid #F59E3F" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: "#F59E3F22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 }}>
                ✕
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2433", lineHeight: 1.35, textDecoration: "line-through", textDecorationColor: "#F59E3F88" }}>
                  {item.name[L]}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4ECBA8", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: 6 }}>
                  {uk ? "Натомість" : "Instead"} → <span style={{ color: "#1A2433", textTransform: "none", letterSpacing: 0, fontWeight: 700 }}>{item.instead[L]}</span>
                </div>
                <div style={{ fontSize: 12, color: "#6B7A8D", lineHeight: 1.5, marginTop: 6 }}>
                  {item.why[L]}
                </div>
              </div>
            </div>
          </Card>
        ))}
        <p style={{ fontSize: 11, color: "#6B7A8D", lineHeight: 1.6, margin: "10px 4px 0", textAlign: "center" }}>
          {uk
            ? "Економія тут = бюджет на сауну, силові і феритин-панель."
            : "Money saved here = budget for sauna, strength, and a ferritin panel."}
        </p>

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

        {/* Section: Skin Longevity Protocol */}
        <div style={{ height: 24 }} />
        <SectionLabel>{uk ? "ПРОТОКОЛ ДОВГОЛІТТЯ ШКІРИ" : "SKIN LONGEVITY PROTOCOL"}</SectionLabel>
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
  const [dayTab, setDayTab] = useState("morning")
  const tasks        = getTabTasks(dayTab, phaseKey, uk)
  const protocol     = getDefaultProtocol(uk)
  const longevity    = calcLongevityMarkers(history)
  const phaseProtocol = generatePhaseProtocol(profile, phaseKey, uk)
  const [phaseTab, setPhaseTab] = useState("nutrition")
  const phaseColor   = phaseRec.color
  const phaseTabs = [
    { key: "nutrition", icon: "🥗", label_uk: "Харчування", label_en: "Nutrition" },
    { key: "movement",  icon: "🏃", label_uk: "Рух",        label_en: "Movement" },
    { key: "rest",      icon: "😴", label_uk: "Відпочинок", label_en: "Rest" },
    { key: "beauty",    icon: "✨", label_uk: "Краса",      label_en: "Beauty" },
  ]
  const milestoneStreak = (streak === 30 || streak === 60 || streak === 90) ? streak : null
  const [milestoneSeen, setMilestoneSeen] = useState(() =>
    milestoneStreak ? lsGet("vive_milestone_" + milestoneStreak + "_seen", false) : true
  )
  const milestoneInsights = milestoneStreak ? getMilestoneInsight(history, milestoneStreak) : []

  function dismissMilestone() {
    if (!milestoneStreak) return
    lsSet("vive_milestone_" + milestoneStreak + "_seen", true)
    setMilestoneSeen(true)
  }

  // Fire push + email once per milestone (vive_milestone_<n>_sent flag)
  useEffect(() => {
    if (!milestoneStreak) return
    const sentKey = "vive_milestone_" + milestoneStreak + "_sent"
    if (lsGet(sentKey, false)) return

    const pushOn  = lsGet("vive_notify_push", false)
    const emailOn = lsGet("vive_notify_email_on", false)
    const email   = lsGet("vive_notify_email", "")
    if (!pushOn && !(emailOn && email)) return

    let sent = false
    ;(async () => {
      if (pushOn) {
        const ok = await showLocalMilestoneNotification({
          milestone: milestoneStreak, lang, insights: milestoneInsights,
        })
        if (ok) sent = true
      }
      if (emailOn && email) {
        const r = await sendMilestoneEmail({
          email, name: profile.name || "", milestone: milestoneStreak,
          lang, insights: milestoneInsights,
        })
        if (r && r.ok) sent = true
      }
      if (sent) lsSet(sentKey, true)
    })()
  }, [milestoneStreak])

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

        {/* Longevity Markers */}
        {longevity.sample > 0 && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#6B7A8D", letterSpacing: "1.2px", textTransform: "uppercase" }}>
                  {uk ? "Longevity маркери" : "Longevity markers"}
                </div>
                <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 2 }}>
                  {uk ? `Останні ${longevity.sample} ${longevity.sample === 1 ? "день" : longevity.sample < 5 ? "дні" : "днів"}` : `Last ${longevity.sample} ${longevity.sample === 1 ? "day" : "days"}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: "#4ECBA8", letterSpacing: "-1px" }}>{longevity.score}</div>
                <div style={{ fontSize: 13, color: "#6B7A8D", fontWeight: 700 }}>/100</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { icon: "😴", label: uk ? "Сон сер." : "Avg sleep",      val: `${longevity.sleepAvg.toFixed(1)}h` },
                { icon: "💪", label: uk ? "Білок 25г+" : "Protein hits",  val: `${longevity.proteinHits}/${longevity.sample}` },
                { icon: "🏋️", label: uk ? "Силові"   : "Strength",        val: `${longevity.strengthCount}/${longevity.sample}` },
                { icon: "🧘", label: uk ? "Стрес-дні" : "Stress days",    val: `${longevity.stressDays}/${longevity.sample}` },
              ].map(m => (
                <div key={m.label} style={{ background: "rgba(74,158,223,0.05)", borderRadius: 12, padding: "10px 12px", border: "1px solid rgba(74,158,223,0.1)" }}>
                  <div style={{ fontSize: 16, marginBottom: 2 }}>{m.icon}</div>
                  <div style={{ fontSize: 10, color: "#6B7A8D", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{m.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1A2433", marginTop: 2 }}>{m.val}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 12, lineHeight: 1.5 }}>
              {uk
                ? "Сон, білок і силові — три маркери, які найсильніше впливають на довгострокове здоров'я після 35."
                : "Sleep, protein and strength training — the 3 markers that most impact long-term health after 35."}
            </div>
          </Card>
        )}

        {/* Milestone banner */}
        {milestoneStreak && !milestoneSeen && (
          <Card style={{ marginBottom: 20, background: "linear-gradient(135deg, rgba(245,158,63,0.12), rgba(78,203,168,0.10))", border: "1px solid rgba(245,158,63,0.3)" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#1A2433", marginBottom: 8 }}>
              {uk ? `🌟 ${milestoneStreak} днів! Твоє тіло відповідає:` : `🌟 ${milestoneStreak} days! Your body responds:`}
            </div>
            {milestoneInsights.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {milestoneInsights.map(m => (
                  <div key={m.key} style={{ fontSize: 13, color: "#1A2433", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#4ECBA8", fontWeight: 800 }}>↑</span>
                    <span style={{ fontWeight: 700 }}>{uk ? m.label_uk : m.label_en}</span>
                    <span style={{ color: "#6B7A8D" }}>+{m.delta.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#6B7A8D", marginBottom: 14, lineHeight: 1.5 }}>
                {uk ? "Стабільний ритм — це вже сильна перемога 💙" : "A steady rhythm is its own win 💙"}
              </div>
            )}
            <button onClick={dismissMilestone} style={{ ...S.btnPrimary, padding: "10px 18px", fontSize: 14 }}>
              {uk ? "Got it" : "Got it"}
            </button>
          </Card>
        )}

        {/* Day tabs: Morning / Movement / Evening */}
        <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7A8D", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8 }}>
          {uk ? "Що зараз?" : "What now?"}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            ["morning",  uk ? "🌅 Ранок"  : "🌅 Morning"],
            ["movement", uk ? "🏃 Рух"    : "🏃 Movement"],
            ["evening",  uk ? "🌙 Вечір"  : "🌙 Evening"],
          ].map(([val, label]) => (
            <button key={val} onClick={() => setDayTab(val)} style={{
              flex: 1, padding: "8px 0", borderRadius: 12, fontSize: 13, fontWeight: dayTab === val ? 800 : 500,
              border: dayTab === val ? "1.5px solid #4A9EDF" : "1.5px solid rgba(107,122,141,0.18)",
              background: dayTab === val ? "rgba(74,158,223,0.1)" : "rgba(255,255,255,0.6)",
              color: dayTab === val ? "#4A9EDF" : "#6B7A8D", cursor: "pointer", fontFamily: "inherit",
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

        {/* Phase Protocol */}
        <SectionLabel>{uk ? "ПРОТОКОЛ ФАЗИ" : "PHASE PROTOCOL"}</SectionLabel>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {phaseTabs.map(t => {
            const isActive = phaseTab === t.key
            return (
              <button key={t.key} onClick={() => setPhaseTab(t.key)} style={{
                flex: "1 1 calc(50% - 3px)", padding: "8px 10px", borderRadius: 12, fontSize: 12, fontWeight: isActive ? 800 : 600,
                border: isActive ? `1.5px solid ${phaseColor}` : "1.5px solid rgba(107,122,141,0.18)",
                background: isActive ? `${phaseColor}18` : "rgba(255,255,255,0.6)",
                color: isActive ? phaseColor : "#6B7A8D", cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <span>{t.icon}</span>
                <span>{uk ? t.label_uk : t.label_en}</span>
              </button>
            )
          })}
        </div>
        <Card style={{ marginBottom: 24, border: `1px solid ${phaseColor}30`, background: `linear-gradient(135deg, ${phaseColor}08, ${phaseColor}03)` }}>
          {phaseProtocol[phaseTab].map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(107,122,141,0.08)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: phaseColor, marginTop: 8, flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: "#1A2433", lineHeight: 1.5 }}>{item.text}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 10, lineHeight: 1.5 }}>
            {uk ? "Wellness exploration — не медична порада." : "Wellness exploration — not medical advice."}
          </div>
        </Card>

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
  const [vals, setVals] = useState({ energy: 5, sleep: 7, mood: 5, recovery: 7, move: null, proteinHit: null, strengthDone: null })
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
        <SliderRow label={uk ? "Відновлення" : "Recovery"} valKey="recovery" min={1} max={10}
          formatVal={n => `${n}/10`}
          minLabel={uk ? "🪫 Розбита" : "🪫 Drained"} maxLabel={uk ? "🔋 Свіжа" : "🔋 Fresh"} />

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{uk ? "Рух сьогодні?" : "Movement today?"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Chip active={vals.move === true}  onClick={() => setVals(v => ({ ...v, move: true }))}  style={{ flex: 1, textAlign: "center" }}>✓ {uk ? "Так" : "Yes"}</Chip>
            <Chip active={vals.move === false} onClick={() => setVals(v => ({ ...v, move: false }))} style={{ flex: 1, textAlign: "center" }}>✗ {uk ? "Ні" : "No"}</Chip>
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{uk ? "25г+ білку на сніданок?" : "Got 25g+ protein at breakfast?"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Chip active={vals.proteinHit === true}  onClick={() => setVals(v => ({ ...v, proteinHit: true }))}  style={{ flex: 1, textAlign: "center" }}>✓ {uk ? "Так" : "Yes"}</Chip>
            <Chip active={vals.proteinHit === false} onClick={() => setVals(v => ({ ...v, proteinHit: false }))} style={{ flex: 1, textAlign: "center" }}>✗ {uk ? "Ні" : "No"}</Chip>
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{uk ? "Силові тренування сьогодні?" : "Did strength training today?"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Chip active={vals.strengthDone === true}  onClick={() => setVals(v => ({ ...v, strengthDone: true }))}  style={{ flex: 1, textAlign: "center" }}>✓ {uk ? "Так" : "Yes"}</Chip>
            <Chip active={vals.strengthDone === false} onClick={() => setVals(v => ({ ...v, strengthDone: false }))} style={{ flex: 1, textAlign: "center" }}>✗ {uk ? "Ні" : "No"}</Chip>
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

  // Notification opt-in (P0.4)
  const [pushOn,  setPushOn]  = useState(() => lsGet("vive_notify_push", false))
  const [emailOn, setEmailOn] = useState(() => lsGet("vive_notify_email_on", false))
  const [email,   setEmail]   = useState(() => lsGet("vive_notify_email", ""))
  const [pushBusy, setPushBusy] = useState(false)
  const [pushErr,  setPushErr]  = useState("")
  const pushSupported = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator

  async function togglePush() {
    setPushErr("")
    if (pushOn) {
      setPushOn(false); lsSet("vive_notify_push", false); return
    }
    if (!pushSupported) { setPushErr(uk ? "Браузер не підтримує сповіщення" : "Browser does not support notifications"); return }
    setPushBusy(true)
    const perm = await requestPushPermission()
    setPushBusy(false)
    if (perm === "granted") { setPushOn(true); lsSet("vive_notify_push", true) }
    else if (perm === "denied") setPushErr(uk ? "Дозвіл заблоковано в налаштуваннях браузера" : "Permission blocked in browser settings")
    else setPushErr(uk ? "Дозвіл не надано" : "Permission not granted")
  }

  function toggleEmail() {
    const next = !emailOn
    setEmailOn(next); lsSet("vive_notify_email_on", next)
  }

  function saveEmail(v) {
    setEmail(v); lsSet("vive_notify_email", v)
  }

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
        <Card style={{ marginBottom: 16 }}>
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

        {/* Notifications opt-in (P0.4 — milestones 30/60/90) */}
        <div style={{ fontSize: 11, fontWeight: 800, color: "#6B7A8D", letterSpacing: "0.8px", textTransform: "uppercase", margin: "8px 4px 8px" }}>
          {uk ? "СПОВІЩЕННЯ" : "NOTIFICATIONS"}
        </div>
        <Card style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: "#6B7A8D", lineHeight: 1.5, marginBottom: 14 }}>
            {uk
              ? "Сповіщаємо коли ти сягнеш 30, 60 чи 90 днів стріку — з топ-3 метриками, що покращились."
              : "We'll ping you at 30, 60, and 90-day streaks — with the top 3 metrics that improved."}
          </div>

          {/* Push toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid rgba(74,158,223,0.08)" }}>
            <div style={{ flex: 1, paddingRight: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A2433" }}>{uk ? "Push-сповіщення" : "Push notifications"}</div>
              <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 2 }}>
                {uk ? "На пристрій (PWA)" : "On this device (PWA)"}
              </div>
            </div>
            <button onClick={togglePush} disabled={pushBusy} aria-label="toggle push" style={{
              width: 46, height: 26, borderRadius: 14, border: "none", cursor: pushBusy ? "wait" : "pointer",
              background: pushOn ? "#4ECBA8" : "rgba(107,122,141,0.25)", position: "relative", transition: "background .2s",
              fontFamily: "inherit", padding: 0, flexShrink: 0,
            }}>
              <span style={{ position: "absolute", top: 3, left: pushOn ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left .2s" }} />
            </button>
          </div>
          {pushErr && (
            <div style={{ fontSize: 11, color: "#E05252", marginTop: -8, marginBottom: 12 }}>{pushErr}</div>
          )}
          {!pushSupported && (
            <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: -8, marginBottom: 12, fontStyle: "italic" }}>
              {uk ? "Підказка: на iOS додай Alex на Home Screen — push працює лише з PWA." : "Tip: on iOS, add Alex to Home Screen — push only works in PWA mode."}
            </div>
          )}

          {/* Email toggle + input */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: emailOn ? 12 : 0 }}>
            <div style={{ flex: 1, paddingRight: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A2433" }}>{uk ? "Email" : "Email"}</div>
              <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 2 }}>
                {uk ? "Лист на milestone-день" : "Email on milestone day"}
              </div>
            </div>
            <button onClick={toggleEmail} aria-label="toggle email" style={{
              width: 46, height: 26, borderRadius: 14, border: "none", cursor: "pointer",
              background: emailOn ? "#4ECBA8" : "rgba(107,122,141,0.25)", position: "relative", transition: "background .2s",
              fontFamily: "inherit", padding: 0, flexShrink: 0,
            }}>
              <span style={{ position: "absolute", top: 3, left: emailOn ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left .2s" }} />
            </button>
          </div>
          {emailOn && (
            <input
              type="email"
              value={email}
              onChange={(e) => saveEmail(e.target.value)}
              placeholder={uk ? "you@email.com" : "you@email.com"}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 12, fontSize: 14, fontFamily: "inherit",
                border: "1.5px solid rgba(107,122,141,0.18)", background: "rgba(255,255,255,0.7)",
                color: "#1A2433", outline: "none",
              }}
            />
          )}
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
    <ReportScreen profile={profile} lang={lang} onDone={() => setScreen("dashboard")} onChat={() => setScreen("chat")} />
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
