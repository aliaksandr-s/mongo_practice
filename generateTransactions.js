db.loadServerScripts();

createAccountCollection();
createCategoriesCollection();

generateTransactions();

function generateTransactions() {
    var transactions_list = db.getCollection('transactions').find({}), //mockup
        transactions = db.getCollection('account_transactions'); // our collection

    transactions.remove({}); //clear the collection

    // for each mockup generate transactions
    transactions_list.forEach(function (transaction_mockup) {

        var rate = transaction_mockup["Rate"],
            currency = transaction_mockup["Currency"],
            period = transaction_mockup["Period"];

        //generate array of dates based on period
        var dates = period === "Week" ? getListOfWeekDates(currency, rate) :
            period === "Month" ? getListOfMonthDates(currency, rate) :
                getListOfYearDates(currency, rate);

        // prevent duplicate transactons in Byr and Byn for year peroiods  
        if (transaction_mockup["Currency"] === "Byn" && transaction_mockup["Period"] === "Year") dates = [];

        // create a transaction for each date
        dates.forEach(function (date) {
            transactions.insert(createTransaction(transaction_mockup, date))
        })
    });
}

function createTransaction(transaction_mockup, date) {
    return {
        "Type": transaction_mockup["Type"],
        "Categorie": getCategorie(transaction_mockup["Operation Name"]),
        "Operation Name": getRandomOperation(getCategorie(transaction_mockup["Operation Name"])),
        "Value": +getRandomNumber(transaction_mockup["AmountMin"], transaction_mockup["AmountMax"]),
        "Currency": transaction_mockup["Currency"],
        "Account": getAccount(transaction_mockup["Currency"], transaction_mockup["Account"]),
        "Date": date
    }
}

function createAccountCollection() {
    db.createCollection("account");
    db.getCollection("account").remove({});

    db.getCollection('transactions').aggregate([
        {
            $project: {
                Currency: 1, Account: 1, _id: 0, name: { $concat: ["$Account", "$Currency"] }
            }
        }, {
            $group: {_id : "$name"}
        } 
    ]).toArray().forEach(function(el){
        db.getCollection("account").insert({"name": el._id, "InitialAmount": 0})
    })
}

function createCategoriesCollection() {
    db.createCollection("categories");
    db.getCollection("categories").remove({});
    
    return db.getCollection('transactions').aggregate([
        { $project: {"Operation Name": 1, _id: 0} },
        { $group: {_id: "$Operation Name"} }
    ]).toArray().forEach(function(el){
        db.getCollection("categories").insert({"Categorie": el._id, "Operations": getOperations(el._id)})
    })

}

function getOperations(categorie){
    var list = {
        "Grocery Shopping": ["Buying meat", "Buying fruits and vegetables", "Buying bread", "Buying dairy", "Buying personal care", "Buying frozen foods"],
        "Clothes Shopping": ["Footwear shopping", "Accessories shopping", "Jeans shopping", "Outdoors shopping", "Sports shopping"],
        "Rest": ["Going to the movies", "Going to the bar", "Taxi spendigs", "Coffee"],
        "House Rent": ["Electricity bill", "Heating bill", "Water bill", "Rent bill"],
        "Transport": ["Car gasoline", "Car maintenance"],
        "Utilities": ["Television", "Garbage and recycling"],
        "Internet": ["Netflix", "Streamin video", "Online gaming"],
        "Study": ["Tuition payment", "Sudent loan payment", "School supplies"],
        "Phone": ["App purchases", "Buying stickers"],
        "Phone, Internet": ["Phone gaming", "Phone skype calls"],
        "Parents": ["Dad gave some money", "Mom gave some money"],
        "Utilities, Phone": ["Phone repair", "Phone radio"],
        "Salary": ["Paycheck", "Freelance"]
    }

    return list[categorie]
}
