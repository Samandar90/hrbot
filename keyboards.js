// keyboards.js (PREMIUM v2)
import { InlineKeyboard, Keyboard } from "grammy";

/* ===============================
   Candidate keyboards
================================ */

export function kbVacancies(vacancies) {
  const kb = new InlineKeyboard();

  for (let i = 0; i < vacancies.length; i += 2) {
    const v1 = vacancies[i];
    const v2 = vacancies[i + 1];

    if (v2) {
      kb.text(v1.button_text, `vac:${v1.id}`)
        .text(v2.button_text, `vac:${v2.id}`)
        .row();
    } else {
      kb.text(v1.button_text, `vac:${v1.id}`).row();
    }
  }

  kb.row().text("ℹ️ Ma’lumot", "cand:info");
  kb.row().text("🔄 Qayta", "cand:restart");

  return kb;
}

export function kbNav() {
  return new InlineKeyboard()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta", "cand:restart");
}

export function kbAgeBuckets() {
  return new InlineKeyboard()
    .text("18–20", "age:18_20")
    .text("21–25", "age:21_25")
    .row()
    .text("26–30", "age:26_30")
    .text("31+", "age:31_plus")
    .row()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta", "cand:restart");
}

export function kbLicense() {
  return new InlineKeyboard()
    .text("B + C", "fresp:license:bc")
    .row()
    .text("Faqat B", "fresp:license:only_b")
    .row()
    .text("Yo‘q / Boshqa", "fresp:license:other")
    .row()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta", "cand:restart");
}

export function kbAlcohol() {
  return new InlineKeyboard()
    .text("Ichmayman", "fresp:alcohol:no")
    .text("Ichaman", "fresp:alcohol:yes")
    .row()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta", "cand:restart");
}

export function kbExperience() {
  return new InlineKeyboard()
    .text("0", "exp:0")
    .text("1 yil", "exp:1")
    .text("2+ yil", "exp:2p")
    .row()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta", "cand:restart");
}

export function kbShift() {
  return new InlineKeyboard()
    .text("Kunduz", "shift:day")
    .text("Kech", "shift:night")
    .row()
    .text("Farqi yo‘q", "shift:any")
    .row()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta", "cand:restart");
}

export function kbStartPref() {
  return new InlineKeyboard()
    .text("Bugun", "start:today")
    .text("Ertaga", "start:tomorrow")
    .row()
    .text("1 hafta ichida", "start:week")
    .row()
    .text("⬅️ Ortga", "cand:back")
    .text("🔄 Qayta", "cand:restart");
}

export function kbConfirm() {
  return new InlineKeyboard()
    .text("✅ Tasdiqlash", "cand:confirm")
    .row()
    .text("✏️ Ismni o‘zgartirish", "cand:edit_name")
    .text("📱 Telefonni o‘zgartirish", "cand:edit_phone")
    .row()
    .text("🔄 Qayta", "cand:restart");
}

export function kbInfoBack() {
  return new InlineKeyboard().text("⬅️ Ortga", "cand:back");
}

/* ===============================
   Contact keyboard
================================ */

export function kbRequestContact() {
  return new Keyboard()
    .requestContact("📱 Raqamni yuborish")
    .row()
    .text("⬅️ Ortga")
    .text("🔄 Qayta")
    .oneTime()
    .resized();
}

export function kbRemoveReply() {
  return { remove_keyboard: true };
}

/* ===============================
   Admin buttons
================================ */

export function kbStatus(appId) {
  return new InlineKeyboard()
    .text("✅ Qabul", `st:${appId}:accepted`)
    .text("🟡 Zaxira", `st:${appId}:reserve`)
    .row()
    .text("❌ Rad", `st:${appId}:rejected`)
    .row()
    .text("💬 Savol berish", `ask:${appId}`);
}
