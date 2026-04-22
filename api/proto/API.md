# Protocol Documentation
<a name="top"></a>

## Table of Contents

- [hackathon/entities/hackathon_member.proto](#hackathon_entities_hackathon_member-proto)
    - [HackathonMember](#hackathon-entities-HackathonMember)
  
- [hackathon/entities/hackathon.proto](#hackathon_entities_hackathon-proto)
    - [Hackathon](#hackathon-entities-Hackathon)
  
- [hackathon/entities/hackathon_role.proto](#hackathon_entities_hackathon_role-proto)
    - [HackathonRole](#hackathon-entities-HackathonRole)
  
- [hackathon/entities/hackathon_status.proto](#hackathon_entities_hackathon_status-proto)
    - [HackathonStatus](#hackathon-entities-HackathonStatus)
  
- [hackathon/entities/visibility.proto](#hackathon_entities_visibility-proto)
    - [Visibility](#hackathon-entities-Visibility)
  
- [hackathon/hackathon_service.proto](#hackathon_hackathon_service-proto)
    - [HackathonService](#hackathon-HackathonService)
  
- [hackathon/messages/add_owner_request.proto](#hackathon_messages_add_owner_request-proto)
    - [AddOwnerRequest](#hackathon-messages-AddOwnerRequest)
  
- [hackathon/messages/add_owner_response.proto](#hackathon_messages_add_owner_response-proto)
    - [AddOwnerResponse](#hackathon-messages-AddOwnerResponse)
  
- [hackathon/messages/add_page_request.proto](#hackathon_messages_add_page_request-proto)
    - [AddPageRequest](#hackathon-messages-AddPageRequest)
  
- [hackathon/messages/add_page_response.proto](#hackathon_messages_add_page_response-proto)
    - [AddPageResponse](#hackathon-messages-AddPageResponse)
  
- [hackathon/messages/create_request.proto](#hackathon_messages_create_request-proto)
    - [CreateRequest](#hackathon-messages-CreateRequest)
  
- [hackathon/messages/create_response.proto](#hackathon_messages_create_response-proto)
    - [CreateResponse](#hackathon-messages-CreateResponse)
  
- [hackathon/messages/delete_page_request.proto](#hackathon_messages_delete_page_request-proto)
    - [DeletePageRequest](#hackathon-messages-DeletePageRequest)
  
- [hackathon/messages/delete_page_response.proto](#hackathon_messages_delete_page_response-proto)
    - [DeletePageResponse](#hackathon-messages-DeletePageResponse)
  
- [hackathon/messages/get_request.proto](#hackathon_messages_get_request-proto)
    - [GetRequest](#hackathon-messages-GetRequest)
  
- [hackathon/messages/get_response.proto](#hackathon_messages_get_response-proto)
    - [GetResponse](#hackathon-messages-GetResponse)
  
- [hackathon/messages/join_request.proto](#hackathon_messages_join_request-proto)
    - [JoinRequest](#hackathon-messages-JoinRequest)
  
- [hackathon/messages/join_response.proto](#hackathon_messages_join_response-proto)
    - [JoinResponse](#hackathon-messages-JoinResponse)
  
- [hackathon/messages/list_request.proto](#hackathon_messages_list_request-proto)
    - [ListRequest](#hackathon-messages-ListRequest)
  
- [hackathon/messages/list_response.proto](#hackathon_messages_list_response-proto)
    - [ListResponse](#hackathon-messages-ListResponse)
  
- [hackathon/messages/remove_owner_request.proto](#hackathon_messages_remove_owner_request-proto)
    - [RemoveOwnerRequest](#hackathon-messages-RemoveOwnerRequest)
  
- [hackathon/messages/remove_owner_response.proto](#hackathon_messages_remove_owner_response-proto)
    - [RemoveOwnerResponse](#hackathon-messages-RemoveOwnerResponse)
  
- [hackathon/messages/remove_participant_request.proto](#hackathon_messages_remove_participant_request-proto)
    - [RemoveParticipantRequest](#hackathon-messages-RemoveParticipantRequest)
  
- [hackathon/messages/remove_participant_response.proto](#hackathon_messages_remove_participant_response-proto)
    - [RemoveParticipantResponse](#hackathon-messages-RemoveParticipantResponse)
  
- [health/health_service.proto](#health_health_service-proto)
    - [HealthService](#health-HealthService)
  
- [health/messages/check_request.proto](#health_messages_check_request-proto)
    - [CheckRequest](#health-messages-CheckRequest)
  
- [health/messages/check_response.proto](#health_messages_check_response-proto)
    - [CheckResponse](#health-messages-CheckResponse)
  
- [user/entities/global_role.proto](#user_entities_global_role-proto)
    - [GlobalRole](#user-entities-GlobalRole)
  
- [user/entities/user.proto](#user_entities_user-proto)
    - [User](#user-entities-User)
  
- [user/messages/add_role_request.proto](#user_messages_add_role_request-proto)
    - [AddRoleRequest](#user-messages-AddRoleRequest)
  
- [user/messages/add_role_response.proto](#user_messages_add_role_response-proto)
    - [AddRoleResponse](#user-messages-AddRoleResponse)
  
- [user/messages/get_request.proto](#user_messages_get_request-proto)
    - [GetRequest](#user-messages-GetRequest)
  
- [user/messages/get_response.proto](#user_messages_get_response-proto)
    - [GetResponse](#user-messages-GetResponse)
  
- [user/messages/list_request.proto](#user_messages_list_request-proto)
    - [ListRequest](#user-messages-ListRequest)
  
- [user/messages/list_response.proto](#user_messages_list_response-proto)
    - [ListResponse](#user-messages-ListResponse)
  
- [user/messages/register_request.proto](#user_messages_register_request-proto)
    - [RegisterRequest](#user-messages-RegisterRequest)
  
- [user/messages/register_response.proto](#user_messages_register_response-proto)
    - [RegisterResponse](#user-messages-RegisterResponse)
  
- [user/messages/remove_role_request.proto](#user_messages_remove_role_request-proto)
    - [RemoveRoleRequest](#user-messages-RemoveRoleRequest)
  
- [user/messages/remove_role_response.proto](#user_messages_remove_role_response-proto)
    - [RemoveRoleResponse](#user-messages-RemoveRoleResponse)
  
- [user/messages/who_am_i_request.proto](#user_messages_who_am_i_request-proto)
    - [WhoAmIRequest](#user-messages-WhoAmIRequest)
  
- [user/messages/who_am_i_response.proto](#user_messages_who_am_i_response-proto)
    - [WhoAmIResponse](#user-messages-WhoAmIResponse)
  
- [user/user_service.proto](#user_user_service-proto)
    - [UserService](#user-UserService)
  
- [Scalar Value Types](#scalar-value-types)



<a name="hackathon_entities_hackathon_member-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_member.proto



<a name="hackathon-entities-HackathonMember"></a>

### HackathonMember



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| role | [HackathonRole](#hackathon-entities-HackathonRole) |  |  |





 

 

 

 



<a name="hackathon_entities_hackathon-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon.proto



<a name="hackathon-entities-Hackathon"></a>

### Hackathon



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| start_date | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| end_date | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| visibility | [Visibility](#hackathon-entities-Visibility) |  |  |
| status | [HackathonStatus](#hackathon-entities-HackathonStatus) |  |  |
| description | [string](#string) | optional |  |
| logo | [string](#string) | optional |  |
| members | [HackathonMember](#hackathon-entities-HackathonMember) | repeated |  |





 

 

 

 



<a name="hackathon_entities_hackathon_role-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_role.proto


 


<a name="hackathon-entities-HackathonRole"></a>

### HackathonRole


| Name | Number | Description |
| ---- | ------ | ----------- |
| HACKATHON_ROLE_UNSPECIFIED | 0 |  |
| HACKATHON_ROLE_OWNER | 1 |  |
| HACKATHON_ROLE_MEMBER | 2 |  |


 

 

 



<a name="hackathon_entities_hackathon_status-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_status.proto


 


<a name="hackathon-entities-HackathonStatus"></a>

### HackathonStatus


| Name | Number | Description |
| ---- | ------ | ----------- |
| HACKATHON_STATUS_UNSPECIFIED | 0 |  |
| HACKATHON_STATUS_PENDING | 1 |  |
| HACKATHON_STATUS_ACTIVE | 2 |  |
| HACKATHON_STATUS_FINISHED | 3 |  |


 

 

 



<a name="hackathon_entities_visibility-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/visibility.proto


 


<a name="hackathon-entities-Visibility"></a>

### Visibility


| Name | Number | Description |
| ---- | ------ | ----------- |
| VISIBILITY_UNSPECIFIED | 0 |  |
| VISIBILITY_PUBLIC | 1 |  |
| VISIBILITY_PRIVATE | 2 |  |


 

 

 



<a name="hackathon_hackathon_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/hackathon_service.proto


 

 

 


<a name="hackathon-HackathonService"></a>

### HackathonService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [messages.ListRequest](#hackathon-messages-ListRequest) | [messages.ListResponse](#hackathon-messages-ListResponse) |  |
| Get | [messages.GetRequest](#hackathon-messages-GetRequest) | [messages.GetResponse](#hackathon-messages-GetResponse) |  |
| Create | [messages.CreateRequest](#hackathon-messages-CreateRequest) | [messages.CreateResponse](#hackathon-messages-CreateResponse) |  |
| Join | [messages.JoinRequest](#hackathon-messages-JoinRequest) | [messages.JoinResponse](#hackathon-messages-JoinResponse) |  |
| RemoveParticipant | [messages.RemoveParticipantRequest](#hackathon-messages-RemoveParticipantRequest) | [messages.RemoveParticipantResponse](#hackathon-messages-RemoveParticipantResponse) |  |
| AddOwner | [messages.AddOwnerRequest](#hackathon-messages-AddOwnerRequest) | [messages.AddOwnerResponse](#hackathon-messages-AddOwnerResponse) |  |
| RemoveOwner | [messages.RemoveOwnerRequest](#hackathon-messages-RemoveOwnerRequest) | [messages.RemoveOwnerResponse](#hackathon-messages-RemoveOwnerResponse) |  |
| AddPage | [messages.AddPageRequest](#hackathon-messages-AddPageRequest) | [messages.AddPageResponse](#hackathon-messages-AddPageResponse) |  |
| DeletePage | [messages.DeletePageRequest](#hackathon-messages-DeletePageRequest) | [messages.DeletePageResponse](#hackathon-messages-DeletePageResponse) |  |

 



<a name="hackathon_messages_add_owner_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/add_owner_request.proto



<a name="hackathon-messages-AddOwnerRequest"></a>

### AddOwnerRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_add_owner_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/add_owner_response.proto



<a name="hackathon-messages-AddOwnerResponse"></a>

### AddOwnerResponse






 

 

 

 



<a name="hackathon_messages_add_page_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/add_page_request.proto



<a name="hackathon-messages-AddPageRequest"></a>

### AddPageRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| title | [string](#string) |  |  |
| content | [string](#string) |  |  |
| visible | [bool](#bool) |  |  |
| order | [int32](#int32) |  |  |





 

 

 

 



<a name="hackathon_messages_add_page_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/add_page_response.proto



<a name="hackathon-messages-AddPageResponse"></a>

### AddPageResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_create_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/create_request.proto



<a name="hackathon-messages-CreateRequest"></a>

### CreateRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| name | [string](#string) |  |  |
| start_date | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| end_date | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| visibility | [hackathon.entities.Visibility](#hackathon-entities-Visibility) |  |  |
| description | [string](#string) | optional |  |
| logo | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_create_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/create_response.proto



<a name="hackathon-messages-CreateResponse"></a>

### CreateResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon | [hackathon.entities.Hackathon](#hackathon-entities-Hackathon) | repeated |  |





 

 

 

 



<a name="hackathon_messages_delete_page_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/delete_page_request.proto



<a name="hackathon-messages-DeletePageRequest"></a>

### DeletePageRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_delete_page_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/delete_page_response.proto



<a name="hackathon-messages-DeletePageResponse"></a>

### DeletePageResponse






 

 

 

 



<a name="hackathon_messages_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/get_request.proto



<a name="hackathon-messages-GetRequest"></a>

### GetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/get_response.proto



<a name="hackathon-messages-GetResponse"></a>

### GetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon | [hackathon.entities.Hackathon](#hackathon-entities-Hackathon) |  |  |





 

 

 

 



<a name="hackathon_messages_join_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/join_request.proto



<a name="hackathon-messages-JoinRequest"></a>

### JoinRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_join_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/join_response.proto



<a name="hackathon-messages-JoinResponse"></a>

### JoinResponse






 

 

 

 



<a name="hackathon_messages_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/list_request.proto



<a name="hackathon-messages-ListRequest"></a>

### ListRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| status_filter | [hackathon.entities.HackathonStatus](#hackathon-entities-HackathonStatus) | repeated |  |
| owner_id | [string](#string) | optional |  |
| participant_id | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/list_response.proto



<a name="hackathon-messages-ListResponse"></a>

### ListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathons | [hackathon.entities.Hackathon](#hackathon-entities-Hackathon) | repeated |  |





 

 

 

 



<a name="hackathon_messages_remove_owner_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/remove_owner_request.proto



<a name="hackathon-messages-RemoveOwnerRequest"></a>

### RemoveOwnerRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_remove_owner_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/remove_owner_response.proto



<a name="hackathon-messages-RemoveOwnerResponse"></a>

### RemoveOwnerResponse






 

 

 

 



<a name="hackathon_messages_remove_participant_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/remove_participant_request.proto



<a name="hackathon-messages-RemoveParticipantRequest"></a>

### RemoveParticipantRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_remove_participant_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/remove_participant_response.proto



<a name="hackathon-messages-RemoveParticipantResponse"></a>

### RemoveParticipantResponse






 

 

 

 



<a name="health_health_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## health/health_service.proto


 

 

 


<a name="health-HealthService"></a>

### HealthService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| Check | [messages.CheckRequest](#health-messages-CheckRequest) | [messages.CheckResponse](#health-messages-CheckResponse) |  |

 



<a name="health_messages_check_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## health/messages/check_request.proto



<a name="health-messages-CheckRequest"></a>

### CheckRequest






 

 

 

 



<a name="health_messages_check_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## health/messages/check_response.proto



<a name="health-messages-CheckResponse"></a>

### CheckResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| message | [string](#string) |  |  |





 

 

 

 



<a name="user_entities_global_role-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/entities/global_role.proto


 


<a name="user-entities-GlobalRole"></a>

### GlobalRole


| Name | Number | Description |
| ---- | ------ | ----------- |
| GLOBAL_ROLE_UNSPECIFIED | 0 |  |
| GLOBAL_ROLE_ADMIN | 1 |  |
| GLOBAL_ROLE_HACKATHON_ORGANIZER | 2 |  |


 

 

 



<a name="user_entities_user-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/entities/user.proto



<a name="user-entities-User"></a>

### User



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| keycloak_id | [string](#string) |  |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| display_name | [string](#string) |  |  |
| email | [string](#string) |  |  |
| roles | [GlobalRole](#user-entities-GlobalRole) | repeated |  |





 

 

 

 



<a name="user_messages_add_role_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/add_role_request.proto



<a name="user-messages-AddRoleRequest"></a>

### AddRoleRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user_id | [string](#string) |  |  |
| role | [user.entities.GlobalRole](#user-entities-GlobalRole) |  |  |





 

 

 

 



<a name="user_messages_add_role_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/add_role_response.proto



<a name="user-messages-AddRoleResponse"></a>

### AddRoleResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [user.entities.User](#user-entities-User) |  |  |





 

 

 

 



<a name="user_messages_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/get_request.proto



<a name="user-messages-GetRequest"></a>

### GetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="user_messages_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/get_response.proto



<a name="user-messages-GetResponse"></a>

### GetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [user.entities.User](#user-entities-User) |  |  |





 

 

 

 



<a name="user_messages_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/list_request.proto



<a name="user-messages-ListRequest"></a>

### ListRequest






 

 

 

 



<a name="user_messages_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/list_response.proto



<a name="user-messages-ListResponse"></a>

### ListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| users | [user.entities.User](#user-entities-User) | repeated |  |





 

 

 

 



<a name="user_messages_register_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/register_request.proto



<a name="user-messages-RegisterRequest"></a>

### RegisterRequest






 

 

 

 



<a name="user_messages_register_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/register_response.proto



<a name="user-messages-RegisterResponse"></a>

### RegisterResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [user.entities.User](#user-entities-User) |  |  |





 

 

 

 



<a name="user_messages_remove_role_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/remove_role_request.proto



<a name="user-messages-RemoveRoleRequest"></a>

### RemoveRoleRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user_id | [string](#string) |  |  |
| role | [user.entities.GlobalRole](#user-entities-GlobalRole) |  |  |





 

 

 

 



<a name="user_messages_remove_role_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/remove_role_response.proto



<a name="user-messages-RemoveRoleResponse"></a>

### RemoveRoleResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [user.entities.User](#user-entities-User) |  |  |





 

 

 

 



<a name="user_messages_who_am_i_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/who_am_i_request.proto



<a name="user-messages-WhoAmIRequest"></a>

### WhoAmIRequest






 

 

 

 



<a name="user_messages_who_am_i_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/who_am_i_response.proto



<a name="user-messages-WhoAmIResponse"></a>

### WhoAmIResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [user.entities.User](#user-entities-User) |  |  |





 

 

 

 



<a name="user_user_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/user_service.proto


 

 

 


<a name="user-UserService"></a>

### UserService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [messages.ListRequest](#user-messages-ListRequest) | [messages.ListResponse](#user-messages-ListResponse) |  |
| Get | [messages.GetRequest](#user-messages-GetRequest) | [messages.GetResponse](#user-messages-GetResponse) |  |
| WhoAmI | [messages.WhoAmIRequest](#user-messages-WhoAmIRequest) | [messages.WhoAmIResponse](#user-messages-WhoAmIResponse) |  |
| Register | [messages.RegisterRequest](#user-messages-RegisterRequest) | [messages.RegisterResponse](#user-messages-RegisterResponse) |  |
| AddRole | [messages.AddRoleRequest](#user-messages-AddRoleRequest) | [messages.AddRoleResponse](#user-messages-AddRoleResponse) |  |
| RemoveRole | [messages.RemoveRoleRequest](#user-messages-RemoveRoleRequest) | [messages.RemoveRoleResponse](#user-messages-RemoveRoleResponse) |  |

 



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

