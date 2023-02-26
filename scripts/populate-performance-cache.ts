// This script does two things:
// - For a given period of time, it fetches the relevant historical data for that period (such as closing prices or
//   exchange rates) and stores it in the cache of the "at close" functions.
// - It then populates the cache with that data
// This is useful for 2 reasons:
// - Iteratively requesting the closing exchange rate or price for a given day is normally slow. This script will fetch
//   all that data in one go and populate the cache, so the iterative requests will be cached.
// - The fact that the cache is populated means that the data is readily available.

import { createClient } from "npm:redis@4.6.4";
import * as superjson from "npm:superjson@1.12.2"

import { HistoricalReadableFXStore, HistoricalReadableStore, Interval, SearchStore } from "../src/store.ts";
import { Cache, RedisCache } from "../src/cache.ts";
import { Currency, OHLC } from "../src/money.ts";
import { getISINMainExchangeTicker, getISINPriceCacheKey } from "../src/performance-cache.ts";
import { getPositions, Positions, Transaction } from "../src/portfolio.ts";
import { OpnfnStore } from "../src/OpnfnStore.ts";
import { exchangeToOperatingMic } from "../src/exchange.ts";

async function populateISINPriceCache(
    isin: string,
    fromTime: Date,
    toTime: Date,
    currency: Currency,
    searchStore: SearchStore,
    priceStore: HistoricalReadableStore,
    fxStore: HistoricalReadableFXStore,
    cache: Cache,
) {
    console.log(`\nPopulating cache for ${isin} between ${fromTime} and ${toTime}`)
    const [exchange, ticker] = await getISINMainExchangeTicker(isin, searchStore, cache);
    console.log(`${exchangeToOperatingMic(exchange)} ${ticker}`);
    const historical = await priceStore.getHistoricalByTicker(
        exchange,
        ticker,
        fromTime,
        toTime,
        Interval.Day,
        false,
    );

    if(historical.currency !== currency) {
        const fxHistorical = await fxStore.getHistoricalExchangeRate(
            historical.currency,
            currency,
            new Date(fromTime.getTime() - 24 * 60 * 60 * 1000 * 10),
            new Date(toTime.getTime() +  - 24 * 60 * 60 * 1000 * 2),
            Interval.Day,
        );

        // Convert fxHistorical.map to map with date strings as keys
        const fxHistoricalConvertedMap = new Map<string, OHLC>();
        for(const [date, ohlc] of fxHistorical) {
            fxHistoricalConvertedMap.set(date.toISOString(), ohlc);
        }

        for(const [date, ohlc] of historical.map) {
            const fxDate = new Date(date);
            let fx = fxHistoricalConvertedMap.get(fxDate.toISOString());
            while(fx === undefined) {
                // Reduce fxDate by 1 day
                fxDate.setTime(fxDate.getTime() - 24 * 60 * 60 * 1000);
                fx = fxHistoricalConvertedMap.get(fxDate.toISOString());
            }
            const cacheKey = getISINPriceCacheKey(isin, currency, date);
            const cacheValue = Math.floor(fx.close * ohlc.close);
            if(Number.isInteger(cacheValue) && cacheValue >= 0) {
                await cache.put(cacheKey, cacheValue);
                console.log(`${cacheKey} = ${cacheValue}`);
            } else {
                throw new Error(`Cache value ${cacheValue}`);
            }
        }
    } else {
        for(const [date, ohlc] of historical.map) {
            const cacheKey = getISINPriceCacheKey(isin, currency, date);
            const cacheValue = ohlc.close;
            if(Number.isInteger(cacheValue) && cacheValue >= 0) {
                await cache.put(cacheKey, cacheValue);
                console.log(`${cacheKey} = ${cacheValue}`);
            } else {
                throw new Error(`Cache value ${cacheValue}`);
            }
        }
    }
}

export async function populatePerformanceCache(
    transactions: Transaction[],
    currency: Currency,
    searchStore: SearchStore,
    priceStore: HistoricalReadableStore,
    fxStore: HistoricalReadableFXStore,
    cache: Cache,
) {
    const transactionsEarliestTime = transactions.reduce((earliest, transaction) => {
        return transaction.time < earliest ? transaction.time : earliest;
    }, new Date());
    const transactionsLatestTime = transactions.reduce((latest, transaction) => {
        return transaction.time > latest ? transaction.time : latest;
    }, new Date());
    const positions = getPositions(transactionsEarliestTime, transactionsLatestTime, transactions);

    for(const position of positions.securityPositions) {
        const earliestTime = position.transactions.reduce((earliest, transaction) => {
            return transaction.time < earliest ? transaction.time : earliest;
        }, new Date());
        console.log(`Start time (earliest time): ${earliestTime}`);
        const latestTime = position.transactions.reduce((latest, transaction) => {
            return transaction.time > latest ? transaction.time : latest;
        }, new Date());
        console.log(`End time (latest time): ${latestTime}`);

        await populateISINPriceCache(
            position.security.isin,
            earliestTime,
            latestTime,
            currency,
            searchStore,
            priceStore,
            fxStore,
            cache
        );
    }
}
