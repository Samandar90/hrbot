// flows_candidate.js (PREMIUM WIZARD)
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

/* DB helpers */
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

/* Clean chat engine */
async function getUi(userId) {
  const st = await getState(userId);
  return st?.data?.ui || {};
}
async function setUi(userId, patch) {
  const st = await getState(userId);
  const data = st?.data || {};
  data.ui = { ...(data.ui || {}), ...patch };
  await setState(userId, st?.state || "idle", data);
}
async function safeDelete(ctx, chatId, mid) {
  if (!chatId || !mid) return;
  try {
    await ctx.api.deleteMessage(chatId, mid);
  } catch (_) {}
}
async function deletePrompt(ctx, userId) {
  const ui = await getUi(userId);
  const chatId = ctx.chat?.id;
  if (ui.prompt_mid) {
    await safeDelete(ctx, chatId, ui.prompt_mid);
    await setUi(userId, { prompt_mid: null });
  }
}
async function upsertMain(ctx, userId, text, reply_markup) {
  const ui = await getUi(userId);
  const chatId = ctx.chat?.id;

  if (ui.main_mid) {
    try {
      await ctx.api.editMessageText(chatId, ui.main_mid, text, {
        reply_markup,
      });
      return ui.main_mid;
    } catch (_) {}
  }

  if (ui.main_mid) await safeDelete(ctx, chatId, ui.main_mid);
  const m = await ctx.api.sendMessage(chatId, text, { reply_markup });
  await setUi(userId, { main_mid: m.message_id });
  return m.message_id;
}
async function sendPrompt(ctx, userId, text, extra = {}) {
  const ui = await getUi(userId);
  const chatId = ctx.chat?.id;
  if (ui.prompt_mid) await safeDelete(ctx, chatId, ui.prompt_mid);

  const m = await ctx.api.sendMessage(chatId, text, extra);
  await setUi(userId, { prompt_mid: m.message_id });
  return m.message_id;
}

/* Core */
export async function startCandidate(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const vacs = await getActiveVacancies();
  await clearState(userId);

  await setState(userId, "cand_pick", { ui: {}, history: [] });

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
  await deletePrompt(ctx, userId);
}

function pushHistory(data, state, patch = {}) {
  const d = { ...data };
  d.history = Array.isArray(d.history) ? d.history : [];
  d.history.push({
    state,
    snapshot: JSON.parse(JSON.stringify({ ...d, ...patch })),
  });
  return d;
}

function popHistory(data) {
  const d = { ...data };
  d.history = Array.isArray(d.history) ? d.history : [];
  const last = d.history.pop();
  return { data: d, last };
}

async function createApplication(ctx, vacId) {
  const userId = ctx.from.id;
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
  return app.rows[0].id;
}

function prettyValue(map, key, val) {
  return map?.[key]?.[val] || val || "-";
}

async function renderSummary(ctx, data) {
  const maps = {
    exp: { 0: "0", 1: "1 yil", "2p": "2+ yil" },
    shift: { day: "Kunduz", night: "Kech", any: "Farqi yo‘q" },
    start: { today: "Bugun", tomorrow: "Ertaga", week: "1 hafta ichida" },
    license: { bc: "B + C", only_b: "Faqat B", other: "Boshqa/Yo‘q" },
    alcohol: { no: "Ichmayman", yes: "Ichaman" },
  };

  return (
    "✅ Tekshirib oling:\n\n" +
    `— Vakansiya: ${data.vac_button || "-"}\n` +
    `— Ism: ${data.name || "-"}\n` +
    `— Telefon: ${data.phone || "-"}\n` +
    (data.age ? `— Yosh: ${data.age}\n` : "") +
    `— Tajriba: ${prettyValue(maps, "exp", data.experience)}\n` +
    `— Grafik: ${prettyValue(maps, "shift", data.shift)}\n` +
    `— Qachondan: ${prettyValue(maps, "start", data.start_pref)}\n` +
    (data.license
      ? `— Guvohnoma: ${prettyValue(maps, "license", data.license)}\n`
      : "") +
    (data.alcohol
      ? `— Alkogol: ${prettyValue(maps, "alcohol", data.alcohol)}\n`
      : "")
  );
}

