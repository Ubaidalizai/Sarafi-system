"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const zod_1 = require("zod");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./db");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "sarafi-backend" });
});
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret";
const requireAuth = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }
    const token = header.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, jwtSecret);
        req.user = payload;
        return next();
    }
    catch {
        return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
    }
};
const requireRole = (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }
    return next();
};
app.post("/auth/register", requireAuth, requireRole(["admin"]), async (req, res) => {
    const schema = zod_1.z.object({
        username: zod_1.z.string().min(3).max(50),
        password: zod_1.z.string().min(6).max(200),
        role: zod_1.z.enum(["admin", "cashier", "accountant"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const { username, password, role } = parsed.data;
    const exists = await db_1.prisma.user.findUnique({ where: { username } });
    if (exists)
        return res.status(409).json({ ok: false, error: "USERNAME_EXISTS" });
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    const user = await db_1.prisma.user.create({
        data: { username, passwordHash, role: role ?? "cashier" },
        select: { id: true, username: true, role: true, isActive: true, createdAt: true },
    });
    res.json({ ok: true, user });
});
app.post("/auth/login", async (req, res) => {
    const schema = zod_1.z.object({
        username: zod_1.z.string().min(1),
        password: zod_1.z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const { username, password } = parsed.data;
    const user = await db_1.prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive)
        return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!ok)
        return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    const token = jsonwebtoken_1.default.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: "12h" });
    res.json({ ok: true, token, user: { id: user.id, username: user.username, role: user.role } });
});
app.patch("/auth/me", requireAuth, async (req, res) => {
    const schema = zod_1.z
        .object({
        username: zod_1.z.string().min(3).max(50).optional(),
        currentPassword: zod_1.z.string().min(1).max(200).optional(),
        newPassword: zod_1.z.string().min(6).max(200).optional(),
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
    if (!req.user?.sub)
        return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    const userId = req.user.sub;
    const { username, currentPassword, newPassword } = parsed.data;
    const user = await db_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive)
        return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    const nextUsername = username?.trim();
    if (nextUsername && nextUsername !== user.username) {
        const usernameTaken = await db_1.prisma.user.findUnique({ where: { username: nextUsername } });
        if (usernameTaken && usernameTaken.id !== user.id) {
            return res.status(409).json({ ok: false, error: "USERNAME_EXISTS" });
        }
    }
    if (newPassword) {
        const passwordOk = await bcryptjs_1.default.compare(currentPassword ?? "", user.passwordHash);
        if (!passwordOk)
            return res.status(401).json({ ok: false, error: "INVALID_CURRENT_PASSWORD" });
    }
    const updatedUser = await db_1.prisma.user.update({
        where: { id: userId },
        data: {
            ...(nextUsername ? { username: nextUsername } : {}),
            ...(newPassword ? { passwordHash: await bcryptjs_1.default.hash(newPassword, 10) } : {}),
        },
        select: { id: true, username: true, role: true },
    });
    return res.json({ ok: true, user: updatedUser });
});
const customerSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2).max(120),
    phone: zod_1.z.string().max(30).optional(),
    idNumber: zod_1.z.string().max(60).optional(),
    notes: zod_1.z.string().max(500).optional(),
});
const parseLocalizedNumber = (value) => {
    if (typeof value === "number")
        return value;
    if (typeof value !== "string")
        return value;
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
const amountSchema = zod_1.z.preprocess(parseLocalizedNumber, zod_1.z.number().positive());
const depositSchema = zod_1.z.object({
    customerId: zod_1.z.string().min(1),
    currencyCode: zod_1.z.string().min(2).max(10),
    amount: amountSchema,
    note: zod_1.z.string().max(500).optional(),
});
const slipResponseInclude = {
    customer: { select: { id: true, fullName: true, phone: true } },
    fundingAccount: { select: { id: true, displayName: true } },
    partnerAccount: {
        select: {
            id: true,
            currencyCode: true,
            partner: { select: { id: true, name: true } },
        },
    },
};
const applyPartnerPayoutForSlip = async (tx, slip) => {
    if (!slip.partnerAccountId)
        return;
    const existing = await tx.partnerTransaction.findUnique({ where: { slipId: slip.id } });
    if (existing)
        return;
    const pa = await tx.partnerAccount.findUnique({
        where: { id: slip.partnerAccountId },
        include: { partner: true },
    });
    if (!pa)
        throw new Error("PARTNER_ACCOUNT_NOT_FOUND");
    if (pa.currencyCode !== slip.currencyCode)
        throw new Error("PARTNER_SLIP_CURRENCY_MISMATCH");
    if (Number(pa.balance) < Number(slip.amount))
        throw new Error("INSUFFICIENT_PARTNER_BALANCE");
    await tx.partnerAccount.update({
        where: { id: slip.partnerAccountId },
        data: { balance: { decrement: slip.amount } },
    });
    const cust = await tx.customer.findUnique({ where: { id: slip.customerId }, select: { fullName: true } });
    await tx.partnerTransaction.create({
        data: {
            partnerId: pa.partnerId,
            currencyCode: slip.currencyCode,
            amount: slip.amount,
            direction: "out",
            beneficiaryName: slip.paidToName?.trim() || cust?.fullName?.trim() || undefined,
            referenceNo: slip.slipCode,
            note: "SLIP_PAYOUT",
            reconciliationStatus: "confirmed",
            slipId: slip.id,
        },
    });
};
const reversePartnerPayoutForSlip = async (tx, slipId) => {
    const ptx = await tx.partnerTransaction.findUnique({ where: { slipId } });
    if (!ptx)
        return;
    await tx.partnerAccount.update({
        where: { partnerId_currencyCode: { partnerId: ptx.partnerId, currencyCode: ptx.currencyCode } },
        data: { balance: { increment: ptx.amount } },
    });
    await tx.partnerTransaction.delete({ where: { id: ptx.id } });
};
const slipIssueBodySchema = zod_1.z.object({
    customerId: zod_1.z.string().min(1),
    currencyCode: zod_1.z.string().min(2).max(10),
    amount: amountSchema,
    paidToName: zod_1.z.string().min(1).max(120),
    note: zod_1.z.string().max(500).optional(),
    fundingAccountId: zod_1.z.string().min(1).optional(),
    partnerAccountId: zod_1.z.string().min(1).optional(),
});
const issueSlipSchema = slipIssueBodySchema.refine((d) => Boolean(d.fundingAccountId) !== Boolean(d.partnerAccountId), { message: "SLIP_SOURCE_REQUIRED" });
const payoutSlipSchema = zod_1.z.object({
    receiverName: zod_1.z.string().max(120).optional(),
    paidToName: zod_1.z.string().max(120).optional(),
    note: zod_1.z.string().max(500).optional(),
});
const slipStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(["cancelled", "expired"]),
});
const slipReviewStatusSchema = zod_1.z.object({
    reviewStatus: zod_1.z.enum(["waiting", "confirmed", "rejected"]),
});
const updateSlipSchema = slipIssueBodySchema.refine((d) => Boolean(d.fundingAccountId) !== Boolean(d.partnerAccountId), { message: "SLIP_SOURCE_REQUIRED" });
const fundingAccountCreateSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(1).max(160),
    phone: zod_1.z.string().max(40).optional(),
    notes: zod_1.z.string().max(500).optional(),
});
const fundingAccountUpdateSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(1).max(160).optional(),
    phone: zod_1.z.string().max(40).nullable().optional(),
    notes: zod_1.z.string().max(500).nullable().optional(),
    isActive: zod_1.z.boolean().optional(),
});
const fundingRepaymentSchema = zod_1.z.object({
    currencyCode: zod_1.z.string().min(2).max(10),
    amount: amountSchema,
    note: zod_1.z.string().max(500).optional(),
});
const fundingRepaymentUpdateSchema = zod_1.z
    .object({
    currencyCode: zod_1.z.string().min(2).max(10).optional(),
    amount: amountSchema.optional(),
    note: zod_1.z.string().max(500).nullable().optional(),
})
    .refine((p) => p.currencyCode !== undefined || p.amount !== undefined || p.note !== undefined, {
    message: "NOTHING_TO_UPDATE",
});
const partnerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(120),
    country: zod_1.z.string().max(80).optional(),
    city: zod_1.z.string().max(80).optional(),
    contact: zod_1.z.string().max(80).optional(),
    notes: zod_1.z.string().max(500).optional(),
});
const partnerTxSchema = zod_1.z.object({
    partnerId: zod_1.z.string().min(1),
    currencyCode: zod_1.z.string().min(2).max(10),
    amount: amountSchema,
    direction: zod_1.z.enum(["in", "out"]),
    beneficiaryName: zod_1.z.string().max(120).optional(),
    referenceNo: zod_1.z.string().max(120).optional(),
    note: zod_1.z.string().max(500).optional(),
    reconciliationStatus: zod_1.z.enum(["pending", "confirmed", "disputed"]).optional(),
});
const defaultCurrencies = [
    { code: "AFN", name: "Afghani" },
    { code: "AED", name: "UAE Darham" },
    { code: "USD", name: "US Dollar" },
    { code: "IRR", name: "Iranian Rial" },
    { code: "PKR", name: "Pakistani Rupee" },
    { code: "TOMAN", name: "Toman" },
];
/** Next slip code: "1", "2", "3", … (numeric string; ignores legacy non-numeric slipCode rows). */
const nextNumericSlipCode = async (tx) => {
    const rows = await tx.$queryRaw `
    SELECT COALESCE(MAX(CAST(slipCode AS INTEGER)), 0) + 1 AS n
    FROM Slip
    WHERE slipCode GLOB '[0-9]*'
  `;
    return String(Number(rows[0]?.n ?? 1));
};
const firstParam = (value) => {
    if (typeof value === "string")
        return value;
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
const currencyPrecision = {
    AFN: 2,
    AED: 2,
    USD: 2,
    IRR: 0,
    PKR: 2,
    TOMAN: 0,
};
const toFixedByCurrency = (amount, currencyCode) => {
    const precision = currencyPrecision[currencyCode] ?? 2;
    const factor = 10 ** precision;
    return Math.round((amount + Number.EPSILON) * factor) / factor;
};
const hasValidCurrencyPrecision = (amount, currencyCode) => {
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
const exchangeSchema = zod_1.z
    .object({
    customerId: zod_1.z.string().min(1),
    fromCurrency: zod_1.z.string().min(2).max(10),
    toCurrency: zod_1.z.string().min(2).max(10),
    sourceAmount: amountSchema,
    rate: zod_1.z.preprocess(parseLocalizedNumber, zod_1.z.number().positive()),
    feeAmount: zod_1.z.preprocess(parseLocalizedNumber, zod_1.z.number().min(0)).optional(),
    notes: zod_1.z.string().max(500).optional(),
    clientReference: zod_1.z.string().max(100).optional(),
    settlementMode: zod_1.z.enum(["from_balance", "cash_in"]).optional(),
})
    .refine((payload) => payload.fromCurrency.toUpperCase() !== payload.toCurrency.toUpperCase(), {
    message: "SAME_CURRENCY_NOT_ALLOWED",
    path: ["toCurrency"],
});
app.post("/api/v1/exchanges", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const parsed = exchangeSchema.safeParse(req.body);
    if (!parsed.success) {
        const issueMessage = parsed.error.issues[0]?.message;
        if (issueMessage === "SAME_CURRENCY_NOT_ALLOWED") {
            return res.status(400).json({ ok: false, error: issueMessage });
        }
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    }
    const userId = req.user?.sub;
    if (!userId)
        return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    const { customerId, sourceAmount, rate, notes, clientReference, feeAmount = 0, settlementMode = "from_balance", fromCurrency: rawFromCurrency, toCurrency: rawToCurrency, } = parsed.data;
    const fromCurrency = rawFromCurrency.toUpperCase();
    const toCurrency = rawToCurrency.toUpperCase();
    if (!hasValidCurrencyPrecision(sourceAmount, fromCurrency) || !hasValidCurrencyPrecision(feeAmount, toCurrency)) {
        return res.status(422).json({ ok: false, error: "CURRENCY_PRECISION_MISMATCH" });
    }
    const targetAmountGross = toFixedByCurrency(sourceAmount * rate, toCurrency);
    const targetAmountNet = toFixedByCurrency(targetAmountGross - feeAmount, toCurrency);
    if (targetAmountNet <= 0)
        return res.status(400).json({ ok: false, error: "INVALID_NET_AMOUNT" });
    if (!hasValidCurrencyPrecision(targetAmountGross, toCurrency) || !hasValidCurrencyPrecision(targetAmountNet, toCurrency)) {
        return res.status(422).json({ ok: false, error: "CURRENCY_PRECISION_MISMATCH" });
    }
    const duplicateClientRef = clientReference
        ? await db_1.prisma.exchangeTransaction.findUnique({ where: { clientReference } })
        : null;
    if (duplicateClientRef)
        return res.status(409).json({ ok: false, error: "DUPLICATE_CLIENT_REFERENCE" });
    const customer = await db_1.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer)
        return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
    const actor = await db_1.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!actor)
        return res.status(401).json({ ok: false, error: "SESSION_STALE_RELOGIN" });
    const [fromCurrencyExists, toCurrencyExists] = await Promise.all([
        db_1.prisma.currency.findUnique({ where: { code: fromCurrency } }),
        db_1.prisma.currency.findUnique({ where: { code: toCurrency } }),
    ]);
    if (!fromCurrencyExists || !toCurrencyExists)
        return res.status(400).json({ ok: false, error: "INVALID_CURRENCY" });
    const posted = await db_1.prisma.$transaction(async (tx) => {
        if (settlementMode === "from_balance") {
            const sourceAccount = await tx.customerAccount.upsert({
                where: { customerId_currencyCode: { customerId, currencyCode: fromCurrency } },
                create: { customerId, currencyCode: fromCurrency, balance: 0 },
                update: {},
            });
            if (Number(sourceAccount.balance) < sourceAmount)
                throw new Error("INSUFFICIENT_SOURCE_BALANCE");
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
    }).catch((error) => ({ error: error.message }));
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
    const exchanges = await db_1.prisma.exchangeTransaction.findMany({
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
    const customers = await db_1.prisma.customer.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    res.json({ ok: true, customers });
});
app.get("/customers/:customerId", requireAuth, async (req, res) => {
    const customerId = firstParam(req.params.customerId);
    if (!customerId)
        return res.status(400).json({ ok: false, error: "INVALID_CUSTOMER_ID" });
    const customer = await db_1.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer)
        return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
    res.json({ ok: true, customer });
});
app.post("/customers", requireAuth, async (req, res) => {
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const normalizedName = parsed.data.fullName.normalize("NFC").trim();
    const customer = await db_1.prisma.$transaction(async (tx) => {
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
    if (!customerId)
        return res.status(400).json({ ok: false, error: "INVALID_CUSTOMER_ID" });
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const exists = await db_1.prisma.customer.findUnique({ where: { id: customerId } });
    if (!exists)
        return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
    const normalizedName = parsed.data.fullName.normalize("NFC").trim();
    const customer = await db_1.prisma.customer.update({
        where: { id: customerId },
        data: { ...parsed.data, fullName: normalizedName },
    });
    res.json({ ok: true, customer });
});
app.delete("/customers/:customerId", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const customerId = firstParam(req.params.customerId);
    if (!customerId)
        return res.status(400).json({ ok: false, error: "INVALID_CUSTOMER_ID" });
    const [depositCount, slipCount, accounts] = await Promise.all([
        db_1.prisma.depositTransaction.count({ where: { customerId } }),
        db_1.prisma.slip.count({ where: { customerId } }),
        db_1.prisma.customerAccount.findMany({
            where: { customerId },
            select: { balance: true },
        }),
    ]);
    const hasNonZeroBalance = accounts.some((a) => Number(a.balance) !== 0);
    if (depositCount > 0 || slipCount > 0 || hasNonZeroBalance) {
        return res.status(409).json({ ok: false, error: "CUSTOMER_HAS_TRANSACTIONS" });
    }
    const exists = await db_1.prisma.customer.findUnique({ where: { id: customerId } });
    if (!exists)
        return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
    await db_1.prisma.customer.delete({ where: { id: customerId } });
    res.json({ ok: true });
});
app.get("/currencies", requireAuth, async (_req, res) => {
    for (const item of defaultCurrencies) {
        await db_1.prisma.currency.upsert({
            where: { code: item.code },
            create: item,
            update: { isActive: true, name: item.name },
        });
    }
    const currencies = await db_1.prisma.currency.findMany({
        where: { isActive: true },
        orderBy: { code: "asc" },
    });
    res.json({ ok: true, currencies });
});
app.get("/customers/:customerId/accounts", requireAuth, async (req, res) => {
    const customerId = firstParam(req.params.customerId);
    if (!customerId)
        return res.status(400).json({ ok: false, error: "INVALID_CUSTOMER_ID" });
    const accounts = await db_1.prisma.customerAccount.findMany({
        where: { customerId },
        orderBy: { currencyCode: "asc" },
    });
    res.json({ ok: true, accounts });
});
app.post("/deposits", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const parsed = depositSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const { customerId, currencyCode, amount, note } = parsed.data;
    const normalizedCurrency = currencyCode.toUpperCase();
    const customer = await db_1.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer)
        return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
    const currency = await db_1.prisma.currency.findUnique({ where: { code: normalizedCurrency } });
    if (!currency)
        return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });
    const result = await db_1.prisma.$transaction(async (tx) => {
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
    const deposits = await db_1.prisma.depositTransaction.findMany({
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
    if (!depositId)
        return res.status(400).json({ ok: false, error: "INVALID_DEPOSIT_ID" });
    const parsed = depositSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const { customerId, currencyCode, amount, note } = parsed.data;
    const normalizedCurrency = currencyCode.toUpperCase();
    const customer = await db_1.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer)
        return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
    const currency = await db_1.prisma.currency.findUnique({ where: { code: normalizedCurrency } });
    if (!currency)
        return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });
    const result = await db_1.prisma.$transaction(async (tx) => {
        const existing = await tx.depositTransaction.findUnique({ where: { id: depositId } });
        if (!existing)
            throw new Error("DEPOSIT_NOT_FOUND");
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
    }).catch((error) => ({ error: error.message }));
    if ("error" in result) {
        if (result.error === "DEPOSIT_NOT_FOUND")
            return res.status(404).json({ ok: false, error: result.error });
        if (result.error === "INSUFFICIENT_BALANCE_ADJUSTMENT") {
            return res.status(409).json({ ok: false, error: result.error });
        }
        return res.status(500).json({ ok: false, error: "DEPOSIT_UPDATE_FAILED" });
    }
    res.json({ ok: true, ...result });
});
app.delete("/deposits/:depositId", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const depositId = firstParam(req.params.depositId);
    if (!depositId)
        return res.status(400).json({ ok: false, error: "INVALID_DEPOSIT_ID" });
    const result = await db_1.prisma.$transaction(async (tx) => {
        const existing = await tx.depositTransaction.findUnique({ where: { id: depositId } });
        if (!existing)
            throw new Error("DEPOSIT_NOT_FOUND");
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
    }).catch((error) => ({ error: error.message }));
    if ("error" in result) {
        if (result.error === "DEPOSIT_NOT_FOUND")
            return res.status(404).json({ ok: false, error: result.error });
        if (result.error === "INSUFFICIENT_BALANCE_ADJUSTMENT") {
            return res.status(409).json({ ok: false, error: result.error });
        }
        return res.status(500).json({ ok: false, error: "DEPOSIT_DELETE_FAILED" });
    }
    res.json({ ok: true });
});
const buildFundingSummaries = async () => {
    const slipSums = await db_1.prisma.slip.groupBy({
        by: ["fundingAccountId", "currencyCode"],
        where: { fundingAccountId: { not: null }, status: "paid" },
        _sum: { amount: true },
    });
    const repSums = await db_1.prisma.fundingAccountRepayment.groupBy({
        by: ["fundingAccountId", "currencyCode"],
        _sum: { amount: true },
    });
    const slipPaidByAccount = new Map();
    for (const row of slipSums) {
        if (!row.fundingAccountId)
            continue;
        const m = slipPaidByAccount.get(row.fundingAccountId) ?? new Map();
        m.set(row.currencyCode, Number(row._sum.amount ?? 0));
        slipPaidByAccount.set(row.fundingAccountId, m);
    }
    const repaidByAccount = new Map();
    for (const row of repSums) {
        const m = repaidByAccount.get(row.fundingAccountId) ?? new Map();
        m.set(row.currencyCode, Number(row._sum.amount ?? 0));
        repaidByAccount.set(row.fundingAccountId, m);
    }
    return { slipPaidByAccount, repaidByAccount };
};
app.get("/funding-accounts", requireAuth, async (_req, res) => {
    const accounts = await db_1.prisma.fundingAccount.findMany({
        orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
        take: 500,
    });
    const { slipPaidByAccount, repaidByAccount } = await buildFundingSummaries();
    const payload = accounts.map((a) => {
        const slipM = slipPaidByAccount.get(a.id);
        const repM = repaidByAccount.get(a.id);
        const codes = new Set([...(slipM?.keys() ?? []), ...(repM?.keys() ?? [])]);
        const summaries = [...codes].map((currencyCode) => {
            const slipPaidTotal = slipM?.get(currencyCode) ?? 0;
            const repaidTotal = repM?.get(currencyCode) ?? 0;
            return { currencyCode, slipPaidTotal, repaidTotal, netOwed: slipPaidTotal - repaidTotal };
        });
        return { ...a, summaries };
    });
    res.json({ ok: true, accounts: payload });
});
app.post("/funding-accounts", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const parsed = fundingAccountCreateSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const { displayName, phone, notes } = parsed.data;
    const account = await db_1.prisma.fundingAccount.create({
        data: {
            displayName: displayName.trim(),
            phone: phone?.trim() || null,
            notes: notes?.trim() || null,
        },
    });
    res.status(201).json({ ok: true, account });
});
app.get("/funding-accounts/:fundingAccountId", requireAuth, async (req, res) => {
    const fundingAccountId = firstParam(req.params.fundingAccountId);
    if (!fundingAccountId)
        return res.status(400).json({ ok: false, error: "INVALID_FUNDING_ACCOUNT_ID" });
    const account = await db_1.prisma.fundingAccount.findUnique({ where: { id: fundingAccountId } });
    if (!account)
        return res.status(404).json({ ok: false, error: "FUNDING_ACCOUNT_NOT_FOUND" });
    const { slipPaidByAccount, repaidByAccount } = await buildFundingSummaries();
    const slipM = slipPaidByAccount.get(account.id);
    const repM = repaidByAccount.get(account.id);
    const codes = new Set([...(slipM?.keys() ?? []), ...(repM?.keys() ?? [])]);
    const summaries = [...codes].map((currencyCode) => {
        const slipPaidTotal = slipM?.get(currencyCode) ?? 0;
        const repaidTotal = repM?.get(currencyCode) ?? 0;
        return { currencyCode, slipPaidTotal, repaidTotal, netOwed: slipPaidTotal - repaidTotal };
    });
    const [slips, repayments] = await Promise.all([
        db_1.prisma.slip.findMany({
            where: { fundingAccountId },
            include: slipResponseInclude,
            orderBy: { createdAt: "desc" },
            take: 120,
        }),
        db_1.prisma.fundingAccountRepayment.findMany({
            where: { fundingAccountId },
            orderBy: { createdAt: "desc" },
            take: 120,
        }),
    ]);
    let lastPaidSlipRow = await db_1.prisma.slip.findFirst({
        where: { fundingAccountId, status: "paid", paidAt: { not: null } },
        orderBy: { paidAt: "desc" },
        include: slipResponseInclude,
    });
    if (!lastPaidSlipRow) {
        lastPaidSlipRow = await db_1.prisma.slip.findFirst({
            where: { fundingAccountId, status: "paid" },
            orderBy: { createdAt: "desc" },
            include: slipResponseInclude,
        });
    }
    let lastPaidSlip = null;
    if (lastPaidSlipRow) {
        const anchor = lastPaidSlipRow.paidAt ?? lastPaidSlipRow.createdAt;
        const repSum = await db_1.prisma.fundingAccountRepayment.aggregate({
            where: {
                fundingAccountId,
                currencyCode: lastPaidSlipRow.currencyCode,
                createdAt: { gte: anchor },
            },
            _sum: { amount: true },
        });
        lastPaidSlip = {
            slipCode: lastPaidSlipRow.slipCode,
            currencyCode: lastPaidSlipRow.currencyCode,
            amount: Number(lastPaidSlipRow.amount),
            createdAt: lastPaidSlipRow.createdAt.toISOString(),
            paidAt: lastPaidSlipRow.paidAt ? lastPaidSlipRow.paidAt.toISOString() : null,
            customerName: lastPaidSlipRow.customer?.fullName ?? null,
            paidToName: lastPaidSlipRow.paidToName?.trim() || null,
            repaidSinceSlip: Number(repSum._sum.amount ?? 0),
        };
    }
    res.json({ ok: true, account, summaries, slips, repayments, lastPaidSlip });
});
app.patch("/funding-accounts/:fundingAccountId", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const fundingAccountId = firstParam(req.params.fundingAccountId);
    if (!fundingAccountId)
        return res.status(400).json({ ok: false, error: "INVALID_FUNDING_ACCOUNT_ID" });
    const parsed = fundingAccountUpdateSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const exists = await db_1.prisma.fundingAccount.findUnique({ where: { id: fundingAccountId } });
    if (!exists)
        return res.status(404).json({ ok: false, error: "FUNDING_ACCOUNT_NOT_FOUND" });
    const data = {};
    if (parsed.data.displayName !== undefined)
        data.displayName = parsed.data.displayName.trim();
    if (parsed.data.phone !== undefined)
        data.phone = parsed.data.phone?.trim() || null;
    if (parsed.data.notes !== undefined)
        data.notes = parsed.data.notes?.trim() || null;
    if (parsed.data.isActive !== undefined)
        data.isActive = parsed.data.isActive;
    const account = await db_1.prisma.fundingAccount.update({ where: { id: fundingAccountId }, data });
    res.json({ ok: true, account });
});
app.delete("/funding-accounts/:fundingAccountId", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const fundingAccountId = firstParam(req.params.fundingAccountId);
    if (!fundingAccountId)
        return res.status(400).json({ ok: false, error: "INVALID_FUNDING_ACCOUNT_ID" });
    const [slipCount, repCount] = await Promise.all([
        db_1.prisma.slip.count({ where: { fundingAccountId } }),
        db_1.prisma.fundingAccountRepayment.count({ where: { fundingAccountId } }),
    ]);
    if (slipCount > 0 || repCount > 0) {
        return res.status(409).json({ ok: false, error: "FUNDING_ACCOUNT_NOT_EMPTY" });
    }
    await db_1.prisma.fundingAccount.delete({ where: { id: fundingAccountId } });
    res.json({ ok: true });
});
app.post("/funding-accounts/:fundingAccountId/repayments", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const fundingAccountId = firstParam(req.params.fundingAccountId);
    if (!fundingAccountId)
        return res.status(400).json({ ok: false, error: "INVALID_FUNDING_ACCOUNT_ID" });
    const parsed = fundingRepaymentSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const account = await db_1.prisma.fundingAccount.findUnique({ where: { id: fundingAccountId } });
    if (!account)
        return res.status(404).json({ ok: false, error: "FUNDING_ACCOUNT_NOT_FOUND" });
    if (!account.isActive)
        return res.status(409).json({ ok: false, error: "FUNDING_ACCOUNT_INACTIVE" });
    const currencyCode = parsed.data.currencyCode.toUpperCase();
    const cur = await db_1.prisma.currency.findUnique({ where: { code: currencyCode } });
    if (!cur)
        return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });
    const row = await db_1.prisma.fundingAccountRepayment.create({
        data: {
            fundingAccountId,
            currencyCode,
            amount: parsed.data.amount,
            note: parsed.data.note?.trim() || null,
        },
    });
    res.status(201).json({ ok: true, repayment: row });
});
app.patch("/funding-accounts/:fundingAccountId/repayments/:repaymentId", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const fundingAccountId = firstParam(req.params.fundingAccountId);
    const repaymentId = firstParam(req.params.repaymentId);
    if (!fundingAccountId || !repaymentId) {
        return res.status(400).json({ ok: false, error: "INVALID_FUNDING_REPAYMENT_PARAMS" });
    }
    const parsed = fundingRepaymentUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
        const issue = parsed.error.issues[0]?.message;
        if (issue === "NOTHING_TO_UPDATE")
            return res.status(400).json({ ok: false, error: issue });
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    }
    const existing = await db_1.prisma.fundingAccountRepayment.findFirst({
        where: { id: repaymentId, fundingAccountId },
    });
    if (!existing)
        return res.status(404).json({ ok: false, error: "REPAYMENT_NOT_FOUND" });
    const data = {};
    if (parsed.data.currencyCode !== undefined) {
        const cc = parsed.data.currencyCode.toUpperCase();
        const cur = await db_1.prisma.currency.findUnique({ where: { code: cc } });
        if (!cur)
            return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });
        data.currencyCode = cc;
    }
    if (parsed.data.amount !== undefined)
        data.amount = parsed.data.amount;
    if (parsed.data.note !== undefined)
        data.note = parsed.data.note === null ? null : parsed.data.note?.trim() || null;
    const repayment = await db_1.prisma.fundingAccountRepayment.update({
        where: { id: repaymentId },
        data,
    });
    res.json({ ok: true, repayment });
});
app.delete("/funding-accounts/:fundingAccountId/repayments/:repaymentId", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const fundingAccountId = firstParam(req.params.fundingAccountId);
    const repaymentId = firstParam(req.params.repaymentId);
    if (!fundingAccountId || !repaymentId) {
        return res.status(400).json({ ok: false, error: "INVALID_FUNDING_REPAYMENT_PARAMS" });
    }
    const existing = await db_1.prisma.fundingAccountRepayment.findFirst({
        where: { id: repaymentId, fundingAccountId },
    });
    if (!existing)
        return res.status(404).json({ ok: false, error: "REPAYMENT_NOT_FOUND" });
    await db_1.prisma.fundingAccountRepayment.delete({ where: { id: repaymentId } });
    res.json({ ok: true });
});
app.get("/partner-accounts-for-slips", requireAuth, async (req, res) => {
    const currencyRaw = firstParam(req.query.currencyCode);
    const currencyCode = currencyRaw ? currencyRaw.toUpperCase() : undefined;
    const rows = await db_1.prisma.partnerAccount.findMany({
        where: currencyCode ? { currencyCode } : {},
        include: { partner: { select: { id: true, name: true } } },
        orderBy: [{ partner: { name: "asc" } }, { currencyCode: "asc" }],
        take: 500,
    });
    res.json({
        ok: true,
        accounts: rows.map((a) => ({
            id: a.id,
            partnerId: a.partnerId,
            partnerName: a.partner.name,
            currencyCode: a.currencyCode,
            balance: Number(a.balance),
        })),
    });
});
app.post("/slips", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const parsed = issueSlipSchema.safeParse(req.body);
    if (!parsed.success) {
        const slipSrc = parsed.error.issues.find((i) => i.message === "SLIP_SOURCE_REQUIRED");
        if (slipSrc)
            return res.status(400).json({ ok: false, error: "SLIP_SOURCE_REQUIRED" });
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    }
    const { customerId, currencyCode, amount, fundingAccountId, partnerAccountId, paidToName, note } = parsed.data;
    const normalizedCurrency = currencyCode.toUpperCase();
    const customer = await db_1.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer)
        return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
    const currency = await db_1.prisma.currency.findUnique({ where: { code: normalizedCurrency } });
    if (!currency)
        return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });
    if (fundingAccountId) {
        const funding = await db_1.prisma.fundingAccount.findUnique({ where: { id: fundingAccountId } });
        if (!funding)
            return res.status(404).json({ ok: false, error: "FUNDING_ACCOUNT_NOT_FOUND" });
        if (!funding.isActive)
            return res.status(409).json({ ok: false, error: "FUNDING_ACCOUNT_INACTIVE" });
        const slip = await db_1.prisma.$transaction(async (tx) => {
            const slipCode = await nextNumericSlipCode(tx);
            return tx.slip.create({
                data: {
                    slipCode,
                    customerId,
                    currencyCode: normalizedCurrency,
                    amount,
                    fundingAccountId,
                    partnerAccountId: null,
                    receiverName: funding.displayName.trim(),
                    paidToName: paidToName.trim(),
                    note,
                    status: "issued",
                    reviewStatus: "waiting",
                },
                include: slipResponseInclude,
            });
        });
        return res.status(201).json({ ok: true, slip });
    }
    const pa = await db_1.prisma.partnerAccount.findUnique({
        where: { id: partnerAccountId },
        include: { partner: true },
    });
    if (!pa)
        return res.status(404).json({ ok: false, error: "PARTNER_ACCOUNT_NOT_FOUND" });
    if (pa.currencyCode !== normalizedCurrency) {
        return res.status(409).json({ ok: false, error: "PARTNER_SLIP_CURRENCY_MISMATCH" });
    }
    const slip = await db_1.prisma.$transaction(async (tx) => {
        const slipCode = await nextNumericSlipCode(tx);
        return tx.slip.create({
            data: {
                slipCode,
                customerId,
                currencyCode: normalizedCurrency,
                amount,
                fundingAccountId: null,
                partnerAccountId: pa.id,
                receiverName: pa.partner.name.trim(),
                paidToName: paidToName.trim(),
                note,
                status: "issued",
                reviewStatus: "waiting",
            },
            include: slipResponseInclude,
        });
    });
    res.status(201).json({ ok: true, slip });
});
app.get("/slips/:slipCode", requireAuth, async (req, res) => {
    const slipCode = firstParam(req.params.slipCode);
    if (!slipCode)
        return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });
    const slip = await db_1.prisma.slip.findUnique({
        where: { slipCode },
        include: slipResponseInclude,
    });
    if (!slip)
        return res.status(404).json({ ok: false, error: "SLIP_NOT_FOUND" });
    res.json({ ok: true, slip });
});
app.get("/slips", requireAuth, async (req, res) => {
    const status = firstParam(req.query.status);
    const reviewStatus = firstParam(req.query.reviewStatus);
    const customerId = firstParam(req.query.customerId);
    const currencyRaw = firstParam(req.query.currencyCode);
    const currencyCode = currencyRaw ? currencyRaw.toUpperCase() : undefined;
    const from = firstParam(req.query.from);
    const to = firstParam(req.query.to);
    const slips = await db_1.prisma.slip.findMany({
        where: {
            ...(status && ["issued", "paid", "cancelled", "expired"].includes(status) ? { status: status } : {}),
            ...(reviewStatus && ["waiting", "confirmed", "rejected"].includes(reviewStatus)
                ? { reviewStatus: reviewStatus }
                : {}),
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
        include: slipResponseInclude,
        orderBy: { createdAt: "desc" },
        take: 300,
    });
    res.json({ ok: true, slips });
});
app.post("/slips/:slipCode/payout", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const parsed = payoutSlipSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const slipCode = firstParam(req.params.slipCode);
    if (!slipCode)
        return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });
    const result = await db_1.prisma.$transaction(async (tx) => {
        const slip = await tx.slip.findUnique({ where: { slipCode } });
        if (!slip)
            throw new Error("SLIP_NOT_FOUND");
        if (slip.reviewStatus !== "confirmed")
            throw new Error("SLIP_REVIEW_NOT_CONFIRMED");
        if (slip.status !== "issued")
            throw new Error("SLIP_NOT_PAYABLE");
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
            include: slipResponseInclude,
        });
        await applyPartnerPayoutForSlip(tx, paidSlip);
        return { paidSlip, updatedAccount };
    }).catch((error) => {
        return { error: error.message };
    });
    if ("error" in result) {
        if (result.error === "SLIP_NOT_FOUND")
            return res.status(404).json({ ok: false, error: result.error });
        if (result.error === "SLIP_REVIEW_NOT_CONFIRMED")
            return res.status(409).json({ ok: false, error: result.error });
        if (result.error === "SLIP_NOT_PAYABLE")
            return res.status(409).json({ ok: false, error: result.error });
        if (result.error === "INSUFFICIENT_BALANCE")
            return res.status(409).json({ ok: false, error: result.error });
        if (result.error === "NO_ACCOUNT_FOR_SLIP_CURRENCY") {
            return res.status(409).json({ ok: false, error: result.error });
        }
        if (result.error === "INSUFFICIENT_PARTNER_BALANCE") {
            return res.status(409).json({ ok: false, error: result.error });
        }
        if (result.error === "PARTNER_ACCOUNT_NOT_FOUND" || result.error === "PARTNER_SLIP_CURRENCY_MISMATCH") {
            return res.status(409).json({ ok: false, error: result.error });
        }
        return res.status(500).json({ ok: false, error: "PAYOUT_FAILED" });
    }
    res.json({ ok: true, ...result });
});
app.patch("/slips/:slipCode/status", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const parsed = slipStatusSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const slipCode = firstParam(req.params.slipCode);
    if (!slipCode)
        return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });
    const slip = await db_1.prisma.slip.findUnique({ where: { slipCode } });
    if (!slip)
        return res.status(404).json({ ok: false, error: "SLIP_NOT_FOUND" });
    if (slip.status !== "issued")
        return res.status(409).json({ ok: false, error: "SLIP_NOT_UPDATABLE" });
    const updated = await db_1.prisma.slip.update({
        where: { slipCode },
        data: { status: parsed.data.status },
        include: slipResponseInclude,
    });
    res.json({ ok: true, slip: updated });
});
app.patch("/slips/:slipCode/review", requireAuth, requireRole(["admin", "cashier", "accountant"]), async (req, res) => {
    const parsed = slipReviewStatusSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const slipCode = firstParam(req.params.slipCode);
    if (!slipCode)
        return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });
    const next = parsed.data.reviewStatus;
    const result = await db_1.prisma.$transaction(async (tx) => {
        const s = await tx.slip.findUnique({ where: { slipCode } });
        if (!s)
            throw new Error("SLIP_NOT_FOUND");
        if (s.status === "cancelled" || s.status === "expired")
            throw new Error("SLIP_BAD_STATE");
        const prev = s.reviewStatus;
        if (next === prev) {
            const unchanged = await tx.slip.findUnique({
                where: { slipCode },
                include: slipResponseInclude,
            });
            if (!unchanged)
                throw new Error("SLIP_NOT_FOUND");
            return unchanged;
        }
        if (next === "confirmed") {
            if (s.status === "paid") {
                return tx.slip.update({
                    where: { slipCode },
                    data: { reviewStatus: "confirmed" },
                    include: slipResponseInclude,
                });
            }
            if (s.status === "issued") {
                const account = await tx.customerAccount.findUnique({
                    where: {
                        customerId_currencyCode: {
                            customerId: s.customerId,
                            currencyCode: s.currencyCode,
                        },
                    },
                });
                if (!account)
                    throw new Error("NO_ACCOUNT_FOR_SLIP_CURRENCY");
                if (Number(account.balance) < Number(s.amount))
                    throw new Error("INSUFFICIENT_BALANCE");
                await tx.customerAccount.update({
                    where: {
                        customerId_currencyCode: {
                            customerId: s.customerId,
                            currencyCode: s.currencyCode,
                        },
                    },
                    data: { balance: { decrement: s.amount } },
                });
                const paidSlip = await tx.slip.update({
                    where: { slipCode },
                    data: {
                        reviewStatus: "confirmed",
                        status: "paid",
                        paidAt: new Date(),
                    },
                    include: slipResponseInclude,
                });
                await applyPartnerPayoutForSlip(tx, paidSlip);
                return paidSlip;
            }
            throw new Error("SLIP_BAD_STATE");
        }
        if (next === "waiting" || next === "rejected") {
            if (s.status === "paid") {
                await reversePartnerPayoutForSlip(tx, s.id);
                await tx.customerAccount.update({
                    where: {
                        customerId_currencyCode: {
                            customerId: s.customerId,
                            currencyCode: s.currencyCode,
                        },
                    },
                    data: { balance: { increment: s.amount } },
                });
                if (next === "waiting") {
                    return tx.slip.update({
                        where: { slipCode },
                        data: {
                            reviewStatus: "waiting",
                            status: "issued",
                            paidAt: null,
                        },
                        include: slipResponseInclude,
                    });
                }
                return tx.slip.update({
                    where: { slipCode },
                    data: {
                        reviewStatus: "rejected",
                        status: "cancelled",
                        paidAt: null,
                    },
                    include: slipResponseInclude,
                });
            }
            return tx.slip.update({
                where: { slipCode },
                data: { reviewStatus: next },
                include: slipResponseInclude,
            });
        }
        throw new Error("SLIP_BAD_STATE");
    }).catch((error) => ({ error: error.message }));
    if ("error" in result) {
        if (result.error === "SLIP_NOT_FOUND")
            return res.status(404).json({ ok: false, error: result.error });
        if (result.error === "INSUFFICIENT_BALANCE")
            return res.status(409).json({ ok: false, error: result.error });
        if (result.error === "NO_ACCOUNT_FOR_SLIP_CURRENCY") {
            return res.status(409).json({ ok: false, error: result.error });
        }
        if (result.error === "INSUFFICIENT_PARTNER_BALANCE") {
            return res.status(409).json({ ok: false, error: result.error });
        }
        if (result.error === "PARTNER_ACCOUNT_NOT_FOUND" || result.error === "PARTNER_SLIP_CURRENCY_MISMATCH") {
            return res.status(409).json({ ok: false, error: result.error });
        }
        if (result.error === "SLIP_BAD_STATE")
            return res.status(409).json({ ok: false, error: result.error });
        return res.status(500).json({ ok: false, error: "SLIP_REVIEW_UPDATE_FAILED" });
    }
    if (!result)
        return res.status(500).json({ ok: false, error: "SLIP_REVIEW_UPDATE_FAILED" });
    res.json({ ok: true, slip: result });
});
app.put("/slips/:slipCode", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const slipCode = firstParam(req.params.slipCode);
    if (!slipCode)
        return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });
    const parsed = updateSlipSchema.safeParse(req.body);
    if (!parsed.success) {
        const slipSrc = parsed.error.issues.find((i) => i.message === "SLIP_SOURCE_REQUIRED");
        if (slipSrc)
            return res.status(400).json({ ok: false, error: "SLIP_SOURCE_REQUIRED" });
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    }
    const existing = await db_1.prisma.slip.findUnique({ where: { slipCode } });
    if (!existing)
        return res.status(404).json({ ok: false, error: "SLIP_NOT_FOUND" });
    if (existing.status !== "issued") {
        return res.status(409).json({ ok: false, error: "SLIP_NOT_EDITABLE" });
    }
    const { customerId, currencyCode, amount, fundingAccountId, partnerAccountId, paidToName, note } = parsed.data;
    const normalizedCurrency = currencyCode.toUpperCase();
    const customer = await db_1.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer)
        return res.status(404).json({ ok: false, error: "CUSTOMER_NOT_FOUND" });
    const currency = await db_1.prisma.currency.findUnique({ where: { code: normalizedCurrency } });
    if (!currency)
        return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });
    if (fundingAccountId) {
        const funding = await db_1.prisma.fundingAccount.findUnique({ where: { id: fundingAccountId } });
        if (!funding)
            return res.status(404).json({ ok: false, error: "FUNDING_ACCOUNT_NOT_FOUND" });
        if (!funding.isActive)
            return res.status(409).json({ ok: false, error: "FUNDING_ACCOUNT_INACTIVE" });
        const slip = await db_1.prisma.slip.update({
            where: { slipCode },
            data: {
                customerId,
                currencyCode: normalizedCurrency,
                amount,
                fundingAccountId,
                partnerAccountId: null,
                receiverName: funding.displayName.trim(),
                paidToName: paidToName.trim(),
                note: note?.trim() || null,
            },
            include: slipResponseInclude,
        });
        return res.json({ ok: true, slip });
    }
    const pa = await db_1.prisma.partnerAccount.findUnique({
        where: { id: partnerAccountId },
        include: { partner: true },
    });
    if (!pa)
        return res.status(404).json({ ok: false, error: "PARTNER_ACCOUNT_NOT_FOUND" });
    if (pa.currencyCode !== normalizedCurrency) {
        return res.status(409).json({ ok: false, error: "PARTNER_SLIP_CURRENCY_MISMATCH" });
    }
    const slip = await db_1.prisma.slip.update({
        where: { slipCode },
        data: {
            customerId,
            currencyCode: normalizedCurrency,
            amount,
            fundingAccountId: null,
            partnerAccountId: pa.id,
            receiverName: pa.partner.name.trim(),
            paidToName: paidToName.trim(),
            note: note?.trim() || null,
        },
        include: slipResponseInclude,
    });
    res.json({ ok: true, slip });
});
app.delete("/slips/:slipCode", requireAuth, requireRole(["admin", "cashier"]), async (req, res) => {
    const slipCode = firstParam(req.params.slipCode);
    if (!slipCode)
        return res.status(400).json({ ok: false, error: "INVALID_SLIP_CODE" });
    try {
        await db_1.prisma.$transaction(async (tx) => {
            const slip = await tx.slip.findUnique({ where: { slipCode } });
            if (!slip)
                throw new Error("SLIP_NOT_FOUND");
            if (slip.status === "paid") {
                await reversePartnerPayoutForSlip(tx, slip.id);
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
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : "UNKNOWN";
        if (msg === "SLIP_NOT_FOUND")
            return res.status(404).json({ ok: false, error: msg });
        return res.status(500).json({ ok: false, error: "SLIP_DELETE_FAILED" });
    }
    res.json({ ok: true });
});
app.get("/partners", requireAuth, async (_req, res) => {
    const partners = await db_1.prisma.partner.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    res.json({ ok: true, partners });
});
app.get("/partners/:partnerId", requireAuth, async (req, res) => {
    const partnerId = firstParam(req.params.partnerId);
    if (!partnerId)
        return res.status(400).json({ ok: false, error: "INVALID_PARTNER_ID" });
    const partner = await db_1.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner)
        return res.status(404).json({ ok: false, error: "PARTNER_NOT_FOUND" });
    res.json({ ok: true, partner });
});
app.post("/partners", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
    const parsed = partnerSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const partner = await db_1.prisma.partner.create({ data: parsed.data });
    res.status(201).json({ ok: true, partner });
});
app.put("/partners/:partnerId", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
    const partnerId = firstParam(req.params.partnerId);
    if (!partnerId)
        return res.status(400).json({ ok: false, error: "INVALID_PARTNER_ID" });
    const parsed = partnerSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const exists = await db_1.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!exists)
        return res.status(404).json({ ok: false, error: "PARTNER_NOT_FOUND" });
    const partner = await db_1.prisma.partner.update({
        where: { id: partnerId },
        data: parsed.data,
    });
    res.json({ ok: true, partner });
});
app.delete("/partners/:partnerId", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
    const partnerId = firstParam(req.params.partnerId);
    if (!partnerId)
        return res.status(400).json({ ok: false, error: "INVALID_PARTNER_ID" });
    const txCount = await db_1.prisma.partnerTransaction.count({ where: { partnerId } });
    if (txCount > 0) {
        return res.status(409).json({ ok: false, error: "PARTNER_HAS_TRANSACTIONS" });
    }
    const exists = await db_1.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!exists)
        return res.status(404).json({ ok: false, error: "PARTNER_NOT_FOUND" });
    await db_1.prisma.partner.delete({ where: { id: partnerId } });
    res.json({ ok: true });
});
app.get("/partners/:partnerId/accounts", requireAuth, async (req, res) => {
    const partnerId = firstParam(req.params.partnerId);
    if (!partnerId)
        return res.status(400).json({ ok: false, error: "INVALID_PARTNER_ID" });
    const accounts = await db_1.prisma.partnerAccount.findMany({
        where: { partnerId },
        orderBy: { currencyCode: "asc" },
    });
    res.json({ ok: true, accounts });
});
app.get("/partner-transactions", requireAuth, async (req, res) => {
    const partnerId = typeof req.query.partnerId === "string" ? req.query.partnerId : undefined;
    const currencyCode = typeof req.query.currencyCode === "string" ? req.query.currencyCode.toUpperCase() : undefined;
    const direction = typeof req.query.direction === "string" ? req.query.direction : undefined;
    const reconciliationStatus = typeof req.query.reconciliationStatus === "string" ? req.query.reconciliationStatus : undefined;
    const transactions = await db_1.prisma.partnerTransaction.findMany({
        where: {
            ...(partnerId ? { partnerId } : {}),
            ...(currencyCode ? { currencyCode } : {}),
            ...(direction && ["in", "out"].includes(direction)
                ? { direction: direction }
                : {}),
            ...(reconciliationStatus && ["pending", "confirmed", "disputed"].includes(reconciliationStatus)
                ? {
                    reconciliationStatus: reconciliationStatus,
                }
                : {}),
        },
        include: {
            partner: { select: { id: true, name: true, country: true, city: true } },
            slip: { select: { slipCode: true, paidAt: true, createdAt: true, customer: { select: { fullName: true } } } },
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
    const { partnerId, currencyCode, amount, direction, beneficiaryName, referenceNo, note, reconciliationStatus = "pending", } = parsed.data;
    const normalizedCurrency = currencyCode.toUpperCase();
    const partner = await db_1.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner)
        return res.status(404).json({ ok: false, error: "PARTNER_NOT_FOUND" });
    const currency = await db_1.prisma.currency.findUnique({ where: { code: normalizedCurrency } });
    if (!currency)
        return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });
    const result = await db_1.prisma.$transaction(async (tx) => {
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
    }).catch((error) => ({ error: error.message }));
    if ("error" in result) {
        // eslint-disable-next-line no-console
        console.error("PARTNER_TX_FAILED", result.error);
        return res.status(500).json({ ok: false, error: "PARTNER_TX_FAILED", details: result.error });
    }
    res.status(201).json({ ok: true, ...result });
});
app.put("/partner-transactions/:txId", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
    const txId = firstParam(req.params.txId);
    if (!txId)
        return res.status(400).json({ ok: false, error: "INVALID_PARTNER_TX_ID" });
    const parsed = partnerTxSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            ok: false,
            error: "INVALID_PARTNER_TX_PAYLOAD",
            details: parsed.error.flatten(),
        });
    }
    const { partnerId, currencyCode, amount, direction, beneficiaryName, referenceNo, note, reconciliationStatus = "pending", } = parsed.data;
    const normalizedCurrency = currencyCode.toUpperCase();
    const partner = await db_1.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner)
        return res.status(404).json({ ok: false, error: "PARTNER_NOT_FOUND" });
    const currency = await db_1.prisma.currency.findUnique({ where: { code: normalizedCurrency } });
    if (!currency)
        return res.status(404).json({ ok: false, error: "CURRENCY_NOT_FOUND" });
    const result = await db_1.prisma.$transaction(async (tx) => {
        const existing = await tx.partnerTransaction.findUnique({ where: { id: txId } });
        if (!existing)
            throw new Error("PARTNER_TX_NOT_FOUND");
        if (existing.slipId)
            throw new Error("PARTNER_TX_SLIP_LINKED_LOCKED");
        await tx.partnerAccount.upsert({
            where: { partnerId_currencyCode: { partnerId: existing.partnerId, currencyCode: existing.currencyCode } },
            create: { partnerId: existing.partnerId, currencyCode: existing.currencyCode, balance: 0 },
            update: {},
        });
        await tx.partnerAccount.update({
            where: { partnerId_currencyCode: { partnerId: existing.partnerId, currencyCode: existing.currencyCode } },
            data: {
                balance: existing.direction === "in"
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
    }).catch((error) => ({ error: error.message }));
    if ("error" in result) {
        if (result.error === "PARTNER_TX_NOT_FOUND") {
            return res.status(404).json({ ok: false, error: result.error });
        }
        if (result.error === "PARTNER_TX_SLIP_LINKED_LOCKED") {
            return res.status(409).json({ ok: false, error: result.error });
        }
        // eslint-disable-next-line no-console
        console.error("PARTNER_TX_UPDATE_FAILED", result.error);
        return res.status(500).json({ ok: false, error: "PARTNER_TX_UPDATE_FAILED", details: result.error });
    }
    res.json({ ok: true, ...result });
});
app.delete("/partner-transactions/:txId", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
    const txId = firstParam(req.params.txId);
    if (!txId)
        return res.status(400).json({ ok: false, error: "INVALID_PARTNER_TX_ID" });
    const result = await db_1.prisma.$transaction(async (tx) => {
        const existing = await tx.partnerTransaction.findUnique({ where: { id: txId } });
        if (!existing)
            throw new Error("PARTNER_TX_NOT_FOUND");
        if (existing.slipId)
            throw new Error("PARTNER_TX_SLIP_LINKED_LOCKED");
        await tx.partnerAccount.upsert({
            where: { partnerId_currencyCode: { partnerId: existing.partnerId, currencyCode: existing.currencyCode } },
            create: { partnerId: existing.partnerId, currencyCode: existing.currencyCode, balance: 0 },
            update: {},
        });
        await tx.partnerAccount.update({
            where: { partnerId_currencyCode: { partnerId: existing.partnerId, currencyCode: existing.currencyCode } },
            data: {
                balance: existing.direction === "in"
                    ? { decrement: existing.amount }
                    : { increment: existing.amount },
            },
        });
        await tx.partnerTransaction.delete({ where: { id: txId } });
        return { ok: true };
    }).catch((error) => ({ error: error.message }));
    if ("error" in result) {
        if (result.error === "PARTNER_TX_NOT_FOUND") {
            return res.status(404).json({ ok: false, error: result.error });
        }
        if (result.error === "PARTNER_TX_SLIP_LINKED_LOCKED") {
            return res.status(409).json({ ok: false, error: result.error });
        }
        // eslint-disable-next-line no-console
        console.error("PARTNER_TX_DELETE_FAILED", result.error);
        return res.status(500).json({ ok: false, error: "PARTNER_TX_DELETE_FAILED", details: result.error });
    }
    res.json({ ok: true });
});
app.get("/dashboard/summary", requireAuth, async (req, res) => {
    const currencyCode = typeof req.query.currencyCode === "string" ? req.query.currencyCode.toUpperCase() : "AFN";
    const from = startOfToday();
    const [deposits, paidSlips, partnerIn, partnerOut, customerAccounts] = await Promise.all([
        db_1.prisma.depositTransaction.findMany({
            where: { currencyCode, createdAt: { gte: from } },
            select: { amount: true },
        }),
        db_1.prisma.slip.findMany({
            where: { currencyCode, status: "paid", paidAt: { gte: from } },
            select: { amount: true },
        }),
        db_1.prisma.partnerTransaction.findMany({
            where: { currencyCode, direction: "in", createdAt: { gte: from } },
            select: { amount: true },
        }),
        db_1.prisma.partnerTransaction.findMany({
            where: { currencyCode, direction: "out", createdAt: { gte: from } },
            select: { amount: true },
        }),
        db_1.prisma.customerAccount.findMany({
            where: { currencyCode },
            select: { balance: true },
        }),
    ]);
    const sum = (rows) => rows.reduce((acc, row) => acc + Number(row.amount), 0);
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
        pendingSettlements: await db_1.prisma.partnerTransaction.count({
            where: { reconciliationStatus: "pending" },
        }),
    });
});
app.get("/dashboard/timeline", requireAuth, async (req, res) => {
    const currencyCode = typeof req.query.currencyCode === "string" ? req.query.currencyCode.toUpperCase() : "AFN";
    const fromRaw = firstParam(req.query.from);
    const toRaw = firstParam(req.query.to);
    const from = fromRaw ? new Date(fromRaw) : startOfToday();
    const to = toRaw ? new Date(toRaw) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        return res.status(400).json({ ok: false, error: "INVALID_DATE_RANGE" });
    }
    const [deposits, partnerIn, paidSlips, partnerOut] = await Promise.all([
        db_1.prisma.depositTransaction.findMany({
            where: { currencyCode, createdAt: { gte: from, lte: to } },
            select: { amount: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        }),
        db_1.prisma.partnerTransaction.findMany({
            where: { currencyCode, direction: "in", createdAt: { gte: from, lte: to } },
            select: { amount: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        }),
        db_1.prisma.slip.findMany({
            where: { currencyCode, status: "paid", paidAt: { gte: from, lte: to } },
            select: { amount: true, paidAt: true },
            orderBy: { paidAt: "asc" },
        }),
        db_1.prisma.partnerTransaction.findMany({
            where: { currencyCode, direction: "out", createdAt: { gte: from, lte: to } },
            select: { amount: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        }),
    ]);
    const rangeMs = to.getTime() - from.getTime();
    const bucketMs = rangeMs <= 48 * 60 * 60 * 1000 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const bucketStart = (date) => new Date(Math.floor(date.getTime() / bucketMs) * bucketMs).toISOString();
    const map = new Map();
    const add = (key, side, amount) => {
        const row = map.get(key) ?? { incoming: 0, outgoing: 0 };
        row[side] += amount;
        map.set(key, row);
    };
    for (const row of deposits)
        add(bucketStart(row.createdAt), "incoming", Number(row.amount));
    for (const row of partnerIn)
        add(bucketStart(row.createdAt), "incoming", Number(row.amount));
    for (const row of paidSlips) {
        if (row.paidAt)
            add(bucketStart(row.paidAt), "outgoing", Number(row.amount));
    }
    for (const row of partnerOut)
        add(bucketStart(row.createdAt), "outgoing", Number(row.amount));
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
    const accounts = await db_1.prisma.customerAccount.findMany({
        include: {
            customer: { select: { id: true, fullName: true } },
        },
        orderBy: [{ currencyCode: "asc" }, { updatedAt: "desc" }],
    });
    res.json({ ok: true, accounts });
});
app.get("/reports/partner-balances", requireAuth, async (_req, res) => {
    const accounts = await db_1.prisma.partnerAccount.findMany({
        include: {
            partner: { select: { id: true, name: true } },
        },
        orderBy: [{ currencyCode: "asc" }, { updatedAt: "desc" }],
    });
    res.json({ ok: true, accounts });
});
app.get("/reports/daily-cash", requireAuth, async (req, res) => {
    const currencyCode = typeof req.query.currencyCode === "string" ? req.query.currencyCode.toUpperCase() : "AFN";
    const date = typeof req.query.date === "string" ? new Date(req.query.date) : new Date();
    const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const to = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const [deposits, paidSlips, partnerIn, partnerOut] = await Promise.all([
        db_1.prisma.depositTransaction.findMany({
            where: { currencyCode, createdAt: { gte: from, lt: to } },
            select: { amount: true },
        }),
        db_1.prisma.slip.findMany({
            where: { currencyCode, status: "paid", paidAt: { gte: from, lt: to } },
            select: { amount: true },
        }),
        db_1.prisma.partnerTransaction.findMany({
            where: { currencyCode, direction: "in", createdAt: { gte: from, lt: to } },
            select: { amount: true },
        }),
        db_1.prisma.partnerTransaction.findMany({
            where: { currencyCode, direction: "out", createdAt: { gte: from, lt: to } },
            select: { amount: true },
        }),
    ]);
    const sum = (rows) => rows.reduce((acc, row) => acc + Number(row.amount), 0);
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
