// flows_admin.js (PRO - CLEAN ADMIN UI, NO SPAM, FIXED QUESTIONS)
import { q, setState, getState, clearState, isAdmin } from "./db.js";
import { InlineKeyboard } from "grammy";

/* =========================
   Clean chat helpers (admin)
========================= */
async function safeDelete(ctx, chatId, messageId) {
  if (!chatId || !messageId) return;
  try {
    await ctx.api.deleteMessage(chatId, messageId);
  } catch (_) {}
}

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
   Keyboards (admin UI)
========================= */
function kbAdminHome() {
  return new InlineKeyboard()
    .text("➕ Vakansiya qo‘shish", "adm:vac_new")
    .row()
    .text("📋 Vakansiyalar", "adm:vac_list")
    .row()
    .text("🔄 Yangilash", "adm:vac_list");
}

function kbVacancyRow(vacId) {
  return new InlineKeyboard().text("Ochish", `adm_v:${vacId}`);
}

function kbVacancyCard(v) {
  return new InlineKeyboard()
    .text("⚙️ Filtrlar", `adm_f:${v.id}`)
    .row()
    .text("🧩 Savollar", `adm_q:${v.id}`)
    .row()
    .text(
      v.is_active ? "⛔ OFF" : "✅ ON",
      v.is_active ? `adm_off:${v.id}` : `adm_on:${v.id}`,
    )
    .row()
    .text("⬅️ Orqaga", "adm:vac_list");
}

function kbFilters(vacId) {
  return new InlineKeyboard()
    .text("👤 Yosh 18–30", `f_add:${vacId}:age_18_30`)
    .row()
    .text("🪪 B+C", `f_add:${vacId}:license_bc`)
    .row()
    .text("🚫 Alkogol yo‘q", `f_add:${vacId}:no_alcohol`)
    .row()
    .text("🧹 Filtrlarni tozalash", `f_clear:${vacId}`)
    .row()
    .text("⬅️ Orqaga", `adm_v:${vacId}`);
}

function kbQuestions(vacId) {
  return new InlineKeyboard()
    .text("➕ Text savol", `q_add:${vacId}:text`)
    .row()
    .text("➕ Yes/No savol", `q_add:${vacId}:yesno`)
    .row()
    .text("➕ Choice savol", `q_add:${vacId}:choice`)
    .row()
    .text("🧹 Savollarni tozalash", `q_clear:${vacId}`)
    .row()
    .text("⬅️ Orqaga", `adm_v:${vacId}`);
}

/* =========================
   Render vacancy list in ONE message
========================= */
async function renderVacancyListText() {
  const r = await q(
    "select id, title, button_text, is_active from vacancies order by id desc",
  );
  if (!r.rowCount) return "Hozircha vakansiya yo‘q.";
  let out = "📋 Vakansiyalar:\n";
  for (const v of r.rows) {
    out += `\n#${v.id} — ${v.title}\nButton: ${v.button_text}\nHolat: ${v.is_active ? "ON ✅" : "OFF ⛔"}\n`;
  }
  out += "\n👇 Vakansiyani tanlang:";
  return out;
}

async function renderVacancyListKeyboard() {
  const r = await q("select id, title from vacancies order by id desc");
  const kb = new InlineKeyboard();
  if (!r.rowCount) return kb.row().text("➕ Vakansiya qo‘shish", "adm:vac_new");

  for (const v of r.rows)
    kb.text(`🔹 #${v.id} ${v.title}`, `adm_v:${v.id}`).row();

  kb.row()
    .text("➕ Yangi vakansiya", "adm:vac_new")
    .text("🏠 Menyu", "adm:home");
  return kb;
}

async function showAdminHome(ctx, userId) {
  await setState(userId, "admin_idle", { ui: (await getUi(userId)) || {} });
  await upsertMain(ctx, userId, "Admin panel:", kbAdminHome());
}

async function showVacancyList(ctx, userId) {
  await setState(userId, "admin_idle", { ui: (await getUi(userId)) || {} });
  const text = await renderVacancyListText();
  const kb = await renderVacancyListKeyboard();
  await upsertMain(ctx, userId, text, kb);
}

async function showVacancyCard(ctx, userId, vacId) {
  const r = await q("select * from vacancies where id=$1", [vacId]);
  if (!r.rowCount) {
    await ctx.answerCallbackQuery({ text: "Topilmadi" });
    await showVacancyList(ctx, userId);
    return;
  }
  const v = r.rows[0];
  await setState(userId, "admin_idle", { ui: (await getUi(userId)) || {} });

  const text =
    `🧩 Vakansiya #${v.id}\n` +
    `Nom: ${v.title}\n` +
    `Button: ${v.button_text}\n` +
    `Holat: ${v.is_active ? "ON ✅" : "OFF ⛔"}\n\n` +
    `Quyidagilardan birini tanlang:`;

  await upsertMain(ctx, userId, text, kbVacancyCard(v));
}