/* Callbacks */
export async function handleCandidateCallbacks(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cb = ctx.callbackQuery?.data || "";
  const st = await getState(userId);
  const state = st?.state || "idle";
  const data = st?.data || {};

  // global controls
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
      "📌 Qisqa ma’lumot:\n\nAriza tugmalar orqali to‘ldiriladi. Telefon raqamni “Raqamni yuborish” tugmasi bilan yuborasiz.\n\nDavom etish uchun “Ortga” ni bosing.",
      kbInfoBack(),
    );
    return;
  }
  if (cb === "cand:back") {
    await ctx.answerCallbackQuery();
    const popped = popHistory(data);
    if (!popped.last) {
      await startCandidate(ctx);
      return;
    }
    const prev = popped.last.snapshot;
    await setState(userId, prev._state || "cand_pick", prev);
    // qayta chizamiz
    await redraw(ctx, userId);
    return;
  }

  // pick vacancy
  if (cb.startsWith("vac:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(cb.split(":")[1]);
    const vac = await getVacancy(vacId);
    if (!vac || !vac.is_active) {
      await upsertMain(ctx, userId, "Bu vakansiya hozir faol emas.", kbNav());
      return;
    }

    const appId = await createApplication(ctx, vacId);
    const filters = await getFilters(vacId);

    const payload = {
      ui: (await getUi(userId)) || {},
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

      // dynamic flags from filters
      needAge: filters.some((f) => f.type === "age_range"),
      needLicense: filters.some((f) => f.type === "license_bc"),
      needAlcohol: filters.some((f) => f.type === "no_alcohol"),
    };

    payload._state = "cand_step";
    // start first step
    await setState(userId, "cand_step", payload);
    await upsertMain(
      ctx,
      userId,
      `Tanlandi: ${vac.button_text}\n\nBoshlaymiz ✅`,
      kbNav(),
    );
    await deletePrompt(ctx, userId);
    await nextStep(ctx, userId);
    return;
  }

  // Age bucket
  if (cb.startsWith("age:")) {
    await ctx.answerCallbackQuery();
    const key = cb.split(":")[1];
    // map to representative age number for DB
    const age =
      key === "18_20" ? 20 : key === "21_25" ? 25 : key === "26_30" ? 30 : 31;

    let d = pushHistory(data, state);
    d.age = age;

    // age filter rule (seller 18-30)
    if (age >= 31) {
      await rejectAndClose(
        ctx,
        userId,
        d.appId,
        "Rahmat! Afsuski, yosh bo‘yicha mos emassiz.",
      );
      return;
    }

    d._state = "cand_step";
    await setState(userId, "cand_step", d);
    await nextStep(ctx, userId);
    return;
  }

  // License / alcohol
  if (cb.startsWith("fresp:")) {
    await ctx.answerCallbackQuery();
    const [, key, value] = cb.split(":");

    let d = pushHistory(data, state);
    if (key === "license") d.license = value;
    if (key === "alcohol") d.alcohol = value;

    // strict rules
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

    d._state = "cand_step";
    await setState(userId, "cand_step", d);
    await nextStep(ctx, userId);
    return;
  }

  // Experience
  if (cb.startsWith("exp:")) {
    await ctx.answerCallbackQuery();
    let d = pushHistory(data, state);
    d.experience = cb.split(":")[1];
    await setState(userId, "cand_step", d);
    await nextStep(ctx, userId);
    return;
  }

  // Shift
  if (cb.startsWith("shift:")) {
    await ctx.answerCallbackQuery();
    let d = pushHistory(data, state);
    d.shift = cb.split(":")[1];
    await setState(userId, "cand_step", d);
    await nextStep(ctx, userId);
    return;
  }

  // Start pref
  if (cb.startsWith("start:")) {
    await ctx.answerCallbackQuery();
    let d = pushHistory(data, state);
    d.start_pref = cb.split(":")[1];
    await setState(userId, "cand_step", d);
    await nextStep(ctx, userId);
    return;
  }

  // Confirm
  if (cb === "cand:confirm") {
    await ctx.answerCallbackQuery();
    await finalizeAndSend(ctx, userId, data);
    return;
  }

  if (cb === "cand:edit_name") {
    await ctx.answerCallbackQuery();
    let d = pushHistory(data, state);
    await setState(userId, "cand_wait_name", d);
    await sendPrompt(ctx, userId, "Ismingizni yozing:", {
      reply_markup: kbRemoveReply(),
    });
    return;
  }
}

