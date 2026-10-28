const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(file) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => name === 'node:crypto' ? require(name) : {}, console }, { filename: file });
  return exports;
}
const config = load('app/lib/referral-campaign.ts');
const interest = load('app/lib/customer-interests-server.ts');
const now = Date.parse('2026-11-15T00:00:00+09:00');
const defaultSetting = { campaignId: 'indique-2026', enabled: true };
const defaultResult = config.sellerReferralSettings(defaultSetting);
assert.equal(defaultResult.maxRewardsPerInviter, 10);
assert.equal(defaultResult.registrationEndsAtMs, Date.parse('2027-01-01T00:00:00+09:00'));
assert.equal(config.sellerReferralAccepting(defaultSetting, now), true);
const earlyClose = { ...defaultSetting, registrationEndsAtMs: Date.parse('2026-11-01T00:00:00+09:00') };
assert.equal(config.sellerReferralAccepting(earlyClose, now), false);
assert.equal(config.sellerReferralAccepting({...defaultSetting,enabled:false}, now),false);
assert.equal(config.sellerReferralAccepting(defaultSetting,Date.parse('2027-01-01T00:00:00+09:00')),false);
assert.equal(config.sellerReferralSettings({...defaultSetting,maxRewardsPerInviter:0}).maxRewardsPerInviter,10);
assert.equal(config.sellerReferralSettings({...defaultSetting,maxRewardsPerInviter:8}).maxRewardsPerInviter,8);
assert.equal(interest.normalizeInterestKey('Feijoada Especial!'), 'feijoada especial');
assert.equal(interest.normalizeInterestKey('Coxínhas de frango'), 'coxinhas de frango');
assert.equal(interest.normalizeInterestKey('  DOCES   '), 'doces');
console.log('9/9 testes unitários de configuração de campanha e palavras-chave aprovados.');
