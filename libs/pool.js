var config = require('../config.json');
var request = require('request');
var pgp = require("pg-promise")();

function Pool(){
  var _this = this;

  //Other
  this.last_block = 0;

  //Load config
  this.config = config;

  //Delegate data
  this.address = config.delegate.address;
  this.publicKey = null;
  this.username = null;
  this.balance = null;
  this.voters = null;
  this.forgedblocks = null;
  this.missedblocks = null;
  this.productivity = null;
  this.rate = null;
  this.approval = null;
  this.total_lskvote = null;
  this.voters = null;

  //Connet to PostgesDB
  this.db = pgp("postgres://"+config.db.dbuser+":"+config.db.dbpass+"@"+config.db.dbhost+":"+config.db.dbport+"/"+config.db.dbname);

  //Get delegate data and base statistics
  this.get_delegateInfo(function(){
    _this.updatePoolFeesAddress();
    _this.updateVoters();
    _this.updatePoolStat();
    _this.updateBalances();
  });
}

/*###Processing and auto-update functions###*/
//Global Pool Processing
Pool.prototype.poolProcessing = function(){
  var _this = this;

  //Check new block every second and update pool balance if forged new block
  setInterval(function(){
    _this.updateBalances();
  }, 1000);

  //Update pool statistic
  setInterval(function(){
    _this.get_delegateInfo(function(){
      _this.updatePoolStat();
      _this.updateVoters();
      _this.updateVoterBalanceHistory();
    });
  }, 60000);

  //Payout pool balance to voter and fees addresses
  setInterval(function(){
    _this.get_delegateInfo(function(){
      _this.Withdrawal();
    });
  }, config.pool.withdrawal_time * 1000);
}
//Update pool statistics
Pool.prototype.updatePoolStat = function(){
  var _this = this;

  var pStats = {
    "approval": _this.approval,
    "rank": _this.rate,
    "balance": _this.lsk_convert(_this.balance),
    "vcount": _this.voters.length,
    "timestamp": Date.now()
  };

  //Update pool statistics history
  _this.db.result(pgp.helpers.insert(pStats, null, 'pool_history'))
  .then(rdata => {
    _this.log("INF", "Updating pool statistics.");
  })
  .catch(error => {
    _this.log("ERR", error.message || error);
  });
}
//Update Voters list in db
Pool.prototype.updateVoters = function(){
  var _this = this;
  var voter_list = _this.voters;
  var addVoters = [];
  var updVoters = [];

  _this.db.any("SELECT * FROM voters")
  .then(res => {
    if(voter_list.length){
      if(res.length){
        //Change voter status
        for(var i = 0; i < res.length; i++){
          var voter_exist = _this.find_voter(voter_list, res[i].address, "address");

          if(!voter_exist){
            updVoters.push({
              'id': res[i].id,
              'active': false,
              'status': 1
            });
          } else {
            if(_this.lsk_convert(voter_list[i].balance) <= config.pool.minvote){
              updVoters.push({
                'id': res[i].id,
                'active': false,
                'status': 2
              });
            } else {
              updVoters.push({
                'id': res[i].id,
                'active': true,
                'status': 0
              });
            }
          }
        }

        //Add new active voters
        for(var i = 0; i < voter_list.length; i++){
          var voter_exist = _this.find_voter(res, voter_list[i].address, "address");

          if(!voter_exist){
            var voter = {
              'address': voter_list[i].address,
              'balance': 0,
              'total': 0,
              'poolpercent': parseFloat((voter_list[i].balance / _this.total_lskvote * 100).toFixed(4)),
              'active': true,
              'status': 0,
            }

            if(_this.lsk_convert(voter_list[i].balance) <= config.pool.minvote){
              voter.active = false;
              voter.status = 2;
            }

            addVoters.push(voter);
          }
        }
      } else {
        //First start, add all voters
        for(var i = 0; i < voter_list.length; i++){
          var voter = {
            'address': voter_list[i].address,
            'balance': 0,
            'total': 0,
            'poolpercent': parseFloat((voter_list[i].balance / _this.total_lskvote * 100).toFixed(4)),
            'active': true,
            'status': 0,
          }

          if(_this.lsk_convert(voter_list[i].balance) <= config.pool.minvote){
            voter.active = false;
            voter.status = 2;
          }

          addVoters.push(voter);
        }
      }

      //Update voters status
      if(updVoters.length){
        _this.db.result(pgp.helpers.update(updVoters, ['?id', 'active', 'status'], 'voters') + ' WHERE v.id = t.id')
        .then(rdata => {
          _this.log("INF", "Updating voter's status.");
        })
        .catch(error => {
          _this.log("ERR", error.message || error);
        });
      }

      //Add active voters in db
      if(addVoters.length){
        _this.db.result(pgp.helpers.insert(addVoters, ['address', 'balance', 'total', 'poolpercent', 'active', 'status'], 'voters'))
        .then(rdata => {
          _this.updateVoterBalanceHistory();
          _this.log("INF", "Adding new voters.");
        })
        .catch(error => {
          _this.log("ERR", error.message || error);
        });
      }
    }
  })
  .catch(error => {
    _this.log("ERR", error.message || error);
  });
}
//Update voters balance history
Pool.prototype.updateVoterBalanceHistory = function(){
  var _this = this;
  var vbHist = [];
              
  _this.db.any("select * from voters")
  .then(rdata => {
    for(var i = 0; i < rdata.length; i++){
      vbHist.push({
        'voter_id': rdata[i].id,
        'balance': rdata[i].balance,
        'timestamp': Date.now()
      });
    }

    _this.db.result(pgp.helpers.insert(vbHist, ['voter_id', 'balance', 'timestamp'], 'balance_history'))
    .then(rdata => {
      _this.log("INF", "Updating voter's balance history");
    })
    .catch(error => {
      _this.log("ERR", error.message || error);
    });
  })
  .catch(error => {
    _this.log("ERR", error.message || error);
  });
}
//Update voters balance if get reward
Pool.prototype.updateBalances = function(){
  var _this = this;

  request.get(_this.get_api("blocks", "getHeight"), function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var answ = JSON.parse(body);
      
      if(answ.success){
        if(_this.last_block < answ.height){
          _this.last_block = answ.height;

          request.get(_this.get_api("blocks?height="+answ.height, null), function (error, response, body) {
            if (!error && response.statusCode == 200) {
              var answ = JSON.parse(body);

              if(answ.success){
                if(answ.count > 0){
                  var block = answ.blocks[0],
                      reward = block.totalForged,
                      pool_reward = 0,
                      voters_reward = 0;

                  //If new block forged
                  if(block.generatorId == config.delegate.address){
                    var pool_reward = reward / 100 * config.pool.pool_fees;
                    var voters_reward = reward - pool_reward;
                   
                    //Voter update    
                    _this.db.any("SELECT * FROM voters WHERE active = 'true'")
                    .then(rdata => {
                      var updData = [];

                      //Update voter balance
                      for(var i = 0; i < rdata.length; i++){
                        var bal = rdata[i].balance + (_this.lsk_convert(voters_reward) / 100 * rdata[i].poolpercent),
                            total = rdata[i].total + (_this.lsk_convert(voters_reward) / 100 * rdata[i].poolpercent);

                        updData.push({
                          'id': rdata[i].id,
                          'balance': parseFloat(bal.toFixed(8)),
                          'total': parseFloat(total.toFixed(8))
                        });
                      }

                      if(updData.length){
                        _this.db.result(pgp.helpers.update(updData, ['?id', 'balance', 'total'], 'voters') + ' WHERE v.id = t.id')
                        .then(rdata => {
                          _this.log("INF", "Pool forged a new block! Height: "+_this.last_block+" | Voter's reward: "+_this.lsk_convert(voters_reward).toFixed(8));
                        })
                        .catch(error => {
                          _this.log("ERR", error.message || error);
                        });
                      }
                    })
                    .catch(error => {
                      _this.log("ERR", error.message || error);
                    });

                    //Pool update
                    _this.db.any("SELECT * FROM poolfees")
                    .then(rdata => {
                      var updData = [];

                      //Update pool fees balance
                      for(var i = 0; i < rdata.length; i++){
                        var bal = rdata[i].balance + (_this.lsk_convert(pool_reward) / 100 * rdata[i].percent);

                        updData.push({
                          'id': rdata[i].id,
                          'balance': parseFloat(bal.toFixed(8))
                        });
                      }

                      if(updData.length){
                        _this.db.result(pgp.helpers.update(updData, ['?id', 'balance'], 'poolfees') + ' WHERE v.id = t.id')
                        .then(rdata => {
                          _this.log("INF", "Pool forged a new block! Height: "+_this.last_block+" | Pool reward: "+_this.lsk_convert(pool_reward).toFixed(8));
                        })
                        .catch(error => {
                          _this.log("ERR", error.message || error);
                        });
                      }
                    })
                    .catch(error => {
                      _this.log("ERR", error.message || error);
                    });
                  } else {
                    _this.log("INF", "Pool received new block. Height: "+_this.last_block);
                  }
                }
              } else {
                _this.log("ERR", answ.error);
              }
            } else {
              _this.log("ERR", error.syscall+" "+error.code+" "+error.address+":"+error.port);
            }
          });
        }
      } else {
        _this.log("ERR", answ.error);
      }
    } else {
      _this.log("ERR", error.syscall+" "+error.code+" "+error.address+":"+error.port);
    }
  });
}
//Withdrawal
Pool.prototype.Withdrawal = function(){
  var _this = this,
      fees = config.pool.network_fees / 100 * 0.1;

  //Withdrawal voter balance
  _this.db.any("SELECT * FROM voters WHERE active = 'true' AND balance > "+config.pool.withdrawal_min)
  .then(rdata => {
    if(rdata.length){
      for(var i = 0; i < rdata.length; i++){
        //Send request with delay 3 sec
        (function(pdata) {
          setTimeout(function(){
            request({
              uri: _this.get_api('transactions', null),
              method: 'PUT',
              json: {
                "secret": config.delegate.passwrd1,
                "secondSecret": config.delegate.passwrd2,
                "amount": parseInt((pdata.balance - fees) * Math.pow(10, 8)),
                "recipientId": pdata.address,
                "publicKey": "",
              }
            }, function (error, response, body) {
              if (!error && response.statusCode == 200) {
                var answ = JSON.parse(JSON.stringify(body));

                if(answ.success){
                  //Update voter balance
                  _this.db.result(pgp.helpers.update(
                    {'balance': 0},
                    ['balance'], 'voters'
                    ) + ' WHERE "id" = '+pdata.id
                  )
                  .then(rdata => {
                    _this.log("INF", "Payout time: Withdrawing pool balance to voter address. TXID: "+answ.transactionId);
                  })
                  .catch(error => {
                    _this.log("ERR", error.message || error);
                  });

                  //Update withdrawal history
                  _this.db.result(pgp.helpers.insert(
                    {
                      "voter_id": pdata.id,
                      "reward": parseFloat((pdata.balance - fees).toFixed(8)),
                      "fees": fees,
                      "txid": answ.transactionId,
                      "timestamp": Date.now()
                    },
                    ['voter_id', 'reward', 'fees', 'txid', 'timestamp'],
                    'withdrawal_history')
                  )
                  .then(resd => {
                    _this.log("INF", "Payout time: Updating payout history.");
                  })
                  .catch(error => {
                    _this.log("ERR", error.message || error);
                  });
                } else {
                  _this.log("ERR", "Transaction not sent: "+answ);
                }
              } else {
                _this.log("ERR", error.syscall+" "+error.code+" "+error.address+":"+error.port);
              }
            });
          }, config.pool.withdrawal_tx_delay);
        })(rdata[i]);
      }
    } else {
      _this.log("INF", "Payout time: No voter balances matching minimum withdrawal amount!");
    }
  })
  .catch(error => {
    _this.log("ERR", error.message || error);
  });

  //Withdrawal poolfees balance
  _this.db.any("SELECT * FROM poolfees WHERE balance > "+config.pool.withdrawal_min)
  .then(rdata => {
    if(rdata.length){
      for(var i = 0; i < rdata.length; i++){
        //Send request with delay 3 sec
        (function(pdata) {
          setTimeout(function(){
            request({
              uri: _this.get_api('transactions', null),
              method: 'PUT',
              json: {
                "secret": config.delegate.passwrd1,
                "secondSecret": config.delegate.passwrd2,
                "amount": parseInt((pdata.balance - fees) * Math.pow(10, 8)),
                "recipientId": pdata.address,
                "publicKey": "",
              }
            }, function (error, response, body) {
              if (!error && response.statusCode == 200) {
                var answ = JSON.parse(JSON.stringify(body));

                if(answ.success){
                  //Update poolfees balance
                  _this.db.result(pgp.helpers.update(
                    {'balance': 0},
                    ['balance'], 'poolfees'
                    ) + ' WHERE "id" = '+pdata.id
                  )
                  .then(rdata => {
                    _this.log("INF", "Payout time: Withdrawing pool balance to pool-fee address. TXID: "+answ.transactionId);
                  })
                  .catch(error => {
                    _this.log("ERR", error.message || error);
                  });
                } else {
                  _this.log("ERR", "Transaction not sent: "+answ);
                }
              } else {
                _this.log("ERR", error.syscall+" "+error.code+" "+error.address+":"+error.port);
              }
            });
          }, config.pool.withdrawal_tx_delay);
        })(rdata[i]);
      }
    } else {
      _this.log("INF", "Payout time: Pool-fee balance does not match minimum withdrawal amount!");
    }
  })
  .catch(error => {
    _this.log("ERR", error.message || error);
  });
}
//PoolFees
Pool.prototype.updatePoolFeesAddress = function(){
  var _this = this,
      addAddrs = [],
      poolfees_adr = config.pool.withdrawal_pool_fees,
      old_balance = 0;

  if(poolfees_adr.length){
    //Get full fees balance from old addresses
    _this.db.any("SELECT sum(balance) as sum FROM poolfees")
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
          _this.log("INF", "Add/Change fee addresses.");
        })
        .catch(error => {
        _this.log("ERR", error.message || error);
        });
      });
    })
    .catch(error => {
      _this.log("ERR", error.message || error);
    });
  } else {
    _this.log("INF", "Pool-fee addresses not set in config.");
  }
}

