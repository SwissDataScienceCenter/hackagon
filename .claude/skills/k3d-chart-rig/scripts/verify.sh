#!/usr/bin/env bash
# Turn the chart's three arguable claims into observations, and prove login.
#
#   bash scripts/verify.sh          # everything
#   bash scripts/verify.sh --quick  # skip the two checks that reconfigure the
#                                   # ingress controller (~30 s each)
#
# "The pods are Running" is not in here anywhere. Pods can be Running and the
# product unusable — this rig was written after exactly that: every page
# answered 200 while login was dead, and the app's own logs said sign-in had
# succeeded.
#
# Every negative assertion has a positive control. A 403 that would also be a
# 403 if the object never existed, or a "no replay: key" that would also hold if
# the file were empty, proves nothing — and this repository has a written record
# of suites staying green while testing nothing.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# shellcheck source=presign.sh
. "$HERE/presign.sh"

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

require_cluster
load_secrets

PASS=0; FAIL=0
check() { # description expected actual
    if [ "$2" = "$3" ]; then ok "$1"; PASS=$((PASS + 1));
    else bad "$1"; say "        expected: $2"; say "        actual:   $3"; FAIL=$((FAIL + 1)); fi
}
check_contains() { # description needle haystack
    case "$3" in
        *"$2"*) ok "$1"; PASS=$((PASS + 1)) ;;
        *) bad "$1"; say "        expected to contain: $2"; say "        got: $(printf '%.200s' "$3")"; FAIL=$((FAIL + 1)) ;;
    esac
}
check_lacks() { # description needle haystack
    case "$3" in
        *"$2"*) bad "$1"; say "        found: $2"; FAIL=$((FAIL + 1)) ;;
        *) ok "$1"; PASS=$((PASS + 1)) ;;
    esac
}

CONTROL_HOST="control.$BASE_DOMAIN"
STAMP="$(date +%s)"

# =====================================================================
step "0 · the release is installed and serving"
# =====================================================================
check "helm reports the release deployed" "deployed" \
    "$(helm -n "$NAMESPACE" status "$RELEASE" -o json 2>/dev/null | grep -o '"status":"[a-z]*"' | head -1 | sed 's/.*:"//;s/"//')"

for c in frontend backend keycloak; do
    ready="$(kubectl -n "$NAMESPACE" get deployment "$RELEASE-$c" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)"
    check "$c has a ready replica" "1" "${ready:-0}"
done

check "GET / is served by the frontend" "200" \
    "$(rigcurl -s -o /dev/null -w '%{http_code}' "$APP_URL/")"

# =====================================================================
step "1 · a presigned upload survives the /objects Ingress"
# =====================================================================
# The claim: the `upstream-vhost` annotation rewrites Host to the name SigV4 was
# computed over, so a presigned PUT sent to the APP's origin authenticates at
# the STORE. Three legs, because the middle one is what makes the first mean
# anything.

KEY="hackathons/rig/$STAMP.txt"
BODY="$STATE_DIR/upload.txt"
printf 'uploaded through the ingress at %s\n' "$STAMP" >"$BODY"
SIZE="$(wc -c <"$BODY" | tr -d ' ')"

check "the chart wrote the Host rewrite" "$STORE_HOST:$STORE_PORT" \
    "$(kubectl -n "$NAMESPACE" get ingress "$RELEASE-objects" \
        -o jsonpath='{.metadata.annotations.nginx\.ingress\.kubernetes\.io/upstream-vhost}')"

URL="$(bash "$HERE/presign.sh" put "$KEY" "text/plain" "$SIZE")"
code="$(rigcurl -s -X PUT --data-binary "@$BODY" -H "Content-Type: text/plain" \
        -o "$STATE_DIR/put.body" -w '%{http_code}' "$APP_URL$URL")"
check "presigned PUT through /objects" "200" "$code"
[ "$code" = "200" ] || say "        $(head -c 300 "$STATE_DIR/put.body")"

got="$(rigcurl -s "$APP_URL/objects/$STORE_BUCKET/$KEY")"
check "the bytes read back are the bytes sent" "$(cat "$BODY")" "$got"
check "the signed Content-Type is what the store kept" "text/plain" \
    "$(rigcurl -s -o /dev/null -w '%{content_type}' "$APP_URL/objects/$STORE_BUCKET/$KEY")"

