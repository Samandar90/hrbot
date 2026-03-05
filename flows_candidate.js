// flows_candidate.js (PREMIUM CLEAN v2)
import { q, setState, getState, clearState } from "./db.js";
import {
  kbVacancies,
  kbNav,
  kbAgeBuckets,
  kbLicense,
  kbAlcohol,
  kbExperience,
  kbShift,
  kbStartPref,
  kbConfirm,
  kbInfoBack,
  kbRequestContact,
  kbRemoveReply,
} from "./keyboards.js";

/* =========================
   DB helpers
========================= */
async function getActiveVacancies() {
  const r = await q(
    "select id, button_text from vacancies where is_active=true order by id asc",
  );
  return r.rows;
}

async function getVacancy(vacId) {
  const r = await q("select * from vacancies where id=$1", [vacId]);
  return r.rowCount ? r.rows[0] : null;
}

async function getFilters(vacId) {
  const r = await q(
    "select type, config from vacancy_filters where vacancy_id=$1",
    [vacId],
  );
  return r.rows;
}

/* =========================
   UI engine (main + prompt)
   - main_mid: one main message (edited)
   - prompt_mid: one prompt message (edited)
========================= */
async function readState(userId) {
  const st = await getState(userId);
  return {
    state: st?.state || "idle",
    data: st?.data || {},
  };
}

async function writeState(userId, state, data) {
  await setState(userId, state, data);
}

function getUi(data) {
  return data?.ui || {};
}

function setUi(data, patch) {
  const ui = { ...(data.ui || {}), ...patch };
  return { ...data, ui };
}

async function safeDelete(ctx, chatId, mid) {
  if (!chatId || !mid) return;
  try {
    await ctx.api.deleteMessage(chatId, mid);
  } catch (_) {}
}

async function upsertMain(ctx, userId, text, reply_markup) {
  const chatId = ctx.chat?.id;
  const { state, data } = await readState(userId);
  const ui = getUi(data);

  if (ui.main_mid) {
    try {
      await ctx.api.editMessageText(chatId, ui.main_mid, text, {
        reply_markup: reply_markup || undefined,
      });
      return ui.main_mid;
    } catch (_) {
      // fallthrough -> send new
    }
  }

  if (ui.main_mid) await safeDelete(ctx, chatId, ui.main_mid);
  const m = await ctx.api.sendMessage(chatId, text, {
    reply_markup: reply_markup || undefined,
  });

  const newData = setUi(data, { main_mid: m.message_id });
  await writeState(userId, state, newData);
  return m.message_id;
}

// prompt = small helper message (also edited, not multiplied)
async function upsertPrompt(ctx, userId, text, extra = {}) {
  const chatId = ctx.chat?.id;
  const { state, data } = await readState(userId);
  const ui = getUi(data);

  if (ui.prompt_mid) {
    try {
      await ctx.api.editMessageText(chatId, ui.prompt_mid, text, {
        reply_markup: extra.reply_markup || undefined,
      });
      return ui.prompt_mid;
    } catch (_) {
      // fallthrough -> send new
    }
  }

  if (ui.prompt_mid) await safeDelete(ctx, chatId, ui.prompt_mid);
  const m = await ctx.api.sendMessage(chatId, text, extra);

  const newData = setUi(data, { prompt_mid: m.message_id });
  await writeState(userId, state, newData);
  return m.message_id;
}

async function clearPrompt(ctx, userId) {
  const chatId = ctx.chat?.id;
  const { state, data } = await readState(userId);
  const ui = getUi(data);
  if (!ui.prompt_mid) return;

  await safeDelete(ctx, chatId, ui.prompt_mid);
  const newData = setUi(data, { prompt_mid: null });
  await writeState(userId, state, newData);
}

/* =========================
   History (premium back)
========================= */
function snapshotPack(state, data) {
  // минимальный безопасный snapshot (без циклов)
  return { state, data: JSON.parse(JSON.stringify(data)) };
}

