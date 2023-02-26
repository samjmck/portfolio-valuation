import { Currency } from "./money.ts";
import { HistoricalReadableFXStore, HistoricalReadableStore, SearchStore, Split, StockSplitStore } from "./store.ts";
import { Cache } from "./cache.ts";
import { Exchange } from "./exchange.ts";

export function getISINMainExchangeCacheKey(isin: string): string {
    return `exchangeTicker/${isin}`;
}

export function getExchangeRateCacheKey(fromCurrency: Currency, toCurrency: Currency, time: Date): string {
    return `exchangeRate/${fromCurrency}/${toCurrency}/${time.toISOString().replace(/T.*/, "")}`;
}

export function getISINPriceCacheKey(isin: string, currency: Currency, time: Date): string {
    return `price/${isin}/${currency}/${time.toISOString().replace(/T.*/, "")}`;
}

export function getISINStockSplitsCacheKey(isin: string, startTime: Date): string {
    return `stockSplits/${isin}/${startTime.toISOString().replace(/T.*/, "")}}`;
}

export async function getISINMainExchangeTicker(
    isin: string,
    searchStore: SearchStore,
    cache: Cache,
): Promise<[Exchange, string]> {
    const cacheKey = getISINMainExchangeCacheKey(isin);
    const cachedResult = await cache.get<[Exchange, string]>(cacheKey);
    if (cachedResult !== null) {
        return cachedResult;
    }

    const searchResult = await searchStore.search(isin);
    if (searchResult.length === 0) {
        throw new Error(`No ticker found for ISIN ${isin}`);
    }

    // Cache for one year as the ISIN -> ticker mapping could change e.g. if the company changes its name
    cache.put(cacheKey, [searchResult[0].exchange, searchResult[0].ticker], 365 * 24 * 60 * 60);

    return [searchResult[0].exchange, searchResult[0].ticker];
}

export async function getExchangeRate(
    fromCurrency: Currency,
    toCurrency: Currency,
    time: Date,
    fxStore: HistoricalReadableFXStore,
    cache: Cache,
): Promise<number> {
    if (fromCurrency === toCurrency) {
        return 1;
    }

    const cacheKey = getExchangeRateCacheKey(fromCurrency, toCurrency, time);
    const cachedResult = await cache.get<number>(cacheKey);
    if (cachedResult !== null) {
        return cachedResult;
    }

    const exchangeRate = (await fxStore.getExchangeRateAtClose(fromCurrency, toCurrency, time)).exchangeRate;

    // Cache forever as historical exchange rate should not change
    cache.put(cacheKey, exchangeRate);

    return exchangeRate;
}

export async function getISINPrice(
    isin: string,
    time: Date,
    currency: Currency,
    searchStore: SearchStore,
    priceStore: HistoricalReadableStore,
    fxStore: HistoricalReadableFXStore,
    cache: Cache,
): Promise<number> {
    const [exchange, ticker] = await getISINMainExchangeTicker(isin, searchStore, cache);

    const cacheKey = getISINPriceCacheKey(isin, currency, time);
    const cachedResult = await cache.get<number>(cacheKey);
    if (cachedResult !== null) {
        return cachedResult;
    }

    const price = await priceStore.getAtCloseByTicker(exchange, ticker, time, false);
    let exchangeRate = 1;
    if (price.currency !== currency) {
        exchangeRate = (await fxStore.getExchangeRateAtClose(price.currency, currency, time)).exchangeRate;
    }

    // Cache forever as historical price for a given ISIN and currency should not change
    cache.put(cacheKey, exchangeRate * price.amount);

    return exchangeRate * price.amount;
}

export async function getISINStockSplits(
    isin: string,
    startTime: Date,
    endTime: Date,
    searchStore: SearchStore,
    stockSplitsStore: StockSplitStore,
    cache: Cache,
): Promise<Split[]> {
    const [exchange, ticker] = await getISINMainExchangeTicker(isin, searchStore, cache);

    const cacheKey = getISINStockSplitsCacheKey(isin, startTime);
    const cachedResult = await cache.get<Split[]>(cacheKey);
    if (cachedResult !== null) {
        return cachedResult;
    }

    const stockSplits = await stockSplitsStore.getStockSplits(startTime, endTime, exchange, ticker);

    // Cache for 1 day - stock split might happen the next day
    cache.put(cacheKey, stockSplits, 24 * 60 * 60);

    return stockSplits;
}
