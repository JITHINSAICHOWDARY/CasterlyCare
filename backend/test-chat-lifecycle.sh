#!/bin/bash

set -e

BASE_URL="http://localhost:5050"

echo "========================================"
echo "CHAT LIFECYCLE HARDENING TEST"
echo "========================================"

echo
echo "Patient email:"
read PATIENT_EMAIL

echo "Patient password:"
read -s PATIENT_PASSWORD
echo

echo
echo "Doctor email:"
read DOCTOR_EMAIL

echo "Doctor password:"
read -s DOCTOR_PASSWORD
echo

echo
echo "========================================"
echo "1. Patient login"
echo "========================================"

PATIENT_LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$PATIENT_EMAIL\",
    \"password\": \"$PATIENT_PASSWORD\"
  }")

echo "$PATIENT_LOGIN" | python3 -m json.tool

PATIENT_TOKEN=$(echo "$PATIENT_LOGIN" | python3 -c '
import sys,json
print(json.load(sys.stdin)["token"])
')

echo
echo "Patient login: OK"

echo
echo "========================================"
echo "2. Doctor login"
echo "========================================"

DOCTOR_LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$DOCTOR_EMAIL\",
    \"password\": \"$DOCTOR_PASSWORD\"
  }")

echo "$DOCTOR_LOGIN" | python3 -m json.tool

DOCTOR_TOKEN=$(echo "$DOCTOR_LOGIN" | python3 -c '
import sys,json
print(json.load(sys.stdin)["token"])
')

echo
echo "Doctor login: OK"

echo
echo "========================================"
echo "3. Patient starts Emergency Chat"
echo "========================================"

START1=$(curl -s -X POST \
  "$BASE_URL/api/patient/emergency-chat/start" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json")

echo "$START1" | python3 -m json.tool

THREAD1=$(echo "$START1" | python3 -c '
import sys,json
print(json.load(sys.stdin)["thread"]["id"])
')

CHAT1=$(echo "$START1" | python3 -c '
import sys,json
print(json.load(sys.stdin)["thread"]["chatCode"])
')

echo
echo "Thread 1: $THREAD1"
echo "Chat ID 1: $CHAT1"

echo
echo "========================================"
echo "4. Doctor Priority Inbox"
echo "========================================"

INBOX1=$(curl -s \
  "$BASE_URL/api/doctor/inbox" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

echo "$INBOX1" | python3 -m json.tool

if echo "$INBOX1" | grep -q "$CHAT1"; then
  echo "PASS: Open chat appears in Priority Inbox."
else
  echo "FAIL: Open chat does not appear in Priority Inbox."
  exit 1
fi

echo
echo "========================================"
echo "5. Doctor sends reply"
echo "========================================"

REPLY=$(curl -s -X POST \
  "$BASE_URL/api/doctor/inbox/$THREAD1/messages" \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test reply for chat lifecycle validation."
  }')

echo "$REPLY" | python3 -m json.tool

if echo "$REPLY" | grep -q '"message"'; then
  echo "PASS: Doctor can reply while chat is open."
else
  echo "FAIL: Doctor reply failed."
  exit 1
fi

echo
echo "========================================"
echo "6. Doctor closes chat"
echo "========================================"

CLOSE=$(curl -s -X PATCH \
  "$BASE_URL/api/doctor/inbox/$THREAD1/close" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

echo "$CLOSE" | python3 -m json.tool

echo
echo "Chat closed."

echo
echo "========================================"
echo "7. Closed chat disappears from Inbox"
echo "========================================"

INBOX2=$(curl -s \
  "$BASE_URL/api/doctor/inbox" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

echo "$INBOX2" | python3 -m json.tool

if echo "$INBOX2" | grep -q "$CHAT1"; then
  echo "FAIL: Closed chat still appears in Priority Inbox."
  exit 1
else
  echo "PASS: Closed chat removed from active Priority Inbox."
fi

echo
echo "========================================"
echo "8. Patient tries to message closed chat"
echo "========================================"

CLOSED_MESSAGE=$(curl -s -o /tmp/closed_chat_response.json \
  -w "%{http_code}" \
  -X POST \
  "$BASE_URL/api/patient/emergency-chat/$THREAD1/messages" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This should not be accepted."
  }')

echo
echo "HTTP status: $CLOSED_MESSAGE"
cat /tmp/closed_chat_response.json
echo

if [ "$CLOSED_MESSAGE" = "404" ]; then
  echo "PASS: Closed chat rejects new messages."
else
  echo "FAIL: Closed chat accepted/rejected with unexpected status."
  exit 1
fi

echo
echo "========================================"
echo "9. Patient starts a NEW query"
echo "========================================"

START2=$(curl -s -X POST \
  "$BASE_URL/api/patient/emergency-chat/start" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json")

echo "$START2" | python3 -m json.tool

THREAD2=$(echo "$START2" | python3 -c '
import sys,json
print(json.load(sys.stdin)["thread"]["id"])
')

CHAT2=$(echo "$START2" | python3 -c '
import sys,json
print(json.load(sys.stdin)["thread"]["chatCode"])
')

echo
echo "Thread 2: $THREAD2"
echo "Chat ID 2: $CHAT2"

if [ "$CHAT1" = "$CHAT2" ]; then
  echo "FAIL: New query reused the old Chat ID."
  exit 1
else
  echo "PASS: New query received a new Chat ID."
fi

if [ "$THREAD1" = "$THREAD2" ]; then
  echo "FAIL: New query reused the old thread."
  exit 1
else
  echo "PASS: New query received a new thread."
fi

echo
echo "========================================"
echo "10. Patient active chat"
echo "========================================"

ACTIVE=$(curl -s \
  "$BASE_URL/api/patient/emergency-chat/active" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

echo "$ACTIVE" | python3 -m json.tool

if echo "$ACTIVE" | grep -q "$CHAT2"; then
  echo "PASS: New chat is active."
else
  echo "FAIL: New chat is not active."
  exit 1
fi

echo
echo "========================================"
echo "1.8.29 RESULT"
echo "========================================"
echo "PASS: Chat lifecycle hardening validated."
echo
echo "Old Chat ID: $CHAT1"
echo "New Chat ID: $CHAT2"
echo "========================================"

unset PATIENT_PASSWORD
unset DOCTOR_PASSWORD
unset PATIENT_TOKEN
unset DOCTOR_TOKEN