# --- the negative control -------------------------------------------
# An Ingress identical to the chart's but for the one annotation. Applied here
# rather than left lying around, and asserted to differ by exactly that key —
# a control that has drifted is not a control.
sed -e "s|NAMESPACE_PLACEHOLDER|$NAMESPACE|" \
    -e "s|CONTROL_HOST_PLACEHOLDER|$CONTROL_HOST|" \
    -e "s|OBJECTS_SERVICE_PLACEHOLDER|$RELEASE-objects|" \
    -e "s|STORE_PORT_PLACEHOLDER|$STORE_PORT|" \
    "$MANIFEST_DIR/control-no-vhost-ingress.yaml" | kubectl apply -f - >/dev/null

annots() { # ingress-name -> "key=value" lines, minus the bookkeeping ones
    kubectl -n "$NAMESPACE" get ingress "$1" \
        -o go-template='{{range $k,$v := .metadata.annotations}}{{$k}}={{$v}}{{"\n"}}{{end}}' \
        | tr -d '\r' | grep -vE '^\s*$|^(kubectl\.kubernetes\.io/|meta\.helm\.sh/)' | LC_ALL=C sort
}
diffed="$(diff <(annots "$RELEASE-objects") <(annots rig-objects-control) | grep '^[<>]' | tr -d ' ' || true)"
check "control differs from the chart's Ingress by exactly upstream-vhost" \
    "<nginx.ingress.kubernetes.io/upstream-vhost=$STORE_HOST:$STORE_PORT" "$diffed"

# Wait for the controller to pick the new Ingress up; a 404 here just means it
# has not synced yet, and racing it would read as a pass.
for _ in $(seq 30); do
    ctl="$(rigcurl -s -o /dev/null -w '%{http_code}' --resolve "$CONTROL_HOST:$HTTP_PORT:127.0.0.1" \
        "http://$CONTROL_HOST:$HTTP_PORT/objects/$STORE_BUCKET/$KEY")"
    [ "$ctl" = "404" ] || break
    sleep 1
done

CKEY="hackathons/rig/$STAMP-control.txt"
CURL_PATH="$(bash "$HERE/presign.sh" put "$CKEY" "text/plain" "$SIZE")"
body="$(rigcurl -s -X PUT --data-binary "@$BODY" -H "Content-Type: text/plain" \
        --resolve "$CONTROL_HOST:$HTTP_PORT:127.0.0.1" \
        "http://$CONTROL_HOST:$HTTP_PORT$CURL_PATH")"
check_contains "without the rewrite the same signature is refused" "SignatureDoesNotMatch" "$body"

# And the same signature IS accepted through the chart's route, so the refusal
# above is about the annotation and not about the URL having gone stale.
check "the same signature is accepted through the chart's route" "200" \
    "$(rigcurl -s -X PUT --data-binary "@$BODY" -H "Content-Type: text/plain" \
        -o /dev/null -w '%{http_code}' "$APP_URL$CURL_PATH")"

# --- the bucket policy, both halves ----------------------------------
check "a public prefix is readable with no credentials" "200" \
    "$(rigcurl -s -o /dev/null -w '%{http_code}' "$APP_URL/objects/$STORE_BUCKET/$KEY")"
check "a private prefix is not" "403" \
    "$(rigcurl -s -o /dev/null -w '%{http_code}' "$APP_URL/objects/$STORE_BUCKET/teams/canary.txt")"
# …and it IS there, so the 403 is a refusal and not a miss.
check "the private object exists (presigned GET reaches it)" "200" \
    "$(rigcurl -s -o /dev/null -w '%{http_code}' "$APP_URL$(bash "$HERE/presign.sh" get "teams/canary.txt")")"

# =====================================================================
step "2 · the regex path beats the frontend's /"
# =====================================================================
check "both Ingresses claim the same host" "$APP_HOST $APP_HOST" \
    "$(kubectl -n "$NAMESPACE" get ingress "$RELEASE-frontend" "$RELEASE-objects" \
        -o jsonpath='{.items[*].spec.rules[0].host}')"
check_contains "/ still reaches the SvelteKit app" "<!doctype html" \
    "$(rigcurl -s "$APP_URL/" | head -c 200)"
check "/objects/… reaches the store, not the app" "$(cat "$BODY")" \
    "$(rigcurl -s "$APP_URL/objects/$STORE_BUCKET/$KEY")"
# The regex is `/objects(/|$)(.*)`, so a path that merely STARTS with the word
# must fall through to the frontend. If it did not, the prefix would be
# swallowing application routes.
check_lacks "/objectsnotaprefix is NOT sent to the store" "<Error>" \
    "$(rigcurl -s "$APP_URL/objectsnotaprefix")"

