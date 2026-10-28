/* Integration-style transaction simulation. Does not touch Firestore production. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const CAMPAIGN = {
  id: 'indique-2026', startsAtMs: Date.parse('2026-10-27T00:00:00+09:00'),
  endsAtMs: Date.parse('2027-01-01T00:00:00+09:00'), pointsPerPerson: 100,
};
function loadHelper() {
  const name = path.join(__dirname, '../app/lib/referral-rewards-server.ts');
  const source = fs.readFileSync(name, 'utf8');
  const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const requireStub = (id) => {
    if (id === 'firebase-admin') return { firestore: { FieldValue: { increment: (n) => n } } };
    if (id === '@/app/lib/referral-campaign') return {
      REFERRAL_CAMPAIGN: CAMPAIGN,
      referralCampaignActive: (ms) => ms >= CAMPAIGN.startsAtMs && ms < CAMPAIGN.endsAtMs,
    };
    throw new Error(`Unexpected import ${id}`);
  };
  vm.runInNewContext(transpiled, { exports, require: requireStub, console }, { filename: name });
  return exports.prepareFirstDeliveryReferral;
}
const prepare = loadHelper();
class Ref {
  constructor(path) { this.path = path; }
  collection(value) { return new Coll(`${this.path}/${value}`); }
}
class Coll {
  constructor(path) { this.path = path; }
  doc(id) { return new Ref(`${this.path}/${id}`); }
}
class Db {
  constructor() { this.docs = new Map(); }
  collection(path) { return new Coll(path); }
}
class Tx {
  constructor(db) { this.db = db; this.writes = []; }
  async getAll(...refs) { return refs.map((ref) => ({ exists: this.db.docs.has(ref.path), data: () => this.db.docs.get(ref.path) || {} })); }
  create(ref, data) { this.writes.push(['create', ref.path, data]); }
  update(ref, data) { this.writes.push(['update', ref.path, data]); }
  set(ref, data) { this.writes.push(['set', ref.path, data]); }
  commit() {
    for (const [op, key, data] of this.writes) {
      if (op === 'create' && this.db.docs.has(key)) throw new Error('DOCUMENT_EXISTS: '+key);
      if (op === 'update' && !this.db.docs.has(key)) throw new Error('DOCUMENT_MISSING: '+key);
      this.db.docs.set(key, { ...(this.db.docs.get(key) || {}), ...data });
    }
  }
}
const now = (str) => ({ toMillis: () => Date.parse(str) });
const order = (total = 800) => ({ customerUid: 'friend', orderSource: 'store', currency: 'JPY', totalAmountMinor: total, rewards: { merchandisePaidMinor: total } });
const enrollmentRef = 'customers/friend/referrals/shop';
const firstPath = 'customers/friend/firstPaidPurchases/shop';
const wallet = (uid) => `customers/${uid}/rewardWallets/shop`;
function setup() {
  const db = new Db();
  db.docs.set('customers/inviter', { accountStatus: 'active' });
  db.docs.set('customers/friend', { accountStatus: 'active' });
  db.docs.set(enrollmentRef, { campaignId: CAMPAIGN.id, sellerId: 'shop', referrerUid: 'inviter', referredUid: 'friend', state: 'pending', joinedAtMillis: CAMPAIGN.startsAtMs+1000 });
  db.docs.set(wallet('friend'), { pointsBalance: 200, lifetimeEarned: 220, lifetimeGifted: 0 });
  db.docs.set(wallet('inviter'), { pointsBalance: 50, lifetimeEarned: 70, lifetimeGifted: 30 });
  return db;
}
async function deliver(db, data, at = '2026-11-01T10:00:00+09:00') {
  const tx = new Tx(db);
  const apply = await prepare({ db, tx, orderData: data, sellerId: 'shop', orderId: 'order1', orderPath: 'sellers/shop/storeOrders/order1', now: now(at) });
  const credited = apply();
  tx.commit();
  return credited;
}
(async () => {
  const db = setup();
  const who = await deliver(db, order());
  assert.equal(who.size, 2);
  assert.equal(db.docs.get(wallet('friend')).pointsBalance, 300);
  assert.equal(db.docs.get(wallet('inviter')).pointsBalance, 150);
  assert.equal(db.docs.get(wallet('friend')).lifetimeGifted, 100);
  assert.equal(db.docs.get(wallet('inviter')).lifetimeGifted, 130);
  assert.equal(db.docs.get(enrollmentRef).state, 'credited');
  assert.ok(db.docs.has('sellers/shop/referralCounters/inviter'), 'credited counter must be recorded');
  assert.equal(db.docs.get(firstPath).referralAwarded, true);
  assert.ok(db.docs.has(`${wallet('friend')}/transactions/referral_welcome_${CAMPAIGN.id}`));
  assert.ok(db.docs.has(`${wallet('inviter')}/transactions/referral_friend_${CAMPAIGN.id}`));
  assert.equal((await deliver(db, order())).size, 0, 'replay must not pay twice');
  assert.equal(db.docs.get(wallet('friend')).pointsBalance, 300);
  console.log('✓ Dois créditos de 100 e dois extratos; replay não duplica.');

  const unpaid = setup();
  assert.equal((await deliver(unpaid, order(0))).size, 0);
  assert.equal(unpaid.docs.has(firstPath), false);
  console.log('✓ Pedido gratuito não conta como primeira compra.');

  const expired = setup();
  assert.equal((await deliver(expired, order(), '2027-01-01T00:00:00+09:00')).size, 0);
  assert.equal(expired.docs.get(firstPath).referralAwarded, false);
  console.log('✓ Fim da campanha bloqueia créditos; primeira compra fica registrada.');

  const uninvited = new Db();
  assert.equal((await deliver(uninvited, order())).size, 0);
  assert.equal(uninvited.docs.get(firstPath).referralAwarded, false);
  console.log('✓ Comprador sem convite não recebe bônus e não pode reaproveitar primeira compra.');
  const suspended = setup();
  suspended.docs.get('customers/inviter').accountStatus = 'suspended';
  assert.equal((await deliver(suspended, order())).size, 0);
  assert.equal(suspended.docs.get(firstPath).referralAwarded, false);
  console.log('✓ Conta do indicador suspensa não recebe bônus.');

  const nonCustomer = setup();
  nonCustomer.docs.set('users/friend', { role: 'seller', accountStatus: 'active' });
  assert.equal((await deliver(nonCustomer, order())).size, 0);
  assert.equal(nonCustomer.docs.get(wallet('friend')).pointsBalance, 200);
  console.log('✓ Conta com role seller não é elegível a bônus de cliente.');
  console.log('6/6 testes simulados de transação aprovados.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
