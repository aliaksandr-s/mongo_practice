function getAccountIdByName(name){
    return db.getCollection('account').find({name: name}).toArray()[0]["_id"];
}