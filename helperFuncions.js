function getAccountIdByName(name){
    return db.getCollection('account').find({name: name}).toArray()[0]["_id"];
}

function createExchangeTransaction(from, to, info, date){
    db.getCollection('account_transactions').insert({
        "Type": "Exp",
        "Operation Name": "Money Exchange",
        "Value": info.to_sell_amount,
        "Currency": from.slice(-3),
        "Account": getAccountIdByName(from),
        "Date": new Date(date)
    });
    db.getCollection('account_transactions').insert({
        "Type": "Inc",
        "Operation Name": "Money Exchange",
        "Value": info.to_buy_amount,
        "Currency": to.slice(-3),
        "Account": getAccountIdByName(to),
        "Date": new Date(date)
    });
}

function createTransferTransaction(from, to, amount, date) {
    db.getCollection('account_transactions').insert({
        "Type": "Exp",
        "Operation Name": "Transfer",
        "Value": amount,
        "Currency": "Byr",
        "Account": getAccountIdByName(from),
        "Date": new Date(date)
    });
    db.getCollection('account_transactions').insert({
        "Type": "Inc",
        "Operation Name": "Transfer",
        "Value": Math.round(amount / 10000),
        "Currency": "Byn",
        "Account": getAccountIdByName(to),
        "Date": new Date(date)
    });
}