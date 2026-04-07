#!/bin/bash
source /root/BmwGiveawayBot/myenv/bin/activate
nohup python3 /root/BmwGiveawayBot/main.py > /dev/null 2>&1 &
echo "Bot started"
