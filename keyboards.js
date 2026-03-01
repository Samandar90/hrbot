import { InlineKeyboard } from "grammy";

export function kbVacancies(vacancies) {
  const kb = new InlineKeyboard();
  for (const v of vacancies) kb.text(v.button_text, `vac:${v.id}`).row();
  return kb;
}

export function kbYesNo(prefix) {
  return new InlineKeyboard()
    .text("Ha", `${prefix}:yes`)
    .text("Yo‘q", `${prefix}:no`);
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
