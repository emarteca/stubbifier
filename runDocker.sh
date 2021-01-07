#!/bin/bash

mkdir local_mount
docker run --mount type=bind,source=`pwd`/local_mount,destination=/mount -w /home/stubbifier -it stubbifier:latest
rm -r local_mount
