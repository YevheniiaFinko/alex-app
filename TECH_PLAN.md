# Alex — Технічний план реалізації
*Оновлено: квітень 2026 | + Аналіз конкурентів*

---

## СТАТУС СЕСІЙ

| Сесія | Задача | Статус |
|-------|--------|--------|
| Дизайн | Redesign UI — glassmorphism, кольори, фото | ✅ ЗРОБЛЕНО |
| 1 | localStorage — дані не зникають | ✅ ЗРОБЛЕНО |
| 2 | Health Hub екран | ⚠️ КОД Є, не підключено |
| 3 | Claude API (Netlify Functions) | ⏳ НЕ ЗРОБЛЕНО |
| 4 | Спрощений onboarding | ⏳ НЕ ЗРОБЛЕНО |
| 5 | Stripe paywall | ⏳ НЕ ЗРОБЛЕНО |
| — | Деплой на Netlify | ⏳ НЕ ЗРОБЛЕНО |
| **NEW-A** | **Emoji симптоми у check-in** | ⏳ НЕ ЗРОБЛЕНО |
| **NEW-B** | **Гормональний графік на Insight екрані** | ⏳ НЕ ЗРОБЛЕНО |
| **NEW-C** | **Персональний paywall (фото Джейн + текст)** | ⏳ НЕ ЗРОБЛЕНО |
| **NEW-D** | **Щоденні actionable дії (не просто insight)** | ⏳ НЕ ЗРОБЛЕНО |
| **NEW-E** | **Playbook — освітні картки** | ⏳ НЕ ЗРОБЛЕНО |
| **NEW-F** | **Weekly patterns heatmap** | ⏳ НЕ ЗРОБЛЕНО |
| **NEW-G** | **Shopping list за фазою** | ⏳ НЕ ЗРОБЛЕНО |

---

## Що вже відомо про код

**Головний файл:** `/AI_WELLNESS/Alex/vive-app.jsx` — 1446+ рядків
**Точка входу:** `export default function AlexApp()` — рядок 1446
**Білд:** Vite + React, запускається через `npx vite` у папці Alex

**Поточні екрани (змінна `screen`):**
- `"welcome"` → Welcome
- `"onboarding"` → Onboarding (4 кроки)
- `"checkin"` → CheckIn (9 метрик)
- `"insight"` → Insight
- `"dashboard"` → Dashboard

**Поточний стан (useState у AlexApp):**
```js
screen, setScreen
profile, setProfile       // { name, birthYear, cycleDay, cycleLength, ... }
history, setHistory       // масив check-in записів
lastCheckIn, setLastCheckIn
lang, setLang             // "en" | "uk"
```

