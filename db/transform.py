import json
import csv

csv_file = 'BBC news dataset.csv'
sql_file = 'news.sql'


data = []
id = 1
with open(csv_file) as f:
  reader = csv.DictReader(f)
  for row in reader:
    tags = row['tags'].replace('\'', '`').replace('"', '')
    desc = row['description'].replace('\'', '`').replace('"', '')
    desc = desc.split('  ')
    title = desc[0]
    body = '<br>'
    body = body.join(desc[1:])

    data.append(
      'insert into news (id, title, body, tags) values ({}, "{}", "{}", "{}");'.format(id, title, body, tags)
    )
    id = id + 1


with open(sql_file, 'w') as f:
  for item in data:
    f.write("%s\n" % item)