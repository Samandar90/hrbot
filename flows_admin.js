// flows_admin.js (PREMIUM CORE)
import { q, setState, getState, clearState, isAdmin } from "./db.js";
import { kbStatus } from "./keyboards.js";

export async function handleAdminCommands(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("Kechirasiz, bu buyruqlar faqat admin uchun.");
    return;
  }

  const text = (ctx.message?.text || "").trim();
  const cmd = text.split(" ")[0].split("@")[0];

  if (cmd === "/vacancy_new") {
    await setState(userId, "admin_vac_new_title", {});
    await ctx.reply("Yangi vakansiya nomini yozing. (misol: Sotuvchi)");
    return;
  }

  if (cmd === "/vacancy_list") {
    const r = await q(
      "select id,title,button_text,is_active from vacancies order by id desc",
    );
    if (!r.rowCount) return ctx.reply("Hozircha vakansiya yo‘q.");

    for (const v of r.rows) {
      await ctx.reply(
        `#${v.id} — ${v.title}\nButton: ${v.button_text}\nHolat: ${v.is_active ? "ON ✅" : "OFF ⛔"}`,
      );
    }
    return;
  }
}

export async function handleAdminMessages(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) return;

  const msg = ctx.message?.text?.trim();
  if (!msg) return;

  const st = await getState(userId);
  const state = st?.state || "idle";
  const data = st?.data || {};

  if (state === "admin_vac_new_title") {
    await setState(userId, "admin_vac_new_button", { title: msg });
    await ctx.reply("Button matnini yozing. (misol: 🛒 Sotuvchi)");
    return;
  }

  if (state === "admin_vac_new_button") {
    const title = (data.title || "").trim();
    const button = msg;

    const r = await q(
      "insert into vacancies(title, button_text) values($1,$2) returning id",
      [title, button],
    );

    await clearState(userId);
    await ctx.reply(`✅ Yaratildi. Vakansiya ID: ${r.rows[0].id}`);
    return;
  }

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

export async function handleAdminCallbacks(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) return;

  const data = ctx.callbackQuery?.data || "";

  if (data.startsWith("st:")) {
    const [, appIdStr, st] = data.split(":");
    const appId = Number(appIdStr);
    await q("update applications set status=$1 where id=$2", [st, appId]);
    await ctx.answerCallbackQuery({ text: "Saqlangan" });
    return;
  }

  if (data.startsWith("ask:")) {
    const appId = Number(data.split(":")[1]);
    await setState(userId, "admin_ask_candidate", { appId });
    await ctx.answerCallbackQuery();
    await ctx.api.sendMessage(userId, "Nomzodga savol yozing (matn):");
    return;
  }
}
