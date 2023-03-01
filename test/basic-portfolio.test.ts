import { assertEquals, assertObjectMatch } from "https://deno.land/std@0.178.0/testing/asserts.ts"
import {
    CashPosition,
    CashTransaction,
    isCashPosition, isSecurityPosition,
    SecurityPosition,
    SecurityTransaction,
    Transaction
} from "../src/portfolio.ts";
import { Currency } from "../src/money.ts";
import { EmptyCache, OverrideCache } from "../src/cache.ts";
import { Exchange } from "../src/exchange.ts";
import { OpnfnStore } from "../src/OpnfnStore.ts";
import { getFIFOPerformance } from "../src/performance-fifo.ts";
import { getWACPerformance } from "../src/performance-wac.ts";
import { GetPerformanceFunction } from "../src/performance.ts";
import { getLIFOPerformance } from "../src/performance-lifo.ts";
import {
    getISINStockSplitsCacheKey,
    getSecurityPriceCacheKey
} from "../src/performance-cache.ts";


Deno.test("basic portfolio test", async (t) => {
    const emptyCache = new EmptyCache();
    const opnfnStore = new OpnfnStore();

    // Basic portfolio transaction history

    // Deposit 100 USD on 2020-01-01
    // Buy 10 shares of Apple at 10 USD each on 2020-01-02
    // Price of Apple shares on 2020-01-03 is 20 USD

    const transactionsBasicPortfolio: Transaction[] = [
        <CashTransaction> {
            time: new Date("2020-01-01"),
            value: {currency: Currency.USD, amount: +100_00},
            metadata: {},
        },
        <SecurityTransaction> {
            time: new Date("2020-01-02"),
            value: {currency: Currency.USD, amount: -100_00},
            shares: 10,
            security: {
                isin: "APPLE",
                metadata: {},
            },
            metadata: {},
        }
    ];

    // Set share prices on days of transactions
    const overrideCacheMap: Map<string, unknown> = new Map();
    overrideCacheMap.set("exchangeTicker/APPLE", [Exchange.OTC, "APPLE"]);
    overrideCacheMap.set(getSecurityPriceCacheKey(Exchange.OTC, "APPLE", Currency.USD, new Date("2020-01-03")), 20_00);
    overrideCacheMap.set(getISINStockSplitsCacheKey("APPLE", new Date("2020-01-02")), []);
    overrideCacheMap.set(getISINStockSplitsCacheKey("APPLE", new Date("2020-01-02")), []);
    const overridesCache = new OverrideCache(overrideCacheMap, emptyCache);

    await t.step("initial key performance metrics", async () => {
        const performance = await getFIFOPerformance(
            transactionsBasicPortfolio,
            new Date("2020-01-01"),
            new Date("2020-01-03"),
            Currency.USD,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            overridesCache,
        );

        assertEquals(performance.totalValue, {currency: Currency.USD, amount: 200_00});
        assertEquals(performance.unrealisedPL, {currency: Currency.USD, amount: 100_00});
        assertEquals(performance.realisedPL, {currency: Currency.USD, amount: 0});
        const cashPosition = performance.openPositions.filter(isCashPosition)[0];
        assertObjectMatch(cashPosition, <Partial<CashPosition>> {
            value: {currency: Currency.USD, amount: 0},
        });
        const securityPosition = performance.openPositions.filter(isSecurityPosition)[0];
        assertObjectMatch(securityPosition, <Partial<SecurityPosition>> {
            security: {
                isin: "APPLE",
            },
            shares: 10,
        });
    });

    await t.step("updated performance metrics after selling 5 shares", async () => {
        // Sell 5 shares on 2020-01-04
        transactionsBasicPortfolio.push(<SecurityTransaction> {
            time: new Date("2020-01-04"),
            value: {currency: Currency.USD, amount: +100_00},
            shares: -5,
            security: {
                isin: "APPLE",
                metadata: {},
            },
            metadata: {},
        });
        overrideCacheMap.set(getSecurityPriceCacheKey(Exchange.OTC, "APPLE", Currency.USD, new Date("2020-01-04")), 20_00);

        const performance = await getFIFOPerformance(
            transactionsBasicPortfolio,
            new Date("2020-01-01"),
            new Date("2020-01-04"),
            Currency.USD,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            overridesCache,
        );
        // Performance before selling 5 shares:
        // Total price for 10 Apple shares: 100 USD (10 USD * 10 shares)
        // Total value for 10 Apple shares: 200 USD (20 USD * 10 shares)
        // Unrealised PL: 100 USD (200 USD - 100 USD)
        // Realised PL: 0 USD

        // Performance after selling 5 shares:
        // Total price for REMAINING 5 Apple shares: 50 USD (10 USD * 5 shares)
        // Total value for REMAINING 5 Apple shares: 100 USD (20 USD * 5 shares)
        // Unrealised PL: 50 USD (100 USD - 50 USD)
        // Realised PL: 50 USD (100 USD - 50 USD, with 100 USD being the selling price of 5 shares and 50 USD being the buying price of 5 shares)
        // Cash balance: 100 USD (price of 5 shares sold)
        // Total value = total value of remaining shares + cash balance = 100 USD + 100 USD = 200 USD
        assertEquals(performance.totalValue, {currency: Currency.USD, amount: 200_00});
        assertEquals(performance.unrealisedPL, {currency: Currency.USD, amount: 50_00});
        assertEquals(performance.realisedPL, {currency: Currency.USD, amount: 50_00});
        const cashPosition = performance.openPositions.filter(isCashPosition)[0];
        assertObjectMatch(cashPosition, <Partial<CashPosition>> {
            value: {currency: Currency.USD, amount: 100_00},
        });
        const securityPosition = performance.openPositions.filter(isSecurityPosition)[0];
        assertObjectMatch(securityPosition, <Partial<SecurityPosition>> {
            security: {
                isin: "APPLE",
            },
            shares: 5,
        });
    });

    await t.step("equivalence WAC, FIFO and LIFO performance", async () => {
        const parameters: Parameters<GetPerformanceFunction> = [
            transactionsBasicPortfolio,
            new Date("2020-01-01"),
            new Date("2020-01-04"),
            Currency.USD,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            overridesCache,
        ];

        const wacPerformance = await getWACPerformance(...parameters);
        const fifoPerformance = await getFIFOPerformance(...parameters);
        const lifoPerformance = await getLIFOPerformance(...parameters);

        assertEquals(wacPerformance, fifoPerformance);
        assertEquals(fifoPerformance, lifoPerformance)
    });
});