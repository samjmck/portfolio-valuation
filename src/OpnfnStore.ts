import {
    HistoricalReadableFXStore,
    HistoricalReadableStore,
    Interval, ProfileStore,
    ReadableFXStore,
    ReadableStore,
    SearchResultItem,
    SearchStore
} from "./store";
import { Exchange, exchangeToOperatingMic, micToExchange } from "./exchange";
import { Currency, OHLC } from "./money";

type ExchangeRateResponse = {
    exchangeRate: number;
};

type ExchangeRateCloseResponse = {
    exchangeRate: number;
    time: string;
}

type HistoricalExchangeRateResponse = {
    exchangeRates: ({ time: string } & OHLC)[];
};

type SearchResponse = {
    name: string;
    exchange: string;
    ticker: string;
}[];

export class OpnfnStore implements
    SearchStore,
    ReadableStore,
    ReadableFXStore,
    HistoricalReadableStore,
    HistoricalReadableFXStore,
    ProfileStore
{
    constructor(private baseUrl = "https://opnfn.com/v1") {}

    async getProfile(isin: string) {
        const response = await fetch(`${this.baseUrl}/profile/isin/${isin}`);
        const json = await response.json();
        return json;
    }

    async search(query: string) {
        const response = await fetch(`${this.baseUrl}/search?query=${query}`);
        const json = await response.json();
        const results = <SearchResultItem[]> [];
        for(const result of json) {
            results.push({
                name: result.name,
                exchange: micToExchange(result.exchange),
                ticker: result.ticker,
            });
        }
        return results;
    }

    async getExchangeRate(
        from: Currency,
        to: Currency,
    ) {
        const response = await fetch(`${this.baseUrl}/fx/from/${from}/to/${to}/latest`);
        const json = await response.json();
        return json.exchangeRate;
    }

    async getExchangeRateAtClose(
        from: Currency,
        to: Currency,
        time: Date,
    ) {
        const response = await fetch(`${this.baseUrl}/fx/from/${from}/to/${to}/close/time/${time.toISOString()}`);
        const json = await response.json();
        return {
            exchangeRate: json.exchangeRate,
            time: new Date(json.time),
        };
    }

    async getHistoricalExchangeRate(
        from: Currency,
        to: Currency,
        startTime: Date,
        endTime: Date,
        interval: Interval,
    ) {
        const response = await fetch(`${this.baseUrl}/fx/from/${from}/to/${to}/period/start/${startTime.toISOString()}/end/${endTime.toISOString()}`);
        const json = await response.json();
        const historicalRatesMap = new Map<Date, OHLC>();
        for(const rate of json.exchangeRates) {
            historicalRatesMap.set(new Date(rate.time), {
                open: rate.open,
                high: rate.high,
                low: rate.low,
                close: rate.close,
            });
        }
        return historicalRatesMap;
    }

    async getByTicker(
        exchange: Exchange,
        ticker: string,
    ) {
        const response = await fetch(`${this.baseUrl}/prices/exchange/${exchangeToOperatingMic(exchange)}/ticker/${ticker}/latest?useIntegers=true`);
        const json = await response.json();
        return {
            currency: json.currency,
            amount: json.amount,
        };
    }

    async getAtCloseByTicker(
        exchange: Exchange,
        ticker: string,
        time: Date,
        adjustedForSplits: boolean,
    ) {
        const response = await fetch(`${this.baseUrl}/prices/exchange/${exchangeToOperatingMic(exchange)}/ticker/${ticker}/close/time/${time.toISOString()}?useIntegers=true&adjustedForSplits=${adjustedForSplits}`);
        const json = await response.json();
        return {
            currency: json.currency,
            amount: json.amount,
            time: new Date(json.time),
        };
    }

    async getHistoricalByTicker(
        exchange: Exchange,
        ticker: string,
        startTime: Date,
        endTime: Date,
        interval: Interval,
        adjustedForSplits: boolean,
    ) {
        const response = await fetch(`${this.baseUrl}/prices/exchange/${exchangeToOperatingMic(exchange)}/ticker/${ticker}/period/start/${startTime.toISOString()}/end/${endTime.toISOString()}?useIntegers=true&adjustedForSplits=${adjustedForSplits}`);
        const json = await response.json();
        const historicalPricesMap = new Map<Date, OHLC>();
        for(const price of json.prices) {
            historicalPricesMap.set(new Date(price.time), {
                open: price.open,
                high: price.high,
                low: price.low,
                close: price.close,
            });
        }
        return {
            currency: json.currency,
            map: historicalPricesMap,
        };
    }
}
