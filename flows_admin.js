// flows_admin.js (FINAL)
import { q, getState, setState, clearState, isAdmin } from "./db.js";
import {
  kbAdminHome,
  kbVacRow,
  kbQuestionsHome,
  kbQuestionRow,
  kbPickQType,
  kbAppsPager,
  kbAppRow,
} from "./keyboards.js";

function mustAdmin(ctx) {
  const uid = ctx.from?.id;
  if (!uid || !isAdmin(uid)) {
    ctx.reply("Kechirasiz, bu bo‘lim faqat admin uchun.");
    return false;
  }
  return true;
}

async function getVacanciesAll() {
  const r = await q(
    "select id,title,button_text,is_active from vacancies order by id desc",
  );
  return r.rows;
}

async function getVacancy(vacId) {
  const r = await q("select * from vacancies where id=$1", [vacId]);
  return r.rowCount ? r.rows[0] : null;
}

async function getQuestions(vacId) {
  const r = await q(
    `select id, sort, q_type, text, options, correct_answer, points, is_scored
     from vacancy_questions
     where vacancy_id=$1
     order by sort asc, id asc`,
    [vacId],
  );
  return r.rows;
}

export async function adminStart(ctx) {
  if (!mustAdmin(ctx)) return;
  await ctx.reply("Admin panel:", { reply_markup: kbAdminHome() });
}

