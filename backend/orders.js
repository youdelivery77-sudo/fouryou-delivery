const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const auth = require("../middleware/auth");

// ── GET /api/orders
// جيب كل الأوردرات (active فقط)
router.get("/", auth, async (req, res) => {
  try {
    const snap = await db.collection("orders").get();
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/orders
// إضافة أوردر جديد
router.post("/", auth, async (req, res) => {
  try {
    const { customerName, phone, address, agentId, status, value, notes } = req.body;

    // Validation
    if (!customerName || !phone || !agentId || !value) {
      return res.status(400).json({ error: "بيانات ناقصة: الاسم، التليفون، المندوب، والقيمة مطلوبين" });
    }
    if (isNaN(value) || Number(value) <= 0) {
      return res.status(400).json({ error: "القيمة لازم تكون رقم أكبر من صفر" });
    }

    // رقم الأوردر التالي
    const counterRef = db.collection("settings").doc("orderCounter");
    const counterSnap = await counterRef.get();
    let last = counterSnap.exists ? (counterSnap.data().lastNum || 0) : 0;
    let next = last + 1;
    if (next > 1000) next = 1;
    await counterRef.set({ lastNum: next });
    const num = `#${String(next).padStart(3, "0")}`;

    const orderData = {
      customerName,
      phone,
      address: address || "",
      agentId,
      status: status || "ongoing",
      value: Number(value),
      notes: notes || "",
      num,
      createdAt: Date.now(),
      archived: false,
    };

    const docRef = await db.collection("orders").add(orderData);

    // لو العميل مش موجود → ضيفه تلقائي
    const custSnap = await db.collection("customers")
      .where("phone", "==", phone).limit(1).get();
    if (custSnap.empty) {
      await db.collection("customers").add({ name: customerName, phone, address: address || "" });
    }

    // سجّل في app_txns
    await db.collection("app_txns").add({
      action: "إضافة أوردر",
      details: `${num} · ${customerName} · ${value} ج`,
      ref: docRef.id,
      byId: req.uid,
      at: new Date().toISOString(),
      ts: Date.now(),
    });

    res.json({ id: docRef.id, num });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/orders/:id
// تعديل أوردر
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { customerName, phone, address, agentId, status, value, notes } = req.body;

    if (!customerName || !phone || !agentId || !value) {
      return res.status(400).json({ error: "بيانات ناقصة" });
    }
    if (isNaN(value) || Number(value) <= 0) {
      return res.status(400).json({ error: "القيمة لازم تكون رقم أكبر من صفر" });
    }

    await db.collection("orders").doc(id).set(
      { customerName, phone, address: address || "", agentId, status, value: Number(value), notes: notes || "" },
      { merge: true }
    );

    await db.collection("app_txns").add({
      action: "تعديل أوردر",
      details: `${id} · ${customerName} · ${value} ج`,
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

// ── PATCH /api/orders/:id/status
// تغيير حالة الأوردر بس
router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["ongoing", "delivered", "returned", "postponed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "حالة غير صحيحة" });
    }

    await db.collection("orders").doc(id).set({ status }, { merge: true });

    await db.collection("app_txns").add({
      action: "تغيير حالة أوردر",
      details: `${id} → ${status}`,
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

// ── DELETE /api/orders/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection("orders").doc(id).delete();

    await db.collection("app_txns").add({
      action: "حذف أوردر",
      details: id,
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

module.exports = router;
