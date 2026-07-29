# Protocol Documentation
<a name="top"></a>

## Table of Contents

- [hackathon/entities/hackathon_role.proto](#hackathon_entities_hackathon_role-proto)
    - [HackathonRole](#hackathon-entities-HackathonRole)
  
- [user/entities/global_role.proto](#user_entities_global_role-proto)
    - [GlobalRole](#user-entities-GlobalRole)
  
- [user/entities/user.proto](#user_entities_user-proto)
    - [User](#user-entities-User)
  
- [hackathon/entities/hackathon_member.proto](#hackathon_entities_hackathon_member-proto)
    - [HackathonMember](#hackathon-entities-HackathonMember)
  
- [hackathon/entities/hackathon_status.proto](#hackathon_entities_hackathon_status-proto)
    - [HackathonStatus](#hackathon-entities-HackathonStatus)
  
- [hackathon/entities/page.proto](#hackathon_entities_page-proto)
    - [Page](#hackathon-entities-Page)
  
- [hackathon/entities/phase.proto](#hackathon_entities_phase-proto)
    - [Phase](#hackathon-entities-Phase)
  
- [hackathon/entities/project_status.proto](#hackathon_entities_project_status-proto)
    - [ProjectStatus](#hackathon-entities-ProjectStatus)
  
- [hackathon/entities/project.proto](#hackathon_entities_project-proto)
    - [Project](#hackathon-entities-Project)
  
- [hackathon/entities/track.proto](#hackathon_entities_track-proto)
    - [Track](#hackathon-entities-Track)
  
- [hackathon/entities/visibility.proto](#hackathon_entities_visibility-proto)
    - [Visibility](#hackathon-entities-Visibility)
  
- [hackathon/entities/hackathon.proto](#hackathon_entities_hackathon-proto)
    - [Hackathon](#hackathon-entities-Hackathon)
  
- [hackathon/entities/project_preference.proto](#hackathon_entities_project_preference-proto)
    - [ProjectWithPreferences](#hackathon-entities-ProjectWithPreferences)
  
- [hackathon/entities/submission_status.proto](#hackathon_entities_submission_status-proto)
    - [SubmissionStatus](#hackathon-entities-SubmissionStatus)
  
- [hackathon/entities/submission.proto](#hackathon_entities_submission-proto)
    - [Submission](#hackathon-entities-Submission)
  
- [hackathon/entities/team.proto](#hackathon_entities_team-proto)
    - [Team](#hackathon-entities-Team)
  
- [hackathon/messages/hackathon_svc/add_owner_request.proto](#hackathon_messages_hackathon_svc_add_owner_request-proto)
    - [AddOwnerRequest](#hackathon-messages-hackathon_svc-AddOwnerRequest)
  
- [hackathon/messages/hackathon_svc/add_owner_response.proto](#hackathon_messages_hackathon_svc_add_owner_response-proto)
    - [AddOwnerResponse](#hackathon-messages-hackathon_svc-AddOwnerResponse)
  
- [hackathon/messages/hackathon_svc/approve_participant_request.proto](#hackathon_messages_hackathon_svc_approve_participant_request-proto)
    - [ApproveParticipantRequest](#hackathon-messages-hackathon_svc-ApproveParticipantRequest)
  
- [hackathon/messages/hackathon_svc/approve_participant_response.proto](#hackathon_messages_hackathon_svc_approve_participant_response-proto)
    - [ApproveParticipantResponse](#hackathon-messages-hackathon_svc-ApproveParticipantResponse)
  
- [hackathon/messages/hackathon_svc/create_request.proto](#hackathon_messages_hackathon_svc_create_request-proto)
    - [CreateRequest](#hackathon-messages-hackathon_svc-CreateRequest)
  
- [hackathon/messages/hackathon_svc/create_response.proto](#hackathon_messages_hackathon_svc_create_response-proto)
    - [CreateResponse](#hackathon-messages-hackathon_svc-CreateResponse)
  
- [hackathon/messages/hackathon_svc/edit_request.proto](#hackathon_messages_hackathon_svc_edit_request-proto)
    - [EditRequest](#hackathon-messages-hackathon_svc-EditRequest)
  
- [hackathon/messages/hackathon_svc/edit_response.proto](#hackathon_messages_hackathon_svc_edit_response-proto)
    - [EditResponse](#hackathon-messages-hackathon_svc-EditResponse)
  
- [hackathon/messages/hackathon_svc/get_request.proto](#hackathon_messages_hackathon_svc_get_request-proto)
    - [GetRequest](#hackathon-messages-hackathon_svc-GetRequest)
  
- [hackathon/messages/hackathon_svc/get_response.proto](#hackathon_messages_hackathon_svc_get_response-proto)
    - [GetResponse](#hackathon-messages-hackathon_svc-GetResponse)
  
- [hackathon/messages/hackathon_svc/join_request.proto](#hackathon_messages_hackathon_svc_join_request-proto)
    - [JoinRequest](#hackathon-messages-hackathon_svc-JoinRequest)
  
- [hackathon/messages/hackathon_svc/join_response.proto](#hackathon_messages_hackathon_svc_join_response-proto)
    - [JoinResponse](#hackathon-messages-hackathon_svc-JoinResponse)
  
- [hackathon/messages/hackathon_svc/list_request.proto](#hackathon_messages_hackathon_svc_list_request-proto)
    - [ListRequest](#hackathon-messages-hackathon_svc-ListRequest)
  
- [hackathon/messages/hackathon_svc/list_response.proto](#hackathon_messages_hackathon_svc_list_response-proto)
    - [ListResponse](#hackathon-messages-hackathon_svc-ListResponse)
  
- [hackathon/messages/hackathon_svc/remove_owner_request.proto](#hackathon_messages_hackathon_svc_remove_owner_request-proto)
    - [RemoveOwnerRequest](#hackathon-messages-hackathon_svc-RemoveOwnerRequest)
  
- [hackathon/messages/hackathon_svc/remove_owner_response.proto](#hackathon_messages_hackathon_svc_remove_owner_response-proto)
    - [RemoveOwnerResponse](#hackathon-messages-hackathon_svc-RemoveOwnerResponse)
  
- [hackathon/messages/hackathon_svc/remove_participant_request.proto](#hackathon_messages_hackathon_svc_remove_participant_request-proto)
    - [RemoveParticipantRequest](#hackathon-messages-hackathon_svc-RemoveParticipantRequest)
  
- [hackathon/messages/hackathon_svc/remove_participant_response.proto](#hackathon_messages_hackathon_svc_remove_participant_response-proto)
    - [RemoveParticipantResponse](#hackathon-messages-hackathon_svc-RemoveParticipantResponse)
  
- [hackathon/hackathon_service.proto](#hackathon_hackathon_service-proto)
    - [HackathonService](#hackathon-HackathonService)
  
- [hackathon/messages/page_svc/create_request.proto](#hackathon_messages_page_svc_create_request-proto)
    - [CreateRequest](#hackathon-messages-page_svc-CreateRequest)
  
- [hackathon/messages/page_svc/create_response.proto](#hackathon_messages_page_svc_create_response-proto)
    - [CreateResponse](#hackathon-messages-page_svc-CreateResponse)
  
- [hackathon/messages/page_svc/delete_request.proto](#hackathon_messages_page_svc_delete_request-proto)
    - [DeleteRequest](#hackathon-messages-page_svc-DeleteRequest)
  
- [hackathon/messages/page_svc/delete_response.proto](#hackathon_messages_page_svc_delete_response-proto)
    - [DeleteResponse](#hackathon-messages-page_svc-DeleteResponse)
  
- [hackathon/messages/page_svc/edit_request.proto](#hackathon_messages_page_svc_edit_request-proto)
    - [EditRequest](#hackathon-messages-page_svc-EditRequest)
  
- [hackathon/messages/page_svc/edit_response.proto](#hackathon_messages_page_svc_edit_response-proto)
    - [EditResponse](#hackathon-messages-page_svc-EditResponse)
  
- [hackathon/messages/page_svc/get_request.proto](#hackathon_messages_page_svc_get_request-proto)
    - [GetRequest](#hackathon-messages-page_svc-GetRequest)
  
- [hackathon/messages/page_svc/get_response.proto](#hackathon_messages_page_svc_get_response-proto)
    - [GetResponse](#hackathon-messages-page_svc-GetResponse)
  
- [hackathon/messages/page_svc/list_request.proto](#hackathon_messages_page_svc_list_request-proto)
    - [ListRequest](#hackathon-messages-page_svc-ListRequest)
  
- [hackathon/messages/page_svc/list_response.proto](#hackathon_messages_page_svc_list_response-proto)
    - [ListResponse](#hackathon-messages-page_svc-ListResponse)
  
- [hackathon/messages/page_svc/move_down_request.proto](#hackathon_messages_page_svc_move_down_request-proto)
    - [MoveDownRequest](#hackathon-messages-page_svc-MoveDownRequest)
  
- [hackathon/messages/page_svc/move_down_response.proto](#hackathon_messages_page_svc_move_down_response-proto)
    - [MoveDownResponse](#hackathon-messages-page_svc-MoveDownResponse)
  
- [hackathon/messages/page_svc/move_up_request.proto](#hackathon_messages_page_svc_move_up_request-proto)
    - [MoveUpRequest](#hackathon-messages-page_svc-MoveUpRequest)
  
- [hackathon/messages/page_svc/move_up_response.proto](#hackathon_messages_page_svc_move_up_response-proto)
    - [MoveUpResponse](#hackathon-messages-page_svc-MoveUpResponse)
  
- [hackathon/messages/page_svc/set_order_request.proto](#hackathon_messages_page_svc_set_order_request-proto)
    - [SetOrderRequest](#hackathon-messages-page_svc-SetOrderRequest)
  
- [hackathon/messages/page_svc/set_order_response.proto](#hackathon_messages_page_svc_set_order_response-proto)
    - [SetOrderResponse](#hackathon-messages-page_svc-SetOrderResponse)
  
- [hackathon/messages/phase_svc/create_request.proto](#hackathon_messages_phase_svc_create_request-proto)
    - [CreateRequest](#hackathon-messages-phase_svc-CreateRequest)
  
- [hackathon/messages/phase_svc/create_response.proto](#hackathon_messages_phase_svc_create_response-proto)
    - [CreateResponse](#hackathon-messages-phase_svc-CreateResponse)
  
- [hackathon/messages/phase_svc/delete_request.proto](#hackathon_messages_phase_svc_delete_request-proto)
    - [DeleteRequest](#hackathon-messages-phase_svc-DeleteRequest)
  
- [hackathon/messages/phase_svc/delete_response.proto](#hackathon_messages_phase_svc_delete_response-proto)
    - [DeleteResponse](#hackathon-messages-phase_svc-DeleteResponse)
  
- [hackathon/messages/phase_svc/edit_request.proto](#hackathon_messages_phase_svc_edit_request-proto)
    - [EditRequest](#hackathon-messages-phase_svc-EditRequest)
  
- [hackathon/messages/phase_svc/edit_response.proto](#hackathon_messages_phase_svc_edit_response-proto)
    - [EditResponse](#hackathon-messages-phase_svc-EditResponse)
  
- [hackathon/messages/phase_svc/get_request.proto](#hackathon_messages_phase_svc_get_request-proto)
    - [GetRequest](#hackathon-messages-phase_svc-GetRequest)
  
- [hackathon/messages/phase_svc/get_response.proto](#hackathon_messages_phase_svc_get_response-proto)
    - [GetResponse](#hackathon-messages-phase_svc-GetResponse)
  
- [hackathon/messages/phase_svc/list_request.proto](#hackathon_messages_phase_svc_list_request-proto)
    - [ListRequest](#hackathon-messages-phase_svc-ListRequest)
  
- [hackathon/messages/phase_svc/list_response.proto](#hackathon_messages_phase_svc_list_response-proto)
    - [ListResponse](#hackathon-messages-phase_svc-ListResponse)
  
- [hackathon/messages/project_svc/approve_request.proto](#hackathon_messages_project_svc_approve_request-proto)
    - [ApproveRequest](#hackathon-messages-project_svc-ApproveRequest)
  
- [hackathon/messages/project_svc/approve_response.proto](#hackathon_messages_project_svc_approve_response-proto)
    - [ApproveResponse](#hackathon-messages-project_svc-ApproveResponse)
  
- [hackathon/messages/project_svc/delete_request.proto](#hackathon_messages_project_svc_delete_request-proto)
    - [DeleteRequest](#hackathon-messages-project_svc-DeleteRequest)
  
- [hackathon/messages/project_svc/delete_response.proto](#hackathon_messages_project_svc_delete_response-proto)
    - [DeleteResponse](#hackathon-messages-project_svc-DeleteResponse)
  
- [hackathon/messages/project_svc/disapprove_request.proto](#hackathon_messages_project_svc_disapprove_request-proto)
    - [DisapproveRequest](#hackathon-messages-project_svc-DisapproveRequest)
  
- [hackathon/messages/project_svc/disapprove_response.proto](#hackathon_messages_project_svc_disapprove_response-proto)
    - [DisapproveResponse](#hackathon-messages-project_svc-DisapproveResponse)
  
- [hackathon/messages/project_svc/edit_request.proto](#hackathon_messages_project_svc_edit_request-proto)
    - [EditRequest](#hackathon-messages-project_svc-EditRequest)
  
- [hackathon/messages/project_svc/edit_response.proto](#hackathon_messages_project_svc_edit_response-proto)
    - [EditResponse](#hackathon-messages-project_svc-EditResponse)
  
- [hackathon/messages/project_svc/export_preferences_request.proto](#hackathon_messages_project_svc_export_preferences_request-proto)
    - [ExportPreferencesRequest](#hackathon-messages-project_svc-ExportPreferencesRequest)
  
- [hackathon/messages/project_svc/export_preferences_response.proto](#hackathon_messages_project_svc_export_preferences_response-proto)
    - [ExportPreferencesResponse](#hackathon-messages-project_svc-ExportPreferencesResponse)
  
- [hackathon/messages/project_svc/get_request.proto](#hackathon_messages_project_svc_get_request-proto)
    - [GetRequest](#hackathon-messages-project_svc-GetRequest)
  
- [hackathon/messages/project_svc/get_response.proto](#hackathon_messages_project_svc_get_response-proto)
    - [GetResponse](#hackathon-messages-project_svc-GetResponse)
  
- [hackathon/messages/project_svc/list_request.proto](#hackathon_messages_project_svc_list_request-proto)
    - [ListRequest](#hackathon-messages-project_svc-ListRequest)
  
- [hackathon/messages/project_svc/list_response.proto](#hackathon_messages_project_svc_list_response-proto)
    - [ListResponse](#hackathon-messages-project_svc-ListResponse)
  
- [hackathon/messages/project_svc/propose_request.proto](#hackathon_messages_project_svc_propose_request-proto)
    - [ProposeRequest](#hackathon-messages-project_svc-ProposeRequest)
  
- [hackathon/messages/project_svc/propose_response.proto](#hackathon_messages_project_svc_propose_response-proto)
    - [ProposeResponse](#hackathon-messages-project_svc-ProposeResponse)
  
- [hackathon/messages/project_svc/set_preference_request.proto](#hackathon_messages_project_svc_set_preference_request-proto)
    - [SetPreferenceRequest](#hackathon-messages-project_svc-SetPreferenceRequest)
  
- [hackathon/messages/project_svc/set_preference_response.proto](#hackathon_messages_project_svc_set_preference_response-proto)
    - [SetPreferenceResponse](#hackathon-messages-project_svc-SetPreferenceResponse)
  
- [hackathon/messages/team_svc/assign_user_request.proto](#hackathon_messages_team_svc_assign_user_request-proto)
    - [AssignUserRequest](#hackathon-messages-team_svc-AssignUserRequest)
  
- [hackathon/messages/team_svc/assign_user_response.proto](#hackathon_messages_team_svc_assign_user_response-proto)
    - [AssignUserResponse](#hackathon-messages-team_svc-AssignUserResponse)
  
- [hackathon/messages/team_svc/create_request.proto](#hackathon_messages_team_svc_create_request-proto)
    - [CreateRequest](#hackathon-messages-team_svc-CreateRequest)
  
- [hackathon/messages/team_svc/create_response.proto](#hackathon_messages_team_svc_create_response-proto)
    - [CreateResponse](#hackathon-messages-team_svc-CreateResponse)
  
- [hackathon/messages/team_svc/create_submission_request.proto](#hackathon_messages_team_svc_create_submission_request-proto)
    - [CreateSubmissionRequest](#hackathon-messages-team_svc-CreateSubmissionRequest)
  
- [hackathon/messages/team_svc/create_submission_response.proto](#hackathon_messages_team_svc_create_submission_response-proto)
    - [CreateSubmissionResponse](#hackathon-messages-team_svc-CreateSubmissionResponse)
  
- [hackathon/messages/team_svc/delete_request.proto](#hackathon_messages_team_svc_delete_request-proto)
    - [DeleteRequest](#hackathon-messages-team_svc-DeleteRequest)
  
- [hackathon/messages/team_svc/delete_response.proto](#hackathon_messages_team_svc_delete_response-proto)
    - [DeleteResponse](#hackathon-messages-team_svc-DeleteResponse)
  
- [hackathon/messages/team_svc/edit_request.proto](#hackathon_messages_team_svc_edit_request-proto)
    - [EditRequest](#hackathon-messages-team_svc-EditRequest)
  
- [hackathon/messages/team_svc/edit_response.proto](#hackathon_messages_team_svc_edit_response-proto)
    - [EditResponse](#hackathon-messages-team_svc-EditResponse)
  
- [hackathon/messages/team_svc/finalize_submission_request.proto](#hackathon_messages_team_svc_finalize_submission_request-proto)
    - [FinalizeSubmissionRequest](#hackathon-messages-team_svc-FinalizeSubmissionRequest)
  
- [hackathon/messages/team_svc/finalize_submission_response.proto](#hackathon_messages_team_svc_finalize_submission_response-proto)
    - [FinalizeSubmissionResponse](#hackathon-messages-team_svc-FinalizeSubmissionResponse)
  
- [hackathon/messages/team_svc/get_request.proto](#hackathon_messages_team_svc_get_request-proto)
    - [GetRequest](#hackathon-messages-team_svc-GetRequest)
  
- [hackathon/messages/team_svc/get_response.proto](#hackathon_messages_team_svc_get_response-proto)
    - [GetResponse](#hackathon-messages-team_svc-GetResponse)
  
- [hackathon/messages/team_svc/list_request.proto](#hackathon_messages_team_svc_list_request-proto)
    - [ListRequest](#hackathon-messages-team_svc-ListRequest)
  
- [hackathon/messages/team_svc/list_response.proto](#hackathon_messages_team_svc_list_response-proto)
    - [ListResponse](#hackathon-messages-team_svc-ListResponse)
  
- [hackathon/messages/team_svc/remove_user_request.proto](#hackathon_messages_team_svc_remove_user_request-proto)
    - [RemoveUserRequest](#hackathon-messages-team_svc-RemoveUserRequest)
  
- [hackathon/messages/team_svc/remove_user_response.proto](#hackathon_messages_team_svc_remove_user_response-proto)
    - [RemoveUserResponse](#hackathon-messages-team_svc-RemoveUserResponse)
  
- [hackathon/messages/track_svc/create_request.proto](#hackathon_messages_track_svc_create_request-proto)
    - [CreateRequest](#hackathon-messages-track_svc-CreateRequest)
  
- [hackathon/messages/track_svc/create_response.proto](#hackathon_messages_track_svc_create_response-proto)
    - [CreateResponse](#hackathon-messages-track_svc-CreateResponse)
  
- [hackathon/messages/track_svc/delete_request.proto](#hackathon_messages_track_svc_delete_request-proto)
    - [DeleteRequest](#hackathon-messages-track_svc-DeleteRequest)
  
- [hackathon/messages/track_svc/delete_response.proto](#hackathon_messages_track_svc_delete_response-proto)
    - [DeleteResponse](#hackathon-messages-track_svc-DeleteResponse)
  
- [hackathon/messages/track_svc/edit_request.proto](#hackathon_messages_track_svc_edit_request-proto)
    - [EditRequest](#hackathon-messages-track_svc-EditRequest)
  
- [hackathon/messages/track_svc/edit_response.proto](#hackathon_messages_track_svc_edit_response-proto)
    - [EditResponse](#hackathon-messages-track_svc-EditResponse)
  
- [hackathon/messages/track_svc/get_request.proto](#hackathon_messages_track_svc_get_request-proto)
    - [GetRequest](#hackathon-messages-track_svc-GetRequest)
  
- [hackathon/messages/track_svc/get_response.proto](#hackathon_messages_track_svc_get_response-proto)
    - [GetResponse](#hackathon-messages-track_svc-GetResponse)
  
- [hackathon/messages/track_svc/list_request.proto](#hackathon_messages_track_svc_list_request-proto)
    - [ListRequest](#hackathon-messages-track_svc-ListRequest)
  
- [hackathon/messages/track_svc/list_response.proto](#hackathon_messages_track_svc_list_response-proto)
    - [ListResponse](#hackathon-messages-track_svc-ListResponse)
  
- [hackathon/page_service.proto](#hackathon_page_service-proto)
    - [PageService](#hackathon-PageService)
  
- [hackathon/phase_service.proto](#hackathon_phase_service-proto)
    - [PhaseService](#hackathon-PhaseService)
  
- [hackathon/project_service.proto](#hackathon_project_service-proto)
    - [ProjectService](#hackathon-ProjectService)
  
- [hackathon/team_service.proto](#hackathon_team_service-proto)
    - [TeamService](#hackathon-TeamService)
  
- [hackathon/track_service.proto](#hackathon_track_service-proto)
    - [TrackService](#hackathon-TrackService)
  
- [health/messages/health_svc/check_request.proto](#health_messages_health_svc_check_request-proto)
    - [CheckRequest](#health-messages-health_svc-CheckRequest)
  
- [health/messages/health_svc/check_response.proto](#health_messages_health_svc_check_response-proto)
    - [CheckResponse](#health-messages-health_svc-CheckResponse)
  
- [health/health_service.proto](#health_health_service-proto)
    - [HealthService](#health-HealthService)
  
- [user/messages/user_svc/add_role_request.proto](#user_messages_user_svc_add_role_request-proto)
    - [AddRoleRequest](#user-messages-user_svc-AddRoleRequest)
  
- [user/messages/user_svc/add_role_response.proto](#user_messages_user_svc_add_role_response-proto)
    - [AddRoleResponse](#user-messages-user_svc-AddRoleResponse)
  
- [user/messages/user_svc/get_request.proto](#user_messages_user_svc_get_request-proto)
    - [GetRequest](#user-messages-user_svc-GetRequest)
  
- [user/messages/user_svc/get_response.proto](#user_messages_user_svc_get_response-proto)
    - [GetResponse](#user-messages-user_svc-GetResponse)
  
- [user/messages/user_svc/list_request.proto](#user_messages_user_svc_list_request-proto)
    - [ListRequest](#user-messages-user_svc-ListRequest)
  
- [user/messages/user_svc/list_response.proto](#user_messages_user_svc_list_response-proto)
    - [ListResponse](#user-messages-user_svc-ListResponse)
  
- [user/messages/user_svc/register_request.proto](#user_messages_user_svc_register_request-proto)
    - [RegisterRequest](#user-messages-user_svc-RegisterRequest)
  
- [user/messages/user_svc/register_response.proto](#user_messages_user_svc_register_response-proto)
    - [RegisterResponse](#user-messages-user_svc-RegisterResponse)
  
- [user/messages/user_svc/remove_role_request.proto](#user_messages_user_svc_remove_role_request-proto)
    - [RemoveRoleRequest](#user-messages-user_svc-RemoveRoleRequest)
  
- [user/messages/user_svc/remove_role_response.proto](#user_messages_user_svc_remove_role_response-proto)
    - [RemoveRoleResponse](#user-messages-user_svc-RemoveRoleResponse)
  
- [user/messages/user_svc/who_am_i_request.proto](#user_messages_user_svc_who_am_i_request-proto)
    - [WhoAmIRequest](#user-messages-user_svc-WhoAmIRequest)
  
- [user/messages/user_svc/who_am_i_response.proto](#user_messages_user_svc_who_am_i_response-proto)
    - [WhoAmIResponse](#user-messages-user_svc-WhoAmIResponse)
  
- [user/user_service.proto](#user_user_service-proto)
    - [UserService](#user-UserService)
  
- [Scalar Value Types](#scalar-value-types)



<a name="hackathon_entities_hackathon_role-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_role.proto


 


<a name="hackathon-entities-HackathonRole"></a>

### HackathonRole
Per-hackathon role sourced from casbin (not persisted in ent DB).
See components/backend/internal/middleware/rbac.go.

| Name | Number | Description |
| ---- | ------ | ----------- |
| HACKATHON_ROLE_UNSPECIFIED | 0 |  |
| HACKATHON_ROLE_OWNER | 1 |  |
| HACKATHON_ROLE_MEMBER | 2 |  |


 

 

 



<a name="user_entities_global_role-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/entities/global_role.proto


 


<a name="user-entities-GlobalRole"></a>

### GlobalRole
Global role sourced from casbin (not persisted in ent DB).
See components/backend/internal/middleware/rbac.go.

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
| username | [string](#string) |  |  |
| keycloak_id | [string](#string) |  |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| display_name | [string](#string) |  |  |
| email | [string](#string) |  |  |
| roles | [GlobalRole](#user-entities-GlobalRole) | repeated | Populated from casbin on fetch; not persisted in ent DB. |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |





 

 

 

 



<a name="hackathon_entities_hackathon_member-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_member.proto



<a name="hackathon-entities-HackathonMember"></a>

### HackathonMember
A user&#39;s relationship to a hackathon: DB participation state (is_waiting, joined_at)
combined with casbin role. `role` is HACKATHON_ROLE_UNSPECIFIED for users with no
casbin role for this hackathon; `is_waiting` is false once approved.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [user.entities.User](#user-entities-User) |  |  |
| role | [HackathonRole](#hackathon-entities-HackathonRole) |  |  |
| is_waiting | [bool](#bool) |  |  |
| joined_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |





 

 

 

 



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


 

 

 



<a name="hackathon_entities_page-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/page.proto



<a name="hackathon-entities-Page"></a>

### Page



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| title | [string](#string) |  |  |
| content | [string](#string) |  |  |
| visible | [bool](#bool) |  |  |
| order | [int32](#int32) |  |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| hackathon_id | [string](#string) |  |  |
| phase_id | [string](#string) | optional |  |
| creator_id | [string](#string) |  |  |
| modifier_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_entities_phase-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/phase.proto



<a name="hackathon-entities-Phase"></a>

### Phase



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| description | [string](#string) | optional |  |
| starts_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| ends_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| hackathon_id | [string](#string) |  |  |
| page_id | [string](#string) | optional |  |
| creator_id | [string](#string) |  |  |
| modifier_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_entities_project_status-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/project_status.proto


 


<a name="hackathon-entities-ProjectStatus"></a>

### ProjectStatus


| Name | Number | Description |
| ---- | ------ | ----------- |
| PROJECT_STATUS_UNSPECIFIED | 0 |  |
| PROJECT_STATUS_PROPOSED | 1 |  |
| PROJECT_STATUS_APPROVED | 2 |  |


 

 

 



<a name="hackathon_entities_project-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/project.proto



<a name="hackathon-entities-Project"></a>

### Project



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| title | [string](#string) |  |  |
| description | [string](#string) |  |  |
| status | [ProjectStatus](#hackathon-entities-ProjectStatus) |  |  |
| image | [string](#string) | optional |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| track_id | [string](#string) |  |  |
| hackathon_id | [string](#string) |  |  |
| creator_id | [string](#string) |  |  |
| modifier_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_entities_track-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/track.proto



<a name="hackathon-entities-Track"></a>

### Track



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| description | [string](#string) |  |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



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


 

 

 



<a name="hackathon_entities_hackathon-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon.proto



<a name="hackathon-entities-Hackathon"></a>

### Hackathon



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| starts_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| ends_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| visibility | [Visibility](#hackathon-entities-Visibility) |  |  |
| status | [HackathonStatus](#hackathon-entities-HackathonStatus) |  | Computed server-side from starts_at/ends_at; not persisted in DB. |
| description | [string](#string) | optional |  |
| logo | [string](#string) | optional |  |
| members | [HackathonMember](#hackathon-entities-HackathonMember) | repeated |  |
| creator | [user.entities.User](#user-entities-User) |  |  |
| modifier | [user.entities.User](#user-entities-User) |  |  |
| tracks | [Track](#hackathon-entities-Track) | repeated | The following collections are populated only on Get responses. |
| projects | [Project](#hackathon-entities-Project) | repeated |  |
| pages | [Page](#hackathon-entities-Page) | repeated |  |
| phases | [Phase](#hackathon-entities-Phase) | repeated |  |
| viewer_membership | [HackathonMember](#hackathon-entities-HackathonMember) | optional | Populated in List responses only when participant_id filter is set. Contains the requesting user&#39;s membership in this hackathon (role &#43; is_waiting). |





 

 

 

 



<a name="hackathon_entities_project_preference-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/project_preference.proto



<a name="hackathon-entities-ProjectWithPreferences"></a>

### ProjectWithPreferences



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| title | [string](#string) |  |  |
| description | [string](#string) |  |  |
| status | [ProjectStatus](#hackathon-entities-ProjectStatus) |  |  |
| image | [string](#string) | optional |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| track_id | [string](#string) |  |  |
| hackathon_id | [string](#string) |  |  |
| preferences | [user.entities.User](#user-entities-User) | repeated | List of users who have this project as their preference |





 

 

 

 



<a name="hackathon_entities_submission_status-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/submission_status.proto


 


<a name="hackathon-entities-SubmissionStatus"></a>

### SubmissionStatus


| Name | Number | Description |
| ---- | ------ | ----------- |
| SUBMISSION_STATUS_UNSPECIFIED | 0 |  |
| SUBMISSION_STATUS_DRAFT | 1 |  |
| SUBMISSION_STATUS_FINAL | 2 |  |


 

 

 



<a name="hackathon_entities_submission-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/submission.proto



<a name="hackathon-entities-Submission"></a>

### Submission



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| result | [string](#string) | optional |  |
| status | [SubmissionStatus](#hackathon-entities-SubmissionStatus) |  |  |
| version | [int32](#int32) |  |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| team_id | [string](#string) |  |  |
| project_id | [string](#string) |  |  |
| creator_id | [string](#string) |  |  |
| modifier_id | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_entities_team-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/team.proto



<a name="hackathon-entities-Team"></a>

### Team



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| description | [string](#string) | optional |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| project_id | [string](#string) |  |  |
| creator_id | [string](#string) |  |  |
| modifier_id | [string](#string) | optional |  |
| members | [user.entities.User](#user-entities-User) | repeated |  |
| submissions | [Submission](#hackathon-entities-Submission) | repeated |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_add_owner_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/add_owner_request.proto



<a name="hackathon-messages-hackathon_svc-AddOwnerRequest"></a>

### AddOwnerRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_add_owner_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/add_owner_response.proto



<a name="hackathon-messages-hackathon_svc-AddOwnerResponse"></a>

### AddOwnerResponse






 

 

 

 



<a name="hackathon_messages_hackathon_svc_approve_participant_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/approve_participant_request.proto



<a name="hackathon-messages-hackathon_svc-ApproveParticipantRequest"></a>

### ApproveParticipantRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_approve_participant_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/approve_participant_response.proto



<a name="hackathon-messages-hackathon_svc-ApproveParticipantResponse"></a>

### ApproveParticipantResponse






 

 

 

 



<a name="hackathon_messages_hackathon_svc_create_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/create_request.proto



<a name="hackathon-messages-hackathon_svc-CreateRequest"></a>

### CreateRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| name | [string](#string) |  |  |
| starts_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| ends_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| visibility | [hackathon.entities.Visibility](#hackathon-entities-Visibility) |  |  |
| description | [string](#string) | optional |  |
| logo | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_create_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/create_response.proto



<a name="hackathon-messages-hackathon_svc-CreateResponse"></a>

### CreateResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_edit_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/edit_request.proto



<a name="hackathon-messages-hackathon_svc-EditRequest"></a>

### EditRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| name | [string](#string) | optional |  |
| description | [string](#string) | optional |  |
| visibility | [hackathon.entities.Visibility](#hackathon-entities-Visibility) | optional |  |
| starts_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| ends_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| logo | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_edit_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/edit_response.proto



<a name="hackathon-messages-hackathon_svc-EditResponse"></a>

### EditResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon | [hackathon.entities.Hackathon](#hackathon-entities-Hackathon) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/get_request.proto



<a name="hackathon-messages-hackathon_svc-GetRequest"></a>

### GetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/get_response.proto



<a name="hackathon-messages-hackathon_svc-GetResponse"></a>

### GetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon | [hackathon.entities.Hackathon](#hackathon-entities-Hackathon) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_join_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/join_request.proto



<a name="hackathon-messages-hackathon_svc-JoinRequest"></a>

### JoinRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_join_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/join_response.proto



<a name="hackathon-messages-hackathon_svc-JoinResponse"></a>

### JoinResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/list_request.proto



<a name="hackathon-messages-hackathon_svc-ListRequest"></a>

### ListRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| status_filter | [hackathon.entities.HackathonStatus](#hackathon-entities-HackathonStatus) | repeated |  |
| owner_id | [string](#string) | optional |  |
| participant_id | [string](#string) | optional |  |
| visibility_filter | [hackathon.entities.Visibility](#hackathon-entities-Visibility) | optional |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/list_response.proto



<a name="hackathon-messages-hackathon_svc-ListResponse"></a>

### ListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathons | [hackathon.entities.Hackathon](#hackathon-entities-Hackathon) | repeated |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_remove_owner_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/remove_owner_request.proto



<a name="hackathon-messages-hackathon_svc-RemoveOwnerRequest"></a>

### RemoveOwnerRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_remove_owner_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/remove_owner_response.proto



<a name="hackathon-messages-hackathon_svc-RemoveOwnerResponse"></a>

### RemoveOwnerResponse






 

 

 

 



<a name="hackathon_messages_hackathon_svc_remove_participant_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/remove_participant_request.proto



<a name="hackathon-messages-hackathon_svc-RemoveParticipantRequest"></a>

### RemoveParticipantRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_remove_participant_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/remove_participant_response.proto



<a name="hackathon-messages-hackathon_svc-RemoveParticipantResponse"></a>

### RemoveParticipantResponse






 

 

 

 



<a name="hackathon_hackathon_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/hackathon_service.proto


 

 

 


<a name="hackathon-HackathonService"></a>

### HackathonService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [messages.hackathon_svc.ListRequest](#hackathon-messages-hackathon_svc-ListRequest) | [messages.hackathon_svc.ListResponse](#hackathon-messages-hackathon_svc-ListResponse) |  |
| Get | [messages.hackathon_svc.GetRequest](#hackathon-messages-hackathon_svc-GetRequest) | [messages.hackathon_svc.GetResponse](#hackathon-messages-hackathon_svc-GetResponse) |  |
| Create | [messages.hackathon_svc.CreateRequest](#hackathon-messages-hackathon_svc-CreateRequest) | [messages.hackathon_svc.CreateResponse](#hackathon-messages-hackathon_svc-CreateResponse) |  |
| Edit | [messages.hackathon_svc.EditRequest](#hackathon-messages-hackathon_svc-EditRequest) | [messages.hackathon_svc.EditResponse](#hackathon-messages-hackathon_svc-EditResponse) |  |
| Join | [messages.hackathon_svc.JoinRequest](#hackathon-messages-hackathon_svc-JoinRequest) | [messages.hackathon_svc.JoinResponse](#hackathon-messages-hackathon_svc-JoinResponse) |  |
| ApproveParticipant | [messages.hackathon_svc.ApproveParticipantRequest](#hackathon-messages-hackathon_svc-ApproveParticipantRequest) | [messages.hackathon_svc.ApproveParticipantResponse](#hackathon-messages-hackathon_svc-ApproveParticipantResponse) |  |
| RemoveParticipant | [messages.hackathon_svc.RemoveParticipantRequest](#hackathon-messages-hackathon_svc-RemoveParticipantRequest) | [messages.hackathon_svc.RemoveParticipantResponse](#hackathon-messages-hackathon_svc-RemoveParticipantResponse) |  |
| AddOwner | [messages.hackathon_svc.AddOwnerRequest](#hackathon-messages-hackathon_svc-AddOwnerRequest) | [messages.hackathon_svc.AddOwnerResponse](#hackathon-messages-hackathon_svc-AddOwnerResponse) |  |
| RemoveOwner | [messages.hackathon_svc.RemoveOwnerRequest](#hackathon-messages-hackathon_svc-RemoveOwnerRequest) | [messages.hackathon_svc.RemoveOwnerResponse](#hackathon-messages-hackathon_svc-RemoveOwnerResponse) |  |

 



<a name="hackathon_messages_page_svc_create_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/create_request.proto



<a name="hackathon-messages-page_svc-CreateRequest"></a>

### CreateRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| title | [string](#string) |  |  |
| content | [string](#string) |  |  |
| visible | [bool](#bool) |  | order is automatically assigned by backend (max(order) &#43; 1) |





 

 

 

 



<a name="hackathon_messages_page_svc_create_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/create_response.proto



<a name="hackathon-messages-page_svc-CreateResponse"></a>

### CreateResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_page_svc_delete_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/delete_request.proto



<a name="hackathon-messages-page_svc-DeleteRequest"></a>

### DeleteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_page_svc_delete_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/delete_response.proto



<a name="hackathon-messages-page_svc-DeleteResponse"></a>

### DeleteResponse






 

 

 

 



<a name="hackathon_messages_page_svc_edit_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/edit_request.proto



<a name="hackathon-messages-page_svc-EditRequest"></a>

### EditRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |
| title | [string](#string) | optional |  |
| content | [string](#string) | optional |  |
| visible | [bool](#bool) | optional | order should not be modified here - use MoveUp/MoveDown/SetOrder instead |





 

 

 

 



<a name="hackathon_messages_page_svc_edit_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/edit_response.proto



<a name="hackathon-messages-page_svc-EditResponse"></a>

### EditResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page | [hackathon.entities.Page](#hackathon-entities-Page) |  |  |





 

 

 

 



<a name="hackathon_messages_page_svc_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/get_request.proto



<a name="hackathon-messages-page_svc-GetRequest"></a>

### GetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_page_svc_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/get_response.proto



<a name="hackathon-messages-page_svc-GetResponse"></a>

### GetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page | [hackathon.entities.Page](#hackathon-entities-Page) |  |  |





 

 

 

 



<a name="hackathon_messages_page_svc_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/list_request.proto



<a name="hackathon-messages-page_svc-ListRequest"></a>

### ListRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_page_svc_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/list_response.proto



<a name="hackathon-messages-page_svc-ListResponse"></a>

### ListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| pages | [hackathon.entities.Page](#hackathon-entities-Page) | repeated |  |





 

 

 

 



<a name="hackathon_messages_page_svc_move_down_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/move_down_request.proto



<a name="hackathon-messages-page_svc-MoveDownRequest"></a>

### MoveDownRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |
| increment | [int32](#int32) | optional | Number of positions to move down (default: 1) Must be &gt;= 1 |





 

 

 

 



<a name="hackathon_messages_page_svc_move_down_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/move_down_response.proto



<a name="hackathon-messages-page_svc-MoveDownResponse"></a>

### MoveDownResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |
| order | [int32](#int32) |  |  |





 

 

 

 



<a name="hackathon_messages_page_svc_move_up_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/move_up_request.proto



<a name="hackathon-messages-page_svc-MoveUpRequest"></a>

### MoveUpRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |
| increment | [int32](#int32) | optional | Number of positions to move up (default: 1) Must be &gt;= 1 |





 

 

 

 



<a name="hackathon_messages_page_svc_move_up_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/move_up_response.proto



<a name="hackathon-messages-page_svc-MoveUpResponse"></a>

### MoveUpResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_id | [string](#string) |  |  |
| order | [int32](#int32) |  |  |





 

 

 

 



<a name="hackathon_messages_page_svc_set_order_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/set_order_request.proto



<a name="hackathon-messages-page_svc-SetOrderRequest"></a>

### SetOrderRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| page_ids | [string](#string) | repeated | List of page IDs in the desired order |





 

 

 

 



<a name="hackathon_messages_page_svc_set_order_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/page_svc/set_order_response.proto



<a name="hackathon-messages-page_svc-SetOrderResponse"></a>

### SetOrderResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| page_ids | [string](#string) | repeated |  |





 

 

 

 



<a name="hackathon_messages_phase_svc_create_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/phase_svc/create_request.proto



<a name="hackathon-messages-phase_svc-CreateRequest"></a>

### CreateRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| description | [string](#string) |  |  |
| starts_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| ends_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| page_id | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_phase_svc_create_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/phase_svc/create_response.proto



<a name="hackathon-messages-phase_svc-CreateResponse"></a>

### CreateResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| phase_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_phase_svc_delete_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/phase_svc/delete_request.proto



<a name="hackathon-messages-phase_svc-DeleteRequest"></a>

### DeleteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| phase_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_phase_svc_delete_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/phase_svc/delete_response.proto



<a name="hackathon-messages-phase_svc-DeleteResponse"></a>

### DeleteResponse






 

 

 

 



<a name="hackathon_messages_phase_svc_edit_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/phase_svc/edit_request.proto



<a name="hackathon-messages-phase_svc-EditRequest"></a>

### EditRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| phase_id | [string](#string) |  |  |
| name | [string](#string) | optional |  |
| description | [string](#string) | optional |  |
| starts_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| ends_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| page_id | [string](#string) | optional | Empty string = unlink (unset), non-empty string = link to this phase, not set = no change |





 

 

 

 



<a name="hackathon_messages_phase_svc_edit_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/phase_svc/edit_response.proto



<a name="hackathon-messages-phase_svc-EditResponse"></a>

### EditResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| phase | [hackathon.entities.Phase](#hackathon-entities-Phase) |  |  |





 

 

 

 



<a name="hackathon_messages_phase_svc_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/phase_svc/get_request.proto



<a name="hackathon-messages-phase_svc-GetRequest"></a>

### GetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| phase_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_phase_svc_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/phase_svc/get_response.proto



<a name="hackathon-messages-phase_svc-GetResponse"></a>

### GetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| phase | [hackathon.entities.Phase](#hackathon-entities-Phase) |  |  |





 

 

 

 



<a name="hackathon_messages_phase_svc_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/phase_svc/list_request.proto



<a name="hackathon-messages-phase_svc-ListRequest"></a>

### ListRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_phase_svc_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/phase_svc/list_response.proto



<a name="hackathon-messages-phase_svc-ListResponse"></a>

### ListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| phases | [hackathon.entities.Phase](#hackathon-entities-Phase) | repeated |  |





 

 

 

 



<a name="hackathon_messages_project_svc_approve_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/approve_request.proto



<a name="hackathon-messages-project_svc-ApproveRequest"></a>

### ApproveRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_approve_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/approve_response.proto



<a name="hackathon-messages-project_svc-ApproveResponse"></a>

### ApproveResponse






 

 

 

 



<a name="hackathon_messages_project_svc_delete_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/delete_request.proto



<a name="hackathon-messages-project_svc-DeleteRequest"></a>

### DeleteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_delete_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/delete_response.proto



<a name="hackathon-messages-project_svc-DeleteResponse"></a>

### DeleteResponse






 

 

 

 



<a name="hackathon_messages_project_svc_disapprove_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/disapprove_request.proto



<a name="hackathon-messages-project_svc-DisapproveRequest"></a>

### DisapproveRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_disapprove_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/disapprove_response.proto



<a name="hackathon-messages-project_svc-DisapproveResponse"></a>

### DisapproveResponse






 

 

 

 



<a name="hackathon_messages_project_svc_edit_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/edit_request.proto



<a name="hackathon-messages-project_svc-EditRequest"></a>

### EditRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_id | [string](#string) |  |  |
| title | [string](#string) | optional |  |
| description | [string](#string) | optional |  |
| track_id | [string](#string) | optional |  |
| image | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_project_svc_edit_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/edit_response.proto



<a name="hackathon-messages-project_svc-EditResponse"></a>

### EditResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project | [hackathon.entities.Project](#hackathon-entities-Project) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_export_preferences_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/export_preferences_request.proto



<a name="hackathon-messages-project_svc-ExportPreferencesRequest"></a>

### ExportPreferencesRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_export_preferences_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/export_preferences_response.proto



<a name="hackathon-messages-project_svc-ExportPreferencesResponse"></a>

### ExportPreferencesResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| projects | [hackathon.entities.ProjectWithPreferences](#hackathon-entities-ProjectWithPreferences) | repeated |  |





 

 

 

 



<a name="hackathon_messages_project_svc_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/get_request.proto



<a name="hackathon-messages-project_svc-GetRequest"></a>

### GetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/get_response.proto



<a name="hackathon-messages-project_svc-GetResponse"></a>

### GetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project | [hackathon.entities.Project](#hackathon-entities-Project) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/list_request.proto



<a name="hackathon-messages-project_svc-ListRequest"></a>

### ListRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/list_response.proto



<a name="hackathon-messages-project_svc-ListResponse"></a>

### ListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| projects | [hackathon.entities.Project](#hackathon-entities-Project) | repeated |  |





 

 

 

 



<a name="hackathon_messages_project_svc_propose_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/propose_request.proto



<a name="hackathon-messages-project_svc-ProposeRequest"></a>

### ProposeRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| title | [string](#string) |  |  |
| description | [string](#string) |  |  |
| track_id | [string](#string) | optional |  |
| image | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_project_svc_propose_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/propose_response.proto



<a name="hackathon-messages-project_svc-ProposeResponse"></a>

### ProposeResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_set_preference_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/set_preference_request.proto



<a name="hackathon-messages-project_svc-SetPreferenceRequest"></a>

### SetPreferenceRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_set_preference_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/set_preference_response.proto



<a name="hackathon-messages-project_svc-SetPreferenceResponse"></a>

### SetPreferenceResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_assign_user_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/assign_user_request.proto



<a name="hackathon-messages-team_svc-AssignUserRequest"></a>

### AssignUserRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| team_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_assign_user_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/assign_user_response.proto



<a name="hackathon-messages-team_svc-AssignUserResponse"></a>

### AssignUserResponse






 

 

 

 



<a name="hackathon_messages_team_svc_create_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/create_request.proto



<a name="hackathon-messages-team_svc-CreateRequest"></a>

### CreateRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| description | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_create_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/create_response.proto



<a name="hackathon-messages-team_svc-CreateResponse"></a>

### CreateResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| team_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_create_submission_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/create_submission_request.proto



<a name="hackathon-messages-team_svc-CreateSubmissionRequest"></a>

### CreateSubmissionRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| team_id | [string](#string) |  |  |
| project_id | [string](#string) |  |  |
| result | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_team_svc_create_submission_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/create_submission_response.proto



<a name="hackathon-messages-team_svc-CreateSubmissionResponse"></a>

### CreateSubmissionResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_delete_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/delete_request.proto



<a name="hackathon-messages-team_svc-DeleteRequest"></a>

### DeleteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_delete_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/delete_response.proto



<a name="hackathon-messages-team_svc-DeleteResponse"></a>

### DeleteResponse






 

 

 

 



<a name="hackathon_messages_team_svc_edit_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/edit_request.proto



<a name="hackathon-messages-team_svc-EditRequest"></a>

### EditRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) | optional |  |
| description | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_team_svc_edit_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/edit_response.proto



<a name="hackathon-messages-team_svc-EditResponse"></a>

### EditResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| team | [hackathon.entities.Team](#hackathon-entities-Team) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_finalize_submission_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/finalize_submission_request.proto



<a name="hackathon-messages-team_svc-FinalizeSubmissionRequest"></a>

### FinalizeSubmissionRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_finalize_submission_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/finalize_submission_response.proto



<a name="hackathon-messages-team_svc-FinalizeSubmissionResponse"></a>

### FinalizeSubmissionResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission | [hackathon.entities.Submission](#hackathon-entities-Submission) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/get_request.proto



<a name="hackathon-messages-team_svc-GetRequest"></a>

### GetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| team_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/get_response.proto



<a name="hackathon-messages-team_svc-GetResponse"></a>

### GetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| team | [hackathon.entities.Team](#hackathon-entities-Team) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/list_request.proto



<a name="hackathon-messages-team_svc-ListRequest"></a>

### ListRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) | optional |  |
| project_id | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_team_svc_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/list_response.proto



<a name="hackathon-messages-team_svc-ListResponse"></a>

### ListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| teams | [hackathon.entities.Team](#hackathon-entities-Team) | repeated |  |





 

 

 

 



<a name="hackathon_messages_team_svc_remove_user_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/remove_user_request.proto



<a name="hackathon-messages-team_svc-RemoveUserRequest"></a>

### RemoveUserRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| team_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_remove_user_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/remove_user_response.proto



<a name="hackathon-messages-team_svc-RemoveUserResponse"></a>

### RemoveUserResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| team | [hackathon.entities.Team](#hackathon-entities-Team) |  |  |





 

 

 

 



<a name="hackathon_messages_track_svc_create_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/track_svc/create_request.proto



<a name="hackathon-messages-track_svc-CreateRequest"></a>

### CreateRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| description | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_track_svc_create_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/track_svc/create_response.proto



<a name="hackathon-messages-track_svc-CreateResponse"></a>

### CreateResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| track_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_track_svc_delete_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/track_svc/delete_request.proto



<a name="hackathon-messages-track_svc-DeleteRequest"></a>

### DeleteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| track_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_track_svc_delete_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/track_svc/delete_response.proto



<a name="hackathon-messages-track_svc-DeleteResponse"></a>

### DeleteResponse






 

 

 

 



<a name="hackathon_messages_track_svc_edit_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/track_svc/edit_request.proto



<a name="hackathon-messages-track_svc-EditRequest"></a>

### EditRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| track_id | [string](#string) |  |  |
| name | [string](#string) | optional |  |
| description | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_track_svc_edit_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/track_svc/edit_response.proto



<a name="hackathon-messages-track_svc-EditResponse"></a>

### EditResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| track | [hackathon.entities.Track](#hackathon-entities-Track) |  |  |





 

 

 

 



<a name="hackathon_messages_track_svc_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/track_svc/get_request.proto



<a name="hackathon-messages-track_svc-GetRequest"></a>

### GetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| track_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_track_svc_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/track_svc/get_response.proto



<a name="hackathon-messages-track_svc-GetResponse"></a>

### GetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| track | [hackathon.entities.Track](#hackathon-entities-Track) |  |  |





 

 

 

 



<a name="hackathon_messages_track_svc_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/track_svc/list_request.proto



<a name="hackathon-messages-track_svc-ListRequest"></a>

### ListRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_track_svc_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/track_svc/list_response.proto



<a name="hackathon-messages-track_svc-ListResponse"></a>

### ListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| tracks | [hackathon.entities.Track](#hackathon-entities-Track) | repeated |  |





 

 

 

 



<a name="hackathon_page_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/page_service.proto


 

 

 


<a name="hackathon-PageService"></a>

### PageService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [messages.page_svc.ListRequest](#hackathon-messages-page_svc-ListRequest) | [messages.page_svc.ListResponse](#hackathon-messages-page_svc-ListResponse) |  |
| Get | [messages.page_svc.GetRequest](#hackathon-messages-page_svc-GetRequest) | [messages.page_svc.GetResponse](#hackathon-messages-page_svc-GetResponse) |  |
| Create | [messages.page_svc.CreateRequest](#hackathon-messages-page_svc-CreateRequest) | [messages.page_svc.CreateResponse](#hackathon-messages-page_svc-CreateResponse) |  |
| Edit | [messages.page_svc.EditRequest](#hackathon-messages-page_svc-EditRequest) | [messages.page_svc.EditResponse](#hackathon-messages-page_svc-EditResponse) |  |
| Delete | [messages.page_svc.DeleteRequest](#hackathon-messages-page_svc-DeleteRequest) | [messages.page_svc.DeleteResponse](#hackathon-messages-page_svc-DeleteResponse) |  |
| MoveUp | [messages.page_svc.MoveUpRequest](#hackathon-messages-page_svc-MoveUpRequest) | [messages.page_svc.MoveUpResponse](#hackathon-messages-page_svc-MoveUpResponse) | Reordering methods - backend manages order uniqueness |
| MoveDown | [messages.page_svc.MoveDownRequest](#hackathon-messages-page_svc-MoveDownRequest) | [messages.page_svc.MoveDownResponse](#hackathon-messages-page_svc-MoveDownResponse) |  |
| SetOrder | [messages.page_svc.SetOrderRequest](#hackathon-messages-page_svc-SetOrderRequest) | [messages.page_svc.SetOrderResponse](#hackathon-messages-page_svc-SetOrderResponse) |  |

 



<a name="hackathon_phase_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/phase_service.proto


 

 

 


<a name="hackathon-PhaseService"></a>

### PhaseService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [messages.phase_svc.ListRequest](#hackathon-messages-phase_svc-ListRequest) | [messages.phase_svc.ListResponse](#hackathon-messages-phase_svc-ListResponse) |  |
| Get | [messages.phase_svc.GetRequest](#hackathon-messages-phase_svc-GetRequest) | [messages.phase_svc.GetResponse](#hackathon-messages-phase_svc-GetResponse) |  |
| Create | [messages.phase_svc.CreateRequest](#hackathon-messages-phase_svc-CreateRequest) | [messages.phase_svc.CreateResponse](#hackathon-messages-phase_svc-CreateResponse) |  |
| Edit | [messages.phase_svc.EditRequest](#hackathon-messages-phase_svc-EditRequest) | [messages.phase_svc.EditResponse](#hackathon-messages-phase_svc-EditResponse) |  |
| Delete | [messages.phase_svc.DeleteRequest](#hackathon-messages-phase_svc-DeleteRequest) | [messages.phase_svc.DeleteResponse](#hackathon-messages-phase_svc-DeleteResponse) |  |

 



<a name="hackathon_project_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/project_service.proto


 

 

 


<a name="hackathon-ProjectService"></a>

### ProjectService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [messages.project_svc.ListRequest](#hackathon-messages-project_svc-ListRequest) | [messages.project_svc.ListResponse](#hackathon-messages-project_svc-ListResponse) |  |
| Get | [messages.project_svc.GetRequest](#hackathon-messages-project_svc-GetRequest) | [messages.project_svc.GetResponse](#hackathon-messages-project_svc-GetResponse) |  |
| Propose | [messages.project_svc.ProposeRequest](#hackathon-messages-project_svc-ProposeRequest) | [messages.project_svc.ProposeResponse](#hackathon-messages-project_svc-ProposeResponse) |  |
| Approve | [messages.project_svc.ApproveRequest](#hackathon-messages-project_svc-ApproveRequest) | [messages.project_svc.ApproveResponse](#hackathon-messages-project_svc-ApproveResponse) |  |
| Disapprove | [messages.project_svc.DisapproveRequest](#hackathon-messages-project_svc-DisapproveRequest) | [messages.project_svc.DisapproveResponse](#hackathon-messages-project_svc-DisapproveResponse) |  |
| SetPreference | [messages.project_svc.SetPreferenceRequest](#hackathon-messages-project_svc-SetPreferenceRequest) | [messages.project_svc.SetPreferenceResponse](#hackathon-messages-project_svc-SetPreferenceResponse) |  |
| ExportPreferences | [messages.project_svc.ExportPreferencesRequest](#hackathon-messages-project_svc-ExportPreferencesRequest) | [messages.project_svc.ExportPreferencesResponse](#hackathon-messages-project_svc-ExportPreferencesResponse) |  |
| Edit | [messages.project_svc.EditRequest](#hackathon-messages-project_svc-EditRequest) | [messages.project_svc.EditResponse](#hackathon-messages-project_svc-EditResponse) |  |
| Delete | [messages.project_svc.DeleteRequest](#hackathon-messages-project_svc-DeleteRequest) | [messages.project_svc.DeleteResponse](#hackathon-messages-project_svc-DeleteResponse) |  |

 



<a name="hackathon_team_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/team_service.proto


 

 

 


<a name="hackathon-TeamService"></a>

### TeamService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [messages.team_svc.ListRequest](#hackathon-messages-team_svc-ListRequest) | [messages.team_svc.ListResponse](#hackathon-messages-team_svc-ListResponse) |  |
| Get | [messages.team_svc.GetRequest](#hackathon-messages-team_svc-GetRequest) | [messages.team_svc.GetResponse](#hackathon-messages-team_svc-GetResponse) |  |
| Create | [messages.team_svc.CreateRequest](#hackathon-messages-team_svc-CreateRequest) | [messages.team_svc.CreateResponse](#hackathon-messages-team_svc-CreateResponse) |  |
| Edit | [messages.team_svc.EditRequest](#hackathon-messages-team_svc-EditRequest) | [messages.team_svc.EditResponse](#hackathon-messages-team_svc-EditResponse) |  |
| Delete | [messages.team_svc.DeleteRequest](#hackathon-messages-team_svc-DeleteRequest) | [messages.team_svc.DeleteResponse](#hackathon-messages-team_svc-DeleteResponse) |  |
| AssignUser | [messages.team_svc.AssignUserRequest](#hackathon-messages-team_svc-AssignUserRequest) | [messages.team_svc.AssignUserResponse](#hackathon-messages-team_svc-AssignUserResponse) |  |
| RemoveUser | [messages.team_svc.RemoveUserRequest](#hackathon-messages-team_svc-RemoveUserRequest) | [messages.team_svc.RemoveUserResponse](#hackathon-messages-team_svc-RemoveUserResponse) |  |
| CreateSubmission | [messages.team_svc.CreateSubmissionRequest](#hackathon-messages-team_svc-CreateSubmissionRequest) | [messages.team_svc.CreateSubmissionResponse](#hackathon-messages-team_svc-CreateSubmissionResponse) |  |
| FinalizeSubmission | [messages.team_svc.FinalizeSubmissionRequest](#hackathon-messages-team_svc-FinalizeSubmissionRequest) | [messages.team_svc.FinalizeSubmissionResponse](#hackathon-messages-team_svc-FinalizeSubmissionResponse) |  |

 



<a name="hackathon_track_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/track_service.proto


 

 

 


<a name="hackathon-TrackService"></a>

### TrackService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [messages.track_svc.ListRequest](#hackathon-messages-track_svc-ListRequest) | [messages.track_svc.ListResponse](#hackathon-messages-track_svc-ListResponse) |  |
| Get | [messages.track_svc.GetRequest](#hackathon-messages-track_svc-GetRequest) | [messages.track_svc.GetResponse](#hackathon-messages-track_svc-GetResponse) |  |
| Create | [messages.track_svc.CreateRequest](#hackathon-messages-track_svc-CreateRequest) | [messages.track_svc.CreateResponse](#hackathon-messages-track_svc-CreateResponse) |  |
| Edit | [messages.track_svc.EditRequest](#hackathon-messages-track_svc-EditRequest) | [messages.track_svc.EditResponse](#hackathon-messages-track_svc-EditResponse) |  |
| Delete | [messages.track_svc.DeleteRequest](#hackathon-messages-track_svc-DeleteRequest) | [messages.track_svc.DeleteResponse](#hackathon-messages-track_svc-DeleteResponse) |  |

 



<a name="health_messages_health_svc_check_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## health/messages/health_svc/check_request.proto



<a name="health-messages-health_svc-CheckRequest"></a>

### CheckRequest






 

 

 

 



<a name="health_messages_health_svc_check_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## health/messages/health_svc/check_response.proto



<a name="health-messages-health_svc-CheckResponse"></a>

### CheckResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| message | [string](#string) |  |  |





 

 

 

 



<a name="health_health_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## health/health_service.proto


 

 

 


<a name="health-HealthService"></a>

### HealthService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| Check | [messages.health_svc.CheckRequest](#health-messages-health_svc-CheckRequest) | [messages.health_svc.CheckResponse](#health-messages-health_svc-CheckResponse) |  |

 



<a name="user_messages_user_svc_add_role_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/add_role_request.proto



<a name="user-messages-user_svc-AddRoleRequest"></a>

### AddRoleRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user_id | [string](#string) |  |  |
| role | [user.entities.GlobalRole](#user-entities-GlobalRole) |  |  |





 

 

 

 



<a name="user_messages_user_svc_add_role_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/add_role_response.proto



<a name="user-messages-user_svc-AddRoleResponse"></a>

### AddRoleResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [user.entities.User](#user-entities-User) |  |  |





 

 

 

 



<a name="user_messages_user_svc_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/get_request.proto



<a name="user-messages-user_svc-GetRequest"></a>

### GetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="user_messages_user_svc_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/get_response.proto



<a name="user-messages-user_svc-GetResponse"></a>

### GetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [user.entities.User](#user-entities-User) |  |  |





 

 

 

 



<a name="user_messages_user_svc_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/list_request.proto



<a name="user-messages-user_svc-ListRequest"></a>

### ListRequest






 

 

 

 



<a name="user_messages_user_svc_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/list_response.proto



<a name="user-messages-user_svc-ListResponse"></a>

### ListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| users | [user.entities.User](#user-entities-User) | repeated |  |





 

 

 

 



<a name="user_messages_user_svc_register_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/register_request.proto



<a name="user-messages-user_svc-RegisterRequest"></a>

### RegisterRequest






 

 

 

 



<a name="user_messages_user_svc_register_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/register_response.proto



<a name="user-messages-user_svc-RegisterResponse"></a>

### RegisterResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [user.entities.User](#user-entities-User) |  |  |





 

 

 

 



<a name="user_messages_user_svc_remove_role_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/remove_role_request.proto



<a name="user-messages-user_svc-RemoveRoleRequest"></a>

### RemoveRoleRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user_id | [string](#string) |  |  |
| role | [user.entities.GlobalRole](#user-entities-GlobalRole) |  |  |





 

 

 

 



<a name="user_messages_user_svc_remove_role_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/remove_role_response.proto



<a name="user-messages-user_svc-RemoveRoleResponse"></a>

### RemoveRoleResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user | [user.entities.User](#user-entities-User) |  |  |





 

 

 

 



<a name="user_messages_user_svc_who_am_i_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/who_am_i_request.proto



<a name="user-messages-user_svc-WhoAmIRequest"></a>

### WhoAmIRequest






 

 

 

 



<a name="user_messages_user_svc_who_am_i_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/who_am_i_response.proto



<a name="user-messages-user_svc-WhoAmIResponse"></a>

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
| List | [messages.user_svc.ListRequest](#user-messages-user_svc-ListRequest) | [messages.user_svc.ListResponse](#user-messages-user_svc-ListResponse) |  |
| Get | [messages.user_svc.GetRequest](#user-messages-user_svc-GetRequest) | [messages.user_svc.GetResponse](#user-messages-user_svc-GetResponse) |  |
| WhoAmI | [messages.user_svc.WhoAmIRequest](#user-messages-user_svc-WhoAmIRequest) | [messages.user_svc.WhoAmIResponse](#user-messages-user_svc-WhoAmIResponse) |  |
| Register | [messages.user_svc.RegisterRequest](#user-messages-user_svc-RegisterRequest) | [messages.user_svc.RegisterResponse](#user-messages-user_svc-RegisterResponse) |  |
| AddRole | [messages.user_svc.AddRoleRequest](#user-messages-user_svc-AddRoleRequest) | [messages.user_svc.AddRoleResponse](#user-messages-user_svc-AddRoleResponse) |  |
| RemoveRole | [messages.user_svc.RemoveRoleRequest](#user-messages-user_svc-RemoveRoleRequest) | [messages.user_svc.RemoveRoleResponse](#user-messages-user_svc-RemoveRoleResponse) |  |

 



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

