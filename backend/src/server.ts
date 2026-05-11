import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "sarafi-backend" });
});

const jwtSecret = process.env.JWT_SECRET ?? "dev-secret";
type AuthRole = "admin" | "cashier" | "accountant";
type AuthRequest = Request & { user?: { sub: string; role: AuthRole } };

const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, jwtSecret) as { sub: string; role: AuthRole };
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
  }
};

const requireRole =
  (roles: AuthRole[]) => (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }
    return next();
  };

app.post("/auth/register", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6).max(200),
    role: z.enum(["admin", "cashier", "accountant"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { username, password, role } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ ok: false, error: "USERNAME_EXISTS" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, role: role ?? "cashier" },
    select: { id: true, username: true, role: true, isActive: true, createdAt: true },
  });

  res.json({ ok: true, user });
});

app.post("/auth/login", async (req, res) => {
  const schema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });

  const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: "12h" });
  res.json({ ok: true, token, user: { id: user.id, username: user.username, role: user.role } });
});

app.patch("/auth/me", requireAuth, async (req: AuthRequest, res) => {
  const schema = z
    .object({
      username: z.string().min(3).max(50).optional(),
      currentPassword: z.string().min(1).max(200).optional(),
      newPassword: z.string().min(6).max(200).optional(),
    })
    .refine((payload) => payload.username !== undefined || payload.newPassword !== undefined, {
      message: "NOTHING_TO_UPDATE",
    })
    .refine((payload) => !payload.newPassword || !!payload.currentPassword, {
      message: "CURRENT_PASSWORD_REQUIRED",
    });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const issueMessage = parsed.error.issues[0]?.message;
    if (issueMessage === "NOTHING_TO_UPDATE" || issueMessage === "CURRENT_PASSWORD_REQUIRED") {
      return res.status(400).json({ ok: false, error: issueMessage });
    }
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  if (!req.user?.sub) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const userId = req.user.sub;
  const { username, currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });

  const nextUsername = username?.trim();
  if (nextUsername && nextUsername !== user.username) {
    const usernameTaken = await prisma.user.findUnique({ where: { username: nextUsername } });
    if (usernameTaken && usernameTaken.id !== user.id) {
      return res.status(409).json({ ok: false, error: "USERNAME_EXISTS" });
    }
  }

  if (newPassword) {
    const passwordOk = await bcrypt.compare(currentPassword ?? "", user.passwordHash);
    if (!passwordOk) return res.status(401).json({ ok: false, error: "INVALID_CURRENT_PASSWORD" });
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(nextUsername ? { username: nextUsername } : {}),
      ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
    },
    select: { id: true, username: true, role: true },
  });

  return res.json({ ok: true, user: updatedUser });
});

const customerSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().max(30).optional(),
  idNumber: z.string().max(60).optional(),
  notes: z.string().max(500).optional(),
});

const parseLocalizedNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  const normalized = value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/٬/g, "")
    .replace(/,/g, "")
    .replace(/،/g, ".")
    .trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : value;
};

const amountSchema = z.preprocess(parseLocalizedNumber, z.number().positive());

const depositSchema = z.object({
  customerId: z.string().min(1),
  currencyCode: z.string().min(2).max(10),
  amount: amountSchema,
  note: z.string().max(500).optional(),
});

const issueSlipSchema = z.object({
  customerId: z.string().min(1),
  currencyCode: z.string().min(2).max(10),
  amount: amountSchema,
  receiverName: z.string().min(1).max(120),
  paidToName: z.string().min(1).max(120),
  note: z.string().max(500).optional(),
  /** If true, deduct customer balance immediately and set slip status to paid */
  markPaid: z.boolean().optional(),
});

