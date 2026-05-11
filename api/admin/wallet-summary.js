import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  initializeAdmin,
  verifyAdminUser,
} = require("../monnify/_payment-admin.cjs");

function toMillis(value) {
  if (!value) return Date.now();
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function normalizeTransaction(tx, usersById, fallbackUser) {
  const reference = tx.reference || tx.id;
  if (!reference) return null;

  const user = usersById.get(tx.userId) || fallbackUser || {};
  const status = tx.status || "PENDING";
  const type =
    tx.type ||
    (tx.category === "WALLET_FUND"
      ? "WALLET_FUND"
      : tx.category === "COURSE_PURCHASE"
        ? "COURSE_UNLOCK"
        : undefined);

  return {
    id: tx.id || `TX-${reference}`,
    reference,
    userId: tx.userId || fallbackUser?.uid || "",
    userName: tx.userName || user.name || "",
    userEmail: tx.userEmail || tx.email || user.email || "",
    category: tx.category || (type === "WALLET_FUND" ? "WALLET_FUND" : "COURSE_PURCHASE"),
    type,
    item:
      tx.item ||
      (type === "WALLET_FUND"
        ? "Wallet Funding"
        : tx.subject && tx.examType
          ? `${tx.subject} (${tx.examType})`
          : "Course Unlock"),
    amount: Number(tx.amount || 0),
    status,
    timestamp: toMillis(tx.timestamp),
    completedAt: tx.completedAt ? toMillis(tx.completedAt) : undefined,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    await verifyAdminUser(req);

    const admin = initializeAdmin();
    const db = admin.firestore();

    const [usersSnap, transactionsSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("transactions").get(),
    ]);

    const users = usersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
    const usersById = new Map(users.map((user) => [user.uid, user]));
    const transactionsByRef = new Map();

    const addTx = (raw, fallbackUser) => {
      const tx = normalizeTransaction(raw, usersById, fallbackUser);
      if (!tx) return;
      const existing = transactionsByRef.get(tx.reference);
      if (!existing || existing.status !== "SUCCESS") {
        transactionsByRef.set(tx.reference, tx);
      }
    };

    transactionsSnap.docs.forEach((doc) => addTx({ id: doc.id, ...doc.data() }));
    users.forEach((user) => {
      if (Array.isArray(user.transactions)) {
        user.transactions.forEach((tx) => addTx(tx, user));
      }
    });

    const transactions = Array.from(transactionsByRef.values()).sort(
      (a, b) => (b.completedAt || b.timestamp || 0) - (a.completedAt || a.timestamp || 0)
    );

    const successful = transactions.filter((tx) => tx.status === "SUCCESS");
    const courseIncome = successful
      .filter((tx) => tx.type === "COURSE_UNLOCK" || tx.category === "COURSE_PURCHASE")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const walletFunding = successful
      .filter((tx) => tx.type === "WALLET_FUND" || tx.category === "WALLET_FUND")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const pendingValue = transactions
      .filter((tx) => tx.status === "PENDING")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const totalWalletBalance = users.reduce((sum, user) => sum + Number(user.walletBalance || 0), 0);

    const topWalletUsers = users
      .slice()
      .sort((a, b) => Number(b.walletBalance || 0) - Number(a.walletBalance || 0))
      .slice(0, 5)
      .map((user) => ({
        uid: user.uid,
        name: user.name || "",
        email: user.email || "",
        walletBalance: Number(user.walletBalance || 0),
      }));

    return res.status(200).json({
      stats: {
        totalIncome: courseIncome + walletFunding,
        courseIncome,
        walletFunding,
        pendingValue,
        totalWalletBalance,
        successfulCount: successful.length,
        transactionCount: transactions.length,
      },
      transactions,
      topWalletUsers,
    });
  } catch (err) {
    console.error("wallet-summary error:", err?.message || err);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode && err.statusCode < 500 ? err.message : "Failed to load wallet summary",
    });
  }
}
