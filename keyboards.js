// keyboards.js (FINAL)
import { InlineKeyboard, Keyboard } from "grammy";

/* ===== Candidate ===== */
export function kbVacancies(vacs) {
  const kb = new InlineKeyboard();
  for (const v of vacs) kb.text(v.button_text, `cand:vac:${v.id}`).row();
  kb.row().text("ℹ️ Ma’lumot", "cand:info");
  return kb;
}

export function kbYesNo() {
  return new InlineKeyboard()
    .text("Ha", "cand:ans:Ha")
    .text("Yo‘q", "cand:ans:Yo‘q");
}

export function kbChoice(options = []) {
  const kb = new InlineKeyboard();
  for (const opt of options)
    kb.text(String(opt), `cand:ans:${String(opt)}`).row();
  return kb;
}

export function kbCandidateNav() {
  return new InlineKeyboard()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta", "cand:restart");
}

export function kbRequestContact() {
  return new Keyboard()
    .requestContact("📱 Raqamni yuborish")
    .row()
    .text("🔄 Qayta")
    .oneTime()
    .resized();
}

export function kbRemoveReply() {
  return { remove_keyboard: true };
}

/* ===== Admin ===== */
export function kbAdminHome() {
  return new InlineKeyboard()
    .text("📌 Vakansiyalar", "adm:vac:list")
    .row()
    .text("🧾 Arizalar", "adm:apps:list:0")
    .row()
    .text("➕ Vakansiya qo‘shish", "adm:vac:new");
}

export function kbVacRow(v) {
  return new InlineKeyboard()
    .text(v.is_active ? "⛔ O‘chirish" : "✅ Yoqish", `adm:vac:toggle:${v.id}`)
    .row()
    .text("✏️ Nom", `adm:vac:edit_title:${v.id}`)
    .text("🏷 Button", `adm:vac:edit_btn:${v.id}`)
    .row()
    .text("❓ Savollar", `adm:q:list:${v.id}`)
    .row()
    .text("🗑 O‘chirish", `adm:vac:delete:${v.id}`)
    .row()
    .text("⬅️ Ortga", "adm:home");
}

export function kbQuestionsHome(vacId) {
  return new InlineKeyboard()
    .text("➕ Savol qo‘shish", `adm:q:new:${vacId}`)
    .row()
    .text("⬅️ Ortga", `adm:vac:open:${vacId}`);
}

export function kbQuestionRow(vacId, qid) {
  return new InlineKeyboard()
    .text("✏️ Matn", `adm:q:edit_text:${vacId}:${qid}`)
    .row()
    .text("🔢 Sort", `adm:q:edit_sort:${vacId}:${qid}`)
    .row()
    .text("✅ Javob", `adm:q:edit_correct:${vacId}:${qid}`)
    .row()
    .text("🗑 O‘chirish", `adm:q:delete:${vacId}:${qid}`)
    .row()
    .text("⬅️ Ortga", `adm:q:list:${vacId}`);
}

export function kbPickQType(vacId) {
  return new InlineKeyboard()
    .text("📌 Choice", `adm:q:type:${vacId}:choice`)
    .row()
    .text("✅ Yes/No", `adm:q:type:${vacId}:yesno`)
    .row()
    .text("✍️ Text", `adm:q:type:${vacId}:text`)
    .row()
    .text("🔢 Number", `adm:q:type:${vacId}:number`)
    .row()
    .text("📱 Phone", `adm:q:type:${vacId}:phone`)
    .row()
    .text("⬅️ Ortga", `adm:q:list:${vacId}`);
}

export function kbAppRow(appId) {
  return new InlineKeyboard()
    .text("👁 Ko‘rish", `adm:app:open:${appId}`)
    .row()
    .text("✅ Qabul", `adm:app:st:${appId}:accepted`)
    .text("🟡 Zaxira", `adm:app:st:${appId}:reserve`)
    .row()
    .text("❌ Rad", `adm:app:st:${appId}:rejected`)
    .row()
    .text("💬 Savol", `adm:app:ask:${appId}`)
    .row()
    .text("⬅️ Ortga", "adm:apps:list:0");
}

export function kbAppsPager(page) {
  const kb = new InlineKeyboard();
  if (page > 0) kb.text("⬅️", `adm:apps:list:${page - 1}`);
  kb.text("🔄 Yangilash", `adm:apps:list:${page}`);
  kb.text("➡️", `adm:apps:list:${page + 1}`);
  kb.row().text("⬅️ Menu", "adm:home");
  return kb;
}
