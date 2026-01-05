// src/rssJob.js
const Parser = require("rss-parser");
const {
  listChannelIds,
  getChannelConfig,
  saveChannelConfig,
} = require("./channelsStore");

const parser = new Parser({ timeout: 15000 });

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  const data = await resp.json();
  if (!data.ok) throw new Error(`Telegram error: ${JSON.stringify(data)}`);
}

function esc(s = "") {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function stripHtml(s = "") {
  return s.replace(/<[^>]*>/g, " ");
}

// escape cho attribute trong HTML (href)
function escAttr(s = "") {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatDateVN(input) {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";

  // "Jan 01 2026 16:40"
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("month")} ${get("day")} ${get("year")} ${get("hour")}:${get(
    "minute"
  )}`;
}
const ZWSP = "\u200B";

function breakUrl(u = "") {
  return u.replace("://", `:${ZWSP}//`).replace(/\./g, `.${ZWSP}`);
}

// Phá auto-link trong 1 đoạn text (mô tả)
function breakAutoLinks(text = "") {
  // 1) phá link có scheme: https://...
  let out = text.replace(/https?:\/\/[^\s]+/gi, (m) => breakUrl(m));

  // 2) phá domain dạng: quietly.it, abc.com/path
  // (chỉ bắt những cái có TLD >=2 chữ để tránh phá "a.b")
  out = out.replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi, (m) =>
    m.includes(ZWSP) ? m : m.replace(/\./g, `.${ZWSP}`)
  );

  return out;
}

function formatItem(item, feedTitle = "", feedUrl = "") {
  const title = esc((item.title || "New post").trim());
  const link = (item.link || "").trim();

  const rawDesc = item.contentSnippet || item.summary || item.content || "";
  const desc = esc(breakAutoLinks(stripHtml(rawDesc).trim())).slice(0, 300);

  const domain = link ? new URL(link).hostname.replace(/^www\./, "") : "";
  const when = formatDateVN(item.isoDate || item.pubDate);

  const lines = [];

  // Title as clickable link
  if (link) lines.push(`<a href="${escAttr(link)}"><b>${title}</b></a>`);
  else lines.push(`<b>${title}</b>`);

  if (desc) lines.push(desc);

  // meta
  const meta = [
    feedTitle && esc(feedTitle),
    domain && esc(breakAutoLinks(domain)),
    when && esc(when),
  ]
    .filter(Boolean)
    .join(" • ");
  if (meta) lines.push(`<i>${meta}</i>`);

  // last line: feed link
  if (feedUrl) lines.push(`<i>Feed: ${esc(breakAutoLinks(feedUrl))}</i>`);

  return lines.join("\n");
}

/**
 * Trả về list item mới dựa trên lastLink.
 * - Nếu lastLink tồn tại và tìm thấy trong list => items trước nó là mới.
 * - Nếu lastLink không tìm thấy (feed đổi link / reorder) => fallback: chỉ lấy top N (ví dụ 1-3)
 */
function getNewItems(items, lastLink, fallbackTake = 1) {
  if (!items?.length) return [];

  //Test
  return items.slice(0, fallbackTake);

  if (!lastLink) {
    // lần đầu: tránh spam, chỉ lấy 1
    return items.slice(0, fallbackTake);
  }

  const idx = items.findIndex((it) => it.link === lastLink);
  if (idx === -1) {
    // Không thấy lastLink: feed có thể đổi link hoặc reorder
    // để an toàn không spam, chỉ lấy 1
    return items.slice(0, fallbackTake);
  }

  // items[0..idx-1] là mới
  return items.slice(0, idx);
}

async function runRssToTelegram() {
  const chatIds = await listChannelIds();
  const results = [];

  for (const chatId of chatIds) {
    const cfg = await getChannelConfig(chatId);
    const last = cfg.last || {};
    let posted = 0;

    for (const feedUrl of cfg.feeds || []) {
      const feed = await parser.parseURL(feedUrl);
      const items = feed.items || [];

      // Giữ thứ tự mới -> cũ như RSS hay trả về (thường newest first)
      const lastLink = last[feedUrl] || "";

      const newItems = getNewItems(items, lastLink, 1);

      // Nếu có item mới => đăng theo thứ tự cũ->mới cho đẹp
      for (const item of [...newItems].reverse()) {
        await sendTelegramMessage(
          chatId,
          formatItem(item, feed.title, feedUrl)
        );
        posted++;
      }

      // Update lastLink = item mới nhất (items[0])
      if (items[0]?.link) last[feedUrl] = items[0].link;
    }

    cfg.last = last;
    await saveChannelConfig(chatId, cfg);

    results.push({ chatId, feeds: (cfg.feeds || []).length, posted });
  }

  return { ok: true, results };
}

module.exports = { runRssToTelegram };
