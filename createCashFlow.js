// show dbs
// use finance

var config = {
    addExchangeTransactions: true,
    doLoans: true
}

db.loadServerScripts();
load("helperFuncions.js");
createCashFlow();


function createCashFlow() {
    db.getCollection('cash_flow').remove({})
    db.getCollection('account_transactions').remove({ "Operation Name": "Transfer" });
    db.getCollection('account_transactions').remove({ "Operation Name": "Money Exchange" });
    db.getCollection('account_transactions').remove({ "Operation Name": "Loan" });

    createFriendsCollection(3);

    var dates = [],
        start_date = getFirstAndLastDates("Usd")["start_date"],
        end_date = getFirstAndLastDates("Usd")["end_date"],
        cash_flow = db.getCollection('cash_flow'),
        money = {
            "Byr": 0,
            "Byn": 0,
            "Usd": 0
        };

    end_date = new Date(end_date.setTime(end_date.getTime() + 1 * 86400000)) // take care of the last date

    // fill the array with dates for each day
    while (start_date <= end_date) {
        dates.push(new Date(start_date))
        start_date = new Date(start_date.setTime(start_date.getTime() + 1 * 86400000));
    }

    // for each day count spendings
    dates.forEach(function (day) {

        day.setMinutes(0);
        day.setSeconds(0);
        day.setMilliseconds(0);
        day.setHours(0);

        cash_flow.insert(countSpendingsForTheDay(day, money))
    })
}

function getAllTransactionsForTheDay(day) {
    var copy_of_the_day = new Date(day), // make a copy to prevent side effects
        current_day = new Date(day),
        next_day = new Date(copy_of_the_day.setTime(copy_of_the_day.getTime() + 1 * 86400000));

    return db.getCollection('account_transactions').find({
        "Date": {
            $gte: current_day,
            $lt: next_day,
        }
    }).toArray()
}

function countSpendingsForTheDay(day, money) {
    var transactions = getAllTransactionsForTheDay(day);

    // count all expenses and incomes for the day and update money object
    transactions.forEach(function (transaction) {
        if (transaction["Type"] === "Exp") {

            switch (transaction["Currency"]) {
                case "Usd":
                    money["Usd"] -= transaction["Value"];
                    break;
                case "Byr":
                    money["Byr"] -= transaction["Value"];
                    break;
                case "Byn":
                    money["Byn"] = +(money["Byn"] - transaction["Value"]).toFixed(2);
                    break;
            }

        } else if (transaction["Type"] === "Inc") {

            switch (transaction["Currency"]) {
                case "Usd":
                    money["Usd"] += transaction["Value"];
                    break;
                case "Byr":
                    money["Byr"] += transaction["Value"];
                    break;
                case "Byn":
                    money["Byn"] = +(money["Byn"] + transaction["Value"]).toFixed(2);
                    break;
            }

        }
    })

    // if the date is a new Date(2016, 06, 01) convert BYR to BYN
    if (day > new Date(2016, 5, 30) && day <= new Date(2016, 6, 1)) {
        // first we need to count the amount of money on PurseByr and CardByr
        var purseByr_exp = countSpendingsOnAccountByDate("2016-06-30T00:00:00.000+03:00", "PurseByr", "Exp"),
            purseByr_inc = countSpendingsOnAccountByDate("2016-06-30T00:00:00.000+03:00", "PurseByr", "Inc"),
            cardByr_exp = countSpendingsOnAccountByDate("2016-06-30T00:00:00.000+03:00", "CardByr", "Exp"),
            cardByr_inc = countSpendingsOnAccountByDate("2016-06-30T00:00:00.000+03:00", "CardByr", "Inc");

        createTransferTransaction("PurseByr", "PurseByn", purseByr_inc - purseByr_exp, day);
        createTransferTransaction("CardByr", "CardByn", cardByr_inc - cardByr_exp, day);

        money["Byn"] += +(money["Byr"] / 10000).toFixed(2);
        money["Byr"] = 0;
    }


    // if money gets negative and we have money to exchange. Create two exchange transactions
    if (isExchangePossible(money) && config.addExchangeTransactions) {
        var info = doExchanges(day, money);
    }


    if (isLoanNecessary(money) && config.doLoans) {
        var loanInfo = getLoanInfo(money);
        doLoans(day, money, loanInfo)
    }

    return {
        "Date": new Date(day),
        "Byr": money["Byr"],
        "Byn": money["Byn"],
        "Usd": money["Usd"],
        //"LoanInfo": loanInfo,
        //"info": info
        //"possibility": isExchangePossible(money),
        //"need transfer": needTransfer
    }
}

function getCurrencyRateForTheDay(day) {
    var copy_of_the_day = new Date(day), // make a copy to prevent side effects
        current_day = new Date(day),
        next_day = new Date(copy_of_the_day.setTime(copy_of_the_day.getTime() + 1 * 86400000));

    var currency = db.getCollection('currency_all').find({
        "date": {
            $gte: current_day,
            $lt: next_day,
        }
    }).toArray()[0]["value"];

    return typeof currency === "string" ? parseFloat(currency.replace(',', '.').replace(' ', '')) : currency;
}

