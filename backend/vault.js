const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const auth = require("../middleware/auth");

// ── GET /api/vault
// جيب كل الخزن + آخر 20 معاملة
router.get("/", auth, async (req, res) => {
  try {
    const [vSnap, txSnap] = await Promise.all([
      db.collection("vaults").get(),
      db.collection("vault_txns").orderBy("createdAt", "desc").limit(20).get(),
    ]);

    res.json({
      vaults: vSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      txns: txSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vault
// إضافة خزنة حرة جديدة
router.post("/", auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "اسم الخزنة مطلوب" });
    }

    const docRef = await db.collection("vaults").add({
      name: name.trim(),
      type: "free",
      balance: 0,
      locked: false,
      createdAt: Date.now(),
    });

    await db.collection("app_txns").add({
      action: "إضافة خزنة",
      details: name.trim(),
      ref: docRef.id,
      byId: req.uid,
      at: new Date().toISOString(),
      ts: Date.now(),
    });

    res.json({ id: docRef.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/vault/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await db.collection("vaults").doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: "الخزنة مش موجودة" });

    const vault = snap.data();
    if (vault.type === "office") {
      return res.status(400).json({ error: "مينفعش تحذف خزنة المكتب" });
    }
    if ((vault.balance || 0) > 0) {
      return res.status(400).json({ error: "الخزنة فيها رصيد، حوّله الأول" });
    }

    await db.collection("vaults").doc(id).delete();

    await db.collection("app_txns").add({
      action: "حذف خزنة",
      details: vault.name,
      ref: id,
      byId: req.uid,
      at: new Date().toISOString(),
      ts: Date.now(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vault/transfer
// تحويل بين خزنتين
router.post("/transfer", auth, async (req, res) => {
  try {
    const { fromId, toId, amount, note } = req.body;

    if (!fromId || !toId || !amount) {
      return res.status(400).json({ error: "بيانات ناقصة" });
    }
    if (isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: "المبلغ لازم يكون أكبر من صفر" });
    }
    if (fromId === toId) {
      return res.status(400).json({ error: "مينفعش تحوّل لنفس الخزنة" });
    }

    const [fromSnap, toSnap] = await Promise.all([
      db.collection("vaults").doc(fromId).get(),
      db.collection("vaults").doc(toId).get(),
    ]);

    if (!fromSnap.exists || !toSnap.exists) {
      return res.status(404).json({ error: "خزنة مش موجودة" });
    }

    const fromData = fromSnap.data();
    const toData = toSnap.data();
    const transferAmount = Number(amount);

    if ((fromData.balance || 0) < transferAmount) {
      return res.status(400).json({ error: "الرصيد مش كافي" });
    }

    const now = new Date().toISOString();
    const batch = db.batch();

    // خصم من المصدر
    batch.update(db.collection("vaults").doc(fromId), {
      balance: (fromData.balance || 0) - transferAmount,
    });

    // إضافة للوجهة
    batch.update(db.collection("vaults").doc(toId), {
      balance: (toData.balance || 0) + transferAmount,
    });

    // تسجيل المعاملة
    const txRef = db.collection("vault_txns").doc();
    batch.set(txRef, {
      type: "transfer",
      fromVaultId: fromId,
      fromVaultName: fromData.name,
      toVaultId: toId,
      toVaultName: toData.name,
      amount: transferAmount,
      note: note || "",
      createdAt: now,
      createdBy: req.uid,
    });

    await batch.commit();

    await db.collection("app_txns").add({
      action: "تحويل بين خزن",
      details: `${fromData.name} → ${toData.name} · ${transferAmount} ج`,
      byId: req.uid,
      at: now,
      ts: Date.now(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
