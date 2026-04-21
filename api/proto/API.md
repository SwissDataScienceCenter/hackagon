# Protocol Documentation
<a name="top"></a>

## Table of Contents

- [hackathon_service.proto](#hackathon_service-proto)
    - [HackathonSvc](#hackathon-HackathonSvc)
  
- [health_service.proto](#health_service-proto)
    - [HealthSvc](#health-HealthSvc)
  
- [user_service.proto](#user_service-proto)
    - [UserSvc](#user-UserSvc)
  
- [hackathon/entities/hackathon_member.proto](#hackathon_entities_hackathon_member-proto)
    - [HackathonMember](#hackathon-HackathonMember)
  
- [hackathon/entities/hackathon.proto](#hackathon_entities_hackathon-proto)
    - [Hackathon](#hackathon-Hackathon)
  
- [hackathon/entities/hackathon_role.proto](#hackathon_entities_hackathon_role-proto)
    - [HackathonRole](#hackathon-HackathonRole)
  
- [hackathon/entities/hackathon_status.proto](#hackathon_entities_hackathon_status-proto)
    - [HackathonStatus](#hackathon-HackathonStatus)
  
- [hackathon/entities/visibility.proto](#hackathon_entities_visibility-proto)
    - [Visibility](#hackathon-Visibility)
  
- [hackathon/messages/add_owner_request.proto](#hackathon_messages_add_owner_request-proto)
    - [AddOwnerRequest](#hackathon-AddOwnerRequest)
  
- [hackathon/messages/add_page_request.proto](#hackathon_messages_add_page_request-proto)
    - [AddPageRequest](#hackathon-AddPageRequest)
  
- [hackathon/messages/add_page_response.proto](#hackathon_messages_add_page_response-proto)
    - [AddPageResponse](#hackathon-AddPageResponse)
  
- [hackathon/messages/create_hackathon_request.proto](#hackathon_messages_create_hackathon_request-proto)
    - [CreateHackathonRequest](#hackathon-CreateHackathonRequest)
  
- [hackathon/messages/create_hackathon_response.proto](#hackathon_messages_create_hackathon_response-proto)
    - [CreateHackathonResponse](#hackathon-CreateHackathonResponse)
  
- [hackathon/messages/delete_page_request.proto](#hackathon_messages_delete_page_request-proto)
    - [DeletePageRequest](#hackathon-DeletePageRequest)
  
- [hackathon/messages/get_hackathon_request.proto](#hackathon_messages_get_hackathon_request-proto)
    - [GetHackathonRequest](#hackathon-GetHackathonRequest)
  
- [hackathon/messages/get_hackathon_response.proto](#hackathon_messages_get_hackathon_response-proto)
    - [GetHackathonResponse](#hackathon-GetHackathonResponse)
  
- [hackathon/messages/join_request.proto](#hackathon_messages_join_request-proto)
    - [JoinRequest](#hackathon-JoinRequest)
  
- [hackathon/messages/list_hackathon_request.proto](#hackathon_messages_list_hackathon_request-proto)
    - [ListHackathonRequest](#hackathon-ListHackathonRequest)
  
- [hackathon/messages/list_hackathon_response.proto](#hackathon_messages_list_hackathon_response-proto)
    - [ListHackathonResponse](#hackathon-ListHackathonResponse)
  
- [hackathon/messages/remove_owner_request.proto](#hackathon_messages_remove_owner_request-proto)
    - [RemoveOwnerRequest](#hackathon-RemoveOwnerRequest)
  
- [hackathon/messages/remove_participant_request.proto](#hackathon_messages_remove_participant_request-proto)
    - [RemoveParticipantRequest](#hackathon-RemoveParticipantRequest)
  
- [hackathon_service.proto](#hackathon_service-proto)
    - [HackathonSvc](#hackathon-HackathonSvc)
  
- [health/messages/health_check_request.proto](#health_messages_health_check_request-proto)
    - [HealthCheckRequest](#health-HealthCheckRequest)
  
- [health/messages/health_check_response.proto](#health_messages_health_check_response-proto)
    - [HealthCheckResponse](#health-HealthCheckResponse)
  
- [health_service.proto](#health_service-proto)
    - [HealthSvc](#health-HealthSvc)
  
- [user/entities/global_role.proto](#user_entities_global_role-proto)
    - [GlobalRole](#user-GlobalRole)
  
- [user/entities/user.proto](#user_entities_user-proto)
    - [UserEntry](#user-UserEntry)
  
- [user/messages/add_role_request.proto](#user_messages_add_role_request-proto)
    - [AddRoleRequest](#user-AddRoleRequest)
  
- [user/messages/add_role_response.proto](#user_messages_add_role_response-proto)
    - [AddRoleResponse](#user-AddRoleResponse)
  
- [user/messages/register_request.proto](#user_messages_register_request-proto)
    - [RegisterRequest](#user-RegisterRequest)
  
- [user/messages/register_response.proto](#user_messages_register_response-proto)
    - [RegisterResponse](#user-RegisterResponse)
  
- [user/messages/remove_role_request.proto](#user_messages_remove_role_request-proto)
    - [RemoveRoleRequest](#user-RemoveRoleRequest)
  
- [user/messages/remove_role_response.proto](#user_messages_remove_role_response-proto)
    - [RemoveRoleResponse](#user-RemoveRoleResponse)
  
- [user/messages/user_get_request.proto](#user_messages_user_get_request-proto)
    - [UserGetRequest](#user-UserGetRequest)
  
- [user/messages/user_get_response.proto](#user_messages_user_get_response-proto)
    - [UserGetResponse](#user-UserGetResponse)
  
- [user/messages/user_list_request.proto](#user_messages_user_list_request-proto)
    - [UserListRequest](#user-UserListRequest)
  
- [user/messages/user_list_response.proto](#user_messages_user_list_response-proto)
    - [UserListResponse](#user-UserListResponse)
  
- [user/messages/who_am_i_request.proto](#user_messages_who_am_i_request-proto)
    - [WhoAmIRequest](#user-WhoAmIRequest)
  
- [user/messages/who_am_i_response.proto](#user_messages_who_am_i_response-proto)
    - [WhoAmIResponse](#user-WhoAmIResponse)
  
- [user_service.proto](#user_service-proto)
    - [UserSvc](#user-UserSvc)
  
- [Scalar Value Types](#scalar-value-types)



<a name="hackathon_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon_service.proto


 

 

 


<a name="hackathon-HackathonSvc"></a>

### HackathonSvc


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [ListHackathonRequest](#hackathon-ListHackathonRequest) | [ListHackathonResponse](#hackathon-ListHackathonResponse) |  |
| Get | [GetHackathonRequest](#hackathon-GetHackathonRequest) | [GetHackathonResponse](#hackathon-GetHackathonResponse) |  |
| Create | [CreateHackathonRequest](#hackathon-CreateHackathonRequest) | [CreateHackathonResponse](#hackathon-CreateHackathonResponse) |  |
| Join | [JoinRequest](#hackathon-JoinRequest) | [.google.protobuf.Empty](#google-protobuf-Empty) |  |
| RemoveParticipant | [RemoveParticipantRequest](#hackathon-RemoveParticipantRequest) | [.google.protobuf.Empty](#google-protobuf-Empty) |  |
| AddOwner | [AddOwnerRequest](#hackathon-AddOwnerRequest) | [.google.protobuf.Empty](#google-protobuf-Empty) |  |
| RemoveOwner | [RemoveOwnerRequest](#hackathon-RemoveOwnerRequest) | [.google.protobuf.Empty](#google-protobuf-Empty) |  |
| AddPage | [AddPageRequest](#hackathon-AddPageRequest) | [AddPageResponse](#hackathon-AddPageResponse) |  |
| DeletePage | [DeletePageRequest](#hackathon-DeletePageRequest) | [.google.protobuf.Empty](#google-protobuf-Empty) |  |

 



<a name="health_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## health_service.proto


 

 

 


<a name="health-HealthSvc"></a>

### HealthSvc


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| Check | [HealthCheckRequest](#health-HealthCheckRequest) | [HealthCheckResponse](#health-HealthCheckResponse) |  |

 



<a name="user_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user_service.proto


 

 

 


<a name="user-UserSvc"></a>

### UserSvc


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [UserListRequest](#user-UserListRequest) | [UserListResponse](#user-UserListResponse) |  |
| Get | [UserGetRequest](#user-UserGetRequest) | [UserGetResponse](#user-UserGetResponse) |  |
| WhoAmI | [WhoAmIRequest](#user-WhoAmIRequest) | [WhoAmIResponse](#user-WhoAmIResponse) |  |
| Register | [RegisterRequest](#user-RegisterRequest) | [RegisterResponse](#user-RegisterResponse) |  |
| AddRole | [AddRoleRequest](#user-AddRoleRequest) | [AddRoleResponse](#user-AddRoleResponse) |  |
| RemoveRole | [RemoveRoleRequest](#user-RemoveRoleRequest) | [RemoveRoleResponse](#user-RemoveRoleResponse) |  |

 



<a name="hackathon_entities_hackathon_member-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_member.proto



<a name="hackathon-HackathonMember"></a>

### HackathonMember



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| role | [HackathonRole](#hackathon-HackathonRole) |  |  |





 

 

 

 



<a name="hackathon_entities_hackathon-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon.proto



<a name="hackathon-Hackathon"></a>

### Hackathon



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| start_date | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| end_date | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| visibility | [Visibility](#hackathon-Visibility) |  |  |
| status | [HackathonStatus](#hackathon-HackathonStatus) |  |  |
| description | [string](#string) | optional |  |
| logo | [string](#string) | optional |  |
| members | [HackathonMember](#hackathon-HackathonMember) | repeated |  |





 

 

 

 



<a name="hackathon_entities_hackathon_role-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_role.proto


 


<a name="hackathon-HackathonRole"></a>

### HackathonRole


| Name | Number | Description |
| ---- | ------ | ----------- |
| HACKATHON_ROLE_OWNER | 0 |  |
| HACKATHON_ROLE_MEMBER | 1 |  |


 

 

 



<a name="hackathon_entities_hackathon_status-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_status.proto


 


<a name="hackathon-HackathonStatus"></a>

### HackathonStatus


| Name | Number | Description |
| ---- | ------ | ----------- |
| HACKATHON_STATUS_PENDING | 0 |  |
| HACKATHON_STATUS_ACTIVE | 1 |  |
| HACKATHON_STATUS_FINISHED | 2 |  |


 

 

 



<a name="hackathon_entities_visibility-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/visibility.proto


 


<a name="hackathon-Visibility"></a>

### Visibility


| Name | Number | Description |
| ---- | ------ | ----------- |
| VISIBILITY_PUBLIC | 0 |  |
| VISIBILITY_PRIVATE | 1 |  |


 

 

 



<a name="hackathon_messages_add_owner_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/add_owner_request.proto



<a name="hackathon-AddOwnerRequest"></a>

### AddOwnerRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_add_page_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/add_page_request.proto



<a name="hackathon-AddPageRequest"></a>

### AddPageRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| title | [string](#string) |  |  |
| content | [string](#string) |  |  |
| visible | [bool](#bool) |  |  |
| order | [int32](#int32) |  |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |





 

 

 

 



<a name="hackathon_messages_add_page_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/add_page_response.proto



<a name="hackathon-AddPageResponse"></a>

### AddPageResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_create_hackathon_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/create_hackathon_request.proto



<a name="hackathon-CreateHackathonRequest"></a>

### CreateHackathonRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| name | [string](#string) |  |  |
| start_date | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| end_date | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| visibility | [Visibility](#hackathon-Visibility) |  |  |
| description | [string](#string) | optional |  |
| logo | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_create_hackathon_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/create_hackathon_response.proto



<a name="hackathon-CreateHackathonResponse"></a>

### CreateHackathonResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon | [Hackathon](#hackathon-Hackathon) | repeated |  |





 

 

 

 



<a name="hackathon_messages_delete_page_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/delete_page_request.proto



<a name="hackathon-DeletePageRequest"></a>

### DeletePageRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_get_hackathon_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/get_hackathon_request.proto



<a name="hackathon-GetHackathonRequest"></a>

### GetHackathonRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_get_hackathon_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/get_hackathon_response.proto



<a name="hackathon-GetHackathonResponse"></a>

### GetHackathonResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon | [Hackathon](#hackathon-Hackathon) |  |  |





 

 

 

 



<a name="hackathon_messages_join_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/join_request.proto



<a name="hackathon-JoinRequest"></a>

### JoinRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_list_hackathon_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/list_hackathon_request.proto



<a name="hackathon-ListHackathonRequest"></a>

### ListHackathonRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| status_filter | [HackathonStatus](#hackathon-HackathonStatus) | repeated |  |
| owner_id | [string](#string) | optional |  |
| participant_id | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_list_hackathon_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/list_hackathon_response.proto



<a name="hackathon-ListHackathonResponse"></a>

### ListHackathonResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathons | [Hackathon](#hackathon-Hackathon) | repeated |  |





 

 

 

 



<a name="hackathon_messages_remove_owner_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/remove_owner_request.proto



<a name="hackathon-RemoveOwnerRequest"></a>

### RemoveOwnerRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_remove_participant_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/remove_participant_request.proto



<a name="hackathon-RemoveParticipantRequest"></a>

### RemoveParticipantRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon_service.proto


 

 

 


<a name="hackathon-HackathonSvc"></a>

### HackathonSvc


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [ListHackathonRequest](#hackathon-ListHackathonRequest) | [ListHackathonResponse](#hackathon-ListHackathonResponse) |  |
| Get | [GetHackathonRequest](#hackathon-GetHackathonRequest) | [GetHackathonResponse](#hackathon-GetHackathonResponse) |  |
| Create | [CreateHackathonRequest](#hackathon-CreateHackathonRequest) | [CreateHackathonResponse](#hackathon-CreateHackathonResponse) |  |
| Join | [JoinRequest](#hackathon-JoinRequest) | [.google.protobuf.Empty](#google-protobuf-Empty) |  |
| RemoveParticipant | [RemoveParticipantRequest](#hackathon-RemoveParticipantRequest) | [.google.protobuf.Empty](#google-protobuf-Empty) |  |
| AddOwner | [AddOwnerRequest](#hackathon-AddOwnerRequest) | [.google.protobuf.Empty](#google-protobuf-Empty) |  |
| RemoveOwner | [RemoveOwnerRequest](#hackathon-RemoveOwnerRequest) | [.google.protobuf.Empty](#google-protobuf-Empty) |  |
| AddPage | [AddPageRequest](#hackathon-AddPageRequest) | [AddPageResponse](#hackathon-AddPageResponse) |  |
| DeletePage | [DeletePageRequest](#hackathon-DeletePageRequest) | [.google.protobuf.Empty](#google-protobuf-Empty) |  |

 



<a name="health_messages_health_check_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## health/messages/health_check_request.proto



<a name="health-HealthCheckRequest"></a>

### HealthCheckRequest






 

 

 

 



<a name="health_messages_health_check_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## health/messages/health_check_response.proto



<a name="health-HealthCheckResponse"></a>

### HealthCheckResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| message | [string](#string) |  |  |





 

 

 

 



<a name="health_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## health_service.proto


 

 

 


<a name="health-HealthSvc"></a>

### HealthSvc


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| Check | [HealthCheckRequest](#health-HealthCheckRequest) | [HealthCheckResponse](#health-HealthCheckResponse) |  |

 



<a name="user_entities_global_role-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/entities/global_role.proto


 


<a name="user-GlobalRole"></a>

### GlobalRole


| Name | Number | Description |
| ---- | ------ | ----------- |
| GLOBAL_ROLE_ADMIN | 0 |  |
| GLOBAL_ROLE_HACKATHON_ORGANIZER | 1 |  |


 

 

 



<a name="user_entities_user-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/entities/user.proto



<a name="user-UserEntry"></a>

### UserEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| keycloak_id | [string](#string) |  |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| display_name | [string](#string) |  |  |
| email | [string](#string) |  |  |
| roles | [GlobalRole](#user-GlobalRole) | repeated |  |





 

 

 

 



<a name="user_messages_add_role_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/add_role_request.proto



<a name="user-AddRoleRequest"></a>

### AddRoleRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user_id | [string](#string) |  |  |
| role | [GlobalRole](#user-GlobalRole) |  |  |





 

 

 

 



<a name="user_messages_add_role_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/add_role_response.proto



<a name="user-AddRoleResponse"></a>

### AddRoleResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [UserEntry](#user-UserEntry) |  |  |





 

 

 

 



<a name="user_messages_register_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/register_request.proto



<a name="user-RegisterRequest"></a>

### RegisterRequest






 

 

 

 



<a name="user_messages_register_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/register_response.proto



<a name="user-RegisterResponse"></a>

### RegisterResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [UserEntry](#user-UserEntry) |  |  |





 

 

 

 



<a name="user_messages_remove_role_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/remove_role_request.proto



<a name="user-RemoveRoleRequest"></a>

### RemoveRoleRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user_id | [string](#string) |  |  |
| role | [GlobalRole](#user-GlobalRole) |  |  |





 

 

 

 



<a name="user_messages_remove_role_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/remove_role_response.proto



<a name="user-RemoveRoleResponse"></a>

### RemoveRoleResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [UserEntry](#user-UserEntry) |  |  |





 

 

 

 



<a name="user_messages_user_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_get_request.proto



<a name="user-UserGetRequest"></a>

### UserGetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="user_messages_user_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_get_response.proto



<a name="user-UserGetResponse"></a>

### UserGetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [UserEntry](#user-UserEntry) |  |  |





 

 

 

 



<a name="user_messages_user_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_list_request.proto



<a name="user-UserListRequest"></a>

### UserListRequest






 

 

 

 



<a name="user_messages_user_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_list_response.proto



<a name="user-UserListResponse"></a>

### UserListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| users | [UserEntry](#user-UserEntry) | repeated |  |





 

 

 

 



<a name="user_messages_who_am_i_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/who_am_i_request.proto



<a name="user-WhoAmIRequest"></a>

### WhoAmIRequest






 

 

 

 



<a name="user_messages_who_am_i_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/who_am_i_response.proto



<a name="user-WhoAmIResponse"></a>

### WhoAmIResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [UserEntry](#user-UserEntry) |  |  |





 

 

 

 



<a name="user_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user_service.proto


 

 

 


<a name="user-UserSvc"></a>

### UserSvc


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [UserListRequest](#user-UserListRequest) | [UserListResponse](#user-UserListResponse) |  |
| Get | [UserGetRequest](#user-UserGetRequest) | [UserGetResponse](#user-UserGetResponse) |  |
| WhoAmI | [WhoAmIRequest](#user-WhoAmIRequest) | [WhoAmIResponse](#user-WhoAmIResponse) |  |
| Register | [RegisterRequest](#user-RegisterRequest) | [RegisterResponse](#user-RegisterResponse) |  |
| AddRole | [AddRoleRequest](#user-AddRoleRequest) | [AddRoleResponse](#user-AddRoleResponse) |  |
| RemoveRole | [RemoveRoleRequest](#user-RemoveRoleRequest) | [RemoveRoleResponse](#user-RemoveRoleResponse) |  |

 



## Scalar Value Types

| .proto Type | Notes | C++ | Java | Python | Go | C# | PHP | Ruby |
| ----------- | ----- | --- | ---- | ------ | -- | -- | --- | ---- |
| <a name="double" /> double |  | double | double | float | float64 | double | float | Float |
| <a name="float" /> float |  | float | float | float | float32 | float | float | Float |
| <a name="int32" /> int32 | Uses variable-length encoding. Inefficient for encoding negative numbers – if your field is likely to have negative values, use sint32 instead. | int32 | int | int | int32 | int | integer | Bignum or Fixnum (as required) |
| <a name="int64" /> int64 | Uses variable-length encoding. Inefficient for encoding negative numbers – if your field is likely to have negative values, use sint64 instead. | int64 | long | int/long | int64 | long | integer/string | Bignum |
| <a name="uint32" /> uint32 | Uses variable-length encoding. | uint32 | int | int/long | uint32 | uint | integer | Bignum or Fixnum (as required) |
| <a name="uint64" /> uint64 | Uses variable-length encoding. | uint64 | long | int/long | uint64 | ulong | integer/string | Bignum or Fixnum (as required) |
| <a name="sint32" /> sint32 | Uses variable-length encoding. Signed int value. These more efficiently encode negative numbers than regular int32s. | int32 | int | int | int32 | int | integer | Bignum or Fixnum (as required) |
| <a name="sint64" /> sint64 | Uses variable-length encoding. Signed int value. These more efficiently encode negative numbers than regular int64s. | int64 | long | int/long | int64 | long | integer/string | Bignum |
| <a name="fixed32" /> fixed32 | Always four bytes. More efficient than uint32 if values are often greater than 2^28. | uint32 | int | int | uint32 | uint | integer | Bignum or Fixnum (as required) |
| <a name="fixed64" /> fixed64 | Always eight bytes. More efficient than uint64 if values are often greater than 2^56. | uint64 | long | int/long | uint64 | ulong | integer/string | Bignum |
| <a name="sfixed32" /> sfixed32 | Always four bytes. | int32 | int | int | int32 | int | integer | Bignum or Fixnum (as required) |
| <a name="sfixed64" /> sfixed64 | Always eight bytes. | int64 | long | int/long | int64 | long | integer/string | Bignum |
| <a name="bool" /> bool |  | bool | boolean | boolean | bool | bool | boolean | TrueClass/FalseClass |
| <a name="string" /> string | A string must always contain UTF-8 encoded or 7-bit ASCII text. | string | String | str/unicode | string | string | string | String (UTF-8) |
| <a name="bytes" /> bytes | May contain any arbitrary sequence of bytes. | string | ByteString | str | []byte | ByteString | string | String (ASCII-8BIT) |

