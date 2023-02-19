import { describe, expect, test } from "vitest";
import { CashPosition, CashTransaction, SecurityPosition, SecurityTransaction, Transaction } from "../src/portfolio";
import { Currency } from "../src/money";
import { Exchange } from "../src/exchange";
import { EmptyCache, OverrideCache } from "../src/cache";
import { OpnfnStore } from "../src/OpnfnStore";
import { getFIFOPerformance } from "../src/performance-fifo";
import { getLIFOPerformance } from "../src/performance-lifo";
import { getWACPerformance } from "../src/performance-wac";

function getPriceCacheKey(isin: string, currency: Currency, time: Date) {
    return `price/${isin}/${currency}/${time.toISOString().replace(/T.*/, "")}`;
}

const emptyCache = new EmptyCache();
const opnfnStore = new OpnfnStore();

describe("transaction history with varied prices", () => {

    // Transaction history with different prices on different days

    // Deposit 100 USD on 2020-01-01
    // Buy 1 share of Apple at 15 USD each on 2020-01-02
    // Buy 2 share of Apple at 25 USD each on 2020-01-03
    // Buy 1 share of Apple at 35 USD each on 2020-01-04
    // Price of Apple shares on 2020-01-05 is 10 USD
    // Sell 2 shares of Apple at 10 USD each on 2020-01-06

    const transactionsVariedPrices: Transaction[] = [
        <CashTransaction> {
            time: new Date("2020-01-01"),
            value: {currency: Currency.USD, amount: +100_00},
            metadata: {},
        },
        <SecurityTransaction> {
            time: new Date("2020-01-02"),
            value: {currency: Currency.USD, amount: -15_00},
            shares: 1,
            security: {
                isin: "APPLE",
                metadata: {},
            },
            metadata: {},
        },
        <SecurityTransaction> {
            time: new Date("2020-01-03"),
            value: {currency: Currency.USD, amount: -50_00},
            shares: 2,
            security: {
                isin: "APPLE",
                metadata: {},
            },
            metadata: {},
        },
        <SecurityTransaction> {
            time: new Date("2020-01-04"),
            value: {currency: Currency.USD, amount: -35_00},
            shares: 1,
            security: {
                isin: "APPLE",
                metadata: {},
            },
            metadata: {},
        },
        <SecurityTransaction> {
            time: new Date("2020-01-06"),
            value: {currency: Currency.USD, amount: +20_00},
            shares: -2,
            security: {
                isin: "APPLE",
                metadata: {},
            },
            metadata: {},
        },
    ];

    // Set share prices on days of transactions
    const overrideCacheMap: Map<string, unknown> = new Map();
    overrideCacheMap.set("exchangeTicker/APPLE", [Exchange.OTC, "APPLE"]);
    overrideCacheMap.set(getPriceCacheKey("APPLE", Currency.USD, new Date("2020-01-06")), 10_00);
    const overrideCache = new OverrideCache(overrideCacheMap, emptyCache);

    test("WAC performance checks", async () => {
        const performance = await getWACPerformance(
            transactionsVariedPrices,
            new Date("2020-01-01"),
            new Date("2020-01-06"),
            Currency.USD,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            overrideCache,
        );

        // Average price
        // Shares  Buy price
        // 1       15 USD
        // 2       25 USD
        // 1       35 USD
        //       = 100 USD / 4 = 25 USD

        // Total value
        // Shares  Current price  Cash       Total value
        // 2     * 10 USD        + 20 USD    = 40 USD

        // Total P/L
        // Total Value  Total price  Total P/L
        // 20 USD     - 50 USD     = -30 USD

        // Unrealised P/L
        // Remaining shares  Avg buy price  Current price  P/L
        // 1                 25 USD         10 USD         -15 USD
        // 1                 25 USD         10 USD         -15 USD
        //                                               = -30 USD

        // Realised P/L
        // Sold shares  Avg buy price  Current price  P/L
        // 1            25 USD         10 USD         -15 USD
        // 1            25 USD         10 USD         -15 USD
        //                                          = -30 USD

        // Total value

        expect(performance.totalValue).toEqual({currency: Currency.USD, amount: 40_00});
        expect(performance.unrealisedPL).toEqual({currency: Currency.USD, amount: -30_00});
        expect(performance.realisedPL).toEqual({currency: Currency.USD, amount: -30_00});
        expect(performance.openPositions).toMatchObject([
            <Partial<CashPosition>> {
                value: {currency: Currency.USD, amount: 20_00},
            },
            <Partial<SecurityPosition>> {
                security: {
                    isin: "APPLE",
                },
                shares: 2,
            },
        ]);
    });

    test("FIFO performance checks", async () => {
        const performance = await getFIFOPerformance(
            transactionsVariedPrices,
            new Date("2020-01-01"),
            new Date("2020-01-06"),
            Currency.USD,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            overrideCache,
        );

        // Total value
        // Shares  Current price  Total value
        // 2     * 10 USD       = 20 USD

        // Unrealised P/L
        // Remaining shares  Buy price  Current price  P/L
        // 1                 25 USD     10 USD       = -15 USD
        // 1                 35 USD     10 USD       = -25 USD
        //                                           = -40 USD

        // Realised P/L
        // Sold shares  Buy price  Current price  P/L
        // 1            15 USD     10 USD         -5 USD
        // 1            25 USD     10 USD         -15 USD
        //                                      = -20 USD

        expect(performance.totalValue).toEqual({currency: Currency.USD, amount: 40_00});
        expect(performance.unrealisedPL).toEqual({currency: Currency.USD, amount: -40_00});
        expect(performance.realisedPL).toEqual({currency: Currency.USD, amount: -20_00});
        expect(performance.openPositions).toMatchObject([
            <Partial<CashPosition>> {
                value: {currency: Currency.USD, amount: 20_00},
            },
            <Partial<SecurityPosition>> {
                security: {
                    isin: "APPLE",
                },
                shares: 2,
            },
        ]);
    });

    test("LIFO performance checks", async () => {
        const performance = await getLIFOPerformance(
            transactionsVariedPrices,
            new Date("2020-01-01"),
            new Date("2020-01-06"),
            Currency.USD,
            opnfnStore,
            opnfnStore,
            opnfnStore,
            overrideCache,
        );

        // Total value
        // Shares  Current price  Total value
        // 2     * 10 USD       = 20 USD

        // Unrealised P/L
        // Remaining shares  Buy price  Current price  P/L
        // 1                 25 USD     10 USD       = -15 USD
        // 1                 15 USD     10 USD       = -5 USD
        //                                           = -20 USD

        // Realised P/L
        // Sold shares  Buy price  Current price  P/L
        // 1            35 USD     10 USD         -25 USD
        // 1            25 USD     10 USD         -15 USD
        //                                      = -40 USD

        expect(performance.totalValue).toEqual({currency: Currency.USD, amount: 40_00});
        expect(performance.unrealisedPL).toEqual({currency: Currency.USD, amount: -20_00});
        expect(performance.realisedPL).toEqual({currency: Currency.USD, amount: -40_00});
        expect(performance.openPositions).toMatchObject([
            <Partial<CashPosition>> {
                value: {currency: Currency.USD, amount: 20_00},
            },
            <Partial<SecurityPosition>> {
                security: {
                    isin: "APPLE",
                },
                shares: 2,
            },
        ]);
    });
});