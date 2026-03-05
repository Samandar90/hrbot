// flows_admin.js (PREMIUM ADMIN + QUESTIONS + SAFE PURGE)
import { q, setState, getState, clearState, isAdmin } from "./db.js";

function parseCmd(text) {
  const t = (text || "").trim();
  const cmd = t.split(" ")[0].split("@")[0];
  const args = t.split(" ").slice(1);
  return { cmd, args };
}

export async function handleAdminCommands(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("Kechirasiz, bu buyruqlar faqat admin uchun.");
    return;
  }

  const { cmd, args } = parseCmd(ctx.message?.text);

  // Create vacancy
  if (cmd === "/vacancy_new") {
    await setState(userId, "admin_vac_new_title", {});
    await ctx.reply("Yangi vakansiya nomini yozing. (misol: Sotuvchi)");
    return;
  }

  // List vacancies
  if (cmd === "/vacancy_list") {
    const r = await q(
      "select id,title,button_text,is_active from vacancies order by id desc",
    );
    if (!r.rowCount) {
      await ctx.reply("Hozircha vakansiya yo‘q.");
      return;
    }
    for (const v of r.rows) {
      await ctx.reply(
        `#${v.id} — ${v.title}\nButton: ${v.button_text}\nHolat: ${
          v.is_active ? "ON ✅" : "OFF ⛔"
        }\n\nBuyruqlar:\n/vacancy_off ${v.id}\n/vacancy_on ${v.id}\n/q_add ${v.id}\n/q_list ${v.id}\n/q_clear ${v.id}\n/vacancy_purge ${v.id}`,
      );
    }
    return;
  }

  // OFF vacancy
  if (cmd === "/vacancy_off") {
    const id = Number(args[0]);
    if (!Number.isFinite(id))
      return ctx.reply("ID raqam bo‘lishi kerak. Misol: /vacancy_off 3");
    await q("update vacancies set is_active=false where id=$1", [id]);
    await ctx.reply(`⛔ Vakansiya #${id} o‘chirildi (OFF).`);
    return;
  }

  // ON vacancy
  if (cmd === "/vacancy_on") {
    const id = Number(args[0]);
    if (!Number.isFinite(id))
      return ctx.reply("ID raqam bo‘lishi kerak. Misol: /vacancy_on 3");
    await q("update vacancies set is_active=true where id=$1", [id]);
    await ctx.reply(`✅ Vakansiya #${id} yoqildi (ON).`);
    return;
  }

  // PURGE vacancy (delete with all applications+answers)
  if (cmd === "/vacancy_purge") {
    const id = Number(args[0]);
    if (!Number.isFinite(id))
      return ctx.reply("ID raqam bo‘lishi kerak. Misol: /vacancy_purge 3");

    // confirm step
    await setState(userId, "admin_vac_purge_confirm", { id });
    await ctx.reply(
      `⚠️ Diqqat! Vakansiya #${id} va unga tegishli barcha arizalar o‘chadi.\nTasdiqlash uchun: HA deb yozing.\nBekor qilish: YO‘Q`,
    );
    return;
  }

  // Add question start
  if (cmd === "/q_add") {
    const vacId = Number(args[0]);
    if (!Number.isFinite(vacId))
      return ctx.reply("Vakansiya ID kerak. Misol: /q_add 1");

    await setState(userId, "admin_q_add_text", { vacId });
    await ctx.reply("Savol matnini yozing (misol: Qayerda ishlagansiz?)");
    return;
  }

  // List questions
  if (cmd === "/q_list") {
    const vacId = Number(args[0]);
    if (!Number.isFinite(vacId))
      return ctx.reply("Vakansiya ID kerak. Misol: /q_list 1");

    const r = await q(
      "select id, sort, q_type, text from vacancy_questions where vacancy_id=$1 order by sort asc, id asc",
      [vacId],
    );
    if (!r.rowCount) {
      await ctx.reply("Bu vakansiyada savollar yo‘q.");
      return;
    }

    let out = `🧩 Savollar (vakansiya #${vacId}):\n\n`;
    for (const x of r.rows) {
      out += `#${x.id} [${x.q_type}] (sort ${x.sort})\n${x.text}\n\n`;
    }
    out += `Qo‘shish: /q_add ${vacId}\nTozalash: /q_clear ${vacId}`;
    await ctx.reply(out);
    return;
  }

  // Clear questions
  if (cmd === "/q_clear") {
    const vacId = Number(args[0]);
    if (!Number.isFinite(vacId))
      return ctx.reply("Vakansiya ID kerak. Misol: /q_clear 1");

    await q("delete from vacancy_questions where vacancy_id=$1", [vacId]);
    await ctx.reply(`🧹 Vakansiya #${vacId} savollari tozalandi.`);
    return;
  }
}

