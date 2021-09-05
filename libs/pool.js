const { getAPI, lskAsBeddows, beddowsAsLsk, log, voteCheck, clearVoteList } = require('./helpers');
const config = require('../config.json');
const request = require('request');
const pgp = require("pg-promise")();
const got = require('got');

function Pool(){
  const _this = this;

  //Connet to PostgesDB
  this.db = pgp("postgres://"+config.db.dbuser+":"+config.db.dbpass+"@"+config.db.dbhost+":"+config.db.dbport+"/"+config.db.dbname);

  //Other
  this.last_block = 0;
  this.next_block = 0;

  //Load config
  this.config = config;

  //Static data
  this.address = config.delegate.address;
  this.name = '';
  this.balance = 0;
  this.selfVote = 0;
  this.totalVote = 0;
  this.votesCount = 0;

  //Dynamic data
  this.rank = 0;
  this.forgedblocks = 0;
  this.missedblocks = 0;
  this.productivity = 0;
  this.APIVoteList = [];

  //Get delegate data and base statistics
  if(config.delegate.address){
    this.getDelegateInfo(function(){
      _this.updatePoolFeesAddress();
      _this.updateVoters();
      _this.updatePoolStat();
      _this.updateBalances();
    });
  } else {
    log("INF", "Set delegate in 'config.json'")
  }
}

//Pool Processing
Pool.prototype.poolProcessing = function(){
  const _this = this;

  //Check new block every 5 second and update pool balance if forged new block
  setInterval(function(){
    _this.updateBalances();
  }, 5000);

  //Update pool statistic
  setInterval(function(){
    _this.getDelegateInfo(function(){
      _this.updatePoolStat();
      _this.updateVoters();
      _this.updateVoterBalanceHistory();
    });
  }, 60000);
}

