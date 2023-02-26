// Quick way to ignore positions of securities that have faulty data based on chosen margin of error

import { Cache } from "../src/cache.ts";
import {
    getPositions,
    isCashTransaction,
    isDividendTransaction,
    SecurityTransaction,
    Transaction
} from "../src/portfolio.ts";
import { HistoricalReadableFXStore, HistoricalReadableStore, SearchStore } from "../src/store.ts";
import { getISINPrice } from "../src/performance-cache.ts";

export async function filterTransactions(
    transactions: Transaction[],
    eps: number, // All positions with a transaction that has buy price difference of more than 10% are considered incorrect
    searchStore: SearchStore,
    priceStore: HistoricalReadableStore,
    fxStore: HistoricalReadableFXStore,
    cache: Cache,
): Promise<Transaction[]> {
    const earliestTime = transactions.reduce((earliest, transaction) => {
        return transaction.time < earliest ? transaction.time : earliest;
    }, new Date());
    const latestTime = transactions.reduce((latest, transaction) => {
        return transaction.time > latest ? transaction.time : latest;
    }, new Date());

    const positions = getPositions(earliestTime, latestTime, transactions);

    const filteredTransactions: Transaction[] = [];
    const skippedTransactions: SecurityTransaction[] = [];
    let skippedTransactionsCount = 0;
    let totalTransactionsCount = 0;

    positionsLoop:
    for(const position of positions.securityPositions) {
        totalTransactionsCount += position.transactions.length;
        for(const transaction of position.transactions) {
            try {
                const transactionPrice = Math.abs(transaction.value.amount / transaction.shares);
                const securityClosingPrice = await getISINPrice(
                    transaction.security.isin,
                    transaction.time,
                    transaction.value.currency,
                    searchStore,
                    priceStore,
                    fxStore,
                    cache,
                );

                if(Number.isNaN(securityClosingPrice)) {
                    throw new Error("Security closing price is NaN");
                }

                const difference = securityClosingPrice - transactionPrice;
                const differencePercentage = difference / transactionPrice;
                const differencePercentageString = `${(differencePercentage * 100).toFixed(2)}%`;

                console.log(`Difference is ${differencePercentageString} for ${transaction.security.isin} on ${transaction.time.toISOString().split("T")[0]}`);

                if (Math.abs(differencePercentage) > eps) {
                    console.log(`Difference too large, skipping position`);
                    skippedTransactionsCount += position.transactions.length;
                    skippedTransactions.push(...position.transactions);
                    continue positionsLoop;
                }
            } catch(error) {
                console.log(error);
                console.log("Skipping due to error");
                skippedTransactionsCount += position.transactions.length;
                skippedTransactions.push(...position.transactions);
                continue positionsLoop;
            }
        }
        filteredTransactions.push(...position.transactions);
    }
    filteredTransactions.push(...transactions.filter(t => isCashTransaction(t) || isDividendTransaction(t)));

    console.log(`Skipped ${skippedTransactionsCount} out of ${totalTransactionsCount} transactions (${Math.round(skippedTransactionsCount / totalTransactionsCount * 100)}%)`);
    console.log("Skipped transactions:");
    for(const skippedTransaction of skippedTransactions) {
        console.log(`${skippedTransaction.security.isin} on ${skippedTransaction.time} for ${Math.floor(skippedTransaction.value.amount / 100)} ${skippedTransaction.value.currency}`);
    }

    return filteredTransactions;
}