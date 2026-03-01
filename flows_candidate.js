import { q, setState, getState, clearState } from "./db.js";
import { kbVacancies, kbYesNo, kbStatus } from "./keyboards.js";
import { InlineKeyboard } from "grammy";

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
    "select * from vacancy_questions where vacancy_id=$1 order by sort asc, id asc",
    [vacId],
  );
  return r.rows;
}

export async function startCandidate(ctx) {
  const vacs = await getActiveVacancies();
  if (!vacs.length) return ctx.reply("Hozircha bo‘sh ish o‘rinlari yo‘q.");
  await clearState(ctx.from.id);
  await ctx.reply(
    "Assalomu alaykum! Ishga ariza topshirish uchun yo‘nalishni tanlang:",
    { reply_markup: kbVacancies(vacs) },
  );
}

export async function handleCandidateCallbacks(ctx) {
  const data = ctx.callbackQuery?.data || "";
  const userId = ctx.from?.id;
  if (!userId) return;

  // Выбор вакансии
  if (data.startsWith("vac:")) {
    const vacId = Number(data.split(":")[1]);
    const vac = await getVacancy(vacId);
    if (!vac || !vac.is_active) {
      await ctx.answerCallbackQuery({ text: "Bu vakansiya hozir faol emas." });
      return;
    }

    // создаем application
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

    await setState(userId, "cand_filter_age", {
      vacId,
      appId,
      step: 0,
      answers: {},
    });
    await ctx.answerCallbackQuery();
    await ctx.api.sendMessage(
      userId,
      "Yaxshi. Endi bir nechta savollarga javob bering.\n\nYoshingiz nechida? (raqam)",
    );
    return;
  }

  // status buttons in admin chat
  if (data.startsWith("st:")) {
    const [, appIdStr, st] = data.split(":");
    const appId = Number(appIdStr);
    await q("update applications set status=$1 where id=$2", [st, appId]);
    await ctx.answerCallbackQuery({ text: "Saqlangan" });
    return;
  }

  // Candidate answers for yes/no or choice in inline mode
  if (data.startsWith("ans:")) {
    const [, value] = data.split(":"); // ans:Ha etc
    await ctx.answerCallbackQuery();

    const st = await getState(userId);
    if (st.state !== "cand_wait_choice") return;

    await processAnswer(ctx, value);
  }

  // фильтры license/alcohol callbacks
  if (data.startsWith("fresp:")) {
    const [, key, value] = data.split(":"); // fresp:alcohol:yes/no or fresp:license:bc/other
    await ctx.answerCallbackQuery();

    const st = await getState(userId);
    if (st.state !== "cand_filters_extra") return;

    const payload = st.data;
    payload.filtersResp = payload.filtersResp || {};
    payload.filtersResp[key] = value;
    await setState(userId, "cand_filters_extra", payload);

    await continueFilters(ctx, payload);
  }
}

export async function handleCandidateMessages(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const st = await getState(userId);
  if (!st || st.state === "idle") return;

  const text = ctx.message?.text?.trim();
  if (!text) return;

  if (st.state === "cand_filter_age") {
    const age = Number(text);
    if (!Number.isFinite(age))
      return ctx.reply("Iltimos, yoshni raqam bilan yozing.");
    const payload = st.data;
    payload.age = age;
    await setState(userId, "cand_filters_extra", payload);
    await continueFilters(ctx, payload);
    return;
  }

  if (st.state === "cand_wait_text") {
    await processAnswer(ctx, text);
    return;
  }
}