const payoutSlipSchema = z.object({
  receiverName: z.string().max(120).optional(),
  paidToName: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

const slipStatusSchema = z.object({
  status: z.enum(["cancelled", "expired"]),
});

const updateSlipSchema = z.object({
  customerId: z.string().min(1),
  currencyCode: z.string().min(2).max(10),
  amount: amountSchema,
  receiverName: z.string().min(1).max(120),
  paidToName: z.string().min(1).max(120),
  note: z.string().max(500).optional(),
});

const partnerSchema = z.object({
  name: z.string().min(2).max(120),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  contact: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
});

const partnerTxSchema = z.object({
  partnerId: z.string().min(1),
  currencyCode: z.string().min(2).max(10),
  amount: amountSchema,
  direction: z.enum(["in", "out"]),
  beneficiaryName: z.string().max(120).optional(),
  referenceNo: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  reconciliationStatus: z.enum(["pending", "confirmed", "disputed"]).optional(),
});

const defaultCurrencies = [
  { code: "AFN", name: "Afghani" },
  { code: "AED", name: "UAE Darham" },
  { code: "USD", name: "US Dollar" },
  { code: "IRR", name: "Iranian Rial" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "TOMAN", name: "Toman" },
] as const;

/** Next slip code: "0", "1", "2", … (numeric string; ignores legacy non-numeric slipCode rows). */
const nextNumericSlipCode = async (tx: { $queryRaw: typeof prisma.$queryRaw }) => {
  const rows = await tx.$queryRaw<Array<{ n: bigint | number | null }>>`
    SELECT COALESCE(MAX(CAST(slipCode AS INTEGER)), -1) + 1 AS n
    FROM Slip
    WHERE slipCode GLOB '[0-9]*'
  `;
  return String(Number(rows[0]?.n ?? 0));
};

const firstParam = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const v = value[0];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const currencyPrecision: Record<string, number> = {
  AFN: 2,
  AED: 2,
  USD: 2,
  IRR: 0,
  PKR: 2,
  TOMAN: 0,
};

const toFixedByCurrency = (amount: number, currencyCode: string) => {
  const precision = currencyPrecision[currencyCode] ?? 2;
  const factor = 10 ** precision;
  return Math.round((amount + Number.EPSILON) * factor) / factor;
};

const hasValidCurrencyPrecision = (amount: number, currencyCode: string) => {
  const precision = currencyPrecision[currencyCode] ?? 2;
  const factor = 10 ** precision;
  return Math.abs(amount * factor - Math.round(amount * factor)) < 1e-8;
};

const newExchangeReference = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `EXR-${random}`;
};

const newLedgerBatchId = () => {
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `LB-${Date.now().toString().slice(-8)}-${random}`;
};

const exchangeSchema = z
  .object({
    customerId: z.string().min(1),
    fromCurrency: z.string().min(2).max(10),
    toCurrency: z.string().min(2).max(10),
    sourceAmount: amountSchema,
    rate: z.preprocess(parseLocalizedNumber, z.number().positive()),
    feeAmount: z.preprocess(parseLocalizedNumber, z.number().min(0)).optional(),
    notes: z.string().max(500).optional(),
    clientReference: z.string().max(100).optional(),
    settlementMode: z.enum(["from_balance", "cash_in"]).optional(),
  })
  .refine((payload) => payload.fromCurrency.toUpperCase() !== payload.toCurrency.toUpperCase(), {
    message: "SAME_CURRENCY_NOT_ALLOWED",
    path: ["toCurrency"],
  });

app.post("/api/v1/exchanges", requireAuth, requireRole(["admin", "cashier"]), async (req: AuthRequest, res) => {
  const parsed = exchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    const issueMessage = parsed.error.issues[0]?.message;
    if (issueMessage === "SAME_CURRENCY_NOT_ALLOWED") {
      return res.status(400).json({ ok: false, error: issueMessage });
    }
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  const {
    customerId,
    sourceAmount,
    rate,
    notes,
    clientReference,
    feeAmount = 0,
    settlementMode = "from_balance",
    fromCurrency: rawFromCurrency,
    toCurrency: rawToCurrency,
  } = parsed.data;

  const fromCurrency = rawFromCurrency.toUpperCase();
  const toCurrency = rawToCurrency.toUpperCase();

  if (!hasValidCurrencyPrecision(sourceAmount, fromCurrency) || !hasValidCurrencyPrecision(feeAmount, toCurrency)) {
    return res.status(422).json({ ok: false, error: "CURRENCY_PRECISION_MISMATCH" });
  }

  const targetAmountGross = toFixedByCurrency(sourceAmount * rate, toCurrency);
  const targetAmountNet = toFixedByCurrency(targetAmountGross - feeAmount, toCurrency);
  if (targetAmountNet <= 0) return res.status(400).json({ ok: false, error: "INVALID_NET_AMOUNT" });

  if (!hasValidCurrencyPrecision(targetAmountGross, toCurrency) || !hasValidCurrencyPrecision(targetAmountNet, toCurrency)) {
    return res.status(422).json({ ok: false, error: "CURRENCY_PRECISION_MISMATCH" });
  }

  const duplicateClientRef = clientReference
    ? await prisma.exchangeTransaction.findUnique({ where: { clientReference } })
    : null;
  if (duplicateClientRef) return res.status(409).json({ ok: false, error: "DUPLICATE_CLIENT_REFERENCE" });

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });

  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!actor) return res.status(401).json({ ok: false, error: "SESSION_STALE_RELOGIN" });

  const [fromCurrencyExists, toCurrencyExists] = await Promise.all([
    prisma.currency.findUnique({ where: { code: fromCurrency } }),
    prisma.currency.findUnique({ where: { code: toCurrency } }),
  ]);
  if (!fromCurrencyExists || !toCurrencyExists) return res.status(400).json({ ok: false, error: "INVALID_CURRENCY" });

  const posted = await prisma.$transaction(async (tx) => {
    if (settlementMode === "from_balance") {
      const sourceAccount = await tx.customerAccount.upsert({
        where: { customerId_currencyCode: { customerId, currencyCode: fromCurrency } },
        create: { customerId, currencyCode: fromCurrency, balance: 0 },
        update: {},
      });
      if (Number(sourceAccount.balance) < sourceAmount) throw new Error("INSUFFICIENT_SOURCE_BALANCE");

      await tx.customerAccount.update({
        where: { customerId_currencyCode: { customerId, currencyCode: fromCurrency } },
        data: { balance: { decrement: sourceAmount } },
      });
    }

    await tx.customerAccount.upsert({
      where: { customerId_currencyCode: { customerId, currencyCode: toCurrency } },
      create: { customerId, currencyCode: toCurrency, balance: targetAmountNet },
      update: { balance: { increment: targetAmountNet } },
    });

    if (settlementMode === "cash_in") {
      await tx.depositTransaction.create({
        data: {
          customerId,
          currencyCode: toCurrency,
          amount: targetAmountNet,
          note: `FX CASH-IN ${fromCurrency}->${toCurrency} @ ${rate}${feeAmount ? ` | fee ${feeAmount}` : ""}${notes ? ` | ${notes}` : ""}`,
        },
      });
    }

    return tx.exchangeTransaction.create({
      data: {
        referenceNo: newExchangeReference(),
        clientReference: clientReference?.trim() || undefined,
        customerId,
        fromCurrencyCode: fromCurrency,
        toCurrencyCode: toCurrency,
        sourceAmount,
        rate,
        targetAmountGross,
        feeAmount,
        targetAmountNet,
        status: "posted",
        ledgerBatchId: newLedgerBatchId(),
        notes: notes?.trim() || undefined,
        createdById: userId,
      },
    });
  }).catch((error: Error) => ({ error: error.message }));

  if ("error" in posted) {
    if (posted.error === "INSUFFICIENT_SOURCE_BALANCE") {
      return res.status(409).json({ ok: false, error: posted.error });
    }
    if (/Foreign key constraint/i.test(posted.error)) {
      console.error("[EXCHANGE_POST_FAILED]", posted.error);
      return res.status(401).json({ ok: false, error: "SESSION_STALE_RELOGIN" });
    }
    console.error("[EXCHANGE_POST_FAILED]", posted.error);
    return res.status(500).json({ ok: false, error: "EXCHANGE_POST_FAILED" });
  }

  return res.status(201).json({
    ok: true,
    exchangeId: posted.id,
    referenceNo: posted.referenceNo,
    customerId: posted.customerId,
    fromCurrency: posted.fromCurrencyCode,
    toCurrency: posted.toCurrencyCode,
    sourceAmount: Number(posted.sourceAmount),
    rate: Number(posted.rate),
    targetAmountGross: Number(posted.targetAmountGross),
    feeAmount: Number(posted.feeAmount),
    targetAmountNet: Number(posted.targetAmountNet),
    status: posted.status,
    ledgerBatchId: posted.ledgerBatchId,
    createdBy: posted.createdById,
    createdAt: posted.createdAt,
  });
});

