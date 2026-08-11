#!/usr/bin/env sh
curl -X POST http://localhost:3001/api/v1/night/calculate \
  -H 'content-type: application/json' \
  -d '{"maghrib":"2026-07-23T21:02:00+01:00","fajr":"2026-07-24T03:15:00+01:00","timeZone":"Europe/London"}'
