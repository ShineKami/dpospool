//Init modules
const express = require('express');
const request = require('request');
const router = express.Router();
const pool = require('../libs/pool.js');
const { beddowsAsLsk, menuBuilder, getExplorer, log } = require('../libs/helpers.js');

//Init config
const config = pool.config;

//Page tags
let data = {
  "TITLE": config.pool.name,
  "network": config.blockchainApp.network
};

//Voter statistics - Voter address
router.get('/', function (req, res) {
  data.MAINMENU = menuBuilder(req.baseUrl);
  res.render('voter-open', data);
});

//Voter statistics - Voter info
router.get('/address/:address', function (req, res) {
  var address = req.params.address;

  //Get data
  pool.db.one("SELECT * FROM voters WHERE address='"+address+"'")
  .then(rdata => {
    data.MAINMENU = menuBuilder(req.baseUrl);
    data.balance = beddowsAsLsk(rdata.balance);
    data.address = rdata.address;
    data.explorer_url = getExplorer("account/"+rdata.address);
    data.id = rdata.id;
    data.withdrawal = [];

    pool.db.any("SELECT * FROM withdrawal_history WHERE voter_id='"+data.id+"' ORDER BY timestamp DESC LIMIT 50")
    .then(rdata => {
      if(rdata.length){
        for(let i=0; i<rdata.length; i++){
          let d = new Date(+rdata[i].timestamp);
              d = ("0" + d.getDate()).slice(-2)+"."+("0" + (d.getMonth() + 1)).slice(-2)+"."+d.getFullYear()+" | "+("0" + d.getHours()).slice(-2)+":"+("0" + d.getMinutes()).slice(-2)+":"+("0" + d.getSeconds()).slice(-2);

          data.withdrawal.push({
            "reward": beddowsAsLsk(rdata[i].reward),
            "fees": beddowsAsLsk(rdata[i].fees),
            "txid_short": rdata[i].txid.slice(1, -10)+"...",
            "txid": rdata[i].txid,
            "date": d,
            "explorer_url": getExplorer("transaction/"+rdata[i].txid)
          });
        }
      }

      res.render('voter-stats', data);
    })
    .catch(error => {
      data.message = error.message
      log("ERR", error.message || error);
      res.render('error', data)
    });
  })
  .catch(error => {
    data.message = error.message
    log("ERR", error.message || error);
    res.render('error', data)
  });
});

//AJAX: get balance history
router.get('/aget_balance', function(req, res){
  if(req.xhr){
    pool.db.any("SELECT voter_id, balance, timestamp FROM balance_history WHERE voter_id='"+data.id+"'")
    .then(rdata => {
      const data = rdata.map(function(item) { return [parseFloat(item['timestamp']), beddowsAsLsk(item['balance'], true)]});
      res.send(data);
    });
  } else {
    data.MAINMENU = menuBuilder(req.baseUrl);
    data.message = 'Is not Ajax request!';

    res.render('error', data);
  }
})

module.exports = router;