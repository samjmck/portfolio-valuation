import { isSecurityTransaction, SecurityTransaction, Transaction } from "./portfolio.ts";
import { getISINStockSplits } from "./performance-cache.ts";
import { SearchStore, StockSplitStore } from "./store.ts";
import { Cache } from "./cache.ts";

export async function getStockSplitCorrectedTransactions(
    transactions: Transaction[],
    until: Date,
    searchStore: SearchStore,
    stockSplitStore: StockSplitStore,
    cache: Cache,
): Promise<Transaction[]> {
    const transactionsByIsin = new Map<string, SecurityTransaction[]>();
    const duplicatedTransactions = structuredClone(transactions);

    for (const transaction of duplicatedTransactions) {
        if (!isSecurityTransaction(transaction)) {
            continue;
        }
        const securityTransactions = transactionsByIsin.get(transaction.security.isin);
        if(securityTransactions === undefined) {
            transactionsByIsin.set(transaction.security.isin, [transaction]);
        } else {
            securityTransactions.push(transaction);
        }
    }

    for (const [isin, securityTransactions] of transactionsByIsin) {
        const earliestTime = securityTransactions.reduce((earliest, transaction) => {
            return transaction.time < earliest ? transaction.time : earliest;
        }, new Date());
        if(earliestTime >= until) {
            continue;
        }
        const splits = await getISINStockSplits(isin, earliestTime, until, searchStore, stockSplitStore, cache);
        for (const split of splits) {
            for (const transaction of securityTransactions) {
                if (transaction.time > split.time) {
                    continue;
                }
                transaction.shares *= split.split;
                transaction.value.amount *= split.split;
            }
        }
    }

    return duplicatedTransactions;
}