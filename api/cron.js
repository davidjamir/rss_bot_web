// api/cron.js
import { runRssToTelegram } from "../src/job.js";

module.exports = async (req, res) => {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const result = await runRssToTelegram();
    return res.status(200).json({ ok: true, at: new Date().toISOString(), result });
  } catch (err) {
    console.error("cron error:", err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
};
