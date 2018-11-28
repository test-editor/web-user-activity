export enum UserActivityType { RUNNING_AS_TEST, OPENED_IN_EDITOR, ACTIVE_IN_EDITOR, DIRTY_IN_EDITOR, TYPED_INTO_EDITOR,
  DELETED_IN_WORKSPACE, CREATED_IN_WORKSPACE, MODIFIED_IN_WORKSPACE }
export interface UserActivityData { user: string; type: UserActivityType; label: string; }
export type USER_ACTIVITY_UPDATED_PAYLOAD = Map<string, UserActivityData[]>;
export const USER_ACTIVITY_UPDATED = 'user.activity.updated';

export const HTTP_CLIENT_NEEDED = 'httpClient.needed';
