#!/bin/bash

export EC2_HOSTNAME="$(curl http://169.254.169.254/latest/meta-data/local-hostname -m 2 2>/dev/null)"
if [[ ! -z $EC2_HOSTNAME ]]; then
  echo "export EC2_HOSTNAME=$(curl http://169.254.169.254/latest/meta-data/local-hostname -m 2 2>/dev/null)"  >> ~/.bashrc
else
  export EC2_HOSTNAME=localhost
fi

node /app/dist/app.js