app.get("/api/v1/exchanges", requireAuth, async (req, res) => {
  const customerId = firstParam(req.query.customerId);
  const fromCurrency = firstParam(req.query.fromCurrency)?.toUpperCase();
  const toCurrency = firstParam(req.query.toCurrency)?.toUpperCase();

  const exchanges = await prisma.exchangeTransaction.findMany({
    where: {
      ...(customerId ? { customerId } : {}),
      ...(fromCurrency ? { fromCurrencyCode: fromCurrency } : {}),
      ...(toCurrency ? { toCurrencyCode: toCurrency } : {}),
    },
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
      createdBy: { select: { id: true, username: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return res.json({ ok: true, exchanges });
});

app.get("/customers", requireAuth, async (_req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ ok: true, customers });
});

app.get("/customers/:customerId", requireAuth, async (req, res) => {
  const customerId = firstParam(req.params.customerId);
  if (!customerId) return res.status(400).json({ ok: false, error: "INVALID_CUSTOMER_ID" });
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
  res.json({ ok: true, customer });
});

app.post("/customers", requireAuth, async (req, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const normalizedName = parsed.data.fullName.normalize("NFC").trim();

  const customer = await prisma.$transaction(async (tx) => {
    await tx.currency.upsert({
      where: { code: "AFN" },
      create: { code: "AFN", name: "Afghani", isActive: true },
      update: { isActive: true },
    });
    const created = await tx.customer.create({
      data: { ...parsed.data, fullName: normalizedName },
    });
    await tx.customerAccount.create({
      data: { customerId: created.id, currencyCode: "AFN", balance: 0 },
    });
    return created;
  });

  res.status(201).json({ ok: true, customer });
});

app.put("/customers/:customerId", requireAuth, async (req, res) => {
  const customerId = firstParam(req.params.customerId);
  if (!customerId) return res.status(400).json({ ok: false, error: "INVALID_CUSTOMER_ID" });

  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const exists = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!exists) return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });

  const normalizedName = parsed.data.fullName.normalize("NFC").trim();

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: { ...parsed.data, fullName: normalizedName },
  });
  res.json({ ok: true, customer });
});

app.delete("/customers/:customerId", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
  const customerId = firstParam(req.params.customerId);
  if (!customerId) return res.status(400).json({ ok: false, error: "INVALID_CUSTOMER_ID" });

  const [depositCount, slipCount, accounts] = await Promise.all([
    prisma.depositTransaction.count({ where: { customerId } }),
    prisma.slip.count({ where: { customerId } }),
    prisma.customerAccount.findMany({
      where: { customerId },
      select: { balance: true },
    }),
  ]);
  const hasNonZeroBalance = accounts.some((a) => Number(a.balance) !== 0);
  if (depositCount > 0 || slipCount > 0 || hasNonZeroBalance) {
    return res.status(409).json({ ok: false, error: "CUSTOMER_HAS_TRANSACTIONS" });
  }

  const exists = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!exists) return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });

  await prisma.customer.delete({ where: { id: customerId } });
  res.json({ ok: true });
});

app.get("/currencies", requireAuth, async (_req, res) => {
  for (const item of defaultCurrencies) {
    await prisma.currency.upsert({
      where: { code: item.code },
      create: item,
      update: { isActive: true, name: item.name },
    });
  }
  const currencies = await prisma.currency.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  res.json({ ok: true, currencies });
});

app.get("/customers/:customerId/accounts", requireAuth, async (req, res) => {
  const customerId = firstParam(req.params.customerId);
  if (!customerId) return res.status(400).json({ ok: false, error: "INVALID_CUSTOMER_ID" });
  const accounts = await prisma.customerAccount.findMany({
    where: { customerId },
    orderBy: { currencyCode: "asc" },
  });
  res.json({ ok: true, accounts });
});

app.post("/deposits", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { customerId, currencyCode, amount, note } = parsed.data;
  const normalizedCurrency = currencyCode.toUpperCase();

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });

  const currency = await prisma.currency.findUnique({ where: { code: normalizedCurrency } });
  if (!currency) return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.customerAccount.upsert({
      where: { customerId_currencyCode: { customerId, currencyCode: normalizedCurrency } },
      create: { customerId, currencyCode: normalizedCurrency, balance: amount },
      update: { balance: { increment: amount } },
    });

    const deposit = await tx.depositTransaction.create({
      data: { customerId, currencyCode: normalizedCurrency, amount, note },
    });

    return { account, deposit };
  });

  res.status(201).json({ ok: true, ...result });
});

