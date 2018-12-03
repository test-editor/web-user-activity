export enum UserActivityType { RUNNING_AS_TEST, OPENED_IN_EDITOR, ACTIVE_IN_EDITOR, DIRTY_IN_EDITOR, TYPED_INTO_EDITOR,
  DELETED_IN_WORKSPACE, CREATED_IN_WORKSPACE, MODIFIED_IN_WORKSPACE }

/**
 * USER_ACTIVITY_UPDATED notifies listeners about activities of collaborators working with the Test-Editor simultaneously.
 * Payload: ElementActivity[]
 */
export interface UserActivityData { user: string; type: string; }
export interface ElementActivity {
  element: string;
  activities: UserActivityData[];
}
export const USER_ACTIVITY_UPDATED = 'user.activity.updated';

export const HTTP_CLIENT_NEEDED = 'httpClient.needed';
