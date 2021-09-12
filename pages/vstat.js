//Init modules
const express = require('express');
const router = express.Router();
const pool = require('../libs/pool.js');
const { beddowsAsLsk, menuBuilder, getExplorer, timeFormat, log } = require('../libs/helpers.js');

//Page tags
let data = {
	"TITLE": pool.poolname,
	"network": pool.network
};

//Voter statistics - Voter address
router.get('/', function (req, res) {
	data.MAINMENU = menuBuilder(req.baseUrl);
	res.render('voter-open', data);
});

//Voter statistics - Voter info
router.get('/address/:address', function (req, res) {
	const address = req.params.address;

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
					data.withdrawal.push({
						"reward": beddowsAsLsk(rdata[i].reward),
						"fees": beddowsAsLsk(rdata[i].fees),
						"txid_short": rdata[i].txid.slice(1, -10)+"...",
						"txid": rdata[i].txid,
						"date": timeFormat(rdata[i].timestamp),
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
		})
		.catch(error => {
			data.message = error.message
			log("ERR", error.message || error);
			res.render('error', data)
		});
	} else {
		data.MAINMENU = menuBuilder(req.baseUrl);
		data.message = 'Is not Ajax request!';

		res.render('error', data);
	}
})

module.exports = router;