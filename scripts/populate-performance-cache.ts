// This script does two things:
// - For a given period of time, it fetches the relevant historical data for that period (such as closing prices or
//   exchange rates) and stores it in the cache of the "at close" functions.
// - It then populates the cache with that data
// This is useful for 2 reasons:
// - Iteratively requesting the closing exchange rate or price for a given day is normally slow. This script will fetch
//   all that data in one go and populate the cache, so the iterative requests will be cached.
// - The fact that the cache is populated means that the data is readily available.

import { Exchange } from "../src/exchange";
import { HistoricalReadableFXStore, HistoricalReadableStore, Interval, SearchStore } from "../src/store";
import { Cache } from "../src/cache";
import { Currency } from "../src/money";
import { getISINMainExchangeTicker, getISINPriceCacheKey } from "../src/performance-cache";
import { Positions } from "../src/portfolio";

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
const [exchange, ticker] = await getISINMainExchangeTicker(isin, searchStore, cache);
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
            fromTime,
            toTime,
            Interval.Day,
        );

        for(const [date, ohlc] of historical.map) {
            let fx = fxHistorical.get(date);
            while(fx === undefined) {
                date.setDate(date.getDate() - 1);
                fx = fxHistorical.get(date);
            }
            await cache.put(getISINPriceCacheKey(isin, currency, date), fx.close * ohlc.close);
        }
    } else {
        for(const [date, ohlc] of historical.map) {
            await cache.put(getISINPriceCacheKey(isin, currency, date), ohlc.close);
        }
    }
}

async function populateCacheForPositions(
    positions: Positions,
    currency: Currency,
    searchStore: SearchStore,
    priceStore: HistoricalReadableStore,
    fxStore: HistoricalReadableFXStore,
    cache: Cache,
) {
    for(const position of positions.securityPositions) {
        const earliestTime = position.transactions.reduce((earliest, transaction) => {
            return transaction.time < earliest ? transaction.time : earliest;
        }, new Date());
        const latestTime = position.transactions.reduce((latest, transaction) => {
            return transaction.time > latest ? transaction.time : latest;
        }, new Date());
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

