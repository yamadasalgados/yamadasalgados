import { randomBytes } from "node:crypto";
import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { accessIsActive } from "@/app/lib/access-control";
import {
  REFERRAL_CAMPAIGN, referralCampaignActive, sellerReferralAccepting, sellerReferralSettings, validReferralCode, validReferralSellerId,
} from "@/app/lib/referral-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ReferralError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function ensureActive() {
  if (!referralCampaignActive(Date.now())) throw new ReferralError("A campanha de indicação já terminou ou ainda não começou.", 410);
}

async function authenticate(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ReferralError("Entre na sua conta para participar.", 401);
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const user = await getAdminAuth().getUser(decoded.uid);
    if (user.disabled) throw new Error("disabled");
    return user;
  } catch {
    throw new ReferralError("Sessão inválida. Faça login novamente.", 401);
  }
}

function customerRoleAllowed(snapshot: admin.firestore.DocumentSnapshot): boolean {
  return !snapshot.exists || snapshot.data()?.role === "customer";
}

function activeCustomer(snapshot: admin.firestore.DocumentSnapshot): boolean {
  return snapshot.exists && snapshot.data()?.accountStatus === "active";
}

function availableSeller(snapshot: admin.firestore.DocumentSnapshot): boolean {
  return snapshot.exists &&
    snapshot.data()?.accountStatus === "active" &&
    snapshot.data()?.regional?.currency === "JPY" &&
    snapshot.data()?.onboarding?.complete === true &&
    accessIsActive(snapshot.data() ?? {});
}

/** A Firebase-verified email OR an Auth-linked SMS phone is required.
 * Never trust a phone typed into customer profiles or the request body. */
function verifiedMethod(user: admin.auth.UserRecord): "email" | "sms" | null {
  if (user.email && user.emailVerified) return "email";
  if (user.phoneNumber && /^\+[1-9]\d{7,14}$/.test(user.phoneNumber)) return "sms";
  return null;
}

function requireVerified(user: admin.auth.UserRecord): "email" | "sms" {
  const method = verifiedMethod(user);
  if (!method) {
    throw new ReferralError("Confirme seu e-mail ou valide seu celular por SMS para participar.", 403);
  }
  return method;
}

function respond(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

function handleError(error: unknown) {
  if (!(error instanceof ReferralError)) console.error("[customer/referrals]", error);
  return respond({ ok: false, error: error instanceof ReferralError ? error.message : "Não foi possível processar a indicação." }, error instanceof ReferralError ? error.status : 500);
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticate(request);
    const sellerId = validReferralSellerId(request.nextUrl.searchParams.get("sellerId"));
    if (!sellerId) throw new ReferralError("Loja inválida.");
    const db = getAdminDb();
    const customerRef = db.collection("customers").doc(user.uid);
    const identity = await db.collection("users").doc(user.uid).get();
    if (!customerRoleAllowed(identity)) throw new ReferralError("Sua sessão é de vendedor/administrador. Para indicar e ganhar pontos, utilize uma conta de cliente diferente.", 403);
    const [linkSnap, referralSnap, settingsSnap] = await db.getAll(
      customerRef.collection("referralLinks").doc(sellerId),
      customerRef.collection("referrals").doc(sellerId),
      db.collection("sellers").doc(sellerId).collection("settings").doc("referralCampaign"),
    );
    const link = linkSnap.data() ?? {};
    const referral = referralSnap.data() ?? {};
    return respond({
      ok: true,
      campaign: { id: REFERRAL_CAMPAIGN.id, active: sellerReferralAccepting(settingsSnap.data(), Date.now()),
        registrationEndsAtMs: sellerReferralSettings(settingsSnap.data()).registrationEndsAtMs,
        maxRewardsPerInviter: sellerReferralSettings(settingsSnap.data()).maxRewardsPerInviter,
        earnDeadline: "2026-12-31", pointsEach: REFERRAL_CAMPAIGN.pointsPerPerson },
      code: typeof link.code === "string" ? link.code : "",
      referredBy: referral.state === "pending" || referral.state === "credited"
        ? { state: referral.state, pointsEach: REFERRAL_CAMPAIGN.pointsPerPerson } : null,
      emailVerified: user.emailVerified,
      phoneVerified: Boolean(user.phoneNumber),
      verificationMethod: verifiedMethod(user),
    });
  } catch (error) { return handleError(error); }
}

