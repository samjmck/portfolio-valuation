# portfolio-valuation

portfolio-valuation is a tool that can be used to calculate the value and profits or losses of a portfolio of stocks given a list of transactions. 

## Features

- Uses Deno
- Core of codebase uses standard web APIs, can be implemented in any JavaScript runtime with relative ease
- [LIFO, FIFO and WAC](#profit-calculation-methods) profit calculation methods
- Valuation in any supported currency
- Supports variety of [transaction types](#transaction)
- Caching of data to reduce time spent waiting on data
- No external dependencies
  - Uses [opnfn](https://github.com/samjmck/opnfn) web API for data, but you can use your own data source if it implements the same interface
  - Caching is optional and you can use your own cache if you want e.g. `redis` if you are running the code on a server or a cache that uses `localStorage` if you are running it in the browser

## Usage

Currently, this library is not published anywhere as a package. To use it, you will need to clone the repository. There is also no official documentation, but this README and the code _should_ be enough to get you started.

The majority of the code can run in any JavaScript environment as it uses very few external dependencies and web APIs such as `fetch`. The only Node.js specific code is in [`cache.ts`](src/cache.ts) which uses the `redis` package for a cache implementation. However, you don't need to use Redis as a cache. You could use the the empty cache or implement your own cache.

## Example code

```ts
// Deposit $100
// Buy 10 shares of Apple at $10/share for a total of $100
const transactionHistory: Transaction[] = [
  <CashTransaction> {
    time: new Date("2020-01-01"),
    value: {currency: Currency.USD, amount: +100_00},
  },
  <SecurityTransaction> {
    time: new Date("2020-01-02"),
    value: {currency: Currency.USD, amount: -100_00},
    shares: 10,
    security: {
      isin: "APPLE",
    },
  },
];

// Creates "stores" for fetching data
const opnfnStore = new OpnfnStore();
// You can use a different store for searching ISINs, fetching prices and exchange rates. In this case, we will always use opnfn
const searchStore = opnfnStore;
const priceStore = opnfnStore;
const fxStore = opnfnStore;

// We won't use a real cache here
const emptyCache = new EmptyCache();

getFIFOPerformance(
  transactionHistory,
  new Date("2020-01-01"),
  new Date("2020-01-03"),
  Currency.USD,
  searchStore,
  priceStore,
  fxStore,
  emptyCache,
).then(portfolio => {
  console.log(portfolio);
});
```

**Result**

Assuming Apple's price is $20/share on 2020-01-03:

```js
{
  totalValue: { currency: "USD", amount: 200_00 },
  unrealisedPL: { currency: "USD", amount: 100_00 },
  realisedPL: { currency: "USD", amount: 0 },
  openPositions: [
    // USD cash
    {
      value: { currency: "USD", amount: 100_00 },
      totalPrice: { currency: "USD", amount: 100_00 },
      totalValue: { currency: "USD", amount: 100_00 },
      unrealisedPL: { currency: "USD", amount: 0 },
      realisedPL: { currency: "USD", amount: 0 },
      transactions: [ /* All transactions that are part of this position */ ],
    },
    // Apple position
    {
      security: {
          isin: "APPLE",
      },
      shares: 5,
      totalPrice: { currency: "USD", amount: 50_00 },
      totalValue: { currency: "USD", amount: 100_00 },
      unrealisedPL: { currency: "USD", amount: 50_00 },
      realisedPL: { currency: "USD", amount: 50_00 },
      transactions: [ /* ... */ ],
    }
  ]
}
```

## Table of contents

- [Profit calculation methods](#profit-calculation-methods)
  - [First In First Out (FOFO) example](#first-in-first-out--fifo--example)
  - [Weighted Average Cost (WAC) example](#weighted-average-cost--wac--example)
  - [Last In First Out (LIFO) example](#last-in-first-out--lifo--example)
- [Types](#types)
  1. [Transaction](#transaction)
  2. [Positions](#positions)
  3. [Portfolio](#portfolio)
- [Getting portfolio from transactions](#getting-portfolio-from-transactions)
- [Overriding faulty data](#overriding-faulty-data)
- [Transferring Redis cache data](#transferring-redis-cache-data)

## Profit calculation methods

Profits and losses can be calculated using either the First In First Out (FIFO), Last In First Out (LIFO) or Weighted Average Cost (WAC) methods. These are different methods that frequently used for calculating the value and profits of an inventory of stocks in accounting and tax reporting.

To be able to calculate these metrics for a portfolio, the tool needs:
1. The transaction history of the portfolio up to the date of valuation
2. The price of the securities at the date of valuation
3. The exchange rates of the currencies used in the portfolio at the date of valuation

For point 2 and 3, the tool uses [opnfn](https://github.com/samjmck/opnfn), an open-source project I created that aims to create a clear and consistent API for accessing historical security prices and exchange rates.

### FIFO, LIFO and WAC

As mentioned above, there are different ways to value a portfolio. It's important to understand the differences between these methods as using one of over the other may have a significant impact on the value of the portfolio and its profits or losses. For example, if you are using LIFO, the losses of bad trades at the start of a position's life will be realised later than if you were using FIFO, potentially distorting the actual performance of the position.

LIFO is not permitted under the [International Financial Reporting Standards](https://ifrs.org) (IFRS) but is permitted under the [Generally Accepted Accounting Principles](https://en.wikipedia.org/wiki/Generally_accepted_accounting_principles) (GAAP) in the United States. FIFO and WAC are both permitted under IFRS and GAAP. 

### Example scenario

The following represents a simple transaction history.

| Type | Shares | Price | Name |
| --- | --- |-------| --- |
| Buy | 1 | $100  | Apple |
| Buy | 1 | $200  | Apple |
| Sell | 1 | $175  | Apple |

Let's say that the current price of Apple remains at $175 and we have 1 share remaining in our portfolio.

### First In First Out (FIFO) example

#### Realised P/L calculation with FIFO

We use the buy price of the _first_ share.

| Remaining shares | Buy price | Current price | Realised P/L           |
| --- | --- |---------------|------------------------|
| 1 | $100 | $175          | $100 - $175 = **-$75** |

#### Unrealised P/L calculation with FIFO

We use the buy price of the remaining share, so the second share.

| Remaining shares | Buy price | Current price       | Unrealised P/L        |
| --- |-----------|---------------------|-----------------------|
| 1 | $200      | $175                | $200 - $75 = **$25** |

### Weighted Average Cost (WAC) example

| Weight | Buy price                                | 
| --- |------------------------------------------|
| 1 | $100                                     |
| 1 | $200                                     |
|    | **WAC = $150** |

#### Realised P/L calculation with WAC

| Remaining shares | WAC  | Current price | Realised P/L           |
| --- |------|---------------|------------------------|
| 1 | $150 | $175          | $150 - $175 = **-$25** |

#### Unrealised P/L calculation with WAC

| Remaining shares | WAC  | Current price       | Unrealised P/L        |
| --- |------|---------------------|-----------------------|
| 1 | $150 | $175                | 150 - $175 = **-$25** |

### Last In First Out (LIFO) example

#### Realised P/L calculation with LIFO

We use the buy price of the _last_ share.

| Remaining shares | Buy price | Current price | Realised P/L          |
| --- |-----------|---------------|-----------------------|
| 1 | $200      | $175          | $200 - $175 = **$25** |

#### Unrealised P/L calculation with LIFO

We use the buy price of the remaining share, so the first share.

| Remaining shares | Buy price | Current price       | Unrealised P/L         |
| --- |-----------|---------------------|------------------------|
| 1 | $100      | $175                | $100 - $175 = **-$75** |

## Types

### Transaction

Given a list of transactions that represents the history of a portfolio, the tool can determine the portfolio of positions. We distinguish between 3 types of transactions:
- **Cash transactions** which are either deposits or withdrawals of cash from the portfolio
- **Dividend transactions** which are dividends being paid out to the portfolio
- **Security transactions** which are the purchase or sale of a security

Each transaction has a monetary value associated with it. The convention for the sign of this value is as follows:
- **Positive** values represent money being **added** to the portfolio
- **Negative** values represent money being **removed** from the portfolio

For example, dividend transactions are always positive as they represent money being added to the portfolio. Security transactions are positive when the security is being bought and negative when the security is being sold. Cash transactions are positive when money is being deposited and negative when money is being withdrawn.

In the codebase, the `Transaction` type looks very similar to this:

```ts
interface CashTransaction {
    time: Date;
    value: Money;
}
interface SecurityTransaction {
    time: Date;
    value: Money;
    security: Security;
    shares: number;
}
interface DividendTransaction {
    time: Date;
    value: Money;
    security: Security;
}
type Transaction = CashTransaction | SecurityTransaction | DividendTransaction;
```

You can see the exact definition in [`portfolio.ts`](src/portfolio.ts#L7).

### Positions

A transaction's security is represented by the security's ISIN, not by the security's name. This is because the same security can have different names depending on your broker or the source of your data whereas the ISIN should always remain the same.

A position is created when a security that is not currently in the portfolio is purchased. All consecutive purchases of the same security are added to the same position. A position is closed when the last share of the security is sold. 

Take the positions that are created by the following transactions as an example:

**Transactions**

| Type | Shares | Name |
|------|--------| --- |
| Buy  | 1      | Apple |
| Buy  | 1      | Apple |
| Sell | 2      | Apple |
| Buy  | 1      | Apple |

**Positions**

| Position | Total shares | Name |
|----------|--------------| --- |
| Closed   | 2            | Apple |
| Open     | 1            | Apple |

The first position got closed when the last share of Apple was sold. At that point, any further purchases of Apple would create a new position.

Short positions are currently not supported.

In the codebase, the `Position` type looks very similar to this:

```ts
interface SecurityPosition {
    security: Security;
    shares: number;
    transactions: SecurityTransaction[];
}
interface CashPosition {
    value: Money;
    transactions: (CashTransaction | DividendTransaction)[];
}
export type Position = SecurityPosition | CashPosition;
```

You can see the exact definition in [`portfolio.ts`](src/portfolio.ts#L56).


### Portfolio

A portfolio is simply defined as a list of positions. Given a list of transactions, the tool can determine the portfolio of positions.

```ts
type Portfolio = Position[];
```

## Getting portfolio from transactions

Given a list of transactions, we calculate the portfolio of positions. 

```ts
function getPositions(
    start: Date,
    end: Date,
    fullTransactionHistory: Transaction[],
): Positions;
```

This calculates all positions up until the given end date and then filters out all positions where the last transaction was before the given start date. Positions that are closed contain 0 shares.

There are a few assumptions that are made about the list of transactions:

1. The list of transactions is sorted by time in ascending order
2. Dividend transactions are not paired with some kind of deposit transactions
3. Buy or sell transactions are not paired with withdrawal or deposit transactions

## Overriding faulty data

A cache for data that has to be fetched from a third party yet is used often in the tool. This includes security data such as exchanges where the security is traded and pricing data. By default, the tool fetches this data from [opnfn](https://opnfn.com). However, this data isn't _guaranteed_ to be correct. It could be some data is missing (e.g. for delisted or obscure securities) or the data could be wrong (e.g. for securities that have been renamed or split).

The keys and data that are used from the cache can be found in [`performance-cache.ts`](src/performance-cache.ts). The dates are in `YYYY-MM-DD` format. Here's a summary:

- `exchangeTicker/{isin} -> [Exchange, string]`: A tuple of the exchange and the ticker where the security is traded
- `exchangeRate/{fromCurrencyCode}/{toCurrencyCode}/{time} -> number`: The exchange rate from one currency to another at a given time
- `price/{isin}/{currencyCode}/{time}`: The price of a security in a given currency at a given time

Using `OverrideCache`, you can create a cache that overrides the data from the default cache. For example:

```ts
const overrideMap = new Map();
map.set('exchangeTicker/US0378331005', [Exchange.NYSE, 'AAPL']);
map.set('exchangeRate/USD/EUR/2023-03-12', 1.00);
const overrideCache = new OverrideCache(overrideMap, defaultCache);
```

## Transferring Redis cache data

1. Connect to the Redis server with `redis-cli`
2. Run `bgsave` to create a backup of the current data
3. The backup file `dump.rdb` is located in Redis's working directory. You can find this at `cat /etc/redis/redis.conf`
4. Copy this file to Redis's working directory in the new environment