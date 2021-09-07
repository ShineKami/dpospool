//Load modules
const pgp = require("pg-promise")();
const LiskAPI = require("./LiskAPI.js");

//Config and helpers
const config = require('../config.json');
const { lskAsBeddows, beddowsAsLsk, log, voteCheck, getLocalVoteWeight } = require('./helpers');

class Pool {
  //Constructor
  constructor(){
    //Connet to PostgesDB
    this.db = pgp("postgres://"+config.db.dbuser+":"+config.db.dbpass+"@"+config.db.dbhost+":"+config.db.dbport+"/"+config.db.dbname);

    //Static data
    this.address = config.pool.delegateAddress;
    this.poolFees = config.pool.poolfees;
    this.poolFeesPayout = config.payouts.poolfees;
    this.minVote = config.pool.minVote;
    this.maxVote = config.pool.maxVote;
    this.showMore = config.pool.showmore;
    this.poolname = config.pool.name;
    this.network = config.blockchain.network;
    this.payTime = config.pool.withdrawal_time;
    this.payMin = config.payouts.mininal;

    //Dunamic data
    this.votesCount = 0;

    //Loger
    this.loger = log;

    //API
    this.api = new LiskAPI(config);
    
    //Init
    this.Init();
  }

  //Init
  Init(){
    if(this.address){
      this.api.getAccInfo()
      .then(res => {
        //Get delegate data
        this.name = res.summary.username;
        this.balance = Number(res.summary.balance);
        this.rank = res.dpos.delegate.rank;
        this.selfVote = Number(res.dpos.sentVotes[0].amount);
        this.totalVote = Number(res.dpos.delegate.totalVotesReceived);
        this.forgedblocks = res.dpos.delegate.forgedblocks;
        this.missedblocks = res.dpos.delegate.missedblocks;
        this.productivity = 100 - ((this.missedblocks/this.forgedblocks)*100);
        this.lastForgedHeight = res.dpos.delegate.lastForgedHeight;

        //Load stats
        this.updPoolFees();
        this.updVoters();

        //Start processing
        this.processing();
      })
      .catch(error => {
        this.loger("ERR", error);
      });
    } else {
      this.loger("ERR", "Check 'config.json' delegate address not set");
    }
  }

  //Pool data processing
  processing(){
    setInterval(() => {
      this.api.getAccInfo()
      .then(() => {
        this.distributeReward();
        this.updPoolStat();
        this.updVoters();
      });
    }, 60000);
  }

  //Distribute reward for all voters and pool 
  distributeReward(){
    this.api.getLastForgedHeight()
    .then(block => {
      if(this.lastForgedHeight < block.height){
        const reward = Number(block.reward);
        const poolReward = Math.round(reward / 100 * this.poolFees);
        const votersReward = reward - poolReward;
        this.lastForgedHeight = block.height;

        //Voters update balance    
        this.db.any("SELECT * FROM voters")
        .then(rdata => {
          let updData = [];

          if(rdata.length){
            for(var i = 0; i < rdata.length; i++){
              var bal = Number(rdata[i].balance) + Number(Math.round(votersReward / 100 * rdata[i].poolpercent)),
                  total = Number(rdata[i].total) + bal;

              updData.push({
                'id': rdata[i].id,
                'balance': bal,
                'total': total
              });
            }

            if(updData.length){
              this.db.result(pgp.helpers.update(updData, ['?id', 'balance', 'total'], 'voters') + ' WHERE v.id = t.id')
              .then(rdata => {
                this.loger("INF", "Pool forged a new block! Height: "+block.height+" | Voter's reward: "+beddowsAsLsk(votersReward));
              })
              .catch(error => {
                this.loger("ERR", error.message || error);
              });
            }
          }
        })
        .catch(error => {
          this.loger("ERR", error.message || error);
        });

        //Pool update balance
        this.db.any("SELECT * FROM poolfees")
        .then(rdata => {
          var updData = [];

          if(rdata.length){
            for(var i = 0; i < rdata.length; i++){
              var bal = Number(rdata[i].balance) + Number(Math.round(poolReward / 100 * rdata[i].percent));

              updData.push({
                'id': rdata[i].id,
                'balance': bal
              });
            }

            if(updData.length){
              this.db.result(pgp.helpers.update(updData, ['?id', 'balance'], 'poolfees') + ' WHERE v.id = t.id')
              .then(rdata => {
                this.loger("INF", "Pool forged a new block! Height: "+block.height+" | Pool reward: "+beddowsAsLsk(poolReward));
              })
              .catch(error => {
                this.loger("ERR", error.message || error);
              });
            }
          } else {
            this.loger("WAR", "Account for payouts poolfees not set!");
          }
        })
        .catch(error => {
          this.loger("ERR", error.message || error);
        });
      } else {
        this.loger("INF", "No new block. Height: "+block.height);
      }
    })
    .catch(error => {
      this.loger("ERR", error);
    });
  }

