import { Injectable } from '@angular/core';
import { MessagingService } from '@testeditor/messaging-service';
import { HttpProviderService } from '@testeditor/testeditor-commons';
import { Subject, Subscription, timer } from 'rxjs';
import { switchMap, take, takeUntil } from 'rxjs/operators';
import { ElementActivity, USER_ACTIVITY_UPDATED } from '../event-types-out';

export interface UserActivityEvent {
  /**
   * The name of the event to be used for the message bus subscription.
   */
  name: string;
  /**
   * An attribute expected to exist on the event's payload object.
   * `payload[elementKey]` is expected to contain the element identifier (e.g. the path of a workspace element) the event refers to.
   */
  elementKey: string;
  /**
   * A string identifying a particular activity a user is performing, e.g. "executedTest" could be used to refer to a user having started to
   * execute the referenced workspace element as a test case. Alternatively, it may also refer to an activity group (see below): this is
   * only useful if `active` is `false`, and will then cause whatever activity belonging to the given group is active to be deactivated.
   * Activities that became active as part of a group can only be deactivated by deactivating the group this way.
   * Alternatively, activityType can be specified as an array of transition objects with `from` and `to` fields each referring to an
   * activity type. In that case, for each transition object, **iff** the `from`-activity is active, it will be deactivated, and the
   * `to`-activity will be activated, instead. Transitions, and all `from` and `to` activities, must be associated with a single group.
   * A transition may leave the `from` property undefined: this transition can only fire, if **no** activity type in the given group is
   * currently active.
   */
  activityType: string | { from?: string, to: string }[];
  /**
   * Whether the event referenced by `name` is signalling that the activity (`activityType`) on a given element (`elementKey`) has started
   * or ceased. If `active` is `true`, the event is taken to mean that the activity has started, or continues to be performed. If `active`
   * is `false`, the event is taken to signal that the activity is no longer being performed. Activities have to be "turned off" this way,
   * explicitly, unless a timeout is specified. Activities that have been associated with a group upon activation can only be deactivated
   * by using their group name as value for `activityType`.
   * The value can be either provided as a plain boolean, or as a callback function that gets passed the payload of the triggering event.
   */
  active: ((payload: any) => boolean) | boolean;

  /**
   * If specified, the activity will be automatically turned off after the specified duration in seconds. The `timeout` field only has
   * well-defined semantics if `active === true`; otherwise, `timeout` will be ignored.
   */
  timeout?: number;

  /**
   * If specified, associates this activity type with the given group. Activity types in the same group are mutually exclusive, meaning that
   * only one of them can be active at the same time for any given element. If an activity of the given group is already active, it will
   * automatically be deactivated upon receiving the named event, if `active` is `true`. If `active` is false, this property has no effect.
   */
  group?: string;
  /**
   * If specified, all activities associated with the `payload[elementKey]` will be moved to `payload[newElementKey]`, before activating
   * the specified activity type on the "old" element. Notice that this means that, when it comes to activation, the old element will
   * have no activities associated with it, which needs to be into consideration, e.g. when using transitions.
   * After the event has been processed, the old element will have only this one activity associated with it, while the new element will
   * have all activities previously associated with the old element.
   */
  newElementKey?: string;
}
export abstract class UserActivityServiceConfig { userActivityServiceUrl: string; }

interface UserActivityUpdate {
  elementId: string;
  activityType: string | { from?: string, to: string }[];
  active: boolean;
  timeout?: number;
  group: string;
  newElementId?: string;
}

@Injectable()
export class UserActivityService {
  private static readonly SERVICE_PATH = '/user-activity';
  public static readonly POLLING_INTERVAL_MS = 5000;
  private userActivityEvent: Subject<void>;
  private subscriptions: Subscription;
  private readonly userActivityStates = new Map<string, Map<string, string>>();
  private readonly userActivityTimeoutTimers = new Map<string, Subject<void>>();

  constructor(private config: UserActivityServiceConfig, private messageBus: MessagingService, private httpProvider: HttpProviderService) {
  }

  start(...events: UserActivityEvent[]) {
    this.userActivityEvent = new Subject<void>();
    events.forEach((event) => {
      const subscription = this.messageBus.subscribe(event.name, (payload) => {
        if (payload && payload[event.elementKey]) {
          this.processUserActivityUpdate({
            elementId: payload[event.elementKey],
            activityType: event.activityType,
            active: this.isCallback(event.active) ? event.active(payload) : event.active,
            timeout: event.timeout,
            group: event.group,
            newElementId: event.newElementKey ? payload[event.newElementKey] : undefined});
        } else {
          console.error(`failed to determine workspace element on receiving user activity event of type "${event.name}"` +
            `(payload empty, or missing field "${event.elementKey}")`, payload);
        }
      });
      if (this.subscriptions) {
        this.subscriptions.add(subscription);
      } else {
        this.subscriptions = subscription;
      }
    });
    this.startPeriodicPolling();
  }

