import { getPositions, Transaction } from "./portfolio.ts";
import { Currency } from "./money.ts";
import { HistoricalReadableFXStore, HistoricalReadableStore, SearchStore, StockSplitStore } from "./store.ts";
import { Cache } from "./cache.ts";
import { getExchangeRate, getISINPrice } from "./performance-cache.ts";
import { ClosedPosition, GetPerformanceFunction, OpenPosition } from "./performance.ts";
import { getStockSplitCorrectedTransactions } from "./corrections.ts";

// Weighted Average Cost
export const getWACPerformance: GetPerformanceFunction = async (
    fullTransactionHistory: Transaction[],
    startTime: Date,
    endTime: Date,
    currency: Currency,
    searchStore: SearchStore,
    priceStore: HistoricalReadableStore,
    fxStore: HistoricalReadableFXStore,
    stockSplitStore: StockSplitStore,
    cache: Cache,
) => {
    const totalValue = {currency, amount: 0};
    const unrealisedPL = {currency, amount: 0};
    const realisedPL = {currency, amount: 0};

    const stockSplitCorrectedTransactions = await getStockSplitCorrectedTransactions(fullTransactionHistory, endTime, searchStore, stockSplitStore, cache);
    const positions = getPositions(startTime, endTime, stockSplitCorrectedTransactions);
    const openPositions: OpenPosition[] = [];
    const closedPositions: ClosedPosition[] = [];

    for(const cashPosition of positions.cashPositions) {
        const exchangeRate = await getExchangeRate(cashPosition.value.currency, currency, endTime, fxStore, cache);
        totalValue.amount += cashPosition.value.amount * exchangeRate;

        if(cashPosition.value.currency === currency) {
            openPositions.push({
                ...cashPosition,
                totalValue: cashPosition.value,
                totalPrice: cashPosition.value,
                realisedPL: {currency, amount: 0},
                unrealisedPL: {currency, amount: 0},
            });
        } else {
            // TODO
        }
    }

    for (const securityPosition of positions.securityPositions) {
        let positionTotalPrice = {currency, amount: 0};
        let positionTotalValue = {currency, amount: 0};
        let positionUnrealisedPL = {currency, amount: 0};
        let positionRealisedPL = {currency, amount: 0};

        // Dividends are realised PL
        for (const dividendTransaction of securityPosition.dividendTransactions) {
            const exchangeRate = await getExchangeRate(dividendTransaction.value.currency, currency, dividendTransaction.time, fxStore, cache);
            const dividend = dividendTransaction.value.amount * exchangeRate;
            realisedPL.amount += dividend;
            positionRealisedPL.amount += dividend;
        }

        // Long position
        if (securityPosition.shares >= 0) {
            let boughtShares = 0;
            let cost = 0;
            // Buy transactions
            for(const outTransaction of securityPosition.outTransactions) {
                const exchangeRate = await getExchangeRate(outTransaction.value.currency, currency, outTransaction.time, fxStore, cache);
                cost += outTransaction.value.amount * -1 * exchangeRate;
                boughtShares += outTransaction.shares;
            }
            const weightedAverageCost = cost / boughtShares;

            // Sell transactions
            for(const inTransaction of securityPosition.inTransactions) {
                const exchangeRate = await getExchangeRate(inTransaction.value.currency, currency, inTransaction.time, fxStore, cache);
                const profit = inTransaction.value.amount * exchangeRate - inTransaction.shares * -1 * weightedAverageCost;
                realisedPL.amount += profit;
                positionRealisedPL.amount += profit;
            }

            positionTotalPrice.amount += securityPosition.shares * weightedAverageCost;
            if(securityPosition.shares > 0) {
                const securityPrice = await getISINPrice(
                    securityPosition.security.isin,
                    endTime,
                    currency,
                    searchStore,
                    priceStore,
                    fxStore,
                    cache,
                );
                totalValue.amount += securityPosition.shares * securityPrice;
                unrealisedPL.amount += securityPosition.shares * securityPrice - securityPosition.shares * weightedAverageCost;

                positionTotalValue.amount += securityPosition.shares * securityPrice;
                positionUnrealisedPL.amount += securityPosition.shares * securityPrice - securityPosition.shares * weightedAverageCost;

                openPositions.push({
                    ...securityPosition,
                    totalValue: positionTotalValue,
                    totalPrice: positionTotalPrice,
                    realisedPL: positionRealisedPL,
                    unrealisedPL: positionUnrealisedPL,
                });
            } else {
                // Position closed
                closedPositions.push({
                    ...securityPosition,
                    totalPrice: positionTotalPrice,
                    realisedPL: positionRealisedPL,
                });
            }
        }
    }

    return {
        totalValue,
        unrealisedPL,
        realisedPL,
        openPositions,
        closedPositions
    };
}