const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const auth = require("../middleware/auth");

// ── POST /api/closing/close
// تقفيل الشيفت — كل الحسابات هنا في الباك
router.post("/close", auth, async (req, res) => {
  try {
    const { month, collected = {}, expenses = [] } = req.body;

    if (!month) {
      return res.status(400).json({ error: "اسم الشيفت/الشهر مطلوب" });
    }

    // ── جيب كل الأوردرات الـ active
    const ordersSnap = await db.collection("orders")
      .where("archived", "==", false).get();
    const activeOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (activeOrders.length === 0) {
      return res.status(400).json({ error: "مفيش أوردرات في الشيفت الحالي" });
    }

    // ── جيب المصاريف الـ active
    const expSnap = await db.collection("expenses")
      .where("archived", "==", false).get();
    const shiftExpenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ── جيب المندوبين
    const agentsSnap = await db.collection("agents").get();
    const agents = agentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ════════════════════════════════
    //  حسابات الشيفت (كلها في الباك)
    // ════════════════════════════════

    // إجمالي شغل كل مندوب
    const agentStats = agents.map(a => {
      const myOrders = activeOrders.filter(o => o.agentId === a.id);
      const total = myOrders.reduce((s, o) => s + (o.value || 0), 0);
      const officeShare = Math.round(total / 3); // نصيب المكتب ÷3
      return { id: a.id, name: a.name, count: myOrders.length, total, officeShare };
    }).filter(a => a.count > 0);

    // إجمالي كل الأوردرات
    const totalWork = activeOrders.reduce((s, o) => s + (o.value || 0), 0);

    // نصيب المكتب = مجموع نصيب كل مندوب
    const officeShare = agentStats.reduce((s, a) => s + a.officeShare, 0);

    // المصاريف
    const totalExpenses = shiftExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    // الصافي
    const net = officeShare - totalExpenses;

    // أرقام الأوردرات
    const nums = activeOrders.map(o => parseInt(o.num?.replace("#", "") || "0")).filter(n => n > 0);
    const firstNum = nums.length ? Math.min(...nums) : null;
    const lastNum = nums.length ? Math.max(...nums) : null;

    const now = new Date().toISOString();

    // ── جلب معلومات المستخدم الحالي
    const userSnap = await db.collection("users").doc(req.uid).get();
    const userName = userSnap.exists ? userSnap.data().name : req.uid;

    // ── بناء الـ Shift Summary
    const shiftSummary = {
      month,
      ordersCount: activeOrders.length,
      firstNum,
      lastNum,
      totalWork,
      officeShare,
      expenses: totalExpenses,
      net,
      agentStats,
      expensesList: shiftExpenses.map(e => ({ name: e.name || e.description || "مصروف", amount: e.amount || 0 })),
      orders: activeOrders,
      closedAt: now,
      closedBy: userName,
    };

    // ── Batch write
    const batch = db.batch();
    const shiftRef = db.collection("shift_summaries").doc();

    // أرشفة الأوردرات
    activeOrders.forEach(o => {
      batch.update(db.collection("orders").doc(o.id), { archived: true, archivedAt: now });
    });

    // أرشفة المصاريف
    shiftExpenses.forEach(e => {
      batch.update(db.collection("expenses").doc(e.id), { archived: true, archivedAt: now });
    });

    // حفظ الـ Summary
    batch.set(shiftRef, shiftSummary);

    // إيداع الصافي في خزنة المكتب
    const officeVaultSnap = await db.collection("vaults").where("type", "==", "office").limit(1).get();
    if (!officeVaultSnap.empty) {
      const officeVault = officeVaultSnap.docs[0];
      const currentBalance = officeVault.data().balance || 0;
      const deposit = Math.max(0, net);

      batch.update(db.collection("vaults").doc(officeVault.id), {
        balance: currentBalance + deposit,
      });

      const txRef = db.collection("vault_txns").doc();
      batch.set(txRef, {
        type: "deposit",
        toVaultId: officeVault.id,
        toVaultName: "شغل المكتب",
        amount: deposit,
        note: `صافي الشيفت — نصيب المكتب ${officeShare} ج - مصاريف ${totalExpenses} ج`,
        createdAt: now,
        createdBy: userName,
      });
    }

    await batch.commit();

    // تسجيل في app_txns
    await db.collection("app_txns").add({
      action: "تقفيل شيفت",
      details: `${activeOrders.length} أوردر · من #${String(firstNum).padStart(3, "0")} لـ #${String(lastNum).padStart(3, "0")} · صافي ${net} ج`,
      ref: shiftRef.id,
      byId: req.uid,
      at: now,
      ts: Date.now(),
    });

    res.json({
      success: true,
      summary: {
        ordersCount: activeOrders.length,
        totalWork,
        officeShare,
        totalExpenses,
        net,
        firstNum,
        lastNum,
        agentStats,
        closedAt: now,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/closing/summaries
// جيب كل تقافيل الشيفتات
router.get("/summaries", auth, async (req, res) => {
  try {
    const snap = await db.collection("shift_summaries")
      .orderBy("closedAt", "desc").limit(50).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/closing/expenses
// جيب مصاريف الشيفت الحالي
router.get("/expenses", auth, async (req, res) => {
  try {
    const snap = await db.collection("expenses")
      .where("archived", "==", false).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/closing/expenses
// إضافة مصروف
router.post("/expenses", auth, async (req, res) => {
  try {
    const { name, amount } = req.body;

    if (!name || !amount) {
      return res.status(400).json({ error: "الاسم والمبلغ مطلوبين" });
    }
    if (isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: "المبلغ لازم يكون أكبر من صفر" });
    }

    const docRef = await db.collection("expenses").add({
      name,
      amount: Number(amount),
      archived: false,
      createdAt: Date.now(),
      createdBy: req.uid,
    });

    res.json({ id: docRef.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/closing/expenses/:id
router.delete("/expenses/:id", auth, async (req, res) => {
  try {
    await db.collection("expenses").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