export async function POST(request: NextRequest) {
  try {
    ensureActive();
    const user = await authenticate(request);
    const body = asRecord(await request.json().catch(() => null));
    const action = body.action;
    const db = getAdminDb();
    const now = admin.firestore.Timestamp.now();
    const customerRef = db.collection("customers").doc(user.uid);
    // Check role before email verification so a seller never sees a misleading
    // 'verify your email' prompt for a customer-only reward operation.
    const identity = await db.collection("users").doc(user.uid).get();
    if (!customerRoleAllowed(identity)) {
      throw new ReferralError("Este login pertence a um vendedor/administrador. Use uma conta de cliente para gerar convites com pontos.", 403);
    }

    if (action === "create") {
      requireVerified(user);
      const sellerId = validReferralSellerId(body.sellerId);
      if (!sellerId) throw new ReferralError("Loja inválida.");
      const sellerRef = db.collection("sellers").doc(sellerId);
      const pointerRef = customerRef.collection("referralLinks").doc(sellerId);
      const code = randomBytes(18).toString("base64url");
      const codeRef = db.collection("referralCodes").doc(code);
      return respond(await db.runTransaction(async (tx) => {
        const [seller, customer, pointer, settings, role] = await tx.getAll(sellerRef, customerRef, pointerRef, sellerRef.collection("settings").doc("referralCampaign"), db.collection("users").doc(user.uid));
        if (!availableSeller(seller)) throw new ReferralError("Esta loja não está disponível.", 404);
        if (!customerRoleAllowed(role)) throw new ReferralError("Apenas contas de clientes podem indicar amigos.", 403);
        if (!sellerReferralAccepting(settings.data(), Date.now())) throw new ReferralError("Esta campanha não está aceitando novas indicações.", 403);
        if (!activeCustomer(customer)) throw new ReferralError("Ative sua conta antes de indicar.", 403);
        if (pointer.exists) return { ok: true, code: pointer.data()?.code, alreadyCreated: true };
        tx.create(codeRef, { campaignId: REFERRAL_CAMPAIGN.id, code, sellerId, inviterUid: user.uid, createdAt: now });
        tx.create(pointerRef, { campaignId: REFERRAL_CAMPAIGN.id, code, sellerId, createdAt: now });
        return { ok: true, code, alreadyCreated: false };
      }));
    }

    if (action === "join") {
      const verificationMethod = requireVerified(user);
      const code = validReferralCode(body.code);
      if (!code) throw new ReferralError("Convite inválido.");
      const codeRef = db.collection("referralCodes").doc(code);
      const codeDoc = await codeRef.get();
      if (!codeDoc.exists || codeDoc.data()?.campaignId !== REFERRAL_CAMPAIGN.id) throw new ReferralError("Convite inválido ou expirado.", 404);
      const campaignCode = codeDoc.data() ?? {};
      const sellerId = validReferralSellerId(campaignCode.sellerId);
      const inviterUid = typeof campaignCode.inviterUid === "string" ? campaignCode.inviterUid : "";
      if (!sellerId || !inviterUid || inviterUid.includes("/") || inviterUid === user.uid) throw new ReferralError("Não é possível usar seu próprio convite.", 403);
      const accountCreated = Date.parse(user.metadata.creationTime);
      if (!Number.isFinite(accountCreated) || accountCreated < REFERRAL_CAMPAIGN.startsAtMs ||
          Date.now() - accountCreated > REFERRAL_CAMPAIGN.maxJoinAgeMs) {
        throw new ReferralError("O convite vale apenas para contas novas, até 7 dias após o cadastro.", 403);
      }
      const inviter = await getAdminAuth().getUser(inviterUid).catch(() => null);
      if (!inviter || inviter.disabled || !verifiedMethod(inviter) ||
          Date.parse(inviter.metadata.creationTime) >= accountCreated ||
          inviter.email?.toLowerCase() === user.email?.toLowerCase()) {
        throw new ReferralError("Esse convite não está habilitado.", 403);
      }
      const inviterRef = db.collection("customers").doc(inviterUid);
      const sellerRef = db.collection("sellers").doc(sellerId);
      const enrollmentRef = customerRef.collection("referrals").doc(sellerId);
      const firstPaidRef = customerRef.collection("firstPaidPurchases").doc(sellerId);
      const counterRef = sellerRef.collection("referralCounters").doc(inviterUid);
      return respond(await db.runTransaction(async (tx) => {
        const [currentCode, customer, inviterCustomer, seller, enrollment, firstPaid, settings, inviteeRole, inviterRole, counter] = await tx.getAll(
          codeRef, customerRef, inviterRef, sellerRef, enrollmentRef, firstPaidRef,
          sellerRef.collection("settings").doc("referralCampaign"),
          db.collection("users").doc(user.uid), db.collection("users").doc(inviterUid), counterRef,
        );
        if (!sellerReferralAccepting(settings.data(), Date.now())) throw new ReferralError("Esta campanha não está aceitando novas indicações.", 403);
        if (!availableSeller(seller) || !activeCustomer(inviterCustomer) ||
            !customerRoleAllowed(inviterRole) || !customerRoleAllowed(inviteeRole) ||
            !currentCode.exists || currentCode.data()?.inviterUid !== inviterUid) throw new ReferralError("Convite indisponível.", 403);
        if (!activeCustomer(customer)) throw new ReferralError("Finalize seu cadastro primeiro.", 403);
        if (enrollment.exists) {
          if (enrollment.data()?.referrerUid === inviterUid) return { ok: true, joined: true, alreadyJoined: true, sellerId };
          throw new ReferralError("Esta conta já está vinculada a outro convite nesta loja.", 409);
        }
        // No invite switching after ordering. This is stricter than waiting for delivery.
        if (firstPaid.exists || (typeof customer.data()?.orderCount === "number" && customer.data()!.orderCount > 0)) {
          throw new ReferralError("Para receber o bônus, use o convite antes do seu primeiro pedido.", 409);
        }
        const usedSlots = counter.data()?.reservedCount;
        const reservedCount = typeof usedSlots === "number" && Number.isSafeInteger(usedSlots) && usedSlots >= 0 ? usedSlots : 0;
        const creditedCount = typeof counter.data()?.creditedCount === "number" && Number.isSafeInteger(counter.data()?.creditedCount)
          ? counter.data()!.creditedCount : 0;
        const maxSlots = sellerReferralSettings(settings.data()).maxRewardsPerInviter;
        if (Math.max(reservedCount, creditedCount) >= maxSlots) throw new ReferralError("O indicador já atingiu o limite de amigos da campanha.", 409);
        // Reserve a single referral slot while atomically linking the invitee.
        // This prevents simultaneous fake signups from oversubscribing the cap.
        tx.set(counterRef, { campaignId: REFERRAL_CAMPAIGN.id, sellerId, inviterUid,
          reservedCount: admin.firestore.FieldValue.increment(1), updatedAt: now }, { merge: true });
        tx.create(enrollmentRef, {
          schemaVersion: 1, campaignId: REFERRAL_CAMPAIGN.id, sellerId,
          referrerUid: inviterUid, referredUid: user.uid, state: "pending",
          joinedAt: now, joinedAtMillis: now.toMillis(),
          emailVerifiedAtJoin: Boolean(user.emailVerified),
          verificationMethodAtJoin: verificationMethod, creditedAt: null,
        });
        return { ok: true, joined: true, alreadyJoined: false, sellerId };
      }));
    }

    throw new ReferralError("Ação inválida.");
  } catch (error) { return handleError(error); }
}
