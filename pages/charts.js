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
  "TITLE": config.pool.name
};

//Charts
router.get('/', function (req, res) {
  data.MAINMENU = menuBuilder(req.baseUrl);

  res.render('charts', data);
});


//AJAX: Get data rank
router.get('/aget/:type', function (req, res) {
	if(req.xhr){
 		let data_type = req.params.type;

 		switch(data_type){
  		case 'rank': 
			  pool.db.any("SELECT rank, timestamp FROM pool_history")
			  .then(rdata => {
			  	const data = rdata.map(function(item) { return [parseFloat(item['timestamp']), item['rank']]});
			  	res.send(data);
			  });
  		break;

  		case 'balance': 
			  pool.db.any("SELECT balance, timestamp FROM pool_history")
			  .then(rdata => {
			  	const data = rdata.map(function(item) {	return [parseFloat(item['timestamp']), beddowsAsLsk(item['balance'], true)]});
			  	res.send(data);
			  });
  		break;

  		case 'vcount': 
			  pool.db.any("SELECT vcount, timestamp FROM pool_history")
			  .then(rdata => {
			  	const data = rdata.map(function(item) { return [parseFloat(item['timestamp']), item['vcount']]});
			  	res.send(data);
			  });
  		break;

  		default: res.send([]);
  	}
	} else {
		data.MAINMENU = menuBuilder(req.baseUrl);
		data.message = 'Is not Ajax request!';

		log("ERR", "'/aget' "+data.message);
    res.render('error', data);
	}
});

module.exports = router;