app.get("/deposits", requireAuth, async (req, res) => {
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
  const currencyCode = typeof req.query.currencyCode === "string" ? req.query.currencyCode.toUpperCase() : undefined;
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;

  const deposits = await prisma.depositTransaction.findMany({
    where: {
      ...(customerId ? { customerId } : {}),
      ...(currencyCode ? { currencyCode } : {}),
      ...((from || to)
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  res.json({ ok: true, deposits });
});

app.put("/deposits/:depositId", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
  const depositId = firstParam(req.params.depositId);
  if (!depositId) return res.status(400).json({ ok: false, error: "INVALID_DEPOSIT_ID" });

  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { customerId, currencyCode, amount, note } = parsed.data;
  const normalizedCurrency = currencyCode.toUpperCase();

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
  const currency = await prisma.currency.findUnique({ where: { code: normalizedCurrency } });
  if (!currency) return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.depositTransaction.findUnique({ where: { id: depositId } });
    if (!existing) throw new Error("DEPOSIT_NOT_FOUND");

    const oldAccount = await tx.customerAccount.upsert({
      where: {
        customerId_currencyCode: {
          customerId: existing.customerId,
          currencyCode: existing.currencyCode,
        },
      },
      create: { customerId: existing.customerId, currencyCode: existing.currencyCode, balance: 0 },
      update: {},
    });

    if (Number(oldAccount.balance) < Number(existing.amount)) {
      throw new Error("INSUFFICIENT_BALANCE_ADJUSTMENT");
    }

    await tx.customerAccount.update({
      where: {
        customerId_currencyCode: {
          customerId: existing.customerId,
          currencyCode: existing.currencyCode,
        },
      },
      data: { balance: { decrement: existing.amount } },
    });

    await tx.customerAccount.upsert({
      where: { customerId_currencyCode: { customerId, currencyCode: normalizedCurrency } },
      create: { customerId, currencyCode: normalizedCurrency, balance: amount },
      update: { balance: { increment: amount } },
    });

    const deposit = await tx.depositTransaction.update({
      where: { id: depositId },
      data: {
        customerId,
        currencyCode: normalizedCurrency,
        amount,
        note: note?.trim() || undefined,
      },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
      },
    });

    return { deposit };
  }).catch((error: Error) => ({ error: error.message }));

  if ("error" in result) {
    if (result.error === "DEPOSIT_NOT_FOUND") return res.status(404).json({ ok: false, error: result.error });
    if (result.error === "INSUFFICIENT_BALANCE_ADJUSTMENT") {
      return res.status(409).json({ ok: false, error: result.error });
    }
    return res.status(500).json({ ok: false, error: "DEPOSIT_UPDATE_FAILED" });
  }

  res.json({ ok: true, ...result });
});

app.delete("/deposits/:depositId", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
  const depositId = firstParam(req.params.depositId);
  if (!depositId) return res.status(400).json({ ok: false, error: "INVALID_DEPOSIT_ID" });

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.depositTransaction.findUnique({ where: { id: depositId } });
    if (!existing) throw new Error("DEPOSIT_NOT_FOUND");

    const account = await tx.customerAccount.upsert({
      where: {
        customerId_currencyCode: {
          customerId: existing.customerId,
          currencyCode: existing.currencyCode,
        },
      },
      create: { customerId: existing.customerId, currencyCode: existing.currencyCode, balance: 0 },
      update: {},
    });

    if (Number(account.balance) < Number(existing.amount)) {
      throw new Error("INSUFFICIENT_BALANCE_ADJUSTMENT");
    }

    await tx.customerAccount.update({
      where: {
        customerId_currencyCode: {
          customerId: existing.customerId,
          currencyCode: existing.currencyCode,
        },
      },
      data: { balance: { decrement: existing.amount } },
    });

    await tx.depositTransaction.delete({ where: { id: depositId } });
    return { ok: true };
  }).catch((error: Error) => ({ error: error.message }));

  if ("error" in result) {
    if (result.error === "DEPOSIT_NOT_FOUND") return res.status(404).json({ ok: false, error: result.error });
    if (result.error === "INSUFFICIENT_BALANCE_ADJUSTMENT") {
      return res.status(409).json({ ok: false, error: result.error });
    }
    return res.status(500).json({ ok: false, error: "DEPOSIT_DELETE_FAILED" });
  }

  res.json({ ok: true });
});

app.post("/slips", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
  const parsed = issueSlipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { customerId, currencyCode, amount, receiverName, paidToName, note, markPaid } = parsed.data;
  const normalizedCurrency = currencyCode.toUpperCase();

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });

  const currency = await prisma.currency.findUnique({ where: { code: normalizedCurrency } });
  if (!currency) return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });

  if (markPaid === true) {
    const paid = await prisma.$transaction(async (tx) => {
      const account = await tx.customerAccount.findUnique({
        where: {
          customerId_currencyCode: { customerId, currencyCode: normalizedCurrency },
        },
      });
      if (!account) {
        throw new Error("NO_ACCOUNT_FOR_SLIP_CURRENCY");
      }
      if (Number(account.balance) < Number(amount)) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      await tx.customerAccount.update({
        where: {
          customerId_currencyCode: { customerId, currencyCode: normalizedCurrency },
        },
        data: { balance: { decrement: amount } },
      });
      const slipCode = await nextNumericSlipCode(tx);
      return tx.slip.create({
        data: {
          slipCode,
          customerId,
          currencyCode: normalizedCurrency,
          amount,
          receiverName: receiverName.trim(),
          paidToName: paidToName.trim(),
          note,
          status: "paid",
          paidAt: new Date(),
        },
      });
    }).catch((error: Error) => ({ error: error.message }));

    if ("error" in paid) {
      if (paid.error === "INSUFFICIENT_BALANCE") {
        return res.status(409).json({ ok: false, error: "INSUFFICIENT_BALANCE" });
      }
      if (paid.error === "NO_ACCOUNT_FOR_SLIP_CURRENCY") {
        return res.status(409).json({ ok: false, error: paid.error });
      }
      return res.status(500).json({ ok: false, error: "SLIP_CREATE_FAILED" });
    }

    return res.status(201).json({ ok: true, slip: paid });
  }

  const slip = await prisma.$transaction(async (tx) => {
    const slipCode = await nextNumericSlipCode(tx);
    return tx.slip.create({
      data: {
        slipCode,
        customerId,
        currencyCode: normalizedCurrency,
        amount,
        receiverName: receiverName.trim(),
        paidToName: paidToName.trim(),
        note,
        status: "issued",
      },
    });
  });

  res.status(201).json({ ok: true, slip });
});

