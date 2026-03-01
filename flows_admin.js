// flows_admin.js (REWRITE - STABLE)
import { q, setState, getState, clearState, isAdmin } from "./db.js";
import { InlineKeyboard } from "grammy";
import { kbAdminVacancyActions } from "./keyboards.js";

/* =========================
   ADMIN COMMANDS
========================= */
export async function handleAdminCommands(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("Kechirasiz, bu buyruqlar faqat admin uchun.");
    return;
  }

  const text = (ctx.message?.text || "").trim();

  if (text === "/vacancy_new") {
    await setState(userId, "admin_vac_new_title", {});
    await ctx.reply("Yangi vakansiya nomini yozing. (misol: Sotuvchi)");
    return;
  }

  if (text === "/vacancy_list") {
    const r = await q("select * from vacancies order by id desc");
    if (!r.rowCount) {
      await ctx.reply("Hozircha vakansiya yo‘q.");
      return;
    }

    for (const v of r.rows) {
      await ctx.reply(
        `#${v.id} — ${v.title}\nButton: ${v.button_text}\nHolat: ${
          v.is_active ? "ON" : "OFF"
        }`,
        { reply_markup: kbAdminVacancyActions(v.id) },
      );
    }
    return;
  }

  if (text === "/vacancy_delete") {
    await setState(userId, "admin_vac_delete_wait_id", {});
    await ctx.reply(
      "O‘chirmoqchi bo‘lgan vakansiya ID sini yozing. (misol: 3)",
    );
    return;
  }

  if (text === "/question_delete_last") {
    await setState(userId, "admin_q_delete_last_wait_vac", {});
    await ctx.reply(
      "Qaysi vakansiya uchun oxirgi savolni o‘chirasiz? Vakansiya ID sini yozing.",
    );
    return;
  }

  // helpers (optional)
  if (text.startsWith("/vacancy_filters")) {
    await ctx.reply(
      "Vakansiyalar ro‘yxatini ko‘rish uchun /vacancy_list bosing, keyin ⚙️ Filtrlar ni tanlang.",
    );
    return;
  }

  if (text.startsWith("/vacancy_questions")) {
    await ctx.reply(
      "Vakansiyalar ro‘yxatini ko‘rish uchun /vacancy_list bosing, keyin 🧩 Savollar ni tanlang.",
    );
    return;
  }
}

/* =========================
   ADMIN STATE MESSAGES
   (vacancy creation, deletes, ask candidate)
========================= */
export async function handleAdminMessages(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) return;

  const msg = ctx.message?.text?.trim();
  if (!msg) return;

  const st = await getState(userId);
  const state = st?.state || "idle";
  const data = st?.data || {};

  // --- Create vacancy flow ---
  if (state === "admin_vac_new_title") {
    await setState(userId, "admin_vac_new_button", { title: msg });
    await ctx.reply("Button matnini yozing. (misol: 🛒 Sotuvchi)");
    return;
  }

  if (state === "admin_vac_new_button") {
    const title = (data.title || "").trim();
    if (!title) {
      await clearState(userId);
      await ctx.reply(
        "Xatolik: vakansiya nomi topilmadi. Qaytadan: /vacancy_new",
      );
      return;
    }

    const button = msg;

    try {
      const r = await q(
        "insert into vacancies(title, button_text) values($1,$2) returning id",
        [title, button],
      );

      await clearState(userId);
      await ctx.reply(
        `✅ Yaratildi. Vakansiya ID: ${r.rows[0].id}\nEndi filtr/savol qo‘shishingiz mumkin: /vacancy_list`,
      );
    } catch (e) {
      await clearState(userId);
      await ctx.reply(
        "Xatolik: vakansiya yaratilmadi. Qaytadan urinib ko‘ring: /vacancy_new",
      );
      console.error("vacancy insert error:", e);
    }
    return;
  }

  // --- Delete vacancy by id ---
  if (state === "admin_vac_delete_wait_id") {
    const id = Number(msg);
    if (!Number.isFinite(id)) {
      await ctx.reply("ID raqam bo‘lishi kerak.");
      return;
    }
    await q("delete from vacancies where id=$1", [id]);
    await clearState(userId);
    await ctx.reply(`✅ Vakansiya #${id} o‘chirildi (agar mavjud bo‘lsa).`);
    return;
  }

  // --- Delete last question in vacancy ---
  if (state === "admin_q_delete_last_wait_vac") {
    const vacId = Number(msg);
    if (!Number.isFinite(vacId)) {
      await ctx.reply("ID raqam bo‘lishi kerak.");
      return;
    }

    const last = await q(
      "select id from vacancy_questions where vacancy_id=$1 order by sort desc, id desc limit 1",
      [vacId],
    );

    if (!last.rowCount) {
      await clearState(userId);
      await ctx.reply("Bu vakansiyada savollar yo‘q.");
      return;
    }

    await q("delete from vacancy_questions where id=$1", [last.rows[0].id]);
    await clearState(userId);
    await ctx.reply("✅ Oxirgi savol o‘chirildi.");
    return;
  }

  // --- Ask candidate flow ---
  if (state === "admin_ask_candidate") {
    const appId = Number(data.appId);
    if (!Number.isFinite(appId)) {
      await clearState(userId);
      await ctx.reply("Xatolik: appId topilmadi.");
      return;
    }

    const ar = await q("select user_id from applications where id=$1", [appId]);
    if (!ar.rowCount) {
      await clearState(userId);
      await ctx.reply("Topilmadi.");
      return;
    }

    const candidateId = ar.rows[0].user_id;
    await ctx.api.sendMessage(candidateId, `Admin savoli:\n${msg}`);
    await ctx.reply("✅ Savol yuborildi.");
    await clearState(userId);
    return;
  }
}

