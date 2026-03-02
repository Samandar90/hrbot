// keyboards.js (PRO - clean, consistent)
import { InlineKeyboard } from "grammy";

export function kbVacancies(vacancies) {
  const kb = new InlineKeyboard();
  for (const v of vacancies) kb.text(v.button_text, `vac:${v.id}`).row();
  kb.row().text("🔄 Qayta boshlash", "cand:restart");
  return kb;
}

export function kbBackRestart() {
  return new InlineKeyboard()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta boshlash", "cand:restart");
}

export function kbYesNoSimple() {
  return new InlineKeyboard()
    .text("Ha", "ans:Ha")
    .text("Yo‘q", "ans:Yo‘q")
    .row()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta boshlash", "cand:restart");
}

export function kbChoice(options) {
  const kb = new InlineKeyboard();
  for (const opt of options || [])
    kb.text(String(opt), `ans:${String(opt)}`).row();
  kb.row()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta boshlash", "cand:restart");
  return kb;
}

export function kbLicense() {
  return new InlineKeyboard()
    .text("B va C", "fresp:license:bc")
    .row()
    .text("Faqat B", "fresp:license:only_b")
    .row()
    .text("B yo‘q / Boshqa", "fresp:license:other")
    .row()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta boshlash", "cand:restart");
}

export function kbAlcohol() {
  return new InlineKeyboard()
    .text("Yo‘q, ichmayman", "fresp:alcohol:no")
    .text("Ha", "fresp:alcohol:yes")
    .row()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta boshlash", "cand:restart");
}

export function kbStatus(appId) {
  return new InlineKeyboard()
    .text("✅ Qabul qilish", `st:${appId}:accepted`)
    .row()
    .text("🟡 Zaxira", `st:${appId}:reserve`)
    .text("❌ Rad etish", `st:${appId}:rejected`)
    .row()
    .text("💬 Savol berish", `ask:${appId}`);
}

export function kbAdminVacancyActions(vacId) {
  return new InlineKeyboard()
    .text("⚙️ Filtrlar", `adm_f:${vacId}`)
    .row()
    .text("🧩 Savollar", `adm_q:${vacId}`)
    .row()
    .text("✅ ON", `adm_on:${vacId}`)
    .text("⛔ OFF", `adm_off:${vacId}`);
}
