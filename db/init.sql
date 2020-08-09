-- TABLES
CREATE TABLE "user" (
  ID SERIAL PRIMARY KEY,
  username VARCHAR(20) NOT NULL,
  email VARCHAR(20) NOT NULL,
  firstName VARCHAR(20) NOT NULL,
  lastName VARCHAR(20) NOT NULL,
  passhash VARCHAR(20) NOT NULL,
  createdAt TIMESTAMP(0) DEFAULT (NOW() AT TIME ZONE 'UTC'),
  lastLogin TIMESTAMP(0)
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
  "name" VARCHAR(20) NOT NULL,
  mac VARCHAR(20) NOT NULL,
  ipAddress INET NOT NULL,
  model VARCHAR(20) NOT NULL,
  locatedIn CHAR(2) NOT NULL,
  lastOnline TIMESTAMP(0) DEFAULT (NOW() AT TIME ZONE 'UTC'),
  FOREIGN KEY (ownedBy)  REFERENCES "user"(ID)
);

CREATE TABLE invitation (
  ID SERIAL PRIMARY KEY,
  senderID INTEGER NOT NULL,
  recipientID INTEGER NOT NULL,
  createdAt TIMESTAMP(0) DEFAULT (NOW() AT TIME ZONE 'UTC'),
  recievedAt TIMESTAMP(0),
  seenAt  TIMESTAMP(0),
  acceptedAt  TIMESTAMP(0),
  expiresAt  TIMESTAMP(0) NOT NULL,
  accepted BOOLEAN,
  FOREIGN KEY (senderID) REFERENCES "device"(ID),
  FOREIGN KEY (recipientID) REFERENCES "device"(ID)
);

-- CONSTRAINTS
-- For a UNIQUE CONSTRAINT, PostgreSQL automatically creates an index.
-- TODO:: indexes on all columns referenced by foreign keys
-- TODO:: citext extension for case insensitive uniqueness
ALTER TABLE "device" ADD CONSTRAINT unique_mac UNIQUE (mac);  
ALTER TABLE "user" ADD CONSTRAINT unique_email UNIQUE (email);
ALTER TABLE "user" ADD CONSTRAINT unique_username UNIQUE (username);

-- INDEXES
CREATE UNIQUE INDEX IDX_lower_case_username ON "user" ((lower(username))); 
CREATE UNIQUE INDEX IDX_lower_case_mac ON "device" ((lower(mac))); 
CREATE INDEX IDX_invitation_by_mac ON "invitation" ((lower(senderID)));
CREATE INDEX IDX_invitation_by_mac_recipient ON "invitation" ((lower(recipientID)));

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.tr_invitation_expiry()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
	BEGIN
		NEW.expiresAt = (NOW() AT TIME ZONE 'UTC') + INTERVAL '72 HOUR';
		RETURN NEW;
	END;
$function$
$tr_invitation_expiry$ LANGUAGE plpgsql;
CREATE TRIGGER tr_invitation_expiry BEFORE INSERT ON invitation 
	FOR EACH ROW EXECUTE PROCEDURE tr_invitation_expiry();

-- MISC QUERIES
SELECT COUNT (DISTINCT device.model) AS uniqueDeviceModels FROM device;
SELECT device.model, MIN(lastOnline) AS minLastOnline,COUNT (*) AS uniqueDeviceModel FROM device GROUP BY device.model;
SELECT MAX(device.lastOnline) FROM device;
SELECT device."name" FROM device WHERE lastOnline BETWEEN '2020-07-11' AND '2020-07-29';  
SELECT now() AT TIME ZONE 'UTC';
SELECT now() AT TIME ZONE current_setting('TimeZone');
SELECT \*, xmin, xmax FROM "user";
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'device';