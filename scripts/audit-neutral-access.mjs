import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const home = read("app/page.tsx");
const login = read("app/login/page.tsx");
const customer = read("app/customer/login/page.tsx");
const partnerPage = read("app/partners/page.tsx");
const partnerApi = read("app/api/partners/route.ts");
const adminPartnerApi = read("app/api/admin/partner-leads/route.ts");
const adminPartnerPage = read("app/admin/partners/page.tsx");
const nav = read("app/_components/RoleNavigation.tsx");
const ensure = read("app/lib/ensureUserProfile.ts");
const brand = read("app/lib/platform-brand.ts");

check("/ redirects directly to /login", /redirect\(["']\/login["']\)/.test(home));
check("seller login does not expose public registration", !/createUserWithEmailAndPassword|handleEmailRegister|Criar conta de seller/.test(login));
check("seller login has discreet partner access link", /href=["']\/partners["']/.test(login) && /Solicitar acesso|Request access|利用について/.test(login));
check("seller login does not advertise admin access", !/seller ou admin|seller or admin|administrador|admins to the correct/i.test(login));
check("unknown auth account is not auto-provisioned", /resolved\.role === ["']unknown["']/.test(login) && /signOut\(auth\)/.test(login));
check("customer login is independent", !/href=["']\/login["']/.test(customer) && !/sellerAccess|automaticRoute/.test(customer));
check("customer login defaults to customer orders", /return ["']\/customer\/orders["']/.test(customer));
check("partner page exists with request form", /\/api\/partners/.test(partnerPage) && /businessName/.test(partnerPage));
check("public partner API writes server-side lead", /collection\(["']partnerLeads["']\)/.test(partnerApi) && /source: ["']partners_page["']/.test(partnerApi));
check("admin can review partner leads", /collection\(["']partnerLeads["']\)/.test(adminPartnerApi) && /PATCH/.test(adminPartnerApi) && /GET/.test(adminPartnerApi));
check("admin partner screen wired", /\/api\/admin\/partner-leads/.test(adminPartnerPage) && /LeadStatus/.test(adminPartnerPage));
check("admin navigation exposes leads", /href: ["']\/admin\/partners["']/.test(nav));
check("seller profile cannot self-provision from unknown auth", /SELLER_PROFILE_NOT_PROVISIONED/.test(ensure));

const rules = read("firestore.rules");
check("client cannot self-create users as seller", /match \/users\/\{userId\}[\s\S]*?allow create:\s*if isAdmin\(\);/.test(rules));
check("client cannot self-create seller tenant", /match \/sellers\/\{sellerId\}[\s\S]*?allow create:\s*if isAdmin\(\);/.test(rules));
check("neutral platform default", /Order System/.test(brand) && !/Order Portal/.test(brand));

const scanRoots = ["app", "public"];
let forbidden = [];
for (const scanRoot of scanRoots) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:ts|tsx|js|jsx|mjs|json|webmanifest|md)$/i.test(entry.name)) {
        const content = fs.readFileSync(full, "utf8");
        if (/Yamada Salgados|Order Portal/i.test(content)) forbidden.push(path.relative(root, full));
      }
    }
  };
  walk(path.join(root, scanRoot));
}
check("no legacy commercial brand visible in app/public", forbidden.length === 0);

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? "✅" : "❌"} ${item.name}`);
if (forbidden.length) console.log("Forbidden refs:", forbidden.join(", "));
console.log(`\nNeutral Access audit: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
