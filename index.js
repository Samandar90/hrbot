// index.js (PREMIUM STABLE)
import "dotenv/config";
import { Bot } from "grammy";
import http from "http";
import { q, isAdmin } from "./db.js";

import {
  handleAdminCommands,
  handleAdminMessages,
  handleAdminCallbacks,
} from "./flows_admin.js";
import {
  startCandidate,
  handleCandidateCallbacks,
  handleCandidateMessages,
} from "./flows_candidate.js";

const bot = new Bot(process.env.BOT_TOKEN);

// Render healthcheck
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
  })
  .listen(process.env.PORT || 3000);

await q("select 1");

bot.command("start", async (ctx) => startCandidate(ctx));

bot.command("help", async (ctx) => {
  const txt = isAdmin(ctx.from?.id)
    ? "Admin:\n/myid\n/vacancy_new\n/vacancy_list\n\nNomzodlar: /start"
    : "Ariza: /start";
  await ctx.reply(txt);
});

bot.command("myid", async (ctx) => {
  await ctx.reply(`Sizning Telegram ID: ${ctx.from.id}`);
});

// admin commands
bot.command("vacancy_new", async (ctx) => handleAdminCommands(ctx));
bot.command("vacancy_list", async (ctx) => handleAdminCommands(ctx));

bot.on("message:text", async (ctx) => {
  // allow admin typed commands too
  const t = (ctx.message.text || "").trim();
  const cmd = t.split(" ")[0].split("@")[0];
  if (cmd === "/vacancy_new" || cmd === "/vacancy_list") {
    await handleAdminCommands(ctx);
    return;
  }

  await handleAdminMessages(ctx);
  await handleCandidateMessages(ctx);
});

bot.on("message:contact", async (ctx) => {
  // contact is used in candidate flow
  await handleCandidateMessages(ctx);
});

bot.on("callback_query:data", async (ctx) => {
  await handleAdminCallbacks(ctx);
  await handleCandidateCallbacks(ctx);
});

bot.catch((err) => console.error("BOT ERROR:", err));
console.log("Bot starting...");
bot.start();