# =====================================================================
step "3 · ingress-nginx accepts the ExternalName upstream"
# =====================================================================
check "the chart created an ExternalName Service" "ExternalName" \
    "$(kubectl -n "$NAMESPACE" get svc "$RELEASE-objects" -o jsonpath='{.spec.type}')"
check "it points at the store's endpoint host" "$STORE_HOST" \
    "$(kubectl -n "$NAMESPACE" get svc "$RELEASE-objects" -o jsonpath='{.spec.externalName}')"
check "it is the /objects backend" "$RELEASE-objects" \
    "$(kubectl -n "$NAMESPACE" get ingress "$RELEASE-objects" \
        -o jsonpath='{.spec.rules[0].http.paths[0].backend.service.name}')"
# Every 200 above already went through it — a rejected ExternalName upstream is
# a 503, not a wrong answer.
check "traffic through it is served, not 503'd" "200" \
    "$(rigcurl -s -o /dev/null -w '%{http_code}' "$APP_URL/objects/$STORE_BUCKET/$KEY")"

if [ "$QUICK" = 0 ]; then
    # The check above is only as good as the alternative being real: a "200"
    # would look identical if the kill switch did not exist. So turn it on and
    # watch the route die, then turn it off and watch it come back.
    #
    # ⚠ IT IS A COMMAND-LINE FLAG, `--disable-svc-external-name`, and NOT a
    # ConfigMap key. values.yaml used to name it `disable-service-external-name`
    # in the controller ConfigMap; that was tried here first and the route kept
    # serving, upstream unchanged in the access log, no warning logged —
    # an unknown ConfigMap key is silently ignored. A cluster believed to have
    # blocked ExternalName that way has not. Corrected in values.yaml.
    ARGS_PATH="/spec/template/spec/containers/0/args"
    ext_flag_index() { kubectl -n ingress-nginx get deployment ingress-nginx-controller \
        -o go-template="{{range \$i,\$a := (index .spec.template.spec.containers 0).args}}{{if eq \$a \"--disable-svc-external-name=true\"}}{{\$i}}{{end}}{{end}}"; }
    kubectl -n ingress-nginx patch deployment ingress-nginx-controller --type=json \
        -p "[{\"op\":\"add\",\"path\":\"$ARGS_PATH/-\",\"value\":\"--disable-svc-external-name=true\"}]" >/dev/null
    kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller --timeout=180s >/dev/null
    wait_code() { local c; for _ in $(seq 40); do
            c="$(rigcurl -s -o /dev/null -w '%{http_code}' "$APP_URL/objects/$STORE_BUCKET/$KEY")"
            [ "$c" = "$1" ] && break; sleep 1; done; printf '%s' "$c"; }
    check "with --disable-svc-external-name the route 503s (so 200 was not vacuous)" \
        "503" "$(wait_code 503)"
    idx="$(ext_flag_index)"
    [ -n "$idx" ] && kubectl -n ingress-nginx patch deployment ingress-nginx-controller \
        --type=json -p "[{\"op\":\"remove\",\"path\":\"$ARGS_PATH/$idx\"}]" >/dev/null
    kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller --timeout=180s >/dev/null
    check "and it recovers when the flag goes away" "200" "$(wait_code 200)"
fi

# =====================================================================
step "4 · a login round-trip through the ingress hostname"
# =====================================================================
disc="$(rigcurl -s "$AUTH_URL/realms/hackagon/.well-known/openid-configuration")"
check_contains "Keycloak's discovery names the public issuer" \
    "\"issuer\":\"$AUTH_URL/realms/hackagon\"" "$disc"

# REGRESSION GUARD for the frontend's public origin. adapter-node infers the
# scheme; with nothing configured it assumes "https", and then advertises
# callback URLs on an origin that does not exist, issues `__Secure-` cookies
# over http, and login dies with every page still answering 200. That is what
# frontend.protocolHeader is for. Asserting the ADVERTISED origin rather than
# the env var means the check survives however the chart chooses to fix it.
prov="$(rigcurl -s "$APP_URL/auth/providers")"
check_contains "the frontend advertises the origin it is actually reached on" \
    "\"callbackUrl\":\"$APP_URL/auth/callback/keycloak\"" "$prov"