function isExchangePossible(money) {
    if (((money["Byr"] < 0 || money["Byn"] < 0) && money["Usd"] > 0) || ((money["Byr"] > 0 || money["Byn"] > 0) && money["Usd"] < 0)) {
        return true;
    } else {
        return false;
    }
}

function isLoanNecessary(money) {
    if (money["Byr"] < 0 || money["Byn"] < 0 || money["Usd"] < 0) {
        return true
    }
    return false;
}

function getLoanInfo(money) {
    return {
        "Byr": money["Byr"] < 0 ? Math.ceil(Math.abs(money["Byr"]) / 1000000) * 1000000 : 0,
        "Byn": money["Byn"] < 0 ? Math.ceil(Math.abs(money["Byn"]) / 100) * 100 : 0,
        "Usd": money["Usd"] < 0 ? Math.ceil(Math.abs(money["Usd"]) / 100) * 100 : 0
    }
}

function countSpendingsOnAccountByDate(date, account_name, type) {
    try {
        return db.getCollection('account_transactions').aggregate([
            { $match: { Date: { $lte: new Date(date) } } },
            { $match: { "Account": getAccountIdByName(account_name) } },
            { $match: { "Type": type } },
            {
                $group: {
                    _id: "$Account",
                    sum: { $sum: "$Value" }
                }
            },
            { $project: { _id: 0, sum: 1 } }
        ]).toArray()[0]["sum"]; // if we can't get the value will get an error
    } catch (e) {
        return 0;
    }
}

function getInfoForExchange(from, to, money, day) {
    var currency_rate = getCurrencyRateForTheDay(day),
        converted_amount,
        to_buy_amount,
        to_sell_amount;

    if (from === "Usd") {
        converted_amount = money["Usd"] * currency_rate;
        if (to === "Byn") converted_amount = +converted_amount.toFixed(2);

        if (converted_amount < -money[to]) {
            to_buy_amount = converted_amount;
            to_sell_amount = money[from];
        } else {
            to_sell_amount = Math.ceil(-money[to] / currency_rate);
            to_buy_amount = to_sell_amount * currency_rate;
        }

    } else if (from === "Byr" || from === "Byn") {
        converted_amount = Math.floor(money[from] / currency_rate);

        if (converted_amount < -money[to]) {
            to_buy_amount = converted_amount;
            to_sell_amount = to_buy_amount * currency_rate;

            if (currency_rate > to_sell_amount) return; // we should be able to buy at least 1 dollar

        } else {
            to_buy_amount = -money[to];
            to_sell_amount = to_buy_amount * currency_rate;
        }
    }

    if (to === "Byn") to_buy_amount = +to_buy_amount.toFixed(2);
    if (from === "Byn") to_sell_amount = +to_sell_amount.toFixed(2);

    return {
        to_sell_currency: from,
        to_sell_amount: to_sell_amount,
        to_buy_currency: to,
        to_buy_amount: to_buy_amount,
        currency_rate: currency_rate,
        converted_amount: converted_amount
    }
}

function doExchanges(day, money) {
    var info = "";
    if (money["Byr"] < 0 && money["Usd"] > 0) {

        info = getInfoForExchange("Usd", "Byr", money, day);
        createExchangeTransaction("SafeUsd", "PurseByr", info, day);

        money["Usd"] -= info.to_sell_amount;
        money["Byr"] += info.to_buy_amount;

    } else if (money["Byr"] > 0 && money["Usd"] < 0) {
        info = getInfoForExchange("Byr", "Usd", money, day);

        // if we can't buy at least one dollar no exchange is possible
        if (info) {
            createExchangeTransaction("PurseByr", "SafeUsd", info, day);

            money["Byr"] -= info.to_sell_amount;
            money["Usd"] += info.to_buy_amount;
        }

    } else if (money["Byn"] < 0 && money["Usd"] > 0) {

        info = getInfoForExchange("Usd", "Byn", money, day);
        createExchangeTransaction("SafeUsd", "PurseByn", info, day);

        money["Usd"] -= info.to_sell_amount;
        money["Byn"] = +(money["Byn"] += info.to_buy_amount).toFixed(2);

    } else if (money["Byn"] > 0 && money["Usd"] < 0) {
        info = getInfoForExchange("Byn", "Usd", money, day);

        // if we can't buy at least one dollar no exchange is possible
        if (info) {
            createExchangeTransaction("PurseByn", "SafeUsd", info, day);

            money["Byn"] = +(money["Byn"] -= info.to_sell_amount).toFixed(2);
            money["Usd"] += info.to_buy_amount;
        }

    }
    return info;
}


function doLoans(day, money, loanInfo) {
    var friend = db.getCollection('debts').find().limit(-1).skip(getRandomNumber(0, 2)).next(); // get one random person from 3

    var accounts = {
        "Byr": "PurseByr",
        "Byn": "PurseByn",
        "Usd": "SafeUsd"
    }

    for (var cur in loanInfo) {
        if (loanInfo[cur] > 0) {
            createLoanTransaction(day, cur, loanInfo[cur], accounts[cur], friend);

            money[cur] += loanInfo[cur];
        }
    }
}


