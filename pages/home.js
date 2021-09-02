//Load modules
const express = require('express');
const request = require('request');
const router = express.Router();
const pool = require('../libs/pool.js');
const { menuBuilder, log } = require('../libs/helpers.js')

//Init config
const config = pool.config;

//Page tags
let data = {
  "TITLE": config.pool.name,
	"daddr": config.delegate.address,
	"pshare": 100 - config.pool.pool_fees,
	"pptime": config.pool.withdrawal_time / 3600,
	"ppmin": config.pool.withdrawal_min,
};

//Home page
router.get('/', function (req, res, next) {
	data.MAINMENU = menuBuilder(req.baseUrl);

  let network = config.blockchainApp.network;
  data.network = network.exist[network.active].name;

  //Set tags
  data.username = pool.name;

  if(data){
    res.render('home', data);
  } else {
    data.message = "Error!";
    log("ERR", "Error!");
    res.render('error', data);
  }
});

module.exports = router;