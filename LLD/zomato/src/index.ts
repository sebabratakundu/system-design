import { MenuItem } from "./models/MenuItem";
import { UpiPaymentStrategy } from "./strategies/UpiPaymentStrategy";
import { OrderStatus, OrderType } from "./types";
import { ZomatoClient } from "./ZomatoClient";

async function main() {
  console.log("=================================================");
  console.log("    ZOMATO LLD SYSTEM DESIGN DEMONSTRATION      ");
  console.log("=================================================\n");

  const zomato = new ZomatoClient();

  // 1. Register Restaurants & Menus
  console.log("--- 1. Registering Restaurants & Menus ---");
  const r1 = zomato.registerRestaurant("Punjabi Dhaba", "Pradhan Nagar, Siliguri");
  const butterChicken = new MenuItem("Butter Chicken", 380, "Rich creamy chicken gravy");
  const garlicNaan = new MenuItem("Garlic Naan", 60, "Fresh tandoori naan with garlic");
  r1.addMenuItem(butterChicken);
  r1.addMenuItem(garlicNaan);

  const r2 = zomato.registerRestaurant("Kolkata Arsalan Biryani", "Hill Cart Road, Siliguri");
  const muttonBiryani = new MenuItem("Mutton Biryani", 320, "Authentic Kolkata biryani with potato");
  const chickenChaap = new MenuItem("Chicken Chaap", 240, "Slow-cooked spiced chicken leg");
  r2.addMenuItem(muttonBiryani);
  r2.addMenuItem(chickenChaap);

  // 2. Create User
  console.log("\n--- 2. Creating User Account ---");
  const user = zomato.createUser("Sebabrata Kundu", "seba@example.com", "Studio Residency, Siliguri");

  // 3. Search Restaurants (Uses LRU Cache)
  console.log("\n--- 3. Searching Restaurants by Location ('Siliguri') ---");
  const searchResults = zomato.searchRestaurants("Siliguri");
  console.log(`Found ${searchResults.length} matching restaurants:`);
  searchResults.forEach((rest) => console.log(`  - ${rest.name} (${rest.location})`));

  // 4. Add Items to Cart
  console.log("\n--- 4. Adding Menu Items to Cart ---");
  zomato.addItemToCart(user, r1, butterChicken);
  zomato.addItemToCart(user, r1, garlicNaan);
  console.log(`Cart Status: ${user.cart.getSummary()}`);

  // 5. Test Cross-Restaurant Protection
  try {
    console.log("\n🧪 Testing Cross-Restaurant Cart Protection...");
    zomato.addItemToCart(user, r2, muttonBiryani);
  } catch (err: any) {
    console.log(`✅ Caught Expected Protection Error: "${err.message}"`);
  }

  // 6. Place & Pay for Order
  console.log("\n--- 5. Placing & Paying for Delivery Order ---");
  const upiStrategy = new UpiPaymentStrategy("sebabrata@okicici");
  const { order, paymentResult } = await zomato.placeAndPayOrder(
    user,
    OrderType.DELIVERY,
    upiStrategy
  );

  console.log("\n💳 Payment Result Output:", paymentResult);

  // 7. Lifecycle State Transitions
  console.log("\n--- 6. Simulating Order Status Lifecycle ---");
  order.updateStatus(OrderStatus.PREPARING);
  order.updateStatus(OrderStatus.OUT_FOR_DELIVERY);
  order.updateStatus(OrderStatus.DELIVERED);

  console.log(`\nFinal Cart Summary after order completion: ${user.cart.getSummary()}`);
  console.log("\n=================================================");
  console.log("   DEMONSTRATION COMPLETED SUCCESSFULLY!        ");
  console.log("=================================================");
}

main().catch(console.error);