function pushHistory(data, snap) {
  const history = Array.isArray(data.history) ? data.history : [];
  return { ...data, history: [...history, snap] };
}

function popHistory(data) {
  const history = Array.isArray(data.history) ? data.history : [];
  if (!history.length) return { data, snap: null };
  const snap = history[history.length - 1];
  return { data: { ...data, history: history.slice(0, -1) }, snap };
}

/* =========================
   Mapping for summary/admin
========================= */
const MAPS = {
  exp: { 0: "0", 1: "1 yil", "2p": "2+ yil" },
  shift: { day: "Kunduz", night: "Kech", any: "Farqi yo‘q" },
  start: { today: "Bugun", tomorrow: "Ertaga", week: "1 hafta ichida" },
  license: { bc: "B + C", only_b: "Faqat B", other: "Boshqa/Yo‘q" },
  alcohol: { no: "Ichmayman", yes: "Ichaman" },
};

function pretty(mapKey, val) {
  const m = MAPS[mapKey] || {};
  return m[val] || val || "-";
}

function summaryText(d) {
  return (
    "✅ Tekshirib oling:\n\n" +
    `— Vakansiya: ${d.vac_button || "-"}\n` +
    `— Ism: ${d.name || "-"}\n` +
    `— Telefon: ${d.phone || "-"}\n` +
    (d.needAge ? `— Yosh: ${d.age || "-"}\n` : "") +
    `— Tajriba: ${pretty("exp", d.experience)}\n` +
    `— Grafik: ${pretty("shift", d.shift)}\n` +
    `— Qachondan: ${pretty("start", d.start_pref)}\n` +
    (d.needLicense ? `— Guvohnoma: ${pretty("license", d.license)}\n` : "") +
    (d.needAlcohol ? `— Alkogol: ${pretty("alcohol", d.alcohol)}\n` : "")
  );
}

/* =========================
   Public API
========================= */
export async function startCandidate(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const vacs = await getActiveVacancies();
  await clearState(userId);

  // init state
  await writeState(userId, "cand_pick", { ui: {}, history: [] });

  if (!vacs.length) {
    await upsertMain(ctx, userId, "Hozircha bo‘sh ish o‘rinlari yo‘q.", null);
    return;
  }

  await upsertMain(
    ctx,
    userId,
    "Assalomu alaykum!\nVakansiyani tanlang:",
    kbVacancies(vacs),
  );
  await clearPrompt(ctx, userId);
}

