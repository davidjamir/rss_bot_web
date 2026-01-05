const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function tg(method, payload) {
  if (!BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`TG ${method} error: ${JSON.stringify(data)}`);
  return data.result;
}

async function sendMessage(chat_id, text) {
  return tg("sendMessage", {
    chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  });
}

async function getChat(chat_id) {
  return tg("getChat", { chat_id });
}

// check quyền của user đối với chat/channel target
async function getUserMember(targetChatId, userId) {
  return tg("getChatMember", { chat_id: targetChatId, user_id: userId });
}

function isAdminLike(member) {
  return member?.status === "administrator" || member?.status === "creator";
}

module.exports = { tg, sendMessage, getChat, getUserMember, isAdminLike };