app.get("/slips/:slipCode", requireAuth, async (req, res) => {
  const slipCode = firstParam(req.params.slipCode);
  if (!slipCode) return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });
  const slip = await prisma.slip.findUnique({
    where: { slipCode },
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
    },
  });

  if (!slip) return res.status(404).json({ ok: false, error: "SLIP_NOT_FOUND" });
  res.json({ ok: true, slip });
});

app.get("/slips", requireAuth, async (req, res) => {
  const status = firstParam(req.query.status);
  const customerId = firstParam(req.query.customerId);
  const currencyRaw = firstParam(req.query.currencyCode);
  const currencyCode = currencyRaw ? currencyRaw.toUpperCase() : undefined;
  const from = firstParam(req.query.from);
  const to = firstParam(req.query.to);

  const slips = await prisma.slip.findMany({
    where: {
      ...(status && ["issued", "paid", "cancelled", "expired"].includes(status) ? { status: status as "issued" | "paid" | "cancelled" | "expired" } : {}),
      ...(customerId ? { customerId } : {}),
      ...(currencyCode ? { currencyCode } : {}),
      ...((from || to)
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  res.json({ ok: true, slips });
});

app.post("/slips/:slipCode/payout", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
  const parsed = payoutSlipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const slipCode = firstParam(req.params.slipCode);
  if (!slipCode) return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });

  const result = await prisma.$transaction(async (tx) => {
    const slip = await tx.slip.findUnique({ where: { slipCode } });
    if (!slip) throw new Error("SLIP_NOT_FOUND");
    if (slip.status !== "issued") throw new Error("SLIP_NOT_PAYABLE");

    const account = await tx.customerAccount.findUnique({
      where: {
        customerId_currencyCode: {
          customerId: slip.customerId,
          currencyCode: slip.currencyCode,
        },
      },
    });

    if (!account) {
      throw new Error("NO_ACCOUNT_FOR_SLIP_CURRENCY");
    }
    if (Number(account.balance) < Number(slip.amount)) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    const updatedAccount = await tx.customerAccount.update({
      where: {
        customerId_currencyCode: {
          customerId: slip.customerId,
          currencyCode: slip.currencyCode,
        },
      },
      data: { balance: { decrement: slip.amount } },
    });

    const paidSlip = await tx.slip.update({
      where: { slipCode },
      data: {
        status: "paid",
        paidAt: new Date(),
        receiverName: parsed.data.receiverName ?? slip.receiverName,
        paidToName: parsed.data.paidToName !== undefined ? parsed.data.paidToName?.trim() || null : slip.paidToName,
        note: parsed.data.note ?? slip.note,
      },
    });

    return { paidSlip, updatedAccount };
  }).catch((error: Error) => {
    return { error: error.message };
  });

  if ("error" in result) {
    if (result.error === "SLIP_NOT_FOUND") return res.status(404).json({ ok: false, error: result.error });
    if (result.error === "SLIP_NOT_PAYABLE") return res.status(409).json({ ok: false, error: result.error });
    if (result.error === "INSUFFICIENT_BALANCE") return res.status(409).json({ ok: false, error: result.error });
    if (result.error === "NO_ACCOUNT_FOR_SLIP_CURRENCY") {
      return res.status(409).json({ ok: false, error: result.error });
    }
    return res.status(500).json({ ok: false, error: "PAYOUT_FAILED" });
  }

  res.json({ ok: true, ...result });
});

app.patch("/slips/:slipCode/status", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
  const parsed = slipStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const slipCode = firstParam(req.params.slipCode);
  if (!slipCode) return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });

  const slip = await prisma.slip.findUnique({ where: { slipCode } });
  if (!slip) return res.status(404).json({ ok: false, error: "SLIP_NOT_FOUND" });
  if (slip.status !== "issued") return res.status(409).json({ ok: false, error: "SLIP_NOT_UPDATABLE" });

  const updated = await prisma.slip.update({
    where: { slipCode },
    data: { status: parsed.data.status },
  });
  res.json({ ok: true, slip: updated });
});

app.put("/slips/:slipCode", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
  const slipCode = firstParam(req.params.slipCode);
  if (!slipCode) return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });

  const parsed = updateSlipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const existing = await prisma.slip.findUnique({ where: { slipCode } });
  if (!existing) return res.status(404).json({ ok: false, error: "SLIP_NOT_FOUND" });
  if (existing.status !== "issued") {
    return res.status(409).json({ ok: false, error: "SLIP_NOT_EDITABLE" });
  }

  const { customerId, currencyCode, amount, receiverName, paidToName, note } = parsed.data;
  const normalizedCurrency = currencyCode.toUpperCase();

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
  const currency = await prisma.currency.findUnique({ where: { code: normalizedCurrency } });
  if (!currency) return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });

  const slip = await prisma.slip.update({
    where: { slipCode },
    data: {
      customerId,
      currencyCode: normalizedCurrency,
      amount,
      receiverName: receiverName.trim(),
      paidToName: paidToName.trim(),
      note: note?.trim() || null,
    },
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
    },
  });

  res.json({ ok: true, slip });
});

