{{/*
Expand the name of the chart.
*/}}
{{- define "hackagon.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "hackagon.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "hackagon.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "hackagon.labels" -}}
helm.sh/chart: {{ include "hackagon.chart" . }}
{{ include "hackagon.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "hackagon.selectorLabels" -}}
app.kubernetes.io/name: {{ include "hackagon.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "hackagon.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "hackagon.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Base domain with substitution
*/}}
{{- define "hackagon.baseDomain" -}}
{{- .Values.baseDomain | replace "{baseDomain}" .Values.baseDomain }}
{{- end }}

{{/*
Frontend host with substitution
*/}}
{{- define "hackagon.frontendHost" -}}
{{- printf "app.%s" (include "hackagon.baseDomain" .) | replace "{baseDomain}" .Values.baseDomain }}
{{- end }}

{{/*
Keycloak host with substitution.

`auth.{baseDomain}` unless `keycloak.ingress.host` names one, and the override
exists because the derived name is a level DEEPER than the app's whenever the
app is not itself at `app.{baseDomain}` — `frontend.ingress.hosts[].host` has
always been free-form, this was not.

That extra label is not cosmetic. A one-label wildcard certificate covers
`app.example.org` and not `auth.app.example.org`; Cloudflare's free Universal
SSL is exactly such a certificate (apex + one label, nothing deeper) and answers
a handshake for anything below it with TLS alert 40 — measured against the edge,
not deduced. A deployment fronted that way could therefore
publish the product on a certificate that does not cover its login, which is the
same shape as the hard-coded ingressClass bug this file's Keycloak Ingress
already carries a note about: the app works, the sign-in does not.

Same `{baseDomain}` / `{releaseName}` substitution as every other host value, so
one string can stay portable across environments.
*/}}
{{- define "hackagon.keycloakHost" -}}
{{- if .Values.keycloak.ingress.host -}}
{{- .Values.keycloak.ingress.host | replace "{baseDomain}" .Values.baseDomain | replace "{releaseName}" .Release.Name }}
{{- else -}}
{{- printf "auth.%s" (include "hackagon.baseDomain" .) | replace "{baseDomain}" .Values.baseDomain }}
{{- end }}
{{- end }}

{{/*
Frontend service name
*/}}
{{- define "hackagon.frontendServiceName" -}}
{{- printf "%s-frontend" (include "hackagon.fullname" .) }}
{{- end }}

{{/*
Backend service name
*/}}
{{- define "hackagon.backendServiceName" -}}
{{- printf "%s-backend" (include "hackagon.fullname" .) }}
{{- end }}

{{/*
Generate a random alphanumeric string of given length
Usage: include "hackagon.randAlphaNum" (dict "length" 32)
*/}}
{{- define "hackagon.randAlphaNum" -}}
{{- randAlphaNum .length | lower }}
{{- end }}

{{/*
Keycloak service name (bitnami chart names it <release>-keycloak)
*/}}
{{- define "hackagon.keycloakServiceName" -}}
{{- printf "%s-keycloak" .Release.Name }}
{{- end }}

{{/*
PostgreSQL service name (bitnami chart names it <release>-postgresql)
*/}}
{{- define "hackagon.postgresqlServiceName" -}}
{{- printf "%s-postgresql" .Release.Name }}
{{- end }}

{{/*
Get password: use provided value or generate one
*/}}
{{- define "hackagon.getPassword" -}}
{{- if .value }}
{{- .value | b64enc }}
{{- else }}
{{- include "hackagon.randAlphaNum" .length | b64enc }}
{{- end }}
{{- end }}

{{/*
=========================================================================
Object store (StorageService)
=========================================================================
Uploads never pass through the app: the backend signs a URL and the BROWSER
talks to the store. Everything below exists to keep the one value the browser
uses (`/objects/…`) resolving to the store with the Host the signature was
computed over. See values.yaml `storage:` for the whole story.
*/}}

{{/*
The store endpoint, parsed. Fails the render when storage is enabled and no
endpoint was given, rather than deploying a backend that silently falls back to
its DEVELOPMENT default (http://rustfs:9000 with the committed dev keys).
*/}}
{{- define "hackagon.storageEndpointURL" -}}
{{- required "storage.endpoint is required when storage.enabled (e.g. https://s3.eu-central-1.amazonaws.com)" .Values.storage.endpoint | trimSuffix "/" }}
{{- end }}

{{/*
The Host header SigV4 signs, and therefore the Host every proxy in front of the
store must send upstream.

This mirrors `signHost` in components/backend/internal/storage/client.go
EXACTLY, port included: path-style signs the endpoint's host, virtual-hosted
style signs <bucket>.<host>. A mismatch here answers 403 SignatureDoesNotMatch
on every presigned PUT while unsigned public reads keep working — which is why
it can go unnoticed for days.
*/}}
{{- define "hackagon.storageSignHost" -}}
{{- $u := urlParse (include "hackagon.storageEndpointURL" .) -}}
{{- if .Values.storage.usePathStyle -}}
{{- $u.host }}
{{- else -}}
{{- printf "%s.%s" (required "storage.bucket is required when storage.enabled" .Values.storage.bucket) $u.host }}
{{- end }}
{{- end }}

{{/*
The store's DNS name, without the port — what an ExternalName Service resolves.
*/}}
{{- define "hackagon.storageHostname" -}}
{{- $u := urlParse (include "hackagon.storageEndpointURL" .) -}}
{{- $u.hostname }}
{{- end }}

{{/*
The store's TCP port: taken from the endpoint when it names one, otherwise the
default for its scheme.
*/}}
{{- define "hackagon.storagePort" -}}
{{- $u := urlParse (include "hackagon.storageEndpointURL" .) -}}
{{- $parts := splitList ":" $u.host -}}
{{- if gt (len $parts) 1 -}}
{{- last $parts }}
{{- else if eq $u.scheme "https" -}}
443
{{- else -}}
80
{{- end }}
{{- end }}

{{/*
HTTP or HTTPS to the store, in the spelling ingress-nginx wants.
*/}}
{{- define "hackagon.storageBackendProtocol" -}}
{{- $u := urlParse (include "hackagon.storageEndpointURL" .) -}}
{{- if eq $u.scheme "https" -}}HTTPS{{- else -}}HTTP{{- end }}
{{- end }}

{{/*
Service the /objects Ingress routes to: the one named in values, or the
ExternalName Service this chart creates for the endpoint.
*/}}
{{- define "hackagon.storageObjectsServiceName" -}}
{{- if .Values.storage.objects.ingress.service.name -}}
{{- .Values.storage.objects.ingress.service.name }}
{{- else -}}
{{- printf "%s-objects" (include "hackagon.fullname" .) }}
{{- end }}
{{- end }}

{{- define "hackagon.storageObjectsServicePort" -}}
{{- if .Values.storage.objects.ingress.service.name -}}
{{- required "storage.objects.ingress.service.port is required when service.name is set" .Values.storage.objects.ingress.service.port }}
{{- else -}}
{{- include "hackagon.storagePort" . }}
{{- end }}
{{- end }}

{{/*
The path uploads are served under, without a trailing slash. Both the Ingress
rule and the backend's `publicprefix` come from here, so they cannot drift: the
backend hands the browser `<publicPrefix>/<bucket>/<key>` and something has to
be listening on exactly that path.
*/}}
{{- define "hackagon.storagePublicPrefix" -}}
{{- .Values.storage.publicPrefix | default "/objects" | trimSuffix "/" }}
{{- end }}