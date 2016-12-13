db.loadServerScripts();
load("helperFuncions.js");
createCashFlow();

function createCashFlow() {
    db.getCollection('cash_flow').remove({})
    db.getCollection('account_transactions').remove({ "Operation Name": "Transfer" });
    db.getCollection('account_transactions').remove({ "Operation Name": "Money Exchange" });

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
                    money["Byn"] -= transaction["Value"];
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
                    money["Byn"] += transaction["Value"];
                    break;
            }

        }
    })

    // if the date is a new Date(2016, 06, 01) convert BYR to BYN
    if (day > new Date(2016, 05, 30) && day <= new Date(2016, 06, 01)) {
        // first we need to count the amount of money on PurseByr and CardByr
        var purseByr_amount = countSpendingsOnAccountByDate("2016-06-30T00:00:00.000+03:00", "PurseByr", "Exp"),
            cardByr_exp = countSpendingsOnAccountByDate("2016-06-30T00:00:00.000+03:00", "CardByr", "Exp"),
            cardByr_inc = countSpendingsOnAccountByDate("2016-06-30T00:00:00.000+03:00", "CardByr", "Inc");

        createTransferTransaction("PurseByr", "PurseByn", -purseByr_amount, day);
        createTransferTransaction("CardByr", "CardByn", cardByr_inc - cardByr_exp, day);

        //var needTransfer = {need: true, purseByr: -purseByr_amount, cardByr: cardByr_inc - cardByr_exp};
        money["Byn"] += Math.round(money["Byr"] / 10000);
        money["Byr"] = 0;
    }


    // if money gets negative and we have money to exchange. Create two exchange transactions
    if (isExchangePossible(money)) {
        var info = "";
        if (money["Byr"] < 0 && money["Usd"] > 0) {

            info = getInfoForExchange("Usd", "Byr", money, day);
            createExchangeTransaction("SafeUsd", "PurseByr", info, day);

            money["Usd"] -= info.to_sell_amount;
            money["Byr"] += info.to_buy_amount;

        } else if (money["Byr"] > 0 && money["Usd"] < 0) {
            info = "Byr to Usd";

        } else if (money["Byn"] < 0 && money["Usd"] > 0) {
            
            info = getInfoForExchange("Usd", "Byn", money, day);
            createExchangeTransaction("SafeUsd", "PurseByn", info, day);

            money["Usd"] -= info.to_sell_amount;
            money["Byn"] += info.to_buy_amount;

        } else if (money["Byn"] > 0 && money["Usd"] < 0) {
            info = "Byn to Usd";
        }
        //var exchange_info = getExchangeData(day, money)
    }

    return {
        "Date": new Date(day),
        "Byr": money["Byr"],
        "Byn": money["Byn"],
        "Usd": money["Usd"],
        "possibility": isExchangePossible(money),
        "info": info,
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

function countSpendingsOnAccountByDate(date, account_name, type) {
    return db.getCollection('account_transactions').aggregate([
        { $match: { Date: { $lte: new Date(date) } } },
        { $match: { "Account": getAccountIdByName(account_name) } }, // cardByr
        { $match: { "Type": type } },
        {
            $group: {
                _id: "$Account",
                sum: { $sum: "$Value" }
            }
        },
        { $project: { _id: 0, sum: 1 } }
    ]).toArray()[0]["sum"]
}


//print(countSpendingsOnAccountByDate("2016-06-30T00:00:00.000+03:00", "PurseByr", "Exp"))
function getInfoForExchange(from, to, money, day) {
    var currency_rate = getCurrencyRateForTheDay(day),
        converted_amount,
        to_buy_amount,
        to_sell_amount;

    if (from === "Usd") {
        converted_amount = Math.round(money["Usd"] * currency_rate);

        if (converted_amount < -money[to]) {
            to_buy_amount = converted_amount;
            to_sell_amount = money[from];
        } else {
            to_buy_amount = -money[to];
            to_sell_amount = Math.round(to_buy_amount / currency_rate);
        }
    }

    return {
        to_sell_currency: from,
        to_sell_amount: to_sell_amount,
        to_buy_currency: to,
        to_buy_amount: to_buy_amount,
        currency_rate: currency_rate,
        converted_amount: converted_amount
    }
}

