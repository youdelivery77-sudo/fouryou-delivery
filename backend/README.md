# فوريو دليفري — Backend

## الملفات

```
backend/
├── server.js              ← السيرفر الرئيسي
├── package.json
├── .env.example           ← انسخه لـ .env وعبّيه
├── config/
│   └── firebase.js        ← ربط Firebase Admin
├── middleware/
│   └── auth.js            ← التحقق من الـ Token
└── routes/
    ├── orders.js          ← الأوردرات
    ├── agents.js          ← المندوبين
    ├── vault.js           ← الخزن والتحويلات
    ├── closing.js         ← التقفيل والمصاريف
    ├── reports.js         ← التقارير الشهرية
    └── users.js           ← المستخدمين والصلاحيات
```

---

## تشغيل المشروع

### 1. تثبيت الباكدجات
```bash
cd backend
npm install
```

### 2. إعداد Firebase Service Account
- روح Firebase Console → Project Settings → Service Accounts
- اضغط "Generate new private key"
- احفظ الـ JSON

### 3. إعداد .env
```bash
cp .env.example .env
```
افتح `.env` وحط الـ JSON بتاع Service Account في `FIREBASE_SERVICE_ACCOUNT`

### 4. تشغيل السيرفر
```bash
npm run dev    # للتطوير (مع auto-reload)
npm start      # للإنتاج
```

---

## الـ API Endpoints

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | /api/orders | جيب الأوردرات |
| POST | /api/orders | إضافة أوردر |
| PUT | /api/orders/:id | تعديل أوردر |
| PATCH | /api/orders/:id/status | تغيير حالة |
| DELETE | /api/orders/:id | حذف أوردر |
| GET | /api/agents | المندوبين |
| POST | /api/agents | إضافة مندوب |
| PUT | /api/agents/:id | تعديل مندوب |
| PATCH | /api/agents/:id/status | تغيير حالة المندوب |
| DELETE | /api/agents/:id | حذف مندوب |
| GET | /api/vault | الخزن والمعاملات |
| POST | /api/vault | إضافة خزنة |
| POST | /api/vault/transfer | تحويل بين خزن |
| DELETE | /api/vault/:id | حذف خزنة |
| POST | /api/closing/close | تقفيل الشيفت |
| GET | /api/closing/summaries | تاريخ الشيفتات |
| GET | /api/closing/expenses | مصاريف الشيفت |
| POST | /api/closing/expenses | إضافة مصروف |
| DELETE | /api/closing/expenses/:id | حذف مصروف |
| GET | /api/reports | التقارير الشهرية |
| POST | /api/reports/close | إغلاق الشهر |
| GET | /api/users | المستخدمين |
| POST | /api/users | إضافة موظف |
| PUT | /api/users/:id | تعديل موظف |
| PATCH | /api/users/:id/toggle | تفعيل/إيقاف |
| DELETE | /api/users/:id | حذف موظف |

---

## تعديل الفرونت

كل request في الفرونت يبعت الـ Firebase Token:

```javascript
// دالة مساعدة — حطها فوق في الـ script
async function api(method, path, body = null) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "خطأ في السيرفر");
  }
  return res.json();
}

// مثال — إضافة أوردر
await api("POST", "/orders", { customerName, phone, value, agentId });

// مثال — جيب الأوردرات
const orders = await api("GET", "/orders");

// مثال — تقفيل الشيفت
await api("POST", "/closing/close", { month: "2024-01" });
```

---

## Deploy على Render

1. ارفع الكود على GitHub
2. روح [render.com](https://render.com) → New Web Service
3. اختار الـ repo
4. **Build Command:** `npm install`
5. **Start Command:** `npm start`
6. **Environment Variables:** ضيف `FIREBASE_SERVICE_ACCOUNT` و`FRONTEND_URL`

---

## ⚠️ مهم

- ملف `.env` **متشيلوش على GitHub أبداً** — ضيفه في `.gitignore`
- الـ `FIREBASE_SERVICE_ACCOUNT` بيكون JSON في سطر واحد بدون مسافات
