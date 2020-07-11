CREATE TABLE "user" (
  ID SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  firstName VARCHAR(255) NOT NULL,
  lastName VARCHAR(255) NOT NULL,
  countryCode VARCHAR(255) NOT NULL,
  passhash VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP(0) NOT NULL,
  lastLogin TIMESTAMP(0) NOT NULL
);

CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
	"sess" json NOT NULL,
	"expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX "IDX_session_expire" ON "session" ("expire");
-- from https://github.com/voxpelli/node-connect-pg-simple/blob/HEAD/table.sql for express-session

CREATE TABLE device (
  ID SERIAL PRIMARY KEY,
  ownedBy INTEGER,
  "name" VARCHAR(255) NOT NULL,
  mac VARCHAR(255) NOT NULL,
  ipAddress INET NOT NULL,
  model VARCHAR(255) NOT NULL,
  locatedIn VARCHAR(255) NOT NULL,
  lastOnline TIMESTAMP(0) DEFAULT NOW() NOT NULL,
  FOREIGN KEY (ownedBy)  REFERENCES "user"(ID)
);

-- For a UNIQUE CONSTRAINT, PostgreSQL automatically creates an index.
ALTER TABLE "device" ADD CONSTRAINT unique_mac UNIQUE (mac);
ALTER TABLE "user" ADD CONSTRAINT unique_email UNIQUE (email);
ALTER TABLE "user" ADD CONSTRAINT unique_username UNIQUE (username);
-- Add index for case insensitive searching
CREATE UNIQUE INDEX IDX_lower_case_username ON "user" ((lower(username))); 
CREATE UNIQUE INDEX IDX_lower_case_mac ON "device" ((lower(mac))); 

ALTER TABLE "device" RENAME COLUMN title TO "name";
ALTER TABLE "user" ADD COLUMN createdAt TIMESTAMP (0) DEFAULT NOW();
ALTER TABLE "user" ADD COLUMN lastLogin TIMESTAMP (0) DEFAULT NOW();
ALTER TABLE "user" DROP COLUMN permissions;
ALTER TABLE "device" DROP COLUMN isActive;


