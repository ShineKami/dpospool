//Init modules
const express = require('express');
const request = require('request');
const router = express.Router();
const pool = require('../libs/pool.js');
const { beddowsAsLsk, menuBuilder, getExplorer, log } = require('../libs/helpers.js')

//Init config
var config = pool.config;
var network = config.blockchainApp.network;

//Page tags
var data = {
  "TITLE": config.pool.name,
  "network": network.exist[network.active].name
};

//Showmore
var voters_num = 0;

//Main
router.get('/', function(req, res, next) {
  var voters_reward = [],
      voters_list = []; 

  //Set tags
  data.MAINMENU = menuBuilder(req.baseUrl);
  data.address = pool.address;
  data.balance = beddowsAsLsk(pool.balance);
  data.explorer_url = getExplorer(pool.address);
  data.forgedblocks = pool.forgedblocks;
  data.missedblocks = pool.missedblocks;
  data.username = pool.name;
  data.rank = pool.rank;
  data.voters_count = pool.votesCount;
  data.total_lskvote = pool.totalVote;
  data.total_support = beddowsAsLsk(pool.totalVote);
  data.self_vote = beddowsAsLsk(pool.selfVote);
  data.vote_cap = (100 - (pool.totalVote / (pool.selfVote * 10) * 100)).toFixed(2);

  if(pool.missedblocks>0){
    data.productivity = Number((100 - (pool.missedblocks/pool.forgedblocks * 100)).toFixed(2));
  } else {
    data.productivity = 100;
  }

  //Voters List
  pool.db.any("SELECT * FROM voters WHERE active=true ORDER BY vote DESC LIMIT "+config.pool.showmore)
  .then(rdata => {
    for(var i=0; i<rdata.length; i++){
      if(rdata[i].username == null){
        rdata[i].username = "N/A";
        rdata[i].icon = "l-icon";
      }

      voters_list.push({
        "address": rdata[i].address,
        "vote": beddowsAsLsk(rdata[i].vote),
        "pool_percent": (rdata[i].poolpercent).toLocaleString(),
        "username": rdata[i].username,
        "explorer_url": getExplorer('account/'+rdata[i].address),
        "icon": rdata[i].icon
      });
      voters_reward.push({
        "address": rdata[i].address,
        "balance": beddowsAsLsk(rdata[i].balance),
        "total": beddowsAsLsk(rdata[i].total),
        "icon": rdata[i].icon
      });
    }

    if(pool.votesCount > config.pool.showmore){
      data.showmore = true;
    }

    data.voters_list = voters_list;
    data.voters_reward = voters_reward;
    res.render('pool-stats', data);
  })
  .catch(error => {
    log("ERR", error.message || error);
    data.message = error.message;
    res.render('error', data);
  });
});

//AJAX: Active voters list
router.get('/aget_voters/:num', function(req, res) {
  if(req.xhr){
    var si_count = req.params.num,
        si_count_next = parseInt(si_count) + parseInt(config.pool.showmore),
        end = false;

    if(si_count_next >= pool.votesCount){
      end = true;
    }

    //Voters List
    pool.db.any("SELECT * FROM voters WHERE active=true ORDER BY vote DESC OFFSET "+si_count+" LIMIT "+config.pool.showmore)
    .then(rdata => {
      var voters_list = [];

      for(var i=0; i<rdata.length; i++){
        if(rdata[i].username == null){
          rdata[i].username = "N/A";
          rdata[i].icon = "l-icon";
        }

        voters_list.push({
          "address": rdata[i].address,
          "vote": beddowsAsLsk(rdata[i].vote),
          "pool_percent": (rdata[i].poolpercent).toLocaleString(),
          "username": rdata[i].username,
          "explorer_url": getExplorer("account/"+rdata[i].address),
          "icon": rdata[i].icon
        });
      }

      res.json({
        "voters": voters_list,
        "end": end
      });
    })
    .catch(error => {
      log("ERR", error.message || error);
    });
  } else {
    res.render('error', {
      "message": "Is not Ajax request!"
    });
  }
});

//AJAX: Reward voters list
router.get('/aget_reward/:num', function(req, res) {
  if(req.xhr){
    var si_count = req.params.num,
        si_count_next = parseInt(si_count) + parseInt(config.pool.showmore),
        end = false;

    if(si_count_next >= pool.votesCount){
      end = true;
    }

    //Voters Reward
    pool.db.any("SELECT * FROM voters WHERE active=true ORDER BY vote DESC OFFSET "+si_count+" LIMIT "+config.pool.showmore)
    .then(rdata => {
      var voters_reward = [];

      for(var i=0; i<rdata.length; i++){
        if(rdata[i].username == null){
          rdata[i].icon = "l-icon";
        }

        voters_reward.push({
          "address": rdata[i].address,
          "balance": beddowsAsLsk(rdata[i].balance),
          "total": beddowsAsLsk(rdata[i].total),
          "icon": rdata[i].icon
        });
      }

      res.json({
        "voters": voters_reward,
        "end": end
      });
    })
    .catch(error => {
      log("ERR", error.message || error);
    });
  } else {
    res.render('error', {
      "message": "Is not Ajax request!"
    });
  }
});

module.exports = router;