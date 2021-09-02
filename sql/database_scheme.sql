--
-- Table structure for table `voters`
--

CREATE TABLE IF NOT EXISTS voters (
  id SERIAL PRIMARY KEY,
  address varchar NOT NULL,
  username varchar,
  balance bigint NOT NULL,
  poolpercent double precision NOT NULL,
  total bigint NOT NULL,
  vote bigint NOT NULL,
  active boolean NOT NULL,
  status integer NOT NULL
);

-- --------------------------------------------------------

--
-- Table structure for table `poolfees`
--

CREATE TABLE IF NOT EXISTS poolfees (
  id SERIAL PRIMARY KEY,
  address varchar NOT NULL,
  balance bigint NOT NULL,
  percent double precision NOT NULL
);

-- --------------------------------------------------------

--
-- Table structure for table `voters balance history`
--

CREATE TABLE IF NOT EXISTS balance_history (
  id SERIAL PRIMARY KEY,
  voter_id integer NOT NULL REFERENCES voters ON DELETE CASCADE,
  balance bigint NOT NULL,
  timestamp varchar NOT NULL
);

-- --------------------------------------------------------

--
-- Table structure for table `voters withdrawal history`
--

CREATE TABLE IF NOT EXISTS withdrawal_history (
  id SERIAL PRIMARY KEY,
  voter_id integer NOT NULL REFERENCES voters ON DELETE CASCADE,
  reward bigint NOT NULL,
  fees bigint NOT NULL,
  txid varchar NOT NULL,
  timestamp varchar NOT NULL
);

-- --------------------------------------------------------

--
-- Table structure for table `pool statistic history`
--

CREATE TABLE IF NOT EXISTS pool_history (
  rank int NOT NULL,
  balance bigint NOT NULL,
  vcount int NOT NULL,
  self_vote bigint NOT NULL,
  total_vote bigint NOT NULL, 
  timestamp varchar NOT NULL
);

-- --------------------------------------------------------