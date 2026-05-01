// Vercel serverless function — sends 30/60/90-day milestone email via Resend.
// Configure env vars in Vercel dashboard (Project → Settings → Environment Variables):
//   RESEND_API_KEY   — Resend secret (re_...)
//   NOTIFY_FROM      — verified sender (e.g. "Alex <hello@your-domain.com>")
// Optional:
//   NOTIFY_REPLY_TO  — reply-to address (e.g. support@your-domain.com)

type Insight = { key: string; label_en: string; label_uk: string; delta: number }

// type defaults to "milestone" for backwards compat (P0.4).
// "phase_change" / "period_prediction" added in P1.7 for future cloud-trigger.
type NotifyType = "milestone" | "phase_change" | "period_prediction"

type NotifyBody = {
  email: string
  name?: string
  milestone?: 30 | 60 | 90
  lang?: "uk" | "en"
  insights?: Insight[]
  type?: NotifyType
  phase?: "menstrual" | "follicular" | "ovulation" | "luteal"
  predictedDate?: string // YYYY-MM-DD for period_prediction
  daysUntil?: number     // 0|1|2 for period_prediction
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

// Shared email shell for non-milestone notifications (phase / period).
function wrapEmail({ uk, subject, heading, intro, ctaLabel }: { uk: boolean; subject: string; heading: string; intro: string; ctaLabel: string }): { subject: string; html: string; text: string } {
  const tagline = uk
    ? "5 симптомів — 1 причина. Ти бачиш картину раніше за більшість."
    : "5 symptoms, 1 root cause. You're seeing the picture earlier than most."
  const footer = uk
    ? "Не хочеш отримувати такі листи? Вимкни нотифікації в Profile → Сповіщення."
    : "Don't want these emails? Turn off notifications in Profile → Notifications."
  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F9FF;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1A2433;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F9FF;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:rgba(255,255,255,0.95);border-radius:24px;border:1px solid rgba(74,158,223,0.15);padding:32px;">
        <tr><td>
          <div style="font-size:13px;font-weight:800;color:#4A9EDF;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px;">Alex · Longevity Coach</div>
          <h1 style="font-size:24px;font-weight:900;margin:0 0 16px;letter-spacing:-0.5px;line-height:1.25;">${escapeHtml(heading)}</h1>
          <p style="font-size:15px;line-height:1.6;color:#1A2433;margin:0 0 20px;">${escapeHtml(intro)}</p>
          <div style="text-align:center;margin:8px 0 24px;">
            <a href="https://alex-ai-coach.vercel.app/" style="display:inline-block;background:#4A9EDF;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 28px;border-radius:14px;">${escapeHtml(ctaLabel)}</a>
          </div>
          <p style="font-size:13px;line-height:1.5;color:#6B7A8D;margin:0 0 18px;">${escapeHtml(tagline)}</p>
          <hr style="border:none;border-top:1px solid rgba(74,158,223,0.12);margin:24px 0 18px;">
          <p style="font-size:11px;line-height:1.5;color:#9BA8B9;margin:0;">${escapeHtml(footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  const text = `${heading}\n\n${intro}\n\nhttps://alex-ai-coach.vercel.app/\n\n${tagline}`
  return { subject, html, text }
}

// Phase-change + period-prediction copy lives here so api/notify can build
// the same nudge as the local PWA push when used as cloud trigger.
const PHASE_EMAIL_COPY: Record<string, { uk: { subject: string; intro: string }; en: { subject: string; intro: string } }> = {
  menstrual: {
    uk: { subject: "🌹 Перший день циклу", intro: "Ти у менструальній фазі. Залізо + теплі рідини + повільне відновлення. Силові — пропусти у важкі дні." },
    en: { subject: "🌹 Day 1 of your cycle", intro: "You're in the menstrual phase. Iron + warm fluids + slow recovery. Skip strength on heavy bleed days." },
  },
  follicular: {
    uk: { subject: "🌱 Фолікулярна фаза", intro: "Енергія росте — час планувати, важкі силові, нові виклики." },
    en: { subject: "🌱 Follicular phase",  intro: "Energy is rising — time to plan, lift heavy, take on new challenges." },
  },
  ovulation: {
    uk: { subject: "✨ Овуляція", intro: "Пік енергії і впевненості. Найважчі тренування + соціальні марафони." },
    en: { subject: "✨ Ovulation",  intro: "Peak energy and confidence. Heaviest lifts + social marathons." },
  },
  luteal: {
    uk: { subject: "🍂 Лютеальна фаза", intro: "Магній 300мг + менш інтенсивні тренування + раніше спати." },
    en: { subject: "🍂 Luteal phase",     intro: "Magnesium 300mg + lighter training + earlier bedtime." },
  },
}

function buildHtml(body: NotifyBody): { subject: string; html: string; text: string } {
  const uk = body.lang === "uk"
  const type = body.type || "milestone"
  const safeName = body.name ? ", " + escapeHtml(body.name) : ""

  if (type === "phase_change" && body.phase && PHASE_EMAIL_COPY[body.phase]) {
    const c = PHASE_EMAIL_COPY[body.phase][uk ? "uk" : "en"]
    return wrapEmail({ uk, subject: c.subject, heading: c.subject, intro: (uk ? `Привіт${safeName}! ` : `Hi${safeName}! `) + c.intro, ctaLabel: uk ? "Відкрити Alex" : "Open Alex" })
  }

  if (type === "period_prediction") {
    const d = typeof body.daysUntil === "number" ? body.daysUntil : 2
    const date = body.predictedDate ? escapeHtml(body.predictedDate) : ""
    const subject = uk
      ? (d === 0 ? "🌹 Менструація вже сьогодні" : `🌹 Менструація через ${d} ${d === 1 ? "день" : "дні"}`)
      : (d === 0 ? "🌹 Period expected today"   : `🌹 Period in ${d} ${d === 1 ? "day" : "days"}`)
    const intro = uk
      ? `Привіт${safeName}! Очікуй менструацію ${date}. Підготуй залізо, магній, теплу їжу — і впусти повільніший темп.`
      : `Hi${safeName}! Period expected ${date}. Prep iron, magnesium, warm food — and ease the pace.`
    return wrapEmail({ uk, subject, heading: subject, intro, ctaLabel: uk ? "Відкрити Alex" : "Open Alex" })
  }

  // Default: milestone (P0.4)
  const milestone = body.milestone
  const insights = (body.insights || []).slice(0, 3)

  const subject = uk
    ? `🌟 ${milestone} днів з Alex — ось твої результати`
    : `🌟 ${milestone} days with Alex — here's your progress`

  const intro = uk
    ? `Привіт${safeName}! Ти щойно зробила <b>${milestone} check-inів поспіль</b>. Це не просто стрік — це доказ того, що твоє тіло відповідає на нову рутину.`
    : `Hi${safeName}! You just hit <b>${milestone} check-ins in a row</b>. This isn't just a streak — it's proof that your body is responding to your new routine.`

  const insightsTitle = uk ? "Що покращилось:" : "What's improving:"

  const insightRows = insights.length
    ? insights.map(i => {
        const label = uk ? i.label_uk : i.label_en
        const delta = (typeof i.delta === "number" ? i.delta : 0).toFixed(1)
        return `<tr><td style="padding:8px 0;font-size:14px;color:#1A2433;"><span style="color:#4ECBA8;font-weight:800;">↑</span> <b>${escapeHtml(label)}</b> &nbsp;<span style="color:#6B7A8D;">+${escapeHtml(delta)}</span></td></tr>`
      }).join("")
    : `<tr><td style="padding:8px 0;font-size:14px;color:#6B7A8D;">${uk ? "Стабільний ритм — це вже сильна перемога 💙" : "A steady rhythm is its own win 💙"}</td></tr>`

  const cta = uk ? "Відкрити Alex" : "Open Alex"
  const tagline = uk
    ? "5 симптомів — 1 причина. Ти бачиш картину раніше за більшість."
    : "5 symptoms, 1 root cause. You're seeing the picture earlier than most."

  const footer = uk
    ? `Не хочеш отримувати такі листи? Вимкни нотифікації в Profile → Сповіщення.`
    : `Don't want these emails? Turn off notifications in Profile → Notifications.`

  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F9FF;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1A2433;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F9FF;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:rgba(255,255,255,0.95);border-radius:24px;border:1px solid rgba(74,158,223,0.15);padding:32px;">
        <tr><td>
          <div style="font-size:13px;font-weight:800;color:#4A9EDF;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px;">Alex · Longevity Coach</div>
          <h1 style="font-size:24px;font-weight:900;margin:0 0 16px;letter-spacing:-0.5px;line-height:1.25;">🌟 ${milestone} ${uk ? "днів" : "days"}</h1>
          <p style="font-size:15px;line-height:1.6;color:#1A2433;margin:0 0 20px;">${intro}</p>

          <div style="font-size:11px;font-weight:800;color:#6B7A8D;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${insightsTitle}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(245,158,63,0.08),rgba(78,203,168,0.08));border:1px solid rgba(245,158,63,0.25);border-radius:16px;padding:14px 18px;margin-bottom:24px;">
            ${insightRows}
          </table>

          <div style="text-align:center;margin:8px 0 24px;">
            <a href="https://alex-ai-coach.vercel.app/" style="display:inline-block;background:#4A9EDF;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 28px;border-radius:14px;">${cta}</a>
          </div>

          <p style="font-size:13px;line-height:1.5;color:#6B7A8D;margin:0 0 18px;">${tagline}</p>
          <hr style="border:none;border-top:1px solid rgba(74,158,223,0.12);margin:24px 0 18px;">
          <p style="font-size:11px;line-height:1.5;color:#9BA8B9;margin:0;">${footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = `${milestone} ${uk ? "днів з Alex" : "days with Alex"}\n\n${intro.replace(/<[^>]+>/g, "")}\n\n${insights.map(i => `+ ${uk ? i.label_uk : i.label_en} +${(i.delta || 0).toFixed(1)}`).join("\n") || (uk ? "Стабільний ритм — це вже сильна перемога." : "A steady rhythm is its own win.")}\n\nhttps://alex-ai-coach.vercel.app/\n\n${tagline}`

  return { subject, html, text }
}

export default async function handler(req: any, res: any) {
  // CORS — only same-origin in practice (Vercel routes /api/* alongside the app),
  // but be explicit for preview deploys.
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST")     return res.status(405).json({ error: "Method not allowed" })

  let body: NotifyBody
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {})
  } catch {
    return res.status(400).json({ error: "Invalid JSON" })
  }

  if (!body || !body.email || !isEmail(body.email)) {
    return res.status(400).json({ error: "Valid email required" })
  }
  const type = body.type || "milestone"
  if (type === "milestone") {
    if (![30, 60, 90].includes(Number(body.milestone))) {
      return res.status(400).json({ error: "Milestone must be 30, 60 or 90" })
    }
  } else if (type === "phase_change") {
    const ok = ["menstrual", "follicular", "ovulation", "luteal"].includes(String(body.phase))
    if (!ok) return res.status(400).json({ error: "phase must be menstrual|follicular|ovulation|luteal" })
  } else if (type === "period_prediction") {
    if (!body.predictedDate) return res.status(400).json({ error: "predictedDate required" })
  } else {
    return res.status(400).json({ error: "Unknown type" })
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const NOTIFY_FROM    = process.env.NOTIFY_FROM || "Alex <onboarding@resend.dev>"
  const NOTIFY_REPLY_TO = process.env.NOTIFY_REPLY_TO

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: "Email provider not configured" })
  }

  const { subject, html, text } = buildHtml(body)

  const payload: Record<string, unknown> = {
    from: NOTIFY_FROM,
    to: [body.email],
    subject,
    html,
    text,
  }
  if (NOTIFY_REPLY_TO) payload.reply_to = NOTIFY_REPLY_TO

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!r.ok) {
      const detail = await r.text().catch(() => "")
      return res.status(502).json({ error: "Resend send failed", detail })
    }

    const data = await r.json().catch(() => ({}))
    return res.status(200).json({ ok: true, id: (data as any).id || null })
  } catch (err: any) {
    return res.status(500).json({ error: "Send failed", detail: String(err?.message || err) })
  }
}
