#!/usr/bin/env bash
# usage: run.sh <logname> <node test args...>
log=$1; shift
cd /tmp/agentcancel-qa
export HOME=/tmp/agentcancel-qa-home PI_CODING_AGENT_DIR=/tmp/agentcancel-qa-home/pi-agent \
  XDG_CONFIG_HOME=/tmp/agentcancel-qa-home/config XDG_DATA_HOME=/tmp/agentcancel-qa-home/data \
  XDG_CACHE_HOME=/tmp/agentcancel-qa-home/cache XDG_STATE_HOME=/tmp/agentcancel-qa-home/state \
  QA_LOG_DIR=/tmp/agentcancel-qa-logs
exec node --experimental-strip-types --test --test-concurrency=1 "$@" > /tmp/agentcancel-qa-logs/$log.log 2>&1
