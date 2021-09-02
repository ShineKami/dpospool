# DPoSPool
DPoS Delegate pool
<br>
Donnations: lskcuy6uvwgq2nqp858saa7tmbppy9c9dzunsxmvu

#Requirements

- NodeJS, Bower, Gulp, PM2<br>
- Git<br>
- Cron<br>

#Installation

<pre>
git clone git@github.com:ShineKami/dpospool.git
cd public_src
bower install
npm install
gulp release
cd ..
npm install
bash pool.sh install
</pre>

#Controll

<pre>
bash pool.sh start - start pool script
bash pool.sh stop - stop pool script
bash pool.sh payouts - pay pool reward to voters("cron" for automatic payouts)
bash pool.sh help - see all commands
</pre>

#Configure
All pool configuration in "config.json", edit "config.json" before "bash pool.sh install" and set "login, pass, network etc."
After change "config.json" for the changes to take effect on work pool use "bash pool.sh reload"