J="$STATE_DIR/login-jar.txt"; rm -f "$J"
lc() { rigcurl -s -b "$J" -c "$J" "$@"; }
form_action() { tr '\n' ' ' <"$1" | grep -oE '<form[^>]*action="[^"]*"' | head -1 \
    | grep -oE 'action="[^"]*"' | sed 's/action="//;s/"$//;s/&amp;/\&/g'; }

lc -o /dev/null "$APP_URL/auth/signin"
AUTHZ="$(lc -o /dev/null -w '%{redirect_url}' -X POST \
    -H "Origin: $APP_URL" -H "Content-Type: application/x-www-form-urlencoded" \
    --data "csrfToken=&callbackUrl=$APP_URL/" "$APP_URL/auth/signin/keycloak")"
check_contains "sign-in redirects to Keycloak's authorize endpoint" \
    "$AUTH_URL/realms/hackagon/protocol/openid-connect/auth" "$AUTHZ"

# The realm's browser flow is username-first, so this is two POSTs, not one.
lc -o "$STATE_DIR/login1.html" "$AUTHZ"
lc -o "$STATE_DIR/login2.html" -X POST --data-urlencode "username=alice" \
    "$(form_action "$STATE_DIR/login1.html")"
CB="$(lc -o /dev/null -w '%{redirect_url}' -X POST \
    --data-urlencode "password=aliceandbob" --data "credentialId=" \
    "$(form_action "$STATE_DIR/login2.html")")"
check_contains "Keycloak redirects back to the app with a code" \
    "$APP_URL/auth/callback/keycloak?" "$CB"

# THE hop. Everything before it can succeed while this returns 502: the
# callback's Set-Cookie block is chunked and multi-kilobyte, and nginx's default
# 4k proxy buffer refuses it AFTER Keycloak has authenticated and the app has
# logged "Initial sign-in successful". See frontend.ingress.proxyBufferSize.
check "the OIDC callback completes (not 502)" "302" \
    "$(lc -o /dev/null -w '%{http_code}' "$CB")"

sess="$(lc "$APP_URL/auth/session")"
check_contains "the session is established for the user who signed in" \
    '"email":"alice@mail.com"' "$sess"
check_contains "and it carries a Keycloak access token" '"accessToken":"ey' "$sess"

# =====================================================================
step "5 · the optional blocks are absent from the RUNNING pod"
# =====================================================================
# Read out of the live container, not out of `helm template` and not out of the
# ConfigMap: the question is what the process is actually configured with. The
# frontend image is distroless — no shell, no tar — so `kubectl exec` and
# `kubectl cp` are both out. An ephemeral debug container sharing the process
# namespace can read the real mount through /proc/1/root.
#
# `--profile=sysadmin` is needed, not decoration: with the default profile the
# read comes back "cat: can't open '/proc/1/root/…': Permission denied" even
# though both containers run as uid 0. That failure is WHY the positive control
# below is first — the two absence assertions passed against that error message,
# and would have gone on passing forever.
POD="$(kubectl -n "$NAMESPACE" get pod -l app.kubernetes.io/component=frontend \
    -o jsonpath='{.items[0].metadata.name}')"
DBG="rigread$STAMP"
kubectl -n "$NAMESPACE" debug "$POD" --image=busybox:1.36 --target=frontend \
    --profile=sysadmin -c "$DBG" -q \
    -- sh -c 'cat /proc/1/root/etc/hackagon/config.yaml' >/dev/null 2>&1 || true
LIVE=""
for _ in $(seq 40); do
    LIVE="$(kubectl -n "$NAMESPACE" logs "$POD" -c "$DBG" 2>/dev/null || true)"
    [ -n "$LIVE" ] && break
    sleep 2
done

# POSITIVE CONTROL FIRST. An empty read agrees with every absence assertion
# below, and on the first attempt at this the read WAS empty.
check_contains "the live config was actually read (positive control)" "clientId:" "$LIVE"
check_lacks "no replay: block reaches the running frontend" "replay:" "$LIVE"
check_lacks "no plausible: block reaches the running frontend" "plausible:" "$LIVE"
check_contains "…while the blocks that ARE configured are present" "useSecure:" "$LIVE"

ENVJSON="$(kubectl -n "$NAMESPACE" get deployment "$RELEASE-frontend" \
    -o go-template='{{range .spec.template.spec.containers}}{{range .env}}{{.name}} {{end}}{{end}}')"
check_lacks "and nothing smuggles them in as environment" "REPLAY" "$ENVJSON"

# =====================================================================
step "result"
# =====================================================================
say "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
