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
First ingress host is the canonical frontend hostname.
(in case we have multiple urls)
*/}}
{{- define "hackagon.frontendHost" -}}
{{- $first := first (.Values.frontend.ingress.hosts | default list) | required "frontend.ingress.hosts must name at least one host: it is the app's public name" }}
{{- $first.host | replace "{baseDomain}" .Values.baseDomain | replace "{releaseName}" .Release.Name }}
{{- end }}

{{/*
Public url Keycloak runs under. Required `enabled` or not: browsers are sent
here, and it is the `iss` claim in every token.
*/}}
{{- define "hackagon.keycloakUrl" -}}
{{- .Values.keycloak.hostname.hostname | required "keycloak.hostname.hostname is required (e.g. \"https://auth.example.com\")" | trimSuffix "/" }}
{{- end }}

{{/*
The `iss` claim; the backend rejects a token that does not match it. The realm
is `hackagon` chart-wide, so this is derived rather than configurable.
*/}}
{{- define "hackagon.oidcIssuer" -}}
{{- printf "%s/realms/hackagon" (include "hackagon.keycloakUrl" .) }}
{{- end }}

{{/*
The Keycloak url as a bare hostname, for an ingress `host:` field.
*/}}
{{- define "hackagon.keycloakHost" -}}
{{- include "hackagon.keycloakUrl" . | trimPrefix "https://" | trimPrefix "http://" }}
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
