#!/bin/bash

set -e

BASE_URL="http://localhost:5050"
EMAIL="vishwanath@gmail.com"

echo "========================================"
echo "1. Logging in"
echo "========================================"

read -s -p "Enter patient password: " PASSWORD
echo

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

echo "$LOGIN_RESPONSE" | python3 -m json.tool

PATIENT_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c '
import sys, json
data=json.load(sys.stdin)
print(data["token"])
')

echo
echo "Patient token captured successfully."

echo
echo "========================================"
echo "2. Normal JWT WITHOUT step-up"
echo "========================================"

curl -i "$BASE_URL/api/patient/lab-reports" \
  -H "Authorization: Bearer $PATIENT_TOKEN"

echo
echo
echo "========================================"
echo "3. Wrong password"
echo "========================================"

WRONG_RESPONSE=$(curl -s -X POST \
  "$BASE_URL/api/patient/lab-reports/verify" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "THIS_IS_NOT_THE_PASSWORD"
  }')

echo "$WRONG_RESPONSE" | python3 -m json.tool

echo
echo "========================================"
echo "4. Correct password -> step-up token"
echo "========================================"

STEPUP_RESPONSE=$(curl -s -X POST \
  "$BASE_URL/api/patient/lab-reports/verify" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"password\": \"$PASSWORD\"
  }")

echo "$STEPUP_RESPONSE" | python3 -m json.tool

STEP_UP_TOKEN=$(echo "$STEPUP_RESPONSE" | python3 -c '
import sys, json
data=json.load(sys.stdin)
print(data["stepUpToken"])
')

echo
echo "Step-up token captured successfully."

echo
echo "========================================"
echo "5. Normal JWT + step-up token"
echo "========================================"

curl -i "$BASE_URL/api/patient/lab-reports" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "X-Step-Up-Token: $STEP_UP_TOKEN"

echo
echo
echo "========================================"
echo "6. Tampered step-up token"
echo "========================================"

BAD_STEP_UP_TOKEN="${STEP_UP_TOKEN}x"

curl -i "$BASE_URL/api/patient/lab-reports" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "X-Step-Up-Token: $BAD_STEP_UP_TOKEN"

echo
echo
echo "========================================"
echo "7. Public medical-file URL"
echo "========================================"

curl -i \
  "$BASE_URL/uploads/patient_files/some-report.pdf"

echo
echo "========================================"
echo "Test sequence complete"
echo "========================================"

unset PASSWORD
unset PATIENT_TOKEN
unset STEP_UP_TOKEN
