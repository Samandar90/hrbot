// flows_admin.js (PREMIUM CORE v2)
import { q, setState, getState, clearState, isAdmin } from "./db.js";
import { InlineKeyboard } from "grammy";

/* =========================
   Small helpers
========================= */
function cleanCmd(text = "") {
  const t = text.trim();
  const cmd = t.split(" ")[0].split("@")[0];
  const args = t.split(" ").slice(1);
  return { cmd, args };
}

function safeStr(v) {
  return (v ?? "").toString().trim();
}

function phoneLink(phone) {
  const p = safeStr(phone).replace(/\s+/g, "");
  if (!p) return null;
  // telegram usually supports tel:
  return `tel:${p}`;
}

function kbAdminHome() {
  return new InlineKeyboard()
    .text("📌 Vakansiyalar", "adm:vac:list")
    .row()
    .text("📥 Yangi arizalar", "adm:apps:new")
    .text("📚 Barcha arizalar", "adm:apps:all")
    .row()
    .text("➕ Vakansiya qo‘shish", "adm:vac:new");
}

function kbVacRow(vacId, isActive) {
  return new InlineKeyboard()
    .text("✏️ Nom/Btn", `adm:vac:edit:${vacId}`)
    .row()
    .text(isActive ? "⛔ OFF" : "✅ ON", `adm:vac:toggle:${vacId}`)
    .text("🗑 O‘chirish", `adm:vac:del:${vacId}`)
    .row()
    .text("⬅️ Orqaga", "adm:home");
}

function kbAppActions(appId, phone) {
  const kb = new InlineKeyboard()
    .text("✅ Qabul", `st:${appId}:accepted`)
    .text("🟡 Zaxira", `st:${appId}:reserve`)
    .row()
    .text("❌ Rad", `st:${appId}:rejected`)
    .row()
    .text("💬 Savol", `ask:${appId}`)
    .row()
    .text("⬅️ Orqaga", "adm:home");

  const link = phoneLink(phone);
  if (link) {
    // Telegram inline URL button
    kb.row().url("📞 Qo‘ng‘iroq", link);
  }
  return kb;
}

async function formatApp(appId) {
  const ar = await q(
    `select a.*, v.title as vac_title, v.button_text as vac_btn
     from applications a
     join vacancies v on v.id=a.vacancy_id
     where a.id=$1`,
    [appId],
  );
  if (!ar.rowCount) return null;
  const a = ar.rows[0];

  const maps = {
    exp: { 0: "0", 1: "1 yil", "2p": "2+ yil" },
    shift: { day: "Kunduz", night: "Kech", any: "Farqi yo‘q" },
    start: { today: "Bugun", tomorrow: "Ertaga", week: "1 hafta ichida" },
    license: { bc: "B + C", only_b: "Faqat B", other: "Boshqa/Yo‘q" },
    alcohol: { no: "Ichmayman", yes: "Ichaman" },
  };

  const lines = [];
  lines.push(`🧾 Ariza #${a.id}`);
  lines.push(`— Vakansiya: ${a.vac_btn || a.vac_title || "-"}`);
  lines.push(`— Ism: ${a.full_name || "-"}`);
  lines.push(`— Telefon: ${a.phone || "-"}`);
  if (a.age !== null && a.age !== undefined) lines.push(`— Yosh: ${a.age}`);
  if (a.experience)
    lines.push(`— Tajriba: ${maps.exp[a.experience] || a.experience}`);
  if (a.shift) lines.push(`— Grafik: ${maps.shift[a.shift] || a.shift}`);
  if (a.start_pref)
    lines.push(`— Qachondan: ${maps.start[a.start_pref] || a.start_pref}`);
  if (a.license)
    lines.push(`— Guvohnoma: ${maps.license[a.license] || a.license}`);
  if (a.alcohol)
    lines.push(`— Alkogol: ${maps.alcohol[a.alcohol] || a.alcohol}`);
  lines.push(`— Status: ${a.status || "new"}`);
  lines.push(`— Username: ${a.username ? "@" + a.username : "-"}`);
  lines.push(`— UserID: ${a.user_id}`);

  return { text: lines.join("\n"), phone: a.phone };
}

