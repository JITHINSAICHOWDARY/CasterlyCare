#!/bin/bash

set -u

BASE_URL="http://localhost:5050"

PASS=0
FAIL=0
SKIP=0

PATIENT_EMAIL="vishwanath@gmail.com"
DOCTOR_EMAIL="mynenijithinsai6@gmail.com"

echo "=============================================="
echo "CASTERLYCARE / LANNISTER CARE"
echo "PHASE 1 — FULL BACKEND REGRESSION"
echo "=============================================="

echo
read -s -p "Patient password: " PATIENT_PASSWORD
echo
read -s -p "Doctor password: " DOCTOR_PASSWORD
echo

echo
echo "=============================================="
echo "A. SERVER HEALTH"
echo "=============================================="

HEALTH=$(curl -s -o /tmp/cc_health.json -w "%{http_code}" \
  "$BASE_URL/api/health")

if [ "$HEALTH" = "200" ]; then
  echo "PASS  Health endpoint: HTTP $HEALTH"
  ((PASS++))
else
  echo "FAIL  Health endpoint: HTTP $HEALTH"
  ((FAIL++))
fi

cat /tmp/cc_health.json
echo

echo
echo "=============================================="
echo "B. PATIENT LOGIN"
echo "=============================================="

PATIENT_LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\":\"$PATIENT_EMAIL\",
    \"password\":\"$PATIENT_PASSWORD\"
  }")

PATIENT_TOKEN=$(echo "$PATIENT_LOGIN" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(d.get("token",""))
')

if [ -n "$PATIENT_TOKEN" ]; then
  echo "PASS  Patient login"
  ((PASS++))
else
  echo "FAIL  Patient login"
  echo "$PATIENT_LOGIN"
  ((FAIL++))
fi

echo
echo "=============================================="
echo "C. DOCTOR LOGIN"
echo "=============================================="

DOCTOR_LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\":\"$DOCTOR_EMAIL\",
    \"password\":\"$DOCTOR_PASSWORD\"
  }")

