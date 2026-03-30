const express = require("express");
const router = express.Router();
const { db, admin } = require("../config/firebase");
const auth = require("../middleware/auth");

// ── Middleware: تأكد إن المستخدم admin
async function adminOnly(req, res, next) {
  const snap = await db.collection("users").doc(req.uid).get();
  const user = snap.exists ? snap.data() : null;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "الصلاحيات دي للمدير بس" });
  }
  next();
}

// ── GET /api/users/me
// بيانات المستخدم الحالي — بيتعمل أول ما يدخل
router.get("/me", auth, async (req, res) => {
  try {
    const snap = await db.collection("users").doc(req.uid).get();
    if (snap.exists) {
      return res.json({ id: req.uid, ...snap.data() });
    }
    // أول دخول — ابعت 404 والفرونت هيتعامل معاه
    res.status(404).json({ error: "مستخدم جديد" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/users
router.get("/", auth, adminOnly, async (req, res) => {
  try {
    const snap = await db.collection("users").get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/users
// إضافة موظف جديد
router.post("/", auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, perms } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "الاسم والإيميل وكلمة المرور مطلوبين" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "كلمة المرور لازم تكون 6 حروف على الأقل" });
    }

    // إنشاء حساب في Firebase Auth
    const userRecord = await admin.auth().createUser({ email, password, displayName: name });

    // حفظ البيانات في Firestore
    await db.collection("users").doc(userRecord.uid).set({
      name,
      email,
      role: "staff",
      perms: perms || {},
      active: true,
    });

    await db.collection("app_txns").add({
      action: "إضافة مستخدم",
      details: `${name} · ${email}`,
      ref: userRecord.uid,
      byId: req.uid,
      at: new Date().toISOString(),
      ts: Date.now(),
    });

    res.json({ id: userRecord.uid });
  } catch (err) {
    // Firebase error codes
    if (err.code === "auth/email-already-exists") {
      return res.status(400).json({ error: "الإيميل ده موجود بالفعل" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/:id
// تعديل بيانات + صلاحيات
router.put("/:id", auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, perms, password } = req.body;

    if (!name) return res.status(400).json({ error: "الاسم مطلوب" });

    await db.collection("users").doc(id).set({ name, perms: perms || {} }, { merge: true });

    // لو في كلمة مرور جديدة
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: "كلمة المرور لازم تكون 6 حروف على الأقل" });
      }
      await admin.auth().updateUser(id, { password });
    }

    await db.collection("app_txns").add({
      action: "تعديل مستخدم",
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

// ── PATCH /api/users/:id/toggle
// تفعيل / إيقاف مستخدم
router.patch("/:id/toggle", auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (id === req.uid) {
      return res.status(400).json({ error: "مينفعش توقف حسابك أنت" });
    }

    await db.collection("users").doc(id).set({ active: !!active }, { merge: true });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/users/:id
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.uid) {
      return res.status(400).json({ error: "مينفعش تحذف حسابك أنت" });
    }

    await Promise.all([
      admin.auth().deleteUser(id),
      db.collection("users").doc(id).delete(),
    ]);

    await db.collection("app_txns").add({
      action: "حذف مستخدم",
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