export async function handleAdminCallbacks(ctx) {
  if (!mustAdmin(ctx)) return;

  const cb = ctx.callbackQuery?.data || "";
  const uid = ctx.from.id;

  if (cb === "adm:home") {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Admin panel:", { reply_markup: kbAdminHome() });
    return;
  }

  // ===== Vacancies =====
  if (cb === "adm:vac:list") {
    await ctx.answerCallbackQuery();
    const vacs = await getVacanciesAll();
    if (!vacs.length) {
      await ctx.editMessageText("Hozircha vakansiya yo‘q.", {
        reply_markup: kbAdminHome(),
      });
      return;
    }
    // show first list message
    let text = "Vakansiyalar:\n\n";
    for (const v of vacs) {
      text += `#${v.id} — ${v.title} (${v.is_active ? "ON" : "OFF"})\n`;
    }
    await ctx.editMessageText(text, { reply_markup: kbAdminHome() });
    // also send individual controls for each vacancy
    for (const v of vacs) {
      await ctx.api.sendMessage(
        ctx.chat.id,
        `#${v.id} — ${v.title}\nButton: ${v.button_text}\nHolat: ${v.is_active ? "ON ✅" : "OFF ⛔"}`,
        { reply_markup: kbVacRow(v) },
      );
    }
    return;
  }

  if (cb === "adm:vac:new") {
    await ctx.answerCallbackQuery();
    await setState(uid, "adm_vac_new_title", {});
    await ctx.api.sendMessage(
      ctx.chat.id,
      "Yangi vakansiya nomini yozing (misol: Sotuvchi):",
    );
    return;
  }

  if (cb.startsWith("adm:vac:open:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(cb.split(":")[3]);
    const v = await getVacancy(vacId);
    if (!v) return ctx.api.sendMessage(ctx.chat.id, "Topilmadi.");
    await ctx.api.sendMessage(
      ctx.chat.id,
      `#${v.id} — ${v.title}\nButton: ${v.button_text}\nHolat: ${v.is_active ? "ON ✅" : "OFF ⛔"}`,
      { reply_markup: kbVacRow(v) },
    );
    return;
  }

  if (cb.startsWith("adm:vac:toggle:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(cb.split(":")[3]);
    const v = await getVacancy(vacId);
    if (!v) return;

    await q("update vacancies set is_active=$1 where id=$2", [
      !v.is_active,
      vacId,
    ]);
    const v2 = await getVacancy(vacId);
    await ctx.editMessageText(
      `#${v2.id} — ${v2.title}\nButton: ${v2.button_text}\nHolat: ${v2.is_active ? "ON ✅" : "OFF ⛔"}`,
      { reply_markup: kbVacRow(v2) },
    );
    return;
  }

  if (cb.startsWith("adm:vac:edit_title:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(cb.split(":")[3]);
    await setState(uid, "adm_vac_edit_title", { vacId });
    await ctx.api.sendMessage(ctx.chat.id, "Yangi nomni yozing:");
    return;
  }

  if (cb.startsWith("adm:vac:edit_btn:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(cb.split(":")[3]);
    await setState(uid, "adm_vac_edit_btn", { vacId });
    await ctx.api.sendMessage(
      ctx.chat.id,
      "Yangi button matnini yozing (misol: 🛒 Sotuvchi):",
    );
    return;
  }

  if (cb.startsWith("adm:vac:delete:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(cb.split(":")[3]);

    // if has applications -> archive (OFF)
    const cnt = await q(
      "select count(*)::int as c from applications where vacancy_id=$1",
      [vacId],
    );
    if ((cnt.rows[0]?.c || 0) > 0) {
      await q("update vacancies set is_active=false where id=$1", [vacId]);
      await ctx.api.sendMessage(
        ctx.chat.id,
        "Bu vakansiyaga arizalar bor. To‘liq o‘chirish mumkin emas.\n✅ Vakansiya OFF qilindi (arxiv).",
      );
      return;
    }

    await q("delete from vacancies where id=$1", [vacId]);
    await ctx.api.sendMessage(ctx.chat.id, "✅ Vakansiya o‘chirildi.");
    return;
  }

  // ===== Questions =====
  if (cb.startsWith("adm:q:list:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(cb.split(":")[3]);
    const v = await getVacancy(vacId);
    if (!v) return ctx.api.sendMessage(ctx.chat.id, "Topilmadi.");

    const qs = await getQuestions(vacId);
    let text = `Savollar — #${v.id} (${v.title})\n\n`;
    if (!qs.length) text += "Hozircha savollar yo‘q.\n";
    for (const x of qs) {
      text += `#${x.id} [${x.q_type}] sort=${x.sort} points=${x.points} ${x.is_scored ? "" : "(no-score)"}\n${x.text}\n\n`;
    }

    await ctx.api.sendMessage(ctx.chat.id, text, {
      reply_markup: kbQuestionsHome(vacId),
    });

    // send controls per question
    for (const x of qs) {
      await ctx.api.sendMessage(
        ctx.chat.id,
        `Savol #${x.id}\n[${x.q_type}] sort=${x.sort} points=${x.points}\n${x.text}`,
        { reply_markup: kbQuestionRow(vacId, x.id) },
      );
    }
    return;
  }

  if (cb.startsWith("adm:q:new:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(cb.split(":")[3]);
    await ctx.api.sendMessage(ctx.chat.id, "Savol turini tanlang:", {
      reply_markup: kbPickQType(vacId),
    });
    return;
  }

  if (cb.startsWith("adm:q:type:")) {
    await ctx.answerCallbackQuery();
    const [, , , vacIdStr, qtype] = cb.split(":"); // adm:q:type:vacId:qtype
    const vacId = Number(vacIdStr);
    await setState(uid, "adm_q_new_text", { vacId, qtype });
    await ctx.api.sendMessage(ctx.chat.id, "Savol matnini yozing:");
    return;
  }

  if (cb.startsWith("adm:q:delete:")) {
    await ctx.answerCallbackQuery();
    const [, , , vacIdStr, qidStr] = cb.split(":");
    const vacId = Number(vacIdStr);
    const qid = Number(qidStr);
    await q("delete from vacancy_questions where id=$1 and vacancy_id=$2", [
      qid,
      vacId,
    ]);
    await ctx.api.sendMessage(ctx.chat.id, "✅ Savol o‘chirildi.");
    return;
  }

  if (cb.startsWith("adm:q:edit_text:")) {
    await ctx.answerCallbackQuery();
    const [, , , vacIdStr, qidStr] = cb.split(":");
    await setState(uid, "adm_q_edit_text", {
      vacId: Number(vacIdStr),
      qid: Number(qidStr),
    });
    await ctx.api.sendMessage(ctx.chat.id, "Yangi savol matnini yozing:");
    return;
  }

  if (cb.startsWith("adm:q:edit_sort:")) {
    await ctx.answerCallbackQuery();
    const [, , , vacIdStr, qidStr] = cb.split(":");
    await setState(uid, "adm_q_edit_sort", {
      vacId: Number(vacIdStr),
      qid: Number(qidStr),
    });
    await ctx.api.sendMessage(
      ctx.chat.id,
      "Yangi sort raqamini yozing (misol: 10, 20, 30):",
    );
    return;
  }

  if (cb.startsWith("adm:q:edit_correct:")) {
    await ctx.answerCallbackQuery();
    const [, , , vacIdStr, qidStr] = cb.split(":");
    await setState(uid, "adm_q_edit_correct", {
      vacId: Number(vacIdStr),
      qid: Number(qidStr),
    });
    await ctx.api.sendMessage(
      ctx.chat.id,
      "To‘g‘ri javobni yozing.\nChoice/YesNo uchun: aynan buttondagi matn.\nAgar autochek kerak bo‘lmasa: - (minus) yozing.",
    );
    return;
  }

  // ===== Applications =====
  if (cb.startsWith("adm:apps:list:")) {
    await ctx.answerCallbackQuery();
    const page = Number(cb.split(":")[3] || 0);
    const limit = 10;
    const offset = page * limit;

    const r = await q(
      `select a.id, a.status, a.score_total, a.score_correct, a.score_wrong, a.created_at,
              v.title as vac_title, a.name, a.phone
       from applications a
       join vacancies v on v.id=a.vacancy_id
       where a.status <> 'draft'
       order by a.id desc
       limit $1 offset $2`,
      [limit, offset],
    );

    let text = `Arizalar (page ${page + 1})\n\n`;
    if (!r.rowCount) text += "Hozircha ariza yo‘q.";
    for (const x of r.rows) {
      text +=
        `#${x.id} [${x.status}] ${x.vac_title}\n` +
        `— ${x.name || "-"} | ${x.phone || "-"}\n` +
        `— ✅${x.score_correct} ❌${x.score_wrong} | Ball: ${x.score_total}\n\n`;
    }

    await ctx.editMessageText(text, { reply_markup: kbAppsPager(page) });

    // send action cards
    for (const x of r.rows) {
      await ctx.api.sendMessage(
        ctx.chat.id,
        `Ariza #${x.id}\n${x.vac_title}\n— ${x.name || "-"} | ${x.phone || "-"}\n✅${x.score_correct} ❌${x.score_wrong} | Ball: ${x.score_total}\nStatus: ${x.status}`,
        { reply_markup: kbAppRow(x.id) },
      );
    }
    return;
  }

  if (cb.startsWith("adm:app:open:")) {
    await ctx.answerCallbackQuery();
    const appId = Number(cb.split(":")[3]);

    const app = await q(
      `select a.*, v.title as vac_title
       from applications a join vacancies v on v.id=a.vacancy_id
       where a.id=$1`,
      [appId],
    );
    if (!app.rowCount) return;

    const a = app.rows[0];
    const ans = await q(
      `select vq.text, aa.answer, aa.is_correct, aa.points
       from application_answers aa
       join vacancy_questions vq on vq.id=aa.question_id
       where aa.application_id=$1
       order by vq.sort asc, vq.id asc`,
      [appId],
    );

    let msg =
      `🧾 Ariza #${a.id} (${a.vac_title})\n` +
      `— Ism: ${a.name || "-"}\n` +
      `— Telefon: ${a.phone || "-"}\n` +
      `— Username: ${a.username ? "@" + a.username : "-"}\n` +
      `— UserID: ${a.user_id}\n\n` +
      `📊 Natija: ✅${a.score_correct} ❌${a.score_wrong} | Ball: ${a.score_total}\n` +
      `Status: ${a.status}\n\n`;

    for (const r of ans.rows) {
      const mark =
        r.is_correct === true ? "✅" : r.is_correct === false ? "❌" : "🕓";
      msg += `${mark} ${r.text}\n→ ${r.answer}\n\n`;
    }

    await ctx.api.sendMessage(ctx.chat.id, msg, {
      reply_markup: kbAppRow(appId),
    });
    return;
  }

  if (cb.startsWith("adm:app:st:")) {
    await ctx.answerCallbackQuery();
    const [, , , appIdStr, stt] = cb.split(":");
    const appId = Number(appIdStr);
    await q("update applications set status=$1 where id=$2", [stt, appId]);
    await ctx.api.sendMessage(ctx.chat.id, "✅ Saqlandi.");
    return;
  }

  if (cb.startsWith("adm:app:ask:")) {
    await ctx.answerCallbackQuery();
    const appId = Number(cb.split(":")[3]);
    await setState(uid, "adm_app_ask", { appId });
    await ctx.api.sendMessage(ctx.chat.id, "Nomzodga savol yozing (matn):");
    return;
  }
}

export async function handleAdminMessages(ctx) {
  if (!mustAdmin(ctx)) return;

  const uid = ctx.from.id;
  const text = (ctx.message?.text || "").trim();
  if (!text) return;

  const st = await getState(uid);
  const state = st.state;
  const data = st.data || {};

  // create vacancy
  if (state === "adm_vac_new_title") {
    await setState(uid, "adm_vac_new_btn", { title: text });
    await ctx.reply("Button matnini yozing (misol: 🛒 Sotuvchi):");
    return;
  }

  if (state === "adm_vac_new_btn") {
    const title = (data.title || "").trim();
    const btn = text;

    const r = await q(
      "insert into vacancies(title, button_text) values($1,$2) returning id",
      [title, btn],
    );
    await clearState(uid);
    await ctx.reply(`✅ Yaratildi. Vakansiya ID: ${r.rows[0].id}`);
    return;
  }

  // edit vacancy title
  if (state === "adm_vac_edit_title") {
    const vacId = Number(data.vacId);
    await q("update vacancies set title=$1 where id=$2", [text, vacId]);
    await clearState(uid);
    await ctx.reply("✅ Saqlandi.");
    return;
  }

  // edit vacancy button
  if (state === "adm_vac_edit_btn") {
    const vacId = Number(data.vacId);
    await q("update vacancies set button_text=$1 where id=$2", [text, vacId]);
    await clearState(uid);
    await ctx.reply("✅ Saqlandi.");
    return;
  }

  // new question: text
  if (state === "adm_q_new_text") {
    const { vacId, qtype } = data;
    const payload = { vacId, qtype, qtext: text };

    // for choice we need options
    if (qtype === "choice") {
      await setState(uid, "adm_q_new_choice_opts", payload);
      await ctx.reply("Variantlarni vergul bilan yozing (misol: A, B, C):");
      return;
    }

    // yesno default options
    if (qtype === "yesno") {
      const ins = await q(
        `insert into vacancy_questions(vacancy_id, q_type, text, options, correct_answer, points, is_scored, sort)
         values($1,$2,$3,'["Ha","Yo‘q"]'::jsonb, 'null'::jsonb, 1, true, 10)
         returning id`,
        [Number(vacId), "yesno", text],
      );
      await clearState(uid);
      await ctx.reply(
        `✅ Savol qo‘shildi. ID: ${ins.rows[0].id}\nTo‘g‘ri javob berish uchun “✅ Javob” ni tanlang.`,
      );
      return;
    }

    // text/number/phone
    const ins = await q(
      `insert into vacancy_questions(vacancy_id, q_type, text, options, correct_answer, points, is_scored, sort)
       values($1,$2,$3,'[]'::jsonb, 'null'::jsonb, 1, true, 10)
       returning id`,
      [Number(vacId), qtype, text],
    );
    await clearState(uid);
    await ctx.reply(`✅ Savol qo‘shildi. ID: ${ins.rows[0].id}`);
    return;
  }

  if (state === "adm_q_new_choice_opts") {
    const { vacId, qtype, qtext } = data;
    const opts = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (opts.length < 2) {
      await ctx.reply("Kamida 2 ta variant kerak. Qaytadan yozing:");
      return;
    }

    const ins = await q(
      `insert into vacancy_questions(vacancy_id, q_type, text, options, correct_answer, points, is_scored, sort)
       values($1,$2,$3,$4::jsonb, 'null'::jsonb, 1, true, 10)
       returning id`,
      [Number(vacId), "choice", qtext, JSON.stringify(opts)],
    );

    await clearState(uid);
    await ctx.reply(
      `✅ Savol qo‘shildi. ID: ${ins.rows[0].id}\nTo‘g‘ri javob berish uchun “✅ Javob” ni tanlang.`,
    );
    return;
  }

  // edit question text
  if (state === "adm_q_edit_text") {
    const { vacId, qid } = data;
    await q(
      "update vacancy_questions set text=$1 where id=$2 and vacancy_id=$3",
      [text, Number(qid), Number(vacId)],
    );
    await clearState(uid);
    await ctx.reply("✅ Saqlandi.");
    return;
  }

  // edit question sort
  if (state === "adm_q_edit_sort") {
    const { vacId, qid } = data;
    const n = Number(text);
    if (!Number.isFinite(n)) {
      await ctx.reply("Raqam kiriting (misol: 10).");
      return;
    }
    await q(
      "update vacancy_questions set sort=$1 where id=$2 and vacancy_id=$3",
      [n, Number(qid), Number(vacId)],
    );
    await clearState(uid);
    await ctx.reply("✅ Saqlandi.");
    return;
  }

  // edit correct answer
  if (state === "adm_q_edit_correct") {
    const { vacId, qid } = data;

    if (text === "-" || text.toLowerCase() === "none") {
      await q(
        "update vacancy_questions set correct_answer=null where id=$1 and vacancy_id=$2",
        [Number(qid), Number(vacId)],
      );
      await clearState(uid);
      await ctx.reply("✅ Avto-tekshiruv o‘chirildi (correct_answer = null).");
      return;
    }

    // store as jsonb string
    await q(
      "update vacancy_questions set correct_answer=$1::jsonb where id=$2 and vacancy_id=$3",
      [JSON.stringify(text), Number(qid), Number(vacId)],
    );

    await clearState(uid);
    await ctx.reply("✅ Saqlandi. Endi bot javobni avtomatik tekshiradi.");
    return;
  }

  // ask candidate
  if (state === "adm_app_ask") {
    const appId = Number(data.appId);
    const ar = await q("select user_id from applications where id=$1", [appId]);
    if (!ar.rowCount) {
      await clearState(uid);
      await ctx.reply("Topilmadi.");
      return;
    }
    const candidateId = ar.rows[0].user_id;
    await ctx.api.sendMessage(candidateId, `📩 Admin savoli:\n\n${text}`);
    await clearState(uid);
    await ctx.reply("✅ Yuborildi.");
    return;
  }
}