/* =========================
   ADMIN COMMANDS (text commands)
========================= */
export async function handleAdminCommands(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("Kechirasiz, bu buyruqlar faqat admin uchun.");
    return;
  }

  const text = (ctx.message?.text || "").trim();

  // Commands from Telegram may include "@BotName"
  const cmd = text.split(" ")[0].split("@")[0];

  if (cmd === "/vacancy_new") {
    await setState(userId, "admin_vac_new_title", {
      ui: (await getUi(userId)) || {},
    });
    await sendPrompt(
      ctx,
      userId,
      "Yangi vakansiya nomini yozing. (misol: Sotuvchi)",
      null,
    );
    return;
  }

  if (cmd === "/vacancy_list") {
    await showVacancyList(ctx, userId);
    return;
  }

  if (cmd === "/vacancy_delete") {
    await setState(userId, "admin_vac_delete_wait_id", {
      ui: (await getUi(userId)) || {},
    });
    await sendPrompt(
      ctx,
      userId,
      "O‘chirmoqchi bo‘lgan vakansiya ID sini yozing. (misol: 3)",
      null,
    );
    return;
  }

  if (cmd === "/question_delete_last") {
    await setState(userId, "admin_q_delete_last_wait_vac", {
      ui: (await getUi(userId)) || {},
    });
    await sendPrompt(
      ctx,
      userId,
      "Qaysi vakansiya uchun oxirgi savolni o‘chirasiz? Vakansiya ID sini yozing.",
      null,
    );
    return;
  }
}

