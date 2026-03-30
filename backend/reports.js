const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const auth = require("../middleware/auth");

// ── GET /api/reports
// جيب كل التقارير الشهرية
router.get("/", auth, async (req, res) => {
  try {
    const snap = await db.collection("monthly_reports")
      .orderBy("closedAt", "desc").limit(24).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/reports/close
// إغلاق الشهر — يجمع كل تقافيل الشيفتات في تقرير شهري
router.post("/close", auth, async (req, res) => {
  try {
    const { month } = req.body;

    if (!month) {
      return res.status(400).json({ error: "الشهر مطلوب" });
    }

    // جيب كل شيفتات الشهر ده
    const shiftsSnap = await db.collection("shift_summaries")
      .where("month", "==", month).get();
    const shifts = shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (shifts.length === 0) {
      return res.status(400).json({ error: "مفيش شيفتات لإغلاق الشهر ده" });
    }

    // ════════════
    //  حسابات التقرير الشهري
    // ════════════
    const totalOrders = shifts.reduce((s, sh) => s + (sh.ordersCount || 0), 0);
    const totalWork = shifts.reduce((s, sh) => s + (sh.totalWork || 0), 0);
    const totalOffice = shifts.reduce((s, sh) => s + (sh.officeShare || 0), 0);
    const totalExpenses = shifts.reduce((s, sh) => s + (sh.expenses || 0), 0);
    const net = totalOffice - totalExpenses;

    const now = new Date().toISOString();
    const userSnap = await db.collection("users").doc(req.uid).get();
    const userName = userSnap.exists ? userSnap.data().name : req.uid;

    const report = {
      month,
      shiftsCount: shifts.length,
      totalOrders,
      totalWork,
      totalOffice,
      expenses: totalExpenses,
      net,
      closedAt: now,
      closedBy: userName,
    };

    const reportRef = await db.collection("monthly_reports").add(report);

    await db.collection("app_txns").add({
      action: "إغلاق شهر",
      details: `${month} · ${totalOrders} أوردر · صافي ${net} ج`,
      ref: reportRef.id,
      byId: req.uid,
      at: now,
      ts: Date.now(),
    });

    res.json({ success: true, id: reportRef.id, report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
