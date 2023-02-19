import type { Currency, Money } from "./money";

// Transactions

// Convention:  value.amount is positive -> deposit, money coming into account
//              value.amount is negative -> withdrawal, money coming out account
export interface CashTransaction {
    time: Date;
    value: Money;
    metadata: object;
}

export interface Security {
    isin: string;
    metadata: object;
}

// Convention:  value.amount is positive -> sell transaction, money coming into account
//              value.amount is negative -> buy transaction, money coming out account
export interface SecurityTransaction {
    time: Date;
    value: Money;
    security: Security;
    shares: number;
    metadata: object;
}

export interface DividendTransaction {
    time: Date;
    value: Money;
    security: Security;
    metadata: object;
}

export type Transaction = CashTransaction | SecurityTransaction | DividendTransaction;

export function isSecurityTransaction(transaction: Transaction): transaction is SecurityTransaction {
    const securityTransaction = transaction as SecurityTransaction;
    return securityTransaction.security !== undefined && securityTransaction.shares !== undefined;
}

export function isDividendTransaction(transaction: Transaction): transaction is DividendTransaction {
    const dividendTransaction = transaction as DividendTransaction;
    return dividendTransaction.security !== undefined && !isSecurityTransaction(dividendTransaction);
}

export function isCashTransaction(transaction: Transaction): transaction is CashTransaction {
    return !isSecurityTransaction(transaction) && !isDividendTransaction(transaction);
}

// Portfolio positions
// inTransactions add money to account (e.g. sell transactions, deposits)
// outTransactions remove money from account (e.g. buy transactions, withdrawals)

// shares = 0 means the position has closed
export interface SecurityPosition {
    security: Security;
    shares: number;
    inTransactions: SecurityTransaction[];          // Transactions that add money to account (such as sell transactions)
    outTransactions: SecurityTransaction[];         // Transactions that remove money from account (such as buy transactions)
    dividendTransactions: DividendTransaction[];
    transactions: SecurityTransaction[];
}

export interface CashPosition {
    value: Money;
    inTransactions: Transaction[];  // Transactions that add money to account (such as deposits)
    outTransactions: Transaction[]; // Transactions that remove money from account (such as withdrawals)
    transactions: Transaction[];
}

export type Position = SecurityPosition | CashPosition;

export function isSecurityPosition(position: Position): position is SecurityPosition {
    return (<SecurityPosition> position).security !== undefined;
}

export function isCashPosition(position: Position): position is CashPosition {
    return !isSecurityPosition(position);
}

// Historical positions

export interface Positions {
    transactions: Transaction[];
    // Remember: shares = 0 means the position has closed
    securityPositions: SecurityPosition[];
    cashPositions: CashPosition[];
}

// fullTransactionHistory needs to include all transactions ever made in the portfolio,
// meaning also transactions made before the start date parameter
export function getPositions(
    start: Date,
    end: Date,
    fullTransactionHistory: Transaction[],
): Positions {
    const transactions: Transaction[] = [];
    const cash = new Map<Currency, CashPosition>();
    const openPositions = new Map<string, SecurityPosition>();
    const closedPositions: SecurityPosition[] = [];
    for(const transaction of fullTransactionHistory) {
        if(transaction.time <= end) {
            transactions.push(transaction);
            if(isSecurityTransaction(transaction)) {
                const currentPosition = openPositions.get(transaction.security.isin);
                if(currentPosition === undefined) {
                    openPositions.set(transaction.security.isin, {
                        security: transaction.security,
                        shares: transaction.shares,
                        transactions: [transaction],
                        dividendTransactions: [],
                        // transaction.value.amount > 0 means there's money coming into the account -> sell transaction
                        inTransactions: transaction.value.amount > 0 ? [transaction] : [],
                        outTransactions: transaction.value.amount > 0 ? [] : [transaction],
                    });
                } else {
                    currentPosition.transactions.push(transaction);
                    currentPosition.shares += transaction.shares;

                    // Buy transaction
                    if(transaction.value.amount <= 0) {
                        currentPosition.outTransactions.push(transaction);
                        // Sell transaction
                    } else {
                        currentPosition.inTransactions.push(transaction);
                    }

                    // Shares hit 0 -> we are closing the position, so moving it from openPositions to closedPositions
                    if(currentPosition.shares === 0) {
                        openPositions.delete(transaction.security.isin);
                        if(transaction.time >= start) {
                            closedPositions.push({
                                ...currentPosition,
                            });
                        }
                    }
                }
            } else if(isDividendTransaction(transaction)) {
                const currentPosition = openPositions.get(transaction.security.isin);
                if(currentPosition === undefined) {
                    throw new Error(`Dividend transaction for ${transaction.security.isin} without open position`);
                }
                currentPosition.dividendTransactions.push(transaction);
            }
            const currencyBalance = cash.get(transaction.value.currency);
            if(currencyBalance === undefined) {
                cash.set(transaction.value.currency, {
                    value: {...transaction.value},
                    transactions: [transaction],
                    inTransactions: transaction.value.amount > 0 ? [transaction] : [],
                    outTransactions: transaction.value.amount > 0 ? [] : [transaction],
                });
            } else {
                currencyBalance.value.amount += transaction.value.amount;
                // Buy/withdraw transaction
                if(transaction.value.amount <= 0) {
                    currencyBalance.outTransactions.push(transaction);
                } else {
                    // Sell/deposit/dividend transaction
                    currencyBalance.inTransactions.push(transaction);
                }
            }
        }
    }
    return {
        transactions,
        securityPositions: [...openPositions.values(), ...closedPositions],
        cashPositions: [...cash.values()],
    };
}
