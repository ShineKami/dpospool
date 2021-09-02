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
router.get('/aget_rank', function (req, res) {
	if(req.xhr){
 		var edata = [];

	  pool.db.any("SELECT * FROM pool_history")
	  .then(rdata => {
	  	for(var i = 0;  i < rdata.length; i++) {
	  		edata.push([parseFloat(rdata[i].timestamp), rdata[i].rank]);
	  	}

	  	res.send(edata);
	  });
	} else {
		data.MAINMENU = menuBuilder(req.baseUrl);
		data.message = 'Is not Ajax request!';

		log("ERR", "'/aget_rank' "+data.message);
    res.render('error', data);
	}
});

//AJAX: Get data balance
router.get('/aget_balance', function (req, res) {
	if(req.xhr){
	 	var edata = [];

	  pool.db.any("SELECT * FROM pool_history")
	  .then(rdata => {
	  	for(var i = 0;  i < rdata.length; i++) {
	  		edata.push([parseFloat(rdata[i].timestamp), beddowsAsLsk(rdata[i].balance)]);
	  	}

	  	res.send(edata);
	  });
  } else {
		data.MAINMENU = menuBuilder(req.baseUrl);
		data.message = 'Is not Ajax request!';

		log("ERR", "'/aget_balance' "+data.message);
    res.render('error', data);
	}
});

//AJAX: Get data vcout
router.get('/aget_vcount', function (req, res) {
	if(req.xhr){
	 	var edata = [];

	  pool.db.any("SELECT * FROM pool_history")
	  .then(rdata => {
	  	for(var i = 0;  i < rdata.length; i++) {
	  		edata.push([parseFloat(rdata[i].timestamp), rdata[i].vcount]);
	  	}

	  	res.send(edata);
	  });
  } else {
		data.MAINMENU = menuBuilder(req.baseUrl);
		data.message = 'Is not Ajax request!';

		log("ERR", "'/aget_vcount' "+data.message);
    res.render('error', data);
	}
});

module.exports = router;