/* =========================
   Callbacks
========================= */
export async function handleCandidateCallbacks(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cb = ctx.callbackQuery?.data || "";
  const { state, data } = await readState(userId);

  // Global controls
  if (cb === "cand:restart") {
    await ctx.answerCallbackQuery();
    await startCandidate(ctx);
    return;
  }

  if (cb === "cand:info") {
    await ctx.answerCallbackQuery();
    await upsertMain(
      ctx,
      userId,
      "📌 Qisqa ma’lumot:\n\nAriza tugmalar orqali to‘ldiriladi.\nTelefon raqamni “📱 Raqamni yuborish” tugmasi bilan yuborasiz.\n\nDavom etish uchun “⬅️ Ortga” ni bosing.",
      kbInfoBack(),
    );
    return;
  }

  if (cb === "cand:back") {
    await ctx.answerCallbackQuery();
    const popped = popHistory(data);
    if (!popped.snap) {
      await startCandidate(ctx);
      return;
    }
    // restore snapshot
    await writeState(userId, popped.snap.state, popped.snap.data);
    await redraw(ctx, userId);
    return;
  }

  // Pick vacancy
  if (cb.startsWith("vac:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(cb.split(":")[1]);
    const vac = await getVacancy(vacId);

    if (!vac || !vac.is_active) {
      await upsertMain(ctx, userId, "Bu vakansiya hozir faol emas.", kbNav());
      return;
    }

    // create application
    const app = await q(
      `insert into applications(vacancy_id,user_id,username,full_name)
       values($1,$2,$3,$4) returning id`,
      [
        vacId,
        userId,
        ctx.from.username || "",
        `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim(),
      ],
    );
    const appId = app.rows[0].id;

    const filters = await getFilters(vacId);

    const payload = {
      ui: data.ui || {},
      history: [],

      vacId,
      vac_button: vac.button_text,
      appId,

      // collected
      age: null,
      license: null,
      alcohol: null,
      name: "",
      phone: "",
      experience: "",
      shift: "",
      start_pref: "",

      // flags from filters
      needAge: filters.some((f) => f.type === "age_range"),
      needLicense: filters.some((f) => f.type === "license_bc"),
      needAlcohol: filters.some((f) => f.type === "no_alcohol"),
    };

    await writeState(userId, "cand_step", payload);

    await upsertMain(
      ctx,
      userId,
      `Tanlandi: ${vac.button_text}\n\nBoshlaymiz ✅`,
      kbNav(),
    );
    await clearPrompt(ctx, userId);

    await nextStep(ctx, userId);
    return;
  }

  // Age bucket
  if (cb.startsWith("age:")) {
    await ctx.answerCallbackQuery();
    const key = cb.split(":")[1];
    const age =
      key === "18_20" ? 20 : key === "21_25" ? 25 : key === "26_30" ? 30 : 31;

    const snap = snapshotPack(state, data);
    let d = pushHistory(data, snap);
    d.age = age;

    // Strict rule (как ты просил)
    if (age >= 31) {
      await rejectAndClose(
        ctx,
        userId,
        d.appId,
        "Rahmat! Afsuski, yosh bo‘yicha mos emassiz.",
      );
      return;
    }

    await writeState(userId, "cand_step", d);
    await nextStep(ctx, userId);
    return;
  }

  // License / alcohol
  if (cb.startsWith("fresp:")) {
    await ctx.answerCallbackQuery();
    const [, key, value] = cb.split(":");

    const snap = snapshotPack(state, data);
    let d = pushHistory(data, snap);

    if (key === "license") d.license = value;
    if (key === "alcohol") d.alcohol = value;

    // Strict rules (как ты просил)
    if (key === "license" && value !== "bc") {
      await rejectAndClose(ctx, userId, d.appId, "B va C toifalari kerak.");
      return;
    }
    if (key === "alcohol" && value !== "no") {
      await rejectAndClose(
        ctx,
        userId,
        d.appId,
        "Bu ish uchun alkogol ichmaslik shart.",
      );
      return;
    }

    await writeState(userId, "cand_step", d);
    await nextStep(ctx, userId);
    return;
  }

  // Experience
  if (cb.startsWith("exp:")) {
    await ctx.answerCallbackQuery();
    const snap = snapshotPack(state, data);
    let d = pushHistory(data, snap);
    d.experience = cb.split(":")[1];
    await writeState(userId, "cand_step", d);
    await nextStep(ctx, userId);
    return;
  }

  // Shift
  if (cb.startsWith("shift:")) {
    await ctx.answerCallbackQuery();
    const snap = snapshotPack(state, data);
    let d = pushHistory(data, snap);
    d.shift = cb.split(":")[1];
    await writeState(userId, "cand_step", d);
    await nextStep(ctx, userId);
    return;
  }

  // Start pref
  if (cb.startsWith("start:")) {
    await ctx.answerCallbackQuery();
    const snap = snapshotPack(state, data);
    let d = pushHistory(data, snap);
    d.start_pref = cb.split(":")[1];
    await writeState(userId, "cand_step", d);
    await nextStep(ctx, userId);
    return;
  }

  // Confirm
  if (cb === "cand:confirm") {
    await ctx.answerCallbackQuery();
    try {
      await finalizeAndSend(ctx, userId, data);
    } catch (e) {
      console.error("confirm error:", e);
      await upsertMain(
        ctx,
        userId,
        "❌ Xatolik. Ma’lumotlar saqlanmadi.\nIltimos, qaytadan urinib ko‘ring: 🔄 Qayta",
        null,
      );
    }
    return;
  }

  // Edit name
  if (cb === "cand:edit_name") {
    await ctx.answerCallbackQuery();
    const snap = snapshotPack(state, data);
    let d = pushHistory(data, snap);

    await writeState(userId, "cand_wait_name", d);
    await upsertPrompt(ctx, userId, "Ismingizni yozing:", {
      reply_markup: kbRemoveReply(),
    });
    return;
  }
}

/* =========================
   Messages (text + contact)
========================= */
export async function handleCandidateMessages(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const { state, data } = await readState(userId);

  // Reply-keyboard navigation (when contact keyboard is open)
  const t = (ctx.message?.text || "").trim();
  if (t === "⬅️ Ortga") {
    const popped = popHistory(data);
    if (!popped.snap) return startCandidate(ctx);
    await writeState(userId, popped.snap.state, popped.snap.data);
    await redraw(ctx, userId);
    return;
  }
  if (t === "🔄 Qayta") {
    await startCandidate(ctx);
    return;
  }

  // Contact
  if (state === "cand_wait_contact") {
    const contact = ctx.message?.contact;
    if (!contact?.phone_number) {
      await upsertPrompt(
        ctx,
        userId,
        "Iltimos, “📱 Raqamni yuborish” tugmasini bosing.",
        {
          reply_markup: kbRequestContact(),
        },
      );
      return;
    }

    const phone = contact.phone_number.startsWith("+")
      ? contact.phone_number
      : `+${contact.phone_number}`;

    const snap = snapshotPack(state, data);
    let d = pushHistory(data, snap);
    d.phone = phone;

    await writeState(userId, "cand_step", d);

    // premium: убираем клавиатуру контакта сразу
    await upsertPrompt(ctx, userId, "Rahmat ✅", {
      reply_markup: kbRemoveReply(),
    });
    // и через step перерисуем главный экран
    await nextStep(ctx, userId);
    return;
  }

  // Name
  if (state === "cand_wait_name") {
    const name = t;
    if (!name || name.length < 2) {
      await upsertPrompt(ctx, userId, "Ismni to‘g‘ri yozing (kamida 2 harf).", {
        reply_markup: kbRemoveReply(),
      });
      return;
    }

    const snap = snapshotPack(state, data);
    let d = pushHistory(data, snap);
    d.name = name;

    await writeState(userId, "cand_step", d);
    await clearPrompt(ctx, userId);
    await nextStep(ctx, userId);
    return;
  }
}

/* =========================
   Step engine (single source of truth)
========================= */
async function nextStep(ctx, userId) {
  const { data: d } = await readState(userId);

  // 1) Age (only if needed)
  if (d.needAge && !d.age) {
    await upsertMain(ctx, userId, "Yoshingizni tanlang:", kbAgeBuckets());
    await clearPrompt(ctx, userId);
    return;
  }

  // 2) License
  if (d.needLicense && !d.license) {
    await upsertMain(
      ctx,
      userId,
      "Haydovchilik guvohnomangiz qaysi toifada?",
      kbLicense(),
    );
    await clearPrompt(ctx, userId);
    return;
  }

  // 3) Alcohol
  if (d.needAlcohol && !d.alcohol) {
    await upsertMain(ctx, userId, "Alkogol ichasizmi?", kbAlcohol());
    await clearPrompt(ctx, userId);
    return;
  }

  // 4) Name
  if (!d.name) {
    await upsertMain(ctx, userId, "Ismingizni kiriting:", kbNav());
    await writeState(userId, "cand_wait_name", d);
    await upsertPrompt(ctx, userId, "Ismingizni yozing:", {
      reply_markup: kbRemoveReply(),
    });
    return;
  }

  // 5) Phone (contact)
  if (!d.phone) {
    await upsertMain(ctx, userId, "Telefon raqamingizni yuboring:", kbNav());
    await writeState(userId, "cand_wait_contact", d);
    await upsertPrompt(ctx, userId, "Pastdagi tugma orqali yuboring:", {
      reply_markup: kbRequestContact(),
    });
    return;
  }

  // 6) Experience
  if (!d.experience) {
    await upsertMain(
      ctx,
      userId,
      "Tajriba (ish tajribasi) ni tanlang:",
      kbExperience(),
    );
    await clearPrompt(ctx, userId);
    return;
  }

  // 7) Shift
  if (!d.shift) {
    await upsertMain(ctx, userId, "Qaysi grafik sizga mos?", kbShift());
    await clearPrompt(ctx, userId);
    return;
  }

  // 8) Start pref
  if (!d.start_pref) {
    await upsertMain(ctx, userId, "Qachondan ishlay olasiz?", kbStartPref());
    await clearPrompt(ctx, userId);
    return;
  }

  // 9) Summary
  await upsertMain(ctx, userId, summaryText(d), kbConfirm());
  await clearPrompt(ctx, userId);
}

async function redraw(ctx, userId) {
  const { state } = await readState(userId);
  if (state === "cand_pick") return startCandidate(ctx);
  await nextStep(ctx, userId);
}

async function rejectAndClose(ctx, userId, appId, text) {
  await q("update applications set status='rejected' where id=$1", [appId]);
  await clearState(userId);
  await upsertMain(ctx, userId, text, null);
  await clearPrompt(ctx, userId);
}

/* =========================
   Finalize -> DB + notify admins
========================= */
async function finalizeAndSend(ctx, userId, d) {
  // save to DB
  await q(
    `update applications
     set phone=$1, age=$2, experience=$3, shift=$4, start_pref=$5, license=$6, alcohol=$7
     where id=$8`,
    [
      d.phone || null,
      d.needAge ? d.age || null : null,
      d.experience || null,
      d.shift || null,
      d.start_pref || null,
      d.needLicense ? d.license || null : null,
      d.needAlcohol ? d.alcohol || null : null,
      d.appId,
    ],
  );

  const adminIds = (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const app = await q("select * from applications where id=$1", [d.appId]);
  const a = app.rows[0];

  const adminMsg =
    `🧾 Ariza (${d.vac_button})\n` +
    `— Ism: ${d.name || a.full_name || "-"}\n` +
    `— Telefon: ${a.phone || d.phone || "-"}\n` +
    (d.needAge ? `— Yosh: ${a.age || d.age || "-"}\n` : "") +
    `— Tajriba: ${pretty("exp", a.experience || d.experience)}\n` +
    `— Grafik: ${pretty("shift", a.shift || d.shift)}\n` +
    `— Qachondan: ${pretty("start", a.start_pref || d.start_pref)}\n` +
    (d.needLicense
      ? `— Guvohnoma: ${pretty("license", a.license || d.license)}\n`
      : "") +
    (d.needAlcohol
      ? `— Alkogol: ${pretty("alcohol", a.alcohol || d.alcohol)}\n`
      : "") +
    `— Username: ${a.username ? "@" + a.username : "-"}\n` +
    `— UserID: ${a.user_id}\n`;

  // import kbStatus lazily (no circular)
  const { kbStatus } = await import("./keyboards.js");

  for (const adm of adminIds) {
    await ctx.api.sendMessage(adm, adminMsg, {
      reply_markup: kbStatus(d.appId),
    });
  }

  await clearState(userId);
  await clearPrompt(ctx, userId);

  await upsertMain(
    ctx,
    userId,
    "Rahmat! Arizangiz qabul qilindi ✅\nTez orada bog‘lanamiz.",
    null,
  );
}
