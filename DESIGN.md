# Alex — Design System
*Apple Glassmorphism × Cycle-Aware Wellness*

*Останнє оновлення: 28 квітня 2026 (синхронізовано з alex-app.jsx)*

---

## 1. Концепція

**Apple Glassmorphism + Cycle-Aware Wellness.**

Тепла, чиста, прем'юм-подібна до iOS-нативного відчуття. Світлий фон, прозорі скляні картки, м'які блоби для глибини. Кольори циклу інтегровані, але домінує спокійна синьо-м'ятна палітра.

**Емоційне відчуття:** "AI-подруга яка завжди поряд" — не клінічно, не хайпово, а тепло і впевнено.

---

## 2. Кольорова палітра (з коду)

### Базові токени (`const C` у `alex-app.jsx`)

```js
const C = {
  bg:          "#F5F9FF",                       // світлий фон
  blue:        "#4A9EDF",                       // основний акцент
  blueLight:   "#5BB8F5",                       // світлий синій
  mint:        "#4ECBA8",                       // м'ятний акцент
  text:        "#1A2433",                       // основний текст
  textSub:     "#6B7A8D",                       // вторинний текст
  glass:       "rgba(255,255,255,0.78)",        // скляні картки
  glassBorder: "rgba(255,255,255,0.92)",        // межа скла
}
```

### Phase Colors (для циклу)

```js
phaseColors = {
  menstrual:  "#9B8FE8",  // 🌸 м'який лавандовий
  follicular: "#4ECBA8",  // 🌱 м'ятний
  ovulation:  "#4A9EDF",  // 💎 синій
  luteal:     "#F59E3F",  // 🍂 теплий оранжевий
}
```

**Правило:** базова палітра — спокійна синьо-м'ятна. Phase colors використовуються **лише** для маркування фаз циклу (календар, бейджі, протокол дня) — не як основний UI.

---

## 3. Типографіка

**Шрифт:** System fonts — нативний для iOS/macOS

```css
fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif"
```

### Розміри і ваги

| Елемент | Розмір | Вага | Letter-spacing |
|---|---|---|---|
| Hero header | 30-32px | 900 | -0.8px |
| Logo "Alex" | 22px | 900 | -0.5px |
| Section title | 17-22px | 800-900 | -0.3px |
| Body text | 14-16px | 600-700 | normal |
| Caption | 11-13px | 700-800 (uppercase) | 1px |
| Sublabel | 11-12px | 600 | normal |

**Принцип:** великі ваги для заголовків (800-900), щільне трекінг, мінімалізм.

---

## 4. Глибина і Glassmorphism

### Шари

```
Шар 1 (фон):          #F5F9FF  + Blob елементи (м'які кольорові плями)
Шар 2 (картки):       rgba(255,255,255,0.78) + backdrop-blur(20px)
Шар 3 (контент):      повністю непрозорі тексти/іконки
```

### Backdrop blur

```css
backdropFilter: "blur(20px)"
WebkitBackdropFilter: "blur(20px)"
background: "rgba(255,255,255,0.78)"
border: "1px solid rgba(255,255,255,0.92)"
```

### Blob елементи

Великі м'які кольорові плями з blur(60px) для створення глибини без перевантаження.

```js
<Blob top={-60} right={-60} size={200} color="rgba(74,158,223,0.09)" />
<Blob bottom={100} left={-40} size={240} color="rgba(78,203,168,0.10)" />
```

---

## 5. Border-radius (кутові радіуси)

| Елемент | Радіус |
|---|---|
| Маленькі іконки/чипи | 8-10px |
| Кнопки малі | 10-12px |
| Картки | 14-20px |
| Великі hero-картки | 24-28px |
| Кругові аватари | 50% |

**Без жорстких прямих кутів.** Все має м'які заокруглення.

---

## 6. Reusable компоненти (з коду)

| Компонент | Рядок | Призначення |
|---|---|---|
| `Card` | 357 | Базова картка з паддінгом |
| `Blob` | 361 | Кольорова пляма для глибини |
| `Chip` | 371 | Маленька pill-кнопка (фільтри, мітки) |
| `ProgressDots` | 387 | Прогрес кроків (для Body Audit) |
| `BackBtn` | 401 | Кнопка назад в header |
| `SectionLabel` | 413 | Caption-заголовок секції (uppercase) |
| `CustomSlider` | 1349 | Слайдер для CheckIn метрик |

---

## 7. Кнопки

### Primary (синя)
```js
background: "#4A9EDF"
color: "#fff"
borderRadius: 14
padding: "16px 32px"
fontWeight: 800
boxShadow: "0 4px 14px rgba(74,158,223,0.35)"
```

### Secondary (mint)
```js
background: "#4ECBA8"
color: "#fff"
```

### Ghost (на скляному фоні)
```js
background: "rgba(255,255,255,0.7)"
border: "1px solid rgba(74,158,223,0.25)"
color: "#4A9EDF"
```

### Toggle (мова EN/UK)
```js
padding: "6px 14px"
borderRadius: 10
border: "1px solid rgba(74,158,223,0.25)"
background: "rgba(255,255,255,0.7)"
color: "#4A9EDF"
fontWeight: 700
```

---

## 8. Іконки

Emoji + системні. Без SVG-іконок з бібліотек.

**Phase emoji:** 🩸 (menstrual), 🌱 (follicular), 💎 (ovulation), 🍂 (luteal)
**Action emoji:** 🏋️ (workout), 🧘 (yoga), 🥗 (nutrition), 💆 (beauty), 🌿 (greeting)
**Status emoji:** ✓ (check-in done), 🌿 (success), ✅ (already done)

---

## 9. Tone of UI (мікрокопі)

- **Тепло але впевнено:** "Hey [Name]! I'm Alex — your AI wellness friend 🌿"
- **Без жаргону:** "Sleep was rough? It happens. Let's recover today."
- **Bilingual seamless:** все існує паралельно EN + UK через toggle
- **Без хайпу:** жодних "revolutionary", "game-changer". Чесно і просто.

---

## 10. Що НЕ робимо

- ❌ Темні режими (поки що — V2+)
- ❌ Pink, purple основні (purple лише для menstrual phase)
- ❌ Зелений темний (тільки м'ятний 4ECBA8)
- ❌ Хард-borders 1px solid grey
- ❌ Drop-shadows жорсткі (тільки м'які backdrop blurs)
- ❌ Стокові ілюстрації / 3D рендери
- ❌ Bootstrap-style вигляд

---

## 11. Адаптивність

Mobile-first. Дизайн оптимізований під PWA (Progressive Web App) — додаток виглядає як native iOS app коли встановлений на home screen.

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Alex" />
<meta name="theme-color" content="#4A9EDF" />
```

Десктоп-версія центрує контент в максимальній ширині 480-520px (мобільний-first проект).

---

## 12. Reference: live app

https://alex-ai-coach.vercel.app/

Можна завжди подивитись актуальний дизайн на живому додатку.

---

*Цей документ синхронізований з кодом `alex-app.jsx`. Якщо змінюєш кольори/шрифти/радіуси у коді — оновлюй цей файл.*
