const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const auth = require("../middleware/auth");

// ── GET /api/agents
router.get("/", auth, async (req, res) => {
  try {
    const snap = await db.collection("agents").get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents
router.post("/", auth, async (req, res) => {
  try {
    const { name, phone, nationalId, bikeNum } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: "الاسم والتليفون مطلوبين" });
    }

    const docRef = await db.collection("agents").add({
      name,
      phone,
      nationalId: nationalId || "",
      bikeNum: bikeNum || "",
      status: "active",
    });

    await db.collection("app_txns").add({
      action: "إضافة مندوب",
      details: `${name} · ${phone}`,
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

// ── PUT /api/agents/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, nationalId, bikeNum } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: "الاسم والتليفون مطلوبين" });
    }

    await db.collection("agents").doc(id).set(
      { name, phone, nationalId: nationalId || "", bikeNum: bikeNum || "" },
      { merge: true }
    );

    await db.collection("app_txns").add({
      action: "تعديل مندوب",
      details: name,
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

// ── PATCH /api/agents/:id/status
// تغيير حالة المندوب (شغال / إجازة)
router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "vacation"].includes(status)) {
      return res.status(400).json({ error: "حالة غير صحيحة" });
    }

    await db.collection("agents").doc(id).set({ status }, { merge: true });

    await db.collection("app_txns").add({
      action: "تغيير حالة مندوب",
      details: `${id} → ${status === "active" ? "شغال" : "إجازة"}`,
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

// ── DELETE /api/agents/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await db.collection("agents").doc(id).get();
    const name = snap.exists ? snap.data().name : id;

    await db.collection("agents").doc(id).delete();

    await db.collection("app_txns").add({
      action: "حذف مندوب",
      details: name,
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