/* =========================
   ADMIN STATE MESSAGES
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
    await setState(userId, "admin_vac_new_button", {
      title: msg,
      ui: data.ui || {},
    });
    await sendPrompt(
      ctx,
      userId,
      "Button matnini yozing. (misol: 🛒 Sotuvchi)",
      null,
    );
    return;
  }

  if (state === "admin_vac_new_button") {
    const title = (data.title || "").trim();
    if (!title) {
      await clearState(userId);
      await sendPrompt(ctx, userId, "Xatolik. Qaytadan: /vacancy_new", null);
      return;
    }

    const button = msg;

    try {
      const r = await q(
        "insert into vacancies(title, button_text) values($1,$2) returning id",
        [title, button],
      );
      await clearState(userId);
      await sendPrompt(
        ctx,
        userId,
        `✅ Yaratildi. Vakansiya ID: ${r.rows[0].id}`,
        null,
      );
      await showVacancyList(ctx, userId);
    } catch (e) {
      await clearState(userId);
      await sendPrompt(
        ctx,
        userId,
        "Xatolik: vakansiya yaratilmadi. Qaytadan: /vacancy_new",
        null,
      );
      console.error("vacancy insert error:", e);
    }
    return;
  }

  // --- Delete vacancy by id ---
  if (state === "admin_vac_delete_wait_id") {
    const id = Number(msg);
    if (!Number.isFinite(id)) {
      await sendPrompt(ctx, userId, "ID raqam bo‘lishi kerak.", null);
      return;
    }
    await q("delete from vacancies where id=$1", [id]);
    await clearState(userId);
    await sendPrompt(
      ctx,
      userId,
      `✅ Vakansiya #${id} o‘chirildi (agar mavjud bo‘lsa).`,
      null,
    );
    await showVacancyList(ctx, userId);
    return;
  }

  // --- Delete last question in vacancy ---
  if (state === "admin_q_delete_last_wait_vac") {
    const vacId = Number(msg);
    if (!Number.isFinite(vacId)) {
      await sendPrompt(ctx, userId, "ID raqam bo‘lishi kerak.", null);
      return;
    }

    const last = await q(
      "select id from vacancy_questions where vacancy_id=$1 order by sort desc, id desc limit 1",
      [vacId],
    );

    if (!last.rowCount) {
      await clearState(userId);
      await sendPrompt(ctx, userId, "Bu vakansiyada savollar yo‘q.", null);
      return;
    }

    await q("delete from vacancy_questions where id=$1", [last.rows[0].id]);
    await clearState(userId);
    await sendPrompt(ctx, userId, "✅ Oxirgi savol o‘chirildi.", null);
    await showVacancyCard(ctx, userId, vacId);
    return;
  }

  // --- Ask candidate flow ---
  if (state === "admin_ask_candidate") {
    const appId = Number(data.appId);
    if (!Number.isFinite(appId)) {
      await clearState(userId);
      await sendPrompt(ctx, userId, "Xatolik: appId topilmadi.", null);
      return;
    }

    const ar = await q("select user_id from applications where id=$1", [appId]);
    if (!ar.rowCount) {
      await clearState(userId);
      await sendPrompt(ctx, userId, "Topilmadi.", null);
      return;
    }

    const candidateId = ar.rows[0].user_id;
    await ctx.api.sendMessage(candidateId, `Admin savoli:\n${msg}`);
    await clearState(userId);
    await sendPrompt(ctx, userId, "✅ Savol yuborildi.", null);
    return;
  }

  // --- Add question flows ---
  if (state === "admin_q_add_text") {
    const vacId = Number(data.vacId);
    const sortRes = await q(
      "select coalesce(max(sort),0)+10 as s from vacancy_questions where vacancy_id=$1",
      [vacId],
    );
    const sort = sortRes.rows[0].s;

    await q(
      "insert into vacancy_questions(vacancy_id,sort,q_type,text,options,required) values($1,$2,$3,$4,$5::jsonb,$6)",
      [vacId, sort, "text", msg, "[]", true],
    );

    await clearState(userId);
    await sendPrompt(ctx, userId, "✅ Savol qo‘shildi.", null);
    await showVacancyCard(ctx, userId, vacId);
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
      "insert into vacancy_questions(vacancy_id,sort,q_type,text,options,required) values($1,$2,$3,$4,$5::jsonb,$6)",
      [vacId, sort, "yesno", msg, JSON.stringify(["Ha", "Yo‘q"]), true],
    );

    await clearState(userId);
    await sendPrompt(ctx, userId, "✅ Savol qo‘shildi.", null);
    await showVacancyCard(ctx, userId, vacId);
    return;
  }

  if (state === "admin_q_add_choice_text") {
    await setState(userId, "admin_q_add_choice_opts", {
      vacId: data.vacId,
      text: msg,
      ui: data.ui || {},
    });
    await sendPrompt(
      ctx,
      userId,
      "Variantlarni vergul bilan yozing. (misol: Kunduz, Kechqurun, Farqi yo‘q)",
      null,
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
      await sendPrompt(
        ctx,
        userId,
        "Kamida 2 ta variant kerak. Qaytadan yozing.",
        null,
      );
      return;
    }

    const sortRes = await q(
      "select coalesce(max(sort),0)+10 as s from vacancy_questions where vacancy_id=$1",
      [vacId],
    );
    const sort = sortRes.rows[0].s;

    await q(
      "insert into vacancy_questions(vacancy_id,sort,q_type,text,options,required) values($1,$2,$3,$4,$5::jsonb,$6)",
      [vacId, sort, "choice", qText, JSON.stringify(opts), true],
    );

    await clearState(userId);
    await sendPrompt(ctx, userId, "✅ Choice savol qo‘shildi.", null);
    await showVacancyCard(ctx, userId, vacId);
    return;
  }
}

/* =========================
   ADMIN CALLBACKS
========================= */
export async function handleAdminCallbacks(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) return;

  const data = ctx.callbackQuery?.data || "";

  // Main menu callbacks
  if (data === "adm:home") {
    await ctx.answerCallbackQuery();
    await showAdminHome(ctx, userId);
    return;
  }
  if (data === "adm:vac_list") {
    await ctx.answerCallbackQuery();
    await showVacancyList(ctx, userId);
    return;
  }
  if (data === "adm:vac_new") {
    await ctx.answerCallbackQuery();
    await setState(userId, "admin_vac_new_title", {
      ui: (await getUi(userId)) || {},
    });
    await sendPrompt(
      ctx,
      userId,
      "Yangi vakansiya nomini yozing. (misol: Sotuvchi)",
      null,
    );
    return;
  }

  // Open vacancy
  if (data.startsWith("adm_v:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(data.split(":")[1]);
    await showVacancyCard(ctx, userId, vacId);
    return;
  }

  // ON/OFF vacancy
  if (data.startsWith("adm_on:")) {
    const vacId = Number(data.split(":")[1]);
    await q("update vacancies set is_active=true where id=$1", [vacId]);
    await ctx.answerCallbackQuery({ text: "ON" });
    await showVacancyCard(ctx, userId, vacId);
    return;
  }

  if (data.startsWith("adm_off:")) {
    const vacId = Number(data.split(":")[1]);
    await q("update vacancies set is_active=false where id=$1", [vacId]);
    await ctx.answerCallbackQuery({ text: "OFF" });
    await showVacancyCard(ctx, userId, vacId);
    return;
  }

  // Filters menu
  if (data.startsWith("adm_f:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(data.split(":")[1]);
    await upsertMain(
      ctx,
      userId,
      `⚙️ Filtrlar (vakansiya #${vacId})`,
      kbFilters(vacId),
    );
    return;
  }

  if (data.startsWith("f_clear:")) {
    const vacId = Number(data.split(":")[1]);
    await q("delete from vacancy_filters where vacancy_id=$1", [vacId]);
    await ctx.answerCallbackQuery({ text: "Tozalandi" });
    await upsertMain(
      ctx,
      userId,
      `⚙️ Filtrlar (vakansiya #${vacId})`,
      kbFilters(vacId),
    );
    return;
  }

  if (data.startsWith("f_add:")) {
    const [, vacIdStr, kind] = data.split(":");
    const vacId = Number(vacIdStr);

    // prevent duplicates: delete same type first
    if (kind === "age_18_30") {
      await q(
        "delete from vacancy_filters where vacancy_id=$1 and type='age_range'",
        [vacId],
      );
      await q(
        "insert into vacancy_filters(vacancy_id,type,config) values($1,$2,$3)",
        [
          vacId,
          "age_range",
          {
            min: 18,
            max: 30,
            fail_text: "Rahmat! Afsuski, yosh bo‘yicha mos emassiz.",
          },
        ],
      );
      await ctx.answerCallbackQuery({ text: "Qo‘shildi" });
      await upsertMain(
        ctx,
        userId,
        `⚙️ Filtrlar (vakansiya #${vacId})`,
        kbFilters(vacId),
      );
      return;
    }

    if (kind === "license_bc") {
      await q(
        "delete from vacancy_filters where vacancy_id=$1 and type='license_bc'",
        [vacId],
      );
      await q(
        "insert into vacancy_filters(vacancy_id,type,config) values($1,$2,$3)",
        [vacId, "license_bc", { fail_text: "B va C toifalari kerak." }],
      );
      await ctx.answerCallbackQuery({ text: "Qo‘shildi" });
      await upsertMain(
        ctx,
        userId,
        `⚙️ Filtrlar (vakansiya #${vacId})`,
        kbFilters(vacId),
      );
      return;
    }

    if (kind === "no_alcohol") {
      await q(
        "delete from vacancy_filters where vacancy_id=$1 and type='no_alcohol'",
        [vacId],
      );
      await q(
        "insert into vacancy_filters(vacancy_id,type,config) values($1,$2,$3)",
        [
          vacId,
          "no_alcohol",
          { fail_text: "Bu ish uchun alkogol ichmaslik shart." },
        ],
      );
      await ctx.answerCallbackQuery({ text: "Qo‘shildi" });
      await upsertMain(
        ctx,
        userId,
        `⚙️ Filtrlar (vakansiya #${vacId})`,
        kbFilters(vacId),
      );
      return;
    }
  }

  // Questions menu
  if (data.startsWith("adm_q:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(data.split(":")[1]);
    await upsertMain(
      ctx,
      userId,
      `🧩 Savollar (vakansiya #${vacId})`,
      kbQuestions(vacId),
    );
    return;
  }

  if (data.startsWith("q_clear:")) {
    const vacId = Number(data.split(":")[1]);
    await q("delete from vacancy_questions where vacancy_id=$1", [vacId]);
    await ctx.answerCallbackQuery({ text: "Tozalandi" });
    await upsertMain(
      ctx,
      userId,
      `🧩 Savollar (vakansiya #${vacId})`,
      kbQuestions(vacId),
    );
    return;
  }

  if (data.startsWith("q_add:")) {
    const [, vacIdStr, qtype] = data.split(":");
    const vacId = Number(vacIdStr);
    await ctx.answerCallbackQuery();

    if (qtype === "text") {
      await setState(userId, "admin_q_add_text", {
        vacId,
        ui: (await getUi(userId)) || {},
      });
      await sendPrompt(ctx, userId, "Savol matnini yozing (text):", null);
      return;
    }

    if (qtype === "yesno") {
      await setState(userId, "admin_q_add_yesno", {
        vacId,
        ui: (await getUi(userId)) || {},
      });
      await sendPrompt(ctx, userId, "Savol matnini yozing (Ha/Yo‘q):", null);
      return;
    }

    if (qtype === "choice") {
      await setState(userId, "admin_q_add_choice_text", {
        vacId,
        ui: (await getUi(userId)) || {},
      });
      await sendPrompt(ctx, userId, "Savol matnini yozing (choice):", null);
      return;
    }
  }

  // Admin asks candidate
  if (data.startsWith("ask:")) {
    const appId = Number(data.split(":")[1]);
    await setState(userId, "admin_ask_candidate", {
      appId,
      ui: (await getUi(userId)) || {},
    });
    await ctx.answerCallbackQuery();
    await sendPrompt(ctx, userId, "Nomzodga savol yozing (matn):", null);
    return;
  }
}
