import { getPositions, Position, Transaction } from "./portfolio";
import { Currency } from "./money";
import { HistoricalReadableFXStore, HistoricalReadableStore, SearchStore } from "./store";
import { Cache } from "./cache";
import { getExchangeRate, getISINPrice } from "./performance-cache";
import { ClosedPosition, GetPerformanceFunction, OpenPosition } from "./performance";

// Last In First Out
export const getLIFOPerformance: GetPerformanceFunction = async (
    fullTransactionHistory: Transaction[],
    startTime: Date,
    endTime: Date,
    currency: Currency,
    searchStore: SearchStore,
    priceStore: HistoricalReadableStore,
    fxStore: HistoricalReadableFXStore,
    cache: Cache,
) => {
    const totalValue = {currency, amount: 0};
    const unrealisedPL = {currency, amount: 0};
    const realisedPL = {currency, amount: 0};

    const positions = getPositions(startTime, endTime, fullTransactionHistory);
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
            // TO DO
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
            // Adding sell transactions to realised returns
            // Start with the first buy transaction - Last In, First Out (FIFO)
            let currentOutTransactionIndex = securityPosition.outTransactions.length - 1
            let currentOutTransactionSharesUsed = 0;
            // For every sell (in) transaction, there is a buy (out) transaction
            for (const inTransaction of securityPosition.inTransactions) {
                let sharesDone = 0;
                const sharesPrice = {currency, amount: 0};
                // * -1 as the shares are negative because we are selling them and losing the shares
                while (sharesDone < inTransaction.shares * -1) {
                    const currentOutTransaction = securityPosition.outTransactions[currentOutTransactionIndex];
                    const availableShares = currentOutTransaction.shares - currentOutTransactionSharesUsed;
                    const sharesToDo = inTransaction.shares * -1 - sharesDone;
                    const usingShares = availableShares > sharesToDo ? sharesToDo : availableShares;

                    const exchangeRate = await getExchangeRate(currentOutTransaction.value.currency, currency, currentOutTransaction.time, fxStore, cache);
                    const pricePerShare = currentOutTransaction.value.amount * -1 / currentOutTransaction.shares;
                    sharesPrice.amount += usingShares * pricePerShare * exchangeRate;

                    currentOutTransactionSharesUsed += usingShares;
                    sharesDone += usingShares;

                    if (currentOutTransaction.shares - currentOutTransactionSharesUsed === 0) {
                        currentOutTransactionIndex -= 1;
                        currentOutTransactionSharesUsed = 0;
                    }
                }

                const exchangeRate = await getExchangeRate(inTransaction.value.currency, currency, inTransaction.time, fxStore, cache);
                const profit = inTransaction.value.amount * exchangeRate - sharesPrice.amount
                realisedPL.amount += profit;
                positionRealisedPL.amount += profit;
            }

            // We calculate the current value of the remaining shares as well as unrealised PL
            // Only if the position is still open (shares > 0) will there be remaining shares
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
                while (currentOutTransactionIndex >= 0) {
                    const currentOutTransaction = securityPosition.outTransactions[currentOutTransactionIndex];
                    const availableShares = currentOutTransaction.shares - currentOutTransactionSharesUsed;
                    const pricePerShare = currentOutTransaction.value.amount * -1 / currentOutTransaction.shares;

                    totalValue.amount += securityPrice * availableShares;
                    positionTotalValue.amount += securityPrice * availableShares;

                    const exchangeRate = await getExchangeRate(currentOutTransaction.value.currency, currency, currentOutTransaction.time, fxStore, cache);
                    positionTotalPrice.amount += pricePerShare * availableShares * exchangeRate;

                    unrealisedPL.amount += securityPrice * availableShares - pricePerShare * availableShares * exchangeRate;
                    positionUnrealisedPL.amount += securityPrice * availableShares - pricePerShare * availableShares * exchangeRate;

                    currentOutTransactionIndex -= 1;
                    currentOutTransactionSharesUsed = 0;
                }
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