/* Text messages (only name + simple nav words) */
export async function handleCandidateMessages(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const st = await getState(userId);
  const state = st?.state || "idle";
  const data = st?.data || {};

  // reply keyboard text navigation
  const t = (ctx.message?.text || "").trim();
  if (t === "⬅️ Ortga") {
    // emulate back
    const popped = popHistory(data);
    if (!popped.last) return startCandidate(ctx);
    const prev = popped.last.snapshot;
    await setState(userId, prev._state || "cand_pick", prev);
    await redraw(ctx, userId);
    return;
  }
  if (t === "🔄 Qayta") {
    return startCandidate(ctx);
  }

  // contact
  if (state === "cand_wait_contact") {
    const contact = ctx.message?.contact;
    if (!contact?.phone_number) {
      await sendPrompt(
        ctx,
        userId,
        "Iltimos, “Raqamni yuborish” tugmasini bosing.",
        {
          reply_markup: kbRequestContact(),
        },
      );
      return;
    }

    const phone = contact.phone_number.startsWith("+")
      ? contact.phone_number
      : `+${contact.phone_number}`;

    const d = pushHistory(data, state);
    d.phone = phone;

    await setState(userId, "cand_step", d);
    await sendPrompt(ctx, userId, "✅ Qabul qilindi.", {
      reply_markup: kbRemoveReply(),
    });
    await nextStep(ctx, userId);
    return;
  }

  // name
  if (state === "cand_wait_name") {
    const name = t;
    if (!name || name.length < 2) {
      await sendPrompt(ctx, userId, "Ismni to‘g‘ri yozing (kamida 2 harf).", {
        reply_markup: kbRemoveReply(),
      });
      return;
    }
    const d = pushHistory(data, state);
    d.name = name;
    await setState(userId, "cand_step", d);
    await deletePrompt(ctx, userId);
    await nextStep(ctx, userId);
    return;
  }
}

