const { handleCommand } = require("../src/commands");
const { deleteChannel, getChannelConfig, saveChannelConfig } = require("../src/channelsStore");

// đọc raw JSON cho chắc (Vercel env đôi khi req.body không auto-parse)
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = async (req, res) => {
  try {
    const update = await readJson(req);

    // 1) Khi bot được add/kick/đổi quyền trong chat/channel
    // -> cập nhật index/config hoặc xoá
    const m = update.my_chat_member;
    if (m?.chat?.id) {
      const chatId = String(m.chat.id);
      const newStatus = m.new_chat_member?.status;

      if (newStatus === "kicked" || newStatus === "left") {
        await deleteChannel(chatId);
      } else {
        // đảm bảo key tồn tại (không làm mất feeds nếu đã có)
        const cfg = await getChannelConfig(chatId);
        await saveChannelConfig(chatId, cfg);
      }
    }

    // 2) Nhận message command để cấu hình
    if (update.message?.text) {
      await handleCommand(update.message);
    }

    // (tuỳ bạn) nhận command trong channel_post nếu admin post trong channel
    if (update.channel_post?.text) {
      // channel_post có format giống message nhưng field name khác
      await handleCommand({
        ...update.channel_post,
        chat: update.channel_post.chat,
        from: update.channel_post.sender_chat || update.channel_post.from || { id: 0 },
        text: update.channel_post.text,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error:", e);
    // Telegram chỉ cần 200 để không retry spam
    return res.status(200).json({ ok: true });
  }
};
