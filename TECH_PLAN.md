# Alex — Технічний план
*AI Longevity Coach для жінок 35+ | Apple Glassmorphism + Multi-screen Flow*

*Останнє оновлення: 30 квітня 2026 (P1.3 Daily Symptom Log — done)*

---

## ПОТОЧНИЙ СТАН

**Live URL:** https://alex-ai-coach.vercel.app/
**GitHub:** https://github.com/YevheniiaFinko/alex-app
**Tech stack:** Vite + React 18 + Vercel
**Файл коду:** `alex-app.jsx` (2635 рядків)
**Примітка:** ключі `localStorage` досі мають префікс `vive_` (`vive_profile`, `vive_history`, `vive_lang`) — історичні, не змінюємо щоб не загубити дані ранніх юзерів.

---

## АРХІТЕКТУРА — 9 ЕКРАНІВ

| # | Screen | Функція | Стан | Рядок у коді |
|---|---|---|---|---|
| 1 | `welcome` | Hero + CTA "Почати Body Audit" + EN/UK toggle | ✅ Готово | 422 |
| 2 | `audit` | Body Audit — 7 кроків | ✅ Готово | 560 |
| 3 | `paywall` | Preview результату + 7 днів безкоштовно | ✅ UI готовий, Stripe ⏳ | 769 |
| 4 | `report` | Full Report з протоколом | ✅ Готово | 855 |
| 5 | `dashboard` | Greeting + cycle phase + streak + Ask Alex + tasks | ✅ Готово | 1021 |
| 6 | `chat` | AI Chat з Alex (QA pairs) | ✅ UI готовий, Claude API ⏳ | 1247 |
| 7 | `checkin` | 4 sliders + 1 yes/no | ✅ Готово | 1398 |
| 8 | `progress` | Календар циклу + статистика | ✅ Готово | 1492 |
| 9 | `profile` | Налаштування профілю + reset | ✅ Готово | 1631 |

---

## BODY AUDIT — 7 КРОКІВ

```
1. skin       → також збирає name + birthYear (якщо ще не зібрано)
2. hair       → симптоми волосся
3. body       → симптоми тіла
4. sleep      → sleepQuality + wakeNight
5. nutrition  → diet + proteinIntake
6. cycle      → lastPeriodDate + cycleLength + contraception
7. goal       → mainGoal
```

Прогрес: `ProgressDots` компонент. Навігація: BackBtn + Next.

---

## CHECK-IN МЕТРИКИ

```js
{
  energy: 1-10,    // CustomSlider, відображається як % (n × 10)
  sleep:  4-10,    // CustomSlider, відображається як години (n h)
  mood:   1-10,    // CustomSlider, з emoji 😔/😐/😊
  water:  1-10,    // CustomSlider, склянки (gl.)
  move:   true/false, // Chip yes/no
}
```

Зберігається в `localStorage` під ключем `vive_history` як масив записів. Streak рахується через `calcStreak()`.

---

## DASHBOARD — компоненти

1. **Greeting + cycle phase badge** — "Hey [Name]! Зараз [Phase]"
2. **Streak counter** — великий Duolingo-style ("7 днів поспіль")
3. **3 daily tasks** — `generateDailyTasks()` за фазою
4. **Ask Alex button** — перехід на chat
5. **Protocol section** — Beauty / Workout / Nutrition по фазі
6. **Bottom navigation** — Check-in / Alex / Progress / Profile

---

## КОЛЬОРОВА ПАЛІТРА (з коду)

```js
const C = {
  bg:          "#F5F9FF",   // фон
  blue:        "#4A9EDF",   // primary
  blueLight:   "#5BB8F5",
  mint:        "#4ECBA8",   // accent
  text:        "#1A2433",
  textSub:     "#6B7A8D",
  glass:       "rgba(255,255,255,0.78)",
  glassBorder: "rgba(255,255,255,0.92)",
}

phaseColors = {
  menstrual:  "#9B8FE8",
  follicular: "#4ECBA8",
  ovulation:  "#4A9EDF",
  luteal:     "#F59E3F",
}
```

Повний design system → `DESIGN.md`

---

## ЛОГІКА (helper functions)

| Функція | Рядок | Призначення |
|---|---|---|
| `lsGet/lsSet` | 16-23 | localStorage wrapper |
| `calcAge` | 25 | Вік з birthYear |
| `getPhase` | 27 | Cycle phase з day + cycleLength |
| `calcStreak` | 35 | Streak з history |
| `todayStr` | 54 | Поточна дата ISO |
| `calcCycleDay` | 56 | День циклу з lastPeriodDate |
| `getCalendarDays` | 66 | Календар на місяць з phases |
| `getRootCauses` | 151 | Аналіз профілю → 3-5 root causes |
| `generateBeautyRoutine` | 202 | Beauty routine за skin type + phase |
| `generateDailyTasks` | 248 | 3 щоденні задачі за фазою |
| `getDefaultProtocol` | 263 | Загальний протокол за замовчуванням |
| `getTimeTasks` | 294 | Задачі за фільтром часу (10 хв / 30 хв / 1 год) |

---

## ROOT CAUSES — 5 категорій

```js
CAUSE_DATA = {
  cortisol,      // стрес/cortisol
  estrogen,      // естроген drop
  protein,       // нестача білку
  pcos,          // PCOS
  inflammation,  // запалення
}
```

`getRootCauses(profile)` аналізує симптоми + цикл + спосіб життя → повертає top 3-5 причин.

---

## PWA (Progressive Web App)

✅ **Налаштовано:**
- `manifest.json` (icons 192/512, theme color)
- `apple-touch-icon.png`
- `apple-mobile-web-app-capable` мета-теги
- Theme color: `#4A9EDF`

