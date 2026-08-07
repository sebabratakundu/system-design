import { LRUCache } from "lru-cache";
import { Restaurant } from "../models/Restaurant";

export class RestaurantManager {
  private static instance: RestaurantManager | null = null;
  private restaurants: Map<string, Restaurant> = new Map();
  private searchCache: LRUCache<string, Restaurant[]>;

  private constructor() {
    this.searchCache = new LRUCache<string, Restaurant[]>({
      max: 500,
      ttl: 1000 * 60 * 10, // 10 minutes cache TTL
    });
  }

  public static getInstance(): RestaurantManager {
    if (!RestaurantManager.instance) {
      RestaurantManager.instance = new RestaurantManager();
    }
    return RestaurantManager.instance;
  }

  public addRestaurant(restaurant: Restaurant): void {
    this.restaurants.set(restaurant.id, restaurant);
    this.searchCache.clear(); // Invalidate search cache on catalog update
    console.log(`🏪 [RestaurantManager] Added '${restaurant.name}' in '${restaurant.location}'`);
  }

  public getRestaurantById(id: string): Restaurant | undefined {
    return this.restaurants.get(id);
  }

  public searchByLocation(locationQuery: string): Restaurant[] {
    const key = locationQuery.trim().toLowerCase();
    
    // Check LRU search cache
    const cachedResults = this.searchCache.get(key);
    if (cachedResults) {
      console.log(`⚡ [Cache Hit] Found ${cachedResults.length} restaurants for '${locationQuery}'`);
      return cachedResults;
    }

    const matches = Array.from(this.restaurants.values()).filter((restaurant) =>
      restaurant.location.toLowerCase().includes(key)
    );

    this.searchCache.set(key, matches);
    return matches;
  }

  public getAllRestaurants(): Restaurant[] {
    return Array.from(this.restaurants.values());
  }

  public static resetInstance(): void {
    RestaurantManager.instance = null;
  }
}