/* =========================
   ADMIN CALLBACKS (buttons)
========================= */
export async function handleAdminCallbacks(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) return;

  const data = ctx.callbackQuery?.data || "";

  // ON/OFF vacancy
  if (data.startsWith("adm_on:")) {
    const vacId = Number(data.split(":")[1]);
    await q("update vacancies set is_active=true where id=$1", [vacId]);
    await ctx.answerCallbackQuery({ text: "ON" });
    return;
  }

  if (data.startsWith("adm_off:")) {
    const vacId = Number(data.split(":")[1]);
    await q("update vacancies set is_active=false where id=$1", [vacId]);
    await ctx.answerCallbackQuery({ text: "OFF" });
    return;
  }

  // Filters menu
  if (data.startsWith("adm_f:")) {
    const vacId = Number(data.split(":")[1]);
    const kb = new InlineKeyboard()
      .text("👤 Yosh 18–30 (Sotuvchi)", `f_add:${vacId}:age_18_30`)
      .row()
      .text("🪪 B+C (Yetkazib)", `f_add:${vacId}:license_bc`)
      .row()
      .text("🚫 Alkogol yo‘q (Yetkazib)", `f_add:${vacId}:no_alcohol`)
      .row()
      .text("🧹 Filtrlarni tozalash", `f_clear:${vacId}`);

    await ctx.editMessageText(`⚙️ Filtrlar (vakansiya #${vacId})`, {
      reply_markup: kb,
    });
    return;
  }

  if (data.startsWith("f_clear:")) {
    const vacId = Number(data.split(":")[1]);
    await q("delete from vacancy_filters where vacancy_id=$1", [vacId]);
    await ctx.answerCallbackQuery({ text: "Tozalandi" });
    return;
  }

  if (data.startsWith("f_add:")) {
    const [, vacIdStr, kind] = data.split(":");
    const vacId = Number(vacIdStr);

    if (kind === "age_18_30") {
      await q(
        "insert into vacancy_filters(vacancy_id,type,config) values($1,$2,$3)",
        [
          vacId,
          "age_range",
          {
            min: 18,
            max: 30,
            fail_text: "Rahmat! Afsuski, yosh bo‘yicha talabga mos emassiz.",
          },
        ],
      );
      await ctx.answerCallbackQuery({ text: "Qo‘shildi" });
      return;
    }

    if (kind === "license_bc") {
      await q(
        "insert into vacancy_filters(vacancy_id,type,config) values($1,$2,$3)",
        [
          vacId,
          "license_bc",
          { fail_text: "Rahmat! Afsuski, B va C toifalari shart." },
        ],
      );
      await ctx.answerCallbackQuery({ text: "Qo‘shildi" });
      return;
    }

    if (kind === "no_alcohol") {
      await q(
        "insert into vacancy_filters(vacancy_id,type,config) values($1,$2,$3)",
        [
          vacId,
          "no_alcohol",
          {
            fail_text: "Rahmat! Afsuski, bu ish uchun alkogol ichmaslik shart.",
          },
        ],
      );
      await ctx.answerCallbackQuery({ text: "Qo‘shildi" });
      return;
    }
  }

  // Questions menu
  if (data.startsWith("adm_q:")) {
    const vacId = Number(data.split(":")[1]);
    const kb = new InlineKeyboard()
      .text("➕ Text savol", `q_add:${vacId}:text`)
      .row()
      .text("➕ Yes/No savol", `q_add:${vacId}:yesno`)
      .row()
      .text("➕ Choice savol", `q_add:${vacId}:choice`)
      .row()
      .text("🧹 Savollarni tozalash", `q_clear:${vacId}`);

    await ctx.editMessageText(`🧩 Savollar (vakansiya #${vacId})`, {
      reply_markup: kb,
    });
    return;
  }

  if (data.startsWith("q_clear:")) {
    const vacId = Number(data.split(":")[1]);
    await q("delete from vacancy_questions where vacancy_id=$1", [vacId]);
    await ctx.answerCallbackQuery({ text: "Tozalandi" });
    return;
  }

  if (data.startsWith("q_add:")) {
    const [, vacIdStr, qtype] = data.split(":");
    const vacId = Number(vacIdStr);

    if (qtype === "text") {
      await setState(userId, "admin_q_add_text", { vacId });
      await ctx.answerCallbackQuery();
      await ctx.api.sendMessage(userId, "Savol matnini yozing (text):");
      return;
    }

    if (qtype === "yesno") {
      await setState(userId, "admin_q_add_yesno", { vacId });
      await ctx.answerCallbackQuery();
      await ctx.api.sendMessage(userId, "Savol matnini yozing (Ha/Yo‘q):");
      return;
    }

    if (qtype === "choice") {
      await setState(userId, "admin_q_add_choice_text", { vacId });
      await ctx.answerCallbackQuery();
      await ctx.api.sendMessage(userId, "Savol matnini yozing (choice):");
      return;
    }
  }

  // Admin asks candidate
  if (data.startsWith("ask:")) {
    const appId = Number(data.split(":")[1]);
    await setState(userId, "admin_ask_candidate", { appId });
    await ctx.answerCallbackQuery();
    await ctx.api.sendMessage(userId, "Nomzodga savol yozing (matn):");
    return;
  }
}