DOCTOR_TOKEN=$(echo "$DOCTOR_LOGIN" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(d.get("token",""))
')

if [ -n "$DOCTOR_TOKEN" ]; then
  echo "PASS  Doctor login"
  ((PASS++))
else
  echo "FAIL  Doctor login"
  echo "$DOCTOR_LOGIN"
  ((FAIL++))
fi

echo
echo "=============================================="
echo "D. PATIENT CORE ENDPOINTS"
echo "=============================================="

test_get () {
  LABEL="$1"
  URL="$2"
  EXPECT="$3"

  CODE=$(curl -s -o /tmp/cc_response.json -w "%{http_code}" \
    "$BASE_URL$URL" \
    -H "Authorization: Bearer $PATIENT_TOKEN")

  if [ "$CODE" = "$EXPECT" ]; then
    echo "PASS  $LABEL ($CODE)"
    ((PASS++))
  else
    echo "FAIL  $LABEL (expected $EXPECT, got $CODE)"
    cat /tmp/cc_response.json
    echo
    ((FAIL++))
  fi
}

test_get "Patient home" "/api/patient/home" "200"
test_get "Patient profile" "/api/patient/profile" "200"
test_get "Patient appointments" "/api/patient/appointments" "200"
test_get "Patient medicines" "/api/patient/medicines" "200"
test_get "Assessment history" "/api/patient/assessment/history" "200"

echo
echo "=============================================="
echo "E. LAB REPORT SECURITY"
echo "=============================================="

LAB_NO_STEPUP=$(curl -s -o /tmp/cc_lab.json -w "%{http_code}" \
  "$BASE_URL/api/patient/lab-reports" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

if [ "$LAB_NO_STEPUP" = "401" ]; then
  echo "PASS  Lab Reports blocks normal JWT"
  ((PASS++))
else
  echo "FAIL  Lab Reports normal JWT protection"
  cat /tmp/cc_lab.json
  echo
  ((FAIL++))
fi

STEPUP=$(curl -s -X POST \
  "$BASE_URL/api/patient/lab-reports/verify" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"password\":\"$PATIENT_PASSWORD\"
  }")

STEPUP_TOKEN=$(echo "$STEPUP" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(d.get("stepUpToken",""))
')

if [ -n "$STEPUP_TOKEN" ]; then
  echo "PASS  Lab Reports step-up verification"
  ((PASS++))
else
  echo "FAIL  Lab Reports step-up verification"
  echo "$STEPUP"
  ((FAIL++))
fi

LAB_WITH_STEPUP=$(curl -s -o /tmp/cc_lab2.json -w "%{http_code}" \
  "$BASE_URL/api/patient/lab-reports" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "X-Step-Up-Token: $STEPUP_TOKEN")

if [ "$LAB_WITH_STEPUP" = "200" ]; then
  echo "PASS  Lab Reports accepts valid step-up token"
  ((PASS++))
else
  echo "FAIL  Lab Reports valid step-up token"
  cat /tmp/cc_lab2.json
  echo
  ((FAIL++))
fi

echo
echo "=============================================="
echo "F. PATIENT DIET ENGINE"
echo "=============================================="

DIET=$(curl -s -X POST \
  "$BASE_URL/api/patient/diet-check" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "foodItem":"plain rice"
  }')

if echo "$DIET" | grep -q .; then
  echo "PASS  Diet endpoint responded"
  ((PASS++))
  echo "$DIET"
else
  echo "FAIL  Diet endpoint returned no response"
  ((FAIL++))
fi

echo
echo "=============================================="
echo "G. PATIENT ASSESSMENT"
echo "=============================================="

ASSESSMENT=$(curl -s -o /tmp/cc_assessment.json -w "%{http_code}" \
  -X POST \
  "$BASE_URL/api/patient/assessment" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "spo2":98,
    "systolic":120,
    "diastolic":80,
    "heartRate":72,
    "temperature":36.8
  }')

if [ "$ASSESSMENT" = "201" ]; then
  echo "PASS  Patient assessment"
  ((PASS++))
else
  echo "FAIL  Patient assessment (HTTP $ASSESSMENT)"
  cat /tmp/cc_assessment.json
  echo
  ((FAIL++))
fi

echo
echo "=============================================="
echo "H. KINGSLAYER"
echo "=============================================="

KINGSLAYER=$(curl -s -o /tmp/cc_kingslayer.json -w "%{http_code}" \
  -X POST \
  "$BASE_URL/api/patient/kingslayer" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message":"What should I keep in mind during recovery?"
  }')

if [ "$KINGSLAYER" = "200" ]; then
  echo "PASS  Kingslayer endpoint"
  ((PASS++))
else
  echo "FAIL  Kingslayer endpoint (HTTP $KINGSLAYER)"
  cat /tmp/cc_kingslayer.json
  echo
  ((FAIL++))
fi

echo
echo "=============================================="
echo "I. DOCTOR CORE ENDPOINTS"
echo "=============================================="

doctor_get () {
  LABEL="$1"
  URL="$2"
  EXPECT="$3"

  CODE=$(curl -s -o /tmp/cc_doctor.json -w "%{http_code}" \
    "$BASE_URL$URL" \
    -H "Authorization: Bearer $DOCTOR_TOKEN")

  if [ "$CODE" = "$EXPECT" ]; then
    echo "PASS  $LABEL ($CODE)"
    ((PASS++))
  else
    echo "FAIL  $LABEL (expected $EXPECT, got $CODE)"
    cat /tmp/cc_doctor.json
    echo
    ((FAIL++))
  fi
}

doctor_get "Doctor home" "/api/doctor/home" "200"
doctor_get "Doctor profile" "/api/doctor/profile" "200"
doctor_get "Doctor patients" "/api/doctor/patients" "200"
doctor_get "Doctor appointments" "/api/doctor/appointments" "200"
doctor_get "Doctor priority inbox" "/api/doctor/inbox" "200"

echo
echo "=============================================="
echo "J. ADMIN LOGIN"
echo "=============================================="

read -p "Admin email [admin@lannistercare.com]: " ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@lannistercare.com}

read -s -p "Admin password: " ADMIN_PASSWORD
echo

ADMIN_LOGIN=$(curl -s -X POST \
  "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\":\"$ADMIN_EMAIL\",
    \"password\":\"$ADMIN_PASSWORD\"
  }")

ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(d.get("token",""))
')

if [ -n "$ADMIN_TOKEN" ]; then
  echo "PASS  Admin login"
  ((PASS++))
else
  echo "FAIL  Admin login"
  echo "$ADMIN_LOGIN"
  ((FAIL++))
fi

echo
echo "=============================================="
echo "K. ADMIN ENDPOINTS"
echo "=============================================="

admin_get () {
  LABEL="$1"
  URL="$2"
  EXPECT="$3"

  CODE=$(curl -s -o /tmp/cc_admin.json -w "%{http_code}" \
    "$BASE_URL$URL" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

  if [ "$CODE" = "$EXPECT" ]; then
    echo "PASS  $LABEL ($CODE)"
    ((PASS++))
  else
    echo "FAIL  $LABEL (expected $EXPECT, got $CODE)"
    cat /tmp/cc_admin.json
    echo
    ((FAIL++))
  fi
}

admin_get "Admin stats" "/api/admin/stats" "200"
admin_get "Admin doctors" "/api/admin/doctors" "200"
admin_get "Admin appointments" "/api/admin/appointments" "200"
admin_get "Admin SOS alerts" "/api/admin/sos" "200"

echo
echo "=============================================="
echo "L. UNAUTHORIZED ROLE PROTECTION"
echo "=============================================="

CODE=$(curl -s -o /tmp/cc_role.json -w "%{http_code}" \
  "$BASE_URL/api/admin/stats" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

if [ "$CODE" = "403" ]; then
  echo "PASS  Patient blocked from Admin API"
  ((PASS++))
else
  echo "FAIL  Patient/Admin role isolation (HTTP $CODE)"
  cat /tmp/cc_role.json
  echo
  ((FAIL++))
fi

CODE=$(curl -s -o /tmp/cc_role2.json -w "%{http_code}" \
  "$BASE_URL/api/doctor/home" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

if [ "$CODE" = "403" ]; then
  echo "PASS  Patient blocked from Doctor API"
  ((PASS++))
else
  echo "FAIL  Patient/Doctor role isolation (HTTP $CODE)"
  cat /tmp/cc_role2.json
  echo
  ((FAIL++))
fi

echo
echo "=============================================="
echo "M. MEDICAL FILE PUBLIC ACCESS"
echo "=============================================="

CODE=$(curl -s -o /tmp/cc_public.json -w "%{http_code}" \
  "$BASE_URL/uploads/patient_files/some-report.pdf")

if [ "$CODE" = "401" ]; then
  echo "PASS  Medical file route requires authentication"
  ((PASS++))
else
  echo "FAIL  Medical file public protection (HTTP $CODE)"
  cat /tmp/cc_public.json
  echo
  ((FAIL++))
fi

CODE=$(curl -s -o /tmp/cc_uploads.json -w "%{http_code}" \
  "$BASE_URL/uploads/")

if [ "$CODE" = "404" ]; then
  echo "PASS  Public uploads directory unavailable"
  ((PASS++))
else
  echo "FAIL  Public uploads directory returned HTTP $CODE"
  ((FAIL++))
fi

echo
echo "=============================================="
echo "N. APPOINTMENT DATA CONSISTENCY"
echo "=============================================="

APPTS=$(curl -s \
  "$BASE_URL/api/patient/appointments" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

if echo "$APPTS" | grep -q '"appointments"'; then
  echo "PASS  Appointment payload available"
  ((PASS++))
else
  echo "FAIL  Appointment payload"
  echo "$APPTS"
  ((FAIL++))
fi

echo
echo "=============================================="
echo "O. CHAT CURRENT STATE"
echo "=============================================="

CHAT=$(curl -s \
  "$BASE_URL/api/patient/emergency-chat/active" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

if echo "$CHAT" | grep -q '"thread"'; then
  echo "PASS  Patient emergency-chat endpoint"
  ((PASS++))
else
  echo "FAIL  Patient emergency-chat endpoint"
  echo "$CHAT"
  ((FAIL++))
fi

INBOX=$(curl -s \
  "$BASE_URL/api/doctor/inbox" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

if echo "$INBOX" | grep -q '"threads"'; then
  echo "PASS  Doctor priority inbox payload"
  ((PASS++))
else
  echo "FAIL  Doctor priority inbox payload"
  echo "$INBOX"
  ((FAIL++))
fi

echo
echo "=============================================="
echo "FINAL REGRESSION RESULT"
echo "=============================================="

echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "SKIP: $SKIP"

if [ "$FAIL" -eq 0 ]; then
  echo
  echo "=============================================="
  echo "1.8.30 — PASS"
  echo "FULL BACKEND REGRESSION PASSED"
  echo "=============================================="
else
  echo
  echo "=============================================="
  echo "1.8.30 — NOT YET COMPLETE"
  echo "Failures require review."
  echo "=============================================="
fi

unset PATIENT_PASSWORD
unset DOCTOR_PASSWORD
unset ADMIN_PASSWORD
unset PATIENT_TOKEN
unset DOCTOR_TOKEN
unset ADMIN_TOKEN