//DB
//PoolFees
Pool.prototype.updatePoolFeesAddress = function(){
  const _this = this;
  var addAddrs = [];
  var poolfees_adr = config.pool.withdrawal_pool_fees;
  var old_balance = 0;

  if(poolfees_adr.length){
    //Get full fees balance from old addresses
    this.db.any("SELECT sum(balance) as sum FROM poolfees")
    .then(rdata => {
      //If not old balanses
      if(rdata.sum !== NaN && rdata.sum !== undefined){
        old_balance = rdata.sum;
      }

      //Remove old addresses
      _this.db.result('DELETE FROM poolfees')
      .then(rdata => {
        //Load poolfees addresses from config
        for(var i=0; i<poolfees_adr.length; i++){
          addAddrs.push({
            'address': poolfees_adr[i].address,
            'balance': old_balance * poolfees_adr[i].percent,
            'percent': poolfees_adr[i].percent
          });
        }

        //Update poolfees table
        _this.db.result(pgp.helpers.insert(addAddrs, ['address', 'balance', 'percent'], 'poolfees'))
        .then(rdata => {
          log("INF", "Add/Change fee addresses.");
        })
        .catch(error => {
          log("ERR", error.message || error);
        });
      });
    })
    .catch(error => {
      log("ERR", error.message || error);
    });
  } else {
    log("INF", "Pool-fee addresses not set in config.");
  }
}
//Update Voters list in db
Pool.prototype.updateVoters = function(){
  var _this = this;

  this.getDelegateVotes(function(APIVoteList){
    var voters_list = APIVoteList;
    
    var addVoters = [];
    var updVoters = [];
    var delVoters = [];

    var VotesWeight = _this.totalVote - _this.selfVote;
    var minVote = lskAsBeddows(config.pool.minvote);

    _this.db.any("SELECT * FROM voters")
    .then(rdata => {
      _this.votesCount = rdata.length;

      if(voters_list.length){
        if(rdata.length){
          for(var i=0; i < voters_list.length; i++){
            //Check if vote exist db or not
            let find = rdata.filter(x => x.address === voters_list[i].address);

            if(find.length){
              if(voteCheck(voters_list[i].amount)){
                //Update voter data
                updVoters.push({
                  "address": voters_list[i].address,
                  "vote": Number(voters_list[i].amount),
                  "username": voters_list[i].username,
                  "poolpercent": parseFloat((voters_list[i].amount / VotesWeight * 100).toFixed(2)),
                });
              } else {
                //Remove voter
                delVoters.push("DELETE FROM voters WHERE id="+find[0].id);
                _this.votesCount--;
              }
            } else {
              if(voteCheck(voters_list[i].amount)){
                addVoters.push({
                  'address': voters_list[i].address,
                  'username': voters_list[i].username,
                  'balance': Number(0),
                  'total': Number(0),
                  'vote': Number(voters_list[i].amount),
                  'poolpercent': parseFloat((voters_list[i].amount / VotesWeight * 100).toFixed(2)),
                  'active': true,
                  'status': 0
                });
                _this.votesCount++
              }
            }
          }
        } else {
          //First start, add all voters
          for(var i = 0; i < voters_list.length; i++){
            if(voteCheck(voters_list[i].amount)){
              addVoters.push({
                'address': voters_list[i].address,
                'username': voters_list[i].username,
                'balance': Number(0),
                'total': Number(0),
                'vote': Number(voters_list[i].amount),
                'poolpercent': parseFloat((voters_list[i].amount / VotesWeight * 100).toFixed(2)),
                'active': true,
                'status': 0,
              });

              _this.votesCount++;
            }
          }
        }

        //Update voters
        if(updVoters.length){
          _this.db.result(pgp.helpers.update(updVoters, ['?address', 'username', 'vote', 'poolpercent'], 'voters') + ' WHERE v.address = t.address')
          .then(rdata => {
            _this.updateVoterBalanceHistory();
            log("INF", "Updating voter's data.");
          })
          .catch(error => {
            log("ERR", "Update voters error: "+error.message || error);
          });
        }

        //Add voters
        if(addVoters.length){
          _this.db.result(pgp.helpers.insert(addVoters, ['address', 'username','balance', 'total', 'vote', 'poolpercent', 'active', 'status'], 'voters'))
          .then(rdata => {
            log("INF", "Adding new voter.");
          })
          .catch(error => {
            log("ERR", "Adding voters error: "+error.message || error);
          });
        }

        //Remove unvoted
        if(delVoters.length){
          _this.db.result(pgp.helpers.concat(delVoters))
          .then(rdata => {
            log("INF", "Remove unvoted.");
          })
          .catch(error => {
            log("ERR", "Remove voters error: "+error.message || error);
          });
        }
      }
    })
    .catch(error => {
      log("ERR", error.message || error);
    });
  });
}
//Update pool statistics
Pool.prototype.updatePoolStat = function(){
  var _this = this;

  if(this.votesCount){
    var pStats = {
      "rank": this.rank,
      "balance": this.balance,
      "vcount": this.votesCount,
      "total_vote": this.totalVote,
      "self_vote": this.selfVote,
      "timestamp": Date.now()
    };

    //Update pool statistics history
    this.db.result(pgp.helpers.insert(pStats, null, 'pool_history'))
    .then(rdata => {
      log("INF", "Updating pool statistics.");
    })
    .catch(error => {
      log("ERR", "Update pool statistics error: "+error.message || error);
    });
  }
}
//Update voters balance history
Pool.prototype.updateVoterBalanceHistory = function(){
  var _this = this;
  var vbHist = [];
              
  this.db.any("SELECT * FROM voters WHERE active=true")
  .then(rdata => {
    for(var i = 0; i < rdata.length; i++){
      vbHist.push({
        'voter_id': rdata[i].id,
        'balance': Number(rdata[i].balance),
        'timestamp': Date.now()
      });
    }

    _this.db.result(pgp.helpers.insert(vbHist, ['voter_id', 'balance', 'timestamp'], 'balance_history'))
    .then(rdata => {
      log("INF", "Updating voter's balance history");
    })
    .catch(error => {
      log("ERR", error.message || error);
    });
  })
  .catch(error => {
    log("ERR", error.message || error);
  });
}
//Update voters balance if get reward
Pool.prototype.updateBalances = function(){
  var _this = this;

  this.getLastForgedHeight(function(){
    if(_this.last_block < _this.next_block){
      _this.last_block = _this.next_block;

      request.get(getAPI("blocks?height="+_this.next_block), function (error, response, body) {
        if (!error && response.statusCode == 200) {
          var answ = JSON.parse(body),
              blockInfo = answ.data[0];

            //If new block forged
            if(blockInfo.generatorAddress == _this.address){
              var reward = blockInfo.totalForged;
              var pool_reward = Math.round(reward / 100 * config.pool.pool_fees);
              var voters_reward = reward - pool_reward;
             
              //Voter update    
              _this.db.any("SELECT * FROM voters WHERE active=true")
              .then(rdata => {
                var updData = [];

                //Update voter balance
                for(var i = 0; i < rdata.length; i++){
                  var bal = Number(rdata[i].balance) + Number(Math.round(voters_reward / 100 * rdata[i].poolpercent)),
                      total = Number(rdata[i].total) + Number(Math.round(voters_reward / 100 * rdata[i].poolpercent));

                  updData.push({
                    'id': rdata[i].id,
                    'balance': bal,
                    'total': total
                  });
                }

                if(updData.length){
                  _this.db.result(pgp.helpers.update(updData, ['?id', 'balance', 'total'], 'voters') + ' WHERE v.id = t.id')
                  .then(rdata => {
                    log("INF", "Pool forged a new block! Height: "+_this.last_block+" | Voter's reward: "+beddowsAsLsk(voters_reward));
                  })
                  .catch(error => {
                    log("ERR", error.message || error);
                  });
                }
              })
              .catch(error => {
                log("ERR", error.message || error);
              });

              //Pool update
              _this.db.any("SELECT * FROM poolfees")
              .then(rdata => {
                var updData = [];

                //Update pool fees balance
                for(var i = 0; i < rdata.length; i++){
                  var bal = Number(rdata[i].balance) + Number(Math.round(pool_reward / 100 * rdata[i].percent));

                  updData.push({
                    'id': rdata[i].id,
                    'balance': bal
                  });
                }

                if(updData.length){
                  _this.db.result(pgp.helpers.update(updData, ['?id', 'balance'], 'poolfees') + ' WHERE v.id = t.id')
                  .then(rdata => {
                    log("INF", "Pool forged a new block! Height: "+_this.last_block+" | Pool reward: "+beddowsAsLsk(pool_reward));
                  })
                  .catch(error => {
                    log("ERR", error.message || error);
                  });
                }
              })
              .catch(error => {
                log("ERR", error.message || error);
              });
            } else {
              log("INF", "Pool received new block. Height: "+_this.last_block);
            }
        } else {
          log("ERR", "Error to get data from API 'blocks?height"+_this.next_block+"'. API return: "+response.statusCode);
        }
      });
    }
  });
}