/* =========================
   ADMIN: ADD QUESTIONS (TEXT INPUT)
========================= */
export async function handleAdminQuestionText(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) return;

  const msg = ctx.message?.text?.trim();
  if (!msg) return;

  const st = await getState(userId);
  const state = st?.state || "idle";
  const data = st?.data || {};

  if (state === "admin_q_add_text") {
    const vacId = Number(data.vacId);
    const sortRes = await q(
      "select coalesce(max(sort),0)+10 as s from vacancy_questions where vacancy_id=$1",
      [vacId],
    );
    const sort = sortRes.rows[0].s;

    await q(
      "insert into vacancy_questions(vacancy_id,sort,q_type,text,options,required) values($1,$2,$3,$4,$5,$6)",
      [vacId, sort, "text", msg, [], true],
    );

    await clearState(userId);
    await ctx.reply("✅ Savol qo‘shildi.");
    return;
  }

  if (state === "admin_q_add_yesno") {
    const vacId = Number(data.vacId);
    const sortRes = await q(
      "select coalesce(max(sort),0)+10 as s from vacancy_questions where vacancy_id=$1",
      [vacId],
    );
    const sort = sortRes.rows[0].s;

    await q(
      "insert into vacancy_questions(vacancy_id,sort,q_type,text,options,required) values($1,$2,$3,$4,$5,$6)",
      [vacId, sort, "yesno", msg, ["Ha", "Yo‘q"], true],
    );

    await clearState(userId);
    await ctx.reply("✅ Savol qo‘shildi.");
    return;
  }

  if (state === "admin_q_add_choice_text") {
    await setState(userId, "admin_q_add_choice_opts", {
      vacId: data.vacId,
      text: msg,
    });
    await ctx.reply(
      "Variantlarni vergul bilan yozing. (misol: Kunduz, Kechqurun, Farqi yo‘q)",
    );
    return;
  }

  if (state === "admin_q_add_choice_opts") {
    const vacId = Number(data.vacId);
    const qText = (data.text || "").trim();

    const opts = msg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (opts.length < 2) {
      await ctx.reply("Kamida 2 ta variant kerak. Qaytadan yozing.");
      return;
    }

    const sortRes = await q(
      "select coalesce(max(sort),0)+10 as s from vacancy_questions where vacancy_id=$1",
      [vacId],
    );
    const sort = sortRes.rows[0].s;

    await q(
      "insert into vacancy_questions(vacancy_id,sort,q_type,text,options,required) values($1,$2,$3,$4,$5,$6)",
      [vacId, sort, "choice", qText, opts, true],
    );

    await clearState(userId);
    await ctx.reply("✅ Choice savol qo‘shildi.");
    return;
  }
}