/* =========================
   ADMIN COMMANDS (text)
========================= */
export async function handleAdminCommands(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("Kechirasiz, bu buyruqlar faqat admin uchun.");
    return;
  }

  const text = ctx.message?.text || "";
  const { cmd } = cleanCmd(text);

  if (cmd === "/admin") {
    await clearState(userId);
    await ctx.reply("🛠 Admin panel:", { reply_markup: kbAdminHome() });
    return;
  }

  if (cmd === "/vacancy_new") {
    await setState(userId, "adm_vac_new_title", {});
    await ctx.reply("Yangi vakansiya nomini yozing. (misol: Sotuvchi)");
    return;
  }

  if (cmd === "/vacancy_list") {
    await sendVacancyList(ctx, userId);
    return;
  }

  if (cmd === "/apps_new") {
    await sendAppsList(ctx, userId, "new");
    return;
  }

  if (cmd === "/apps_all") {
    await sendAppsList(ctx, userId, "all");
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

  // Create vacancy
  if (state === "adm_vac_new_title") {
    await setState(userId, "adm_vac_new_button", { title: msg });
    await ctx.reply("Button matnini yozing. (misol: 🛒 Sotuvchi)");
    return;
  }

  if (state === "adm_vac_new_button") {
    const title = safeStr(data.title);
    const button = msg;

    if (!title) {
      await clearState(userId);
      await ctx.reply("Xatolik. Qaytadan: /vacancy_new");
      return;
    }

    const r = await q(
      "insert into vacancies(title, button_text) values($1,$2) returning id",
      [title, button],
    );

    await clearState(userId);
    await ctx.reply(`✅ Yaratildi. Vakansiya ID: ${r.rows[0].id}`, {
      reply_markup: kbAdminHome(),
    });
    return;
  }

  // Edit vacancy (title/button)
  if (state === "adm_vac_edit_title") {
    const vacId = Number(data.vacId);
    await setState(userId, "adm_vac_edit_button", { vacId, title: msg });
    await ctx.reply("Button matnini yozing. (misol: 🛒 Sotuvchi)");
    return;
  }

  if (state === "adm_vac_edit_button") {
    const vacId = Number(data.vacId);
    const title = safeStr(data.title);
    const button = msg;

    await q("update vacancies set title=$1, button_text=$2 where id=$3", [
      title,
      button,
      vacId,
    ]);

    await clearState(userId);
    await ctx.reply(`✅ Yangilandi. Vakansiya #${vacId}`, {
      reply_markup: kbAdminHome(),
    });
    return;
  }

  // Ask candidate
  if (state === "admin_ask_candidate") {
    const appId = Number(data.appId);
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

  // HOME
  if (data === "adm:home") {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("🛠 Admin panel:", {
      reply_markup: kbAdminHome(),
    });
    return;
  }

  // VACANCIES
  if (data === "adm:vac:list") {
    await ctx.answerCallbackQuery();
    await editVacancyList(ctx);
    return;
  }

  if (data === "adm:vac:new") {
    await ctx.answerCallbackQuery();
    await setState(userId, "adm_vac_new_title", {});
    await ctx.api.sendMessage(
      userId,
      "Yangi vakansiya nomini yozing. (misol: Sotuvchi)",
    );
    return;
  }

  if (data.startsWith("adm:vac:toggle:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(data.split(":").pop());
    const r = await q(
      "update vacancies set is_active = not is_active where id=$1 returning is_active",
      [vacId],
    );
    const isActive = r.rowCount ? r.rows[0].is_active : false;

    await ctx.editMessageText(
      `Vakansiya #${vacId}\nHolat: ${isActive ? "ON ✅" : "OFF ⛔"}`,
      { reply_markup: kbVacRow(vacId, isActive) },
    );
    return;
  }

  if (data.startsWith("adm:vac:del:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(data.split(":").pop());
    await q("delete from vacancies where id=$1", [vacId]);
    await ctx.editMessageText(`🗑 O‘chirildi. Vakansiya #${vacId}`, {
      reply_markup: kbAdminHome(),
    });
    return;
  }

  if (data.startsWith("adm:vac:edit:")) {
    await ctx.answerCallbackQuery();
    const vacId = Number(data.split(":").pop());
    await setState(userId, "adm_vac_edit_title", { vacId });
    await ctx.api.sendMessage(
      userId,
      `Vakansiya #${vacId}\nYangi nomini yozing:`,
    );
    return;
  }

  // APPS LIST
  if (data === "adm:apps:new") {
    await ctx.answerCallbackQuery();
    await editAppsList(ctx, "new");
    return;
  }

  if (data === "adm:apps:all") {
    await ctx.answerCallbackQuery();
    await editAppsList(ctx, "all");
    return;
  }

  // OPEN APP
  if (data.startsWith("adm:app:open:")) {
    await ctx.answerCallbackQuery();
    const appId = Number(data.split(":").pop());
    const app = await formatApp(appId);
    if (!app) {
      await ctx.editMessageText("Topilmadi.", { reply_markup: kbAdminHome() });
      return;
    }
    await ctx.editMessageText(app.text, {
      reply_markup: kbAppActions(appId, app.phone),
    });
    return;
  }

  // STATUS buttons (same as candidate admin view)
  if (data.startsWith("st:")) {
    const [, appIdStr, st] = data.split(":");
    const appId = Number(appIdStr);
    await q("update applications set status=$1 where id=$2", [st, appId]);
    await ctx.answerCallbackQuery({ text: "Saqlangan" });

    // refresh message text to show updated status
    const app = await formatApp(appId);
    if (app) {
      try {
        await ctx.editMessageText(app.text, {
          reply_markup: kbAppActions(appId, app.phone),
        });
      } catch (_) {}
    }
    return;
  }

  // ASK
  if (data.startsWith("ask:")) {
    const appId = Number(data.split(":")[1]);
    await setState(userId, "admin_ask_candidate", { appId });
    await ctx.answerCallbackQuery();
    await ctx.api.sendMessage(userId, "Nomzodga savol yozing (matn):");
    return;
  }
}

/* =========================
   Internal: send/edit lists
========================= */
async function sendVacancyList(ctx, userId) {
  const r = await q(
    "select id,title,button_text,is_active from vacancies order by id desc",
  );
  if (!r.rowCount) {
    await ctx.reply("Hozircha vakansiya yo‘q.", {
      reply_markup: kbAdminHome(),
    });
    return;
  }
  await ctx.reply("📌 Vakansiyalar:", { reply_markup: buildVacListKb(r.rows) });
}

async function editVacancyList(ctx) {
  const r = await q(
    "select id,title,button_text,is_active from vacancies order by id desc",
  );
  if (!r.rowCount) {
    await ctx.editMessageText("Hozircha vakansiya yo‘q.", {
      reply_markup: kbAdminHome(),
    });
    return;
  }
  await ctx.editMessageText("📌 Vakansiyalar:", {
    reply_markup: buildVacListKb(r.rows),
  });
}

function buildVacListKb(rows) {
  const kb = new InlineKeyboard();
  for (const v of rows) {
    kb.text(
      `${v.is_active ? "✅" : "⛔"} #${v.id} ${v.title}`,
      `adm:vac:toggle:${v.id}`,
    ).row();
  }
  kb.row().text("➕ Yangi", "adm:vac:new").text("⬅️ Orqaga", "adm:home");
  return kb;
}

async function sendAppsList(ctx, userId, mode = "new") {
  const rows = await getApps(mode);
  if (!rows.length) {
    await ctx.reply(
      mode === "new" ? "Yangi arizalar yo‘q." : "Arizalar yo‘q.",
      {
        reply_markup: kbAdminHome(),
      },
    );
    return;
  }
  await ctx.reply(
    mode === "new" ? "📥 Yangi arizalar:" : "📚 Barcha arizalar:",
    { reply_markup: buildAppsKb(rows) },
  );
}

async function editAppsList(ctx, mode = "new") {
  const rows = await getApps(mode);
  if (!rows.length) {
    await ctx.editMessageText(
      mode === "new" ? "Yangi arizalar yo‘q." : "Arizalar yo‘q.",
      {
        reply_markup: kbAdminHome(),
      },
    );
    return;
  }
  await ctx.editMessageText(
    mode === "new" ? "📥 Yangi arizalar:" : "📚 Barcha arizalar:",
    { reply_markup: buildAppsKb(rows) },
  );
}

async function getApps(mode) {
  const sql =
    mode === "new"
      ? `select a.id, a.status, a.full_name, a.phone, v.title
         from applications a
         join vacancies v on v.id=a.vacancy_id
         where a.status='new'
         order by a.id desc
         limit 20`
      : `select a.id, a.status, a.full_name, a.phone, v.title
         from applications a
         join vacancies v on v.id=a.vacancy_id
         order by a.id desc
         limit 30`;
  const r = await q(sql);
  return r.rows || [];
}

function buildAppsKb(rows) {
  const kb = new InlineKeyboard();
  for (const a of rows) {
    const tag =
      a.status === "new"
        ? "🆕"
        : a.status === "accepted"
          ? "✅"
          : a.status === "reserve"
            ? "🟡"
            : "❌";
    const name = safeStr(a.full_name) || "-";
    kb.text(`${tag} #${a.id} ${name}`, `adm:app:open:${a.id}`).row();
  }
  kb.row().text("⬅️ Orqaga", "adm:home");
  return kb;
}