//API
//Get Delegate Info
Pool.prototype.getDelegateInfo = function(callback){
  var _this = this;

  request.get(getAPI("accounts?address="+this.address), function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var answ = JSON.parse(body);

      if(!answ.error){
        var data = answ.data[0];
        var account = data.summary;
        var delegate = data.dpos.delegate;

        //get data
        _this.balance = account.balance;
        _this.selfVote = data.dpos.sentVotes[0].amount;
        _this.totalVote = delegate.totalVotesReceived;
        _this.name = delegate.username;
       
        _this.forgedblocks = delegate.producedBlocks;
        _this.missedblocks = delegate.consecutiveMissedBlocks;
        _this.last_block = delegate.lastForgedHeight;
        _this.rank = delegate.rank;

        callback();
      } else {
        log("ERR", answ.message);
      }
    } else {
      log("ERR", "Error to get data from API 'accounts?address="+this.address+"'. API return: "+response.statusCode);
    }
  });
}
//Get Delegate Votes
Pool.prototype.getDelegateVotes = async (callback) => {
  try {
    const pageLimit = 100;
    let offcet = pageLimit;

    let res = await got(getAPI("votes_received?address="+config.delegate.address+"&limit="+pageLimit)).json();
    let pages = Math.ceil(res.data.account.votesReceived/pageLimit);
    let voteList = res.data.votes;

    if(pages>1){
      let mergeResult = [];
      for(let i=2; i<pages; i++){
        res = await got(getAPI("votes_received?address="+config.delegate.address+"&limit="+pageLimit+"&offset="+offcet)).json();
        voteList.push.apply(voteList, res.data.votes);
        offcet +=pageLimit;
      }
    }

    //Clear vote array
    const Votes = clearVoteList(voteList);

    callback(Votes);
  } catch(error) {
    log("ERR", error.response.body);
  }
}
//Get Last Forged Height
Pool.prototype.getLastForgedHeight = function(callback){
  var _this = this;

  request.get(getAPI("accounts?address="+this.address), function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var answ = JSON.parse(body);

      if(!answ.error){
        var data = answ.data[0];
        var delegate = data.dpos.delegate;

        _this.next_block = delegate.lastForgedHeight;

        callback();
      } else {
        log("ERR", answ.message);
      }
    } else {
      log("ERR", "Error to get data from API 'accounts?address="+this.address+"'. API return: "+response.statusCode);
    }
  });
}

module.exports = new Pool;