  stop() {
    this.subscriptions.unsubscribe();
    this.userActivityEvent.next();
    this.userActivityEvent.complete();
    this.userActivityStates.clear();
    this.poll();
  }

  private isCallback<T>(value: ((payload: any) => T) | T): value is (payload: any) => T {
    return typeof value === 'function';
  }

  private isTransitionArray(value: string | { from?: string, to: string }[]): value is { from?: string, to: string }[] {
    return Array.isArray(value);
  }


  private renameElement(oldElementId: string, newElementId: string) {
    if (this.userActivityStates.has(oldElementId)) {
      this.userActivityStates.set(newElementId, this.userActivityStates.get(oldElementId));
      this.userActivityStates.delete(oldElementId);
    }
  }

  private processUserActivityUpdate(update: UserActivityUpdate) {
    this.userActivityEvent.next();
    if (update.newElementId) {
      this.renameElement(update.elementId, update.newElementId);
    }
    if (this.isTransitionArray(update.activityType)) {
      if (update.active) {
        this.fireTransition(update.activityType, update.elementId, update.group);
      }
    } else {
      this.updateUserActivity(update.elementId, update.activityType, update.active, update.group);
      if (update.timeout) {
        this.timeoutUserActivity(update.elementId, update.activityType, update.timeout);
      }
    }
    this.startPeriodicPolling();
  }

  private fireTransition(transitions: { from?: string, to: string }[], elementId: string, group: string) {
    const currentActivity = this.userActivityStates.get(elementId) ? this.userActivityStates.get(elementId).get(group) : undefined;
    const transition = transitions.find((t) => t.from === currentActivity);
    if (transition) {
      this.setUserGroupActivity(elementId, transition.to, group);
    }
  }

  private updateUserActivity(elementId: string, activityType: string, active: boolean, group?: string) {
    if (active) {
      this.setUserGroupActivity(elementId, activityType, group ? group : activityType);
    } else {
      this.removeUserActivity(elementId, activityType);
    }
  }

  private setUserGroupActivity(elementId: string, activityType: string, group: string) {
    if (!this.userActivityStates.has(elementId)) {
      this.userActivityStates.set(elementId, new Map<string, string>());
    }
    this.userActivityStates.get(elementId).set(group, activityType);
    console.log(`set user activity [${group}, ${activityType}] for "${elementId}"`);
  }

  private timeoutUserActivity(elementId: string, activityType: string, timeoutSecs: number) {
    const timerKey = this.createTimeoutTimerKey(elementId, activityType);
    if (!this.userActivityTimeoutTimers.has(timerKey)) {
      const timerSubject = new Subject<void>();
      timerSubject.pipe(switchMap(() => timer(timeoutSecs * 1000))).pipe(
      take(1))
      .subscribe(() => this.removeUserActivity(elementId, activityType));

      this.userActivityTimeoutTimers.set(timerKey, timerSubject);
    }

    this.userActivityTimeoutTimers.get(timerKey).next();
  }

  private removeUserActivity(elementId: string, activityType: string) {
    if (this.userActivityStates.has(elementId)) {
      const activitySet = this.userActivityStates.get(elementId);
      activitySet.delete(activityType);
      if (activitySet.size === 0) {
        this.userActivityStates.delete(elementId);
      }
      console.log(`deleted user activity ${activityType} of "${elementId}"`);
    }
    const timerKey = this.createTimeoutTimerKey(elementId, activityType);
    if (this.userActivityTimeoutTimers.has(timerKey)) {
      this.userActivityTimeoutTimers.delete(timerKey);
    }
  }

  private createTimeoutTimerKey(elementId: string, activityType: string) {
    return `[${elementId}, ${activityType}]`;
  }

  private startPeriodicPolling() {
    timer(0, UserActivityService.POLLING_INTERVAL_MS).pipe(
    takeUntil(this.userActivityEvent))
    .subscribe(() => this.poll());
  }

  private async poll(): Promise<void> {
    const http = await this.httpProvider.getHttpClient();
    const url = this.config.userActivityServiceUrl + UserActivityService.SERVICE_PATH;
    const payload = Array.from(this.userActivityStates, ([key, group]) => ({element: key, activities: Array.from(group.values())}));
    console.log('polling backend!', payload);
    const response = await http.post<ElementActivity[]>(url, payload).toPromise();
    this.broadcastCollaboratorActivity(response);
  }

  private broadcastCollaboratorActivity(activities: ElementActivity[]): void {
    activities.forEach((elementActivity) => elementActivity.activities.sort((uaData1, uaData2) => uaData1.timestamp - uaData2.timestamp));
    this.messageBus.publish(USER_ACTIVITY_UPDATED, activities);
  }

}
