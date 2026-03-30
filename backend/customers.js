const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const auth = require("../middleware/auth");

// ── GET /api/customers
router.get("/", auth, async (req, res) => {
  try {
    const snap = await db.collection("customers").get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/customers
router.post("/", auth, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: "الاسم والتليفون مطلوبين" });
    }
    const docRef = await db.collection("customers").add({
      name, phone, address: address || ""
    });
    await db.collection("app_txns").add({
      action: "إضافة عميل", details: `${name} · ${phone}`,
      ref: docRef.id, byId: req.uid,
      at: new Date().toISOString(), ts: Date.now()
    });
    res.json({ id: docRef.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/customers/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: "الاسم والتليفون مطلوبين" });
    }
    await db.collection("customers").doc(req.params.id)
      .set({ name, phone, address: address || "" }, { merge: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/customers/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const snap = await db.collection("customers").doc(req.params.id).get();
    const c = snap.exists ? snap.data() : {};
    await db.collection("customers").doc(req.params.id).delete();
    await db.collection("app_txns").add({
      action: "حذف عميل", details: `${c.name||""} · ${c.phone||""}`,
      ref: req.params.id, byId: req.uid,
      at: new Date().toISOString(), ts: Date.now()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