app.delete("/slips/:slipCode", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
  const slipCode = firstParam(req.params.slipCode);
  if (!slipCode) return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });

  try {
    await prisma.$transaction(async (tx) => {
      const slip = await tx.slip.findUnique({ where: { slipCode } });
      if (!slip) throw new Error("SLIP_NOT_FOUND");
      if (slip.status === "paid") {
        await tx.customerAccount.upsert({
          where: {
            customerId_currencyCode: {
              customerId: slip.customerId,
              currencyCode: slip.currencyCode,
            },
          },
          create: {
            customerId: slip.customerId,
            currencyCode: slip.currencyCode,
            balance: slip.amount,
          },
          update: {
            balance: { increment: slip.amount },
          },
        });
      }
      await tx.slip.delete({ where: { slipCode } });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    if (msg === "SLIP_NOT_FOUND") return res.status(404).json({ ok: false, error: msg });
    return res.status(500).json({ ok: false, error: "SLIP_DELETE_FAILED" });
  }

  res.json({ ok: true });
});

app.get("/partners", requireAuth, async (_req, res) => {
  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ ok: true, partners });
});

app.get("/partners/:partnerId", requireAuth, async (req, res) => {
  const partnerId = firstParam(req.params.partnerId);
  if (!partnerId) return res.status(400).json({ ok: false, error: "INVALID_PARTNER_ID" });
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) return res.status(404).json({ ok: false, error: "PARTNER_NOT_FOUND" });
  res.json({ ok: true, partner });
});

app.post("/partners", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
  const parsed = partnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const partner = await prisma.partner.create({ data: parsed.data });
  res.status(201).json({ ok: true, partner });
});

app.put("/partners/:partnerId", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
  const partnerId = firstParam(req.params.partnerId);
  if (!partnerId) return res.status(400).json({ ok: false, error: "INVALID_PARTNER_ID" });

  const parsed = partnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const exists = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!exists) return res.status(404).json({ ok: false, error: "PARTNER_NOT_FOUND" });

  const partner = await prisma.partner.update({
    where: { id: partnerId },
    data: parsed.data,
  });
  res.json({ ok: true, partner });
});

app.delete("/partners/:partnerId", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
  const partnerId = firstParam(req.params.partnerId);
  if (!partnerId) return res.status(400).json({ ok: false, error: "INVALID_PARTNER_ID" });

  const txCount = await prisma.partnerTransaction.count({ where: { partnerId } });
  if (txCount > 0) {
    return res.status(409).json({ ok: false, error: "PARTNER_HAS_TRANSACTIONS" });
  }

  const exists = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!exists) return res.status(404).json({ ok: false, error: "PARTNER_NOT_FOUND" });

  await prisma.partner.delete({ where: { id: partnerId } });
  res.json({ ok: true });
});

app.get("/partners/:partnerId/accounts", requireAuth, async (req, res) => {
  const partnerId = firstParam(req.params.partnerId);
  if (!partnerId) return res.status(400).json({ ok: false, error: "INVALID_PARTNER_ID" });
  const accounts = await prisma.partnerAccount.findMany({
    where: { partnerId },
    orderBy: { currencyCode: "asc" },
  });
  res.json({ ok: true, accounts });
});

app.get("/partner-transactions", requireAuth, async (req, res) => {
  const partnerId = typeof req.query.partnerId === "string" ? req.query.partnerId : undefined;
  const currencyCode = typeof req.query.currencyCode === "string" ? req.query.currencyCode.toUpperCase() : undefined;
  const direction = typeof req.query.direction === "string" ? req.query.direction : undefined;
  const reconciliationStatus =
    typeof req.query.reconciliationStatus === "string" ? req.query.reconciliationStatus : undefined;

  const transactions = await prisma.partnerTransaction.findMany({
    where: {
      ...(partnerId ? { partnerId } : {}),
      ...(currencyCode ? { currencyCode } : {}),
      ...(direction && ["in", "out"].includes(direction)
        ? { direction: direction as "in" | "out" }
        : {}),
      ...(reconciliationStatus && ["pending", "confirmed", "disputed"].includes(reconciliationStatus)
        ? {
            reconciliationStatus: reconciliationStatus as "pending" | "confirmed" | "disputed",
          }
        : {}),
    },
    include: {
      partner: { select: { id: true, name: true, country: true, city: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  res.json({ ok: true, transactions });
});

app.post("/partner-transactions", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
  const parsed = partnerTxSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_PARTNER_TX_PAYLOAD",
      details: parsed.error.flatten(),
    });
  }

  const {
    partnerId,
    currencyCode,
    amount,
    direction,
    beneficiaryName,
    referenceNo,
    note,
    reconciliationStatus = "pending",
  } = parsed.data;
  const normalizedCurrency = currencyCode.toUpperCase();

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) return res.status(404).json({ ok: false, error: "PARTNER_NOT_FOUND" });

  const currency = await prisma.currency.findUnique({ where: { code: normalizedCurrency } });
  if (!currency) return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.partnerAccount.upsert({
      where: { partnerId_currencyCode: { partnerId, currencyCode: normalizedCurrency } },
      create: { partnerId, currencyCode: normalizedCurrency, balance: 0 },
      update: {},
    });

    const updatedAccount = await tx.partnerAccount.update({
      where: { partnerId_currencyCode: { partnerId, currencyCode: normalizedCurrency } },
      data: {
        balance: direction === "in" ? { increment: amount } : { decrement: amount },
      },
    });

    const transaction = await tx.partnerTransaction.create({
      data: {
        partnerId,
        currencyCode: normalizedCurrency,
        amount,
        direction,
        beneficiaryName: beneficiaryName?.trim() || undefined,
        referenceNo,
        note,
        reconciliationStatus,
      },
    });

    return { updatedAccount, transaction };
  }).catch((error: Error) => ({ error: error.message }));

  if ("error" in result) {
    // eslint-disable-next-line no-console
    console.error("PARTNER_TX_FAILED", result.error);
    return res.status(500).json({ ok: false, error: "PARTNER_TX_FAILED", details: result.error });
  }

  res.status(201).json({ ok: true, ...result });
});

