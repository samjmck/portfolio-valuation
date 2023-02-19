import { describe, test, expect } from "vitest";
import { CashPosition, CashTransaction, SecurityPosition, SecurityTransaction, Transaction } from "../src/portfolio";
import { Currency } from "../src/money";
import { EmptyCache, OverrideCache } from "../src/cache";
import { Exchange } from "../src/exchange";
import { OpnfnStore } from "../src/OpnfnStore";
import { getFIFOPerformance } from "../src/performance-fifo";
import { getWACPerformance } from "../src/performance-wac";
import { GetPerformanceFunction } from "../src/performance";
import { getLIFOPerformance } from "../src/performance-lifo";

function getPriceCacheKey(isin: string, currency: Currency, time: Date) {
    return `price/${isin}/${currency}/${time.toISOString().replace(/T.*/, "")}`;
}

const emptyCache = new EmptyCache();
const opnfnStore = new OpnfnStore();

describe("basic portfolio test", () => {
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
    overrideCacheMap.set(getPriceCacheKey("APPLE", Currency.USD, new Date("2020-01-03")), 20_00);
    const overridesCache = new OverrideCache(overrideCacheMap, emptyCache);

    test("initial key performance metrics", async () => {
        const performance = await getFIFOPerformance(
            transactionsBasicPortfolio,
            new Date("2020-01-01"),
            new Date("2020-01-03"),
            Currency.USD,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            overridesCache,
        );
        expect(performance.totalValue).toEqual({currency: Currency.USD, amount: 200_00});
        expect(performance.unrealisedPL).toEqual({currency: Currency.USD, amount: 100_00});
        expect(performance.realisedPL).toEqual({currency: Currency.USD, amount: 0});
        console.log(JSON.stringify(performance));
        expect(performance.openPositions).toMatchObject([
            <Partial<CashPosition>> {
                value: {currency: Currency.USD, amount: 0},
            },
            <Partial<SecurityPosition>> {
                security: {
                    isin: "APPLE",
                },
                shares: 10,
            },
        ]);
    });

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
    overrideCacheMap.set(getPriceCacheKey("APPLE", Currency.USD, new Date("2020-01-04")), 20_00);

    test("updated performance metrics after selling 5 shares", async () => {
        const performance = await getFIFOPerformance(
            transactionsBasicPortfolio,
            new Date("2020-01-01"),
            new Date("2020-01-04"),
            Currency.USD,
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
        expect(performance.totalValue).toEqual({currency: Currency.USD, amount: 200_00});
        expect(performance.unrealisedPL).toEqual({currency: Currency.USD, amount: 50_00});
        expect(performance.realisedPL).toEqual({currency: Currency.USD, amount: 50_00});
        expect(performance.openPositions).toMatchObject([
            <Partial<CashPosition>> {
                value: {currency: Currency.USD, amount: 100_00},
            },
            <Partial<SecurityPosition>> {
                security: {
                    isin: "APPLE",
                },
                shares: 5,
            },
        ]);
    });

    // As we only have 1 buy and sell transaction, WAC performance should be the same as FIFO and LIFO performance

    test("equivalence WAC, FIFO and LIFO performance", async () => {
        const parameters: Parameters<GetPerformanceFunction> = [
            transactionsBasicPortfolio,
            new Date("2020-01-01"),
            new Date("2020-01-04"),
            Currency.USD,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            overridesCache,
        ];

        const wacPerformance = await getWACPerformance(...parameters);
        const fifoPerformance = await getFIFOPerformance(...parameters);
        const lifoPerformance = await getLIFOPerformance(...parameters);

        console.log("WAC performance:", JSON.stringify(wacPerformance, null, 2))
        console.log("FIFO performance:", JSON.stringify(fifoPerformance, null, 2))

        expect(wacPerformance).toEqual(fifoPerformance);
        expect(wacPerformance).toEqual(lifoPerformance);
    });
});