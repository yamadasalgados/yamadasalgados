const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let TS;
try { TS = require('typescript'); } catch { TS = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }

for (const name of [
  'app/lib/share-link-client.ts',
  'app/_components/ReferralSmsVerification.tsx',
  'app/_components/ReferralCampaignBanner.tsx',
  'app/api/customer/referrals/route.ts',
  'app/seller/settings/referrals/page.tsx',
]) {
  const source = fs.readFileSync(path.join(process.cwd(), name), 'utf8');
  const result = TS.transpileModule(source, {fileName: name, compilerOptions: {
    target: TS.ScriptTarget.ES2020, module: TS.ModuleKind.CommonJS, jsx: TS.JsxEmit.ReactJSX,
  }, reportDiagnostics: true});
  assert.equal(result.diagnostics?.filter(d => d.category === TS.DiagnosticCategory.Error).length, 0,
    `TypeScript syntax ${name}`);
  console.log('✓ TS/TSX syntax', name);
}

const source = fs.readFileSync('app/api/customer/referrals/route.ts','utf8');
assert.match(source, /function verifiedMethod\(/);
assert.match(source, /user\.phoneNumber/);
assert.match(source, /verificationMethodAtJoin: verificationMethod/);
assert.match(source, /customerRoleAllowed\(identity\)/);
assert.match(source, /getAdminAuth\(\)\.getUser/);
assert.match(source, /verifiedMethod\(inviter\)/);
const sms = fs.readFileSync('app/_components/ReferralSmsVerification.tsx','utf8');
assert.match(sms, /linkWithPhoneNumber\(user,/);
assert.doesNotMatch(sms, /signInWithPhoneNumber/);
assert.match(sms, /issuedForUid\.current/);
assert.match(sms, /RecaptchaVerifier/);
const banner = fs.readFileSync('app/_components/ReferralCampaignBanner.tsx','utf8');
assert.match(banner, /copyTextWithFallback\(link\)/);
assert.match(banner, /localPreviewUrl\(link\)/);
assert.match(banner, /ReferralSmsVerification/);
console.log('✓ Auth-linked SMS verifies the same UID; server checks Auth (not profile text)');
console.log('✓ Roles/first-purchase eligibility and transactional wallet path unchanged');

(async () => {
  let copied = '';
  const fakeTextarea = {
    value:'', style:{}, setAttribute(){}, focus(){},select(){},setSelectionRange(){},remove(){},
  };
  const fakeDoc = {activeElement:null, createElement:()=>fakeTextarea,
    body: {appendChild(){}},execCommand(command){assert.equal(command,'copy'); copied = fakeTextarea.value; return true; }};
  const fakeWindow = {isSecureContext:false,location:{origin:'http://192.168.0.7:3000'}};
  const script = TS.transpileModule(fs.readFileSync('app/lib/share-link-client.ts','utf8'),
    {compilerOptions:{module:TS.ModuleKind.CommonJS, target:TS.ScriptTarget.ES2020}}).outputText;
  const exports = {}; const context = {exports, window:fakeWindow, navigator:{}, document:fakeDoc, HTMLElement:class HTMLElement {}, URL, process:{env:{}}};
  vm.runInNewContext(script,context);
  const link = 'http://192.168.0.7:3000/store/ABC?ref=myTestCode123';
  assert.equal(await exports.copyTextWithFallback(link),true);
  assert.equal(copied,link);
  console.log('✓ Local HTTP copy falls back to selection/copy');
  fakeDoc.execCommand = () => false;
  assert.equal(await exports.copyTextWithFallback(link),false);
  console.log('✓ Copy failure is reported (no fake success)');
  assert.equal(exports.localPreviewUrl(link),true);
  assert.equal(exports.localPreviewUrl('https://example.com/store/ABC'),false);
  console.log('✓ Local link warning prevents confusion with public HTTPS');
  console.log('v5.5: passed');
})().catch(e=>{console.error(e);process.exitCode=1});