app.put("/partner-transactions/:txId", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
  const txId = firstParam(req.params.txId);
  if (!txId) return res.status(400).json({ ok: false, error: "INVALID_PARTNER_TX_ID" });

  const parsed = partnerTxSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_PARTNER_TX_PAYLOAD",
      details: parsed.error.flatten(),
    });
  }

  const {
    partnerId,
    currencyCode,
    amount,
    direction,
    beneficiaryName,
    referenceNo,
    note,
    reconciliationStatus = "pending",
  } = parsed.data;
  const normalizedCurrency = currencyCode.toUpperCase();

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) return res.status(404).json({ ok: false, error: "PARTNER_NOT_FOUND" });
  const currency = await prisma.currency.findUnique({ where: { code: normalizedCurrency } });
  if (!currency) return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.partnerTransaction.findUnique({ where: { id: txId } });
    if (!existing) throw new Error("PARTNER_TX_NOT_FOUND");

    await tx.partnerAccount.upsert({
      where: { partnerId_currencyCode: { partnerId: existing.partnerId, currencyCode: existing.currencyCode } },
      create: { partnerId: existing.partnerId, currencyCode: existing.currencyCode, balance: 0 },
      update: {},
    });

    await tx.partnerAccount.update({
      where: { partnerId_currencyCode: { partnerId: existing.partnerId, currencyCode: existing.currencyCode } },
      data: {
        balance:
          existing.direction === "in"
            ? { decrement: existing.amount }
            : { increment: existing.amount },
      },
    });

    const nextAccount = await tx.partnerAccount.upsert({
      where: { partnerId_currencyCode: { partnerId, currencyCode: normalizedCurrency } },
      create: { partnerId, currencyCode: normalizedCurrency, balance: 0 },
      update: {},
    });

    await tx.partnerAccount.update({
      where: { partnerId_currencyCode: { partnerId, currencyCode: normalizedCurrency } },
      data: {
        balance: direction === "in" ? { increment: amount } : { decrement: amount },
      },
    });

    const transaction = await tx.partnerTransaction.update({
      where: { id: txId },
      data: {
        partnerId,
        currencyCode: normalizedCurrency,
        amount,
        direction,
        beneficiaryName: beneficiaryName?.trim() || undefined,
        referenceNo: referenceNo?.trim() || undefined,
        note: note?.trim() || undefined,
        reconciliationStatus,
      },
    });

    return { transaction };
  }).catch((error: Error) => ({ error: error.message }));

  if ("error" in result) {
    if (result.error === "PARTNER_TX_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: result.error });
    }
    // eslint-disable-next-line no-console
    console.error("PARTNER_TX_UPDATE_FAILED", result.error);
    return res.status(500).json({ ok: false, error: "PARTNER_TX_UPDATE_FAILED", details: result.error });
  }

  res.json({ ok: true, ...result });
});

app.delete("/partner-transactions/:txId", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
  const txId = firstParam(req.params.txId);
  if (!txId) return res.status(400).json({ ok: false, error: "INVALID_PARTNER_TX_ID" });

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.partnerTransaction.findUnique({ where: { id: txId } });
    if (!existing) throw new Error("PARTNER_TX_NOT_FOUND");

    await tx.partnerAccount.upsert({
      where: { partnerId_currencyCode: { partnerId: existing.partnerId, currencyCode: existing.currencyCode } },
      create: { partnerId: existing.partnerId, currencyCode: existing.currencyCode, balance: 0 },
      update: {},
    });

    await tx.partnerAccount.update({
      where: { partnerId_currencyCode: { partnerId: existing.partnerId, currencyCode: existing.currencyCode } },
      data: {
        balance:
          existing.direction === "in"
            ? { decrement: existing.amount }
            : { increment: existing.amount },
      },
    });

    await tx.partnerTransaction.delete({ where: { id: txId } });
    return { ok: true };
  }).catch((error: Error) => ({ error: error.message }));

  if ("error" in result) {
    if (result.error === "PARTNER_TX_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: result.error });
    }
    // eslint-disable-next-line no-console
    console.error("PARTNER_TX_DELETE_FAILED", result.error);
    return res.status(500).json({ ok: false, error: "PARTNER_TX_DELETE_FAILED", details: result.error });
  }

  res.json({ ok: true });
});

app.get("/dashboard/summary", requireAuth, async (req, res) => {
  const currencyCode =
    typeof req.query.currencyCode === "string" ? req.query.currencyCode.toUpperCase() : "AFN";
  const from = startOfToday();

  const [deposits, paidSlips, partnerIn, partnerOut, customerAccounts] = await Promise.all([
    prisma.depositTransaction.findMany({
      where: { currencyCode, createdAt: { gte: from } },
      select: { amount: true },
    }),
    prisma.slip.findMany({
      where: { currencyCode, status: "paid", paidAt: { gte: from } },
      select: { amount: true },
    }),
    prisma.partnerTransaction.findMany({
      where: { currencyCode, direction: "in", createdAt: { gte: from } },
      select: { amount: true },
    }),
    prisma.partnerTransaction.findMany({
      where: { currencyCode, direction: "out", createdAt: { gte: from } },
      select: { amount: true },
    }),
    prisma.customerAccount.findMany({
      where: { currencyCode },
      select: { balance: true },
    }),
  ]);

  const sum = (rows: Array<{ amount: unknown }>) =>
    rows.reduce((acc, row) => acc + Number(row.amount), 0);

  const incoming = sum(deposits) + sum(partnerIn);
  const outgoing = sum(paidSlips) + sum(partnerOut);
  const balance = customerAccounts.reduce((acc, row) => acc + Number(row.balance), 0);
  const todayNet = incoming - outgoing;

  res.json({
    ok: true,
    currencyCode,
    incoming,
    outgoing,
    balance,
    todayNet,
    pendingSettlements: await prisma.partnerTransaction.count({
      where: { reconciliationStatus: "pending" },
    }),
  });
});

