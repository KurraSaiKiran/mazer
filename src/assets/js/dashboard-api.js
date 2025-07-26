/**
 * Dashboard API Integration Module
 * Handles data fetching, caching, and real-time updates
 */

class DashboardAPI {
    constructor() {
        this.baseURL = '/api'; // Can be configured for different environments
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.retryAttempts = 3;
        this.retryDelay = 1000; // 1 second
    }

    /**
     * Fetch dashboard data with caching and retry logic
     */
    async fetchDashboardData() {
        const cacheKey = 'dashboard-data';
        const cachedData = this.getFromCache(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }

        try {
            // Try to fetch from API first, fallback to local JSON
            let data;
            try {
                data = await this.fetchWithRetry(`${this.baseURL}/dashboard`);
            } catch (apiError) {
                console.warn('API not available, falling back to local data:', apiError);
                data = await this.fetchLocalData();
            }
            
            this.setCache(cacheKey, data);
            return data;
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
            throw error;
        }
    }

    /**
     * Fetch local JSON data as fallback
     */
    async fetchLocalData() {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }

    /**
     * Fetch with retry logic
     */
    async fetchWithRetry(url, options = {}, attempt = 1) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (attempt < this.retryAttempts) {
                console.warn(`Attempt ${attempt} failed, retrying in ${this.retryDelay}ms...`);
                await this.delay(this.retryDelay);
                return this.fetchWithRetry(url, options, attempt + 1);
            }
            throw error;
        }
    }

    /**
     * Update specific dashboard metrics
     */
    async updateMetrics(metrics) {
        try {
            const response = await this.fetchWithRetry(`${this.baseURL}/metrics`, {
                method: 'POST',
                body: JSON.stringify(metrics)
            });
            
            // Update cache with new data
            this.invalidateCache('dashboard-data');
            return response;
        } catch (error) {
            console.error('Failed to update metrics:', error);
            throw error;
        }
    }

    /**
     * Fetch real-time notifications
     */
    async fetchNotifications() {
        const cacheKey = 'notifications';
        const cachedData = this.getFromCache(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }

        try {
            const data = await this.fetchWithRetry(`${this.baseURL}/notifications`);
            this.setCache(cacheKey, data, 60000); // Cache for 1 minute
            return data;
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
            // Return empty array as fallback
            return [];
        }
    }

    /**
     * Cache management
     */
    setCache(key, data, timeout = this.cacheTimeout) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            timeout
        });
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        const isExpired = Date.now() - cached.timestamp > cached.timeout;
        if (isExpired) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    invalidateCache(key) {
        this.cache.delete(key);
    }

    clearCache() {
        this.cache.clear();
    }

    /**
     * Utility function for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * WebSocket connection for real-time updates
     */
    initWebSocket() {
        if (typeof WebSocket === 'undefined') {
            console.warn('WebSocket not supported');
            return;
        }

        try {
            this.ws = new WebSocket('ws://localhost:8080/dashboard');
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleRealtimeUpdate(data);
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                // Attempt to reconnect after 5 seconds
                setTimeout(() => this.initWebSocket(), 5000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.warn('Failed to initialize WebSocket:', error);
        }
    }

    /**
     * Handle real-time updates
     */
    handleRealtimeUpdate(data) {
        // Invalidate relevant cache
        this.invalidateCache('dashboard-data');
        
        // Emit custom event for dashboard to handle
        const event = new CustomEvent('dashboardUpdate', {
            detail: data
        });
        document.dispatchEvent(event);
    }

    /**
     * Close WebSocket connection
     */
    closeWebSocket() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

/**
 * Mock API endpoints for development/testing
 */
class MockAPI {
    constructor() {
        this.data = null;
        this.init();
    }

    async init() {
        // Load initial data
        const response = await fetch('data.json');
        this.data = await response.json();
    }

    async getDashboard() {
        // Simulate API delay
        await this.delay(Math.random() * 1000 + 500);
        
        // Simulate some dynamic data changes
        const dynamicData = { ...this.data };
        dynamicData.dashboard.stats = dynamicData.dashboard.stats.map(stat => ({
            ...stat,
            value: this.generateRandomValue(stat.id)
        }));

        return dynamicData;
    }

    async getNotifications() {
        await this.delay(300);
        return this.data.dashboard.notifications;
    }

    generateRandomValue(statId) {
        const baseValues = {
            revenue: 125430,
            orders: 2847,
            customers: 18592,
            conversion: 3.24
        };

        const base = baseValues[statId] || 1000;
        const variation = 0.1; // 10% variation
        const randomFactor = 1 + (Math.random() - 0.5) * variation;
        
        if (statId === 'conversion') {
            return (base * randomFactor).toFixed(2) + '%';
        } else if (statId === 'revenue') {
            return '$' + Math.round(base * randomFactor).toLocaleString();
        } else {
            return Math.round(base * randomFactor).toLocaleString();
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DashboardAPI, MockAPI };
} else {
    window.DashboardAPI = DashboardAPI;
    window.MockAPI = MockAPI;
}