/*###Common functions###*/
//Find item in array of object
Pool.prototype.find_voter = function(myArray, searchTerm, property){
  for(var i = 0; i < myArray.length; i++) {
    if (myArray[i][property] === searchTerm) {
      return true;
    }
  }

  return false;
}
//Get api url
Pool.prototype.get_api = function(method, param){
  var url = config.node.protocol + "://"+ config.node.host +":"+ config.node.port +"/api/";

  if(param != null){
    return url+method+"/"+param;
  } else {
    return url+method;
  }
}
//Get explorer url(mainnet/testnet)
Pool.prototype.get_explorer = function(address, method){
  if(method){
    method = method;
  } else {
    method = "address";
  }

  if(config.node.network == "mainnet"){
    return "https://explorer.lisk.io/"+method+"/"+address;
  } else {
    return "https://testnet-explorer.lisk.io/"+method+"/"+address;
  }
}
//Convert int lsk to float
Pool.prototype.lsk_convert = function(num){
  //#
  return num * Math.pow(10, -8);
}
//Menu builder
Pool.prototype.build_menu = function(url_param){
  var menu = '';

  //Home
  if(url_param === ''){
    menu += '<li class="active"><a href="/" title="Home">Home</a></li>';
  } else {
    menu += '<li><a href="/" title="Home">Home</a></li>';
  }

  //Pool statistics
  if(url_param === '/pool-stats'){
    menu += '<li class="active"><a href="/pool-stats" title="Pool statistics">Pool statistics</a></li>';
  } else {
    menu += '<li><a href="/pool-stats" title="Pool statistics">Pool statistics</a></li>';
  }

  //Open statistic
  if(url_param === '/voter-stats'){
    menu += '<li class="active"><a href="/voter-stats" title="Voter statistics">Voter statistics</a></li>';
  } else {
    menu += '<li><a href="/voter-stats" title="Voter statistics">Voter statistics</a></li>';
  }

  //Pool charts
  if(url_param === '/charts'){
    menu += '<li class="active"><a href="/charts" title="Charts">Charts</a></li>';
  } else {
    menu += '<li><a href="/charts" title="Charts">Charts</a></li>';
  }

  return menu;
}
//Get Delegate Info
Pool.prototype.get_delegateInfo = function(callback){
  var _this = this;

  request.get(_this.get_api("accounts?address="+_this.address, null), function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var answ = JSON.parse(body);

      if(answ.success){
        var account = answ.account;

        //Set data
        _this.balance = account.balance;
        _this.publicKey = account.publicKey;

        request.get(_this.get_api("delegates", "get?publicKey="+_this.publicKey), function (error, response, body) {
          if (!error && response.statusCode == 200) {
            var answ = JSON.parse(body);

            if(answ.success){
              var delegate = answ.delegate;

              //Set data
              _this.username = delegate.username;
              _this.forgedblocks = delegate.producedblocks - delegate.missedblocks;
              _this.missedblocks = delegate.missedblocks;
              _this.productivity = delegate.productivity;
              _this.rate = delegate.rate;
              _this.approval = delegate.approval;
              _this.total_lskvote = delegate.vote;

              request.get(_this.get_api("delegates", "voters?publicKey="+_this.publicKey), function (error, response, body) {
                if (!error && response.statusCode == 200) {
                  var answ = JSON.parse(body);

                  if(answ.success){
                    _this.voters = answ.accounts;

                    //Callback function
                    if (callback) {
                      callback();
                    }
                  } else {
                    _this.log("ERR", answ.error);
                  }
                } else {
                  _this.log("ERR", error.syscall+" "+error.code+" "+error.address+":"+error.port);
                }
              });
            } else {
              _this.log("ERR", answ.error);
            }
          } else  {
            _this.log("ERR", error.syscall+" "+error.code+" "+error.address+":"+error.port);
          }
        });
      } else {
        _this.log("ERR", answ.error);
      }
    } else {
      _this.log("ERR", error.syscall+" "+error.code+" "+error.address+":"+error.port);
    }
  });
}
//Log
Pool.prototype.log = function(type, message){
  var d = new Date();
  var curr_date = ("0" + d.getDate()).slice(-2);
  var curr_month = ("0" + (d.getMonth() + 1)).slice(-2);
  var curr_year = d.getFullYear();
  var curr_hours = ("0" + d.getHours()).slice(-2);
  var curr_minutes = ("0" + d.getMinutes()).slice(-2);
  var curr_second = ("0" + d.getSeconds()).slice(-2);

  console.log("["+type+"] "+curr_date+"."+curr_month+"."+curr_year+" "+curr_hours+":"+curr_minutes+":"+curr_second+" |", message);
}

module.exports = new Pool;