app.get("/dashboard/timeline", requireAuth, async (req, res) => {
  const currencyCode =
    typeof req.query.currencyCode === "string" ? req.query.currencyCode.toUpperCase() : "AFN";
  const fromRaw = firstParam(req.query.from);
  const toRaw = firstParam(req.query.to);
  const from = fromRaw ? new Date(fromRaw) : startOfToday();
  const to = toRaw ? new Date(toRaw) : new Date();

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return res.status(400).json({ ok: false, error: "INVALID_DATE_RANGE" });
  }

  const [deposits, partnerIn, paidSlips, partnerOut] = await Promise.all([
    prisma.depositTransaction.findMany({
      where: { currencyCode, createdAt: { gte: from, lte: to } },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.partnerTransaction.findMany({
      where: { currencyCode, direction: "in", createdAt: { gte: from, lte: to } },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.slip.findMany({
      where: { currencyCode, status: "paid", paidAt: { gte: from, lte: to } },
      select: { amount: true, paidAt: true },
      orderBy: { paidAt: "asc" },
    }),
    prisma.partnerTransaction.findMany({
      where: { currencyCode, direction: "out", createdAt: { gte: from, lte: to } },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const rangeMs = to.getTime() - from.getTime();
  const bucketMs = rangeMs <= 48 * 60 * 60 * 1000 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const bucketStart = (date: Date) =>
    new Date(Math.floor(date.getTime() / bucketMs) * bucketMs).toISOString();

  const map = new Map<string, { incoming: number; outgoing: number }>();
  const add = (key: string, side: "incoming" | "outgoing", amount: number) => {
    const row = map.get(key) ?? { incoming: 0, outgoing: 0 };
    row[side] += amount;
    map.set(key, row);
  };

  for (const row of deposits) add(bucketStart(row.createdAt), "incoming", Number(row.amount));
  for (const row of partnerIn) add(bucketStart(row.createdAt), "incoming", Number(row.amount));
  for (const row of paidSlips) {
    if (row.paidAt) add(bucketStart(row.paidAt), "outgoing", Number(row.amount));
  }
  for (const row of partnerOut) add(bucketStart(row.createdAt), "outgoing", Number(row.amount));

  const points = Array.from(map.entries())
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([timestamp, v]) => ({
      timestamp,
      incoming: v.incoming,
      outgoing: v.outgoing,
      net: v.incoming - v.outgoing,
    }));

  res.json({
    ok: true,
    currencyCode,
    from: from.toISOString(),
    to: to.toISOString(),
    bucket: bucketMs === 60 * 60 * 1000 ? "hour" : "day",
    points,
  });
});

app.get("/reports/customer-balances", requireAuth, async (_req, res) => {
  const accounts = await prisma.customerAccount.findMany({
    include: {
      customer: { select: { id: true, fullName: true } },
    },
    orderBy: [{ currencyCode: "asc" }, { updatedAt: "desc" }],
  });
  res.json({ ok: true, accounts });
});

app.get("/reports/partner-balances", requireAuth, async (_req, res) => {
  const accounts = await prisma.partnerAccount.findMany({
    include: {
      partner: { select: { id: true, name: true } },
    },
    orderBy: [{ currencyCode: "asc" }, { updatedAt: "desc" }],
  });
  res.json({ ok: true, accounts });
});

app.get("/reports/daily-cash", requireAuth, async (req, res) => {
  const currencyCode =
    typeof req.query.currencyCode === "string" ? req.query.currencyCode.toUpperCase() : "AFN";
  const date = typeof req.query.date === "string" ? new Date(req.query.date) : new Date();
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const to = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

  const [deposits, paidSlips, partnerIn, partnerOut] = await Promise.all([
    prisma.depositTransaction.findMany({
      where: { currencyCode, createdAt: { gte: from, lt: to } },
      select: { amount: true },
    }),
    prisma.slip.findMany({
      where: { currencyCode, status: "paid", paidAt: { gte: from, lt: to } },
      select: { amount: true },
    }),
    prisma.partnerTransaction.findMany({
      where: { currencyCode, direction: "in", createdAt: { gte: from, lt: to } },
      select: { amount: true },
    }),
    prisma.partnerTransaction.findMany({
      where: { currencyCode, direction: "out", createdAt: { gte: from, lt: to } },
      select: { amount: true },
    }),
  ]);

  const sum = (rows: Array<{ amount: unknown }>) =>
    rows.reduce((acc, row) => acc + Number(row.amount), 0);

  const customerIncoming = sum(deposits);
  const customerOutgoing = sum(paidSlips);
  const partnerIncoming = sum(partnerIn);
  const partnerOutgoing = sum(partnerOut);

  res.json({
    ok: true,
    currencyCode,
    date: from.toISOString(),
    customerIncoming,
    customerOutgoing,
    partnerIncoming,
    partnerOutgoing,
    net: customerIncoming + partnerIncoming - customerOutgoing - partnerOutgoing,
  });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});

