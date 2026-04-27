# Alex — Технічний план
*AI Longevity Coach для жінок 35+ | Apple Glassmorphism + Multi-screen Flow*

*Останнє оновлення: 27 квітня 2026 (синхронізовано з vive-app.jsx)*

---

## ПОТОЧНИЙ СТАН

**Live URL:** https://alex-ai-coach.vercel.app/
**GitHub:** https://github.com/YevheniiaFinko/alex-app
**Tech stack:** Vite + React 18 + Vercel
**Файл коду:** `vive-app.jsx` (1785+ рядків) — назва файлу історична, всередині додаток "Alex"

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
  energy: 0-10,    // CustomSlider
  sleep:  0-10,    // CustomSlider
  mood:   0-10,    // CustomSlider
  water:  0-10,    // CustomSlider
  move:   yes/no,  // toggle
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

### Високий пріоритет

#### 1. Claude API integration (Chat → real AI)
**Зараз:** Chat працює на `QA_PAIRS` — статичний словник питання-відповідь.
**Потрібно:** підключити Claude API через Vercel API Routes.

```
File: api/chat.js (новий)
- Отримати profile + cycle phase + message history
- Викликати Claude з system prompt про Alex
- Повернути streamed response
```

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

## ДОКУМЕНТ-ЗВ'ЯЗКИ

- Стратегія додатку → `PRODUCT_STRATEGY.md`
- Design system → `DESIGN.md`
- Дослідження ринку → `../RESEARCH/Women_Pain_Analysis.md`
- Стратегія Євгенії → `../PERSONAL_BRAND/STRATEGY.md`

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

*Цей документ синхронізований з кодом `vive-app.jsx`. Замінити цей файл при кардинальних змінах архітектури.*
