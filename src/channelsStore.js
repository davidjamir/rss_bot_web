// src/channelsStore.js
const { redis } = require("./redis");

const channelKey = (chatId) => `channels:${chatId}`;
const CHANNEL_INDEX_KEY = "channels:index"; // set chứa list chatId để cron quét

const sessionKey = (userId) => `sessions:${userId}`;

async function getChannelConfig(chatId) {
  const raw = await redis.get(channelKey(chatId));
  if (!raw) return { feeds: [], last: {} };

  // Upstash redis trả về object/string tùy cách set; mình normalize:
  if (typeof raw === "string") return JSON.parse(raw);
  return raw; // nếu nó đã là object
}

async function saveChannelConfig(chatId, config) {
  // đảm bảo đúng schema
  const safe = {
    feeds: Array.isArray(config.feeds) ? config.feeds : [],
    last: config.last && typeof config.last === "object" ? config.last : {},
  };

  await redis.set(channelKey(chatId), JSON.stringify(safe));

  // add vào index để cron biết channel nào cần chạy
  await redis.sadd(CHANNEL_INDEX_KEY, String(chatId));
}

async function listChannelIds() {
  const ids = await redis.smembers(CHANNEL_INDEX_KEY);
  return (ids || []).map(String);
}

async function deleteChannel(chatId) {
  await redis.del(channelKey(chatId));
  await redis.srem(CHANNEL_INDEX_KEY, String(chatId));
}

async function addFeed(chatId, feedUrl) {
  const cfg = await getChannelConfig(chatId);
  if (!cfg.feeds.includes(feedUrl)) cfg.feeds.push(feedUrl);
  await saveChannelConfig(chatId, cfg);
  return cfg;
}

async function removeFeed(chatId, feedUrl) {
  const cfg = await getChannelConfig(chatId);
  cfg.feeds = cfg.feeds.filter((u) => u !== feedUrl);
  delete cfg.last[feedUrl];
  await saveChannelConfig(chatId, cfg);
  return cfg;
}

// bind session
async function setBoundTarget(userId, targetChatId) {
  await redis.set(sessionKey(userId), JSON.stringify({ targetChatId: String(targetChatId) }));
  // TTL cho session để khỏi rác
  await redis.expire(sessionKey(userId), 7 * 24 * 60 * 60);
}

async function getBoundTarget(userId) {
  const raw = await redis.get(sessionKey(userId));
  if (!raw) return null;
  const v = typeof raw === "string" ? JSON.parse(raw) : raw;
  return v?.targetChatId ? String(v.targetChatId) : null;
}

async function clearBoundTarget(userId) {
  await redis.del(sessionKey(userId));
}

module.exports = {
  getChannelConfig,
  saveChannelConfig,
  listChannelIds,
  deleteChannel,
  addFeed,
  removeFeed,
  setBoundTarget,
  getBoundTarget,
  clearBoundTarget,
};
