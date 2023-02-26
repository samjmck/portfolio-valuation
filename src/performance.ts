import { HistoricalReadableFXStore, HistoricalReadableStore, SearchStore, StockSplitStore } from "./store.ts";
import { Cache } from "./cache.ts";
import { Currency, Money } from "./money.ts";
import { Position, Transaction } from "./portfolio.ts";

// Certain functions from data stores should be cached as they will be called every time the portfolio performance
// is calculated. The data store calls are expensive and slow as they are making network requests to external APIs

export type OpenPosition =
    Position & { totalPrice: Money, totalValue: Money, realisedPL: Money, unrealisedPL: Money };
export type ClosedPosition = Position & { totalPrice: Money, realisedPL: Money };

export interface Performance {
    totalValue: Money;
    unrealisedPL: Money;
    realisedPL: Money;
    openPositions: OpenPosition[];
    closedPositions: ClosedPosition[];
}

export type GetPerformanceFunction = (
    fullTransactionHistory: Transaction[],
    startTime: Date,
    endTime: Date,
    currency: Currency,
    searchStore: SearchStore,
    priceStore: HistoricalReadableStore,
    fxStore: HistoricalReadableFXStore,
    stockSplitStore: StockSplitStore,
    cache: Cache,
) => Promise<Performance>;

export type PerformanceSeriesPoint = Performance & {
    time: Date;
};

export type PerformanceSeries = PerformanceSeriesPoint[];

export async function getPerformanceSeries(
    getPerformance: GetPerformanceFunction,
    fullTransactionHistory: Transaction[],
    startTime: Date,
    endTime: Date,
    interval: number, // in days
    currency: Currency,
    searchStore: SearchStore,
    priceStore: HistoricalReadableStore,
    fxStore: HistoricalReadableFXStore,
    stockSplitStore: StockSplitStore,
    cache: Cache,
): Promise<PerformanceSeries> {
    const performanceSeries: PerformanceSeries = [];

    const start = new Date(startTime);
    const end = new Date(endTime);
    while(start < end) {
        const time = new Date(start.getTime() + interval * 24 * 60 * 60 * 1000)
        const performance = await getPerformance(
            fullTransactionHistory,
            start,
            new Date(start.getTime() + interval * 24 * 60 * 60 * 1000),
            currency,
            searchStore,
            priceStore,
            fxStore,
            stockSplitStore,
            cache,
        );
        performanceSeries.push({
            ...performance,
            time,
        });

        start.setTime(start.getTime() + interval * 24 * 60 * 60 * 1000);
    }

    return performanceSeries;
}
