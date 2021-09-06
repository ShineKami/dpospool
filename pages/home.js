//Load modules
const express = require('express');
const router = express.Router();
const pool = require('../libs/pool.js');
const { menuBuilder, log } = require('../libs/helpers.js')

//Page tags
let data = {
  "TITLE": pool.poolname,
	"daddr": pool.address,
	"pshare": 100 - pool.poolFees,
	"pptime": pool.payTime / 3600,
	"ppmin": pool.payMin,
};

//Home page
router.get('/', function (req, res, next) {
	data.MAINMENU = menuBuilder(req.baseUrl);
  data.network = pool.network.exist[pool.network.active].name;

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