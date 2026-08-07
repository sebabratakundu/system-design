# Production-Grade Zomato Low-Level Design (LLD) Architecture

## 📌 Architecture Overview

This project implements a clean, production-ready **Low-Level System Design (LLD)** for a food delivery platform (Zomato / Swiggy). It combines clean architecture principles, SOLID guidelines, and production design patterns.

---

## 🏗 System Design Diagram

```mermaid
classDiagram
    class ZomatoClient {
        -restaurantManager: RestaurantManager
        -orderFactory: OrderFactory
        +registerRestaurant(name, location) Restaurant
        +searchRestaurants(location) Restaurant[]
        +createUser(name, email, address) User
        +addItemToCart(user, restaurant, item) void
        +placeAndPayOrder(...) Promise~{order, paymentResult}~
    }

    class RestaurantManager {
        -static instance: RestaurantManager
        -restaurants: Map~string, Restaurant~
        -searchCache: LRUCache
        +static getInstance() RestaurantManager
        +addRestaurant(restaurant: Restaurant) void
        +searchByLocation(query: string) Restaurant[]
    }

    class Restaurant {
        +id: string
        +name: string
        +location: string
        -menu: Map~string, MenuItem~
        +addMenuItem(item: MenuItem) void
        +getMenu() MenuItem[]
    }

    class Cart {
        -restaurant: Restaurant
        -items: MenuItem[]
        +setRestaurant(restaurant: Restaurant) void
        +addToCart(item: MenuItem, restaurant: Restaurant) void
        +getTotalAmount() number
        +clearCart() void
    }

    class Order {
        <<abstract>>
        +id: string
        +createdAt: Date
        +itemsSnapshot: MenuItem[]
        +totalAmount: number
        +status: OrderStatus
        +type: OrderType
        +updateStatus(status: OrderStatus) void
        +markAsPaid() void
    }

    class OrderFactory {
        +createOrder(user, cart, orderType, deliveryAddress) Order
    }

    class IPaymentStrategy {
        <<interface>>
        +providerName: string
        +process(order: Order) Promise~PaymentResult~
        +validate(order: Order) boolean
    }

    class UpiPaymentStrategy {
        -upiId: string
        +process(order: Order) Promise~PaymentResult~
    }

    class CreditCardPaymentStrategy {
        -cardNumber: string
        +process(order: Order) Promise~PaymentResult~
    }

    class PaymentProcessor {
        -strategy: IPaymentStrategy
        +processPayment(order: Order) Promise~PaymentResult~
    }

    ZomatoClient --> RestaurantManager : Facade queries
    ZomatoClient --> OrderFactory : Facade delegates order creation
    RestaurantManager o-- Restaurant : Manages with LRUCache
    Restaurant o-- MenuItem : Contains
    Cart --> Restaurant : Validates single restaurant
    Cart o-- MenuItem : Holds items
    Order <|-- DeliveryOrder
    Order <|-- PickupOrder
    OrderFactory ..> Order : Manufactures
    PaymentProcessor o-- IPaymentStrategy : Executes strategy
    IPaymentStrategy <|.. UpiPaymentStrategy
    IPaymentStrategy <|.. CreditCardPaymentStrategy
```

---

## 🛠 Design Patterns Applied

| Pattern | Class / File | Problem Solved |
| :--- | :--- | :--- |
| **Facade Pattern** | [ZomatoClient](file:///Users/sebabratakundu/programming/system-design/LLD/zomato/src/ZomatoClient.ts) | Unifies user management, restaurant search, cart updates, and order placement behind a simple high-level interface. |
| **Singleton Pattern** | [RestaurantManager](file:///Users/sebabratakundu/programming/system-design/LLD/zomato/src/managers/RestaurantManager.ts) | Guarantees a single in-memory restaurant catalog with production `lru-cache` for high-throughput search queries. |
| **Factory Pattern** | [OrderFactory](file:///Users/sebabratakundu/programming/system-design/LLD/zomato/src/factories/OrderFactory.ts) | Decouples creation of `DeliveryOrder` vs `PickupOrder` instances based on `OrderType` enum. |
| **Strategy Pattern** | [IPaymentStrategy](file:///Users/sebabratakundu/programming/system-design/LLD/zomato/src/types.ts#L12) | Decouples payment algorithms ([UpiPaymentStrategy](file:///Users/sebabratakundu/programming/system-design/LLD/zomato/src/strategies/UpiPaymentStrategy.ts), [CreditCardPaymentStrategy](file:///Users/sebabratakundu/programming/system-design/LLD/zomato/src/strategies/CreditCardPaymentStrategy.ts)) from `Order` execution. |

---

## 🌟 Key Production Enhancements

1. **Cross-Restaurant Cart Protection**: `Cart.addToCart` prevents users from mixing items from different restaurants by throwing a `CrossRestaurantError`.
2. **UUID Generation**: Uses `node:crypto` `randomUUID()` for non-colliding entity identifiers (`User`, `Restaurant`, `MenuItem`, `Order`).
3. **High-Speed Search Caching**: `RestaurantManager` uses `lru-cache` to cache location-based search queries with automatic cache invalidation on catalog updates.
4. **Order Status State Machine**: `Order` tracks explicit state transitions (`CREATED` ➡️ `PAID` ➡️ `PREPARING` ➡️ `OUT_FOR_DELIVERY` ➡️ `DELIVERED`).
5. **Typo Fixes**: Corrected class and module names (`Resturant` ➡️ `Restaurant`, `locaiton` ➡️ `location`).

---

## 🚀 Running the Code

Execute the complete Zomato system design demo:

```bash
cd LLD/zomato
pnpm start
```
