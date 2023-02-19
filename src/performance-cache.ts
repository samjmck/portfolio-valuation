import { Currency } from "./money";
import { HistoricalReadableFXStore, HistoricalReadableStore, SearchStore } from "./store";
import { Cache } from "./cache";
import { Exchange } from "./exchange";

async function getISINMainExchangeTicker(
    isin: string,
    searchStore: SearchStore,
    cache: Cache,
): Promise<[Exchange, string]> {
    const cachedResult = await cache.get<[Exchange, string]>(`exchangeTicker/${isin}`);
    if (cachedResult !== null) {
        return cachedResult;
    }

    const searchResult = await searchStore.search(isin);
    if (searchResult.length === 0) {
        throw new Error(`No ticker found for ISIN ${isin}`);
    }

    // Cache for one year as the ISIN -> ticker mapping could change e.g. if the company changes its name
    cache.put(`exchangeTicker/${isin}`, [searchResult[0].exchange, searchResult[0].ticker], 365 * 24 * 60 * 60);

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

    const cachedResult = await cache.get<number>(`exchangeRate/${fromCurrency}/${toCurrency}/${time.toISOString().replace(/T.*/, "")}`);
    if (cachedResult !== null) {
        return cachedResult;
    }

    const exchangeRate = (await fxStore.getExchangeRateAtClose(fromCurrency, toCurrency, time)).exchangeRate;

    // Cache forever as historical exchange rate should not change
    cache.put(`exchangeRate/${fromCurrency}/${toCurrency}/${time.toISOString().replace(/T.*/, "")}`, exchangeRate);

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

    const cachedResult = await cache.get<number>(`price/${isin}/${currency}/${time.toISOString().replace(/T.*/, "")}`);
    if (cachedResult !== null) {
        return cachedResult;
    }

    const price = await priceStore.getAtCloseByTicker(exchange, ticker, time, false);
    let exchangeRate = 1;
    if (price.currency !== currency) {
        exchangeRate = (await fxStore.getExchangeRateAtClose(price.currency, currency, time)).exchangeRate;
    }

    // Cache forever as historical price for a given ISIN and currency should not change
    cache.put(`price/${isin}/${currency}/${time.toISOString().replace(/T.*/, "")}`, exchangeRate * price.amount);

    return exchangeRate * price.amount;
}