/* Step engine */
async function nextStep(ctx, userId) {
  const st = await getState(userId);
  const d = st.data;

  // 1) Age (if needed)
  if (d.needAge && !d.age) {
    d._state = "cand_step";
    await setState(userId, "cand_step", d);
    await upsertMain(ctx, userId, "Yoshingizni tanlang:", kbAgeBuckets());
    await deletePrompt(ctx, userId);
    return;
  }

  // 2) License (if needed)
  if (d.needLicense && !d.license) {
    await upsertMain(
      ctx,
      userId,
      "Haydovchilik guvohnomangiz qaysi toifada?",
      kbLicense(),
    );
    await deletePrompt(ctx, userId);
    return;
  }

  // 3) Alcohol (if needed)
  if (d.needAlcohol && !d.alcohol) {
    await upsertMain(ctx, userId, "Alkogol ichasizmi?", kbAlcohol());
    await deletePrompt(ctx, userId);
    return;
  }

  // 4) Name (minimal typing)
  if (!d.name) {
    await upsertMain(ctx, userId, "Ismingizni kiriting:", kbNav());
    await setState(userId, "cand_wait_name", d);
    await sendPrompt(ctx, userId, "Ismingizni yozing:", {
      reply_markup: kbRemoveReply(),
    });
    return;
  }

  // 5) Phone (premium contact)
  if (!d.phone) {
    await upsertMain(ctx, userId, "Telefon raqamingizni yuboring:", kbNav());
    await setState(userId, "cand_wait_contact", d);
    await sendPrompt(ctx, userId, "Pastdagi tugma orqali yuboring:", {
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
    await deletePrompt(ctx, userId);
    return;
  }

  // 7) Shift
  if (!d.shift) {
    await upsertMain(ctx, userId, "Qaysi grafik sizga mos?", kbShift());
    await deletePrompt(ctx, userId);
    return;
  }

  // 8) Start pref
  if (!d.start_pref) {
    await upsertMain(ctx, userId, "Qachondan ishlay olasiz?", kbStartPref());
    await deletePrompt(ctx, userId);
    return;
  }

  // 9) Summary + confirm
  const summary = await renderSummary(ctx, d);
  await upsertMain(ctx, userId, summary, kbConfirm());
  await deletePrompt(ctx, userId);
}

async function redraw(ctx, userId) {
  const st = await getState(userId);
  const state = st.state;
  const d = st.data;

  // minimal redraw based on missing fields
  if (state === "cand_pick") return startCandidate(ctx);
  await nextStep(ctx, userId);
}

async function rejectAndClose(ctx, userId, appId, text) {
  await q("update applications set status='rejected' where id=$1", [appId]);
  await clearState(userId);
  await upsertMain(ctx, userId, text, null);
  await deletePrompt(ctx, userId);
}

async function finalizeAndSend(ctx, userId, d) {
  // save to DB
  await q(
    `update applications
     set phone=$1, age=$2, experience=$3, shift=$4, start_pref=$5, license=$6, alcohol=$7
     where id=$8`,
    [
      d.phone || null,
      d.age || null,
      d.experience || null,
      d.shift || null,
      d.start_pref || null,
      d.license || null,
      d.alcohol || null,
      d.appId,
    ],
  );

  // notify admins
  const adminIds = (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const app = await q("select * from applications where id=$1", [d.appId]);
  const a = app.rows[0];

  const maps = {
    exp: { 0: "0", 1: "1 yil", "2p": "2+ yil" },
    shift: { day: "Kunduz", night: "Kech", any: "Farqi yo‘q" },
    start: { today: "Bugun", tomorrow: "Ertaga", week: "1 hafta ichida" },
    license: { bc: "B + C", only_b: "Faqat B", other: "Boshqa/Yo‘q" },
    alcohol: { no: "Ichmayman", yes: "Ichaman" },
  };

  const adminMsg =
    `🧾 Ariza (${d.vac_button})\n` +
    `— Ism: ${a.full_name || d.name || "-"}\n` +
    `— Telefon: ${a.phone || d.phone || "-"}\n` +
    (a.age ? `— Yosh: ${a.age}\n` : "") +
    `— Tajriba: ${maps.exp[a.experience] || a.experience || "-"}\n` +
    `— Grafik: ${maps.shift[a.shift] || a.shift || "-"}\n` +
    `— Qachondan: ${maps.start[a.start_pref] || a.start_pref || "-"}\n` +
    (a.license
      ? `— Guvohnoma: ${maps.license[a.license] || a.license}\n`
      : "") +
    (a.alcohol ? `— Alkogol: ${maps.alcohol[a.alcohol] || a.alcohol}\n` : "") +
    `— Username: ${a.username ? "@" + a.username : "-"}\n` +
    `— UserID: ${a.user_id}\n`;

  // lazy import to avoid circular: kbStatus in admin part is in keyboards
  const { kbStatus } = await import("./keyboards.js");

  for (const adm of adminIds) {
    await ctx.api.sendMessage(adm, adminMsg, {
      reply_markup: kbStatus(d.appId),
    });
  }

  await clearState(userId);
  await deletePrompt(ctx, userId);
  await upsertMain(
    ctx,
    userId,
    "Rahmat! Arizangiz qabul qilindi ✅\nTez orada bog‘lanamiz.",
    null,
  );
}
