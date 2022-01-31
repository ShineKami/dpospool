//Load config
const config = require('../config.json');

//Load modules
const pgp = require("pg-promise")();
const { lskAsBeddows, beddowsAsLsk, log } = require('./helpers');
const LiskAPI = require('./LiskAPI');

//Vars
const api = new LiskAPI(config);
const minbal = lskAsBeddows(config.payouts.minpay);
let data = [];

//Init db
const db = pgp("postgres://"+config.db.dbuser+":"+config.db.dbpass+"@"+config.db.dbhost+":"+config.db.dbport+"/"+config.db.dbname);

//Payout
function Payout(){
	db.any("SELECT * FROM voters WHERE balance>"+minbal)
	.then(rdata1 => {
		db.any("SELECT * FROM poolfees WHERE balance>0")
		.then(rdata2 => {
			//Merge payouts data
			data = rdata1.concat(rdata2);
			
			if(data.length){
				api.getNonce()
				.then(res => {
					let nonce = res;

					for(let i = 0; i<data.length; i++){
						const jsonTX = api.createTX({
							"recipientAddress": data[i].address,
							"amount": data[i].balance,
							"nonce": nonce
						});

						//Send transaction to node
						api.sendTX(jsonTX)
						.then(res => {
							setTimeout(() => {
								api.checkTX(res.transactionId)
								.then(answ => {
									if(data[i].vote){
										//Reset balance
										db.result(pgp.helpers.update({'balance': 0}, ['balance'], 'voters') + ' WHERE id='+data[i].id)
										.then(() => {
											log("INF", "Voters payouts("+beddowsAsLsk(data[i].balance)+" LSK) - Recipient: "+data[i].address+" - TXID: "+res.transactionId);
										})
										.catch(error => {
											log("ERR", error.message || error);
										});

										//Update payout history
										db.result(pgp.helpers.insert({
											"voter_id": data[i].id,
											"reward": data[i].balance,
											"fees": Number(jsonTX.fee),
											"txid": res.transactionId,
											"timestamp": Date.now()
										}, ['voter_id', 'reward', 'fees', 'txid', 'timestamp'], 'withdrawal_history'))
										.catch(error => {
											log("ERR", error.message || error);
										});
									} else {
										//Reset balance
										db.result(pgp.helpers.update({'balance': 0}, ['balance'], 'poolfees') + ' WHERE id='+data[i].id)
										.then(() => {
											log("INF", "Poolfees payoyts("+beddowsAsLsk(data[i].balance)+" LSK) - Recipient: "+data[i].address+" - TXID: "+res.transactionId);
										})
										.catch(error => {
											log("ERR", error.message || error);
										});
									}
								})
								.catch(error => {
									log("ERR", error.message+" - Recipient: "+data[i].address+" - Transaction: "+res.transactionId+" not found!");
								});
							}, 11000);
						})
						.catch(error => {
							log("ERR", error)
						});

						nonce++;
					}
				})
				.catch(error => {
					log("ERR", error);
				});
			} else {
				log("INF", "Payout time: No one balances matching minimum payout amount!");
			}
		})
	})
}

if(config.payouts.passphrase1){
	Payout();	
} else {
	log("ERR", "Payout passphrase not set in config");
}