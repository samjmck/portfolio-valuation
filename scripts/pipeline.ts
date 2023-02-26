// Pipeline that does the following given a list of transactions:
// 1. Filter out transactions with securities that have faulty price data
// 2. Correct the remaining transactions for stock splits
// 3. Populate performance cache with those transactions

import { Transaction } from "../src/portfolio.ts";
import { HistoricalReadableFXStore, HistoricalReadableStore, SearchStore, StockSplitStore } from "../src/store.ts";
import { Cache } from "../src/cache.ts";
import { filterTransactions } from "./filter-transactions.ts";
import { populatePerformanceCache } from "./populate-performance-cache.ts";
import { Currency } from "../src/money.ts";

export async function pipeline(
    fullTransactionHistory: Transaction[],
    searchStore: SearchStore,
    priceStore: HistoricalReadableStore,
    fxStore: HistoricalReadableFXStore,
    cache: Cache,
): Promise<Transaction[]> {
    const filteredTransactions = await filterTransactions(fullTransactionHistory, 0.10, searchStore, priceStore, fxStore, cache);
    await populatePerformanceCache(filteredTransactions, Currency.EUR, searchStore, priceStore, fxStore, cache);
    return filteredTransactions;
}