  //##POOL##//
  //Update pool fees payouts
  updPoolFees(){
    const poolfeesList = this.poolFeesPayout;
    let addAddrs = [];
    let oldBalance = 0;

    if(poolfeesList.length){
      //Get full fees balance from old addresses
      this.db.any("SELECT sum(balance) as sum FROM poolfees")
      .then(rdata => {
        //If not old balanses
        if(rdata.sum !== NaN && rdata.sum !== undefined){
          oldBalance = Number(rdata.sum);
        }

        //Remove old addresses
        this.db.result('DELETE FROM poolfees')
        .then(rdata => {
          //Load poolfees addresses from config
          for(let i=0; i<poolfeesList.length; i++){
            if(poolfeesList[i].address && Number(poolfeesList[i].percent)>0){
              addAddrs.push({
                'address': poolfeesList[i].address,
                'balance': Number(oldBalance * poolfeesList[i].percent / 100),
                'percent': poolfeesList[i].percent
              });
            }
          }

          //Update poolfees table
          if(addAddrs.length){
            this.db.result(pgp.helpers.insert(addAddrs, ['address', 'balance', 'percent'], 'poolfees'))
            .then(rdata => {
              this.loger("INF", "Add/Change fee addresses.");
            })
            .catch(error => {
              this.loger("ERR", error.message || error);
            });
          } else {
            this.loger("WAR", "Poolfees address set not correct in config. Missed 'address' or 'percent'!");  
          }
        });
      })
      .catch(error => {
        this.loger("ERR", error.message || error);
      });
    } else {
      this.loger("WAR", "Poolfees address not set in config!");
    }
  }
  //Update pool statistic
  updPoolStat(){
    if(this.votesCount){
      const pStats = {
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
        this.loger("INF", "Updating pool statistics.");
      })
      .catch(error => {
        this.loger("ERR", "Update pool statistics error: "+error.message || error);
      });
    }
  }

  //##VOTERS##//
  //Update voters list
  updVoters(){
    let addVoters = [];
    let updVoters = [];
    let delVoters = [];

    this.api.getVotesList()
    .then(res => {
      const voteWeight = getLocalVoteWeight(res);

      this.db.any("SELECT * FROM voters")
      .then(rdata => {
        this.votesCount = rdata.length;
        if(res.length){
          if(rdata.length){
            for(var i=0; i < res.length; i++){
              //Check if vote exist db or not
              let find = rdata.filter(x => x.address === res[i].address);

              if(find.length){;
                if(voteCheck(res[i])){
                  //Update voter data
                  updVoters.push({
                    "address": res[i].address,
                    "vote": Number(res[i].amount),
                    "username": res[i].username,
                    "poolpercent": parseFloat((res[i].amount / voteWeight * 100).toFixed(2)),
                  });
                } else {
                  //Remove voter
                  delVoters.push("DELETE FROM voters WHERE id="+find[0].id);
                  this.votesCount--;
                }
              } else {
                if(voteCheck(res[i])){
                  addVoters.push({
                    'address': res[i].address,
                    'username': res[i].username,
                    'balance': Number(0),
                    'total': Number(0),
                    'vote': Number(res[i].amount),
                    'poolpercent': parseFloat((res[i].amount / voteWeight * 100).toFixed(2)),
                    'active': true,
                    'status': 0
                  });
                  this.votesCount++
                }
              }
            }
          } else {
            //First start, add all voters
            for(var i = 0; i < res.length; i++){
              if(voteCheck(res[i])){
                addVoters.push({
                  'address': res[i].address,
                  'username': res[i].username,
                  'balance': Number(0),
                  'total': Number(0),
                  'vote': Number(res[i].amount),
                  'poolpercent': parseFloat((res[i].amount / voteWeight * 100).toFixed(2)),
                  'active': true,
                  'status': 0,
                });

                this.votesCount++;
              }
            }
          }

          //Update voters
          if(updVoters.length){
            this.db.result(pgp.helpers.update(updVoters, ['?address', 'username', 'vote', 'poolpercent'], 'voters') + ' WHERE v.address = t.address')
            .then(rdata => {
              this.loger("INF", "Updating voter's data.");
            })
            .catch(error => {
              this.loger("ERR", "Update voters error: "+error.message || error);
            });
          }

          //Add voters
          if(addVoters.length){
            this.db.result(pgp.helpers.insert(addVoters, ['address', 'username','balance', 'total', 'vote', 'poolpercent', 'active', 'status'], 'voters'))
            .then(rdata => {
              this.loger("INF", "Adding new voter.");
            })
            .catch(error => {
              this.loger("ERR", "Adding voters error: "+error.message || error);
            });
          }

          //Remove unvoted
          if(delVoters.length){
            this.db.result(pgp.helpers.concat(delVoters))
            .then(rdata => {
              this.loger("INF", "Remove inappropriate votes.");
            })
            .catch(error => {
              this.loger("ERR", "Remove voters error: "+error.message || error);
            });
          }

          this.updVotersStats()
        }
      })
      .catch(error => {
        this.loger("ERR", error.message || error);
      });
    })
    .catch(error => {
      this.loger("ERR", error);
    });
  }
  //Update voters statistic
  updVotersStats(){
    this.db.any("SELECT * FROM voters")
    .then(rdata => {
      let vbHist = [];

      if(rdata.length){
        for(var i = 0; i < rdata.length; i++){
          vbHist.push({
            'voter_id': rdata[i].id,
            'balance': Number(rdata[i].balance),
            'timestamp': Date.now()
          });
        }

        this.db.result(pgp.helpers.insert(vbHist, ['voter_id', 'balance', 'timestamp'], 'balance_history'))
        .then(rdata => {
          this.loger("INF", "Updating voter's balance history");
        })
        .catch(error => {
          this.loger("ERR", error.message || error);
        });
      }
    })
    .catch(error => {
      this.loger("ERR", error.message || error);
    });
  }
}

module.exports = new Pool;