import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const eventClient = read('app/event/[...id]/EventClient.tsx');
const createEvent = read('app/seller/events/new/page.tsx');
const eventPanel = read('app/seller/events/[eventId]/EventPanelClient.tsx');
const orderRoute = read('app/api/orders/create/route.ts');

const checks = [
  ['event groups products by category', eventClient.includes('groupProductsByCategory')],
  ['category order follows editorial order', eventClient.includes('category order follows the first')],
  ['normal products render category sections', eventClient.includes('visibleNormalCategorySections.map')],
  ['made-to-order products render category sections', eventClient.includes('madeToOrderCategorySections.map')],
  ['fixed checkout bar is always available', eventClient.includes('fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))]')],
  ['fixed checkout has cart icon', eventClient.includes('<ShoppingCart size={21} />')],
  ['checkout bar hides while modal is open', eventClient.includes('{!checkoutOpen && (')],
  ['event can omit fulfillment questions', eventClient.includes('{collectsFulfillmentDetails && (')],
  ['API payload never sends display date label', eventClient.includes('date: getOrderDeliveryDate() || undefined')],
  ['API payload never sends display time label', eventClient.includes('time: getOrderDeliveryTime() || undefined')],
  ['seller-arranged event sends mode none', eventClient.includes('mode: collectsFulfillmentDetails ? deliveryMode : "none"')],
  ['client displays server invalid-request message', eventClient.includes('errorCode === "INVALID_REQUEST"')],
  ['create-event supports no fulfillment questions', createEvent.includes('type DeliveryChoice = "none" | "delivery" | "pickup" | "both"')],
  ['new events default to seller-arranged fulfillment', createEvent.includes('useState<DeliveryChoice>("none")')],
  ['event settings load fulfillment flags', eventPanel.includes('eventFulfillmentChoiceFromFlags(data.allowDelivery, data.allowPickup)')],
  ['event settings save delivery flag', eventPanel.includes('allowDelivery: fulfillmentFlags.allowDelivery')],
  ['event settings save pickup flag', eventPanel.includes('allowPickup: fulfillmentFlags.allowPickup')],
  ['backend sanitizes legacy UI date labels', orderRoute.includes('function cleanDeliveryDate')],
  ['backend converts A combinar to no date', orderRoute.includes('"a combinar"')],
  ['backend uses sanitized delivery date', orderRoute.includes('const deliveryDate = cleanDeliveryDate(delivery.date);')],
  ['old sticky-only checkout bar removed', !eventClient.includes('className="sticky bottom-20 z-30')],
  ['old display-label date payload removed', !eventClient.includes('date: getChosenDate(),')],
];

let failures = 0;
for (const [name, passed] of checks) {
  if (passed) {
    console.log(`✓ ${name}`);
  } else {
    failures += 1;
    console.error(`✗ ${name}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} event catalog/checkout audit check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} event catalog/checkout checks passed.`);