async function continueFilters(ctx, payload) {
  const { vacId, appId, age } = payload;
  const filters = await getFilters(vacId);

  // age_range filter (если есть)
  for (const f of filters) {
    if (f.type === "age_range") {
      const min = f.config?.min ?? 18;
      const max = f.config?.max ?? 30;
      if (age < min || age > max) {
        await rejectAndClose(
          ctx,
          appId,
          f.config?.fail_text || "Rahmat! Afsuski, talabga mos emassiz.",
        );
        return;
      }
    }
  }

  // если нужны доп-фильтры для доставщика
  const needLicense = filters.some((f) => f.type === "license_bc");
  const needNoAlcohol = filters.some((f) => f.type === "no_alcohol");
  payload.filtersResp = payload.filtersResp || {};

  if (needLicense && !payload.filtersResp.license) {
    const kb = new InlineKeyboard()
      .text("B va C", "fresp:license:bc")
      .row()
      .text("Faqat B", "fresp:license:only_b")
      .row()
      .text("B yo‘q / Boshqa", "fresp:license:other");
    await ctx.api.sendMessage(
      ctx.from.id,
      "Haydovchilik guvohnomangiz qaysi toifada? (B va C shart)",
      { reply_markup: kb },
    );
    return;
  }

  if (needLicense && payload.filtersResp.license !== "bc") {
    const f = filters.find((x) => x.type === "license_bc");
    await rejectAndClose(
      ctx,
      appId,
      f?.config?.fail_text || "Rahmat! Afsuski, B va C toifalari shart.",
    );
    return;
  }

  if (needNoAlcohol && !payload.filtersResp.alcohol) {
    const kb = new InlineKeyboard()
      .text("Yo‘q, ichmayman", "fresp:alcohol:no")
      .text("Ha", "fresp:alcohol:yes");
    await ctx.api.sendMessage(ctx.from.id, "Alkogol ichasizmi?", {
      reply_markup: kb,
    });
    return;
  }

  if (needNoAlcohol && payload.filtersResp.alcohol !== "no") {
    const f = filters.find((x) => x.type === "no_alcohol");
    await rejectAndClose(
      ctx,
      appId,
      f?.config?.fail_text || "Rahmat! Afsuski, alkogol ichmaslik shart.",
    );
    return;
  }

  // filters passed -> start questions
  payload.qIndex = 0;
  const qs = await getQuestions(vacId);
  payload.questions = qs.map((q) => ({
    id: q.id,
    q_type: q.q_type,
    text: q.text,
    options: q.options,
  }));
  await setState(ctx.from.id, "cand_asking", payload);
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
    await ctx.reply("Rahmat! Arizangiz qabul qilindi. Tez orada bog‘lanamiz.");
    return;
  }

  const qn = questions[qIndex];

  if (qn.q_type === "yesno") {
    // inline
    const kb = new InlineKeyboard()
      .text("Ha", "ans:Ha")
      .text("Yo‘q", "ans:Yo‘q");
    await setState(userId, "cand_wait_choice", payload);
    await ctx.api.sendMessage(userId, qn.text, { reply_markup: kb });
    return;
  }

  if (qn.q_type === "choice") {
    const kb = new InlineKeyboard();
    for (const opt of qn.options || [])
      kb.text(String(opt), `ans:${String(opt)}`).row();
    await setState(userId, "cand_wait_choice", payload);
    await ctx.api.sendMessage(userId, qn.text, { reply_markup: kb });
    return;
  }

  // text/number/phone -> plain text
  await setState(userId, "cand_wait_text", payload);
  await ctx.api.sendMessage(userId, qn.text);
}

async function processAnswer(ctx, answer) {
  const userId = ctx.from.id;
  const st = await getState(userId);
  const payload = st.data;

  const qn = payload.questions[payload.qIndex];
  // save answer in DB
  await q(
    "insert into application_answers(application_id, question_id, answer) values($1,$2,$3)",
    [payload.appId, qn.id, String(answer)],
  );

  payload.qIndex += 1;
  await setState(userId, "cand_asking", payload);
  await askNext(ctx);
}

async function rejectAndClose(ctx, appId, text) {
  await q("update applications set status='rejected' where id=$1", [appId]);
  await clearState(ctx.from.id);
  await ctx.reply(
    text || "Rahmat! Afsuski, talablarimizga mos kelmadingiz. Omad tilaymiz.",
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
    `— Yosh: ${payload.age ?? "-"}\n\n`;

  for (const row of answers.rows) {
    msg += `• ${row.text}\n  → ${row.answer}\n`;
  }

  for (const adm of adminIds) {
    await ctx.api.sendMessage(adm, msg, {
      reply_markup: kbStatus(payload.appId),
    });
  }
}
