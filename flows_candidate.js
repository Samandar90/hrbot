// flows_candidate.js (FINAL)
import { q, setState, getState, clearState } from "./db.js";
import {
  kbVacancies,
  kbYesNo,
  kbChoice,
  kbCandidateNav,
  kbRequestContact,
  kbRemoveReply,
} from "./keyboards.js";

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

async function getQuestions(vacId) {
  const r = await q(
    `select id, q_type, text, options, correct_answer, points, is_scored, required
     from vacancy_questions
     where vacancy_id=$1
     order by sort asc, id asc`,
    [vacId],
  );
  return r.rows;
}

async function createApplication(ctx, vacId) {
  const userId = ctx.from.id;
  const app = await q(
    `insert into applications(vacancy_id,user_id,username,full_name,status)
     values($1,$2,$3,$4,'draft') returning id`,
    [
      vacId,
      userId,
      ctx.from.username || "",
      `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim(),
    ],
  );
  return app.rows[0].id;
}

function normAnswer(x) {
  return String(x ?? "")
    .trim()
    .toLowerCase();
}

function checkCorrect(qn, answer) {
  if (!qn.is_scored) return { is_correct: null, points: 0 };
  if (qn.correct_answer === null || qn.correct_answer === undefined) {
    return { is_correct: null, points: 0 }; // без автопроверки
  }

  const ca = qn.correct_answer; // jsonb: может быть строкой/числом/массивом
  const a = normAnswer(answer);

  // allow exact match for primitives
  if (
    typeof ca === "string" ||
    typeof ca === "number" ||
    typeof ca === "boolean"
  ) {
    const ok = normAnswer(ca) === a;
    return { is_correct: ok, points: ok ? Number(qn.points || 1) : 0 };
  }

  // array of accepted answers
  if (Array.isArray(ca)) {
    const ok = ca.map(normAnswer).includes(a);
    return { is_correct: ok, points: ok ? Number(qn.points || 1) : 0 };
  }

  // fallback
  return { is_correct: null, points: 0 };
}

export async function startCandidate(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await clearState(userId);

  const vacs = await getActiveVacancies();
  if (!vacs.length) {
    await ctx.reply("Hozircha bo‘sh ish o‘rinlari yo‘q.");
    return;
  }

  await setState(userId, "cand_pick", {});
  await ctx.reply("Assalomu alaykum!\nVakansiyani tanlang:", {
    reply_markup: kbVacancies(vacs),
  });
}

export async function handleCandidateCallbacks(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cb = ctx.callbackQuery?.data || "";
  const st = await getState(userId);
  const state = st?.state || "idle";
  const data = st?.data || {};

  if (cb === "cand:info") {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "📌 Ma’lumot:\n\nAriza bosqichma-bosqich to‘ldiriladi.\nTelefon raqamni “📱 Raqamni yuborish” tugmasi bilan yuborasiz.",
      { reply_markup: kbCandidateNav() },
    );
    return;
  }

  if (cb === "cand:restart") {
    await ctx.answerCallbackQuery();
    await startCandidate(ctx);
    return;
  }

  if (cb === "cand:back") {
    await ctx.answerCallbackQuery();
    // простая логика: назад = заново
    await startCandidate(ctx);
    return;
  }

  if (cb.startsWith("cand:vac:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(cb.split(":")[2]);
    const vac = await getVacancy(vacId);
    if (!vac || !vac.is_active) {
      await ctx.reply("Bu vakansiya hozir faol emas.");
      return;
    }

    const qs = await getQuestions(vacId);
    const appId = await createApplication(ctx, vacId);

    const payload = {
      vacId,
      vacButton: vac.button_text,
      appId,
      step: 0,
      questions: qs,
      name: "",
      phone: "",
      score_total: 0,
      score_correct: 0,
      score_wrong: 0,
    };

    await setState(userId, "cand_wait_name", payload);
    await ctx.reply(`Tanlandi: ${vac.button_text}\n\nIsmingizni yozing:`, {
      reply_markup: kbCandidateNav(),
    });
    return;
  }

  if (cb.startsWith("cand:ans:")) {
    await ctx.answerCallbackQuery();
    if (state !== "cand_wait_choice") return;

    const answer = cb.slice("cand:ans:".length);
    await processAnswer(ctx, answer);
    return;
  }
}

export async function handleCandidateMessages(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const st = await getState(userId);
  const state = st?.state || "idle";
  const data = st?.data || {};

  // navigation with text (reply keyboard)
  const text = (ctx.message?.text || "").trim();
  if (text === "🔄 Qayta") {
    await startCandidate(ctx);
    return;
  }

  if (state === "cand_wait_name") {
    if (!text || text.length < 2) {
      await ctx.reply("Ismni to‘g‘ri yozing (kamida 2 harf).");
      return;
    }
    data.name = text;

    await q("update applications set name=$1 where id=$2", [
      data.name,
      data.appId,
    ]);

    await setState(userId, "cand_wait_contact", data);
    await ctx.reply("Telefon raqamingizni yuboring:", {
      reply_markup: kbRequestContact(),
    });
    return;
  }

  if (state === "cand_wait_contact") {
    const contact = ctx.message?.contact;
    if (!contact?.phone_number) {
      await ctx.reply("Iltimos, “📱 Raqamni yuborish” tugmasini bosing.", {
        reply_markup: kbRequestContact(),
      });
      return;
    }

    const phone = contact.phone_number.startsWith("+")
      ? contact.phone_number
      : `+${contact.phone_number}`;

    data.phone = phone;

    await q("update applications set phone=$1 where id=$2", [
      data.phone,
      data.appId,
    ]);

    await ctx.reply("✅ Qabul qilindi.", { reply_markup: kbRemoveReply() });

    // start questions
    await setState(userId, "cand_asking", data);
    await askNext(ctx);
    return;
  }

  if (state === "cand_wait_text") {
    await processAnswer(ctx, text);
    return;
  }

  if (state === "cand_wait_number") {
    const n = Number(text);
    if (!Number.isFinite(n)) {
      await ctx.reply("Iltimos, raqam kiriting.");
      return;
    }
    await processAnswer(ctx, String(n));
    return;
  }

  if (state === "cand_wait_phone") {
    // phone question uses contact too, but if typed we accept
    if (!text) {
      await ctx.reply("Telefon raqamni kiriting.");
      return;
    }
    await processAnswer(ctx, text);
    return;
  }
}

async function askNext(ctx) {
  const userId = ctx.from.id;
  const st = await getState(userId);
  const data = st.data;

  const qs = data.questions || [];
  const i = Number(data.step || 0);

  if (i >= qs.length) {
    await finalize(ctx, data);
    return;
  }

  const qn = qs[i];
  const header = `Savol ${i + 1}/${qs.length}\n\n${qn.text}`;

  // types
  if (qn.q_type === "yesno") {
    await setState(userId, "cand_wait_choice", data);
    await ctx.reply(header, { reply_markup: kbYesNo() });
    return;
  }

  if (qn.q_type === "choice") {
    await setState(userId, "cand_wait_choice", data);
    await ctx.reply(header, { reply_markup: kbChoice(qn.options || []) });
    return;
  }

  if (qn.q_type === "number") {
    await setState(userId, "cand_wait_number", data);
    await ctx.reply(header, { reply_markup: kbCandidateNav() });
    return;
  }

  if (qn.q_type === "phone") {
    await setState(userId, "cand_wait_phone", data);
    await ctx.reply(header, { reply_markup: kbCandidateNav() });
    return;
  }

  // default text
  await setState(userId, "cand_wait_text", data);
  await ctx.reply(header, { reply_markup: kbCandidateNav() });
}

async function processAnswer(ctx, answer) {
  const userId = ctx.from.id;
  const st = await getState(userId);
  const data = st.data;

  const qs = data.questions || [];
  const i = Number(data.step || 0);
  const qn = qs[i];
  if (!qn) {
    await startCandidate(ctx);
    return;
  }

  // auto-check (if correct_answer provided)
  const chk = checkCorrect(qn, answer);

  // store answer
  await q(
    `insert into application_answers(application_id, question_id, answer, is_correct, points)
     values($1,$2,$3,$4,$5)
     on conflict (application_id, question_id)
     do update set answer=excluded.answer, is_correct=excluded.is_correct, points=excluded.points`,
    [data.appId, qn.id, String(answer), chk.is_correct, chk.points],
  );

  // update scoring in memory + db
  if (chk.is_correct === true) {
    data.score_correct += 1;
    data.score_total += chk.points;
  } else if (chk.is_correct === false) {
    data.score_wrong += 1;
  }

  data.step = i + 1;

  await setState(userId, "cand_asking", data);
  await askNext(ctx);
}

async function finalize(ctx, data) {
  // mark application
  await q(
    `update applications
     set status='new',
         score_total=$1,
         score_correct=$2,
         score_wrong=$3,
         finished_at=now()
     where id=$4`,
    [data.score_total, data.score_correct, data.score_wrong, data.appId],
  );

  // build admin message with answers
  const ans = await q(
    `select vq.text, vq.q_type, aa.answer, aa.is_correct, aa.points
     from application_answers aa
     join vacancy_questions vq on vq.id=aa.question_id
     where aa.application_id=$1
     order by vq.sort asc, vq.id asc`,
    [data.appId],
  );

  let msg =
    `🧾 Ariza (${data.vacButton})\n` +
    `— Ism: ${data.name || "-"}\n` +
    `— Telefon: ${data.phone || "-"}\n` +
    `— Username: ${ctx.from.username ? "@" + ctx.from.username : "-"}\n` +
    `— UserID: ${ctx.from.id}\n\n` +
    `📊 Natija:\n` +
    `— To‘g‘ri: ${data.score_correct}\n` +
    `— Noto‘g‘ri: ${data.score_wrong}\n` +
    `— Ball: ${data.score_total}\n\n` +
    `🧩 Javoblar:\n`;

  for (const r of ans.rows) {
    const mark =
      r.is_correct === true ? "✅" : r.is_correct === false ? "❌" : "🕓";
    msg += `${mark} ${r.text}\n→ ${r.answer}\n\n`;
  }

  const adminIds = (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // lazy import to avoid cycle
  const { kbAppRow } = await import("./keyboards.js");

  for (const adm of adminIds) {
    await ctx.api.sendMessage(adm, msg, { reply_markup: kbAppRow(data.appId) });
  }

  await clearState(ctx.from.id);
  await ctx.reply("Rahmat! Arizangiz qabul qilindi ✅\nTez orada bog‘lanamiz.");
}
