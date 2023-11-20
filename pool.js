//Load modules
const pgp = require("pg-promise")();
const LiskAPI = require("./LiskAPI.js");

//Config and helpers
const config = require('../config.json');
const { lskAsBeddows, beddowsAsLsk, log, voteCheck, getLocalVoteWeight, clearVoteList } = require('./helpers');

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
		this.payTime = config.pool.paytime;
		this.payMin = config.payouts.minpay;

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
				this.name = res.username;
				this.balance = Number(res.balance);
				this.rank = res.rank;
				this.selfVote = Number(res.selfVote);
				this.totalVote = Number(res.totalVote);
				this.lastForgedHeight = res.lastForgedHeight;

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
			.then(res => {
				this.balance = Number(res.balance);
				this.rank = res.rank;
				this.selfVote = Number(res.selfVote);
				this.totalVote = Number(res.totalVote);

				this.distributeReward();
				this.updPoolStat();
				this.updVoters();
				this.updVotersStats();
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
				this.db.any("SELECT * FROM voters WHERE active=true")
				.then(rdata => {
					let updData = [];

					if(rdata.length){
						for(var i = 0; i < rdata.length; i++){
							var bal = Number(rdata[i].balance) + Number(Math.round(votersReward / 100 * rdata[i].poolpercent)),
									total = Number(rdata[i].total) + Number(Math.round(votersReward / 100 * rdata[i].poolpercent));

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
			this.loger("ERR", error.message);
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
			this.db.any("SELECT sum(balance) as total FROM poolfees")
			.then(rdata => {
				//If not old balanses
				if(rdata[0].total !== NaN && rdata[0].total !== undefined){
					oldBalance = Number(rdata[0].total);
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
			const clrVoteList = clearVoteList(res);
			const voteWeight = getLocalVoteWeight(clrVoteList);

			this.db.any("SELECT * FROM voters")
			.then(rdata => {
				this.votesCount = rdata.length;

				if(clrVoteList.length){
					if(rdata.length){
						let dbVoteList = [];
						//Remove unvoted
						for(var i=0; i < rdata.length; i++){
							let find = clrVoteList.filter(x => x.address === rdata[i].address);
							if(find.length){
								dbVoteList.push(rdata[i]);
							} else {
								delVoters.push({
									"address": rdata[i].address,
									"active": false
								});
								this.votesCount--;
							}
						}

						for(var i=0; i < clrVoteList.length; i++){
							//Check if vote exist db or not
							let find = dbVoteList.filter(x => x.address === clrVoteList[i].address);

							if(find.length){;
								if(voteCheck(clrVoteList[i])){
									//Update voter data
									updVoters.push({
										"address": clrVoteList[i].address,
										"vote": Number(clrVoteList[i].amount),
										"username": clrVoteList[i].username,
										"poolpercent": parseFloat((clrVoteList[i].amount / voteWeight * 100).toFixed(2)),
										"active": true
									});
								} else {
									//Remove voter
									delVoters.push({
										"address": clrVoteList[i].address,
										"active": false
									});
									this.votesCount--;
								}
							} else {
								if(voteCheck(clrVoteList[i])){
									addVoters.push({
										'address': clrVoteList[i].address,
										'username': clrVoteList[i].username,
										'balance': Number(0),
										'total': Number(0),
										'vote': Number(clrVoteList[i].amount),
										'poolpercent': parseFloat((clrVoteList[i].amount / voteWeight * 100).toFixed(2)),
										'active': true,
										'status': 0
									});
									this.votesCount++
								}
							}
						}
					} else {
						//First start, add all voters
						for(var i = 0; i < clrVoteList.length; i++){
							if(voteCheck(clrVoteList[i])){
								addVoters.push({
									'address': clrVoteList[i].address,
									'username': clrVoteList[i].username,
									'balance': Number(0),
									'total': Number(0),
									'vote': Number(clrVoteList[i].amount),
									'poolpercent': parseFloat((clrVoteList[i].amount / voteWeight * 100).toFixed(2)),
									'active': true,
									'status': 0,
								});

								this.votesCount++;
							}
						}
					}

					//Update voters
					if(updVoters.length){
						this.db.result(pgp.helpers.update(updVoters, ['?address', 'username', 'vote', 'poolpercent', 'active'], 'voters') + ' WHERE v.address = t.address')
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
						this.db.result(pgp.helpers.update(delVoters, ['?address', 'active'], 'voters') + ' WHERE v.address = t.address')
						.then(rdata => {
							this.loger("INF", "Disable inappropriate votes.");
						})
						.catch(error => {
							this.loger("ERR", "Remove voters error: "+error.message || error);
						});
					}
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
		this.db.any("SELECT * FROM voters WHERE active=true")
		.then(rdata => {
			let vbHist = [];

			if(rdata.length){
				for(let i = 0; i < rdata.length; i++){
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