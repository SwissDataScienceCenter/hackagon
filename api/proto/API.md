# Protocol Documentation
<a name="top"></a>

## Table of Contents

- [hackathon/messages/config_svc/override_window_request.proto](#hackathon_messages_config_svc_override_window_request-proto)
    - [OverrideWindowRequest](#hackathon-messages-config_svc-OverrideWindowRequest)
  
- [hackathon/entities/hackathon_window_set.proto](#hackathon_entities_hackathon_window_set-proto)
    - [HackathonWindows](#hackathon-entities-HackathonWindows)
  
- [hackathon/messages/config_svc/override_window_response.proto](#hackathon_messages_config_svc_override_window_response-proto)
    - [OverrideWindowResponse](#hackathon-messages-config_svc-OverrideWindowResponse)
  
- [hackathon/entities/form_schema.proto](#hackathon_entities_form_schema-proto)
    - [ConsentField](#hackathon-entities-ConsentField)
    - [FormField](#hackathon-entities-FormField)
    - [FormSchema](#hackathon-entities-FormSchema)
  
- [hackathon/messages/config_svc/set_registration_form_request.proto](#hackathon_messages_config_svc_set_registration_form_request-proto)
    - [SetRegistrationFormRequest](#hackathon-messages-config_svc-SetRegistrationFormRequest)
  
- [hackathon/messages/config_svc/set_registration_form_response.proto](#hackathon_messages_config_svc_set_registration_form_response-proto)
    - [SetRegistrationFormResponse](#hackathon-messages-config_svc-SetRegistrationFormResponse)
  
- [hackathon/messages/config_svc/set_submission_form_request.proto](#hackathon_messages_config_svc_set_submission_form_request-proto)
    - [SetSubmissionFormRequest](#hackathon-messages-config_svc-SetSubmissionFormRequest)
  
- [hackathon/messages/config_svc/set_submission_form_response.proto](#hackathon_messages_config_svc_set_submission_form_response-proto)
    - [SetSubmissionFormResponse](#hackathon-messages-config_svc-SetSubmissionFormResponse)
  
- [hackathon/messages/config_svc/set_voting_policy_request.proto](#hackathon_messages_config_svc_set_voting_policy_request-proto)
    - [ScaleRange](#hackathon-messages-config_svc-ScaleRange)
    - [SetVotingPolicyRequest](#hackathon-messages-config_svc-SetVotingPolicyRequest)
  
- [hackathon/messages/config_svc/set_voting_policy_response.proto](#hackathon_messages_config_svc_set_voting_policy_response-proto)
    - [SetVotingPolicyResponse](#hackathon-messages-config_svc-SetVotingPolicyResponse)
  
- [hackathon/messages/config_svc/set_windows_request.proto](#hackathon_messages_config_svc_set_windows_request-proto)
    - [SetWindowsRequest](#hackathon-messages-config_svc-SetWindowsRequest)
  
- [hackathon/messages/config_svc/set_windows_response.proto](#hackathon_messages_config_svc_set_windows_response-proto)
    - [SetWindowsResponse](#hackathon-messages-config_svc-SetWindowsResponse)
  
- [hackathon/config_service.proto](#hackathon_config_service-proto)
    - [ConfigService](#hackathon-ConfigService)
  
- [hackathon/entities/capability.proto](#hackathon_entities_capability-proto)
    - [CapabilityStatus](#hackathon-entities-CapabilityStatus)
  
    - [Capability](#hackathon-entities-Capability)
    - [CapabilityState](#hackathon-entities-CapabilityState)
  
- [hackathon/entities/hackathon_role.proto](#hackathon_entities_hackathon_role-proto)
    - [HackathonRole](#hackathon-entities-HackathonRole)
  
- [user/entities/global_role.proto](#user_entities_global_role-proto)
    - [GlobalRole](#user-entities-GlobalRole)
  
- [user/entities/user.proto](#user_entities_user-proto)
    - [User](#user-entities-User)
  
- [hackathon/entities/hackathon_member.proto](#hackathon_entities_hackathon_member-proto)
    - [HackathonMember](#hackathon-entities-HackathonMember)
  
- [hackathon/entities/hackathon_settings.proto](#hackathon_entities_hackathon_settings-proto)
    - [HackathonSettings](#hackathon-entities-HackathonSettings)
  
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
  
- [hackathon/messages/hackathon_svc/advance_phase_request.proto](#hackathon_messages_hackathon_svc_advance_phase_request-proto)
    - [AdvancePhaseRequest](#hackathon-messages-hackathon_svc-AdvancePhaseRequest)
  
- [hackathon/messages/hackathon_svc/advance_phase_response.proto](#hackathon_messages_hackathon_svc_advance_phase_response-proto)
    - [AdvancePhaseResponse](#hackathon-messages-hackathon_svc-AdvancePhaseResponse)
  
- [hackathon/messages/hackathon_svc/approve_participant_request.proto](#hackathon_messages_hackathon_svc_approve_participant_request-proto)
    - [ApproveParticipantRequest](#hackathon-messages-hackathon_svc-ApproveParticipantRequest)
  
- [hackathon/messages/hackathon_svc/approve_participant_response.proto](#hackathon_messages_hackathon_svc_approve_participant_response-proto)
    - [ApproveParticipantResponse](#hackathon-messages-hackathon_svc-ApproveParticipantResponse)
  
- [hackathon/messages/hackathon_svc/create_request.proto](#hackathon_messages_hackathon_svc_create_request-proto)
    - [CreateRequest](#hackathon-messages-hackathon_svc-CreateRequest)
  
- [hackathon/messages/hackathon_svc/create_response.proto](#hackathon_messages_hackathon_svc_create_response-proto)
    - [CreateResponse](#hackathon-messages-hackathon_svc-CreateResponse)
  
- [hackathon/messages/hackathon_svc/edit_capability_request.proto](#hackathon_messages_hackathon_svc_edit_capability_request-proto)
    - [EditCapabilityRequest](#hackathon-messages-hackathon_svc-EditCapabilityRequest)
  
- [hackathon/messages/hackathon_svc/edit_capability_response.proto](#hackathon_messages_hackathon_svc_edit_capability_response-proto)
    - [EditCapabilityResponse](#hackathon-messages-hackathon_svc-EditCapabilityResponse)
  
- [hackathon/messages/hackathon_svc/edit_request.proto](#hackathon_messages_hackathon_svc_edit_request-proto)
    - [EditRequest](#hackathon-messages-hackathon_svc-EditRequest)
  
- [hackathon/messages/hackathon_svc/edit_response.proto](#hackathon_messages_hackathon_svc_edit_response-proto)
    - [EditResponse](#hackathon-messages-hackathon_svc-EditResponse)
  
- [hackathon/messages/hackathon_svc/edit_settings_request.proto](#hackathon_messages_hackathon_svc_edit_settings_request-proto)
    - [EditSettingsRequest](#hackathon-messages-hackathon_svc-EditSettingsRequest)
  
- [hackathon/messages/hackathon_svc/edit_settings_response.proto](#hackathon_messages_hackathon_svc_edit_settings_response-proto)
    - [EditSettingsResponse](#hackathon-messages-hackathon_svc-EditSettingsResponse)
  
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
  
- [hackathon/messages/hackathon_svc/submit_registration_form_request.proto](#hackathon_messages_hackathon_svc_submit_registration_form_request-proto)
    - [SubmitRegistrationFormRequest](#hackathon-messages-hackathon_svc-SubmitRegistrationFormRequest)
    - [SubmitRegistrationFormRequest.ConsentsEntry](#hackathon-messages-hackathon_svc-SubmitRegistrationFormRequest-ConsentsEntry)
  
- [hackathon/messages/hackathon_svc/submit_registration_form_response.proto](#hackathon_messages_hackathon_svc_submit_registration_form_response-proto)
    - [SubmitRegistrationFormResponse](#hackathon-messages-hackathon_svc-SubmitRegistrationFormResponse)
  
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
  
- [hackathon/messages/team_svc/get_submission_request.proto](#hackathon_messages_team_svc_get_submission_request-proto)
    - [GetSubmissionRequest](#hackathon-messages-team_svc-GetSubmissionRequest)
  
- [hackathon/messages/team_svc/get_submission_response.proto](#hackathon_messages_team_svc_get_submission_response-proto)
    - [GetSubmissionResponse](#hackathon-messages-team_svc-GetSubmissionResponse)
  
- [hackathon/messages/team_svc/list_request.proto](#hackathon_messages_team_svc_list_request-proto)
    - [ListRequest](#hackathon-messages-team_svc-ListRequest)
  
- [hackathon/messages/team_svc/list_response.proto](#hackathon_messages_team_svc_list_response-proto)
    - [ListResponse](#hackathon-messages-team_svc-ListResponse)
  
- [hackathon/messages/team_svc/list_submissions_request.proto](#hackathon_messages_team_svc_list_submissions_request-proto)
    - [ListSubmissionsRequest](#hackathon-messages-team_svc-ListSubmissionsRequest)
  
- [hackathon/messages/team_svc/list_submissions_response.proto](#hackathon_messages_team_svc_list_submissions_response-proto)
    - [ListSubmissionsResponse](#hackathon-messages-team_svc-ListSubmissionsResponse)
  
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
  
- [vote/entities/vote.proto](#vote_entities_vote-proto)
    - [PointsVote](#vote-entities-PointsVote)
    - [PointsVote.PointsGrantedEntry](#vote-entities-PointsVote-PointsGrantedEntry)
    - [RankedVote](#vote-entities-RankedVote)
    - [SingleChoiceVote](#vote-entities-SingleChoiceVote)
    - [Vote](#vote-entities-Vote)
  
- [vote/entities/voter_type.proto](#vote_entities_voter_type-proto)
    - [VoterType](#vote-entities-VoterType)
  
- [vote/entities/voting_method.proto](#vote_entities_voting_method-proto)
    - [VotingMethod](#vote-entities-VotingMethod)
  
- [vote/entities/vote_category.proto](#vote_entities_vote_category-proto)
    - [VoteCategory](#vote-entities-VoteCategory)
  
- [vote/entities/vote_result.proto](#vote_entities_vote_result-proto)
    - [VoteResult](#vote-entities-VoteResult)
  
- [vote/messages/vote_svc/create_category_request.proto](#vote_messages_vote_svc_create_category_request-proto)
    - [CreateVoteCategoryRequest](#vote-messages-vote_svc-CreateVoteCategoryRequest)
  
- [vote/messages/vote_svc/create_category_response.proto](#vote_messages_vote_svc_create_category_response-proto)
    - [CreateVoteCategoryResponse](#vote-messages-vote_svc-CreateVoteCategoryResponse)
  
- [vote/messages/vote_svc/create_result_request.proto](#vote_messages_vote_svc_create_result_request-proto)
    - [CreateVoteResultRequest](#vote-messages-vote_svc-CreateVoteResultRequest)
  
- [vote/messages/vote_svc/create_result_response.proto](#vote_messages_vote_svc_create_result_response-proto)
    - [CreateVoteResultResponse](#vote-messages-vote_svc-CreateVoteResultResponse)
  
- [vote/messages/vote_svc/delete_category_request.proto](#vote_messages_vote_svc_delete_category_request-proto)
    - [DeleteVoteCategoryRequest](#vote-messages-vote_svc-DeleteVoteCategoryRequest)
  
- [vote/messages/vote_svc/delete_category_response.proto](#vote_messages_vote_svc_delete_category_response-proto)
    - [DeleteVoteCategoryResponse](#vote-messages-vote_svc-DeleteVoteCategoryResponse)
  
- [vote/messages/vote_svc/delete_result_request.proto](#vote_messages_vote_svc_delete_result_request-proto)
    - [DeleteVoteResultRequest](#vote-messages-vote_svc-DeleteVoteResultRequest)
  
- [vote/messages/vote_svc/delete_result_response.proto](#vote_messages_vote_svc_delete_result_response-proto)
    - [DeleteVoteResultResponse](#vote-messages-vote_svc-DeleteVoteResultResponse)
  
- [vote/messages/vote_svc/edit_category_request.proto](#vote_messages_vote_svc_edit_category_request-proto)
    - [EditVoteCategoryRequest](#vote-messages-vote_svc-EditVoteCategoryRequest)
  
- [vote/messages/vote_svc/edit_category_response.proto](#vote_messages_vote_svc_edit_category_response-proto)
    - [EditVoteCategoryResponse](#vote-messages-vote_svc-EditVoteCategoryResponse)
  
- [vote/messages/vote_svc/edit_result_request.proto](#vote_messages_vote_svc_edit_result_request-proto)
    - [EditVoteResultRequest](#vote-messages-vote_svc-EditVoteResultRequest)
  
- [vote/messages/vote_svc/edit_result_response.proto](#vote_messages_vote_svc_edit_result_response-proto)
    - [EditVoteResultResponse](#vote-messages-vote_svc-EditVoteResultResponse)
  
- [vote/messages/vote_svc/export_votes_request.proto](#vote_messages_vote_svc_export_votes_request-proto)
    - [ExportVotesRequest](#vote-messages-vote_svc-ExportVotesRequest)
  
    - [ExportFormat](#vote-messages-vote_svc-ExportFormat)
  
- [vote/messages/vote_svc/export_results_request.proto](#vote_messages_vote_svc_export_results_request-proto)
    - [ExportResultsRequest](#vote-messages-vote_svc-ExportResultsRequest)
  
- [vote/messages/vote_svc/export_results_response.proto](#vote_messages_vote_svc_export_results_response-proto)
    - [ExportResultsResponse](#vote-messages-vote_svc-ExportResultsResponse)
  
- [vote/messages/vote_svc/export_votes_response.proto](#vote_messages_vote_svc_export_votes_response-proto)
    - [ExportVotesResponse](#vote-messages-vote_svc-ExportVotesResponse)
  
- [vote/messages/vote_svc/get_category_request.proto](#vote_messages_vote_svc_get_category_request-proto)
    - [GetVoteCategoryRequest](#vote-messages-vote_svc-GetVoteCategoryRequest)
  
- [vote/messages/vote_svc/get_category_response.proto](#vote_messages_vote_svc_get_category_response-proto)
    - [GetVoteCategoryResponse](#vote-messages-vote_svc-GetVoteCategoryResponse)
  
- [vote/messages/vote_svc/get_vote_request.proto](#vote_messages_vote_svc_get_vote_request-proto)
    - [GetVoteRequest](#vote-messages-vote_svc-GetVoteRequest)
  
- [vote/messages/vote_svc/get_vote_response.proto](#vote_messages_vote_svc_get_vote_response-proto)
    - [GetVoteResponse](#vote-messages-vote_svc-GetVoteResponse)
  
- [vote/messages/vote_svc/list_categories_request.proto](#vote_messages_vote_svc_list_categories_request-proto)
    - [ListVoteCategoriesRequest](#vote-messages-vote_svc-ListVoteCategoriesRequest)
  
- [vote/messages/vote_svc/list_categories_response.proto](#vote_messages_vote_svc_list_categories_response-proto)
    - [ListVoteCategoriesResponse](#vote-messages-vote_svc-ListVoteCategoriesResponse)
  
- [vote/messages/vote_svc/list_results_request.proto](#vote_messages_vote_svc_list_results_request-proto)
    - [ListVoteResultsRequest](#vote-messages-vote_svc-ListVoteResultsRequest)
  
- [vote/messages/vote_svc/list_results_response.proto](#vote_messages_vote_svc_list_results_response-proto)
    - [ListVoteResultsResponse](#vote-messages-vote_svc-ListVoteResultsResponse)
  
- [vote/messages/vote_svc/list_votes_request.proto](#vote_messages_vote_svc_list_votes_request-proto)
    - [ListVotesRequest](#vote-messages-vote_svc-ListVotesRequest)
  
- [vote/messages/vote_svc/list_votes_response.proto](#vote_messages_vote_svc_list_votes_response-proto)
    - [ListVotesResponse](#vote-messages-vote_svc-ListVotesResponse)
  
- [vote/messages/vote_svc/submit_vote_request.proto](#vote_messages_vote_svc_submit_vote_request-proto)
    - [PointsVote](#vote-messages-vote_svc-PointsVote)
    - [PointsVote.PointsGrantedEntry](#vote-messages-vote_svc-PointsVote-PointsGrantedEntry)
    - [RankedVote](#vote-messages-vote_svc-RankedVote)
    - [SingleChoiceVote](#vote-messages-vote_svc-SingleChoiceVote)
    - [SubmitVoteRequest](#vote-messages-vote_svc-SubmitVoteRequest)
  
- [vote/messages/vote_svc/submit_vote_response.proto](#vote_messages_vote_svc_submit_vote_response-proto)
    - [SubmitVoteResponse](#vote-messages-vote_svc-SubmitVoteResponse)
  
- [vote/vote_service.proto](#vote_vote_service-proto)
    - [VoteService](#vote-VoteService)
  
- [Scalar Value Types](#scalar-value-types)



<a name="hackathon_messages_config_svc_override_window_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/override_window_request.proto



<a name="hackathon-messages-config_svc-OverrideWindowRequest"></a>

### OverrideWindowRequest
One-shot manual extension: the window stays open until now &#43; extend_minutes
regardless of its configured close (walk-ins at the door, AV issues during
demos). The organizer has the final word over the clock.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| window | [string](#string) |  | Which window to extend: &#34;registration&#34; or &#34;submissions&#34;. |
| extend_minutes | [int32](#int32) |  |  |
| reason | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_entities_hackathon_window_set-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_window_set.proto



<a name="hackathon-entities-HackathonWindows"></a>

### HackathonWindows
HackathonWindows holds the per-hackathon time windows the backend enforces
on the acting RPCs (Join, Propose, SetPreference, CreateSubmission).
Unset fields are not enforced. Overrides are absolute one-shot extensions
anchored at the moment the organizer granted them.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| registration_opens | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| registration_closes | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| proposals_close | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| preferences_close | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| submissions_close | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| registration_override_until | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| submissions_override_until | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| late_policy | [string](#string) | optional | Human-readable note on how late submissions are handled. |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |





 

 

 

 



<a name="hackathon_messages_config_svc_override_window_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/override_window_response.proto



<a name="hackathon-messages-config_svc-OverrideWindowResponse"></a>

### OverrideWindowResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| windows | [hackathon.entities.HackathonWindows](#hackathon-entities-HackathonWindows) |  |  |





 

 

 

 



<a name="hackathon_entities_form_schema-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/form_schema.proto



<a name="hackathon-entities-ConsentField"></a>

### ConsentField
ConsentField is a checkbox the registrant must (or may) tick.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| label | [string](#string) |  |  |
| required | [bool](#bool) |  |  |






<a name="hackathon-entities-FormField"></a>

### FormField
FormField is one input in an organizer-defined form. `type` is a free
string (&#34;text&#34;, &#34;tags&#34;, &#34;url&#34;, &#34;file-or-url&#34;, ...) — the backend validates
presence and key membership, not deep typing, until a form engine exists.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| label | [string](#string) |  |  |
| type | [string](#string) |  |  |
| required | [bool](#bool) |  |  |
| max_mb | [int32](#int32) | optional | Upload size cap for file-typed fields, in megabytes. |






<a name="hackathon-entities-FormSchema"></a>

### FormSchema
FormSchema is an organizer-defined form: fields plus consents.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| fields | [FormField](#hackathon-entities-FormField) | repeated |  |
| consents | [ConsentField](#hackathon-entities-ConsentField) | repeated |  |





 

 

 

 



<a name="hackathon_messages_config_svc_set_registration_form_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_registration_form_request.proto



<a name="hackathon-messages-config_svc-SetRegistrationFormRequest"></a>

### SetRegistrationFormRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| fields | [hackathon.entities.FormField](#hackathon-entities-FormField) | repeated |  |
| consents | [hackathon.entities.ConsentField](#hackathon-entities-ConsentField) | repeated |  |





 

 

 

 



<a name="hackathon_messages_config_svc_set_registration_form_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_registration_form_response.proto



<a name="hackathon-messages-config_svc-SetRegistrationFormResponse"></a>

### SetRegistrationFormResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| form | [hackathon.entities.FormSchema](#hackathon-entities-FormSchema) |  |  |





 

 

 

 



<a name="hackathon_messages_config_svc_set_submission_form_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_submission_form_request.proto



<a name="hackathon-messages-config_svc-SetSubmissionFormRequest"></a>

### SetSubmissionFormRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| fields | [hackathon.entities.FormField](#hackathon-entities-FormField) | repeated |  |





 

 

 

 



<a name="hackathon_messages_config_svc_set_submission_form_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_submission_form_response.proto



<a name="hackathon-messages-config_svc-SetSubmissionFormResponse"></a>

### SetSubmissionFormResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| form | [hackathon.entities.FormSchema](#hackathon-entities-FormSchema) |  |  |





 

 

 

 



<a name="hackathon_messages_config_svc_set_voting_policy_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_voting_policy_request.proto



<a name="hackathon-messages-config_svc-ScaleRange"></a>

### ScaleRange



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| min | [int32](#int32) |  |  |
| max | [int32](#int32) |  |  |






<a name="hackathon-messages-config_svc-SetVotingPolicyRequest"></a>

### SetVotingPolicyRequest
Pins the voting mechanism decisions. Stored as configuration; the vote
handlers enforce the parts the platform implements (single ballot per
category today) and the rest documents the organizer&#39;s ruling.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| mechanism | [string](#string) |  |  |
| scale | [ScaleRange](#hackathon-messages-config_svc-ScaleRange) |  |  |
| one_ballot_per | [string](#string) |  |  |
| own_team_voting | [bool](#bool) |  |  |
| organizer_voting | [bool](#bool) |  |  |
| tie_break | [string](#string) | repeated |  |





 

 

 

 



<a name="hackathon_messages_config_svc_set_voting_policy_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_voting_policy_response.proto



<a name="hackathon-messages-config_svc-SetVotingPolicyResponse"></a>

### SetVotingPolicyResponse






 

 

 

 



<a name="hackathon_messages_config_svc_set_windows_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_windows_request.proto



<a name="hackathon-messages-config_svc-SetWindowsRequest"></a>

### SetWindowsRequest
Partial update: only the fields present are written; windows never set are
not enforced.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| registration_opens | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| registration_closes | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| proposals_close | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| preferences_close | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| submissions_close | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| late_policy | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_config_svc_set_windows_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_windows_response.proto



<a name="hackathon-messages-config_svc-SetWindowsResponse"></a>

### SetWindowsResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| windows | [hackathon.entities.HackathonWindows](#hackathon-entities-HackathonWindows) |  |  |





 

 

 

 



<a name="hackathon_config_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/config_service.proto


 

 

 


<a name="hackathon-ConfigService"></a>

### ConfigService
Per-hackathon configuration. First slice: enforceable time windows.
Forms, voting policy, email templates and branding land here as further
slices of the same configuration engine.

| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| SetWindows | [messages.config_svc.SetWindowsRequest](#hackathon-messages-config_svc-SetWindowsRequest) | [messages.config_svc.SetWindowsResponse](#hackathon-messages-config_svc-SetWindowsResponse) |  |
| OverrideWindow | [messages.config_svc.OverrideWindowRequest](#hackathon-messages-config_svc-OverrideWindowRequest) | [messages.config_svc.OverrideWindowResponse](#hackathon-messages-config_svc-OverrideWindowResponse) |  |
| SetRegistrationForm | [messages.config_svc.SetRegistrationFormRequest](#hackathon-messages-config_svc-SetRegistrationFormRequest) | [messages.config_svc.SetRegistrationFormResponse](#hackathon-messages-config_svc-SetRegistrationFormResponse) |  |
| SetSubmissionForm | [messages.config_svc.SetSubmissionFormRequest](#hackathon-messages-config_svc-SetSubmissionFormRequest) | [messages.config_svc.SetSubmissionFormResponse](#hackathon-messages-config_svc-SetSubmissionFormResponse) |  |
| SetVotingPolicy | [messages.config_svc.SetVotingPolicyRequest](#hackathon-messages-config_svc-SetVotingPolicyRequest) | [messages.config_svc.SetVotingPolicyResponse](#hackathon-messages-config_svc-SetVotingPolicyResponse) |  |

 



<a name="hackathon_entities_capability-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/capability.proto



<a name="hackathon-entities-CapabilityStatus"></a>

### CapabilityStatus



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| capability | [Capability](#hackathon-entities-Capability) |  |  |
| state | [CapabilityState](#hackathon-entities-CapabilityState) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modifier_id | [string](#string) | optional |  |
| opens_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional | The schedule, derived from the linked phases. Display only: `state` is what the server enforces, and these never widen it. Absent when the capability is manually driven (no linked phase). |
| closes_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| open_in_phase_id | [string](#string) | optional |  |
| closed_in_phase_id | [string](#string) | optional |  |





 


<a name="hackathon-entities-Capability"></a>

### Capability
What a member is allowed to do in a hackathon right now.

Each value is backed by exactly one stored row per hackathon carrying an
`enabled` flag, which is the authoritative gate. Adding a capability is
therefore an enum value plus a row — no schema or message change.

| Name | Number | Description |
| ---- | ------ | ----------- |
| CAPABILITY_UNSPECIFIED | 0 |  |
| CAPABILITY_REGISTER | 1 | HackathonService.Join |
| CAPABILITY_PROPOSE_PROJECTS | 2 | ProjectService.Propose |
| CAPABILITY_SET_TEAM_PREFERENCES | 3 | ProjectService.SetPreference |
| CAPABILITY_CREATE_PROJECT_SUBMISSIONS | 4 | TeamService.CreateSubmission / FinalizeSubmission |
| CAPABILITY_VOTE | 5 |  |
| CAPABILITY_VIEW_RESULTS | 6 | The flag doubles as the publish switch, since results are entered one placement at a time and must not leak partial standings. |



<a name="hackathon-entities-CapabilityState"></a>

### CapabilityState


| Name | Number | Description |
| ---- | ------ | ----------- |
| CAPABILITY_STATE_UNSPECIFIED | 0 |  |
| CAPABILITY_STATE_COMING | 1 | Closed now, but its open_in_phase starts in the future, so clients can show &#34;opens 12 Aug&#34; and count down to it. |
| CAPABILITY_STATE_OPEN | 2 |  |
| CAPABILITY_STATE_CLOSED | 3 |  |
| CAPABILITY_STATE_UNGOVERNED | 4 | No row exists for this capability, so the server has no opinion and does not enforce it. Clients must render exactly as they did before capabilities existed. This is what makes partial adoption safe. |


 

 

 



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





 

 

 

 



<a name="hackathon_entities_hackathon_settings-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_settings.proto



<a name="hackathon-entities-HackathonSettings"></a>

### HackathonSettings



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| registrations_enabled | [bool](#bool) |  |  |
| voting_enabled | [bool](#bool) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |





 

 

 

 



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
| settings | [HackathonSettings](#hackathon-entities-HackathonSettings) |  | Populated in Get responses only. |
| capabilities | [CapabilityStatus](#hackathon-entities-CapabilityStatus) | repeated | Computed server-side from the stored capability rows; not persisted as a whole. Populated on both Get and List, so a list can gate its own buttons rather than firing a mutation to discover something is closed.

Will become caller-dependent, so clients must not cache it across users. |
| current_phase_id | [string](#string) | optional | The phase an organizer declared current via AdvancePhase. Absent means clients should derive it from phase dates instead — correct before an event, wrong during one, where the schedule slips. |





 

 

 

 



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






 

 

 

 



<a name="hackathon_messages_hackathon_svc_advance_phase_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/advance_phase_request.proto



<a name="hackathon-messages-hackathon_svc-AdvancePhaseRequest"></a>

### AdvancePhaseRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| phase_id | [string](#string) |  | The phase the hackathon is now in. Must belong to this hackathon. |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_advance_phase_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/advance_phase_response.proto



<a name="hackathon-messages-hackathon_svc-AdvancePhaseResponse"></a>

### AdvancePhaseResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| current_phase_id | [string](#string) |  |  |
| capabilities | [hackathon.entities.CapabilityStatus](#hackathon-entities-CapabilityStatus) | repeated | Every capability after the move, so the caller can show what changed rather than re-fetching the hackathon. |





 

 

 

 



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





 

 

 

 



<a name="hackathon_messages_hackathon_svc_edit_capability_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/edit_capability_request.proto



<a name="hackathon-messages-hackathon_svc-EditCapabilityRequest"></a>

### EditCapabilityRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| capability | [hackathon.entities.Capability](#hackathon-entities-Capability) |  | Identifies the row, so it is required rather than optional — unlike the mutable fields of the other Edit requests. |
| enabled | [bool](#bool) | optional |  |
| open_in_phase_id | [string](#string) | optional | Schedule links, for display only — setting these never opens or closes anything, only `enabled` does.

Empty string = unlink, non-empty = link to that phase, not set = no change. Same convention as phase_svc/edit_request.proto&#39;s page_id. |
| closed_in_phase_id | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_edit_capability_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/edit_capability_response.proto



<a name="hackathon-messages-hackathon_svc-EditCapabilityResponse"></a>

### EditCapabilityResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| capability | [hackathon.entities.CapabilityStatus](#hackathon-entities-CapabilityStatus) |  |  |





 

 

 

 



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





 

 

 

 



<a name="hackathon_messages_hackathon_svc_edit_settings_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/edit_settings_request.proto



<a name="hackathon-messages-hackathon_svc-EditSettingsRequest"></a>

### EditSettingsRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| registrations_enabled | [bool](#bool) | optional |  |
| voting_enabled | [bool](#bool) | optional |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_edit_settings_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/edit_settings_response.proto



<a name="hackathon-messages-hackathon_svc-EditSettingsResponse"></a>

### EditSettingsResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| settings | [hackathon.entities.HackathonSettings](#hackathon-entities-HackathonSettings) |  |  |





 

 

 

 



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





 

 

 

 



<a name="hackathon_messages_hackathon_svc_submit_registration_form_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/submit_registration_form_request.proto



<a name="hackathon-messages-hackathon_svc-SubmitRegistrationFormRequest"></a>

### SubmitRegistrationFormRequest
Responses are validated against the organizer-defined registration form:
unknown keys, missing required fields, and unticked required consents are
InvalidArgument. `on_behalf_of` lets an organizer digitize a paper form
for another registrant (walk-ins at the check-in desk).


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| responses | [google.protobuf.Struct](#google-protobuf-Struct) |  |  |
| consents | [SubmitRegistrationFormRequest.ConsentsEntry](#hackathon-messages-hackathon_svc-SubmitRegistrationFormRequest-ConsentsEntry) | repeated |  |
| on_behalf_of | [string](#string) | optional |  |






<a name="hackathon-messages-hackathon_svc-SubmitRegistrationFormRequest-ConsentsEntry"></a>

### SubmitRegistrationFormRequest.ConsentsEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| value | [bool](#bool) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_submit_registration_form_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/submit_registration_form_response.proto



<a name="hackathon-messages-hackathon_svc-SubmitRegistrationFormResponse"></a>

### SubmitRegistrationFormResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |





 

 

 

 



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
| EditCapability | [messages.hackathon_svc.EditCapabilityRequest](#hackathon-messages-hackathon_svc-EditCapabilityRequest) | [messages.hackathon_svc.EditCapabilityResponse](#hackathon-messages-hackathon_svc-EditCapabilityResponse) |  |
| AdvancePhase | [messages.hackathon_svc.AdvancePhaseRequest](#hackathon-messages-hackathon_svc-AdvancePhaseRequest) | [messages.hackathon_svc.AdvancePhaseResponse](#hackathon-messages-hackathon_svc-AdvancePhaseResponse) |  |
| EditSettings | [messages.hackathon_svc.EditSettingsRequest](#hackathon-messages-hackathon_svc-EditSettingsRequest) | [messages.hackathon_svc.EditSettingsResponse](#hackathon-messages-hackathon_svc-EditSettingsResponse) |  |
| Join | [messages.hackathon_svc.JoinRequest](#hackathon-messages-hackathon_svc-JoinRequest) | [messages.hackathon_svc.JoinResponse](#hackathon-messages-hackathon_svc-JoinResponse) |  |
| ApproveParticipant | [messages.hackathon_svc.ApproveParticipantRequest](#hackathon-messages-hackathon_svc-ApproveParticipantRequest) | [messages.hackathon_svc.ApproveParticipantResponse](#hackathon-messages-hackathon_svc-ApproveParticipantResponse) |  |
| RemoveParticipant | [messages.hackathon_svc.RemoveParticipantRequest](#hackathon-messages-hackathon_svc-RemoveParticipantRequest) | [messages.hackathon_svc.RemoveParticipantResponse](#hackathon-messages-hackathon_svc-RemoveParticipantResponse) |  |
| SubmitRegistrationForm | [messages.hackathon_svc.SubmitRegistrationFormRequest](#hackathon-messages-hackathon_svc-SubmitRegistrationFormRequest) | [messages.hackathon_svc.SubmitRegistrationFormResponse](#hackathon-messages-hackathon_svc-SubmitRegistrationFormResponse) |  |
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





 

 

 

 



<a name="hackathon_messages_team_svc_get_submission_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/get_submission_request.proto



<a name="hackathon-messages-team_svc-GetSubmissionRequest"></a>

### GetSubmissionRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| team_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_get_submission_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/get_submission_response.proto



<a name="hackathon-messages-team_svc-GetSubmissionResponse"></a>

### GetSubmissionResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission | [hackathon.entities.Submission](#hackathon-entities-Submission) |  |  |





 

 

 

 



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





 

 

 

 



<a name="hackathon_messages_team_svc_list_submissions_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/list_submissions_request.proto



<a name="hackathon-messages-team_svc-ListSubmissionsRequest"></a>

### ListSubmissionsRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| team_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_list_submissions_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/list_submissions_response.proto



<a name="hackathon-messages-team_svc-ListSubmissionsResponse"></a>

### ListSubmissionsResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submissions | [hackathon.entities.Submission](#hackathon-entities-Submission) | repeated |  |





 

 

 

 



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
| GetSubmission | [messages.team_svc.GetSubmissionRequest](#hackathon-messages-team_svc-GetSubmissionRequest) | [messages.team_svc.GetSubmissionResponse](#hackathon-messages-team_svc-GetSubmissionResponse) |  |
| ListSubmissions | [messages.team_svc.ListSubmissionsRequest](#hackathon-messages-team_svc-ListSubmissionsRequest) | [messages.team_svc.ListSubmissionsResponse](#hackathon-messages-team_svc-ListSubmissionsResponse) |  |
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

 



<a name="vote_entities_vote-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/entities/vote.proto



<a name="vote-entities-PointsVote"></a>

### PointsVote



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| points_granted | [PointsVote.PointsGrantedEntry](#vote-entities-PointsVote-PointsGrantedEntry) | repeated |  |






<a name="vote-entities-PointsVote-PointsGrantedEntry"></a>

### PointsVote.PointsGrantedEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| value | [int32](#int32) |  |  |






<a name="vote-entities-RankedVote"></a>

### RankedVote



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission_ids | [string](#string) | repeated |  |






<a name="vote-entities-SingleChoiceVote"></a>

### SingleChoiceVote



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission_id | [string](#string) |  |  |






<a name="vote-entities-Vote"></a>

### Vote
Vote is a single atomic judgment from one voter on one submission
within one category. The vote payload is method-specific.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| category_id | [string](#string) |  |  |
| voter_id | [string](#string) |  |  |
| single_choice | [SingleChoiceVote](#vote-entities-SingleChoiceVote) |  |  |
| ranked | [RankedVote](#vote-entities-RankedVote) |  |  |
| points | [PointsVote](#vote-entities-PointsVote) |  |  |
| created_at | [int64](#int64) |  |  |
| modified_at | [int64](#int64) |  |  |





 

 

 

 



<a name="vote_entities_voter_type-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/entities/voter_type.proto


 


<a name="vote-entities-VoterType"></a>

### VoterType


| Name | Number | Description |
| ---- | ------ | ----------- |
| VOTER_TYPE_UNSPECIFIED | 0 |  |
| VOTER_TYPE_ALL_PARTICIPANTS | 1 |  |
| VOTER_TYPE_JURY | 2 |  |


 

 

 



<a name="vote_entities_voting_method-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/entities/voting_method.proto


 


<a name="vote-entities-VotingMethod"></a>

### VotingMethod


| Name | Number | Description |
| ---- | ------ | ----------- |
| VOTING_METHOD_UNSPECIFIED | 0 |  |
| VOTING_METHOD_SINGLE_CHOICE | 1 |  |
| VOTING_METHOD_RANKED | 2 |  |
| VOTING_METHOD_POINTS | 3 |  |


 

 

 



<a name="vote_entities_vote_category-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/entities/vote_category.proto



<a name="vote-entities-VoteCategory"></a>

### VoteCategory
VoteCategory represents a voting category within a hackathon, defining
the criteria and rules for one dimension of evaluation.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| hackathon_id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| description | [string](#string) |  |  |
| voting_method | [VotingMethod](#vote-entities-VotingMethod) |  |  |
| voter_type | [VoterType](#vote-entities-VoterType) |  |  |
| jury_members | [user.entities.User](#user-entities-User) | repeated |  |
| created_at | [int64](#int64) |  |  |
| modified_at | [int64](#int64) |  |  |





 

 

 

 



<a name="vote_entities_vote_result-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/entities/vote_result.proto



<a name="vote-entities-VoteResult"></a>

### VoteResult
VoteResult is a placement entry within a vote category.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| category_id | [string](#string) |  |  |
| submission_id | [string](#string) |  |  |
| position | [int32](#int32) |  |  |
| title | [string](#string) | optional |  |
| created_at | [int64](#int64) |  |  |
| modified_at | [int64](#int64) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_create_category_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/create_category_request.proto



<a name="vote-messages-vote_svc-CreateVoteCategoryRequest"></a>

### CreateVoteCategoryRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| name | [string](#string) |  |  |
| description | [string](#string) |  |  |
| voting_method | [vote.entities.VotingMethod](#vote-entities-VotingMethod) |  |  |
| voter_type | [vote.entities.VoterType](#vote-entities-VoterType) |  |  |
| jury_member_ids | [string](#string) | repeated |  |





 

 

 

 



<a name="vote_messages_vote_svc_create_category_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/create_category_response.proto



<a name="vote-messages-vote_svc-CreateVoteCategoryResponse"></a>

### CreateVoteCategoryResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| vote_category | [vote.entities.VoteCategory](#vote-entities-VoteCategory) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_create_result_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/create_result_request.proto



<a name="vote-messages-vote_svc-CreateVoteResultRequest"></a>

### CreateVoteResultRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| submission_id | [string](#string) |  |  |
| position | [int32](#int32) |  |  |
| title | [string](#string) | optional |  |





 

 

 

 



<a name="vote_messages_vote_svc_create_result_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/create_result_response.proto



<a name="vote-messages-vote_svc-CreateVoteResultResponse"></a>

### CreateVoteResultResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| vote_result | [vote.entities.VoteResult](#vote-entities-VoteResult) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_delete_category_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/delete_category_request.proto



<a name="vote-messages-vote_svc-DeleteVoteCategoryRequest"></a>

### DeleteVoteCategoryRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_delete_category_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/delete_category_response.proto



<a name="vote-messages-vote_svc-DeleteVoteCategoryResponse"></a>

### DeleteVoteCategoryResponse






 

 

 

 



<a name="vote_messages_vote_svc_delete_result_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/delete_result_request.proto



<a name="vote-messages-vote_svc-DeleteVoteResultRequest"></a>

### DeleteVoteResultRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_delete_result_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/delete_result_response.proto



<a name="vote-messages-vote_svc-DeleteVoteResultResponse"></a>

### DeleteVoteResultResponse






 

 

 

 



<a name="vote_messages_vote_svc_edit_category_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/edit_category_request.proto



<a name="vote-messages-vote_svc-EditVoteCategoryRequest"></a>

### EditVoteCategoryRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| name | [string](#string) | optional |  |
| description | [string](#string) | optional |  |
| voting_method | [vote.entities.VotingMethod](#vote-entities-VotingMethod) | optional |  |
| voter_type | [vote.entities.VoterType](#vote-entities-VoterType) | optional |  |
| jury_member_ids | [string](#string) | repeated |  |





 

 

 

 



<a name="vote_messages_vote_svc_edit_category_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/edit_category_response.proto



<a name="vote-messages-vote_svc-EditVoteCategoryResponse"></a>

### EditVoteCategoryResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| vote_category | [vote.entities.VoteCategory](#vote-entities-VoteCategory) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_edit_result_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/edit_result_request.proto



<a name="vote-messages-vote_svc-EditVoteResultRequest"></a>

### EditVoteResultRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| submission_id | [string](#string) | optional |  |
| position | [int32](#int32) | optional |  |
| title | [string](#string) | optional |  |





 

 

 

 



<a name="vote_messages_vote_svc_edit_result_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/edit_result_response.proto



<a name="vote-messages-vote_svc-EditVoteResultResponse"></a>

### EditVoteResultResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| vote_result | [vote.entities.VoteResult](#vote-entities-VoteResult) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_export_votes_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/export_votes_request.proto



<a name="vote-messages-vote_svc-ExportVotesRequest"></a>

### ExportVotesRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| format | [ExportFormat](#vote-messages-vote_svc-ExportFormat) |  |  |





 


<a name="vote-messages-vote_svc-ExportFormat"></a>

### ExportFormat


| Name | Number | Description |
| ---- | ------ | ----------- |
| EXPORT_FORMAT_UNSPECIFIED | 0 |  |
| EXPORT_FORMAT_CSV | 1 |  |
| EXPORT_FORMAT_JSON | 2 |  |


 

 

 



<a name="vote_messages_vote_svc_export_results_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/export_results_request.proto



<a name="vote-messages-vote_svc-ExportResultsRequest"></a>

### ExportResultsRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| format | [ExportFormat](#vote-messages-vote_svc-ExportFormat) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_export_results_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/export_results_response.proto



<a name="vote-messages-vote_svc-ExportResultsResponse"></a>

### ExportResultsResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| data | [bytes](#bytes) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_export_votes_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/export_votes_response.proto



<a name="vote-messages-vote_svc-ExportVotesResponse"></a>

### ExportVotesResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| data | [bytes](#bytes) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_get_category_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/get_category_request.proto



<a name="vote-messages-vote_svc-GetVoteCategoryRequest"></a>

### GetVoteCategoryRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_get_category_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/get_category_response.proto



<a name="vote-messages-vote_svc-GetVoteCategoryResponse"></a>

### GetVoteCategoryResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| vote_category | [vote.entities.VoteCategory](#vote-entities-VoteCategory) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_get_vote_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/get_vote_request.proto



<a name="vote-messages-vote_svc-GetVoteRequest"></a>

### GetVoteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_get_vote_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/get_vote_response.proto



<a name="vote-messages-vote_svc-GetVoteResponse"></a>

### GetVoteResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| vote | [vote.entities.Vote](#vote-entities-Vote) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_list_categories_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/list_categories_request.proto



<a name="vote-messages-vote_svc-ListVoteCategoriesRequest"></a>

### ListVoteCategoriesRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_list_categories_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/list_categories_response.proto



<a name="vote-messages-vote_svc-ListVoteCategoriesResponse"></a>

### ListVoteCategoriesResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| vote_categories | [vote.entities.VoteCategory](#vote-entities-VoteCategory) | repeated |  |





 

 

 

 



<a name="vote_messages_vote_svc_list_results_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/list_results_request.proto



<a name="vote-messages-vote_svc-ListVoteResultsRequest"></a>

### ListVoteResultsRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_list_results_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/list_results_response.proto



<a name="vote-messages-vote_svc-ListVoteResultsResponse"></a>

### ListVoteResultsResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| vote_results | [vote.entities.VoteResult](#vote-entities-VoteResult) | repeated |  |





 

 

 

 



<a name="vote_messages_vote_svc_list_votes_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/list_votes_request.proto



<a name="vote-messages-vote_svc-ListVotesRequest"></a>

### ListVotesRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| voter_id | [string](#string) |  |  |
| submission_id | [string](#string) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_list_votes_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/list_votes_response.proto



<a name="vote-messages-vote_svc-ListVotesResponse"></a>

### ListVotesResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| votes | [vote.entities.Vote](#vote-entities-Vote) | repeated |  |





 

 

 

 



<a name="vote_messages_vote_svc_submit_vote_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/submit_vote_request.proto



<a name="vote-messages-vote_svc-PointsVote"></a>

### PointsVote



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| points_granted | [PointsVote.PointsGrantedEntry](#vote-messages-vote_svc-PointsVote-PointsGrantedEntry) | repeated |  |






<a name="vote-messages-vote_svc-PointsVote-PointsGrantedEntry"></a>

### PointsVote.PointsGrantedEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| value | [int32](#int32) |  |  |






<a name="vote-messages-vote_svc-RankedVote"></a>

### RankedVote



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| submission_ids | [string](#string) | repeated |  |






<a name="vote-messages-vote_svc-SingleChoiceVote"></a>

### SingleChoiceVote



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| submission_id | [string](#string) |  |  |






<a name="vote-messages-vote_svc-SubmitVoteRequest"></a>

### SubmitVoteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| single_choice | [SingleChoiceVote](#vote-messages-vote_svc-SingleChoiceVote) |  |  |
| ranked | [RankedVote](#vote-messages-vote_svc-RankedVote) |  |  |
| points | [PointsVote](#vote-messages-vote_svc-PointsVote) |  |  |





 

 

 

 



<a name="vote_messages_vote_svc_submit_vote_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/submit_vote_response.proto



<a name="vote-messages-vote_svc-SubmitVoteResponse"></a>

### SubmitVoteResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| vote | [vote.entities.Vote](#vote-entities-Vote) |  |  |





 

 

 

 



<a name="vote_vote_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/vote_service.proto


 

 

 


<a name="vote-VoteService"></a>

### VoteService


| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| ListVoteCategories | [messages.vote_svc.ListVoteCategoriesRequest](#vote-messages-vote_svc-ListVoteCategoriesRequest) | [messages.vote_svc.ListVoteCategoriesResponse](#vote-messages-vote_svc-ListVoteCategoriesResponse) | VoteCategory CRUD |
| GetVoteCategory | [messages.vote_svc.GetVoteCategoryRequest](#vote-messages-vote_svc-GetVoteCategoryRequest) | [messages.vote_svc.GetVoteCategoryResponse](#vote-messages-vote_svc-GetVoteCategoryResponse) |  |
| CreateVoteCategory | [messages.vote_svc.CreateVoteCategoryRequest](#vote-messages-vote_svc-CreateVoteCategoryRequest) | [messages.vote_svc.CreateVoteCategoryResponse](#vote-messages-vote_svc-CreateVoteCategoryResponse) |  |
| EditVoteCategory | [messages.vote_svc.EditVoteCategoryRequest](#vote-messages-vote_svc-EditVoteCategoryRequest) | [messages.vote_svc.EditVoteCategoryResponse](#vote-messages-vote_svc-EditVoteCategoryResponse) |  |
| DeleteVoteCategory | [messages.vote_svc.DeleteVoteCategoryRequest](#vote-messages-vote_svc-DeleteVoteCategoryRequest) | [messages.vote_svc.DeleteVoteCategoryResponse](#vote-messages-vote_svc-DeleteVoteCategoryResponse) |  |
| SubmitVote | [messages.vote_svc.SubmitVoteRequest](#vote-messages-vote_svc-SubmitVoteRequest) | [messages.vote_svc.SubmitVoteResponse](#vote-messages-vote_svc-SubmitVoteResponse) | Voting |
| GetVote | [messages.vote_svc.GetVoteRequest](#vote-messages-vote_svc-GetVoteRequest) | [messages.vote_svc.GetVoteResponse](#vote-messages-vote_svc-GetVoteResponse) |  |
| ListVotes | [messages.vote_svc.ListVotesRequest](#vote-messages-vote_svc-ListVotesRequest) | [messages.vote_svc.ListVotesResponse](#vote-messages-vote_svc-ListVotesResponse) |  |
| ExportVotes | [messages.vote_svc.ExportVotesRequest](#vote-messages-vote_svc-ExportVotesRequest) | [messages.vote_svc.ExportVotesResponse](#vote-messages-vote_svc-ExportVotesResponse) |  |
| ListVoteResults | [messages.vote_svc.ListVoteResultsRequest](#vote-messages-vote_svc-ListVoteResultsRequest) | [messages.vote_svc.ListVoteResultsResponse](#vote-messages-vote_svc-ListVoteResultsResponse) | Vote Results |
| CreateVoteResult | [messages.vote_svc.CreateVoteResultRequest](#vote-messages-vote_svc-CreateVoteResultRequest) | [messages.vote_svc.CreateVoteResultResponse](#vote-messages-vote_svc-CreateVoteResultResponse) |  |
| EditVoteResult | [messages.vote_svc.EditVoteResultRequest](#vote-messages-vote_svc-EditVoteResultRequest) | [messages.vote_svc.EditVoteResultResponse](#vote-messages-vote_svc-EditVoteResultResponse) |  |
| DeleteVoteResult | [messages.vote_svc.DeleteVoteResultRequest](#vote-messages-vote_svc-DeleteVoteResultRequest) | [messages.vote_svc.DeleteVoteResultResponse](#vote-messages-vote_svc-DeleteVoteResultResponse) |  |
| ExportResults | [messages.vote_svc.ExportResultsRequest](#vote-messages-vote_svc-ExportResultsRequest) | [messages.vote_svc.ExportResultsResponse](#vote-messages-vote_svc-ExportResultsResponse) |  |

 



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