Додаток встановлюється на iOS home screen як native app.

---

## VERCEL DEPLOYMENT

**Auto-deploy:** push to `main` → автоматичний деплой
**Domain:** alex-ai-coach.vercel.app
**Analytics:** ✅ enabled (Hobby plan, 50k events/міс)
**Speed Insights:** ✅ enabled
**Build command:** `npm run build`
**Build output:** `dist/`

---

## ⏳ ЩО ЗАЛИШИЛОСЬ ЗРОБИТИ

### 🔥 P0 — Biohacker Stack + W3 cleanup (затверджено 29.04.2026)

Деталі плану: `~/.claude/plans/users-janefinko-desktop-claud-newyou-ai-glimmering-bumblebee.md`

**P0.1 — Biohacker Stack Builder** ✅ (новий differentiator):
- Об'єкт `BIOHACKER_STACK` (sauna, strength, sleep, coldPlunge, redLight, creatine, fasting, hrtPrep) з evidence-rating + female caveats + how to start + cost. ✅
- Функція `generateBiohackerRecs(profile)` → топ-3-4 для конкретного профілю. ✅
- Нова секція "Your Biohacker Stack" в Report (після Hormone shifts). ✅
- Заміна `getDefaultProtocol` → sauna 3x + strength 2x + quarterly biomarkers (видаляємо cosmetologist + LED mask). ✅
- Переробка time-tabs з `10/30/60 хв` → `Morning / Movement / Evening`. ✅ (`getTabTasks` р.508, UI рр.2187-2204, default `dayTab="morning"`)

