# Protocol Documentation
<a name="top"></a>

## Table of Contents

- [hackathon/messages/config_svc/override_window_request.proto](#hackathon_messages_config_svc_override_window_request-proto)
    - [OverrideWindowRequest](#hackathon-messages-config_svc-OverrideWindowRequest)
  
- [hackathon/entities/hackathon_window_set.proto](#hackathon_entities_hackathon_window_set-proto)
    - [HackathonWindows](#hackathon-entities-HackathonWindows)
  
- [hackathon/messages/config_svc/override_window_response.proto](#hackathon_messages_config_svc_override_window_response-proto)
    - [OverrideWindowResponse](#hackathon-messages-config_svc-OverrideWindowResponse)
  
- [hackathon/messages/config_svc/set_branding_request.proto](#hackathon_messages_config_svc_set_branding_request-proto)
    - [SetBrandingRequest](#hackathon-messages-config_svc-SetBrandingRequest)
  
- [hackathon/messages/config_svc/set_branding_response.proto](#hackathon_messages_config_svc_set_branding_response-proto)
    - [SetBrandingResponse](#hackathon-messages-config_svc-SetBrandingResponse)
  
- [hackathon/messages/config_svc/set_email_templates_request.proto](#hackathon_messages_config_svc_set_email_templates_request-proto)
    - [SetEmailTemplatesRequest](#hackathon-messages-config_svc-SetEmailTemplatesRequest)
    - [SetEmailTemplatesRequest.TemplatesEntry](#hackathon-messages-config_svc-SetEmailTemplatesRequest-TemplatesEntry)
  
- [hackathon/messages/config_svc/set_email_templates_response.proto](#hackathon_messages_config_svc_set_email_templates_response-proto)
    - [SetEmailTemplatesResponse](#hackathon-messages-config_svc-SetEmailTemplatesResponse)
  
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
  
- [hackathon/messages/config_svc/get_email_templates_request.proto](#hackathon_messages_config_svc_get_email_templates_request-proto)
    - [GetEmailTemplatesRequest](#hackathon-messages-config_svc-GetEmailTemplatesRequest)
  
- [hackathon/messages/config_svc/get_email_templates_response.proto](#hackathon_messages_config_svc_get_email_templates_response-proto)
    - [GetEmailTemplatesResponse](#hackathon-messages-config_svc-GetEmailTemplatesResponse)
    - [GetEmailTemplatesResponse.TemplatesEntry](#hackathon-messages-config_svc-GetEmailTemplatesResponse-TemplatesEntry)
  
- [hackathon/messages/config_svc/get_windows_request.proto](#hackathon_messages_config_svc_get_windows_request-proto)
    - [GetWindowsRequest](#hackathon-messages-config_svc-GetWindowsRequest)
  
- [hackathon/messages/config_svc/get_windows_response.proto](#hackathon_messages_config_svc_get_windows_response-proto)
    - [GetWindowsResponse](#hackathon-messages-config_svc-GetWindowsResponse)
  
- [hackathon/config_service.proto](#hackathon_config_service-proto)
    - [ConfigService](#hackathon-ConfigService)
  
- [hackathon/entities/capability.proto](#hackathon_entities_capability-proto)
    - [CapabilityStatus](#hackathon-entities-CapabilityStatus)
  
    - [Capability](#hackathon-entities-Capability)
    - [CapabilityState](#hackathon-entities-CapabilityState)
  
- [hackathon/entities/hackathon_branding.proto](#hackathon_entities_hackathon_branding-proto)
    - [HackathonBranding](#hackathon-entities-HackathonBranding)
  
- [hackathon/entities/hackathon_voting_policy.proto](#hackathon_entities_hackathon_voting_policy-proto)
    - [HackathonVotingPolicy](#hackathon-entities-HackathonVotingPolicy)
    - [ScaleRange](#hackathon-entities-ScaleRange)
  
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
  
- [hackathon/entities/hackathon_state.proto](#hackathon_entities_hackathon_state-proto)
    - [CapabilityToggle](#hackathon-entities-CapabilityToggle)
    - [HackathonState](#hackathon-entities-HackathonState)
  
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
    - [Hackathon.EmailTemplatesEntry](#hackathon-entities-Hackathon-EmailTemplatesEntry)
  
- [hackathon/entities/hackathon_invite.proto](#hackathon_entities_hackathon_invite-proto)
    - [HackathonInvite](#hackathon-entities-HackathonInvite)
  
- [hackathon/entities/prize.proto](#hackathon_entities_prize-proto)
    - [Award](#hackathon-entities-Award)
    - [Prize](#hackathon-entities-Prize)
  
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
  
- [hackathon/messages/hackathon_svc/delete_request.proto](#hackathon_messages_hackathon_svc_delete_request-proto)
    - [DeleteRequest](#hackathon-messages-hackathon_svc-DeleteRequest)
  
- [hackathon/messages/hackathon_svc/delete_response.proto](#hackathon_messages_hackathon_svc_delete_response-proto)
    - [DeleteResponse](#hackathon-messages-hackathon_svc-DeleteResponse)
  
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
  
- [hackathon/messages/hackathon_svc/create_invite_request.proto](#hackathon_messages_hackathon_svc_create_invite_request-proto)
    - [CreateInviteRequest](#hackathon-messages-hackathon_svc-CreateInviteRequest)
  
- [hackathon/messages/hackathon_svc/create_invite_response.proto](#hackathon_messages_hackathon_svc_create_invite_response-proto)
    - [CreateInviteResponse](#hackathon-messages-hackathon_svc-CreateInviteResponse)
  
- [hackathon/messages/hackathon_svc/list_invites_request.proto](#hackathon_messages_hackathon_svc_list_invites_request-proto)
    - [ListInvitesRequest](#hackathon-messages-hackathon_svc-ListInvitesRequest)
  
- [hackathon/messages/hackathon_svc/list_invites_response.proto](#hackathon_messages_hackathon_svc_list_invites_response-proto)
    - [ListInvitesResponse](#hackathon-messages-hackathon_svc-ListInvitesResponse)
  
- [hackathon/messages/hackathon_svc/preview_invite_request.proto](#hackathon_messages_hackathon_svc_preview_invite_request-proto)
    - [PreviewInviteRequest](#hackathon-messages-hackathon_svc-PreviewInviteRequest)
  
- [hackathon/messages/hackathon_svc/preview_invite_response.proto](#hackathon_messages_hackathon_svc_preview_invite_response-proto)
    - [PreviewInviteResponse](#hackathon-messages-hackathon_svc-PreviewInviteResponse)
  
- [hackathon/messages/hackathon_svc/revoke_invite_request.proto](#hackathon_messages_hackathon_svc_revoke_invite_request-proto)
    - [RevokeInviteRequest](#hackathon-messages-hackathon_svc-RevokeInviteRequest)
  
- [hackathon/messages/hackathon_svc/revoke_invite_response.proto](#hackathon_messages_hackathon_svc_revoke_invite_response-proto)
    - [RevokeInviteResponse](#hackathon-messages-hackathon_svc-RevokeInviteResponse)
  
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
  
- [hackathon/messages/hackathon_svc/get_registration_response_request.proto](#hackathon_messages_hackathon_svc_get_registration_response_request-proto)
    - [GetRegistrationResponseRequest](#hackathon-messages-hackathon_svc-GetRegistrationResponseRequest)
  
- [hackathon/messages/hackathon_svc/get_registration_response_response.proto](#hackathon_messages_hackathon_svc_get_registration_response_response-proto)
    - [GetRegistrationResponseResponse](#hackathon-messages-hackathon_svc-GetRegistrationResponseResponse)
    - [GetRegistrationResponseResponse.ConsentsEntry](#hackathon-messages-hackathon_svc-GetRegistrationResponseResponse-ConsentsEntry)
  
- [hackathon/messages/hackathon_svc/list_registration_responses_request.proto](#hackathon_messages_hackathon_svc_list_registration_responses_request-proto)
    - [ListRegistrationResponsesRequest](#hackathon-messages-hackathon_svc-ListRegistrationResponsesRequest)
  
- [hackathon/messages/hackathon_svc/list_registration_responses_response.proto](#hackathon_messages_hackathon_svc_list_registration_responses_response-proto)
    - [ListRegistrationResponsesResponse](#hackathon-messages-hackathon_svc-ListRegistrationResponsesResponse)
    - [RegistrationResponseEntry](#hackathon-messages-hackathon_svc-RegistrationResponseEntry)
    - [RegistrationResponseEntry.ConsentsEntry](#hackathon-messages-hackathon_svc-RegistrationResponseEntry-ConsentsEntry)
  
- [hackathon/messages/hackathon_svc/remove_participant_response.proto](#hackathon_messages_hackathon_svc_remove_participant_response-proto)
    - [RemoveParticipantResponse](#hackathon-messages-hackathon_svc-RemoveParticipantResponse)
  
- [hackathon/messages/hackathon_svc/set_capabilities_request.proto](#hackathon_messages_hackathon_svc_set_capabilities_request-proto)
    - [SetCapabilitiesRequest](#hackathon-messages-hackathon_svc-SetCapabilitiesRequest)
  
- [hackathon/messages/hackathon_svc/set_capabilities_response.proto](#hackathon_messages_hackathon_svc_set_capabilities_response-proto)
    - [SetCapabilitiesResponse](#hackathon-messages-hackathon_svc-SetCapabilitiesResponse)
  
- [hackathon/messages/hackathon_svc/set_current_phase_request.proto](#hackathon_messages_hackathon_svc_set_current_phase_request-proto)
    - [SetCurrentPhaseRequest](#hackathon-messages-hackathon_svc-SetCurrentPhaseRequest)
  
- [hackathon/messages/hackathon_svc/set_current_phase_response.proto](#hackathon_messages_hackathon_svc_set_current_phase_response-proto)
    - [SetCurrentPhaseResponse](#hackathon-messages-hackathon_svc-SetCurrentPhaseResponse)
  
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
  
- [hackathon/messages/prize_svc/edit_request.proto](#hackathon_messages_prize_svc_edit_request-proto)
    - [EditRequest](#hackathon-messages-prize_svc-EditRequest)
  
- [hackathon/messages/prize_svc/edit_response.proto](#hackathon_messages_prize_svc_edit_response-proto)
    - [EditResponse](#hackathon-messages-prize_svc-EditResponse)
  
- [hackathon/messages/prize_svc/finalize_request.proto](#hackathon_messages_prize_svc_finalize_request-proto)
    - [FinalizeRequest](#hackathon-messages-prize_svc-FinalizeRequest)
  
- [hackathon/messages/prize_svc/finalize_response.proto](#hackathon_messages_prize_svc_finalize_response-proto)
    - [FinalizeResponse](#hackathon-messages-prize_svc-FinalizeResponse)
  
- [hackathon/messages/prize_svc/get_request.proto](#hackathon_messages_prize_svc_get_request-proto)
    - [GetRequest](#hackathon-messages-prize_svc-GetRequest)
  
- [hackathon/messages/prize_svc/get_response.proto](#hackathon_messages_prize_svc_get_response-proto)
    - [GetResponse](#hackathon-messages-prize_svc-GetResponse)
  
- [hackathon/messages/prize_svc/set_request.proto](#hackathon_messages_prize_svc_set_request-proto)
    - [SetRequest](#hackathon-messages-prize_svc-SetRequest)
  
- [hackathon/messages/prize_svc/set_response.proto](#hackathon_messages_prize_svc_set_response-proto)
    - [SetResponse](#hackathon-messages-prize_svc-SetResponse)
  
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
  
- [hackathon/messages/project_svc/get_preference_request.proto](#hackathon_messages_project_svc_get_preference_request-proto)
    - [GetPreferenceRequest](#hackathon-messages-project_svc-GetPreferenceRequest)
  
- [hackathon/messages/project_svc/get_preference_response.proto](#hackathon_messages_project_svc_get_preference_response-proto)
    - [GetPreferenceResponse](#hackathon-messages-project_svc-GetPreferenceResponse)
  
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
  
- [hackathon/messages/project_svc/remove_preference_request.proto](#hackathon_messages_project_svc_remove_preference_request-proto)
    - [RemovePreferenceRequest](#hackathon-messages-project_svc-RemovePreferenceRequest)
  
- [hackathon/messages/project_svc/remove_preference_response.proto](#hackathon_messages_project_svc_remove_preference_response-proto)
    - [RemovePreferenceResponse](#hackathon-messages-project_svc-RemovePreferenceResponse)
  
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
    - [CreateSubmissionRequest.FormEntry](#hackathon-messages-team_svc-CreateSubmissionRequest-FormEntry)
  
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
  
- [hackathon/messages/team_svc/edit_submission_request.proto](#hackathon_messages_team_svc_edit_submission_request-proto)
    - [EditSubmissionRequest](#hackathon-messages-team_svc-EditSubmissionRequest)
    - [EditSubmissionRequest.FormEntry](#hackathon-messages-team_svc-EditSubmissionRequest-FormEntry)
  
- [hackathon/messages/team_svc/edit_submission_response.proto](#hackathon_messages_team_svc_edit_submission_response-proto)
    - [EditSubmissionResponse](#hackathon-messages-team_svc-EditSubmissionResponse)
  
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
  
- [hackathon/prize_service.proto](#hackathon_prize_service-proto)
    - [PrizeService](#hackathon-PrizeService)
  
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
  
- [site/entities/site_page.proto](#site_entities_site_page-proto)
    - [SitePage](#site-entities-SitePage)
  
- [site/messages/site_page_svc/create_request.proto](#site_messages_site_page_svc_create_request-proto)
    - [CreateRequest](#site-messages-site_page_svc-CreateRequest)
  
- [site/messages/site_page_svc/create_response.proto](#site_messages_site_page_svc_create_response-proto)
    - [CreateResponse](#site-messages-site_page_svc-CreateResponse)
  
- [site/messages/site_page_svc/delete_request.proto](#site_messages_site_page_svc_delete_request-proto)
    - [DeleteRequest](#site-messages-site_page_svc-DeleteRequest)
  
- [site/messages/site_page_svc/delete_response.proto](#site_messages_site_page_svc_delete_response-proto)
    - [DeleteResponse](#site-messages-site_page_svc-DeleteResponse)
  
- [site/messages/site_page_svc/edit_request.proto](#site_messages_site_page_svc_edit_request-proto)
    - [EditRequest](#site-messages-site_page_svc-EditRequest)
  
- [site/messages/site_page_svc/edit_response.proto](#site_messages_site_page_svc_edit_response-proto)
    - [EditResponse](#site-messages-site_page_svc-EditResponse)
  
- [site/messages/site_page_svc/get_request.proto](#site_messages_site_page_svc_get_request-proto)
    - [GetRequest](#site-messages-site_page_svc-GetRequest)
  
- [site/messages/site_page_svc/get_response.proto](#site_messages_site_page_svc_get_response-proto)
    - [GetResponse](#site-messages-site_page_svc-GetResponse)
  
- [site/messages/site_page_svc/list_request.proto](#site_messages_site_page_svc_list_request-proto)
    - [ListRequest](#site-messages-site_page_svc-ListRequest)
  
- [site/messages/site_page_svc/list_response.proto](#site_messages_site_page_svc_list_response-proto)
    - [ListResponse](#site-messages-site_page_svc-ListResponse)
  
- [site/site_page_service.proto](#site_site_page_service-proto)
    - [SitePageService](#site-SitePageService)
  
- [storage/entities/upload_kind.proto](#storage_entities_upload_kind-proto)
    - [UploadKind](#storage-entities-UploadKind)
  
- [storage/messages/storage_svc/create_download_url_request.proto](#storage_messages_storage_svc_create_download_url_request-proto)
    - [CreateDownloadUrlRequest](#storage-messages-storage_svc-CreateDownloadUrlRequest)
  
- [storage/messages/storage_svc/create_download_url_response.proto](#storage_messages_storage_svc_create_download_url_response-proto)
    - [CreateDownloadUrlResponse](#storage-messages-storage_svc-CreateDownloadUrlResponse)
  
- [storage/messages/storage_svc/create_upload_url_request.proto](#storage_messages_storage_svc_create_upload_url_request-proto)
    - [CreateUploadUrlRequest](#storage-messages-storage_svc-CreateUploadUrlRequest)
  
- [storage/messages/storage_svc/create_upload_url_response.proto](#storage_messages_storage_svc_create_upload_url_response-proto)
    - [CreateUploadUrlResponse](#storage-messages-storage_svc-CreateUploadUrlResponse)
  
- [storage/storage_service.proto](#storage_storage_service-proto)
    - [StorageService](#storage-StorageService)
  
- [user/messages/user_svc/add_role_request.proto](#user_messages_user_svc_add_role_request-proto)
    - [AddRoleRequest](#user-messages-user_svc-AddRoleRequest)
  
- [user/messages/user_svc/add_role_response.proto](#user_messages_user_svc_add_role_response-proto)
    - [AddRoleResponse](#user-messages-user_svc-AddRoleResponse)
  
- [user/messages/user_svc/delete_account_request.proto](#user_messages_user_svc_delete_account_request-proto)
    - [DeleteAccountRequest](#user-messages-user_svc-DeleteAccountRequest)
  
- [user/messages/user_svc/delete_account_response.proto](#user_messages_user_svc_delete_account_response-proto)
    - [DeleteAccountResponse](#user-messages-user_svc-DeleteAccountResponse)
  
- [user/messages/user_svc/edit_profile_request.proto](#user_messages_user_svc_edit_profile_request-proto)
    - [EditProfileRequest](#user-messages-user_svc-EditProfileRequest)
  
- [user/messages/user_svc/edit_profile_response.proto](#user_messages_user_svc_edit_profile_response-proto)
    - [EditProfileResponse](#user-messages-user_svc-EditProfileResponse)
  
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
    - [PointsSubmission](#vote-messages-vote_svc-PointsSubmission)
    - [PointsVote](#vote-messages-vote_svc-PointsVote)
    - [RankedSubmission](#vote-messages-vote_svc-RankedSubmission)
    - [RankedVote](#vote-messages-vote_svc-RankedVote)
    - [SingleChoiceVote](#vote-messages-vote_svc-SingleChoiceVote)
    - [SubmitVoteRequest](#vote-messages-vote_svc-SubmitVoteRequest)
  
- [vote/messages/vote_svc/submit_vote_response.proto](#vote_messages_vote_svc_submit_vote_response-proto)
    - [SubmitVoteResponse](#vote-messages-vote_svc-SubmitVoteResponse)
  
- [vote/messages/vote_svc/suggest_results_request.proto](#vote_messages_vote_svc_suggest_results_request-proto)
    - [SuggestResultsRequest](#vote-messages-vote_svc-SuggestResultsRequest)
  
- [vote/messages/vote_svc/suggest_results_response.proto](#vote_messages_vote_svc_suggest_results_response-proto)
    - [SuggestResultsResponse](#vote-messages-vote_svc-SuggestResultsResponse)
  
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





 

 

 

 



<a name="hackathon_messages_config_svc_set_branding_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_branding_request.proto



<a name="hackathon-messages-config_svc-SetBrandingRequest"></a>

### SetBrandingRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| primary_color | [string](#string) | optional | CSS hex colours (#rgb or #rrggbb); validated server-side. |
| accent_color | [string](#string) | optional |  |
| banner_text | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_config_svc_set_branding_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_branding_response.proto



<a name="hackathon-messages-config_svc-SetBrandingResponse"></a>

### SetBrandingResponse






 

 

 

 



<a name="hackathon_messages_config_svc_set_email_templates_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_email_templates_request.proto



<a name="hackathon-messages-config_svc-SetEmailTemplatesRequest"></a>

### SetEmailTemplatesRequest
Notification COPY, stored per hackathon. Sending is a separate concern (no
notification service exists yet) — this pins the text organizers author so
it survives that gap.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| templates | [SetEmailTemplatesRequest.TemplatesEntry](#hackathon-messages-config_svc-SetEmailTemplatesRequest-TemplatesEntry) | repeated | Keyed by moment: registrationConfirmed, teamAssigned, deadlineReminder, results. Unknown keys are rejected so a typo is not silently stored. |






<a name="hackathon-messages-config_svc-SetEmailTemplatesRequest-TemplatesEntry"></a>

### SetEmailTemplatesRequest.TemplatesEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| value | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_config_svc_set_email_templates_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/set_email_templates_response.proto



<a name="hackathon-messages-config_svc-SetEmailTemplatesResponse"></a>

### SetEmailTemplatesResponse






 

 

 

 



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





 

 

 

 



<a name="hackathon_messages_config_svc_get_email_templates_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/get_email_templates_request.proto



<a name="hackathon-messages-config_svc-GetEmailTemplatesRequest"></a>

### GetEmailTemplatesRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_config_svc_get_email_templates_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/get_email_templates_response.proto



<a name="hackathon-messages-config_svc-GetEmailTemplatesResponse"></a>

### GetEmailTemplatesResponse
The stored notification copy, keyed exactly as SetEmailTemplates takes it.

A read is required rather than convenient: Set REPLACES the whole map, so a
form that cannot prefill blanks every template the organizer did not have in
front of them. Same reason GetWindows and PrizeService.Get exist.

Empty map = nothing authored yet, which is a valid state and not an error.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| templates | [GetEmailTemplatesResponse.TemplatesEntry](#hackathon-messages-config_svc-GetEmailTemplatesResponse-TemplatesEntry) | repeated |  |






<a name="hackathon-messages-config_svc-GetEmailTemplatesResponse-TemplatesEntry"></a>

### GetEmailTemplatesResponse.TemplatesEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| value | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_config_svc_get_windows_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/get_windows_request.proto



<a name="hackathon-messages-config_svc-GetWindowsRequest"></a>

### GetWindowsRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_config_svc_get_windows_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/config_svc/get_windows_response.proto



<a name="hackathon-messages-config_svc-GetWindowsResponse"></a>

### GetWindowsResponse
`windows` is absent when the event has no row yet, which reads as &#34;no
deadlines set&#34; — distinct from a row whose fields happen to be empty.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| windows | [hackathon.entities.HackathonWindows](#hackathon-entities-HackathonWindows) | optional |  |





 

 

 

 



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
| GetWindows | [messages.config_svc.GetWindowsRequest](#hackathon-messages-config_svc-GetWindowsRequest) | [messages.config_svc.GetWindowsResponse](#hackathon-messages-config_svc-GetWindowsResponse) | Reads the deadlines back. SetWindows REPLACES every field, so without this an organiser editing one deadline would blank the others they cannot see — the form had no way to prefill, which made saving it destructive. |
| SetWindows | [messages.config_svc.SetWindowsRequest](#hackathon-messages-config_svc-SetWindowsRequest) | [messages.config_svc.SetWindowsResponse](#hackathon-messages-config_svc-SetWindowsResponse) |  |
| OverrideWindow | [messages.config_svc.OverrideWindowRequest](#hackathon-messages-config_svc-OverrideWindowRequest) | [messages.config_svc.OverrideWindowResponse](#hackathon-messages-config_svc-OverrideWindowResponse) |  |
| SetRegistrationForm | [messages.config_svc.SetRegistrationFormRequest](#hackathon-messages-config_svc-SetRegistrationFormRequest) | [messages.config_svc.SetRegistrationFormResponse](#hackathon-messages-config_svc-SetRegistrationFormResponse) |  |
| SetSubmissionForm | [messages.config_svc.SetSubmissionFormRequest](#hackathon-messages-config_svc-SetSubmissionFormRequest) | [messages.config_svc.SetSubmissionFormResponse](#hackathon-messages-config_svc-SetSubmissionFormResponse) |  |
| SetVotingPolicy | [messages.config_svc.SetVotingPolicyRequest](#hackathon-messages-config_svc-SetVotingPolicyRequest) | [messages.config_svc.SetVotingPolicyResponse](#hackathon-messages-config_svc-SetVotingPolicyResponse) |  |
| GetEmailTemplates | [messages.config_svc.GetEmailTemplatesRequest](#hackathon-messages-config_svc-GetEmailTemplatesRequest) | [messages.config_svc.GetEmailTemplatesResponse](#hackathon-messages-config_svc-GetEmailTemplatesResponse) | Organizer-authored notification copy and event branding. Stored config; delivery/rendering are separate concerns.

Get exists for the same reason GetWindows does: Set replaces the whole map, so a form that cannot prefill blanks the templates its author never saw. Gated on Write rather than Read — this copy is internal drafting, unlike the deadlines, which the event announces. |
| SetEmailTemplates | [messages.config_svc.SetEmailTemplatesRequest](#hackathon-messages-config_svc-SetEmailTemplatesRequest) | [messages.config_svc.SetEmailTemplatesResponse](#hackathon-messages-config_svc-SetEmailTemplatesResponse) |  |
| SetBranding | [messages.config_svc.SetBrandingRequest](#hackathon-messages-config_svc-SetBrandingRequest) | [messages.config_svc.SetBrandingResponse](#hackathon-messages-config_svc-SetBrandingResponse) |  |

 



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


 

 

 



<a name="hackathon_entities_hackathon_branding-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_branding.proto



<a name="hackathon-entities-HackathonBranding"></a>

### HackathonBranding
Per-hackathon visual identity, written by ConfigService.SetBranding and
stored on the hackathon&#39;s forms row. Every field is optional and the message
itself is absent when an organizer never set anything — a hackathon without
branding must render exactly like the default platform theme.

The event logo is not here: it is a column on the hackathon row itself
(Hackathon.logo), because it predates branding and List already returns it.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| primary_color | [string](#string) | optional | Hex colour, #rgb or #rrggbb. SetBranding rejects anything else, but these values end up inside a CSS style attribute, so clients must validate them again before interpolating: a row written before that check existed, or by a future write path that forgets it, would otherwise be injected into CSS. |
| accent_color | [string](#string) | optional |  |
| banner_text | [string](#string) | optional | Free text shown as a banner on the event page (e.g. &#34;Registration closes Friday&#34;). Rendered as text, never as markup. |





 

 

 

 



<a name="hackathon_entities_hackathon_voting_policy-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_voting_policy.proto



<a name="hackathon-entities-HackathonVotingPolicy"></a>

### HackathonVotingPolicy
How this event&#39;s vote works, as ConfigService.SetVotingPolicy stored it.

On the entity rather than behind a GetVotingPolicy RPC because these are the
RULES OF A VOTE, and the people bound by them are exactly the people who
should be able to read them: &#34;may I vote for my own team&#34; is a question a
voter asks, not an organizer&#39;s private setting.

Absent when no policy was ever set, which the backend reads as its defaults —
organizers do not vote, voting for your own team is allowed. `SubmitVote`
enforces both (they were stored and ignored until then).


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| mechanism | [string](#string) |  | Free text describing the count, e.g. &#34;single_choice&#34;. Documented rather than enforced: one vote per category is the only mechanism implemented. |
| one_ballot_per | [string](#string) |  | What one ballot covers, e.g. &#34;category&#34;. |
| own_team_voting | [bool](#bool) |  | Whether a voter may vote for a submission from a team they are on. |
| organizer_voting | [bool](#bool) |  | Whether the event&#39;s own organizers may vote in it. |
| tie_break | [string](#string) | repeated | Ordered tie-break rules, as the organizer wrote them. Advisory: the organizer records the winners, so a tie is theirs to break. |
| scale | [ScaleRange](#hackathon-entities-ScaleRange) | optional | Present only for scored mechanisms. |






<a name="hackathon-entities-ScaleRange"></a>

### ScaleRange



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| min | [int32](#int32) |  |  |
| max | [int32](#int32) |  |  |





 

 

 

 



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
| affiliation | [string](#string) |  | The platform&#39;s own profile, filled in by the person it describes.

Mirrors the keys registration forms ask for, so an event can prefill rather than ask the same four questions every time. Consents are NOT here: a consent is an agreement with one event, given on a date, and it lives in that event&#39;s registration record.

Empty string means &#34;not filled in&#34;, which is a normal state. |
| skills | [string](#string) |  |  |
| dietary | [string](#string) |  |  |
| avatar_url | [string](#string) |  |  |





 

 

 

 



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





 

 

 

 



<a name="hackathon_entities_hackathon_state-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_state.proto



<a name="hackathon-entities-CapabilityToggle"></a>

### CapabilityToggle
Main calls this message `CapabilityState`. It cannot keep that name here:
`hackathon.entities.CapabilityState` is already an ENUM in this package —
COMING / OPEN / CLOSED / UNGOVERNED — and the two would collide outright.
`Toggle` is also the truer name. This carries a boolean intent, in or out;
the four-state answer the server computes from it is the enum.

The message NAME is not on the wire, so a main client decoding field 5 of
`HackathonState`, or encoding `SetCapabilitiesRequest.capabilities`, is
unaffected by the rename.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| capability | [Capability](#hackathon-entities-Capability) |  |  |
| enabled | [bool](#bool) |  |  |






<a name="hackathon-entities-HackathonState"></a>

### HackathonState
A FAÇADE. `HackathonState` is upstream `main`&#39;s shape for &#34;what is switched on
in this event&#34;: one record of booleans plus the current phase. It is stored
nowhere here — there is no HackathonState table and no ent entity. Every field
is computed, per request, from the `Capability` rows that already back
`Hackathon.capabilities`.

It exists so a client written against main&#39;s contract decodes ours, which is
why the field numbers below are main&#39;s verbatim. Read `Hackathon.capabilities`
instead if you are writing a new client: `CapabilityStatus` carries the four
states, the schedule and the audit that this message flattens away.

**It carries no enforcement.** The gate is `requireCapability` reading the
stored rows; this message never reaches it. Main enforces by writing casbin
policy from `SetCapabilities`; that path is deliberately not ported, so
nothing here can open or close anything on its own.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  | The hackathon&#39;s own id. Main&#39;s state is a row with an identity of its own; ours is a projection, and the event it belongs to is the only honest identity available. One state per hackathon on both sides, so it is unique in the same way. |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  | The hackathon&#39;s created_at: the capability rows are created with the event. |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  | The most recent modification across the capability rows — when the state last actually changed — falling back to the hackathon&#39;s own modified_at when no row has been touched. |
| current_phase_id | [string](#string) |  | Empty when no phase has been declared current, matching main. `Hackathon` reports the same value as an optional field. |
| capabilities | [CapabilityToggle](#hackathon-entities-CapabilityToggle) | repeated | One entry per capability in the vocabulary, in vocabulary order, including the ones with no stored row.

`enabled` is the projection `state == OPEN || state == UNGOVERNED`: the same predicate `capability.State.Allowed` uses to admit a mutation, so a client reading this boolean is told exactly what the server will permit. COMING and CLOSED both flatten to false — the distinction between &#34;not yet&#34; and &#34;no longer&#34; survives only in `CapabilityStatus`. |





 

 

 

 



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
| branding | [HackathonBranding](#hackathon-entities-HackathonBranding) | optional | Set by ConfigService.SetBranding. Populated on Get and on List — the public event page is built from List, so leaving it Get-only would make an event&#39;s own colours invisible exactly where visitors see it. Absent when the organizer set no branding. |
| registration_form | [FormSchema](#hackathon-entities-FormSchema) | optional | Organizer-defined form schemas (ConfigService.SetRegistrationForm / SetSubmissionForm). Populated on Get only — a client needs them to RENDER the form it is about to submit, and without a read path the only way to fill one in was to guess the field keys. Absent when no form is defined, which means &#34;accept anything&#34; on the write side. |
| submission_form | [FormSchema](#hackathon-entities-FormSchema) | optional |  |
| email_templates | [Hackathon.EmailTemplatesEntry](#hackathon-entities-Hackathon-EmailTemplatesEntry) | repeated | Organizer-authored notification copy (ConfigService.SetEmailTemplates), keyed &#34;&lt;moment&gt;&#34; for the body and &#34;&lt;moment&gt;Subject&#34; for the subject line. Get only, and readable by members: it is copy about the event, not a secret — but nothing sends it, so organizers compose from it by hand. |
| voting_policy | [HackathonVotingPolicy](#hackathon-entities-HackathonVotingPolicy) | optional | How the vote works (ConfigService.SetVotingPolicy). Readable by anyone who can read the hackathon, because these are the rules the voters are bound by: &#34;may I vote for my own team&#34; is a voter&#39;s question. Absent when the organizer set no policy, which means the backend&#39;s defaults. |
| state | [HackathonState](#hackathon-entities-HackathonState) |  | A FAÇADE over `capabilities` above, in main&#39;s flat boolean shape — see `hackathon_state.proto`. Nothing is stored for it and nothing enforces from it; it is `capabilities` projected through `state == OPEN || state == UNGOVERNED`, plus `current_phase_id`.

Populated wherever `capabilities` is, which is Get AND List: a facade that appeared on only one of them would be a worse contract than no facade.

Tag 27 because main&#39;s 19 is our `settings` and 1-26 are all in use here. A main client therefore finds `state` at a different number than it expects — the shape is compatible, the address on this message is not, and renumbering shipped fields to fix that would break every caller we have. |
| max_participants | [int32](#int32) | optional | Maximum number of CONFIRMED participants; people on the waiting list do not consume a place. Absent or 0 means unlimited. When set, Join hands out free places first-come-first-served while nobody is waiting, and a full event queues new registrants instead of refusing them. Organizers may approve past this number — it is their estimate of the room, not a law. |






<a name="hackathon-entities-Hackathon-EmailTemplatesEntry"></a>

### Hackathon.EmailTemplatesEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| value | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_entities_hackathon_invite-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/hackathon_invite.proto



<a name="hackathon-entities-HackathonInvite"></a>

### HackathonInvite
A revocable, shareable invitation link for a private hackathon.
Organizer-facing: `token` is the secret in the URL, so this message is only
ever returned to callers who may write the hackathon.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| token | [string](#string) |  |  |
| hackathon_id | [string](#string) |  |  |
| note | [string](#string) |  |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| revoked_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional | Absent while the link still works. |
| creator_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_entities_prize-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/entities/prize.proto



<a name="hackathon-entities-Award"></a>

### Award
Award attaches a submission to a prize once the admin finalizes: by rank
for the ranked prizes, by name for special ones. Votes are advisory until
this happens — the admin has the final voice.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| rank | [int32](#int32) | optional |  |
| special | [string](#string) | optional |  |
| submission_id | [string](#string) |  |  |






<a name="hackathon-entities-Prize"></a>

### Prize
Prize is one row of the organizer-defined prize table. rank 0 marks a
discretionary/special prize (e.g. Community Choice).


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| rank | [int32](#int32) |  |  |
| title | [string](#string) |  |  |
| image | [string](#string) | optional | A picture for the prize — the trophy, the sponsor&#39;s award, the plaque. Optional, and empty for every prize table written before this existed.

No migration: the prize table is stored as flexible JSON (`[]map[string]any` in db/schema/hackathonprizes.go), so a new key costs nothing at rest. Same shape as Hackathon.logo — a root-relative /objects path from StorageService, or an http(s) URL. |





 

 

 

 



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
| phase_id | [string](#string) |  | The phase the hackathon is now in. Must belong to this hackathon.

EMPTY means &#34;no current phase&#34; — the organizer is clearing the pointer, and the timeline goes back to being read from dates alone. A plain `uuid = true` rule rejected that before the handler ever saw it, which is why the &#34;Clear current phase&#34; button could never succeed: it sends no phase_id by design.

Clearing deliberately does NOT touch capabilities. Advancing applies the ones scheduled for the target phase; with no target there is nothing to apply, and silently switching things off because someone cleared a label would be the opposite of what they asked for. |





 

 

 

 



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
| logo | [string](#string) | optional | A `uri = true` rule here rejected BOTH values this platform actually produces: the empty string (an event with no cover yet, which is every event at Create time) and the root-relative `/objects/...` path that StorageService returns and cmd/seed writes. Only a full absolute URL passed — the one shape we do not generate. Edit.logo never had the rule, so the same value was accepted or refused depending on which RPC you used. |
| max_participants | [int32](#int32) | optional | Maximum number of CONFIRMED participants. 0 or absent means unlimited. |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_create_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/create_response.proto



<a name="hackathon-messages-hackathon_svc-CreateResponse"></a>

### CreateResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_delete_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/delete_request.proto



<a name="hackathon-messages-hackathon_svc-DeleteRequest"></a>

### DeleteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_delete_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/delete_response.proto



<a name="hackathon-messages-hackathon_svc-DeleteResponse"></a>

### DeleteResponse






 

 

 

 



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
| logo | [string](#string) | optional | Same rule as Create.logo, so a value is accepted or refused by what it IS rather than by which RPC it arrived on. |
| max_participants | [int32](#int32) | optional | Absent leaves the capacity unchanged; 0 clears it back to unlimited. Lowering it below the current confirmed count is allowed and removes nobody — the number is the organizer&#39;s estimate, the roster is theirs. |





 

 

 

 



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





 

 

 

 



<a name="hackathon_messages_hackathon_svc_create_invite_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/create_invite_request.proto



<a name="hackathon-messages-hackathon_svc-CreateInviteRequest"></a>

### CreateInviteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| note | [string](#string) | optional | Optional organizer-facing reminder of who the link was sent to. |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_create_invite_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/create_invite_response.proto



<a name="hackathon-messages-hackathon_svc-CreateInviteResponse"></a>

### CreateInviteResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| invite | [hackathon.entities.HackathonInvite](#hackathon-entities-HackathonInvite) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_list_invites_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/list_invites_request.proto



<a name="hackathon-messages-hackathon_svc-ListInvitesRequest"></a>

### ListInvitesRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| include_revoked | [bool](#bool) | optional | Revoked links are hidden unless asked for. |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_list_invites_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/list_invites_response.proto



<a name="hackathon-messages-hackathon_svc-ListInvitesResponse"></a>

### ListInvitesResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| invites | [hackathon.entities.HackathonInvite](#hackathon-entities-HackathonInvite) | repeated |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_preview_invite_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/preview_invite_request.proto



<a name="hackathon-messages-hackathon_svc-PreviewInviteRequest"></a>

### PreviewInviteRequest
Redeeming side of an invite: exchanges the link secret for enough of the
hackathon to render its page. Deliberately takes ONLY the token, so it never
confirms whether a given hackathon id exists.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| token | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_preview_invite_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/preview_invite_response.proto



<a name="hackathon-messages-hackathon_svc-PreviewInviteResponse"></a>

### PreviewInviteResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon | [hackathon.entities.Hackathon](#hackathon-entities-Hackathon) |  | Shallow entity only — the invite grants visibility, not membership. |
| already_participant | [bool](#bool) |  | True when the caller is already on this hackathon&#39;s roster. |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_revoke_invite_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/revoke_invite_request.proto



<a name="hackathon-messages-hackathon_svc-RevokeInviteRequest"></a>

### RevokeInviteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| invite_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_revoke_invite_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/revoke_invite_response.proto



<a name="hackathon-messages-hackathon_svc-RevokeInviteResponse"></a>

### RevokeInviteResponse






 

 

 

 



<a name="hackathon_messages_hackathon_svc_join_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/join_request.proto



<a name="hackathon-messages-hackathon_svc-JoinRequest"></a>

### JoinRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| invite_token | [string](#string) | optional | Required to join a PRIVATE hackathon: the secret from the invitation link. Public hackathons ignore it. Without this a private event was joinable by anyone who knew its UUID. |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_join_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/join_response.proto



<a name="hackathon-messages-hackathon_svc-JoinResponse"></a>

### JoinResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| waitlisted | [bool](#bool) |  | True when this join landed on the waiting list (pending an organizer&#39;s approval or a freed place); false when it took a confirmed place outright. Joining a full event SUCCEEDS and queues — this flag is how a client tells &#34;you&#39;re in&#34; from &#34;you&#39;re number N in the queue&#34;. |
| queue_position | [int32](#int32) |  | 1-based place in the waiting queue (join order) when waitlisted; 0 when confirmed. An idempotent re-join reports the caller&#39;s current state. |





 

 

 

 



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





 

 

 

 



<a name="hackathon_messages_hackathon_svc_get_registration_response_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/get_registration_response_request.proto



<a name="hackathon-messages-hackathon_svc-GetRegistrationResponseRequest"></a>

### GetRegistrationResponseRequest
Reads back the registration answers already on file, so a registrant can see
and correct what they submitted.

Deliberately NOT part of HackathonService.Get: Get denies waitlisted users,
and a waitlisted user is exactly who still needs to review their form. This
takes only the hackathon id and answers for the caller.

`user_id` lets an organizer (hackathon Write) read someone else&#39;s answers —
the check-in desk correcting a paper form, mirroring `on_behalf_of` on
SubmitRegistrationForm.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| user_id | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_get_registration_response_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/get_registration_response_response.proto



<a name="hackathon-messages-hackathon_svc-GetRegistrationResponseResponse"></a>

### GetRegistrationResponseResponse
`submitted` distinguishes &#34;no answers on file&#34; from &#34;answers that happen to
be empty&#34; — an empty form is a legitimate state when every field is
optional, so a bare empty map would be ambiguous.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submitted | [bool](#bool) |  |  |
| responses | [google.protobuf.Struct](#google-protobuf-Struct) |  |  |
| consents | [GetRegistrationResponseResponse.ConsentsEntry](#hackathon-messages-hackathon_svc-GetRegistrationResponseResponse-ConsentsEntry) | repeated |  |
| submitted_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) | optional |  |
| submitted_by_id | [string](#string) | optional | Set when someone else entered the answers (organizer-assisted signup). |






<a name="hackathon-messages-hackathon_svc-GetRegistrationResponseResponse-ConsentsEntry"></a>

### GetRegistrationResponseResponse.ConsentsEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| value | [bool](#bool) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_list_registration_responses_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/list_registration_responses_request.proto



<a name="hackathon-messages-hackathon_svc-ListRegistrationResponsesRequest"></a>

### ListRegistrationResponsesRequest
Everyone&#39;s registration answers, for one hackathon, in one call.

GetRegistrationResponse answers for ONE person, which is right for &#34;show me
my own answers&#34; and wrong for every organiser screen: staffing teams or
working a waitlist means reading the whole cohort, and doing that one RPC per
participant is a round-trip per row on every page load.

Organizer-only — this returns what people wrote about themselves, so it takes
hackathon Write rather than Read. A fellow member cannot read it, the same
rule GetRegistrationResponse already enforces for another person&#39;s answers.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_list_registration_responses_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/list_registration_responses_response.proto



<a name="hackathon-messages-hackathon_svc-ListRegistrationResponsesResponse"></a>

### ListRegistrationResponsesResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| responses | [RegistrationResponseEntry](#hackathon-messages-hackathon_svc-RegistrationResponseEntry) | repeated |  |






<a name="hackathon-messages-hackathon_svc-RegistrationResponseEntry"></a>

### RegistrationResponseEntry
One participant&#39;s answers.

Only people who actually submitted appear. A row per participant with an
empty answer set would make &#34;has not filled the form in&#34; and &#34;filled it in
and left everything blank&#34; the same thing on the wire, and those are
different facts to an organiser chasing people.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| user_id | [string](#string) |  | The platform user id (the DB UUID), matching Hackathon.members[].user.id so a caller can join this onto the roster it already has. |
| responses | [google.protobuf.Struct](#google-protobuf-Struct) |  |  |
| consents | [RegistrationResponseEntry.ConsentsEntry](#hackathon-messages-hackathon_svc-RegistrationResponseEntry-ConsentsEntry) | repeated |  |
| submitted_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |






<a name="hackathon-messages-hackathon_svc-RegistrationResponseEntry-ConsentsEntry"></a>

### RegistrationResponseEntry.ConsentsEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| value | [bool](#bool) |  |  |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_remove_participant_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/remove_participant_response.proto



<a name="hackathon-messages-hackathon_svc-RemoveParticipantResponse"></a>

### RemoveParticipantResponse






 

 

 

 



<a name="hackathon_messages_hackathon_svc_set_capabilities_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/set_capabilities_request.proto



<a name="hackathon-messages-hackathon_svc-SetCapabilitiesRequest"></a>

### SetCapabilitiesRequest
Batch form of EditCapability: an organiser toggling several switches at once
is one intent, and one call keeps it atomic instead of a burst the UI has to
sequence and half-undo when one of them fails.

This is also main&#39;s write side of `HackathonState`, field-for-field, so a
client written against main&#39;s contract can drive our capability rows. What it
does NOT do is what main&#39;s does next: main&#39;s SetCapabilities writes casbin
policy rows, and that enforcement path is deliberately not ported. Here the
booleans land on the stored `Capability` rows — true opens, false closes —
and `requireCapability` remains the only gate.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| capabilities | [hackathon.entities.CapabilityToggle](#hackathon-entities-CapabilityToggle) | repeated | `CapabilityToggle` is main&#39;s `CapabilityState` message, renamed because we already have an enum of that name in `hackathon.entities`. It lives in `entities/hackathon_state.proto` — shared with `HackathonState`, exactly as main shares it. The rename is invisible on the wire. |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_set_capabilities_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/set_capabilities_response.proto



<a name="hackathon-messages-hackathon_svc-SetCapabilitiesResponse"></a>

### SetCapabilitiesResponse
Returns the resulting capabilities in the same shape `Get` reports them, so a
caller re-renders from the response instead of refetching the hackathon.

`CapabilityStatus`, not the booleans that went in: what the server enforces
is the four-state answer, including a schedule derived from the linked
phases, and a toggle is only one input to it. Echoing the request back would
hide the case where a capability is governed by a phase window and the
organiser&#39;s switch did not decide it.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| capabilities | [hackathon.entities.CapabilityStatus](#hackathon-entities-CapabilityStatus) | repeated |  |
| state | [hackathon.entities.HackathonState](#hackathon-entities-HackathonState) |  | The same answer flattened into main&#39;s `HackathonState`, for clients written against that contract. Field 2, not 1: main puts `state` on tag 1 and ours is already taken by `capabilities`, and renumbering a shipped field to gain decode compatibility would break the callers we actually have. A main client reads `state` from `Get` instead, where the tag was free. |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_set_current_phase_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/set_current_phase_request.proto



<a name="hackathon-messages-hackathon_svc-SetCurrentPhaseRequest"></a>

### SetCurrentPhaseRequest
Main&#39;s name for what `AdvancePhase` does. Same two fields, same numbers, so a
client written against main&#39;s contract drives ours unchanged.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| phase_id | [string](#string) |  | EMPTY means &#34;clear the current phase&#34; — main&#39;s semantics, and ours: AdvancePhase has read an empty phase_id that way since the &#34;Clear current phase&#34; button was fixed.

Clearing does not touch capabilities. Advancing applies the ones scheduled for the target phase; with no target there is nothing to apply, and switching things off because someone cleared a label would be the opposite of what they asked for. |





 

 

 

 



<a name="hackathon_messages_hackathon_svc_set_current_phase_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/hackathon_svc/set_current_phase_response.proto



<a name="hackathon-messages-hackathon_svc-SetCurrentPhaseResponse"></a>

### SetCurrentPhaseResponse
Main&#39;s shape verbatim, tag included — this message is new here, so nothing
had to move to make room for it. Native callers should prefer `AdvancePhase`,
whose response carries the full `CapabilityStatus` list this one flattens.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| state | [hackathon.entities.HackathonState](#hackathon-entities-HackathonState) |  |  |





 

 

 

 



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
| Delete | [messages.hackathon_svc.DeleteRequest](#hackathon-messages-hackathon_svc-DeleteRequest) | [messages.hackathon_svc.DeleteResponse](#hackathon-messages-hackathon_svc-DeleteResponse) |  |
| EditCapability | [messages.hackathon_svc.EditCapabilityRequest](#hackathon-messages-hackathon_svc-EditCapabilityRequest) | [messages.hackathon_svc.EditCapabilityResponse](#hackathon-messages-hackathon_svc-EditCapabilityResponse) |  |
| SetCapabilities | [messages.hackathon_svc.SetCapabilitiesRequest](#hackathon-messages-hackathon_svc-SetCapabilitiesRequest) | [messages.hackathon_svc.SetCapabilitiesResponse](#hackathon-messages-hackathon_svc-SetCapabilitiesResponse) | Batch form of EditCapability: an organiser toggles several at once, so one call is one intent rather than a burst the UI has to sequence. |
| AdvancePhase | [messages.hackathon_svc.AdvancePhaseRequest](#hackathon-messages-hackathon_svc-AdvancePhaseRequest) | [messages.hackathon_svc.AdvancePhaseResponse](#hackathon-messages-hackathon_svc-AdvancePhaseResponse) |  |
| SetCurrentPhase | [messages.hackathon_svc.SetCurrentPhaseRequest](#hackathon-messages-hackathon_svc-SetCurrentPhaseRequest) | [messages.hackathon_svc.SetCurrentPhaseResponse](#hackathon-messages-hackathon_svc-SetCurrentPhaseResponse) | Main&#39;s name for AdvancePhase, and a thin alias over it: same authorisation, same capability application, same &#34;empty phase_id clears it&#34;. Answers in main&#39;s flat HackathonState instead of the CapabilityStatus list, so native callers should keep using AdvancePhase. |
| EditSettings | [messages.hackathon_svc.EditSettingsRequest](#hackathon-messages-hackathon_svc-EditSettingsRequest) | [messages.hackathon_svc.EditSettingsResponse](#hackathon-messages-hackathon_svc-EditSettingsResponse) |  |
| Join | [messages.hackathon_svc.JoinRequest](#hackathon-messages-hackathon_svc-JoinRequest) | [messages.hackathon_svc.JoinResponse](#hackathon-messages-hackathon_svc-JoinResponse) |  |
| ApproveParticipant | [messages.hackathon_svc.ApproveParticipantRequest](#hackathon-messages-hackathon_svc-ApproveParticipantRequest) | [messages.hackathon_svc.ApproveParticipantResponse](#hackathon-messages-hackathon_svc-ApproveParticipantResponse) |  |
| RemoveParticipant | [messages.hackathon_svc.RemoveParticipantRequest](#hackathon-messages-hackathon_svc-RemoveParticipantRequest) | [messages.hackathon_svc.RemoveParticipantResponse](#hackathon-messages-hackathon_svc-RemoveParticipantResponse) |  |
| SubmitRegistrationForm | [messages.hackathon_svc.SubmitRegistrationFormRequest](#hackathon-messages-hackathon_svc-SubmitRegistrationFormRequest) | [messages.hackathon_svc.SubmitRegistrationFormResponse](#hackathon-messages-hackathon_svc-SubmitRegistrationFormResponse) |  |
| GetRegistrationResponse | [messages.hackathon_svc.GetRegistrationResponseRequest](#hackathon-messages-hackathon_svc-GetRegistrationResponseRequest) | [messages.hackathon_svc.GetRegistrationResponseResponse](#hackathon-messages-hackathon_svc-GetRegistrationResponseResponse) | Reads the answers back so a registrant can review and correct them. |
| ListRegistrationResponses | [messages.hackathon_svc.ListRegistrationResponsesRequest](#hackathon-messages-hackathon_svc-ListRegistrationResponsesRequest) | [messages.hackathon_svc.ListRegistrationResponsesResponse](#hackathon-messages-hackathon_svc-ListRegistrationResponsesResponse) |  |
| AddOwner | [messages.hackathon_svc.AddOwnerRequest](#hackathon-messages-hackathon_svc-AddOwnerRequest) | [messages.hackathon_svc.AddOwnerResponse](#hackathon-messages-hackathon_svc-AddOwnerResponse) |  |
| RemoveOwner | [messages.hackathon_svc.RemoveOwnerRequest](#hackathon-messages-hackathon_svc-RemoveOwnerRequest) | [messages.hackathon_svc.RemoveOwnerResponse](#hackathon-messages-hackathon_svc-RemoveOwnerResponse) |  |
| CreateInvite | [messages.hackathon_svc.CreateInviteRequest](#hackathon-messages-hackathon_svc-CreateInviteRequest) | [messages.hackathon_svc.CreateInviteResponse](#hackathon-messages-hackathon_svc-CreateInviteResponse) | --- Invitations: private-hackathon access, see HackathonInvite --- |
| ListInvites | [messages.hackathon_svc.ListInvitesRequest](#hackathon-messages-hackathon_svc-ListInvitesRequest) | [messages.hackathon_svc.ListInvitesResponse](#hackathon-messages-hackathon_svc-ListInvitesResponse) |  |
| RevokeInvite | [messages.hackathon_svc.RevokeInviteRequest](#hackathon-messages-hackathon_svc-RevokeInviteRequest) | [messages.hackathon_svc.RevokeInviteResponse](#hackathon-messages-hackathon_svc-RevokeInviteResponse) |  |
| PreviewInvite | [messages.hackathon_svc.PreviewInviteRequest](#hackathon-messages-hackathon_svc-PreviewInviteRequest) | [messages.hackathon_svc.PreviewInviteResponse](#hackathon-messages-hackathon_svc-PreviewInviteResponse) | Redemption side: token in, shallow hackathon out. No hackathon id needed. |

 



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





 

 

 

 



<a name="hackathon_messages_prize_svc_edit_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/prize_svc/edit_request.proto



<a name="hackathon-messages-prize_svc-EditRequest"></a>

### EditRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| rank | [int32](#int32) |  |  |
| title | [string](#string) | optional |  |





 

 

 

 



<a name="hackathon_messages_prize_svc_edit_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/prize_svc/edit_response.proto



<a name="hackathon-messages-prize_svc-EditResponse"></a>

### EditResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| prize | [hackathon.entities.Prize](#hackathon-entities-Prize) |  |  |





 

 

 

 



<a name="hackathon_messages_prize_svc_finalize_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/prize_svc/finalize_request.proto



<a name="hackathon-messages-prize_svc-FinalizeRequest"></a>

### FinalizeRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| awards | [hackathon.entities.Award](#hackathon-entities-Award) | repeated |  |





 

 

 

 



<a name="hackathon_messages_prize_svc_finalize_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/prize_svc/finalize_response.proto



<a name="hackathon-messages-prize_svc-FinalizeResponse"></a>

### FinalizeResponse






 

 

 

 



<a name="hackathon_messages_prize_svc_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/prize_svc/get_request.proto



<a name="hackathon-messages-prize_svc-GetRequest"></a>

### GetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_prize_svc_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/prize_svc/get_response.proto



<a name="hackathon-messages-prize_svc-GetResponse"></a>

### GetResponse
`finalized` is the organiser&#39;s last word: votes are advisory here, and once
the awards are finalized the table is the record of what was actually given.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| prizes | [hackathon.entities.Prize](#hackathon-entities-Prize) | repeated |  |
| awards | [hackathon.entities.Prize](#hackathon-entities-Prize) | repeated |  |
| finalized | [bool](#bool) |  |  |





 

 

 

 



<a name="hackathon_messages_prize_svc_set_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/prize_svc/set_request.proto



<a name="hackathon-messages-prize_svc-SetRequest"></a>

### SetRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |
| prizes | [hackathon.entities.Prize](#hackathon-entities-Prize) | repeated |  |





 

 

 

 



<a name="hackathon_messages_prize_svc_set_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/prize_svc/set_response.proto



<a name="hackathon-messages-prize_svc-SetResponse"></a>

### SetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| prizes | [hackathon.entities.Prize](#hackathon-entities-Prize) | repeated |  |





 

 

 

 



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





 

 

 

 



<a name="hackathon_messages_project_svc_get_preference_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/get_preference_request.proto



<a name="hackathon-messages-project_svc-GetPreferenceRequest"></a>

### GetPreferenceRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| hackathon_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_get_preference_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/get_preference_response.proto



<a name="hackathon-messages-project_svc-GetPreferenceResponse"></a>

### GetPreferenceResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_ids | [string](#string) | repeated |  |





 

 

 

 



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





 

 

 

 



<a name="hackathon_messages_project_svc_remove_preference_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/remove_preference_request.proto



<a name="hackathon-messages-project_svc-RemovePreferenceRequest"></a>

### RemovePreferenceRequest
Withdraws a participant&#39;s project preference.

Deliberately ORGANIZER-ONLY and deliberately takes a user_id: a
participant&#39;s preference is final once expressed, so there is no
self-service unset. Someone who picked in error asks an organizer, which
keeps team formation working from a stable set of choices.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| project_id | [string](#string) |  |  |
| user_id | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_project_svc_remove_preference_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/project_svc/remove_preference_response.proto



<a name="hackathon-messages-project_svc-RemovePreferenceResponse"></a>

### RemovePreferenceResponse






 

 

 

 



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
| form | [CreateSubmissionRequest.FormEntry](#hackathon-messages-team_svc-CreateSubmissionRequest-FormEntry) | repeated | Structured answers keyed by the submission form&#39;s field keys (see ConfigService.SetSubmissionForm). Validated against that schema: required fields must be present and unknown keys are rejected, so a submission cannot silently miss what the organizer asked for. |






<a name="hackathon-messages-team_svc-CreateSubmissionRequest-FormEntry"></a>

### CreateSubmissionRequest.FormEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| value | [string](#string) |  |  |





 

 

 

 



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





 

 

 

 



<a name="hackathon_messages_team_svc_edit_submission_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/edit_submission_request.proto



<a name="hackathon-messages-team_svc-EditSubmissionRequest"></a>

### EditSubmissionRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission_id | [string](#string) |  |  |
| result | [string](#string) | optional |  |
| form | [EditSubmissionRequest.FormEntry](#hackathon-messages-team_svc-EditSubmissionRequest-FormEntry) | repeated | Structured answers, same keys and validation as CreateSubmission. Without this the form was frozen at create time: a team that mistyped a repo URL could edit the free text around it but never the field the organizer actually asked for. Absent (not merely empty) leaves the stored answers untouched, so an edit of `result` alone cannot wipe them. |






<a name="hackathon-messages-team_svc-EditSubmissionRequest-FormEntry"></a>

### EditSubmissionRequest.FormEntry



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  |  |
| value | [string](#string) |  |  |





 

 

 

 



<a name="hackathon_messages_team_svc_edit_submission_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/messages/team_svc/edit_submission_response.proto



<a name="hackathon-messages-team_svc-EditSubmissionResponse"></a>

### EditSubmissionResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission | [hackathon.entities.Submission](#hackathon-entities-Submission) |  |  |





 

 

 

 



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

 



<a name="hackathon_prize_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## hackathon/prize_service.proto


 

 

 


<a name="hackathon-PrizeService"></a>

### PrizeService
The prize table and the awards. Votes are advisory: nothing is won until
the admin finalizes, and the table stays admin-editable afterwards.

| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| Get | [messages.prize_svc.GetRequest](#hackathon-messages-prize_svc-GetRequest) | [messages.prize_svc.GetResponse](#hackathon-messages-prize_svc-GetResponse) | Reads the table back. Set REPLACES it, so without this an organiser editing one prize would blank the rest they cannot see — the same trap GetWindows was added for. |
| Set | [messages.prize_svc.SetRequest](#hackathon-messages-prize_svc-SetRequest) | [messages.prize_svc.SetResponse](#hackathon-messages-prize_svc-SetResponse) |  |
| Finalize | [messages.prize_svc.FinalizeRequest](#hackathon-messages-prize_svc-FinalizeRequest) | [messages.prize_svc.FinalizeResponse](#hackathon-messages-prize_svc-FinalizeResponse) |  |
| Edit | [messages.prize_svc.EditRequest](#hackathon-messages-prize_svc-EditRequest) | [messages.prize_svc.EditResponse](#hackathon-messages-prize_svc-EditResponse) |  |

 



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
| GetPreference | [messages.project_svc.GetPreferenceRequest](#hackathon-messages-project_svc-GetPreferenceRequest) | [messages.project_svc.GetPreferenceResponse](#hackathon-messages-project_svc-GetPreferenceResponse) | The caller&#39;s OWN preferences. ExportPreferences is organiser-only, so until now a participant had no way to see what they had chosen. |
| ExportPreferences | [messages.project_svc.ExportPreferencesRequest](#hackathon-messages-project_svc-ExportPreferencesRequest) | [messages.project_svc.ExportPreferencesResponse](#hackathon-messages-project_svc-ExportPreferencesResponse) |  |
| Edit | [messages.project_svc.EditRequest](#hackathon-messages-project_svc-EditRequest) | [messages.project_svc.EditResponse](#hackathon-messages-project_svc-EditResponse) |  |
| Delete | [messages.project_svc.DeleteRequest](#hackathon-messages-project_svc-DeleteRequest) | [messages.project_svc.DeleteResponse](#hackathon-messages-project_svc-DeleteResponse) |  |
| RemovePreference | [messages.project_svc.RemovePreferenceRequest](#hackathon-messages-project_svc-RemovePreferenceRequest) | [messages.project_svc.RemovePreferenceResponse](#hackathon-messages-project_svc-RemovePreferenceResponse) |  |

 



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
| EditSubmission | [messages.team_svc.EditSubmissionRequest](#hackathon-messages-team_svc-EditSubmissionRequest) | [messages.team_svc.EditSubmissionResponse](#hackathon-messages-team_svc-EditSubmissionResponse) |  |
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

 



<a name="site_entities_site_page-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/entities/site_page.proto



<a name="site-entities-SitePage"></a>

### SitePage
A platform-level content page (about, privacy, terms), addressed by slug.
Unlike hackathon.entities.Page it belongs to the site itself, so it carries
no hackathon id and is authorized in the fixed &#34;site&#34; casbin domain.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |
| slug | [string](#string) |  |  |
| title | [string](#string) |  |  |
| content | [string](#string) |  | Markdown. Rendered through the frontend&#39;s sanitizing pipeline — never inject it into the DOM raw. |
| visible | [bool](#bool) |  |  |
| order | [int32](#int32) |  |  |
| created_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| modified_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |
| creator_id | [string](#string) |  |  |
| modifier_id | [string](#string) |  |  |





 

 

 

 



<a name="site_messages_site_page_svc_create_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/messages/site_page_svc/create_request.proto



<a name="site-messages-site_page_svc-CreateRequest"></a>

### CreateRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| slug | [string](#string) |  |  |
| title | [string](#string) |  |  |
| content | [string](#string) |  |  |
| visible | [bool](#bool) | optional |  |
| order | [int32](#int32) | optional |  |





 

 

 

 



<a name="site_messages_site_page_svc_create_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/messages/site_page_svc/create_response.proto



<a name="site-messages-site_page_svc-CreateResponse"></a>

### CreateResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | [string](#string) |  |  |





 

 

 

 



<a name="site_messages_site_page_svc_delete_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/messages/site_page_svc/delete_request.proto



<a name="site-messages-site_page_svc-DeleteRequest"></a>

### DeleteRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| slug | [string](#string) |  |  |





 

 

 

 



<a name="site_messages_site_page_svc_delete_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/messages/site_page_svc/delete_response.proto



<a name="site-messages-site_page_svc-DeleteResponse"></a>

### DeleteResponse






 

 

 

 



<a name="site_messages_site_page_svc_edit_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/messages/site_page_svc/edit_request.proto



<a name="site-messages-site_page_svc-EditRequest"></a>

### EditRequest
Every field optional: absent means &#34;leave unchanged&#34; (see the write-path
convention in CLAUDE.md). The page is identified by its current slug.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| slug | [string](#string) |  |  |
| new_slug | [string](#string) | optional |  |
| title | [string](#string) | optional |  |
| content | [string](#string) | optional |  |
| visible | [bool](#bool) | optional |  |
| order | [int32](#int32) | optional |  |





 

 

 

 



<a name="site_messages_site_page_svc_edit_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/messages/site_page_svc/edit_response.proto



<a name="site-messages-site_page_svc-EditResponse"></a>

### EditResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| site_page | [site.entities.SitePage](#site-entities-SitePage) |  |  |





 

 

 

 



<a name="site_messages_site_page_svc_get_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/messages/site_page_svc/get_request.proto



<a name="site-messages-site_page_svc-GetRequest"></a>

### GetRequest
Pages are fetched by their stable slug — that is what the router has.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| slug | [string](#string) |  |  |





 

 

 

 



<a name="site_messages_site_page_svc_get_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/messages/site_page_svc/get_response.proto



<a name="site-messages-site_page_svc-GetResponse"></a>

### GetResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| site_page | [site.entities.SitePage](#site-entities-SitePage) |  |  |





 

 

 

 



<a name="site_messages_site_page_svc_list_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/messages/site_page_svc/list_request.proto



<a name="site-messages-site_page_svc-ListRequest"></a>

### ListRequest



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| include_hidden | [bool](#bool) | optional | When true, drafts are included too (admins only; ignored for others). |





 

 

 

 



<a name="site_messages_site_page_svc_list_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/messages/site_page_svc/list_response.proto



<a name="site-messages-site_page_svc-ListResponse"></a>

### ListResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| site_pages | [site.entities.SitePage](#site-entities-SitePage) | repeated |  |





 

 

 

 



<a name="site_site_page_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## site/site_page_service.proto


 

 

 


<a name="site-SitePageService"></a>

### SitePageService
Platform-level content pages (about, privacy, terms). Reads are open to
anonymous callers for published pages — these are the pages a visitor
reaches from the footer before ever logging in. Writes require the global
Admin role: there is no per-hackathon owner for site-wide content.

| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| List | [messages.site_page_svc.ListRequest](#site-messages-site_page_svc-ListRequest) | [messages.site_page_svc.ListResponse](#site-messages-site_page_svc-ListResponse) |  |
| Get | [messages.site_page_svc.GetRequest](#site-messages-site_page_svc-GetRequest) | [messages.site_page_svc.GetResponse](#site-messages-site_page_svc-GetResponse) |  |
| Create | [messages.site_page_svc.CreateRequest](#site-messages-site_page_svc-CreateRequest) | [messages.site_page_svc.CreateResponse](#site-messages-site_page_svc-CreateResponse) |  |
| Edit | [messages.site_page_svc.EditRequest](#site-messages-site_page_svc-EditRequest) | [messages.site_page_svc.EditResponse](#site-messages-site_page_svc-EditResponse) |  |
| Delete | [messages.site_page_svc.DeleteRequest](#site-messages-site_page_svc-DeleteRequest) | [messages.site_page_svc.DeleteResponse](#site-messages-site_page_svc-DeleteResponse) |  |

 



<a name="storage_entities_upload_kind-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## storage/entities/upload_kind.proto


 


<a name="storage-entities-UploadKind"></a>

### UploadKind
What is being uploaded. The kind is the ONLY thing the client gets to choose
about placement: the backend derives the key prefix, the content-type
allowlist, the size ceiling and the authorization rule from it (see
docs/storage.md, &#34;Keys, not URLs&#34;). A client-supplied path is never trusted.

  HACKATHON_LOGO        hackathons/&lt;hackathon-id&gt;/logo/&lt;uuid&gt;.&lt;ext&gt;            public
  HACKATHON_MEDIA       hackathons/&lt;hackathon-id&gt;/media/&lt;uuid&gt;.&lt;ext&gt;           public
  USER_AVATAR           users/&lt;user-id&gt;/avatar/&lt;uuid&gt;.&lt;ext&gt;                    public
  SUBMISSION_ATTACHMENT teams/&lt;team-id&gt;/submissions/&lt;submission-id&gt;/&lt;uuid&gt;.&lt;ext&gt;  private

`owner_id` is read against the kind: the hackathon id for the two hackathon
kinds, the platform user id for an avatar, and the SUBMISSION id for an
attachment — the team half of that key is looked up server-side, so a caller
cannot file an attachment under someone else&#39;s team.

| Name | Number | Description |
| ---- | ------ | ----------- |
| UPLOAD_KIND_UNSPECIFIED | 0 |  |
| UPLOAD_KIND_HACKATHON_LOGO | 1 |  |
| UPLOAD_KIND_HACKATHON_MEDIA | 2 |  |
| UPLOAD_KIND_USER_AVATAR | 3 |  |
| UPLOAD_KIND_SUBMISSION_ATTACHMENT | 4 |  |


 

 

 



<a name="storage_messages_storage_svc_create_download_url_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## storage/messages/storage_svc/create_download_url_request.proto



<a name="storage-messages-storage_svc-CreateDownloadUrlRequest"></a>

### CreateDownloadUrlRequest
Mint a short-lived read URL for a PRIVATE object.

Public imagery does not come through here and is rejected on purpose: those
prefixes are world-readable by bucket policy, so their stored path already
works and signing one would hand out a bearer credential for nothing.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| key | [string](#string) |  | An object key as returned by CreateUploadUrl — not a URL, and not a path with a bucket in it. The key&#39;s own shape says which entity owns it, and that is what is authorized. |





 

 

 

 



<a name="storage_messages_storage_svc_create_download_url_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## storage/messages/storage_svc/create_download_url_response.proto



<a name="storage-messages-storage_svc-CreateDownloadUrlResponse"></a>

### CreateDownloadUrlResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| download_url | [string](#string) |  | Root-relative and same-origin, like upload_url. Treat it as a bearer credential: anything holding it can read the object until it lapses, which is exactly why it is never written to the database. |
| expires_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  |  |





 

 

 

 



<a name="storage_messages_storage_svc_create_upload_url_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## storage/messages/storage_svc/create_upload_url_request.proto



<a name="storage-messages-storage_svc-CreateUploadUrlRequest"></a>

### CreateUploadUrlRequest
Ask for permission to upload one object. Nothing here names a path: the key
is the server&#39;s to decide, so the worst a hostile client can do is ask for a
kind it may not write, which casbin refuses.

`content_type` and `size_bytes` are DECLARED here and then baked into the
signature as conditions, which is what lets an oversized or wrong-typed
upload be refused before a single byte moves. Declaring them falsely does not
help: the object store recomputes the signature over the headers the browser
actually sent, so a mismatch fails at the store.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| kind | [storage.entities.UploadKind](#storage-entities-UploadKind) |  |  |
| owner_id | [string](#string) |  | The owning entity, read according to `kind` — see UploadKind. |
| filename | [string](#string) |  | The user&#39;s own filename. Used only to cross-check the declared content_type; the stored key gets a fresh uuid and an extension derived from the content type, so nothing a user typed reaches the object store. |
| content_type | [string](#string) |  |  |
| size_bytes | [int64](#int64) |  | Exact byte length of the file about to be uploaded, not an estimate. |





 

 

 

 



<a name="storage_messages_storage_svc_create_upload_url_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## storage/messages/storage_svc/create_upload_url_response.proto



<a name="storage-messages-storage_svc-CreateUploadUrlResponse"></a>

### CreateUploadUrlResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| upload_url | [string](#string) |  | Where the BROWSER PUTs the bytes — root-relative and same-origin (/objects/&lt;bucket&gt;/&lt;key&gt;?X-Amz-...), so the file never passes through the app server and no CORS grant is needed. The request must carry exactly the Content-Type and byte count that were declared, because both are signed. |
| key | [string](#string) |  | The stable object key. This is what identifies the object forever; the signed URL above stops working in minutes. |
| public_url | [string](#string) |  | Root-relative path the object will be readable at once uploaded, for the public kinds. EMPTY for private kinds (submission attachments) — those are read through CreateDownloadUrl, after casbin has approved the read.

This is the value that goes into Hackathon.logo / User.avatar_url: it never expires and it resolves from localhost, the tunnel and a deployment alike. |
| expires_at | [google.protobuf.Timestamp](#google-protobuf-Timestamp) |  | When the signature above stops being accepted. Purely informational — the upload either starts in time or it does not. |





 

 

 

 



<a name="storage_storage_service-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## storage/storage_service.proto


 

 

 


<a name="storage-StorageService"></a>

### StorageService
Signed access to the object store (docs/storage.md).

Files do not travel through this service — only permission to move them
does. The backend authorizes the caller, decides the key, pins the
content-type and the byte count into the signature, and hands back a URL the
browser uses directly.

There is deliberately no Delete RPC. Objects are removed by prefix when their
OWNER is deleted (HackathonService.Delete, UserService.DeleteAccount), which
is what keeps deletion complete without a manifest of what belongs to whom.

| Method Name | Request Type | Response Type | Description |
| ----------- | ------------ | ------------- | ------------|
| CreateUploadUrl | [messages.storage_svc.CreateUploadUrlRequest](#storage-messages-storage_svc-CreateUploadUrlRequest) | [messages.storage_svc.CreateUploadUrlResponse](#storage-messages-storage_svc-CreateUploadUrlResponse) |  |
| CreateDownloadUrl | [messages.storage_svc.CreateDownloadUrlRequest](#storage-messages-storage_svc-CreateDownloadUrlRequest) | [messages.storage_svc.CreateDownloadUrlResponse](#storage-messages-storage_svc-CreateDownloadUrlResponse) |  |

 



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





 

 

 

 



<a name="user_messages_user_svc_delete_account_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/delete_account_request.proto



<a name="user-messages-user_svc-DeleteAccountRequest"></a>

### DeleteAccountRequest
Deletes the CALLER&#39;s own platform profile. Deliberately takes no user id:
this is a self-service GDPR action, not an admin tool for removing people.





 

 

 

 



<a name="user_messages_user_svc_delete_account_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/delete_account_response.proto



<a name="user-messages-user_svc-DeleteAccountResponse"></a>

### DeleteAccountResponse






 

 

 

 



<a name="user_messages_user_svc_edit_profile_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/edit_profile_request.proto



<a name="user-messages-user_svc-EditProfileRequest"></a>

### EditProfileRequest
Edits the caller&#39;s OWN profile — there is no user id, so this RPC can never
touch anyone else&#39;s.

Only the fields the platform owns are here. `username` and `email` come from
Keycloak on every token and are re-synced by WhoAmI, so accepting them would
be a lie: the next page load would overwrite whatever was stored. Those are
changed in Keycloak&#39;s own account console.

Every field is optional; absent means &#34;leave unchanged&#34;.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| display_name | [string](#string) | optional |  |
| affiliation | [string](#string) | optional | The rest of the profile. Unlike display_name these MAY be cleared, so the floor is 0: emptying &#34;dietary requirements&#34; is a legitimate edit, and a min_len of 1 would make the field impossible to unset. |
| skills | [string](#string) | optional |  |
| dietary | [string](#string) | optional |  |
| avatar_url | [string](#string) | optional | A link, not an upload — there is no object store yet.

Length only, deliberately: `uri: true` would reject the empty string, and clearing your picture is a legitimate edit. The handler checks the SCHEME instead (http/https only), which is the part that matters — a `javascript:` or `data:` value must never reach an &lt;img src&gt;. Same reasoning the hackathon logo field follows. |





 

 

 

 



<a name="user_messages_user_svc_edit_profile_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## user/messages/user_svc/edit_profile_response.proto



<a name="user-messages-user_svc-EditProfileResponse"></a>

### EditProfileResponse
Edit returns the updated entity (write-path convention).


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
| EditProfile | [messages.user_svc.EditProfileRequest](#user-messages-user_svc-EditProfileRequest) | [messages.user_svc.EditProfileResponse](#user-messages-user_svc-EditProfileResponse) | Self-service: edits the caller&#39;s own profile, no user id in the request. |
| AddRole | [messages.user_svc.AddRoleRequest](#user-messages-user_svc-AddRoleRequest) | [messages.user_svc.AddRoleResponse](#user-messages-user_svc-AddRoleResponse) |  |
| RemoveRole | [messages.user_svc.RemoveRoleRequest](#user-messages-user_svc-RemoveRoleRequest) | [messages.user_svc.RemoveRoleResponse](#user-messages-user_svc-RemoveRoleResponse) |  |
| DeleteAccount | [messages.user_svc.DeleteAccountRequest](#user-messages-user_svc-DeleteAccountRequest) | [messages.user_svc.DeleteAccountResponse](#user-messages-user_svc-DeleteAccountResponse) | Self-service account deletion (GDPR). Removes the platform profile and every casbin role; the Keycloak identity is NOT touched, so the person can sign in again and start fresh. |

 



<a name="vote_entities_vote-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/entities/vote.proto



<a name="vote-entities-PointsVote"></a>

### PointsVote



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission_id | [string](#string) |  |  |
| points | [int32](#int32) |  |  |






<a name="vote-entities-RankedVote"></a>

### RankedVote



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission_id | [string](#string) |  |  |
| rank | [int32](#int32) |  | 1 is the voter&#39;s first preference. |






<a name="vote-entities-SingleChoiceVote"></a>

### SingleChoiceVote
Each variant describes ONE stored row, because a Vote row is one judgment on
one submission (see the schema comment). A ranked or points ballot is
therefore several Vote entities, one per submission, all sharing a category
and a voter — SubmitVoteResponse.votes hands the whole set back.


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
| max_points | [int32](#int32) | optional | Points-based voting only: the budget one voter may spread over the submissions. Absent for the other methods. Tag 10 rather than main&#39;s 7 — jury_members/created_at/modified_at already hold 7-9 here. |





 

 

 

 



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
| max_points | [int32](#int32) | optional | Required (and &gt;0) when voting_method is POINTS, ignored otherwise. |





 

 

 

 



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
| max_points | [int32](#int32) | optional | Required (and &gt;0) once the category&#39;s method is POINTS, cleared otherwise. |





 

 

 

 



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
The handler treats an empty voter_id / submission_id as &#34;no filter&#34;, but a
plain string.uuid rule rejects the empty string before the handler ever runs
— which made every partially-filtered call impossible, including the obvious
&#34;all votes in this category&#34;. The CEL rules below allow empty OR a valid
UUID, the same escape hatch page_id uses in
hackathon/messages/phase_svc/edit_request.proto.

category_id keeps the strict rule: listing votes without one is not a query
this service supports.


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



<a name="vote-messages-vote_svc-PointsSubmission"></a>

### PointsSubmission



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission_id | [string](#string) |  |  |
| points | [int32](#int32) |  |  |






<a name="vote-messages-vote_svc-PointsVote"></a>

### PointsVote



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| submissions | [PointsSubmission](#vote-messages-vote_svc-PointsSubmission) | repeated |  |






<a name="vote-messages-vote_svc-RankedSubmission"></a>

### RankedSubmission



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| submission_id | [string](#string) |  |  |
| rank | [int32](#int32) |  |  |






<a name="vote-messages-vote_svc-RankedVote"></a>

### RankedVote
Ranks are carried explicitly rather than implied by list order: the voter
types a number per submission, so a gap or a repeat is a mistake the server
has to be able to name instead of one the client silently normalises away.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| submissions | [RankedSubmission](#vote-messages-vote_svc-RankedSubmission) | repeated |  |






<a name="vote-messages-vote_svc-SingleChoiceVote"></a>

### SingleChoiceVote



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| submission_id | [string](#string) |  |  |






<a name="vote-messages-vote_svc-SubmitVoteRequest"></a>

### SubmitVoteRequest
One ballot. The variant chosen must match the category&#39;s voting_method or
the server refuses it.


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
| vote | [vote.entities.Vote](#vote-entities-Vote) |  | The first row of the accepted ballot — for single_choice that is the whole ballot, and callers that predate ranked/points keep working unchanged. |
| votes | [vote.entities.Vote](#vote-entities-Vote) | repeated | Every row the ballot produced: one for single_choice, N for ranked and points. |





 

 

 

 



<a name="vote_messages_vote_svc_suggest_results_request-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/suggest_results_request.proto



<a name="vote-messages-vote_svc-SuggestResultsRequest"></a>

### SuggestResultsRequest
Computes the tally for one category and writes it as VoteResult rows.

SUGGEST, not decide. The vote is advisory on this platform: an organizer
reviews the count and records who actually won, and PrizeService.Finalize is
what freezes that. A jury that cannot overrule its own count is not a jury.
So this fills the results table for review — it never writes prizes.

Without it the count existed nowhere: placements had to be typed in by hand
from an export, which is both tedious and the easiest possible place to make
an unnoticed mistake about who won.


| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| category_id | [string](#string) |  |  |
| force | [bool](#bool) |  | Recompute over existing results.

Refused without it when results are already present, because a recount that silently replaces a published placement is how a correction becomes an accusation. The caller has to say they mean it. |





 

 

 

 



<a name="vote_messages_vote_svc_suggest_results_response-proto"></a>
<p align="right"><a href="#top">Top</a></p>

## vote/messages/vote_svc/suggest_results_response.proto



<a name="vote-messages-vote_svc-SuggestResultsResponse"></a>

### SuggestResultsResponse



| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| results | [vote.entities.VoteResult](#vote-entities-VoteResult) | repeated | The rows as written, ordered by position. Ties share a position — two submissions on the same count are both second, and the organizer decides what to do about it rather than the tally inventing an order. |





 

 

 

 



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
| SuggestResults | [messages.vote_svc.SuggestResultsRequest](#vote-messages-vote_svc-SuggestResultsRequest) | [messages.vote_svc.SuggestResultsResponse](#vote-messages-vote_svc-SuggestResultsResponse) | Computes the tally and writes it as results for the organizer to review. Advisory by design — see SuggestResultsRequest, and PrizeService for what actually freezes an award. |
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

