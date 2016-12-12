db.loadServerScripts();
load("helperFuncions.js");
//createCashFlow();

function createCashFlow(){
    db.getCollection('cash_flow').remove({})
    
    var dates = [],
        start_date = getFirstAndLastDates("Usd")["start_date"],
        end_date = getFirstAndLastDates("Usd")["end_date"],
        cash_flow = db.getCollection('cash_flow'),
        money = {
            "Byr": 0,
            "Byn": 0,
            "Usd": 0
        };
    
     end_date = new Date(end_date.setTime( end_date.getTime() + 1 * 86400000 )) // take care of the last date
    
     // fill the array with dates for each day
     while (start_date <= end_date) {
        dates.push( new Date (start_date) )
        start_date = new Date(start_date.setTime( start_date.getTime() + 1 * 86400000 )); 
    }
    
    //return dates
    
    // for each day count spendings
    dates.forEach(function (day){
       
        day.setMinutes(0);
        day.setSeconds(0);
        day.setMilliseconds(0);
        day.setHours(0);
        
        cash_flow.insert(countSpendingsForTheDay(day, money))
    })
}    

function getAllTransactionsForTheDay(day){
    var copy_of_the_day = new Date(day), // make a copy to prevent side effects
        current_day = new Date(day),
        next_day = new Date(copy_of_the_day.setTime( copy_of_the_day.getTime() + 1 * 86400000 ));
    
    return db.getCollection('account_transactions').find({"Date": {
        $gte: current_day,
        $lt: next_day,
    }}).toArray()
}

function countSpendingsForTheDay(day, money){
    var transactions = getAllTransactionsForTheDay(day);
    
    // count all expenses and incomes for the day and update money object
    transactions.forEach(function(transaction){
        if (transaction["Type"] === "Exp"){
            
            switch(transaction["Currency"]){
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
            
            switch(transaction["Currency"]){
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
    if (day > new Date(2016, 05, 30) && day <= new Date(2016, 06, 01)){
        var needTransfer = true;
        money["Byn"] += money["Byr"] / 10000;
        money["Byr"] = 0;
    }


    // if money gets negative and we have money to exchange. Create two exchange transactions
    if (isExchangePossible(money)) {
        var info = "";
        if (money["Byr"] < 0 && money["Usd"] > 0) {
            info = "Usd to Byr";
        } else if (money["Byr"] > 0 && money["Usd"] < 0) {
            info = "Byr to Usd";
        } else if (money["Byn"] < 0 && money["Usd"] > 0) {
            info = "Usd to Byn";
        } else if (money["Byn"] > 0 && money["Usd"] < 0) {
            info = "Byn to Usd"
        }
        var exchange_info = getExchangeData(day, money)
    }
    
    return {
        "Date": new Date(day),
        "Byr": money["Byr"],
        "Byn": money["Byn"],
        "Usd": money["Usd"],
        "possibility": isExchangePossible(money),
        "exchangeInfo": isExchangePossible(money) ? exchange_info : null,
        "info": info,
        "need transfer": needTransfer
    }
}

function getExchangeData(day, money) {
    var exchange_info = {};
        
    for (var prop in money) {
        if (money[prop] < 0) {
            exchange_info.need_to_buy = {currency: prop, value: money[prop]}
        } else {
            exchange_info.can_be_sold = {currency: prop, value: money[prop]}
        }
    }  

    exchange_info.currency_rate = getCurrencyRateForTheDay(day);
    exchange_info.need_to_sell = {};
    exchange_info.need_to_sell.value = Math.floor(Math.abs(exchange_info.need_to_buy.value) / exchange_info.currency_rate);
    exchange_info.need_to_sell.value = exchange_info.need_to_sell.value > exchange_info.can_be_sold.value ?
                                       exchange_info.can_be_sold.value : exchange_info.need_to_sell.value;
    
    exchange_info.need_to_sell.currency = exchange_info.can_be_sold.currency
    
    exchange_info.date = new Date(day);

    return exchange_info;
}

function getCurrencyRateForTheDay(day) {
    var copy_of_the_day = new Date(day), // make a copy to prevent side effects
        current_day = new Date(day),
        next_day = new Date(copy_of_the_day.setTime( copy_of_the_day.getTime() + 1 * 86400000 ));
    
    return db.getCollection('currency_all').find({"date": {
        $gte: current_day,
        $lt: next_day,
    }}).toArray()[0]["value"]
}

function isExchangePossible(money){
    if ( ((money["Byr"] < 0 || money["Byn"] < 0) && money["Usd"] > 0) || ((money["Byr"] > 0 || money["Byn"] > 0) && money["Usd"] < 0) ) {
        return true;
    } else {
        return false;
    }
}

function countSpendingsOnAccountByDate(date, account_name, type){
    return db.getCollection('account_transactions').aggregate([
        { $match : {Date: {$lte: new Date(date)}} },
        { $match: {"Account": getAccountIdByName(account_name)} }, // cardByr
        { $match: {"Type": type } },
        { $group: {
            _id: "$Account",
            sum: { $sum: "$Value"} 
        }},
        { $project: {_id: 0, sum: 1}}
    ]).toArray()[0]["sum"]
}


print(countSpendingsOnAccountByDate("2016-06-30T00:00:00.000+03:00", "PurseByr", "Exp"))