**Дизайн токени (об'єкт C):**
```js
bg: "#E4E7E1", bgSage: "#89A68F", dark: "#1C221C",
teal: "#4A6452", lime: "#C0F988",
glass: "rgba(255,255,255,0.50)", glassDk: "rgba(20,28,18,0.65)"
```

**Готові компоненти:** `DarkCard`, `GlassCard`, `DarkGlassCard`, `SageCard`, `Tag`, `Wrap`

---

## СЕСІЯ 1 — localStorage ✅ ЗРОБЛЕНО

---

## СЕСІЯ 2 — Health Hub екран (~25% токенів)

**Мета:** окремий розділ в профілі з аналізами / гаджетами / БАДами

**Новий файл:** `/AI_WELLNESS/Alex/HealthHub.jsx`

**Структура компонента:**
```jsx
export default function HealthHub({ profile, lang, onBack }) {
  // 3 таби: "labs" | "gadgets" | "supplements"
  // Контент генерується Claude API один раз і кешується:
  // localStorage.getItem("vive_healthhub") — якщо є, показуємо
  // якщо нема — викликаємо /api/healthhub і зберігаємо
}
```

**API запит до Claude:**
```js
// POST /api/healthhub
// Body: { age, cyclePhase, goals, symptoms, contraception }
// Response: { labs: [...], gadgets: [...], supplements: { tier1, tier2 } }
```

---

## СЕСІЯ 3 — Claude API (~30% токенів)

**Мета:** реальний AI для Insights і Health Hub

**Файл:** `/AI_WELLNESS/Alex/netlify/functions/insights.js`

```js
const Anthropic = require("@anthropic-ai/sdk")
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

exports.handler = async (event) => {
  const { phase, age, checkIn, goal, lang } = JSON.parse(event.body)

  const prompt = `You are Alex, an AI longevity coach for women 35+.

User profile:
- Age: ${age}
- Current cycle phase: ${phase}
- Goal: ${goal}
- Today's check-in: energy ${checkIn.energy}/10, sleep ${checkIn.sleep}/10, 
  stress ${checkIn.stress}/10, mood ${checkIn.mood}, water ${checkIn.water} glasses
- Symptoms today: ${checkIn.symptoms.join(", ") || "none"}
- Quick adds: sunlight ${checkIn.sunlight}, alcohol ${checkIn.alcohol}, late caffeine ${checkIn.lateCaffeine}

Respond in ${lang === "uk" ? "Ukrainian" : "English"} with valid JSON only:
{
  "state_explanation": "2-3 sentences WHY she feels this way — hormonal logic. Warm, empowering tone.",
  "movement": "Specific movement recommendation for today",
  "nutrition": "Specific nutrition recommendation for today",
  "focus": "Specific focus/mental recommendation for today",
  "actions": ["Action 1 for today", "Action 2 for today", "Action 3 for today"]
}`

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }]
  })

  const data = JSON.parse(response.content[0].text)
  return { statusCode: 200, body: JSON.stringify(data) }
}
```

**Змінна середовища:** `ANTHROPIC_API_KEY` — в Netlify dashboard

---

## СЕСІЯ 4 — Спрощений onboarding + нові питання (~15% токенів)

**Мета:** 2 кроки замість 4 + нові питання з конкурентного аналізу

**Крок 1 — Базова інфо:**
- Ім'я
- Рік народження
- День циклу / "цикл нерегулярний" / "менопауза"

**Крок 2 — Контекст:**
- Ціль (вибір з варіантів)
- Contraception (так/ні)
- **НОВЕ:** "Що найбільше заважало розібратись з симптомами?"
  - "Лікар не брав серйозно"
  - "Занадто багато суперечливої інформації"  
  - "Просто почувалась погано — не знала що саме"
  - "Пробувала додатки — вони не для мого віку"

Відповідь зберігається в `profile.painPoint` і передається в AI prompt для персоналізації тону.

---

## СЕСІЯ 5 — Stripe paywall (~10% токенів)

**Мета:** 7 днів безкоштовно → paywall → $19/міс або $29 one-time

**Канон ціни:** з `PRODUCT_STRATEGY.md` — два варіанти:
- **$19/міс** — повна підписка (Daily check-in, AI insights, протоколи)
- **$29 one-time** — Full Report без ongoing features (для тих хто не хоче підписку)

**ВАЖЛИВО (з аналізу конкурентів — Atta):**
Paywall повинен містити фото засновниці (Джейн) + особисте повідомлення.
Це трансформує conversion — людина купує у людини, не у продукту.

**Структура paywall екрану:**
```jsx
// Верхня частина — фото Джейн + текст від першої особи:
// "Привіт, я Джейн. Я будую Alex тому що..."
// "Перший тиждень — від мене, безкоштовно."
// "Якщо не полюбиш — скасуй. Жодних питань."

// Нижня частина:
// [Subscription — $19/міс]  [One-time Report — $29]
// "Нагадаю за 2 дні до кінця пробного"
// CTA: "Почати безкоштовно →"
```

**Другий paywall (якщо закривають):**
```jsx
// "Ти впевнена?"
// Список що втрачають без підписки:
// ✗ Персоналізований AI-протокол
// ✗ Щоденний гормональний контекст
// ✗ Аналіз патернів симптомів
// ✗ Доступ до нових функцій
```

**Логіка лічильника:**
```js
const firstUse = localStorage.getItem("vive_first_use")
const isPro = localStorage.getItem("vive_is_pro") === "true"
const trialExpired = Date.now() - firstUse > 7 * 24 * 60 * 60 * 1000
if (trialExpired && !isPro) → showPaywall()
```

---

## NEW-A — Emoji симптоми у check-in

**Пріоритет:** ВИСОКИЙ (легко зробити, великий impact на UX)
**Де змінювати:** компонент `CheckIn` у `vive-app.jsx`

**Поточно:** слайдери і checkbox-список симптомів
**Стає:** emoji-кнопки для швидкого вибору симптомів

```jsx
const SYMPTOMS = [
  { id: "fatigue",     emoji: "😴", label: { en: "Fatigue",      uk: "Втома" } },
  { id: "hotflash",    emoji: "🔥", label: { en: "Hot flash",    uk: "Приплив" } },
  { id: "brainfog",    emoji: "🌫️", label: { en: "Brain fog",    uk: "Туман" } },
  { id: "anxiety",     emoji: "😰", label: { en: "Anxiety",      uk: "Тривога" } },
  { id: "joint_pain",  emoji: "🦴", label: { en: "Joint pain",   uk: "Суглоби" } },
  { id: "bloating",    emoji: "🎈", label: { en: "Bloating",     uk: "Здуття" } },
  { id: "headache",    emoji: "🤕", label: { en: "Headache",     uk: "Головний біль" } },
  { id: "mood",        emoji: "🌊", label: { en: "Mood swings",  uk: "Перепади настрою" } },
  { id: "insomnia",    emoji: "🌙", label: { en: "Poor sleep",   uk: "Безсоння" } },
  { id: "palpitation", emoji: "💓", label: { en: "Palpitations", uk: "Серцебиття" } },
]

// UI: сітка 5×2, кнопки з emoji + підписом
// Обрані — підсвічуються (sage або lime border)
// Завжди є "+ Інше" в кінці
```

**Quick adds (3 питання після основного check-in):**
```jsx
const QUICK_ADDS = [
  { id: "sunlight",    emoji: "☀️", label: { en: "Sunlight today?",     uk: "Сонце сьогодні?" } },
  { id: "alcohol",     emoji: "🍷", label: { en: "Alcohol today?",      uk: "Алкоголь?" } },
  { id: "lateCaffeine",emoji: "☕", label: { en: "Caffeine after 2pm?", uk: "Кофеїн після 14:00?" } },
]
// Так / Ні кнопки, необов'язково, можна пропустити
```

---

## NEW-B — Гормональний графік на Insight екрані

**Пріоритет:** ВИСОКИЙ (killer feature для освіти і retention)
**Де:** компонент `Insight` у `vive-app.jsx`, ПЕРЕД або ПІСЛЯ state_explanation

**Що показує:**
- SVG або простий canvas графік
- 3 лінії: Естроген (червона), Прогестерон (синя), Тестостерон (сіра)
- Вісь X = дні циклу (1-28/30/нерегулярно)
- Поточний день — вертикальна лінія "Ти тут ↓"
- Для перименопаузи — лінії флуктуюють (показати нестабільність)

```jsx
// Компонент HormoneChart({ cycleDay, cycleLength, isPerimeno })
// Проста SVG реалізація — не потребує бібліотек

// Дані для нормального циклу (спрощені):
const ESTROGEN  = [low, rising, peak(ovulation), drop, low] 
const PROGESTER = [low, low, low, peak(luteal), drop]

// Для перименопаузи — ті ж дані але з рандомним noise ±20%
// (щоб показати нестабільність)

// Підпис під графіком:
// "Ти у фоллікулярній фазі — естроген росте, 
//  мозок і тіло заряджаються. Наступні 5 днів — твій пік."
```

---

## NEW-C — Персональний paywall (фото Джейн)

**Пріоритет:** ВИСОКИЙ (найбільший impact на conversion при мінімум коду)
**Де:** новий екран `"paywall"` у `vive-app.jsx`

**Що потрібно:**
- Фото Джейн → `/public/jane.jpg`
- Текст від першої особи (написати окремо)
- Структура: фото + текст → плани → CTA → "Чи впевнена?" flow

**Приклад тексту (адаптувати):**
```
"Привіт, я Джейн.

Я будую Alex тому що коли мені було 42, 
я провела місяці намагаючись зрозуміти що відбувається 
з моїм тілом — і ніхто не міг дати відповідь.

Alex — це те що я хотіла мати тоді.

Перший тиждень від мене, безкоштовно.
Якщо не відчуєш різниці — просто скасуй.
Жодних питань.

— Джейн"
```

---

## NEW-D — Actionable дії після insight

**Пріоритет:** СЕРЕДНІЙ (потребує Claude API — сесія 3)
**Де:** компонент `Insight`, після state_explanation і 3 карток

**Що додати:**
```jsx
// Новий блок "Твій план на сьогодні"
<DarkGlassCard>
  <div style={{ fontSize: 11, color: C.lime }}>📋 ТВІЙ ПЛАН НА СЬОГОДНІ</div>
  {insights.actions.map((action, i) => (
    <div key={i} style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <span style={{ color: C.lime }}>→</span>
      <span style={{ color: "#fff", fontSize: 14 }}>{action}</span>
    </div>
  ))}
</DarkGlassCard>

// Приклад дій від AI:
// → Сьогодні лютеїнова фаза — зменш інтенсивність тренування
// → Додай магній до вечері (горіхи, темний шоколад, шпинат)  
// → Заплануй важливі розмови на завтра — зараз не найкращий час
```

---

## NEW-E — Playbook (освітні картки)

**Пріоритет:** СЕРЕДНІЙ (Фаза 2, але контент можна писати вже зараз)
**Де:** новий екран `"playbook"` + кнопка в Dashboard

**Структура:**
```jsx
// Категорії:
// "Розумій своє тіло" — гормони, фази, симптоми
// "Longevity" — серце, кістки, мозок після менопаузи
// "Дій зараз" — БАДи, аналізи, розмова з лікарем

// Картка:
// { title, category, readTime, body (markdown), isLocked }
// Перші 3 картки — безкоштовно. Решта — за підпискою.
```

**Перші 5 статей (написати текст — не потребує коду):**
1. "Що естроген робив для твого серця — і що відбувається зараз"
2. "Чому ти не просто втомлена — це може бути феритин"
3. "Магній: чому це перше що варто спробувати"
4. "Як говорити з лікарем про перименопаузу (скрипт)"
5. "Туман у голові — це не ти. Це гормони. Ось чому."

---

## NEW-F — Weekly patterns heatmap

**Пріоритет:** НИЗЬКИЙ (Фаза 2, потребує 2+ тижнів даних)
**Де:** новий екран або розділ в Dashboard

**Що показує:**
```jsx
// Сітка: 7 рядків (Пн-Нд) × 3 стовпці (Ранок / День / Вечір)
// або спрощено: тижневий bar chart по 5 метриках
// Колір: зелений (добре) → жовтий → червоний (погано)

// AI знаходить патерн:
// "Твоя тривога найвища в четвер-п'ятницю — 
//  це відповідає пізній лютеїновій фазі твого поточного циклу."

// Показувати тільки якщо є 7+ днів даних
```

---

## NEW-G — Shopping list за фазою

**Пріоритет:** НИЗЬКИЙ (Фаза 2, потребує Claude API)
**Де:** окремий розділ або частина Planning екрану

**Що показує:**
```js
// POST /api/shopping-list
// Body: { phase, symptoms, dietaryNeeds }
// Response: { proteins: [...], vegetables: [...], supplements: [...] }

// Приклад для лютеїнової фази:
// Протеїн: лосось, яйця, нут
// Овочі: солодка картопля, шпинат, броколі  
// Ключові нутрієнти: магній, цинк, Omega-3
```

---

## Деплой (після всіх сесій)

```bash
npm install -g netlify-cli
netlify login
netlify dev          # локально з functions
netlify deploy --prod
```

**Змінні середовища в Netlify:**
- `ANTHROPIC_API_KEY`
- `VITE_STRIPE_LINK`

---

## Швидкі команди для початку кожної сесії

```bash
# Запустити додаток
cd /Users/janefinko/Desktop/Claud_Newyou/AI_WELLNESS/Alex && npx vite

# Запустити з Netlify functions (сесія 3+)
cd /Users/janefinko/Desktop/Claud_Newyou/AI_WELLNESS/Alex && netlify dev
```

---

## РЕКОМЕНДОВАНА ПОСЛІДОВНІСТЬ (оновлено квітень 2026)

### Зараз (без API — тільки UI):
1. **NEW-A** — Emoji симптоми (1-2 год, великий UX impact)
2. **NEW-C** — Персональний paywall (1 год, найбільший conversion impact)
3. **NEW-B** — Гормональний графік (2-3 год, killer feature)

### Наступний крок (з API):
4. **Сесія 3** — Claude API підключення
5. **NEW-D** — Actionable дії (додається в prompt)
6. **Сесія 4** — Онбординг з новим питанням про pain point
7. **Сесія 5** — Stripe

### Фаза 2 (після launch):
8. **NEW-E** — Playbook контент
9. **NEW-F** — Weekly heatmap
10. **NEW-G** — Shopping list
11. **Сесія 2** — Health Hub

---

*Цей файл — стартова точка для кожної нової сесії.*
*Читати ЗАМІСТЬ vive-app.jsx щоб заощадити токени.*
*Оновлено: квітень 2026 на основі аналізу 8 конкурентів (Atta, Harvee, Hea!, LongevityCompass, HOLO, Longevity Suite Milano, Longevity Path, та ін.)*