export async function handleAdminMessages(ctx) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) return;

  const msg = (ctx.message?.text || "").trim();
  if (!msg) return;

  const st = await getState(userId);
  const state = st?.state || "idle";
  const data = st?.data || {};

  // create vacancy flow
  if (state === "admin_vac_new_title") {
    await setState(userId, "admin_vac_new_button", { title: msg });
    await ctx.reply("Button matnini yozing. (misol: 🛒 Sotuvchi)");
    return;
  }

  if (state === "admin_vac_new_button") {
    const title = (data.title || "").trim();
    const button = msg;

    try {
      const r = await q(
        "insert into vacancies(title, button_text) values($1,$2) returning id",
        [title, button],
      );
      await clearState(userId);
      await ctx.reply(
        `✅ Yaratildi. Vakansiya ID: ${r.rows[0].id}\nSavol qo‘shish: /q_add ${r.rows[0].id}`,
      );
    } catch (e) {
      await clearState(userId);
      console.error("vacancy insert error:", e);
      await ctx.reply(
        "❌ Xatolik: vakansiya yaratilmadi. Qayta urinib ko‘ring: /vacancy_new",
      );
    }
    return;
  }

  // purge confirm
  if (state === "admin_vac_purge_confirm") {
    const id = Number(data.id);
    if (!Number.isFinite(id)) {
      await clearState(userId);
      await ctx.reply("❌ Xatolik: ID topilmadi.");
      return;
    }

    if (msg.toUpperCase() !== "HA") {
      await clearState(userId);
      await ctx.reply("Bekor qilindi ✅");
      return;
    }

    // delete answers -> applications -> vacancy
    await q(
      `delete from application_answers
       where application_id in (select id from applications where vacancy_id=$1)`,
      [id],
    );
    await q("delete from applications where vacancy_id=$1", [id]);
    await q("delete from vacancy_questions where vacancy_id=$1", [id]);
    await q("delete from vacancy_filters where vacancy_id=$1", [id]);
    await q("delete from vacancies where id=$1", [id]);

    await clearState(userId);
    await ctx.reply(`🗑️ Vakansiya #${id} va barcha arizalar o‘chirildi.`);
    return;
  }

  // add question (simple text)
  if (state === "admin_q_add_text") {
    const vacId = Number(data.vacId);
    if (!Number.isFinite(vacId)) {
      await clearState(userId);
      await ctx.reply("❌ Xatolik: vacId topilmadi.");
      return;
    }

    // auto sort +10
    const s = await q(
      "select coalesce(max(sort),0)+10 as next from vacancy_questions where vacancy_id=$1",
      [vacId],
    );
    const sort = s.rows?.[0]?.next ?? 10;

    await q(
      "insert into vacancy_questions(vacancy_id, sort, q_type, text, options, required) values($1,$2,$3,$4,$5::jsonb,$6)",
      [vacId, sort, "text", msg, "[]", true],
    );

    await clearState(userId);
    await ctx.reply(`✅ Savol qo‘shildi.\nKo‘rish: /q_list ${vacId}`);
    return;
  }
}

export async function handleAdminCallbacks(ctx) {
  // в твоей “premium” версии тут только статус и ask, оставляем как было
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
