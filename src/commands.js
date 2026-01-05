const {
  addFeed,
  removeFeed,
  getChannelConfig,
  deleteChannel,
  setBoundTarget,
  getBoundTarget,
  clearBoundTarget,
} = require("./channelsStore");

const { sendMessage, getChat, getUserMember, isAdminLike } = require("./telegram");

function normalizeUrl(u) {
  if (!u) return "";
  return u.trim();
}

function fmtFeeds(cfg) {
  const feeds = cfg.feeds || [];
  if (!feeds.length) return "Không có feed nào.";
  return feeds.map((u, i) => `${i + 1}) ${u}`).join("\n");
}

// xác định “targetChatId” cho command
async function resolveTargetChatId(message) {
  const chat = message.chat;
  const from = message.from;

  // nếu command gõ trong group/supergroup/channel => target = chat hiện tại
  if (chat.type !== "private") return String(chat.id);

  // nếu DM => lấy binding session
  const bound = await getBoundTarget(from.id);
  return bound; // có thể null
}

async function handleCommand(message) {
  const text = (message.text || "").trim();
  const chatIdToReply = String(message.chat.id);
  const userId = message.from?.id;

  if (!text.startsWith("/")) return;

  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.split("@")[0]; // /addfeed@botname => /addfeed
  const arg = rest.join(" ").trim();

  // HELP
  if (cmd === "/help" || cmd === "/start") {
    return sendMessage(
      chatIdToReply,
      [
        "<b>RSS Bot Commands</b>",
        "In group/supergroup: Apply for group.",
        "In Private Chat: Require <b>/bind</b> for select channel/group target.",
        "<b>/bind</b> @channel_username or -100xxxx (Only Private Chat)",
        "<b>/unbind</b>  (Only Private Chat)",
        "<b>/addfeed</b> https://example.com/rss",
        "<b>/removefeed</b> https://example.com/rss",
        "<b>/listfeeds</b>",
        "<b>/reset</b>  (Reset Config)",
      ].join("\n")
    );
  }

  // UNBIND (DM only)
  if (cmd === "/unbind") {
    if (message.chat.type !== "private") {
      return sendMessage(chatIdToReply, "Only apply in private chat.");
    }
    await clearBoundTarget(userId);
    return sendMessage(chatIdToReply, "OK, unbind successful.");
  }

  // BIND (DM only): /bind @xxx hoặc /bind -100xxx
  if (cmd === "/bind") {
    if (message.chat.type !== "private") {
      return sendMessage(chatIdToReply, "Only apply in private chat.");
    }
    if (!arg) {
      return sendMessage(chatIdToReply, "Use <code>/bind @channel</code> or <code>/bind -100xxxx</code>");
    }

    // resolve chat by username/id
    let targetChat;
    try {
      targetChat = await getChat(arg);
    } catch (e) {
      return sendMessage(chatIdToReply, `Not found chat/channel: ${arg}`);
    }

    const targetId = String(targetChat.id);

    // check user có phải admin của target không (để tránh người lạ bind bậy)
    try {
      const mem = await getUserMember(targetId, userId);
      if (!isAdminLike(mem)) {
        return sendMessage(
          chatIdToReply,
          "You are not admin/creator of channel/group, bind failed."
        );
      }
    } catch (e) {
      // Nếu bot chưa có quyền getChatMember ở channel đó, bind vẫn ok nhưng cảnh báo
      // (thực tế: bot thường phải được add vào channel để check member; tuỳ channel settings)
    }

    await setBoundTarget(userId, targetId);
    return sendMessage(
      chatIdToReply,
      `OK, bind target successful: <b>${targetChat.title || targetChat.username || targetId}</b>\nYou can use /addfeed /listfeeds...`
    );
  }

  // resolve target
  const targetChatId = await resolveTargetChatId(message);
  if (!targetChatId) {
    return sendMessage(chatIdToReply, "Private Chat. Require <code>/bind @channel</code> before.");
  }

  // ADDFEED
  if (cmd === "/addfeed") {
    const url = normalizeUrl(arg);
    if (!url) return sendMessage(chatIdToReply, "Use <code>/addfeed https://site/rss</code>");
    await addFeed(targetChatId, url);
    const cfg = await getChannelConfig(targetChatId);
    return sendMessage(chatIdToReply, `Added feed.\n\n<b>Feeds:</b>\n${fmtFeeds(cfg)}`);
  }

  // REMOVEFEED
  if (cmd === "/removefeed") {
    const url = normalizeUrl(arg);
    if (!url) return sendMessage(chatIdToReply, "Use <code>/removefeed https://site/rss</code>");
    await removeFeed(targetChatId, url);
    const cfg = await getChannelConfig(targetChatId);
    return sendMessage(chatIdToReply, `Removed feed.\n\n<b>Feeds:</b>\n${fmtFeeds(cfg)}`);
  }

  // LISTFEEDS
  if (cmd === "/listfeeds") {
    const cfg = await getChannelConfig(targetChatId);
    return sendMessage(chatIdToReply, `<b>Feeds:</b>\n${fmtFeeds(cfg)}`);
  }

  // RESET
  if (cmd === "/reset") {
    await deleteChannel(targetChatId);
    return sendMessage(chatIdToReply, "Reset config successful.");
  }

  return sendMessage(chatIdToReply, "Need /help for details.");
}

module.exports = { handleCommand };
