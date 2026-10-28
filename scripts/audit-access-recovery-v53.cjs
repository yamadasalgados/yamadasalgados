const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root,p), "utf8");
const tests = [
  ["Login de cliente exibe troca de conta", () => {
    const s=read("app/customer/login/page.tsx");
    assert.match(s,/Sair desta conta e usar outra/);
    assert.match(s,/await signOut\(auth\)/);
    assert.doesNotMatch(s,/if \(user\) void finish\(user\)/);
  }],
  ["Login seller não redireciona sessão antiga automaticamente", () => {
    const s=read("app/login/page.tsx");
    assert.match(s,/Sair desta conta e entrar com outra/);
    assert.doesNotMatch(s,/if \(user\) \{\s*void routeAuthenticatedUser\(user\)/);
  }],
  ["Guard seller redireciona o admin ao painel admin", () => {
    const s=read("app/_components/SellerGuard.tsx");
    assert.match(s,/resolved\.role === "admin"/);
    assert.match(s,/router\.replace\("\/admin"\)/);
  }],
  ["Eventos admin usam endpoint backend", () => {
    const s=read("app/admin/events/page.tsx");
    assert.match(s,/fetch\("\/api\/admin\/events"/);
    assert.doesNotMatch(s,/collectionGroup\(/);
  }],
  ["Consulta de eventos verifica token e role ativo", () => {
    const s=read("app/api/admin/events/route.ts");
    assert.match(s,/verifyIdToken\(token, true\)/);
    assert.match(s,/user\?\.role !== "admin"/);
    assert.match(s,/user\.accountStatus !== "active"/);
    assert.match(s,/\^sellers/);
  }],
  ["Diagnóstico de seller é autenticado e não altera role", () => {
    const s=read("app/api/auth/access-check/route.ts");
    assert.match(s,/verifyIdToken\(token, true\)/);
    assert.match(s,/PROFILE_VALID_CHECK_PUBLISHED_RULES/);
    assert.doesNotMatch(s,/\.set\(|\.update\(|\.create\(/);
  }],
];
let ok=0;
for (const [title,fn] of tests){try{fn();ok++;console.log(`✓ ${title}`)}catch(err){console.error(`✗ ${title}`,err.message);process.exitCode=1}}
console.log(`${ok}/${tests.length} verificações estruturais passaram.`);
