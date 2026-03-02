// flows_candidate.js (PRO+ - CLEAN CHAT, NO DEFAULT QUESTIONS, NO DUPES)
import { q, setState, getState, clearState } from "./db.js";
import {
  kbVacancies,
  kbStatus,
  kbChoice,
  kbYesNoSimple,
  kbBackRestart,
  kbLicense,
  kbAlcohol,
} from "./keyboards.js";

/* =========================
   Helpers
========================= */
function normalizeOptions(value) {
  // pg jsonb usually becomes object/array, but sometimes string
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

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

async function getQuestions(vacId) {
  const r = await q(
    "select id, q_type, text, options from vacancy_questions where vacancy_id=$1 order by sort asc, id asc",
    [vacId],
  );
  return r.rows;
}

/* =========================
   Clean chat engine
========================= */
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

async function safeDelete(ctx, chatId, messageId) {
  if (!chatId || !messageId) return;
  try {
    await ctx.api.deleteMessage(chatId, messageId);
  } catch (_) {}
}

async function deletePromptIfAny(ctx, userId) {
  const chatId = ctx.chat?.id;
  const ui = await getUi(userId);
  if (ui.prompt_mid) {
    await safeDelete(ctx, chatId, ui.prompt_mid);
    await setUi(userId, { prompt_mid: null });
  }
}

async function upsertMain(ctx, userId, text, reply_markup) {
  const chatId = ctx.chat?.id;
  const ui = await getUi(userId);

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

async function sendPrompt(ctx, userId, text, reply_markup) {
  const chatId = ctx.chat?.id;
  const ui = await getUi(userId);

  if (ui.prompt_mid) await safeDelete(ctx, chatId, ui.prompt_mid);

  const m = await ctx.api.sendMessage(chatId, text, { reply_markup });
  await setUi(userId, { prompt_mid: m.message_id });
  return m.message_id;
}

/* =========================
   Public API
========================= */
export async function startCandidate(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const vacs = await getActiveVacancies();
  await clearState(userId);

  if (!vacs.length) {
    await upsertMain(ctx, userId, "Hozircha bo‘sh ish o‘rinlari yo‘q.", null);
    return;
  }

  await setState(userId, "cand_pick_vacancy", {
    ui: {},
    started_at: Date.now(),
  });

  await upsertMain(
    ctx,
    userId,
    "Assalomu alaykum!\nIshga ariza topshirish uchun yo‘nalishni tanlang:",
    kbVacancies(vacs),
  );

  await deletePromptIfAny(ctx, userId);
}

/* =========================
   Callbacks
========================= */
export async function handleCandidateCallbacks(ctx) {
  const data = ctx.callbackQuery?.data || "";
  const userId = ctx.from?.id;
  if (!userId) return;

  // Admin status buttons (admin chat)
  if (data.startsWith("st:")) {
    const [, appIdStr, st] = data.split(":");
    const appId = Number(appIdStr);
    await q("update applications set status=$1 where id=$2", [st, appId]);
    await ctx.answerCallbackQuery({ text: "Saqlangan" });
    return;
  }

  // Candidate controls
  if (data === "cand:restart") {
    await ctx.answerCallbackQuery();
    await startCandidate(ctx);
    return;
  }

  if (data === "cand:back") {
    await ctx.answerCallbackQuery();
    await startCandidate(ctx);
    return;
  }

  // Pick vacancy
  if (data.startsWith("vac:")) {
    const vacId = Number(data.split(":")[1]);
    const vac = await getVacancy(vacId);

    if (!vac || !vac.is_active) {
      await ctx.answerCallbackQuery({ text: "Bu vakansiya hozir faol emas." });
      return;
    }

    await ctx.answerCallbackQuery();

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

    const payload = {
      vacId,
      appId,
      age: null,
      filtersResp: {},
      qIndex: 0,
      questions: [],
      ui: (await getUi(userId)) || {},
    };

    await setState(userId, "cand_filters", payload);

    await upsertMain(
      ctx,
      userId,
      `Tanlandi: ${vac.button_text}\n\nDavom etamiz ✅`,
      kbBackRestart(),
    );

    await continueFilters(ctx);
    return;
  }

  // answers (yes/no or choice)
  if (data.startsWith("ans:")) {
    const value = data.slice(4);
    await ctx.answerCallbackQuery();

    const st = await getState(userId);
    if (!st || st.state !== "cand_wait_choice") return;

    await processAnswer(ctx, value);
    return;
  }

  // filter responses
  if (data.startsWith("fresp:")) {
    await ctx.answerCallbackQuery();

    const st = await getState(userId);
    if (!st || st.state !== "cand_filters") return;

    const [, key, value] = data.split(":");
    const payload = st.data;
    payload.filtersResp = payload.filtersResp || {};
    payload.filtersResp[key] = value;

    await setState(userId, "cand_filters", payload);
    await continueFilters(ctx);
    return;
  }
}

/* =========================
   Text Messages
========================= */
export async function handleCandidateMessages(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const st = await getState(userId);
  if (!st || st.state === "idle") return;

  const text = ctx.message?.text?.trim();
  if (!text) return;

  if (st.state === "cand_wait_age") {
    const age = Number(text);
    if (!Number.isFinite(age)) {
      await sendPrompt(
        ctx,
        userId,
        "Iltimos, yoshni raqam bilan yozing.",
        kbBackRestart(),
      );
      return;
    }

    const payload = st.data;
    payload.age = age;

    await setState(userId, "cand_filters", payload);
    await continueFilters(ctx);
    return;
  }

  if (st.state === "cand_wait_text") {
    await processAnswer(ctx, text);
    return;
  }
}

/* =========================
   Filters -> Questions
========================= */
async function continueFilters(ctx) {
  const userId = ctx.from.id;
  const st = await getState(userId);
  const payload = st.data;

  const { vacId, appId } = payload;
  const filters = await getFilters(vacId);

  const ageFilter = filters.find((f) => f.type === "age_range");
  if (ageFilter && (payload.age === null || payload.age === undefined)) {
    await setState(userId, "cand_wait_age", payload);
    await sendPrompt(
      ctx,
      userId,
      "Yoshingiz nechida? (raqam)",
      kbBackRestart(),
    );
    return;
  }

  if (ageFilter) {
    const min = ageFilter.config?.min ?? 18;
    const max = ageFilter.config?.max ?? 30;
    const age = Number(payload.age);

    if (!Number.isFinite(age) || age < min || age > max) {
      await rejectAndClose(
        ctx,
        appId,
        "Rahmat! Afsuski, yosh bo‘yicha mos emassiz.",
      );
      return;
    }
  }

  const needLicense = filters.some((f) => f.type === "license_bc");
  const needNoAlcohol = filters.some((f) => f.type === "no_alcohol");
  payload.filtersResp = payload.filtersResp || {};

  if (needLicense && !payload.filtersResp.license) {
    await setState(userId, "cand_filters", payload);
    await sendPrompt(
      ctx,
      userId,
      "Haydovchilik guvohnomangiz qaysi toifada? (B va C shart)",
      kbLicense(),
    );
    return;
  }

  if (needLicense && payload.filtersResp.license !== "bc") {
    await rejectAndClose(ctx, appId, "B va C toifalari kerak.");
    return;
  }

  if (needNoAlcohol && !payload.filtersResp.alcohol) {
    await setState(userId, "cand_filters", payload);
    await sendPrompt(ctx, userId, "Alkogol ichasizmi?", kbAlcohol());
    return;
  }

  if (needNoAlcohol && payload.filtersResp.alcohol !== "no") {
    await rejectAndClose(ctx, appId, "Bu ish uchun alkogol ichmaslik shart.");
    return;
  }

  const qs = await getQuestions(vacId);
  payload.questions = (qs || []).map((x) => ({
    id: x.id,
    q_type: x.q_type,
    text: x.text,
    options: normalizeOptions(x.options),
  }));
  payload.qIndex = 0;

  await setState(userId, "cand_asking", payload);
  await askNext(ctx);
}

async function askNext(ctx) {
  const userId = ctx.from.id;
  const st = await getState(userId);
  const payload = st.data;

  const { qIndex, questions } = payload;

  if (!questions || qIndex >= questions.length) {
    await finalizeApplication(ctx, payload);
    await clearState(userId);

    await deletePromptIfAny(ctx, userId);
    await upsertMain(
      ctx,
      userId,
      "Rahmat! Arizangiz qabul qilindi ✅\nTez orada bog‘lanamiz.",
      null,
    );
    return;
  }

  const qn = questions[qIndex];
  const total = questions.length;

  await upsertMain(
    ctx,
    userId,
    `Savol ${qIndex + 1}/${total}\n\n${qn.text}`,
    kbBackRestart(),
  );

  if (qn.q_type === "yesno") {
    await setState(userId, "cand_wait_choice", payload);
    await sendPrompt(ctx, userId, "Tanlang:", kbYesNoSimple());
    return;
  }

  if (qn.q_type === "choice") {
    await setState(userId, "cand_wait_choice", payload);
    await sendPrompt(
      ctx,
      userId,
      "Variantni tanlang:",
      kbChoice(qn.options || []),
    );
    return;
  }

  await setState(userId, "cand_wait_text", payload);
  await sendPrompt(ctx, userId, "Javobingizni yozing:", kbBackRestart());
}

async function processAnswer(ctx, answer) {
  const userId = ctx.from.id;
  const st = await getState(userId);
  const payload = st.data;

  const qn = payload.questions?.[payload.qIndex];
  if (!qn) {
    await clearState(userId);
    await startCandidate(ctx);
    return;
  }

  // NO DUPES: update if already exists
  await q(
    `insert into application_answers(application_id, question_id, answer)
     values($1,$2,$3)
     on conflict (application_id, question_id)
     do update set answer=excluded.answer`,
    [payload.appId, qn.id, String(answer)],
  );

  payload.qIndex += 1;
  await setState(userId, "cand_asking", payload);
  await askNext(ctx);
}

async function rejectAndClose(ctx, appId, text) {
  const userId = ctx.from.id;
  await q("update applications set status='rejected' where id=$1", [appId]);
  await clearState(userId);

  await deletePromptIfAny(ctx, userId);
  await upsertMain(
    ctx,
    userId,
    text || "Rahmat! Afsuski, talablarimizga mos kelmadingiz. Omad tilaymiz.",
    null,
  );
}

async function finalizeApplication(ctx, payload) {
  const adminIds = (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const vac = await q("select title from vacancies where id=$1", [
    payload.vacId,
  ]);
  const title = vac.rowCount ? vac.rows[0].title : "Vakansiya";

  const app = await q("select * from applications where id=$1", [
    payload.appId,
  ]);
  const a = app.rows[0];

  const answers = await q(
    `select vq.text, aa.answer
     from application_answers aa
     join vacancy_questions vq on vq.id=aa.question_id
     where aa.application_id=$1
     order by vq.sort asc, vq.id asc`,
    [payload.appId],
  );

  let msg =
    `🧾 Ariza (${title})\n` +
    `— Ism: ${a.full_name || "-"}\n` +
    `— Username: ${a.username ? "@" + a.username : "-"}\n` +
    `— UserID: ${a.user_id}\n` +
    (payload.age !== null && payload.age !== undefined
      ? `— Yosh: ${payload.age}\n`
      : "") +
    `— Status: new\n\n`;

  for (const row of answers.rows) {
    msg += `• ${row.text}\n  → ${row.answer}\n`;
  }

  for (const adm of adminIds) {
    await ctx.api.sendMessage(adm, msg, {
      reply_markup: kbStatus(payload.appId),
    });
  }
}
