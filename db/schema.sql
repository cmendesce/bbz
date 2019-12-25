CREATE TABLE news (
  id SERIAL NOT NULL PRIMARY KEY,
  title varchar(512) NOT NULL,
  body text NOT NULL,
  tags text NOT NULL
)
