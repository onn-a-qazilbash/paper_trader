const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../config/auth');
const fetch = require('node-fetch');

const Users = require('../models/Users');

router.put('/stocktrans', (req, res) => {
    if (!req.user){
        return res.json({ errorMessage: "You must be signed in for this feature." });
    }

    if (!req.body.symbol || !req.body.price || !req.body.shares || !req.body.volume){
        return res.json({ errorMessage: "Invalid inputs: Empty fields" });
    }
    if(req.body.shares < 1){
        return res.json({ errorMessage: "You must transact with at least 1 share." });
    }

    // if mode set to buy
    if (req.body.buy){

        Users.findById(req.user._id)
            .then(user => {
                if (user.stocks.length === 5){
                    return res.json({ errorMessage: "You cannot purchase more than 5 stocks." });
                }
                
                const exists = (user.stocks.filter( obj => obj.symbol == req.body.symbol));
                if (exists.length !== 0){
                    return res.json( {errorMessage: "Cannot purchase this stock more than once."} );
                }
                const stock = {
                    symbol: req.body.symbol,
                    price: req.body.price,
                    shares: req.body.shares,
                    volume: req.body.volume,
                    asset_value: req.body.price
                };
                console.log("Buying stocks!")

                Users.findOneAndUpdate({ _id: req.user._id }, { $push: {stocks: stock} }, {useFindAndModify: false}, (err, result) => {
                    if (err){
                        console.log("Error in buying stocks.");
                    }
                });


                Users.findOneAndUpdate({_id: req.user._id}, {$set: {"wallet": req.user.wallet - (req.body.shares*req.body.price)}}, {useFindAndModify: false}, (err, res)=>{
                    if (err){
                        console.log("Something wrong with chaning the wallet.");
                    }
                });



                return res.json({ successMessage: `Successfully bought ${req.body.shares} ${req.body.shares>1 ? "shares": "share"} of ${req.body.symbol}!` });
            });
    }

    // if mode set to sell
    else{

        Users.findOne({ _id: req.user._id})
        .then(user => {
            const total_stocks = user.stocks.filter(obj => obj.symbol===req.body.symbol);
            let total_shares = 0;
            total_stocks.forEach(stock => {
                total_shares += stock.shares
            });

            if (req.body.shares > total_shares){
                return res.json({ errorMessage: "Cannot sell more shares than you own." });
            }
            
            console.log("Selling stock!");
            if (req.body.shares == total_shares){
                Users.update({ _id: req.user._id }, { "$pull": { "stocks": { "symbol": req.body.symbol } }}, { safe: true, multi:true }, function(err, obj) {
                    console.log("Stock deleted from DB");
                });
            }

            else{
                Users.findOneAndUpdate({_id: req.user._id, "stocks.symbol": req.body.symbol}, {$set: {"stocks.$.shares": total_shares - req.body.shares}}, {useFindAndModify: false}, (err, res)=>{
                    if (err){
                        console.log("Something wrong with selling stocks.");
                    }
                });
            }

            Users.findOneAndUpdate({_id: req.user._id}, {$set: {"wallet": req.user.wallet + (req.body.shares*req.body.price), "stocksSold": req.user.stocksSold + (req.body.shares*req.body.price)}}, {useFindAndModify: false}, (err, res)=>{
                if (err){
                    console.log("Something wrong with chaning the wallet.");
                }
            });



            return res.json({ successMessage: `Successfully sold ${req.body.shares} ${req.body.shares > 1 ? "shares": "share"} of ${req.body.symbol}!`});
        });
    }

});


router.post('/ownedShares', (req, res) => {
    if (!req.user){
        return res.json({ total_shares: 0 });
    }

    Users.findOne({ _id: req.user._id})
        .then(user => {
            const total_stocks = user.stocks.filter(obj => obj.symbol===req.body.symbol);
            let total_shares = 0;
            total_stocks.forEach(stock => {
                total_shares += stock.shares
            });
            return res.json({ total_shares: total_shares });
        });

})


// First updates the price of each stock in the portfolio. Then, sends the updated portfolio from the db
// to the front-end
router.get('/updateStocks', ensureAuthenticated, (req, res) => {
    const { API_KEY, FUNCTION_TYPE} = require('../config/stockkey');
    console.log(FUNCTION_TYPE);
    Users.findOne({ _id: req.user._id })
        .then(user => {
            user.stocks.forEach( stock => {
                const SYMBOL = stock.symbol;
                const API = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${SYMBOL}&outputsize='compact'&apikey=${API_KEY}`;
                fetch(API)
                    .then(response => response.json())
                        .then(data => {
                            console.log("we working");
                            console.log(data['Time Series (Daily)']);
                            
                            for (var key in data['Time Series (Daily)']){
                                const new_price = (data['Time Series (Daily)'][key]['4. close']);
                                console.log(new_price);
                                Users.findOneAndUpdate({_id: req.user._id, "stocks.symbol": stock.symbol}, {$set: {"stocks.$.asset_value": new_price}}, {useFindAndModify: false}, (err, res)=>{
                                    if (err){
                                        console.log("Something wrong with selling stocks.");
                                    }
                                });
                                break;
                            }
                        })
                        .then(() => {
                            Users.findById(req.user._id)
                                .then(user => {
                                    return res.json({ stocks: user.stocks, wallet: user.wallet, stocksSold: user.stocksSold });
                                });
                        });
            });

        })
});


router.get('/resetPort', ensureAuthenticated, (req, res) => {
    console.log('Resetting!');
    Users.findOneAndUpdate({_id: req.user._id}, {$set: {
        "wallet": 0,
        "stocksSold": 0,
        "stocks": []
    }}, {useFindAndModify: false}, (err, res)=>{
        if (err){
            console.log("Something wrong with selling stocks.");
        }
    });
});



module.exports = router;