**P0.2 — Beauty Hormones Map** (W3 №1 зі стратегії 5.7) ✅:
- `HORMONES_MAP` — 4 гормони (estrogen / cortisol / progesterone / testosterone) × 4 прояви (skin / hair / body / brain) + протокол з 4 пунктів на гормон. ✅
- `HORMONE_PILLARS` — легенда колонок (Skin/Hair/Body/Brain). ✅
- Нова секція "YOUR BEAUTY HORMONES MAP" / "ТВОЯ КАРТА ГОРМОНІВ КРАСИ" в Report одразу після "Your Biohacker Stack". ✅
- Clickable рядки → expand з протоколом (state `hormoneOpen`). Кольоровий border-left на кожній картці (estrogen #9B8FE8, cortisol #F59E3F, progesterone #4A9EDF, testosterone #4ECBA8). ✅
- EN+UK для всіх текстів. ✅
- Disclaimer "не діагноз — освітня карта" внизу секції. ✅
- Базис: Частина 1 рр. 162-170.

**P0.3 — Skip These Products** (W3 №2) ✅:
- `SKIP_PRODUCTS` — каталог 13 продуктів-пасток (collagen drinks, LED mask alone, retinol+acid combo, biotin megadose, foam SLS cleanser, heavy oils, cardio-only-for-belly, daily ice baths in luteal, alcohol toners, greens powders, fragranced lotions, eye creams, detox teas) з полями `name / instead / why` (EN+UK) і trigger-keys. ✅
- `getSkipProducts(profile)` — scoring по symptom triggers (skin/hair/body) + `hormone_shift` + `luteal_high_stress`. Завжди-on пункти (`always`) додаються з нижчою вагою для baseline. Top 5-8. ✅
- Нова секція "SKIP THESE — NOT FOR YOUR PROFILE" / "ПРОПУСТИ ЦІ ПРОДУКТИ — НЕ ДЛЯ ТВОГО ПРОФІЛЮ" в Report одразу після Beauty Hormones Map. Border-left #F59E3F (cortisol orange), name з line-through, "Instead →" зеленим, why сірим. ✅
- EN+UK для всіх текстів. ✅
- Closing line "Економія тут = бюджет на сауну, силові і феритин-панель" — biohacker DNA. ✅
- Базис: Частина 1 р. 89.

**P0.4 — 30-day Milestone Notification** ✅ (W2 cleanup):
- `getMilestoneInsight` уже існує — додано notification mechanism. ✅
- PWA service worker `public/sw.js` (install/activate, `push` listener для майбутнього cloud-trigger, `message` listener для client-side показу через `showNotification`, `notificationclick` повертає в Alex). Реєструється в `main.jsx`. ✅
- Vercel serverless `api/notify.ts` шле HTML+text email через Resend (env: `RESEND_API_KEY`, `NOTIFY_FROM`, опц. `NOTIFY_REPLY_TO`). Валідує email + milestone (30/60/90), CORS-готовий. ✅
- Helper-функції в `alex-app.jsx`: `requestPushPermission`, `showLocalMilestoneNotification`, `sendMilestoneEmail`. ✅
- Trigger в `DashboardScreen` через `useEffect([milestoneStreak])`: коли `streak ∈ {30, 60, 90}` і `vive_milestone_<n>_sent !== true` — шлемо push (якщо `vive_notify_push`) і/або email (якщо `vive_notify_email_on` + `vive_notify_email`), маркуємо `_sent` flag. Existing `_seen` banner-flag не чіпаємо. ✅
- Профіль screen: нова секція "СПОВІЩЕННЯ" / "NOTIFICATIONS" — два toggle (push / email) + email input. iOS-підказка "додай на Home Screen для PWA push". EN+UK. ✅

**P0.5 — Cleanup існуючих фіч:** ✅
- "Body symptoms → low libido" → видалено, замінено на `morningEnergy / recovery / joints` (OPTIONS.body рр.1153-1161). ✅
- Check-in "water glasses" слайдер → `Recovery 1-10` (CHECKIN_METRICS р.80, slider р.2562, valKey="recovery"). ✅
- Перейменування "Beauty routine" → "ПРОТОКОЛ ДОВГОЛІТТЯ ШКІРИ / SKIN LONGEVITY PROTOCOL" (Report р.1880). ✅

---

### ✅ P0 ЗАКРИТО ПОВНІСТЮ (29.04.2026)

P0.1 + P0.2 + P0.3 + P0.4 + P0.5 — done. Build pass (272KB → 90KB gzip).

---

### 🔵 P1 — Atta-inspired UX (затверджено 29.04.2026 після аналізу Atta app)

Атта (cycle tracker) має сильніший logging UX і візуалізації — беремо найкорисніше і накладаємо на наш longevity-frame. Це швидкий шлях до того щоб Alex виглядав як зрілий продукт, а не MVP.

**P1.1 — Hormone Curves Chart** ✅ (highest impact):
- SVG-графік з кривими estrogen / progesterone / testosterone × cycle day (0-28). ✅
- Поточний день — вертикальна лінія + tooltip з рівнями (Естроген/Прогестерон/Тестостерон у %). ✅
- Розміщено в Progress screen новою секцією зверху (над legend + grid). ✅
- Дані: математичні криві (Gaussian-based, базис Cleveland Clinic 2026), не реальні лаби. ✅
- 1 короткий biohacker-narrative під кривими, залежно від фази (4 phase × EN+UK). ✅
- EN+UK + footnote "Reference curves — not lab values". ✅
- Phase tint bands (menstrual #9B8FE8 / ovulation #4A9EDF) як фон. ✅
- Кольори кривих: estrogen #9B8FE8, progesterone #4A9EDF, testosterone #4ECBA8. ✅
- Без "inner autumn" фреймів — biohacker tone. ✅
- Компонент `HormoneCurvesChart` (~р.2598 у `alex-app.jsx`).
- Базис: Atta IMG_6051.

**P1.2 — Cycle Disrupters в check-in** ✅ (30.04.2026):
- Нова секція в `CheckInScreen` — multi-select chips: Travel, Stress, Trauma, Late nights, Jet lag, Medication, Alcohol, Sickness. ✅
- Зберігати в `vive_history[i].disrupters` як array. ✅
- Враховувати в `getRootCauses(profile, history)` — last 7 check-ins, ≥2 повторів = pattern. jet_lag+late_nights → cortisol +1 (combo bonus поверх індивідуальних +1 кожен). stress/travel/trauma → cortisol +1. alcohol/sickness → inflammation +1. ✅
- `getMilestoneInsight` ("disrupters down") — TODO P1.3 разом із symptom log.
- EN+UK ✅ (DISRUPTERS const р.~1200, секція в CheckInScreen).
- Базис: Atta IMG_6045.

**P1.3 — Daily Symptom Log** ✅ (30.04.2026, inline в check-in):
- `SYMPTOMS_LOG` const (р.~1230) — 5 категорій × 10-11 chips: Mood (10), Sleep (10), Gut (10), Cravings (10), Body (11). Без fertility/sex/tests. EN+UK на всіх. ✅
- Нова секція "Today's symptoms / Симптоми сьогодні" в `CheckInScreen` (після disrupters) — категорії з uppercase-заголовками, multi-select chips через `toggle()`. ✅
- Custom text input "Other / Інше" → префіксується як `custom:<text>` і кладеться в той самий symptoms array. ✅
- Зберігається в `vive_history[i].symptoms` (array of ids). ✅
- НЕ скопійовано Atta "Sex & pleasure" і "Tests" — biohacker longevity frame, fertility не наш. ✅
- Monthly insights ("fatigue 12x, brain fog 8x") — TODO, окрема ітерація на Progress screen.
- Базис: Atta IMG_6041-6046.

**P1.4 — Edit Past Period (calendar picker)** ✅ (30.04.2026):
- В Progress screen header кнопка "✏️ Edit period / Редагувати" → bottom-sheet modal зі списком минулих дат + date picker для додавання + Remove на кожному записі. ✅
- Зберігається в `profile.vive_periods` (array, sorted desc — newest first). Helper `getPeriods(profile)` мерджить + sort, `getLatestPeriodDate(profile)` повертає найсвіжішу. ✅
- `calcCycleDay` бере найсвіжіший запис з масиву через `getLatestPeriodDate`. `getCalendarDays` приймає date string (як раніше) — caller передає `latestDate`. ✅
- Backwards compat: якщо `vive_periods` порожній, fallback на `profile.lastPeriodDate`. При збереженні масиву `lastPeriodDate` теж оновлюється на newest для legacy кода. Audit `next()` синкає введену дату в обидва поля. ✅
- EN+UK ✅. Дозволяє точніший phase prediction для жінок з нерегулярним циклом.
- Базис: Atta IMG_6047.

**P1.5 — Pain & Energy Charts** ✅ (30.04.2026):
- Два SVG-графіки в Progress screen під календарем циклу. Без сторонніх бібліотек. ✅
- `PainChart`: bar chart за 30 днів — кожен стовпчик = кількість pain-симптомів у check-in (gut_cramps, gut_pain, body_headache, body_back_pain, body_joint_ache, body_breast_tender, body_muscle_sore). Колір = фаза циклу для того дня (через `getPhaseForDate`). Менструальні дні — насичено, інші — opacity 0.6. Empty-state коли немає записів. ✅
- `EnergyByPhaseChart`: 4 стовпчики (menstr/follic/ovul/luteal) — середнє значення `energy` слайдера (1–10) у check-in, згруповане за фазою циклу. Показує `n=` записів на фазу + значення у %. ✅
- Helpers: `getPhaseForDate(profile, dateStr)`, `calcPainSeries(history, profile, days)`, `calcEnergyByPhase(history, profile)`, `PAIN_SYMPTOM_IDS`. ✅
- EN+UK ✅.
- Базис: Atta IMG_6053-6055.

**P1.6 — Personal Info блок у Profile** ✅ (01.05.2026):
- `PERSONAL_INFO_OPTIONS` — 3 групи: dietary (7 chips: none/vegan/veg/keto/paleo/gluten-free/dairy-free), activity (sedentary/moderate/active/very_active), limitations (9 multi-select chips: heart/knee/back/joint/diabetes/thyroid/raynauds/pregnant/breastfeeding) + 2 free-text поля (allergies, dislikes). EN+UK ✅.
- Зберігається в `profile.personalInfo` через новий `setProfile` prop у ProfileScreen. Collapsible card з summary-рядком + Save button з "✓ Збережено" feedback. ✅
- `getPersonalInfoAdjustments(profile)` — повертає `{exclude, boost}`: heart/raynauds/pregnant → exclude sauna+coldPlunge; pregnant/breastfeeding/diabetes/thyroid → exclude fasting; knee/joint/back → -1 strength; sedentary → +1 strength; very_active → +1 sleep; vegan/vegetarian → +1 creatine. ✅
- `generateBiohackerRecs` застосовує `boost` (delta до score) і `exclude` (-999 → відсіюється). ✅
- Skip Products integration — наразі не критична (SKIP_PRODUCTS не містить food/allergen-based items). Залишено на майбутнє якщо з'являться продукти-кандидати.
- Базис: Atta IMG_6058.

**P1.7 — Phase change + Period prediction notifications** ✅ (01.05.2026):
- Helpers у `alex-app.jsx`: `showLocalPush` (generic push через `registration.showNotification`), `predictNextPeriodDate(profile)` (latest period + cycleLength), `daysBetween(a,b)`. ✅
- `PHASE_NOTIF_COPY` — 4 фази × EN+UK з biohacker-tone (e.g. "🍂 Лютеальна фаза — Магній 300мг + менш інтенсивні тренування + раніше спати"). Без inner-autumn fluff. ✅
- DashboardScreen: 2 нові useEffect:
  - Phase change: спрацьовує коли `phaseKey !== lsGet("vive_last_phase_notified")`. Маркує flag після відправки.
  - Period prediction: при кожному вході в dashboard, якщо `daysUntil ∈ [0,2]` і `vive_period_predicted_<date>_sent !== true` — шле push з конкретним числом днів. ✅
- Profile screen: 2 нові toggles "Зміна фази циклу" / "Прогноз менструації" нижче milestone Email-toggle, у тій же Notifications card. Disabled якщо master push-toggle off (з пояснювальним рядком). ✅
- `public/sw.js` — bump до v2, додано generic `SHOW_NOTIFICATION` message handler (поруч з legacy `SHOW_MILESTONE`). ✅
- `api/notify.ts` — додано `type` поле + 2 нові гілки в `buildHtml` (phase_change, period_prediction) з shared `wrapEmail` helper. Validation per-type. Ready для cloud-trigger у майбутньому, поки клієнт використовує лише local push. ✅
- EN+UK для всіх повідомлень ✅. Build 305KB → 100.90KB gzip.
- Базис: Atta IMG_6059.

**Що НЕ беремо з Atta (НЕ наш бренд):**
- "Mantra for today" — wellness-fluff
- "Inner autumn/spring" framing — поетично, не biohacker
- Pregnancy/Ovulation tests — fertility focus
- Sex & pleasure категорія — занадто інтимне для 35+ longevity
- €8.99/міс pricing — наше $19 правильне
- Бежевий design — наша glassmorphism краща

---

### 🟢 P2 — Claude API чат + Skin Longevity tooltips (після P1)

#### P2.1 Claude API integration (Chat → real AI)
**Зараз:** Chat працює на `QA_PAIRS` — статичний словник питання-відповідь.
**Потрібно:** підключити Claude API через Vercel API Routes.

```
File: api/chat.ts (новий)
- Endpoint: POST /api/chat
- Отримати profile + cycle phase + message history + biohacker stack + symptom log (P1.3)
- Викликати Claude (sonnet-4-6) з system prompt про Alex
  System prompt: "Ти Алекс — longevity-тренерка для жінок 35+.
                  Стиль — наукова подружка-біохакер. Жодних діагнозів."
- Prompt caching: профіль + останні 30 check-ins + biohacker stack у cached prefix
  → економія 90% токенів на recurring requests.
- Streaming response (SSE).
- Fallback на QA_PAIRS якщо API падає.
- ENV: ANTHROPIC_API_KEY (Vercel secret).
```

#### P2.2 Skin Longevity tooltips
- Кожен крок Skin Longevity Protocol отримує "Why" tooltip
  ("ретинол → +колаген, який падає 1.5%/рік після 35").
- Tap-to-show на mobile, hover на desktop.

### Інше (старе — приберу/оновлю після P1+P2)

#### 2. Stripe payment (paywall → real payments)
**Зараз:** Paywall — UI mockup, "Continue Free" просто пропускає на report.
**Потрібно:** Stripe Checkout integration.

```
- Stripe Customer + Subscription
- $19/міс або $29 one-time (canonical з PRODUCT_STRATEGY.md)
- Webhook для активації accessу
- localStorage flag "alex_pro" або серверна перевірка
```

#### 3. Onboarding pain point question (з конкурентного аналізу)
Додати в Body Audit крок 7 ще одне питання:
> "Що найбільше заважало розібратись з симптомами?"
> - Лікар не брав серйозно
> - Занадто багато суперечливої інформації
> - Просто почувалась погано — не знала що саме
> - Пробувала додатки — вони не для мого віку

Зберегти в `profile.painPoint` і використати в AI prompt для tone-personalization.

### Середній пріоритет

#### 4. Health Hub — нова функція
Окремий розділ в profile з:
- Аналізами (які здати, як готуватись)
- Гаджетами (рекомендації Oura/Whoop за профілем)
- БАДами (персоналізовані за симптомами)

Контент генерується через Claude один раз і кешується в localStorage.

#### 5. Photo tracker (skin)
Before/after фото шкіри з timeline.

### Низький пріоритет (V2)

#### 6. Weekly patterns heatmap
7×3 grid (день тижня × ранок/день/вечір) з кольорами по метриках.

#### 7. Shopping list generator
За фазою циклу + симптомами генерує список продуктів.

#### 8. Lab result upload
PDF аналізів → AI інтерпретація → інтеграція в insights.

---

## 🚀 FEMTECH ADAPTATION — WEEK 1 + WEEK 2 (затверджено 28.04.2026)

**Кут позиціонування:** AI Longevity Coach for women 35+
**Whitespace:** longevity для жінок (новий сегмент 2026), не conflict з Midi (clinical+US-only) / Balance (UK-only) / Caria/Stella (menopause-only)
**Не йдемо в:** HRT/prescription, wearable integration, зміна pricing
**Чат з Alex (screen 6) — зберігаємо без UX-shift, тільки + preset suggestions**

---

### 🗓️ WEEK 1 — Позиціонування + Perimenopause-блок (м'яка подача)

#### W1-1. Welcome screen (`alex-app.jsx:422`)

Замінити hero-копірайт на:

**EN:** "Your AI longevity coach for women 35+. 5 symptoms, 1 root cause."
**UK:** "Твій AI longevity-тренер. 5 симптомів — 1 причина."
*(альтернативний UK варіант з користувача: "Твій AI longevity-тренер без — 5 симптомів, 1 причина." — обрати при імплементації, який ритм краще лягає)*

EN/UK toggle вже працює через `vive_lang`. Зберігаємо.

#### W1-2. Body Audit — Perimenopause через валідовану шкалу

**Файл:** `alex-app.jsx:560` (audit screen, в блоці cycle, крок 6)

**Доказова основа (вибрати одну):**
- **Peri-SS (Perimenopause Symptom Scale, 2025)** — medRxiv, валідовано спеціально для digital self-assessment 35–59 років → першочерговий вибір
- **MRS (Menopause Rating Scale)** — public domain, 11 симптомів, 10+ мов → fallback
- ~~STRAW+10~~ — не використовуємо, потребує lab markers (FSH/AMH)

**UI — 2-крокове opt-in (не лякаюче, не само-діагноз):**

Step A (фрейм без слова "menopause"):
- EN: "Have you noticed shifts vs 5 years ago?"
- UK: "Чи помічаєш зміни порівняно з тим що було 5 років тому?"
- Options: Yes / Not really / Haven't thought about it

Якщо **Yes** → Step B з 8 питаннями по шкалі 0–3 (none / mild / moderate / severe), м'яко сформульовано:
1. Sleep quality changes / Зміни в якості сну
2. Brain fog or concentration / Мозковий туман, концентрація
3. Mood swings or anxiety / Перепади настрою або тривога
4. Energy through the day / Енергія протягом дня
5. Cycle regularity / Регулярність циклу
6. Skin or hair changes / Зміни шкіри або волосся
7. Joint or muscle aches / Болі в суглобах/м'язах
8. Hot flushes or night sweats / Припливи або нічна пітливість

**Trigger логіка (зберігати в `profile.hormoneShiftScore`):**
```js
const hormoneShiftScore = sumOf8Answers; // 0-24
const age = calcAge(profile.birthYear);
const hormoneShiftDetected = hormoneShiftScore >= 8 && age >= 35 && age <= 55;
```

Якщо `hormoneShiftDetected === true`, додавати в `getRootCauses` (`alex-app.jsx:151`) новий root cause:
```js
hormone_shift: {
  // ВАЖЛИВО: ключ "hormone_shift" не "perimenopause" — wellness-frame
  emoji: "🌸",
  title_en: "Estrogen fluctuation pattern",
  title_uk: "Патерн коливання естрогену",
  // ... explainer без слова "menopause" як перший фрейм
}
```

Додати поряд з існуючими 5 в `CAUSE_DATA` (line ~125-150 area).

#### W1-3. Report screen — секція "Hormone shifts" (м'яка освіта)

**Файл:** `alex-app.jsx:855`

Показуємо нову секцію ТІЛЬКИ якщо `hormoneShiftDetected === true`.

**Заголовок секції:**
- EN: "Hormone shifts you're noticing"
- UK: "Гормональні зміни які ти помічаєш"

**3 блоки в секції (не лякати, дати освіту):**

**Block 1 — What's happening:**
- UK: "Твоє тіло поступово змінює гормональний баланс — це називається перименопауза. Це нормальна фаза, яка може початись у 35–45 років і триває кілька років. **Не діагноз. Не пов'язано з тим, чи ти народжувала.**"
- EN: "Your body is gradually shifting its hormone balance — this is called perimenopause. It's a normal phase that can start at 35–45 and last several years. **Not a diagnosis. Not connected to whether you've had children.**"

**Block 2 — Why it matters now:**
- UK: "Розуміння цих змін — твоя перевага. Більшість жінок чекає 2.6 роки, щоб лікар це назвав. Ти бачиш це раніше і можеш діяти."
- EN: "Understanding these shifts is your edge. Most women wait 2.6 years for a doctor to name this. You're seeing it earlier and can act."

**Block 3 — What you can do:**
- 3 конкретні дії з протоколу (`getRootCauses` визначає які)
- Кнопка "Запитай Алекс" / "Ask Alex" → веде на screen 6 (`chat`)

**Tagline для всього звіту (підсилити):**
- EN: "These aren't 4 different problems. They're one story."
- UK: "Це не 4 різні проблеми. Це одна історія."

**Дисклеймер обов'язково (внизу секції, малий шрифт):**
- UK: "Alex — wellness-coach, не медицина. Якщо симптоми сильні — поговори з лікарем. Шкала на основі MRS / Peri-SS, інтерпретуємо як wellness-сигнал, не діагноз."
- EN: "Alex is a wellness coach, not medicine. If symptoms are severe — talk to your doctor. Scale based on validated MRS / Peri-SS, interpreted as a wellness signal, not a diagnosis."

#### W1-4. SEO meta (`Alex/index.html`)

```html
<title>Alex — AI Longevity Coach for Women 35+</title>
<meta name="description" content="AI longevity coach for women 35+. 5 symptoms, 1 root cause. Skin, hair, hormones, energy — connected. No doctor, no $300/month.">
<meta property="og:title" content="Alex — AI Longevity Coach for Women 35+">
<meta property="og:description" content="...same...">
```

Keywords: AI longevity coach, perimenopause AI app, root cause health women 35+

---

### 🗓️ WEEK 2 — Longevity Markers + Cycle-фазові рекомендації (по 4 категоріях)

#### W2-1. Dashboard — Longevity Markers (`alex-app.jsx:1021`)

Нова секція в dashboard. 4 простих метрики на основі check-in (`vive_history` записи):
- **Sleep quality** — average з останніх 7 sleep slider records
- **Protein hits** — кількість days де proteinHit === true (нове yes/no в check-in, додати в W2-2)
- **Strength sessions** — кількість days де strengthDone === true (нове yes/no, додати в W2-2)
- **Stress days** — кількість days де mood < 5

Weekly trend mini-graph: переюзати компонент-графік з `progress` screen (`alex-app.jsx:1492`).

Нова функція `calcLongevityScore(history)` поряд з `calcStreak` (line 35):
```js
function calcLongevityScore(history) {
  const last7 = history.slice(-7);
  const sleepAvg = avg(last7.map(h => h.sleep));
  const proteinHits = last7.filter(h => h.proteinHit).length;
  const strengthCount = last7.filter(h => h.strengthDone).length;
  const stressDays = last7.filter(h => h.mood < 5).length;
  // weighted score 0-100
  return Math.round((sleepAvg * 10 + proteinHits * 8 + strengthCount * 12 + (7 - stressDays) * 6) / 4);
}
```

#### W2-2. Check-in — нові yes/no питання (`alex-app.jsx:1398`)

Додати 2 chips після поточного `move` chip:
- "Got 25g+ protein at breakfast?" → `proteinHit: true/false`
- "Did strength training today?" → `strengthDone: true/false`

Зберігати в `vive_history` запис.

#### W2-3. 30-day milestone notification

В dashboard, якщо `streak === 30 || streak === 60 || streak === 90`:
- Показати banner: "🌟 30 days! Your body is responding to: [top 3 metrics що покращились]"
- Логіка: порівняти середні метрики останніх 30 днів vs перших 30 днів. Top 3 з найбільшим improvement.
- Один раз показати, потім dismiss-flag в localStorage `vive_milestone_30_seen`.

#### W2-4. Cycle-phase protocols (4×4 матриця) — **ГОЛОВНА W2 ФІЧА**

**Файл:** `alex-app.jsx`, біля `CAUSE_DATA` (line ~125-200) додати новий об'єкт `CYCLE_PHASE_PROTOCOLS`.

**Source basis:** Cleveland Clinic 2026, Geisinger 2026, KHNI, narrative review PMC10251302.
**Caveat:** cycle syncing has limited RCT evidence. Frame як wellness exploration, не медичні рекомендації.

```js
const CYCLE_PHASE_PROTOCOLS = {
  menstrual: { // ~5 days
    nutrition: {
      en: ["Iron-rich foods (leafy greens, red meat, beans)", "Vitamin C (citrus, berries) for absorption", "Warm cooked meals over raw"],
      uk: ["Залізо (листова зелень, червоне м'ясо, боби)", "Вітамін C (цитрус, ягоди) для засвоєння", "Теплі готові страви, не сирі"]
    },
    movement: {
      en: ["Walking 20-30 min", "Gentle yoga / stretching", "Skip HIIT this week"],
      uk: ["Прогулянки 20-30 хв", "М'яка йога / розтяжка", "Пропусти HIIT цього тижня"]
    },
    rest: {
      en: ["Aim for 8h sleep", "Warm bath in evening", "Magnesium before bed"],
      uk: ["Цілься у 8г сну", "Теплі ванни ввечері", "Магній перед сном"]
    },
    beauty: {
      en: ["Gentle hydrating serums", "Avoid acids and retinol", "Lip + eye masks"],
      uk: ["М'які зволожуючі сироватки", "Уникай кислот і ретинолу", "Маски для губ + очей"]
    }
  },
  follicular: { // ~7-10 days
    nutrition: {
      en: ["Lean protein (chicken, tofu, fish)", "Healthy fats (avocado, seeds, olive oil)", "Complex carbs (quinoa, brown rice)"],
      uk: ["Чистий білок (курка, тофу, риба)", "Здорові жири (авокадо, насіння, олія оливкова)", "Складні вуглеводи (кіноа, бурий рис)"]
    },
    movement: {
      en: ["Low-mid cardio (jogging, biking, hiking)", "Try a new workout — energy is rising", "30-45 min sessions"],
      uk: ["Кардіо середньої інтенсивності (біг, велосипед, хайкінг)", "Спробуй щось нове — енергія росте", "30-45 хв сесії"]
    },
    rest: {
      en: ["7-8h sleep", "Light stretching morning", "Time outdoors"],
      uk: ["7-8г сну", "Легка розтяжка зранку", "Час на природі"]
    },
    beauty: {
      en: ["Restart exfoliation (gentle BHA)", "Retinol can return", "Vitamin C serums"],
      uk: ["Повертай ексфоліацію (м'яка BHA)", "Ретинол може повертатись", "Сироватки з вітаміном C"]
    }
  },
  ovulation: { // ~3-4 days
    nutrition: {
      en: ["Nutrient-dense (eggs, lean protein, leafy greens)", "Fiber-rich foods", "Plenty of water"],
      uk: ["Поживні (яйця, чистий білок, зелень)", "Багато клітковини", "Багато води"]
    },
    movement: {
      en: ["Strength training (peak energy)", "HIIT sessions OK", "Sprints, kickboxing, spinning"],
      uk: ["Силові (пік енергії)", "HIIT сесії можна", "Спринти, кікбоксинг, спінінг"]
    },
    rest: {
      en: ["Standard sleep", "Active recovery on rest days", "Cold exposure if you do it"],
      uk: ["Стандартний сон", "Активне відновлення", "Холодне занурення, якщо практикуєш"]
    },
    beauty: {
      en: ["Sebum control (skin can be oilier)", "Active cleansing", "Sunscreen extra important"],
      uk: ["Контроль себуму (шкіра жирніша)", "Активне очищення", "Сонцезахист особливо важливий"]
    }
  },
  luteal: { // ~10-14 days
    nutrition: {
      en: ["Complex carbs (sweet potato, oats)", "Fiber + magnesium-rich foods", "Limit caffeine and alcohol second half"],
      uk: ["Складні вуглеводи (батат, овес)", "Клітковина + продукти з магнієм", "Менше кави й алкоголю в другій половині"]
    },
    movement: {
      en: ["Medium intensity, active recovery", "Yoga, pilates, walking", "Skip HIIT in second half"],
      uk: ["Середня інтенсивність, активне відновлення", "Йога, пілатес, прогулянки", "Пропусти HIIT в другій половині"]
    },
    rest: {
      en: ["More sleep in second half (8-9h)", "Earlier bedtime", "Wind-down routine"],
      uk: ["Більше сну в другій половині (8-9г)", "Раніше лягати", "Заспокійлива рутина перед сном"]
    },
    beauty: {
      en: ["Anti-inflammatory care", "Sensitivity-friendly products", "Avoid heavy actives last 3 days"],
      uk: ["Протизапальний догляд", "Продукти для чутливої шкіри", "Уникай сильних активів за 3 дні до циклу"]
    }
  }
}
```

**Інтеграція в `generateDailyTasks`** (line 248):
- Поточна функція повертає 3 задачі за фазою
- Розширити: брати phase + age + rootCauses + протоколи з `CYCLE_PHASE_PROTOCOLS[phase]`
- Повертати об'єкт по 4 категоріях: `{nutrition, movement, rest, beauty}` — кожна з 1-2 задачами на день
- Mix: 1 задача з phase-protocol + 1 з rootCause-protocol по кожній категорії

**Інтеграція в `generateBeautyRoutine`** (line 202):
- Додати phase-aware beauty step з `CYCLE_PHASE_PROTOCOLS[phase].beauty`
- Якщо `hormoneShiftDetected === true` — пріоритезувати anti-aging i hydration steps

**UI зміни в Dashboard (`alex-app.jsx:1021`):**
- Поточна "Protocol section" розширити: tabs/accordion по 4 категоріях
- Кожна tab показує phase-relevant tasks + rootCause-relevant tasks
- Зберегти візуальний style (`phaseColors[phase]`)

---

### 🗓️ WEEK 3 — Beauty + Hormones Map pillar + Chat preset suggestions

#### W3-1. "Your beauty hormones map" секція

**Файли:** `alex-app.jsx` — Report screen (line 855) і Dashboard (line 1021).

Нова окрема секція яка показує **як гормональний стан впливає на догляд**. Цього pillar немає у Midi / Balance / Caria → це твій унікальний Femtech-кут.

**Логіка:**
- Якщо `hormoneShiftDetected === true` → пріоритезувати anti-aging + hydration + colagen-supporting steps
- Якщо `hormoneShiftDetected === false` → standard phase-aware routine
- Завжди: phase-aware (з `CYCLE_PHASE_PROTOCOLS[phase].beauty`)

**UI блок (3 карточки horizontal scroll або grid):**

Card 1 — **Why your skin is changing**
- EN: "After 35, estrogen levels start fluctuating. This affects collagen synthesis (estrogen stimulates it by 76%), skin hydration, and barrier function. Your old routine isn't wrong — your skin's needs changed."
- UK: "Після 35 рівень естрогену починає коливатись. Це впливає на синтез колагену (естроген стимулює його на 76%), зволоженість і бар'єрну функцію шкіри. Твоя стара рутина не неправильна — змінились потреби шкіри."

Card 2 — **What to add (this phase)**
- 3 продукти/інгредієнти за поточною фазою циклу + з врахуванням `hormoneShiftDetected`
- Приклад для luteal + hormone shift: "Hyaluronic acid serum, peptide cream, vitamin C morning"

Card 3 — **Skip these (saving you money)**
- Список продуктів які марні для її профілю
- Інсайт з `PRODUCT_STRATEGY.md` Частина 1, рядок 89 (зруйнований шкірний бар'єр від TikTok-рутин)
- Приклад: "Skip: 10-step routines, retinol if barrier is reactive, collagen supplements (no clinical evidence — Am. Journal of Medicine 2025 meta-analysis)"

#### W3-2. Phase-aware `generateBeautyRoutine` — оновити функцію

**Файл:** `alex-app.jsx:202`

Поточна функція приймає `(skinType, phase)`. Розширити:
```js
function generateBeautyRoutine(skinType, phase, hormoneShiftDetected) {
  const phaseBeauty = CYCLE_PHASE_PROTOCOLS[phase].beauty;
  const baseSteps = getBaseSteps(skinType); // existing logic

  if (hormoneShiftDetected) {
    // Пріоритезувати: hydration, peptides, antioxidants, mineral SPF
    // De-prioritize: harsh exfoliants, alcohol-heavy toners
    return mergeRoutine(baseSteps, phaseBeauty, hormoneShiftMods);
  }

  return mergeRoutine(baseSteps, phaseBeauty);
}
```

`hormoneShiftMods` — об'єкт зі змінами для морнінг/евнінг рутини (додати як константу поряд з `CYCLE_PHASE_PROTOCOLS`).

#### W3-3. Chat preset suggestions (`alex-app.jsx:1247`)

**Не міняємо QA_PAIRS і Claude-API roadmap.** Додаємо тільки 3–5 chips над input field у chat screen.

Chips (multi-language):
- "Що таке перименопауза?" / "What is perimenopause?"
- "Кортизол і шкіра" / "Cortisol and my skin"
- "Білок без тренувань" / "Protein without working out"
- "Чому я погано сплю після 35" / "Why I sleep badly after 35"
- "Які БАДи дійсно працюють" / "Which supplements actually work"

Натискання chip → autofill input + auto-submit. Це знімає страх "що мене щось чекає погане" і дає wow-effect першого досвіду.

QA_PAIRS треба розширити відповідними entry для нових chip-quеries (5 нових Q+A пар у словнику, line ~300-450 area де QA_PAIRS).

#### W3-4. Final positioning sync

- `PRODUCT_STRATEGY.md` Частина 5 — вже синхронізовано (28.04.2026)
- Перевірити що `index.html` description відповідає Welcome копірайту
- Welcome screen → Body Audit → Paywall → Report → Dashboard візуальна consistency longevity-frame

---

### 🧪 ТЕСТУВАННЯ (Week 1+2+3)

1. **Vercel preview deploy** — push на гілку `femtech-w1` для preview URL
2. **Smoke test 3 сценарії в Body Audit:**
   - User 42 з symptom score ≥ 8 → перевірити що `hormone_shift` спрацьовує + secція в звіті
   - User 28 з тими самими симптомами → НЕ повинна тригерити (вік)
   - User 45 з score 4 → НЕ повинна тригерити (поріг)
3. **Cycle-phase smoke test:** для всіх 4 фаз перевірити що generateDailyTasks повертає коректні 4 категорії
4. **Beauty hormones map smoke test:** перевірити що 3 картки рендеряться з/без hormoneShiftDetected. У звіті + dashboard.
5. **Chat preset chips:** натиснути всі 5 chips → перевірити що QA_PAIRS повертає relevant відповідь
6. **EN/UK toggle:** усі нові тексти мають обидві мови (включно з W3 cards і chat chips)
7. **Mobile PWA:** перевірити на iOS Safari + Android Chrome
8. **Browser test golden path:** Welcome → Audit (з perimenopause Yes path) → Paywall → Report (з Hormone shifts + Beauty map секціями) → Dashboard (з 4 категоріями + Beauty map) → Check-in (з protein/strength chips) → Chat (з preset chips)

### 📁 ФАЙЛИ ЯКІ ЗМІНЮЄМО (W1+W2+W3)

| Файл | Що міняємо |
|---|---|
| `alex-app.jsx` | **W1:** Welcome (l.422), Audit cycle block (l.560), CAUSE_DATA + hormone_shift (~l.125-150), Report Hormone shifts (l.855). **W2:** Dashboard Longevity Markers + 4 categories (l.1021), Check-in нові chips (l.1398), нові функції calcLongevityScore + CYCLE_PHASE_PROTOCOLS, розширені generateDailyTasks. **W3:** Beauty Hormones Map cards у Report + Dashboard, оновлений generateBeautyRoutine з hormoneShiftMods, Chat preset chips (l.1247), нові QA_PAIRS entries |
| `index.html` | SEO meta + og tags (W1) |
| `PRODUCT_STRATEGY.md` | ✅ Вже синхронізовано 28.04.2026 (Частина 5 додана) |
| `TECH_PLAN.md` | (цей файл) — оновити "ПОТОЧНИЙ СТАН" після завершення W1+W2+W3 |

### 📊 SUCCESS METRICS (30 днів після релізу)

- Body Audit completion з perimenopause-блоком ≥ 70%
- Perimenopause-trigger у 30–50% юзерок 35+
- Paywall conversion ≥ 15%
- Hormone shifts секція не викликає drop-off (scroll-to-end метрика)
- Cycle-фазові рекомендації — 5+ positive feedback з customer interviews
- Beauty hormones map — engagement (карточка click-through) ≥ 40%
- Chat preset chips — used by ≥ 60% перших юзерок (зменшує "пустий чат" страх)

---

## ДОКУМЕНТ-ЗВ'ЯЗКИ

- Стратегія додатку → `PRODUCT_STRATEGY.md`
- Design system → `DESIGN.md`
- Дослідження ринку → `../RESEARCH/Women_Pain_Analysis.md`
- Стратегія Євгенії → `../PERSONAL_BRAND/STRATEGY.md`
- Femtech аналіз і план → `~/.claude/plans/users-janefinko-desktop-claud-newyou-ai-reflective-bentley.md`

---

## ШВИДКІ КОМАНДИ

```bash
# Запустити локально
cd AI_WELLNESS/Alex && npm run dev
# → http://localhost:5173

# Деплой (auto через git push)
git add . && git commit -m "..." && git push origin main
```

---

*Цей документ синхронізований з кодом `alex-app.jsx`. Замінити цей файл при кардинальних змінах архітектури.*
